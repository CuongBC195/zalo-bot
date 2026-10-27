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

  console.log('[Office] Lọc theo cột + Xuất Excel');
  const { readColumnFilters } = require('../src/office/column-filters');
  const routes = require('../src/admin/office-routes');
  const XLSX = require('xlsx');
  const list = (query) => store.listDocuments({ columnFilters: readColumnFilters(query), limit: 100 });
  await test('đọc bộ lọc cột: bỏ khóa lạ, ngày sai, cắt chuỗi dài', () => {
    const cf = readColumnFilters({ trichYeu: '  nhà đất ', docDateFrom: '2026-13', hack: 'x', nguoiKy: 'a'.repeat(500) });
    assert.deepStrictEqual(Object.keys(cf).sort(), ['nguoiKy', 'trichYeu']);
    assert.strictEqual(cf.trichYeu, 'nhà đất');
    assert.strictEqual(cf.nguoiKy.length, 100);
  });
  await test('chứa chuỗi không phân biệt hoa thường và dấu (kể cả đ)', async () => {
    assert.deepStrictEqual((await list({ trichYeu: 'NHA DAT' })).items.map((d) => d.so_ky_hieu), ['866-CV/TU']);
    assert.deepStrictEqual((await list({ soKyHieu: 'qd/tu' })).items.map((d) => d.so_ky_hieu), ['1229-QĐ/TU']);
    assert.strictEqual((await list({ nguoiKy: 'tran thi binh' })).total, 1);
    assert.strictEqual((await list({ trichYeu: '%' })).total, 0, 'ký tự % phải được hiểu là chữ, không phải ký tự đại diện');
  });
  await test('người gửi / trình khớp một trong hai cột', async () => {
    const r = await list({ nguoiGui: 'dang thi giang' });
    assert.ok(r.total >= 1 && r.items.every((d) => /Giang/.test(d.nguoi_trinh || '')));
  });
  await test('chọn đúng giá trị + khoảng ngày theo từng cột', async () => {
    assert.deepStrictEqual((await list({ doKhan: 'Khẩn' })).items.map((d) => d.so_ky_hieu), ['866-CV/TU']);
    assert.deepStrictEqual((await list({ deadlineFrom: '2026-10-30', deadlineTo: '2026-10-30' })).items.map((d) => d.so_ky_hieu), ['1229-QĐ/TU']);
    const r = await list({ receivedFrom: '2026-10-01' });
    assert.ok(r.total === 3 && r.items.every((d) => d.direction === 'den'));
    assert.strictEqual((await list({ trangThai: 'Đã phát hành', docDateFrom: '2026-01-01' })).items.every((d) => d.direction === 'di'), true);
  });
  await test('tìm tự do + lọc cột cùng lúc', async () => {
    const f = routes._readFilters({ q: 'văn bản tháng 10', doKhan: 'Khẩn' });
    const r = await routes._queryDocuments(f);
    assert.strictEqual(r.mode, 'search');
    assert.ok(r.items.length >= 1 && r.items.every((d) => d.do_khan === 'Khẩn'));
  });
  await test('danh sách giá trị cho ô chọn', async () => {
    const o = await store.getFilterOptions();
    assert.ok(o.books.some((b) => b.name === 'Sổ Văn bản đến Văn phòng 2026'));
    assert.ok(o.statuses.some((s) => s.name === 'Đã phát hành'));
  });
  await test('xuất Excel đúng tập đang lọc, không có ý kiến chuyển/chỉ đạo', async () => {
    const f = routes._readFilters({ direction: 'den' });
    const r = await routes._queryDocuments(f, { all: true });
    const wb = XLSX.read(routes._buildExportWorkbook(r.items, f), { type: 'buffer' });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
    assert.ok(/SỔ VĂN BẢN ĐẾN - VĂN PHÒNG ĐẢNG ỦY XÃ THẠNH PHÚ/.test(rows[0][0]));
    assert.strictEqual(rows[4][15], 'Mã văn bản');
    assert.strictEqual(rows.length - 5, 4);
    const text = JSON.stringify(rows);
    assert.ok(!/Ý kiến|VP n\/c tham mưu/.test(text), 'file xuất không được chứa ý kiến chuyển/chỉ đạo');
  });

  console.log('[Office] Thêm / sửa / xóa văn bản (admin)');
  const { validateDocInput } = require('../src/office/doc-editor');
  const admin = { id: 1, username: 'admin', fullName: 'Quản trị thử' };
  const findBy = async (query) => (await list(query)).items;
  await test('kiểm tra dữ liệu: bắt buộc, ngày sai, mã sai; bỏ trường của sổ kia', () => {
    const bad = validateDocInput({ direction: 'xoa', source_id: "1'; DROP", ngay_van_ban: '2026-02-31' });
    assert.strictEqual(bad.ok, false);
    assert.deepStrictEqual(Object.keys(bad.errors).sort(), ['direction', 'ngay_van_ban', 'so_ky_hieu', 'source_id', 'trich_yeu']);
    const ok = validateDocInput({
      direction: 'di', so_ky_hieu: ' 300-CV/ĐU ', trich_yeu: 'Về việc thử nghiệm', ngay_van_ban: '2026-10-19',
      nguoi_gui: 'không thuộc sổ đi', y_kien_chuyen: 'nội bộ', so_trang: '3', file_names: 'a.pdf\n\na.pdf\nb.docx', do_mat: 'Mật',
    });
    assert.strictEqual(ok.ok, true);
    const r = ok.record;
    assert.ok(/^TAY-[0-9A-F]{8}$/.test(r.source_id));
    assert.strictEqual(r.so_ky_hieu, '300-CV/ĐU');
    assert.strictEqual(r.nguoi_gui, null);
    assert.strictEqual(r.y_kien_chuyen, null);
    assert.strictEqual(r.so_trang, 3);
    assert.deepStrictEqual(r.file_names, ['a.pdf', 'b.docx']);
    assert.strictEqual(r.do_mat, 'Thường');
    assert.strictEqual(r.trang_thai_phat_hanh, 'Đã phát hành');
    assert.strictEqual(r.row_hash, null);
  });
  await test('thêm tay: tìm được ngay, trùng Mã thì báo lỗi', async () => {
    const rec = validateDocInput({ direction: 'den', source_id: 'TAY-TEST1', so_ky_hieu: '77-TB/HU', trich_yeu: 'Thông báo lịch tiếp công dân', ngay_van_ban: '19/10/2026', thoi_gian_nhan: '2026-10-20' }).record;
    const id = await store.createDocument(rec, admin);
    const [doc] = await store.getDocumentsByIds([id]);
    assert.strictEqual(doc.edited_by_name, 'Quản trị thử');
    assert.ok(doc.edited_at);
    assert.deepStrictEqual((await findBy({ keyword: 'tiep cong dan' })).map((d) => d.source_id), ['TAY-TEST1']);
    await assert.rejects(store.createDocument(rec, admin), store.DuplicateDocumentError);
  });
  await test('ô tìm chung khớp số ký hiệu (có "/"), mã văn bản, người ký', async () => {
    assert.deepStrictEqual((await findBy({ keyword: '866-CV/TU' })).map((d) => d.source_id), ['90000002']);
    assert.deepStrictEqual((await findBy({ keyword: '90000002' })).map((d) => d.so_ky_hieu), ['866-CV/TU']);
    assert.ok((await findBy({ keyword: 'tran thi binh' })).length >= 1);
  });
  await test('sửa tay: đổi nội dung, không đổi được loại sổ và mã', async () => {
    const [row] = await findBy({ sourceId: '90000002' });
    const [orig] = await store.getDocumentsByIds([row.id]);
    assert.ok(orig.file_names.length > 0);
    const v = validateDocInput({ ...orig, direction: 'di', source_id: 'KHAC', trich_yeu: 'Trích yếu đã chỉnh sửa tay' }, { existing: orig });
    assert.strictEqual(v.ok, true);
    assert.strictEqual(await store.updateDocument(orig.id, v.record, admin), true);
    const [doc] = await store.getDocumentsByIds([orig.id]);
    assert.strictEqual(doc.direction, 'den');
    assert.strictEqual(doc.source_id, '90000002');
    assert.strictEqual(doc.trich_yeu, 'Trích yếu đã chỉnh sửa tay');
    assert.strictEqual(doc.edited_by_name, 'Quản trị thử');
    assert.strictEqual((await findBy({ keyword: 'chinh sua tay' })).length, 1);
    assert.strictEqual(await store.updateDocument(999999, v.record, admin), false);
  });
  await test('nhập lại Excel ghi đè bản sửa tay cùng Mã, giữ văn bản thêm tay', async () => {
    const parsed = parseRegisterWorkbook(fixture('so-van-ban-den.xls'));
    const sum = await store.saveImport({ parsed, fileName: 'so-van-ban-den.xls', user: admin });
    assert.strictEqual(sum.updated, 1, 'chỉ văn bản sửa tay bị coi là thay đổi');
    const [doc] = await findBy({ sourceId: '90000002' });
    assert.notStrictEqual(doc.trich_yeu, 'Trích yếu đã chỉnh sửa tay');
    assert.strictEqual(doc.edited_by_name, null);
    assert.strictEqual((await findBy({ sourceId: 'TAY-TEST1' })).length, 1);
  });
  await test('xóa văn bản; xóa lần hai trả về không tìm thấy', async () => {
    const [doc] = await findBy({ sourceId: 'TAY-TEST1' });
    const removed = await store.deleteDocument(doc.id);
    assert.strictEqual(removed.source_id, 'TAY-TEST1');
    assert.strictEqual((await findBy({ sourceId: 'TAY-TEST1' })).length, 0);
    assert.strictEqual(await store.deleteDocument(doc.id), null);
  });

  console.log('[Office] Tổng quan + lọc nguồn + sửa/xóa mã và tài khoản Zalo (admin)');
  await loadFixtures();
  await test('tổng quan: tổng sổ, 12 tháng, thể loại, văn bản mới, 14 ngày tra cứu', async () => {
    const d = await store.getDashboard({ now: NOW });
    assert.strictEqual(d.today, '2026-10-20');
    assert.strictEqual(d.totals.den, 4);
    assert.strictEqual(d.totals.di, 4);
    assert.strictEqual(d.months.length, 12);
    assert.strictEqual(d.months[11].month, '2026-10');
    assert.strictEqual(d.months[0].month, '2025-11');
    assert.strictEqual(d.months[11].den + d.months[11].di, d.totals.month);
    assert.strictEqual(d.types.reduce((s, t) => s + t.count, 0), 8);
    assert.strictEqual(d.recent.length, 6);
    const days = d.recent.map((r) => r.ngay);
    assert.deepStrictEqual(days, [...days].sort().reverse(), 'văn bản mới xếp ngày giảm dần');
    assert.ok(d.recent.every((r) => !('y_kien_chuyen' in r) && !('y_kien_chi_dao' in r)));
    assert.strictEqual(d.lookups.length, 14);
    assert.strictEqual(d.lookups[13].day, '2026-10-20');
    assert.ok(d.deadlines.every((r) => r.han_xu_ly >= '2026-10-20'));
  });
  await test('lọc nguồn: sửa tay / từ file Excel; giá trị lạ bị bỏ', async () => {
    assert.strictEqual(readColumnFilters({ nguon: 'hack' }).nguon, undefined);
    const rec = validateDocInput({ direction: 'di', so_ky_hieu: '88-TB/ĐU', trich_yeu: 'Thông báo thêm tay', ngay_van_ban: '2026-10-19' }).record;
    await store.createDocument(rec, admin);
    assert.deepStrictEqual((await findBy({ nguon: 'tay' })).map((d) => d.so_ky_hieu), ['88-TB/ĐU']);
    assert.strictEqual((await findBy({ nguon: 'excel' })).length, 8);
    assert.strictEqual((await store.getDashboard({ now: NOW })).totals.manual, 1);
  });
  await test('mã kích hoạt: sửa tên cán bộ, xóa; xóa lần hai trả về không tìm thấy', async () => {
    const created = await store.createActivationCode({ staffLabel: 'Tên cũ' });
    assert.strictEqual(await store.updateActivationCodeLabel(created.id, 'Nguyễn Văn Mới - Chuyên viên'), true);
    const row = (await store.listActivationCodes()).find((c) => c.id === created.id);
    assert.strictEqual(row.staff_label, 'Nguyễn Văn Mới - Chuyên viên');
    assert.strictEqual(await store.updateActivationCodeLabel(999999, 'x'), false);
    assert.strictEqual((await store.deleteActivationCode(created.id)).staff_label, 'Nguyễn Văn Mới - Chuyên viên');
    assert.ok(!(await store.listActivationCodes()).some((c) => c.id === created.id));
    assert.strictEqual(await store.deleteActivationCode(created.id), null);
    assert.strictEqual((await store.redeemActivationCode(created.code, 'Z-del', 'X')).ok, false, 'mã đã xóa không dùng được');
  });
  await test('tài khoản Zalo: sửa tên cán bộ + thu quyền, xóa tài khoản', async () => {
    await store.setOfficePermission('Z-9', true, { staffLabel: 'Cán bộ A', displayName: 'Zalo A' });
    assert.strictEqual(await store.canLookupOffice('Z-9'), true);
    const u = await store.updateZaloUser('Z-9', { staffLabel: 'Cán bộ B - Phó Văn phòng', canLookup: false });
    assert.strictEqual(u.staff_label, 'Cán bộ B - Phó Văn phòng');
    assert.strictEqual(u.can_lookup_office, false);
    assert.strictEqual(await store.canLookupOffice('Z-9'), false);
    assert.strictEqual((await store.updateZaloUser('Z-9', { canLookup: true })).staff_label, 'Cán bộ B - Phó Văn phòng', 'trường không gửi giữ nguyên');
    assert.strictEqual(await store.updateZaloUser('Z-404', { staffLabel: 'x' }), null);
    assert.strictEqual((await store.deleteZaloUser('Z-9')).zalo_id, 'Z-9');
    assert.strictEqual(await store.canLookupOffice('Z-9'), false);
    assert.strictEqual(await store.deleteZaloUser('Z-9'), null);
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
  await test('tìm theo cụm: âm tiết rải rác không tính là khớp', async () => {
    const noise = validateDocInput({
      direction: 'di', so_ky_hieu: '999-CV/ĐU', ngay_van_ban: '2025-03-10',
      trich_yeu: 'Về việc tham mưu bố trí phòng làm việc, chống ngập, những kinh phí làng nghề',
    }).record;
    await store.createDocument(noise, admin);
    const r = await search(parseQuery('phòng chống tham nhũng lãng phí', { now: NOW }), {});
    assert.deepStrictEqual(r.matches.map((d) => d.so_ky_hieu).sort(), ['1229-QĐ/TU', '75-BC/ĐU']);
  });
  await test('nhắn thêm điều kiện là tự lọc tiếp, không cần hỏi lại', async () => {
    await ask('phòng chống tham nhũng', 's3');
    const a = await ask('văn bản đến', 's3');
    assert.ok(/Tìm thấy 1 văn bản đến, nội dung "phòng chống tham nhũng"/.test(a.answer), a.answer);
    assert.ok(/1229-QĐ\/TU/.test(a.answer));
    await ask('phòng chống tham nhũng', 's4');
    assert.strictEqual((await ask('tháng 10', 's4')).meta.total, 2);
    const c = await ask('năm 2025', 's4');
    assert.strictEqual(c.meta.subIntent, 'not_found', 'ngày trần không ra thì báo không có, không liệt kê cả năm');
    assert.ok(/phòng chống tham nhũng/.test(c.answer));
  });
  await test('lọc tiếp ra 0 mà câu tự đứng được thì tìm mới', async () => {
    await ask('nhà đất dôi dư', 's5');
    const r = await ask('văn bản đi tháng 10', 's5');
    assert.strictEqual(r.meta.total, 3);
    assert.ok(!/nội dung/.test(r.answer.split('\n')[0]));
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

  if (!PG_URL) {
    console.log('[Hệ thống] Mất kết nối DB + schema + keepalive');
    await test('Vercel mất DB: báo gián đoạn, không trả lời sai "chưa đăng ký"', async () => {
      const { handleZaloUpdate } = require('../src/zalo/handler');
      const sent = [];
      const api = { sendMessage: async (chatId, text) => { sent.push(text); } };
      process.env.DB_REQUIRED = 'true';
      try {
        const r = await handleZaloUpdate(api, { message: { message_id: 'busy-1', text: 'cv 253', from: { id: 'Z-busy' }, chat: { id: 'c' } } });
        assert.strictEqual(r.intent, 'db_unavailable');
        assert.ok(/gián đoạn/.test(sent[0]));
      } finally {
        delete process.env.DB_REQUIRED;
      }
    });
    await test('schema chỉ chạy lại khi file đổi hoặc force; khởi động đồng thời không chạy trùng', async () => {
      const orig = { pool: db.pool, check: db.checkConnection };
      let stored = null;
      let schemaRuns = 0;
      let lock = Promise.resolve();
      const query = async (sql, params) => {
        if (/SELECT value FROM app_meta/.test(sql)) return { rows: stored ? [{ value: stored }] : [] };
        if (/INSERT INTO app_meta/.test(sql)) stored = params[0];
        if (/CREATE TABLE IF NOT EXISTS office_documents/.test(sql)) {
          schemaRuns++;
          await new Promise((r) => setTimeout(r, 5));
        }
        return { rows: [] };
      };
      db.checkConnection = async () => true;
      db.pool = {
        query,
        connect: async () => {
          let unlock = null;
          return {
            query: async (sql, params) => {
              if (/pg_advisory_xact_lock/.test(sql)) {
                const prev = lock;
                lock = new Promise((r) => { unlock = r; });
                await prev;
                return { rows: [] };
              }
              if (/^(COMMIT|ROLLBACK)$/.test(sql) && unlock) unlock();
              return query(sql, params);
            },
            release: () => {},
          };
        },
      };
      try {
        await Promise.all([db.initSchema(), db.initSchema()]);
        assert.strictEqual(schemaRuns, 1, 'hai instance cùng lúc chỉ được chạy schema một lần');
        await db.initSchema();
        assert.strictEqual(schemaRuns, 1, 'lần sau không được chạy lại schema');
        await db.initSchema({ force: true });
        assert.strictEqual(schemaRuns, 2);
        stored = 'hash-cu';
        await db.initSchema();
        assert.strictEqual(schemaRuns, 3, 'schema đổi thì phải chạy lại');
      } finally {
        db.pool = orig.pool;
        db.checkConnection = orig.check;
      }
    });
    await test('keepalive: sai CRON_SECRET bị chặn', async () => {
      const app = require('../src/admin/server');
      const server = app.listen(0);
      const url = `http://127.0.0.1:${server.address().port}/api/cron/keepalive`;
      process.env.CRON_SECRET = 'test-secret-1234567890';
      try {
        assert.strictEqual((await fetch(url)).status, 401);
        assert.strictEqual((await fetch(url, { headers: { Authorization: 'Bearer sai' } })).status, 401);
        const ok = await fetch(url, { headers: { Authorization: 'Bearer test-secret-1234567890' } });
        assert.strictEqual(ok.status, 503, 'đúng secret nhưng DB thử nghiệm không kết nối được');
      } finally {
        delete process.env.CRON_SECRET;
        server.close();
      }
    });
  }

  console.log(`\n[Office] ${passed} kiểm thử đạt${process.exitCode ? ', CÓ LỖI' : ''}.`);
}

main().then(() => process.exit(process.exitCode || 0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
