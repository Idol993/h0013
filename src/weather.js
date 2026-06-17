const axios = require('axios');

const QWEATHER_BASE = 'https://devapi.qweather.com';
const GEO_BASE = 'https://geoapi.qweather.com';
const API_TIMEOUT = 5000;
const MAX_RETRY = 1;
const CITY_CACHE_TTL = 24 * 60 * 60 * 1000;

let cityCache = null;

const weatherMap = {
  '100': { text: '晴', emoji: '☀️' },
  '101': { text: '多云', emoji: '⛅' },
  '102': { text: '少云', emoji: '⛅' },
  '103': { text: '晴间多云', emoji: '⛅' },
  '104': { text: '阴', emoji: '☁️' },
  '150': { text: '晴', emoji: '☀️' },
  '151': { text: '多云', emoji: '⛅' },
  '152': { text: '少云', emoji: '⛅' },
  '153': { text: '晴间多云', emoji: '⛅' },
  '154': { text: '阴', emoji: '☁️' },
  '300': { text: '阵雨', emoji: '🌧️', level: 'light' },
  '301': { text: '强阵雨', emoji: '🌧️', level: 'moderate' },
  '302': { text: '雷阵雨', emoji: '⛈️', level: 'moderate' },
  '303': { text: '强雷阵雨', emoji: '⛈️', level: 'heavy' },
  '304': { text: '雷阵雨伴有冰雹', emoji: '⛈️', level: 'heavy' },
  '305': { text: '小雨', emoji: '🌧️', level: 'light' },
  '306': { text: '中雨', emoji: '🌧️', level: 'light' },
  '307': { text: '大雨', emoji: '🌧️', level: 'heavy' },
  '308': { text: '极端降雨', emoji: '🌧️', level: 'heavy' },
  '309': { text: '毛毛雨', emoji: '🌧️', level: 'light' },
  '310': { text: '暴雨', emoji: '🌧️', level: 'heavy' },
  '311': { text: '大暴雨', emoji: '🌧️', level: 'heavy' },
  '312': { text: '特大暴雨', emoji: '🌧️', level: 'heavy' },
  '313': { text: '冻雨', emoji: '🌧️', level: 'moderate' },
  '314': { text: '小到中雨', emoji: '🌧️', level: 'light' },
  '315': { text: '中到大雨', emoji: '🌧️', level: 'moderate' },
  '316': { text: '大到暴雨', emoji: '🌧️', level: 'heavy' },
  '317': { text: '暴雨到大暴雨', emoji: '🌧️', level: 'heavy' },
  '318': { text: '大暴雨到特大暴雨', emoji: '🌧️', level: 'heavy' },
  '350': { text: '阵雨', emoji: '🌧️', level: 'light' },
  '351': { text: '强阵雨', emoji: '🌧️', level: 'moderate' },
  '399': { text: '雨', emoji: '🌧️', level: 'light' },
  '400': { text: '小雪', emoji: '❄️', level: 'light' },
  '401': { text: '中雪', emoji: '❄️', level: 'moderate' },
  '402': { text: '大雪', emoji: '❄️', level: 'heavy' },
  '403': { text: '暴雪', emoji: '❄️', level: 'heavy' },
  '404': { text: '雨夹雪', emoji: '🌨️', level: 'light' },
  '405': { text: '雨雪天气', emoji: '🌨️', level: 'moderate' },
  '406': { text: '阵雨夹雪', emoji: '🌨️', level: 'light' },
  '407': { text: '阵雪', emoji: '❄️', level: 'light' },
  '408': { text: '小到中雪', emoji: '❄️', level: 'light' },
  '409': { text: '中到大雪', emoji: '❄️', level: 'moderate' },
  '410': { text: '大到暴雪', emoji: '❄️', level: 'heavy' },
  '456': { text: '阵雨夹雪', emoji: '🌨️', level: 'light' },
  '457': { text: '阵雪', emoji: '❄️', level: 'light' },
  '499': { text: '雪', emoji: '❄️', level: 'light' },
};

function getWeatherInfo(code) {
  return weatherMap[code] || { text: '未知', emoji: '❓', level: 'normal' };
}

async function requestWithRetry(url, params, retryCount = 0) {
  try {
    const response = await axios.get(url, {
      params,
      timeout: API_TIMEOUT,
    });
    return response.data;
  } catch (error) {
    if (retryCount < MAX_RETRY) {
      return requestWithRetry(url, params, retryCount + 1);
    }
    throw error;
  }
}

async function fetchCityId(cityName, apiKey) {
  const data = await requestWithRetry(`${GEO_BASE}/v2/city/lookup`, {
    location: cityName,
    key: apiKey,
  });

  if (data.code !== '200' || !data.location || data.location.length === 0) {
    throw new Error(`城市查询失败: ${data.message || '未知错误'}`);
  }

  return {
    id: data.location[0].id,
    name: data.location[0].name,
    adm: data.location[0].adm1,
  };
}

async function getCityId(cityName, apiKey) {
  const now = Date.now();

  if (
    cityCache &&
    cityCache.cityName === cityName &&
    cityCache.apiKey === apiKey &&
    now - cityCache.timestamp < CITY_CACHE_TTL
  ) {
    return cityCache.cityInfo;
  }

  try {
    const cityInfo = await fetchCityId(cityName, apiKey);
    cityCache = {
      cityName,
      apiKey,
      cityInfo,
      timestamp: now,
    };
    return cityInfo;
  } catch (error) {
    if (cityCache && cityCache.cityName === cityName) {
      console.warn(`[缓存兜底] 城市查询失败，使用缓存数据: ${error.message}`);
      return cityCache.cityInfo;
    }
    throw error;
  }
}

function clearCityCache() {
  cityCache = null;
}

async function getWeatherForecast(cityId, apiKey) {
  const data = await requestWithRetry(`${QWEATHER_BASE}/v7/weather/3d`, {
    location: cityId,
    key: apiKey,
  });

  if (data.code !== '200' || !data.daily) {
    throw new Error(`天气查询失败: ${data.message || '未知错误'}`);
  }

  return data.daily;
}

function getWeatherRisk(weather) {
  const risks = [];
  const suggestions = [];

  const weatherInfo = getWeatherInfo(weather.iconDay);

  if (weatherInfo.level === 'heavy') {
    risks.push('强降水');
    suggestions.push(`有${weatherInfo.text}，户外活动建议取消或改期`);
  } else if (weatherInfo.level === 'moderate') {
    risks.push('降水');
    suggestions.push(`有${weatherInfo.text}，户外活动请备防雨装备`);
  }

  const windScale = parseInt(weather.windScaleDay, 10);
  if (windScale >= 6) {
    risks.push('大风');
    suggestions.push(`${weather.windDir}${weather.windScaleDay}级大风，高空/水上活动请注意安全`);
  }

  const tempMax = parseInt(weather.tempMax, 10);
  if (tempMax >= 35) {
    risks.push('高温');
    suggestions.push(`最高温${tempMax}°C，高温天气注意防暑降温，避免正午户外活动`);
  }

  const tempMin = parseInt(weather.tempMin, 10);
  if (tempMin <= 0) {
    risks.push('低温');
    suggestions.push(`最低温${tempMin}°C，低温天气注意保暖防寒`);
  }

  if (risks.length === 0) {
    return {
      level: 'normal',
      summary: '天气总体良好，适合户外活动',
      details: [],
    };
  }

  return {
    level: risks.some((r) => ['强降水', '高温'].includes(r)) ? 'warning' : 'notice',
    summary: `注意：${risks.join('、')}`,
    details: suggestions,
  };
}

function parseWeatherData(dailyData, dayIndex) {
  const day = dailyData[dayIndex];
  const weatherInfo = getWeatherInfo(day.iconDay);
  const rainProb = parseInt(day.pop || '0', 10);

  const weather = {
    date: day.fxDate,
    textDay: weatherInfo.text,
    emoji: weatherInfo.emoji,
    tempMax: day.tempMax,
    tempMin: day.tempMin,
    humidity: day.humidity,
    windScale: day.windScaleDay,
    windDir: day.windDirDay,
    rainProb,
    precip: day.precip,
    iconDay: day.iconDay,
  };

  weather.risk = getWeatherRisk(weather);

  return weather;
}

function buildDingtalkMessage(weather, title, warnThreshold) {
  const lines = [];
  lines.push(`# ${title}`);
  lines.push('');
  lines.push(`**${weather.date}**`);
  lines.push('');

  if (weather.risk.level === 'warning') {
    lines.push(`<font color="red">⚠️ ${weather.risk.summary}</font>`);
    lines.push('');
    weather.risk.details.forEach((detail) => {
      lines.push(`<font color="red">• ${detail}</font>`);
      lines.push('');
    });
  } else if (weather.risk.level === 'notice') {
    lines.push(`<font color="orange">📌 ${weather.risk.summary}</font>`);
    lines.push('');
    weather.risk.details.forEach((detail) => {
      lines.push(`<font color="orange">• ${detail}</font>`);
      lines.push('');
    });
  } else {
    lines.push(`✅ ${weather.risk.summary}`);
    lines.push('');
  }

  lines.push(`### ${weather.emoji} ${weather.textDay}`);
  lines.push('');
  lines.push(`🌡️ ${weather.tempMin}°C ~ ${weather.tempMax}°C`);
  lines.push('');
  lines.push(`💧 湿度: ${weather.humidity}%`);
  lines.push('');
  lines.push(`🌬️ ${weather.windDir} ${weather.windScale}级`);
  lines.push('');
  lines.push(`🌧️ 降雨概率: ${weather.rainProb}%`);
  lines.push('');

  if (weather.rainProb > warnThreshold) {
    lines.push(`<font color="red">⚠️ 降雨概率${weather.rainProb}%，超过预警阈值${warnThreshold}%，请记得带伞，户外活动注意调整方案！</font>`);
    lines.push('');
  }

  lines.push('[查看详情](https://www.qweather.com/)');

  return {
    msgtype: 'markdown',
    markdown: {
      title: title.replace(/[\*\*]/g, '').trim(),
      text: lines.join('\n'),
    },
  };
}

module.exports = {
  getCityId,
  clearCityCache,
  getWeatherForecast,
  parseWeatherData,
  buildDingtalkMessage,
  getWeatherRisk,
};
