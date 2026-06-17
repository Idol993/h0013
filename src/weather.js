const axios = require('axios');

const QWEATHER_BASE = 'https://devapi.qweather.com';
const GEO_BASE = 'https://geoapi.qweather.com';
const API_TIMEOUT = 5000;
const MAX_RETRY = 1;

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
  '300': { text: '阵雨', emoji: '🌧️' },
  '301': { text: '强阵雨', emoji: '🌧️' },
  '302': { text: '雷阵雨', emoji: '🌧️' },
  '303': { text: '强雷阵雨', emoji: '🌧️' },
  '304': { text: '雷阵雨伴有冰雹', emoji: '🌧️' },
  '305': { text: '小雨', emoji: '🌧️' },
  '306': { text: '中雨', emoji: '🌧️' },
  '307': { text: '大雨', emoji: '🌧️' },
  '308': { text: '极端降雨', emoji: '🌧️' },
  '309': { text: '毛毛雨', emoji: '🌧️' },
  '310': { text: '暴雨', emoji: '🌧️' },
  '311': { text: '大暴雨', emoji: '🌧️' },
  '312': { text: '特大暴雨', emoji: '🌧️' },
  '313': { text: '冻雨', emoji: '🌧️' },
  '314': { text: '小到中雨', emoji: '🌧️' },
  '315': { text: '中到大雨', emoji: '🌧️' },
  '316': { text: '大到暴雨', emoji: '🌧️' },
  '317': { text: '暴雨到大暴雨', emoji: '🌧️' },
  '318': { text: '大暴雨到特大暴雨', emoji: '🌧️' },
  '350': { text: '阵雨', emoji: '🌧️' },
  '351': { text: '强阵雨', emoji: '🌧️' },
  '399': { text: '雨', emoji: '🌧️' },
  '400': { text: '小雪', emoji: '❄️' },
  '401': { text: '中雪', emoji: '❄️' },
  '402': { text: '大雪', emoji: '❄️' },
  '403': { text: '暴雪', emoji: '❄️' },
  '404': { text: '雨夹雪', emoji: '🌨️' },
  '405': { text: '雨雪天气', emoji: '🌨️' },
  '406': { text: '阵雨夹雪', emoji: '🌨️' },
  '407': { text: '阵雪', emoji: '❄️' },
  '408': { text: '小到中雪', emoji: '❄️' },
  '409': { text: '中到大雪', emoji: '❄️' },
  '410': { text: '大到暴雪', emoji: '❄️' },
  '456': { text: '阵雨夹雪', emoji: '🌨️' },
  '457': { text: '阵雪', emoji: '❄️' },
  '499': { text: '雪', emoji: '❄️' },
};

function getWeatherInfo(code) {
  return weatherMap[code] || { text: '未知', emoji: '❓' };
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

async function getCityId(cityName, apiKey) {
  const data = await requestWithRetry(`${GEO_BASE}/v2/city/lookup`, {
    location: cityName,
    key: apiKey,
  });

  if (data.code !== '200' || !data.location || data.location.length === 0) {
    throw new Error(`城市查询失败: ${data.message || '未知错误'}`);
  }

  return data.location[0].id;
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

function parseWeatherData(dailyData, dayIndex) {
  const day = dailyData[dayIndex];
  const weatherInfo = getWeatherInfo(day.iconDay);
  const rainProb = parseInt(day.precip || '0', 10);

  return {
    date: day.fxDate,
    textDay: weatherInfo.text,
    emoji: weatherInfo.emoji,
    tempMax: day.tempMax,
    tempMin: day.tempMin,
    humidity: day.humidity,
    windScale: day.windScaleDay,
    windDir: day.windDirDay,
    rainProb,
  };
}

function buildDingtalkMessage(weather, title, warnThreshold) {
  const lines = [];
  lines.push(`# ${title}`);
  lines.push('');
  lines.push(`**${weather.date}**`);
  lines.push('');
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

  if (weather.rainProb >= warnThreshold) {
    lines.push(`<font color="red">⚠️ 降雨概率超过${warnThreshold}%，请记得带伞，户外活动注意调整方案！</font>`);
    lines.push('');
  }

  lines.push('[查看详情](https://www.qweather.com/)');

  return {
    msgtype: 'markdown',
    markdown: {
      title: title.replace(/\*\*/g, ''),
      text: lines.join('\n'),
    },
  };
}

module.exports = {
  getCityId,
  getWeatherForecast,
  parseWeatherData,
  buildDingtalkMessage,
};
