require('dotenv').config();
const axios = require('axios');
const schedule = require('node-schedule');
const {
  getCityId,
  getWeatherForecast,
  parseWeatherData,
  buildDingtalkMessage,
} = require('./weather');

const {
  CITY,
  WARN_RAIN,
  WEBHOOK_URL,
  ADMIN_WEBHOOK,
  QWEATHER_KEY,
} = process.env;

const warnThreshold = parseInt(WARN_RAIN || '60', 10);

async function sendDingtalkMessage(webhook, message) {
  await axios.post(webhook, message, {
    timeout: 5000,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

async function sendErrorMessage() {
  const message = {
    msgtype: 'text',
    text: {
      content: '今日天气数据获取失败，请手动确认',
    },
  };
  try {
    await sendDingtalkMessage(ADMIN_WEBHOOK || WEBHOOK_URL, message);
  } catch (err) {
    console.error('推送失败消息也出错了:', err.message);
  }
}

async function fetchAndPushWeather(dayIndex, title) {
  try {
    const cityId = await getCityId(CITY, QWEATHER_KEY);
    const forecast = await getWeatherForecast(cityId, QWEATHER_KEY);
    const weather = parseWeatherData(forecast, dayIndex);
    const message = buildDingtalkMessage(weather, title, warnThreshold);
    await sendDingtalkMessage(WEBHOOK_URL, message);
    console.log(`[${new Date().toLocaleString()}] 已推送: ${title}`);
  } catch (error) {
    console.error(`[${new Date().toLocaleString()}] 获取天气失败:`, error.message);
    await sendErrorMessage();
  }
}

function pushTodayWeather() {
  return fetchAndPushWeather(0, `**今日天气预告** - ${CITY}`);
}

function pushTomorrowWeather() {
  return fetchAndPushWeather(1, `**明日天气预告** - ${CITY}`);
}

console.log('========================================');
console.log('  天气预报钉钉推送服务启动');
console.log('========================================');
console.log(`  城市: ${CITY}`);
console.log(`  降雨预警阈值: ${warnThreshold}%`);
console.log(`  每日 07:30 推送今日天气`);
console.log(`  每日 21:00 推送明日天气`);
console.log('========================================');
console.log('  服务运行中，按 Ctrl+C 退出');
console.log('========================================');

schedule.scheduleJob('0 30 7 * * *', () => {
  console.log(`[${new Date().toLocaleString()}] 触发今日天气推送任务`);
  pushTodayWeather();
});

schedule.scheduleJob('0 0 21 * * *', () => {
  console.log(`[${new Date().toLocaleString()}] 触发明日天气推送任务`);
  pushTomorrowWeather();
});

if (process.env.TEST_NOW === 'true') {
  console.log('测试模式：立即推送一次今日天气');
  pushTodayWeather();
}

process.on('SIGINT', () => {
  console.log('\n服务已停止');
  process.exit(0);
});
