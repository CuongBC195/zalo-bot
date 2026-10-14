/**
 * Script kiểm tra trực tiếp Pipeline AI (Jev + RAG + Gemini) trên dòng lệnh
 * Chạy: node scripts/test-pipeline.js "Tuổi đời kết nạp Đảng quy định thế nào?"
 * hoặc: npm run ask "Quy định 37 về những điều đảng viên không được làm?"
 */

require('dotenv').config();

const pipeline = require('../src/pipeline');

async function run() {
  const query = process.argv.slice(2).join(' ').trim() || 'Tuổi đời và trình độ học vấn để được kết nạp Đảng?';

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`🔍 KIỂM TRA TRỰC TIẾP PIPELINE AI VĂN BẢN ĐẢNG`);
  console.log(`❓ Câu hỏi: "${query}"`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  await pipeline.init();

  const start = Date.now();
  const res = await pipeline.processMessage({
    text: query,
    senderName: 'Đồng chí thử nghiệm',
  });
  const answer = typeof res === 'string' ? res : res.answer;
  const duration = Date.now() - start;

  console.log('\n💬 PHẢN HỒI TỪ HỆ THỐNG:');
  console.log('────────────────────────────────────────────────');
  console.log(answer);
  console.log('────────────────────────────────────────────────');
  if (res.intent) console.log(`🎯 Ý định (Jev): ${res.intent}`);
  if (res.retrievedDocs?.length) console.log(`📚 Văn bản trích dẫn: ${res.retrievedDocs.join(', ')}`);
  console.log(`⏱️ Thời gian xử lý: ${duration}ms\n`);
}

run().catch(err => {
  console.error('❌ Lỗi:', err);
  process.exit(1);
});
