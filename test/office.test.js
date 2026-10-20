/**
 * Kiểm thử luồng Tra cứu Sổ công văn.
 * Chạy hoàn toàn trên bộ nhớ dự phòng (ép DB không kết nối được) và tắt AI để kết quả ổn định.
 * Chỉ dùng dữ liệu ẩn danh trong test/fixtures, không dùng template-excel/.
 */

// OFFICE_TEST_PG_URL: chạy trên Postgres thật (CHỈ dùng DB thử nghiệm, test sẽ xóa dữ liệu sổ công văn)
const PG_URL = process.env.OFFICE_TEST_PG_URL || '';
process.env.DATABASE_URL = PG_URL || 'postgresql://test:test@127.0.0.1:1/none';
process.env.OFFICE_AI_REWRITE = 'false';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { parseRegisterWorkbook, ImportError } = require('../src/office/importer');
const { parseQuery, extractDateRange } = require('../src/office/query-parser');
const { keywordTokens, normText } = require('../src/office/normalize');
const { validateAiOutput, toParsed, extractJson } = require('../src/office/ai-rewriter');
const store = require('../src/office/store');
const { search } = require('../src/office/search');
const office = require('../src/office');
const { routeMessage } = require('../src/zalo/handler');

const NOW = new Date('2026-10-20T04:00:00Z'); // Thứ Ba 20/10/2026 giờ VN
const fixture = (name) => fs.readFileSync(path.join(__dirname, 'fixtures', name));

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`  FAIL ${name}\n       ${err.message}`);
    process.exitCode = 1;
  }
}

const db = require('../src/db');

async function resetStore() {
  store._resetLocal();
  if (PG_URL) {
    await db.pool.query(`TRUNCATE office_documents, office_doc_imports, zalo_activation_codes, zalo_sessions RESTART IDENTITY CASCADE`);
    await db.pool.query(`DELETE FROM zalo_users WHERE zalo_id LIKE 'Z-%'`);
  }
}

async function loadFixtures() {
  await resetStore();
  for (const f of ['so-van-ban-den.xls', 'so-van-ban-di.xls']) {
    await store.saveImport({ parsed: parseRegisterWorkbook(fixture(f)), fileName: f, user: { id: 1, username: 'test' } });
  }
  office.invalidateOverview();
}

async function main() {
  if (PG_URL) {
    assert.ok(/127\.0\.0\.1|localhost/.test(PG_URL), 'OFFICE_TEST_PG_URL chỉ được trỏ tới DB thử nghiệm cục bộ');
    assert.ok(await db.initSchema(), 'Không khởi tạo được schema');
    console.log('[Office] Chạy trên Postgres thật (thử nghiệm)');
  }
  console.log('[Office] Nhập Excel');
  await test('nhận diện sổ đến, bỏ văn bản Mật, báo dòng thiếu ID', () => {
    const p = parseRegisterWorkbook(fixture('so-van-ban-den.xls'));
    assert.strictEqual(p.direction, 'den');
    assert.strictEqual(p.records.length, 4);
    assert.strictEqual(p.skipped.secret, 1);
    assert.ok(p.errors.some((e) => /Thiếu ID/.test(e.message)));
    assert.strictEqual(p.reportDate, '2026-10-20');
    assert.ok(p.records.every((r) => r.search_norm && r.row_hash));
  });
  await test('nhận diện sổ đi, bỏ văn bản chưa phát hành', () => {
    const p = parseRegisterWorkbook(fixture('so-van-ban-di.xls'));
    assert.strictEqual(p.direction, 'di');
    assert.strictEqual(p.records.length, 4);
    assert.strictEqual(p.skipped.unpublished, 1);
  });
  await test('chọn sai loại sổ thì báo lỗi', () => {
    assert.throws(() => parseRegisterWorkbook(fixture('so-van-ban-den.xls'), { direction: 'di' }), ImportError);
  });
  await test('file rỗng / không phải Excel thì báo lỗi', () => {
    assert.throws(() => parseRegisterWorkbook(Buffer.alloc(0)), ImportError);
    assert.throws(() => parseRegisterWorkbook(Buffer.from('not an excel file')), ImportError);
  });
  await test('nhập lại không tạo bản ghi trùng', async () => {
    await loadFixtures();
    const again = await store.saveImport({ parsed: parseRegisterWorkbook(fixture('so-van-ban-den.xls')), fileName: 'x.xls' });
    assert.deepStrictEqual([again.inserted, again.updated, again.unchanged], [0, 0, 4]);
  });

  console.log('[Office] Phân tích câu hỏi (quy tắc, 0 token)');
  const cases = [
    ['866-CV/TU', { soKyHieu: '866-CV/TU', number: 866 }, 'high'],
    ['kế hoạch 120-KH/ĐU', { soKyHieu: '120-KH/DU', theLoai: 'Kế hoạch' }, 'high'],
    ['54112677', { sourceId: '54112677' }, 'high'],
    ['mã 54112677', { sourceId: '54112677' }, 'high'],
    ['cv 253', { number: 253 }],
    ['quyết định 263', { theLoai: 'Quyết định', number: 263 }],
    ['bc so 15', { theLoai: 'Báo cáo', number: 15 }],
    ['quyết định tháng 10', { theLoai: 'Quyết định', dateFrom: '2026-10-01', dateTo: '2026-10-31' }],
    ['qd thang 9', { theLoai: 'Quyết định', dateFrom: '2026-09-01', dateTo: '2026-09-30' }],
    ['qyet dinh khen thuong', { theLoai: 'Quyết định' }],
    ['văn bản đến tuần này', { direction: 'den', dateFrom: '2026-10-19', dateTo: '2026-10-20' }],
    ['vb den hom nay', { direction: 'den', dateFrom: '2026-10-20', dateTo: '2026-10-20' }],
    ['văn bản đến gần đây', { direction: 'den', dateFrom: '2026-09-21', dateTo: '2026-10-20' }],
    ['van ban di tu 01/09 den 30/09/2026', { direction: 'di', dateFrom: '2026-09-01', dateTo: '2026-09-30' }],
    ['giấy mời họp ngày 15/10', { theLoai: 'Giấy mời', dateFrom: '2026-10-15', dateTo: '2026-10-15' }],
    ['tim bao cao tong ket nam 2025', { theLoai: 'Báo cáo', dateFrom: '2025-01-01', dateTo: '2025-12-31' }],
    ['cv cua ubkt thang truoc', { dateFrom: '2026-09-01', dateTo: '2026-09-30' }],
    ['văn bản do đồng chí Hùng ký', { nguoiKy: 'hung' }],
    ['người ký là Nguyễn Văn A', { nguoiKy: 'nguyen van a' }],
    ['vb ma ong cuong ky', { nguoiKy: 'cuong' }],
    ['chuong trinh hanh dong', { theLoai: 'Chương trình' }],
    ['thong bao ket luan cua thanh uy', { theLoai: 'Thông báo' }],
    ['tìm công văn hướng dẫn đại hội chi bộ', { theLoai: null }],
    ['văn bản liên quan đến chuyển đổi số', { direction: null }],
  ];
  for (const [q, expected, conf] of cases) {
    await test(`"${q}"`, () => {
      const r = parseQuery(q, { now: NOW });
      for (const [k, v] of Object.entries(expected)) assert.strictEqual(r.filters[k], v, `${k}: ${r.filters[k]} != ${v}`);
      if (conf) assert.strictEqual(r.confidence, conf);
    });
  }
  await test('ý định đếm', () => {
    assert.strictEqual(parseQuery('bao nhiêu công văn đến tháng 10', { now: NOW }).intent, 'count');
    assert.strictEqual(parseQuery('co bao nhieu van ban di quy 3', { now: NOW }).filters.dateFrom, '2026-07-01');
  });
  await test('chào hỏi / làm mới', () => {
    assert.strictEqual(parseQuery('xin chào').intent, 'help');
    assert.strictEqual(parseQuery('/moi').intent, 'reset');
  });
  await test('từ khóa giữ âm tiết nhập nhằng (nhà, số), bỏ hư từ', () => {
    assert.deepStrictEqual(parseQuery('công văn về nhà đất').keywords, ['nha', 'dat']);
    assert.deepStrictEqual(parseQuery('cong van ve chuyen doi so').keywords, ['chuyen', 'doi', 'so']);
    assert.ok(keywordTokens(normText('phòng chống tham nhũng')).includes('nhung'));
  });
  await test('"tháng 12" khi đang tháng 10 hiểu là năm trước', () => {
    assert.strictEqual(extractDateRange('thang 12', NOW).from, '2025-12-01');
  });
  await test('câu ngoài phạm vi không có bộ lọc => độ tin cậy thấp khi không có từ khóa mạnh', () => {
    assert.strictEqual(parseQuery('ok').confidence, 'low');
  });

  console.log('[Office] Hội thoại có bộ nhớ');
  const session = { filters: { direction: 'den', dateFrom: '2026-10-01', dateTo: '2026-10-20', dateLabel: 'tháng 10/2026' }, keywords: ['dat'], resultIds: [1, 2, 3], intent: 'search' };
  await test('"số 2" => chi tiết mục 2', () => {
    const r = parseQuery('số 2', { now: NOW, session });
    assert.strictEqual(r.intent, 'detail');
    assert.strictEqual(r.detailIndex, 1);
  });
  await test('"xem thêm" / "danh sách" => trang tiếp', () => {
    assert.strictEqual(parseQuery('xem thêm', { now: NOW, session }).intent, 'more');
    assert.strictEqual(parseQuery('danh sách', { now: NOW, session }).intent, 'more');
  });
  await test('"còn tháng 9 thì sao" giữ sổ đến + từ khóa, đổi tháng', () => {
    const r = parseQuery('còn tháng 9 thì sao', { now: NOW, session });
    assert.strictEqual(r.isFollowUp, true);
    assert.strictEqual(r.filters.direction, 'den');
    assert.strictEqual(r.filters.dateFrom, '2026-09-01');
    assert.deepStrictEqual(r.keywords, ['dat']);
  });
  await test('"con van ban di thi sao" đổi sổ, giữ thời gian', () => {
    const r = parseQuery('con van ban di thi sao', { now: NOW, session });
    assert.strictEqual(r.filters.direction, 'di');
    assert.strictEqual(r.filters.dateFrom, '2026-10-01');
  });

  console.log('[Office] Tìm kiếm');
  await loadFixtures();
  const find = async (q) => search(parseQuery(q, { now: NOW }), {});
  await test('tìm đúng số ký hiệu', async () => {
    const r = await find('866-CV/TU');
    assert.strictEqual(r.total, 1);
    assert.strictEqual(r.matches[0].source_id, '90000002');
  });
  await test('ký hiệu gõ khác cơ quan => gợi ý gần giống', async () => {
    const r = await find('866-CV/VPTU');
    assert.strictEqual(r.total, 0);
    assert.strictEqual(r.related[0].so_ky_hieu, '866-CV/TU');
  });
  await test('số trần không khớp thì không trả về mọi văn bản', async () => {
    const r = await find('9');
    assert.strictEqual(r.total, 0);
    assert.strictEqual(r.related.length, 0);
  });
  await test('văn bản đến tháng 10 lọc theo ngày nhận', async () => {
    const r = await find('văn bản đến tháng 10');
    assert.strictEqual(r.total, 3);
    assert.ok(r.matches.every((d) => d.direction === 'den'));
  });
  await test('nội dung không dấu + chịu lỗi cụm', async () => {
    assert.strictEqual((await find('cong van ve nha dat doi du')).matches[0].source_id, '90000002');
    assert.strictEqual((await find('phong chong tham nhung')).total, 2);
  });
  await test('lọc theo người ký', async () => {
    const r = await find('do đồng chí Hải ký');
    assert.strictEqual(r.total, 2);
    assert.ok(r.matches.every((d) => /Hải/.test(d.nguoi_ky)));
  });
  await test('đếm theo thể loại', async () => {
    const r = await search(parseQuery('bao nhiêu văn bản đi tháng 10', { now: NOW }), {});
    assert.strictEqual(r.total, 3);
    assert.strictEqual(r.counts.byDirection.di, 3);
  });

  console.log('[Office] Lớp AI (kiểm tra đầu ra, không gọi mạng)');
  await test('chặn giá trị ngoài danh sách trắng', () => {
    const v = validateAiOutput({ pham_vi: true, huong: 'xoa', the_loai: 'DROP TABLE', so_ky_hieu: "1'; --", tu_ngay: '2026-13-40', so: -5, tu_khoa: 'tham nhũng' });
    assert.strictEqual(v.direction, null);
    assert.strictEqual(v.theLoai, null);
    assert.strictEqual(v.soKyHieu, null);
    assert.strictEqual(v.dateFrom, null);
    assert.strictEqual(v.number, null);
    assert.deepStrictEqual(toParsed(v).keywords, ['tham', 'nhung']);
  });
  await test('đọc JSON trong khối code và bỏ danh xưng người ký', () => {
    const raw = extractJson('```json\n{"pham_vi":true,"nguoi_ky":"ông Cường","tu_khoa":"ông Cường ký"}\n```');
    const p = toParsed(validateAiOutput(raw));
    assert.strictEqual(p.filters.nguoiKy, 'cuong');
    assert.ok(!p.keywords.includes('cuong'));
  });
  await test('ngoài phạm vi', () => {
    assert.strictEqual(validateAiOutput({ pham_vi: false }).inScope, false);
  });

  console.log('[Office] Bộ điều phối + Zalo');
  await loadFixtures();
  const ask = (text, sessionId = 'zalo-test') => office.handleOfficeMessage({ text, sessionId, now: NOW });
  await test('hỏi -> chọn số -> xem thêm -> hỏi tiếp', async () => {
    const a = await ask('văn bản đến tháng 10');
    assert.strictEqual(a.meta.subIntent, 'search');
    assert.ok(/Văn thư Văn phòng Đảng ủy xã Thạnh Phú/.test(a.answer));
    assert.ok(/Mã: 9000000\d/.test(a.answer));
    const b = await ask('2');
    assert.strictEqual(b.meta.subIntent, 'detail');
    assert.ok(!/Ý kiến/i.test(b.answer), 'chi tiết Zalo không được có ý kiến chuyển/chỉ đạo');
    assert.strictEqual((await ask('xem thêm')).meta.subIntent, 'more_end');
    const c = await ask('còn văn bản đi thì sao');
    assert.ok(/văn bản đi/.test(c.answer));
    assert.strictEqual((await ask('9')).meta.subIntent, 'detail_out_of_range');
    assert.strictEqual((await ask('/moi')).meta.subIntent, 'reset');
  });
  await test('đếm rồi "danh sách"', async () => {
    assert.strictEqual((await ask('bao nhiêu quyết định năm nay', 's2')).meta.subIntent, 'count');
    const l = await ask('danh sách', 's2');
    assert.strictEqual(l.meta.subIntent, 'more');
    assert.ok(/1229-QĐ\/TU/.test(l.answer));
  });
  await test('Zalo: chưa có quyền -> hướng dẫn; mã đúng -> tra cứu; mã dùng lại bị từ chối', async () => {
    const z = (text, zaloId = 'Z-1') => routeMessage({ text, chatId: 'c', zaloId, senderName: 'Test' });
    assert.strictEqual((await z('cv 253')).intent, 'office_unregistered');
    const { code } = await store.createActivationCode({ staffLabel: 'Cán bộ thử nghiệm' });
    assert.strictEqual((await z(`/dangky ${code.toLowerCase()}`)).intent, 'office_activation');
    assert.strictEqual((await z('cv 253')).intent, 'office_lookup');
    assert.ok(/không đúng|đã dùng/.test((await z(`/dangky ${code}`, 'Z-2')).reply));
  });
  await test('Zalo: nhập sai mã quá 5 lần bị khóa', async () => {
    const z = (text) => routeMessage({ text, chatId: 'c', zaloId: 'Z-bad', senderName: 'X' });
    for (let i = 0; i < 5; i++) await z('/dangky ZZZZ-ZZZZ');
    assert.ok(/quá nhiều lần/.test((await z('/dangky ZZZZ-ZZZZ')).reply));
  });

  console.log(`\n[Office] ${passed} kiểm thử đạt${process.exitCode ? ', CÓ LỖI' : ''}.`);
}

main().then(() => process.exit(process.exitCode || 0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
