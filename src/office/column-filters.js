/**
 * Bộ lọc theo cột cho bảng Sổ công văn (hàng lọc dưới tiêu đề + khung Tìm kiếm nâng cao).
 * Một định nghĩa dùng chung cho 3 nơi để kết quả luôn khớp nhau:
 *  - SQL (Postgres), so khớp không phân biệt hoa/thường và dấu tiếng Việt
 *  - Bộ nhớ dự phòng (JS)
 *  - Chế độ tìm tự do (lọc tập ứng viên trước khi chấm điểm)
 */

const { stripDiacritics } = require('./normalize');

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TEXT = 100;

/** Lọc chứa chuỗi (không dấu); `columns` nhiều cột thì khớp một trong các cột */
const TEXT_FILTERS = {
  soKyHieu: ['so_ky_hieu'],
  sourceId: ['source_id'],
  trichYeu: ['trich_yeu'],
  nguoiKy: ['nguoi_ky'],
  nguoiGui: ['nguoi_gui', 'nguoi_trinh'],
  // Ô tìm chung của trang Quản lý văn bản: số ký hiệu, trích yếu, người ký/gửi/trình, nơi nhận, mã văn bản
  keyword: ['so_ky_hieu', 'search_norm', 'source_id'],
};

/** Lọc đúng giá trị (chọn từ danh sách) */
const EXACT_FILTERS = {
  soVanBan: 'so_van_ban',
  doKhan: 'do_khan',
  trangThai: 'trang_thai_phat_hanh',
};

/** Lọc khoảng ngày: [khóa từ, khóa đến, cột] */
const DATE_FILTERS = [
  ['docDateFrom', 'docDateTo', 'ngay_van_ban'],
  ['receivedFrom', 'receivedTo', 'thoi_gian_nhan'],
  ['deadlineFrom', 'deadlineTo', 'han_xu_ly'],
];

/** Nguồn dữ liệu (trang Quản lý văn bản): 'tay' = thêm/sửa tay trên web, 'excel' = từ file nhập */
const SOURCE_VALUES = ['tay', 'excel'];

const ALL_KEYS = [
  ...Object.keys(TEXT_FILTERS),
  ...Object.keys(EXACT_FILTERS),
  ...DATE_FILTERS.flatMap(([a, b]) => [a, b]),
  'nguon',
];

/** Chữ thường, bỏ dấu, gộp khoảng trắng: dạng so khớp chung cho SQL và JS */
function foldText(value) {
  return stripDiacritics(String(value || '').normalize('NFC')).toLowerCase().replace(/\s+/g, ' ').trim();
}

// Bảng thay ký tự có dấu -> không dấu cho hàm translate() của Postgres.
// Không phụ thuộc collation của DB (lower() với collation "C" không xử lý chữ có dấu).
const VN_TRANSLATE = (() => {
  const bases = ['a', 'ă', 'â', 'e', 'ê', 'i', 'o', 'ô', 'ơ', 'u', 'ư', 'y'];
  const tones = ['', '\u0300', '\u0301', '\u0303', '\u0309', '\u0323'];
  let from = 'đĐ';
  let to = 'dd';
  for (const b of bases) {
    for (const t of tones) {
      const lower = (b + t).normalize('NFC');
      if (/^[a-z]$/.test(lower)) continue;
      for (const ch of [lower, lower.toUpperCase()]) {
        from += ch;
        to += stripDiacritics(ch).toLowerCase();
      }
    }
  }
  return { from, to };
})();

/** Đọc + làm sạch bộ lọc cột từ query string (đầu vào không tin cậy) */
function readColumnFilters(query = {}) {
  const out = {};
  for (const key of Object.keys(TEXT_FILTERS)) {
    const v = typeof query[key] === 'string' ? query[key].trim().slice(0, MAX_TEXT) : '';
    if (v && foldText(v)) out[key] = v;
  }
  for (const key of Object.keys(EXACT_FILTERS)) {
    const v = typeof query[key] === 'string' ? query[key].trim().slice(0, 255) : '';
    if (v) out[key] = v;
  }
  for (const [fromKey, toKey] of DATE_FILTERS) {
    for (const key of [fromKey, toKey]) {
      if (ISO_DATE.test(query[key] || '')) out[key] = query[key];
    }
  }
  if (SOURCE_VALUES.includes(query.nguon)) out.nguon = query.nguon;
  return out;
}

function hasColumnFilters(cf) {
  return !!cf && Object.keys(cf).some((k) => ALL_KEYS.includes(k) && cf[k]);
}

function escapeLike(text) {
  return text.replace(/[\\%_]/g, (m) => `\\${m}`);
}

/** Tách từ khóa theo khoảng trắng, bỏ dấu câu bao quanh ("nhà," -> "nha"), tối đa 8 từ */
function tokens(value) {
  return [...new Set(foldText(value).split(' ')
    .map((t) => t.replace(/^[.,;:!?()"']+|[.,;:!?()"']+$/g, ''))
    .filter(Boolean))].slice(0, 8);
}

/**
 * Sinh mệnh đề WHERE cho Postgres, đẩy tham số vào `params`.
 * @returns {string[]} danh sách điều kiện (nối bằng AND)
 */
function columnFiltersSql(cf, params) {
  const where = [];
  if (!hasColumnFilters(cf)) return where;
  let fromIdx = 0;
  let toIdx = 0;
  const fold = (col) => {
    if (!fromIdx) {
      params.push(VN_TRANSLATE.from); fromIdx = params.length;
      params.push(VN_TRANSLATE.to); toIdx = params.length;
    }
    return `lower(translate(COALESCE(${col}, ''), $${fromIdx}, $${toIdx}))`;
  };

  for (const [key, cols] of Object.entries(TEXT_FILTERS)) {
    if (!cf[key]) continue;
    // Mỗi từ phải xuất hiện (không cần liền nhau), ở một trong các cột
    for (const token of tokens(cf[key])) {
      params.push(`%${escapeLike(token)}%`);
      const idx = params.length;
      const parts = cols.map((c) => `${fold(c)} LIKE $${idx} ESCAPE '\\'`);
      where.push(parts.length > 1 ? `(${parts.join(' OR ')})` : parts[0]);
    }
  }
  for (const [key, col] of Object.entries(EXACT_FILTERS)) {
    if (!cf[key]) continue;
    params.push(cf[key]);
    where.push(`${col} = $${params.length}`);
  }
  for (const [fromKey, toKey, col] of DATE_FILTERS) {
    if (cf[fromKey]) { params.push(cf[fromKey]); where.push(`${col} >= $${params.length}`); }
    if (cf[toKey]) { params.push(cf[toKey]); where.push(`${col} <= $${params.length}`); }
  }
  if (cf.nguon === 'tay') where.push('edited_by_name IS NOT NULL');
  if (cf.nguon === 'excel') where.push('edited_by_name IS NULL');
  return where;
}

/** Bộ lọc tương đương cho bộ nhớ dự phòng / tập đã xếp hạng */
function matchesColumnFilters(doc, cf) {
  if (!hasColumnFilters(cf)) return true;
  for (const [key, cols] of Object.entries(TEXT_FILTERS)) {
    if (!cf[key]) continue;
    for (const token of tokens(cf[key])) {
      if (!cols.some((c) => foldText(doc[c]).includes(token))) return false;
    }
  }
  for (const [key, col] of Object.entries(EXACT_FILTERS)) {
    if (cf[key] && doc[col] !== cf[key]) return false;
  }
  for (const [fromKey, toKey, col] of DATE_FILTERS) {
    const v = doc[col] ? String(doc[col]).slice(0, 10) : '';
    if (cf[fromKey] && (!v || v < cf[fromKey])) return false;
    if (cf[toKey] && (!v || v > cf[toKey])) return false;
  }
  if (cf.nguon === 'tay' && !doc.edited_by_name) return false;
  if (cf.nguon === 'excel' && doc.edited_by_name) return false;
  return true;
}

module.exports = {
  readColumnFilters,
  hasColumnFilters,
  columnFiltersSql,
  matchesColumnFilters,
  foldText,
  COLUMN_FILTER_KEYS: ALL_KEYS,
  _VN_TRANSLATE: VN_TRANSLATE,
};
