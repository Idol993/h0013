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

function validateConfig() {
  const missing = [];

  if (!CITY || CITY.trim() === '') {
    missing.push('CITY (城市名)');
  }
  if (!QWEATHER_KEY || QWEATHER_KEY.trim() === '' || QWEATHER_KEY === 'your_qweather_api_key_here') {
    missing.push('QWEATHER_KEY (和风天气API Key)');
  }
  if (!WEBHOOK_URL || WEBHOOK_URL.trim() === '' || WEBHOOK_URL.includes('your_token_here')) {
    missing.push('WEBHOOK_URL (钉钉机器人Webhook地址)');
  }

  return missing;
}

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

async function fetchWeather(dayIndex) {
  const cityInfo = await getCityId(CITY, QWEATHER_KEY);
  const forecast = await getWeatherForecast(cityInfo.id, QWEATHER_KEY);
  const weather = parseWeatherData(forecast, dayIndex);
  return { weather, cityInfo };
}

async function fetchAndPushWeather(dayIndex, title, dryRun = false) {
  try {
    const { weather, cityInfo } = await fetchWeather(dayIndex);
    const message = buildDingtalkMessage(weather, title, warnThreshold);

    if (dryRun) {
      console.log('\n========== 钉钉消息预览（不发送） ==========');
      console.log(message.markdown.text);
      console.log('============================================\n');
      return { weather, cityInfo, message, dryRun: true };
    }

    await sendDingtalkMessage(WEBHOOK_URL, message);
    console.log(`[${new Date().toLocaleString()}] 已推送: ${title}`);
    return { weather, cityInfo, message, dryRun: false };
  } catch (error) {
    console.error(`[${new Date().toLocaleString()}] 获取天气失败:`, error.message);
    if (!dryRun) {
      await sendErrorMessage();
    }
    throw error;
  }
}

function pushTodayWeather(dryRun = false) {
  return fetchAndPushWeather(0, `**今日天气预告** - ${CITY}`, dryRun);
}

function pushTomorrowWeather(dryRun = false) {
  return fetchAndPushWeather(1, `**明日天气预告** - ${CITY}`, dryRun);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {
    mode: 'serve',
    dryRun: false,
  };

  for (const arg of args) {
    if (arg === '--today' || arg === 'today') {
      result.mode = 'test';
      result.day = 'today';
    } else if (arg === '--tomorrow' || arg === 'tomorrow') {
      result.mode = 'test';
      result.day = 'tomorrow';
    } else if (arg === '--dry-run' || arg === '--dry' || arg === 'dry') {
      result.dryRun = true;
    } else if (arg === '--help' || arg === '-h' || arg === 'help') {
      result.mode = 'help';
    }
  }

  return result;
}

function printHelp() {
  console.log(`
天气预报钉钉推送工具

用法:
  node index.js                     启动定时服务（每天7:30和21:00推送）
  node index.js --today             测试：立即推送一次今日天气
  node index.js --tomorrow          测试：立即推送一次明日天气
  node index.js --today --dry-run   测试：仅打印今日天气消息，不实际发送
  node index.js --tomorrow --dry-run 测试：仅打印明日天气消息，不实际发送
  node index.js --help              显示帮助信息

配置:
  在 .env 文件中配置以下变量：
    CITY=城市名
    QWEATHER_KEY=和风天气API Key
    WEBHOOK_URL=钉钉机器人Webhook地址
    ADMIN_WEBHOOK=管理员通知Webhook（可选）
    WARN_RAIN=降雨预警阈值（默认60）
`);
}

function printBanner(cityInfo = null) {
  console.log('========================================');
  console.log('  天气预报钉钉推送服务');
  console.log('========================================');
  console.log(`  城市: ${CITY}`);
  if (cityInfo) {
    console.log(`  城市ID: ${cityInfo.id} (${cityInfo.adm})`);
  }
  console.log(`  降雨预警阈值: > ${warnThreshold}%`);
  console.log('----------------------------------------');
  console.log('  定时任务:');
  console.log('    • 每日 07:30 推送今日天气');
  console.log('    • 每日 21:00 推送明日天气');
  console.log('========================================');
}

async function main() {
  const args = parseArgs();

  if (args.mode === 'help') {
    printHelp();
    return;
  }

  const missingConfig = validateConfig();
  if (missingConfig.length > 0) {
    console.error('\n❌ 配置检查失败，缺少以下必填项：');
    missingConfig.forEach((item) => {
      console.error(`   • ${item}`);
    });
    console.error('\n请在 .env 文件中配置完整后再启动。');
    console.error('运行 node index.js --help 查看使用说明。\n');
    process.exit(1);
  }

  if (args.mode === 'test') {
    if (args.dryRun) {
      console.log(`\n🧪 测试模式：预览${args.day === 'today' ? '今日' : '明日'}天气消息（不发送）\n`);
    } else {
      console.log(`\n🧪 测试模式：立即推送${args.day === 'today' ? '今日' : '明日'}天气\n`);
    }

    try {
      if (args.day === 'today') {
        await pushTodayWeather(args.dryRun);
      } else {
        await pushTomorrowWeather(args.dryRun);
      }
      if (args.dryRun) {
        console.log('✅ 预览完成\n');
      } else {
        console.log('✅ 推送完成\n');
      }
    } catch (err) {
      console.error('❌ 测试失败:', err.message);
      process.exit(1);
    }
    return;
  }

  let cityInfo = null;
  try {
    cityInfo = await getCityId(CITY, QWEATHER_KEY);
    console.log(`\n✅ 城市查询成功: ${cityInfo.name} (${cityInfo.adm}) - ID: ${cityInfo.id}\n`);
  } catch (err) {
    console.error('\n❌ 启动时城市查询失败:', err.message);
    console.error('   服务仍会启动，但首次推送时会重试。请检查 API Key 和城市名是否正确。\n');
  }

  printBanner(cityInfo);
  console.log('  服务运行中，按 Ctrl+C 退出');
  console.log('========================================\n');

  schedule.scheduleJob('0 30 7 * * *', () => {
    console.log(`[${new Date().toLocaleString()}] 触发今日天气推送任务`);
    pushTodayWeather();
  });

  schedule.scheduleJob('0 0 21 * * *', () => {
    console.log(`[${new Date().toLocaleString()}] 触发明日天气推送任务`);
    pushTomorrowWeather();
  });

  process.on('SIGINT', () => {
    console.log('\n\n服务已停止');
    process.exit(0);
  });
}

main();
