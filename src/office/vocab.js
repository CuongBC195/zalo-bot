/**
 * Từ vựng nghiệp vụ văn thư: thể loại văn bản và cơ quan ban hành suy ra từ số ký hiệu.
 */

const { normText, stripDiacritics } = require('./normalize');

/**
 * Thể loại văn bản. `abbr`: viết tắt trong số ký hiệu (đã bỏ dấu, viết hoa).
 * `phrases`: cách gọi đầy đủ (đã bỏ dấu, viết thường).
 * `generic`: người dùng hay dùng từ này để chỉ MỌI văn bản -> không lọc cứng.
 */
const DOC_TYPES = [
  { name: 'Công văn', abbr: ['CV'], phrases: ['cong van'], generic: true },
  { name: 'Quyết định', abbr: ['QD'], phrases: ['quyet dinh'] },
  { name: 'Quy định', abbr: ['QDI'], phrases: ['quy dinh'] },
  { name: 'Báo cáo', abbr: ['BC'], phrases: ['bao cao'] },
  { name: 'Kế hoạch', abbr: ['KH'], phrases: ['ke hoach'] },
  { name: 'Thông báo', abbr: ['TB'], phrases: ['thong bao'] },
  { name: 'Chương trình', abbr: ['CTR'], phrases: ['chuong trinh'] },
  { name: 'Quy chế', abbr: ['QC'], phrases: ['quy che'] },
  { name: 'Hướng dẫn', abbr: ['HD'], phrases: ['huong dan'] },
  { name: 'Chỉ thị', abbr: ['CT'], phrases: ['chi thi'] },
  { name: 'Nghị quyết', abbr: ['NQ'], phrases: ['nghi quyet'] },
  { name: 'Kết luận', abbr: ['KL'], phrases: ['ket luan'] },
  { name: 'Tờ trình', abbr: ['TTR'], phrases: ['to trinh'] },
  { name: 'Giấy mời', abbr: ['GM'], phrases: ['giay moi', 'thu moi'] },
  { name: 'Giấy giới thiệu', abbr: ['GGT'], phrases: ['giay gioi thieu'] },
  { name: 'Biên bản', abbr: ['BB'], phrases: ['bien ban'] },
  { name: 'Công điện', abbr: ['CD'], phrases: ['cong dien'] },
  { name: 'Thông tri', abbr: ['TT'], phrases: ['thong tri'] },
  { name: 'Đề án', abbr: ['DA'], phrases: ['de an'] },
  { name: 'Danh sách', abbr: ['DS'], phrases: ['danh sach'] },
];

const TYPE_BY_NAME = new Map(DOC_TYPES.map((t) => [t.name, t]));

/** Tìm thể loại theo tên (chấp nhận có dấu/không dấu) */
function findTypeByName(name) {
  if (!name) return null;
  const n = normText(name);
  return DOC_TYPES.find((t) => normText(t.name) === n || t.phrases.includes(n)) || null;
}

/** Tìm thể loại theo viết tắt trong số ký hiệu (vd "QĐ" -> Quyết định) */
function findTypeByAbbr(abbr) {
  if (!abbr) return null;
  const a = stripDiacritics(abbr).toUpperCase();
  return DOC_TYPES.find((t) => t.abbr.includes(a)) || null;
}

/**
 * Bung tên cơ quan ban hành từ phần sau dấu "/" của số ký hiệu, để người dùng
 * hỏi "công văn của Thành ủy" vẫn khớp "866-CV/TU".
 */
function expandIssuer(soKyHieu = '') {
  const parts = String(soKyHieu).split('/');
  if (parts.length < 2) return '';
  const suffix = stripDiacritics(parts.slice(1).join('/')).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!suffix) return '';
  const out = [];
  if (suffix.includes('UBKT')) out.push('uy ban kiem tra');
  if (suffix.includes('BTC')) out.push('ban to chuc');
  if (suffix.includes('BTG')) out.push('ban tuyen giao');
  if (suffix.includes('BDV')) out.push('ban dan van');
  if (suffix.includes('BNC')) out.push('ban noi chinh');
  if (suffix.includes('BCD')) out.push('ban chi dao');
  if (suffix.startsWith('VP')) out.push('van phong');
  if (suffix.endsWith('TU')) out.push('thanh uy tinh uy');
  if (suffix.endsWith('TW')) out.push('trung uong');
  if (suffix.endsWith('DU') || suffix === 'DU') out.push('dang uy');
  if (suffix.endsWith('CB')) out.push('chi bo');
  if (suffix.includes('MTTQ')) out.push('mat tran to quoc');
  return out.join(' ');
}

module.exports = { DOC_TYPES, TYPE_BY_NAME, findTypeByName, findTypeByAbbr, expandIssuer };
