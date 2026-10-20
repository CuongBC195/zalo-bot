/**
 * Đọc file Excel "Báo cáo danh sách văn bản" (đến / đi) xuất từ phần mềm quản lý văn bản.
 * - Tự dò dòng tiêu đề (dòng có ô "STT") và ánh xạ cột THEO TÊN (2 loại sổ xếp cột khác nhau).
 * - Tự nhận biết sổ đến / sổ đi qua các cột đặc trưng.
 * - Chỉ nhận văn bản Độ mật = "Thường"; văn bản đi chỉ nhận "Đã phát hành".
 */

const crypto = require('crypto');
const XLSX = require('xlsx');
const { normText, cleanCell } = require('./normalize');
const { expandIssuer } = require('./vocab');

const MAX_FILE_BYTES = 8 * 1024 * 1024;

/** Tên cột (đã normText) -> trường dữ liệu */
const HEADER_MAP = {
  'id': 'source_id',
  'so ky hieu van ban': 'so_ky_hieu',
  'trich yeu noi dung van ban': 'trich_yeu',
  'so van ban': 'so_van_ban',
  'the loai van ban': 'the_loai',
  'do khan': 'do_khan',
  'do mat': 'do_mat',
  'nguoi gui': 'nguoi_gui',
  'nguoi trinh': 'nguoi_trinh',
  'nguoi ky': 'nguoi_ky',
  'y kien chuyen': 'y_kien_chuyen',
  'y kien chi dao': 'y_kien_chi_dao',
  'noi nhan': 'noi_nhan',
  'trang thai phat hanh': 'trang_thai_phat_hanh',
  'ngay van ban': 'ngay_van_ban',
  'thoi gian nhan': 'thoi_gian_nhan',
  'han xu ly': 'han_xu_ly',
  'so trang': 'so_trang',
  'so ban': 'so_ban',
  'so dang ky': 'so_dang_ky',
  'file van ban': 'file_names',
};

const REQUIRED_FIELDS = ['source_id', 'so_ky_hieu', 'trich_yeu', 'ngay_van_ban'];
const DATE_FIELDS = ['ngay_van_ban', 'thoi_gian_nhan', 'han_xu_ly'];
const INT_FIELDS = ['so_trang', 'so_ban', 'so_dang_ky'];

/** Các trường dùng để tính row_hash (phát hiện thay đổi khi nhập lại) */
const HASH_FIELDS = [
  'so_ky_hieu', 'so_dang_ky', 'trich_yeu', 'so_van_ban', 'the_loai', 'do_khan', 'do_mat', 'nguoi_gui',
  'nguoi_trinh', 'nguoi_ky', 'y_kien_chuyen', 'y_kien_chi_dao', 'noi_nhan', 'trang_thai_phat_hanh',
  'ngay_van_ban', 'thoi_gian_nhan', 'han_xu_ly', 'so_trang', 'so_ban', 'file_names',
];

class ImportError extends Error {}

function headerKey(text) {
  return normText(text).replace(/[,/\-]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Nhận "dd/mm/yyyy", "dd/mm/yyyy hh:mm", "dd-mm-yyyy", số serial Excel hoặc Date. Trả về "YYYY-MM-DD" | null */
function parseDate(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return toIso(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const d = XLSX.SSF.parse_date_code(value);
    return d ? toIso(d.y, d.m, d.d) : null;
  }
  const m = String(value).trim().match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})/);
  if (!m) return null;
  return toIso(Number(m[3]), Number(m[2]), Number(m[1]));
}

function toIso(y, mo, d) {
  if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1) return null; // vd 31/02
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function parseIntOrNull(value) {
  const s = cleanCell(value);
  if (!s) return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

/** "1. a.pdf\n2. b.docx" -> ["a.pdf", "b.docx"] */
function parseFileNames(value) {
  return cleanCell(value)
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*\d+\s*[.)]\s*/, '').trim())
    .filter(Boolean);
}

function detectDirection(fields) {
  const has = (f) => fields.includes(f);
  const denSignals = ['thoi_gian_nhan', 'nguoi_gui', 'y_kien_chuyen', 'han_xu_ly'].filter(has).length;
  const diSignals = ['trang_thai_phat_hanh', 'so_dang_ky', 'noi_nhan', 'nguoi_trinh'].filter(has).length;
  if (denSignals > diSignals) return 'den';
  if (diSignals > denSignals) return 'di';
  return null;
}

function buildSearchNorm(rec) {
  return normText([
    rec.so_ky_hieu,
    rec.trich_yeu,
    rec.the_loai,
    rec.nguoi_ky,
    rec.nguoi_gui,
    rec.nguoi_trinh,
    rec.noi_nhan,
    expandIssuer(rec.so_ky_hieu),
  ].filter(Boolean).join(' '));
}

function hashRecord(rec) {
  const payload = HASH_FIELDS.map((f) => (Array.isArray(rec[f]) ? rec[f].join('|') : rec[f] ?? '')).join('\u241f');
  return crypto.createHash('sha256').update(payload).digest('hex');
}

/**
 * Phân tích workbook.
 * @param {Buffer} buffer Nội dung file .xls/.xlsx
 * @param {{ direction?: 'auto'|'den'|'di' }} options
 */
function parseRegisterWorkbook(buffer, { direction = 'auto' } = {}) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new ImportError('File rỗng hoặc không hợp lệ.');
  if (buffer.length > MAX_FILE_BYTES) throw new ImportError('File vượt quá 8MB.');

  let wb;
  try {
    wb = XLSX.read(buffer, { type: 'buffer', cellFormula: false, cellHTML: false, cellStyles: false, dense: true });
  } catch (err) {
    throw new ImportError('Không đọc được file Excel. Vui lòng dùng đúng file .xls/.xlsx xuất từ phần mềm quản lý văn bản.');
  }
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new ImportError('File không có trang tính nào.');
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '', blankrows: true });

  // 1. Dò dòng tiêu đề và "Ngày chốt dữ liệu báo cáo"
  let headerIdx = -1;
  let reportDate = null;
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const cells = rows[i].map(cleanCell);
    for (const c of cells) {
      const m = c.match(/ng[aà]y\s*ch[oố]t\s*d[uữ]\s*li[eệ]u[^0-9]*(\d{1,2}\/\d{1,2}\/\d{4})/i);
      if (m) reportDate = parseDate(m[1]);
    }
    if (cells.some((c) => headerKey(c) === 'stt') && cells.some((c) => headerKey(c) === 'id')) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) throw new ImportError('Không tìm thấy dòng tiêu đề (cần có cột "STT" và "ID").');

  // 2. Ánh xạ cột theo tên
  const colMap = {};
  rows[headerIdx].forEach((cell, idx) => {
    const field = HEADER_MAP[headerKey(cleanCell(cell))];
    if (field && colMap[field] === undefined) colMap[field] = idx;
  });
  const fields = Object.keys(colMap);
  const missing = REQUIRED_FIELDS.filter((f) => !fields.includes(f));
  if (missing.length) {
    throw new ImportError(`File thiếu cột bắt buộc: ${missing.join(', ')}.`);
  }

  // 3. Nhận biết sổ đến / sổ đi
  const detected = detectDirection(fields);
  let finalDirection = detected;
  if (direction === 'den' || direction === 'di') {
    if (detected && detected !== direction) {
      throw new ImportError(`File có cấu trúc của sổ văn bản ${detected === 'den' ? 'ĐẾN' : 'ĐI'}, không khớp với loại sổ đã chọn.`);
    }
    finalDirection = direction;
  }
  if (!finalDirection) throw new ImportError('Không xác định được đây là sổ văn bản đến hay đi. Vui lòng chọn loại sổ.');

  // 4. Đọc từng dòng
  const records = [];
  const errors = [];
  const skipped = { secret: 0, unpublished: 0 };
  const seen = new Set();
  let totalRows = 0;

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const excelRow = i + 1;
    const get = (f) => (colMap[f] === undefined ? '' : row[colMap[f]]);
    const isEmpty = fields.every((f) => cleanCell(get(f)) === '');
    if (isEmpty) continue;
    totalRows++;

    const rec = { direction: finalDirection };
    for (const f of fields) {
      if (f === 'file_names') rec.file_names = parseFileNames(get(f));
      else if (DATE_FIELDS.includes(f)) rec[f] = parseDate(get(f));
      else if (INT_FIELDS.includes(f)) rec[f] = parseIntOrNull(get(f));
      else rec[f] = cleanCell(get(f)) || null;
    }
    if (!rec.file_names) rec.file_names = [];

    if (!rec.source_id) {
      errors.push({ row: excelRow, message: 'Thiếu ID văn bản.' });
      continue;
    }
    if (!/^[A-Za-z0-9_-]{1,50}$/.test(rec.source_id)) {
      errors.push({ row: excelRow, message: `ID không hợp lệ: "${rec.source_id}".` });
      continue;
    }
    if (seen.has(rec.source_id)) {
      errors.push({ row: excelRow, message: `ID ${rec.source_id} bị trùng trong file.` });
      continue;
    }
    if (!rec.so_ky_hieu && !rec.trich_yeu) {
      errors.push({ row: excelRow, message: 'Thiếu cả Số ký hiệu và Trích yếu.' });
      continue;
    }

    // Bảo mật: chỉ nhận văn bản Độ mật "Thường"
    if (normText(rec.do_mat || '') !== 'thuong') {
      skipped.secret++;
      continue;
    }
    // Văn bản đi: chỉ nhận văn bản đã phát hành
    if (finalDirection === 'di' && colMap.trang_thai_phat_hanh !== undefined
      && normText(rec.trang_thai_phat_hanh || '') !== 'da phat hanh') {
      skipped.unpublished++;
      continue;
    }

    if (!rec.ngay_van_ban) {
      errors.push({ row: excelRow, message: 'Ngày văn bản trống hoặc sai định dạng dd/mm/yyyy (vẫn nhập).', warning: true });
    }

    seen.add(rec.source_id);
    rec.search_norm = buildSearchNorm(rec);
    rec.row_hash = hashRecord(rec);
    records.push(rec);
  }

  return { direction: finalDirection, reportDate, totalRows, records, skipped, errors };
}

module.exports = {
  parseRegisterWorkbook,
  parseDate,
  buildSearchNorm,
  ImportError,
  MAX_FILE_BYTES,
};
