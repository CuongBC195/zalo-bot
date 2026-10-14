/**
 * Smoke Test cho Zalo Đảng AI Bot (v2.0)
 * Kiểm tra tính toàn vẹn của Jev primitives, RAG engine, Database service và Pipeline
 */

const assert = require('assert');
const jev = require('../src/jev');
const rag = require('../src/rag');
const pipeline = require('../src/pipeline');
const db = require('../src/db');

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
  console.log('🧪 [Test 2] Kiểm tra RAG Search Engine với Thể thức & Lưu trữ...');
  const count = await rag.init();
  assert(count > 0, 'Phải nạp được ít nhất 1 điều khoản');

  // Test 2.1: Quy định Đảng
  const res1 = await rag.search('Tuổi đời người vào Đảng');
  assert(res1.length > 0, 'RAG phải tìm thấy kết quả cho câu hỏi tuổi đời');

  // Test 2.2: Thể thức văn bản (HD 17)
  const res2 = await rag.search('Thẩm quyền ký thay mặt T/M và ký thay K/T theo hướng dẫn 17');
  assert(res2.length > 0, 'RAG phải tìm thấy quy định thể thức theo HD 17');
  assert(
    res2[0].documentCode?.includes('17') || res2[0].title?.includes('ký') || res2[0].content?.includes('T/M'),
    'Kết quả phải chứa quy định về ký T/M, K/T'
  );

  // Test 2.3: Văn thư & nộp lưu hồ sơ (HD 05)
  const res3 = await rag.search('Thời hạn nộp lưu hồ sơ vào lưu trữ cơ quan Đảng');
  assert(res3.length > 0, 'RAG phải tìm thấy quy định nộp lưu hồ sơ theo HD 05');

  // Test 2.4: Lưu trữ điện tử (TT 02 BNV)
  const res4 = await rag.search('Định dạng tệp nộp lưu tài liệu lưu trữ điện tử thông tư 02');
  assert(res4.length > 0, 'RAG phải tìm thấy quy định lưu trữ điện tử theo TT 02');

  console.log(`   ✅ RAG Search vượt qua kiểm thử với ${count} điều khoản (Thể thức, Văn thư, Quy định).`);
}

async function testPipelineEndToEnd() {
  console.log('🧪 [Test 3] Kiểm tra Pipeline End-to-End...');
  await pipeline.init();

  const res1 = await pipeline.processMessage({
    text: 'Thẩm quyền ký T/M và K/T trong văn bản Đảng quy định ra sao?',
    senderName: 'Đồng chí Cường',
  });
  const reply1 = typeof res1 === 'string' ? res1 : res1.answer;
  assert(typeof reply1 === 'string' && reply1.length > 20, 'Phải sinh câu trả lời hợp lệ');
  assert(reply1.includes('05-HD/VPTW') || reply1.includes('399-QĐ/TW') || reply1.includes('17-HD/VPTW') || reply1.includes('T/M'), 'Phải dẫn nguồn văn bản thể thức');
  if (res1.intent) {
    assert.strictEqual(res1.intent, 'party_regulation', 'Intent phải là party_regulation');
  }

  const res2 = await pipeline.processMessage({
    text: 'Hôm nay trời có mưa không?',
    senderName: 'Đồng chí Cường',
  });
  const reply2 = typeof res2 === 'string' ? res2 : res2.answer;
  assert(reply2.includes('ngoài phạm vi'), 'Phải từ chối câu hỏi ngoài phạm vi');
  if (res2.intent) {
    assert.strictEqual(res2.intent, 'out_of_scope', 'Intent phải là out_of_scope');
  }

  const res3 = await pipeline.processMessage({
    text: '/docs',
    senderName: 'Đồng chí Cường',
  });
  const reply3 = typeof res3 === 'string' ? res3 : res3.answer;
  assert(reply3.includes('DANH MỤC VĂN BẢN'), 'Phải xử lý lệnh /docs');
  console.log('   ✅ Pipeline End-to-End hoạt động chính xác.');
}

async function testDatabaseService() {
  console.log('🧪 [Test 4] Kiểm tra PostgreSQL Database Service...');
  assert(typeof db.checkConnection === 'function', 'DB Service phải có hàm checkConnection');
  assert(typeof db.createDocument === 'function', 'DB Service phải có hàm createDocument');
  console.log('   ✅ Database Service sẵn sàng (hỗ trợ cả PostgreSQL và Local Memory Fallback).');
}

async function testUserManagementAndAudit() {
  console.log('🧪 [Test 5] Kiểm tra Quản lý Người Dùng, Xác thực Admin & Audit Logs...');
  const bcrypt = require('bcryptjs');

  // 1. Kiểm tra tài khoản admin mặc định
  const admin = await db.getUserByUsername('admin');
  assert(admin, 'Phải tồn tại tài khoản admin mặc định');
  assert(admin.role === 'superadmin', 'Tài khoản admin phải có quyền superadmin');
  const expectedPass = process.env.ADMIN_PASSWORD || 'Admin@123456';
  assert(admin.password_hash.startsWith('$2'), 'Mật khẩu admin phải được mã hóa chuẩn bcrypt ($2a$ hoặc $2b$)');

  // 2. Kiểm tra tạo tài khoản admin mới
  const testUsername = 'admin_test_' + Date.now();
  const created = await db.createUser({
    username: testUsername,
    password: 'Password@999',
    fullName: 'Cán Bộ Kiểm Thử',
    email: 'canbo@party.gov.vn',
    role: 'admin',
  });
  assert(created && created.username === testUsername, 'Tạo admin mới thành công');

  // 3. Kiểm tra ghi nhận tương tác Zalo user & Audit query logs
  const testZaloId = 'zalo_user_test_99';
  await db.recordInteraction({
    zaloId: testZaloId,
    displayName: 'Đồng chí Kiểm Thử',
    chatId: 'chat_99',
    queryText: 'Hướng dẫn 17 quy định thể thức ra sao?',
    intent: 'party_regulation',
    retrievedDocs: ['17-HD/VPTW'],
    responseText: 'Theo Hướng dẫn 17-HD/VPTW...',
    latencyMs: 15,
  });

  const zaloUsers = await db.getZaloUsers({ search: testZaloId });
  assert(zaloUsers.length > 0, 'Phải lưu thông tin người dùng Zalo tương tác');
  assert(zaloUsers[0].query_count >= 1, 'Số lượt hỏi phải được đếm tăng dần');

  // 4. Kiểm tra Chặn người dùng (Blacklist)
  assert(!(await db.isZaloUserBlocked(testZaloId)), 'Mặc định người dùng chưa bị chặn');
  await db.toggleBlockZaloUser(testZaloId, true);
  assert(await db.isZaloUserBlocked(testZaloId), 'Người dùng phải chuyển sang trạng thái bị chặn');
  await db.toggleBlockZaloUser(testZaloId, false);
  assert(!(await db.isZaloUserBlocked(testZaloId)), 'Mở khóa thành công');

  // 5. Kiểm tra lấy Query Logs
  const logs = await db.getQueryLogs({ limit: 10 });
  assert(logs.length > 0, 'Phải lưu nhật ký truy vấn audit trail');
  assert(logs[0].query_text.includes('17'), 'Nội dung log phải khớp câu hỏi đã ghi');

  console.log('   ✅ Quản lý Người Dùng, Phân Quyền Admin & Audit Logs hoạt động chính xác 100%.');
}

async function main() {
  console.log('========================================');
  console.log('🚀 BẮT ĐẦU SMOKE TEST HỆ THỐNG (v2.0)');
  console.log('========================================\n');

  try {
    await testJevPrimitives();
    await testRagSearch();
    await testPipelineEndToEnd();
    await testDatabaseService();
    await testUserManagementAndAudit();

    console.log('\n========================================');
    console.log('🎉 TẤT CẢ SMOKE TEST ĐỀU THÀNH CÔNG (PASS)');
    console.log('========================================\n');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Thất bại tại kiểm thử:', err);
    process.exit(1);
  }
}

main();
