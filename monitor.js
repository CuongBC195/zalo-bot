/**
 * Monitor - theo dõi update realtime từ Zalo Bot API.
 * Chạy: node monitor.js
 */

require('dotenv').config();

process.env.ZALO_LONG_POLL_TIMEOUT_SECONDS = process.env.ZALO_LONG_POLL_TIMEOUT_SECONDS || '10';

const ZaloAPI = require('./src/zalo/api');

const TOKEN = process.env.ZALO_BOT_TOKEN;

if (!TOKEN) {
  console.error('Chưa đặt ZALO_BOT_TOKEN trong .env');
  process.exit(1);
}

const api = new ZaloAPI(TOKEN);

console.log('ZALO BOT MONITOR - Đang theo dõi tin nhắn realtime...');
console.log('Mở Zalo và nhắn /id cho bot nếu cần thiết lập chủ bot.');
console.log('────────────────────────────────────\n');

let count = 0;

async function poll() {
  count += 1;
  process.stdout.write(`\r[Lần ${count}] Đang chờ tin nhắn...`);

  const data = await api.getUpdates();
  const updates = normalizeUpdates(data?.result);

  if (updates.length) {
    console.log('\n\nNHẬN ĐƯỢC UPDATE');
    console.log(JSON.stringify(updates, null, 2));
    console.log('\n────────────────────────────────────');
  }

  setTimeout(poll, 500);
}

function normalizeUpdates(result) {
  if (!result) return [];
  if (Array.isArray(result)) return result;
  if (typeof result === 'object') return [result];
  return [];
}

poll().catch(err => {
  console.error('\nLỗi monitor:', err.message);
  process.exit(1);
});
