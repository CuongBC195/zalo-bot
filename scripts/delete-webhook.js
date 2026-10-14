/**
 * CLI Script: Xóa Webhook (chuyển về Long Polling)
 * Cách dùng: node scripts/delete-webhook.js
 */

require('dotenv').config();
const ZaloAPI = require('../src/zalo/api');

async function main() {
  const api = new ZaloAPI();
  console.log('🔌 Đang xóa Webhook để chuyển sang Long Polling...');
  const res = await api.deleteWebhook();
  console.log('✅ Kết quả xóa Webhook:', res);
}

main();
