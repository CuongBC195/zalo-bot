/**
 * Debug script - kiểm tra Zalo Bot API qua adapter node-zalo-bot.
 * Chạy: node debug.js
 */

require('dotenv').config();

const ZaloAPI = require('./src/zalo/api');

const TOKEN = process.env.ZALO_BOT_TOKEN;

if (!TOKEN) {
  console.error('Chưa đặt ZALO_BOT_TOKEN trong .env');
  process.exit(1);
}

const api = new ZaloAPI(TOKEN);

async function run() {
  console.log('=== TEST 1: getMe ===');
  const me = await api.getMe();
  if (me?.result) {
    console.log({
      id: me.result.id,
      display_name: me.result.display_name || me.result.name || me.result.username,
    });
  } else {
    console.log('Không lấy được thông tin bot.');
  }

  console.log('\n=== TEST 2: getWebhookInfo ===');
  const webhook = await api.getWebhookInfo();
  console.log(JSON.stringify(webhook?.result || webhook, null, 2));

  console.log('\n=== TEST 3: getUpdates (timeout=5 giây) ===');
  process.env.ZALO_LONG_POLL_TIMEOUT_SECONDS = '5';
  const updates = await api.getUpdates();
  const result = updates?.result;
  const count = Array.isArray(result) ? result.length : (result ? 1 : 0);
  console.log(`Số update nhận được: ${count}`);
  if (count) {
    console.log(JSON.stringify(result, null, 2));
  }
}

run()
  .then(() => {
    console.log('\nDone.');
    process.exit(0);
  })
  .catch(err => {
    console.error(err.message);
    process.exit(1);
  });
