/**
 * Smoke Test cho Zalo Đảng AI Bot
 * Kiểm tra tính toàn vẹn của Jev primitives, RAG engine và Pipeline
 */

const assert = require('assert');
const jev = require('../src/jev');
const rag = require('../src/rag');
const pipeline = require('../src/pipeline');

async function testJevPrimitives() {
  console.log('🧪 [Test 1] Kiểm tra Jev Intent Routing...');
  const res1 = await jev.routeIntent('Tuổi kết nạp Đảng quy định ra sao?');
  assert.strictEqual(res1.intent, 'party_regulation', 'Phải nhận diện câu hỏi quy định Đảng');

  const res2 = await jev.routeIntent('Chào bạn, bạn là ai?');
  assert.strictEqual(res2.intent, 'greeting_or_help', 'Phải nhận diện câu hỏi chào hỏi');

  const res3 = await jev.routeIntent('Dự báo thời tiết ngày mai thế nào?');
  assert.strictEqual(res3.intent, 'out_of_scope', 'Phải nhận diện câu hỏi ngoài phạm vi');
  console.log('   ✅ Jev Intent Routing vượt qua kiểm thử.');
}

async function testRagSearch() {
  console.log('🧪 [Test 2] Kiểm tra RAG Search Engine...');
  const count = rag.init();
  assert(count > 0, 'Phải nạp được ít nhất 1 điều khoản');

  const results = rag.search('Tuổi đời người vào Đảng');
  assert(results.length > 0, 'RAG phải tìm thấy kết quả cho câu hỏi tuổi đời');
  assert(
    results[0].fullText.includes('tuổi đời') || results[0].fullText.includes('18 tuổi'),
    'Kết quả đầu tiên phải đề cập đến tuổi đời hoặc 18 tuổi'
  );
  console.log(`   ✅ RAG Search tìm thấy ${results.length} kết quả phù hợp.`);
}

async function testPipelineEndToEnd() {
  console.log('🧪 [Test 3] Kiểm tra Pipeline End-to-End...');
  pipeline.init();

  const reply1 = await pipeline.processMessage({
    text: 'Đảng viên dự bị có quyền biểu quyết không?',
    senderName: 'Đồng chí Cường',
  });
  assert(typeof reply1 === 'string' && reply1.length > 20, 'Phải sinh câu trả lời hợp lệ');

  const reply2 = await pipeline.processMessage({
    text: 'Hôm nay trời có mưa không?',
    senderName: 'Đồng chí Cường',
  });
  assert(reply2.includes('ngoài phạm vi'), 'Phải từ chối câu hỏi ngoài phạm vi');

  const reply3 = await pipeline.processMessage({
    text: '/docs',
    senderName: 'Đồng chí Cường',
  });
  assert(reply3.includes('DANH MỤC VĂN BẢN'), 'Phải xử lý lệnh /docs');
  console.log('   ✅ Pipeline End-to-End hoạt động chính xác.');
}

async function main() {
  console.log('========================================');
  console.log('🚀 BẮT ĐẦU SMOKE TEST HỆ THỐNG');
  console.log('========================================\n');

  try {
    await testJevPrimitives();
    await testRagSearch();
    await testPipelineEndToEnd();

    console.log('\n========================================');
    console.log('🎉 TẤT CẢ SMOKE TEST ĐỀU THÀNH CÔNG (PASS)');
    console.log('========================================\n');
  } catch (err) {
    console.error('\n❌ Thất bại tại kiểm thử:', err);
    process.exit(1);
  }
}

main();
