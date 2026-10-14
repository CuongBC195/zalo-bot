/**
 * Zalo Đảng AI Bot - Entry Point
 * Chatbot giải đáp thông tư, quy định của Đảng ứng dụng Jev (System 1) + RAG + Gemini (System 2)
 */

require('dotenv').config();

const config = require('./config');
const ZaloAPI = require('./zalo/api');
const PollingEngine = require('./zalo/polling');
const rag = require('./rag');

async function main() {
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║        TRỢ LÝ VĂN BẢN ĐẢNG AI - ZALO BOT v2.0         ║');
  console.log('║   Kiến trúc: Jev (System 1) + RAG + Gemini (System 2) ║');
  console.log('╚═══════════════════════════════════════════════════════╝');
  console.log('');

  // 1. Kiểm tra cấu hình Zalo
  if (!config.zalo.token) {
    console.error('❌ Lỗi: Chưa cấu hình ZALO_BOT_TOKEN trong file .env');
    console.error('   Vui lòng kiểm tra file .env hoặc tham khảo .env.example');
    process.exit(1);
  }

  // 2. Nạp kho dữ liệu RAG
  console.log('📚 Đang nạp cơ sở dữ liệu văn bản Đảng...');
  const count = await rag.init();
  console.log(`✅ Đã nạp thành công ${count} điều khoản quy định.`);

  // 3. Khởi tạo Zalo API
  console.log('🔌 Đang kết nối tới Zalo Bot API...');
  const api = new ZaloAPI();
  const me = await api.getMe();

  if (me && me.result) {
    const bot = me.result;
    console.log(`✅ Kết nối thành công bot: ${bot.display_name || bot.name || 'Zalo Bot'} (ID: ${bot.id || 'N/A'})`);
  } else {
    console.warn('⚠️  Không lấy được thông tin bot (tiếp tục ở chế độ polling)...');
  }

  // Chuyển sang Polling mode nếu cấu hình yêu cầu
  if (config.zalo.deleteWebhookOnStart) {
    console.log('🔁 Đang xóa webhook cũ để chuyển sang chế độ polling...');
    await api.deleteWebhook();
  }

  console.log('');
  console.log(`⚙️  Mô hình LLM: ${config.gemini.model}`);
  console.log(`⚙️  Mô hình Jev: ${config.jev.model} (Fallback nội bộ: ${config.jev.enableLocalFallback ? 'BẬT' : 'TẮT'})`);
  console.log(`⏱️  Polling Interval: ${config.zalo.pollingIntervalMs / 1000}s`);
  console.log('═══════════════════════════════════════════════════════');

  // 4. Khởi động Polling Engine
  const poller = new PollingEngine(api);
  await poller.start();

  console.log('\n🚀 Bot đang hoạt động! Đang lắng nghe câu hỏi từ Zalo...');
  console.log('   Nhấn Ctrl+C để dừng bot an toàn.\n');

  // Xử lý dừng an toàn
  const handleExit = () => {
    console.log('\n⛔ Đang dừng bot...');
    poller.stop();
    console.log('✅ Bot đã dừng.');
    process.exit(0);
  };

  process.on('SIGINT', handleExit);
  process.on('SIGTERM', handleExit);
}

main().catch(err => {
  console.error('❌ Lỗi khởi động:', err);
  process.exit(1);
});
