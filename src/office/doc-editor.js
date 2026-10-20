/**
 * Kiểm tra dữ liệu thêm / sửa tay một văn bản trong sổ (trang Quản lý văn bản, chỉ admin).
 * Đầu vào là JSON từ trình duyệt (không tin cậy): chỉ nhận các trường trong danh sách trắng,
 * cắt độ dài theo đúng giới hạn cột DB, chuẩn hóa ngày về YYYY-MM-DD.
 *
 * Quy ước đồng bộ với file Excel:
 *  - Văn bản sửa tay có row_hash = NULL, nên lần nhập Excel sau (nếu file có cùng Mã) sẽ ghi đè
 *    bằng dữ liệu của phần mềm quản lý văn bản (Excel là nguồn chuẩn).
 *  - Văn bản thêm tay không nhập Mã sẽ được cấp mã "TAY-xxxxxxxx", không bao giờ trùng với file Excel.
 */

const crypto = require('crypto');
const { cleanCell } = require('./normalize');
const { parseDate, buildSearchNorm } = require('./importer');

const SOURCE_ID_RE = /^[A-Za-z0-9_-]{1,50}$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MAX_FILES = 50;

/** Trường chữ dùng chung cho cả 2 sổ: [tên trường, độ dài tối đa] */
const COMMON_TEXT = [
  ['so_ky_hieu', 100], ['trich_yeu', 2000], ['so_van_ban', 255], ['the_loai', 100],
  ['do_khan', 50], ['nguoi_ky', 255],
];
/** Trường riêng theo sổ; trường của sổ kia luôn bị đặt NULL */
const DEN_TEXT = [['nguoi_gui', 255], ['y_kien_chuyen', 2000], ['y_kien_chi_dao', 2000]];
const DI_TEXT = [['nguoi_trinh', 255], ['noi_nhan', 2000]];
const DEN_DATES = ['thoi_gian_nhan', 'han_xu_ly'];
const COMMON_INTS = ['so_trang', 'so_ban'];

const LABELS = {
  direction: 'Loại sổ', source_id: 'Mã văn bản', so_ky_hieu: 'Số, ký hiệu', trich_yeu: 'Trích yếu',
  ngay_van_ban: 'Ngày văn bản', thoi_gian_nhan: 'Ngày đến', han_xu_ly: 'Hạn xử lý',
  so_trang: 'Số trang', so_ban: 'Số bản', so_dang_ky: 'Số đăng ký', file_names: 'File lưu',
};

function text(value, max) {
  const s = cleanCell(typeof value === 'string' || typeof value === 'number' ? value : '').replace(/\s+\n/g, '\n');
  return s ? s.slice(0, max) : null;
}

/** Nhận "YYYY-MM-DD" (ô date của trình duyệt) hoặc "dd/mm/yyyy". Trả về { value } hoặc { error } */
function dateField(value) {
  if (value === null || value === undefined || value === '') return { value: null };
  if (typeof value !== 'string') return { error: true };
  const m = ISO_DATE.exec(value.trim());
  const iso = m ? parseDate(`${m[3]}/${m[2]}/${m[1]}`) : parseDate(value.trim());
  return iso ? { value: iso } : { error: true };
}

function intField(value) {
  if (value === null || value === undefined || value === '') return { value: null };
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 100000) return { error: true };
  return { value: n };
}

/** Danh sách file: mảng chuỗi hoặc chuỗi nhiều dòng */
function fileList(value) {
  const raw = Array.isArray(value) ? value : String(value || '').split(/\r?\n/);
  return [...new Set(raw.map((f) => text(f, 255)).filter(Boolean))].slice(0, MAX_FILES);
}

function generateSourceId() {
  return `TAY-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

/**
 * @param {object} body dữ liệu từ form
 * @param {{ existing?: object }} opts existing: bản ghi đang sửa (không đổi được Loại sổ và Mã văn bản)
 * @returns {{ ok: boolean, errors: Record<string,string>, record?: object }}
 */
function validateDocInput(body, { existing = null } = {}) {
  const input = body && typeof body === 'object' ? body : {};
  const errors = {};
  const rec = {};

  // Loại sổ + Mã văn bản: cố định khi sửa (khóa trùng của sổ là direction + source_id)
  if (existing) {
    rec.direction = existing.direction;
    rec.source_id = existing.source_id;
  } else {
    rec.direction = input.direction === 'den' || input.direction === 'di' ? input.direction : null;
    if (!rec.direction) errors.direction = 'Chọn sổ văn bản đến hoặc đi.';
    const sid = text(input.source_id, 60);
    if (sid && !SOURCE_ID_RE.test(sid)) errors.source_id = 'Mã chỉ gồm chữ không dấu, số, "-" hoặc "_" (tối đa 50 ký tự).';
    rec.source_id = sid || generateSourceId();
  }

  for (const [f, max] of COMMON_TEXT) rec[f] = text(input[f], max);
  if (!rec.so_ky_hieu) errors.so_ky_hieu = 'Nhập số, ký hiệu văn bản.';
  if (!rec.trich_yeu) errors.trich_yeu = 'Nhập trích yếu nội dung.';

  const docDate = dateField(input.ngay_van_ban);
  if (docDate.error) errors.ngay_van_ban = 'Ngày văn bản không hợp lệ.';
  else if (!docDate.value) errors.ngay_van_ban = 'Nhập ngày văn bản.';
  rec.ngay_van_ban = docDate.value || null;

  const isDen = rec.direction === 'den';
  for (const [f, max] of DEN_TEXT) rec[f] = isDen ? text(input[f], max) : null;
  for (const [f, max] of DI_TEXT) rec[f] = rec.direction === 'di' ? text(input[f], max) : null;
  for (const f of DEN_DATES) {
    const d = isDen ? dateField(input[f]) : { value: null };
    if (d.error) errors[f] = `${LABELS[f]} không hợp lệ.`;
    rec[f] = d.value || null;
  }
  if (rec.thoi_gian_nhan && rec.ngay_van_ban && rec.thoi_gian_nhan < rec.ngay_van_ban) {
    errors.thoi_gian_nhan = 'Ngày đến không được trước ngày văn bản.';
  }

  for (const f of [...COMMON_INTS, 'so_dang_ky']) {
    const n = f === 'so_dang_ky' && rec.direction !== 'di' ? { value: null } : intField(input[f]);
    if (n.error) errors[f] = `${LABELS[f]} phải là số nguyên không âm.`;
    rec[f] = n.value ?? null;
  }

  rec.file_names = fileList(input.file_names);
  // Hệ thống chỉ lưu văn bản Thường; sổ đi chỉ lưu văn bản đã phát hành (giống quy tắc nhập Excel)
  rec.do_mat = 'Thường';
  rec.trang_thai_phat_hanh = rec.direction === 'di' ? 'Đã phát hành' : null;

  if (Object.keys(errors).length) return { ok: false, errors };
  rec.search_norm = buildSearchNorm(rec);
  rec.row_hash = null;
  return { ok: true, errors, record: rec };
}

module.exports = { validateDocInput, generateSourceId, LABELS };
