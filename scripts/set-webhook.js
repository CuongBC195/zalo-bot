/**
 * CLI Script: Cài đặt Webhook cho Zalo Bot
 * Cách dùng: node scripts/set-webhook.js https://your-domain.vercel.app/api/webhook
 */

require('dotenv').config();
const ZaloAPI = require('../src/zalo/api');

async function main() {
  const webhookUrl = process.argv[2];
  if (!webhookUrl) {
    console.error('❌ Vui lòng cung cấp URL webhook.');
    console.error('   Ví dụ: node scripts/set-webhook.js https://your-project.vercel.app/api/webhook');
    process.exit(1);
  }

  const api = new ZaloAPI();
  console.log(`🔌 Đang thiết lập Webhook: ${webhookUrl}...`);
  const res = await api.setWebhook(webhookUrl);
  if (res && res.ok) {
    console.log('✅ Đã thiết lập Webhook thành công!');
    const info = await api.getWebhookInfo();
    console.log('ℹ️  Thông tin Webhook hiện tại:', info?.result || info);
  } else {
    console.error('❌ Lỗi thiết lập Webhook:', res?.error || res);
  }
}

main();
