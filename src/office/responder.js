/**
 * Soạn câu trả lời dạng văn bản thuần cho Zalo (không emoji, giọng hành chính).
 * Không bao giờ đưa Ý kiến chuyển / Ý kiến chỉ đạo vào câu trả lời Zalo.
 */

const config = require('../config');
const { fmtVn } = require('./query-parser');

const DIR_LABEL = { den: 'đến', di: 'đi' };
const TRICH_YEU_MAX = 180;

function unit() {
  return config.office.unitName || 'Văn phòng Đảng ủy';
}

function d(isoDate) {
  return isoDate ? fmtVn(isoDate) : '...';
}

function truncate(text, max) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

/** Mô tả phạm vi tìm: "văn bản đến, Quyết định, tháng 10/2026" */
function describeScope(filters = {}, keywordsText = '') {
  const parts = [];
  parts.push(filters.direction ? `văn bản ${DIR_LABEL[filters.direction]}` : 'văn bản');
  if (filters.theLoai) parts.push(`thể loại ${filters.theLoai}`);
  if (filters.soKyHieu) parts.push(`số ${filters.soKyHieu}`);
  else if (filters.number) parts.push(`số ${filters.number}`);
  if (filters.nguoiKy) parts.push(`người ký "${filters.nguoiKy}"`);
  if (filters.dateLabel) parts.push(filters.dateLabel);
  if (keywordsText) parts.push(`nội dung "${keywordsText}"`);
  return parts.join(', ');
}

function footer(overview, { withHint = false } = {}) {
  const lines = [];
  if (withHint) lines.push('Nhắn số thứ tự (vd "1") để xem chi tiết, "xem thêm" để xem tiếp, "/moi" để tìm mới.');
  lines.push(`Nhận file văn bản: liên hệ Văn thư ${unit()}, cung cấp Mã văn bản.`);
  const dates = [overview?.den?.reportDate, overview?.di?.reportDate].filter(Boolean).sort();
  if (dates.length) lines.push(`Dữ liệu sổ cập nhật đến ngày ${d(dates[dates.length - 1])}.`);
  return lines.join('\n');
}

function listItem(doc, index) {
  const head = `${index}. Số ${doc.so_ky_hieu || '(chưa có số)'} - ${DIR_LABEL[doc.direction] === 'đến' ? 'VB đến' : 'VB đi'}, ngày ${d(doc.ngay_van_ban)}`;
  const lines = [head];
  lines.push(`   ${doc.the_loai ? `${doc.the_loai}: ` : ''}${truncate(doc.trich_yeu, TRICH_YEU_MAX)}`);
  const meta = [];
  if (doc.nguoi_ky) meta.push(`Người ký: ${doc.nguoi_ky}`);
  if (doc.direction === 'den' && doc.thoi_gian_nhan && doc.thoi_gian_nhan !== doc.ngay_van_ban) meta.push(`Nhận: ${d(doc.thoi_gian_nhan)}`);
  meta.push(`Mã: ${doc.source_id}`);
  lines.push(`   ${meta.join(' | ')}`);
  return lines.join('\n');
}

function formatList({ docs, total, offset = 0, filters, keywordsText, overview, title }) {
  const from = offset + 1;
  const to = offset + docs.length;
  const header = title
    || (total > docs.length
      ? `Tìm thấy ${total} ${describeScope(filters, keywordsText)}. Hiển thị ${from}-${to}:`
      : `Tìm thấy ${total} ${describeScope(filters, keywordsText)}:`);
  const body = docs.map((doc, i) => listItem(doc, offset + i + 1)).join('\n\n');
  return `${header}\n\n${body}\n\n${footer(overview, { withHint: true })}`;
}

function formatRelated({ docs, query, overview }) {
  const header = `Chưa tìm thấy văn bản khớp hoàn toàn với "${truncate(query, 80)}". Một số văn bản gần giống, đồng chí xem có đúng không:`;
  const body = docs.map((doc, i) => listItem(doc, i + 1)).join('\n\n');
  return `${header}\n\n${body}\n\n${footer(overview, { withHint: true })}`;
}

function formatNotFound({ query, filters, keywordsText }) {
  const scope = describeScope(filters, keywordsText);
  return (
    `Không tìm thấy ${scope} phù hợp với "${truncate(query, 80)}".\n\n` +
    'Đồng chí có thể thử:\n' +
    '- Hỏi theo số ký hiệu: "866-CV/TU", "công văn 253"\n' +
    '- Theo thể loại và thời gian: "quyết định tháng 10", "văn bản đến tuần này"\n' +
    '- Theo nội dung trích yếu: "công văn về nhà đất dôi dư"\n' +
    '- Theo người ký: "văn bản do đồng chí Hải ký"\n\n' +
    `Lưu ý: sổ chỉ gồm văn bản thường đã vào sổ của ${unit()}.`
  );
}

function formatDetail(doc, overview) {
  const isDen = doc.direction === 'den';
  const lines = [`CHI TIẾT VĂN BẢN ${isDen ? 'ĐẾN' : 'ĐI'}`, ''];
  lines.push(`Số ký hiệu: ${doc.so_ky_hieu || '(chưa có số)'}`);
  lines.push(`Ngày văn bản: ${d(doc.ngay_van_ban)}${isDen && doc.thoi_gian_nhan ? ` | Ngày nhận: ${d(doc.thoi_gian_nhan)}` : ''}`);
  if (doc.the_loai) lines.push(`Thể loại: ${doc.the_loai}${doc.do_khan && doc.do_khan !== 'Thường' ? ` | Độ khẩn: ${doc.do_khan}` : ''}`);
  lines.push(`Trích yếu: ${truncate(doc.trich_yeu, 600)}`);
  if (doc.nguoi_ky) lines.push(`Người ký: ${doc.nguoi_ky}`);
  if (isDen && doc.han_xu_ly) lines.push(`Hạn xử lý: ${d(doc.han_xu_ly)}`);
  if (!isDen && doc.so_dang_ky) lines.push(`Số đăng ký: ${doc.so_dang_ky}`);
  if (!isDen && doc.noi_nhan) lines.push(`Nơi nhận: ${truncate(doc.noi_nhan, 300)}`);
  if (doc.so_van_ban) lines.push(`Sổ: ${doc.so_van_ban}`);
  const extra = [];
  if (doc.so_trang) extra.push(`${doc.so_trang} trang`);
  if (Number(doc.file_count) > 0) extra.push(`${doc.file_count} tệp đính kèm`);
  if (extra.length) lines.push(`Tài liệu: ${extra.join(', ')}`);
  lines.push(`Mã văn bản: ${doc.source_id}`);
  lines.push('');
  lines.push(footer(overview));
  return lines.join('\n');
}

function formatCount({ total, counts, filters, keywordsText }) {
  const scope = describeScope(filters, keywordsText);
  if (!total) return `Không có ${scope} nào trong sổ.`;
  const lines = [`Có ${total} ${scope}.`];
  if (!filters.direction && counts) {
    lines.push(`- Văn bản đến: ${counts.byDirection.den || 0}`);
    lines.push(`- Văn bản đi: ${counts.byDirection.di || 0}`);
  }
  if (counts && counts.byType.length > 1) {
    lines.push('', 'Theo thể loại:');
    for (const t of counts.byType.slice(0, 10)) lines.push(`- ${t.name}: ${t.count}`);
  }
  lines.push('', 'Nhắn "danh sách" để xem các văn bản này.');
  return lines.join('\n');
}

function formatHelp() {
  return (
    `TRA CỨU SỔ CÔNG VĂN - ${unit().toUpperCase()}\n\n` +
    'Đồng chí có thể hỏi tự nhiên, có dấu hoặc không dấu, ví dụ:\n' +
    '- "866-CV/TU" hoặc "công văn 253"\n' +
    '- "quyết định tháng 10"\n' +
    '- "văn bản đến tuần này"\n' +
    '- "công văn về nhà đất dôi dư"\n' +
    '- "văn bản do đồng chí Hải ký"\n' +
    '- "bao nhiêu văn bản đi quý 3"\n\n' +
    'Sau khi có kết quả: nhắn "1", "2"... để xem chi tiết; "xem thêm" để xem tiếp; ' +
    '"tháng 10/2025", "văn bản đến"... để lọc tiếp kết quả vừa tìm; "/moi" để tìm mới.\n\n' +
    `Bot chỉ cung cấp thông tin sổ. Để nhận file văn bản, đồng chí liên hệ Văn thư ${unit()}.`
  );
}

function formatOutOfScope() {
  return (
    `Trợ lý hiện chỉ hỗ trợ tra cứu sổ công văn đến/đi của ${unit()}.\n` +
    'Đồng chí nhắn "hướng dẫn" để xem cách hỏi.'
  );
}

function formatReset() {
  return 'Đã xóa điều kiện tìm trước đó. Mời đồng chí nhập câu hỏi mới.';
}

function formatDetailOutOfRange(max) {
  return `Danh sách hiện có ${max} văn bản. Đồng chí nhắn số từ 1 đến ${max} để xem chi tiết, hoặc nhập câu hỏi mới.`;
}

function formatNoMore() {
  return 'Đã hết kết quả. Đồng chí nhập câu hỏi mới hoặc nhắn "/moi".';
}

function formatUnregistered() {
  return (
    `Đồng chí chưa được cấp quyền tra cứu sổ công văn của ${unit()}.\n\n` +
    'Để được cấp quyền: liên hệ Văn thư/Quản trị viên để nhận mã kích hoạt, sau đó nhắn:\n' +
    '/dangky MÃ-KÍCH-HOẠT\n(ví dụ: /dangky ABCD-EF23)'
  );
}

function formatActivation(result) {
  if (result === 'ok') return 'Kích hoạt thành công. Đồng chí đã có thể tra cứu sổ công văn.\n\n' + formatHelp();
  if (result === 'already') return 'Tài khoản của đồng chí đã có quyền tra cứu. Mời đồng chí nhập câu hỏi.';
  if (result === 'locked') return 'Đồng chí đã nhập sai mã quá nhiều lần. Vui lòng thử lại sau 1 giờ hoặc liên hệ Văn thư để được hỗ trợ.';
  if (result === 'missing') return 'Vui lòng nhắn kèm mã kích hoạt, ví dụ: /dangky ABCD-EF23';
  return 'Mã kích hoạt không đúng, đã dùng hoặc đã hết hạn. Vui lòng kiểm tra lại hoặc liên hệ Văn thư để nhận mã mới.';
}

function formatMaintenance() {
  return 'Chức năng hỏi đáp quy định đang bảo trì. Hiện trợ lý hỗ trợ tra cứu sổ công văn đến/đi.';
}

module.exports = {
  formatList,
  formatRelated,
  formatNotFound,
  formatDetail,
  formatCount,
  formatHelp,
  formatOutOfScope,
  formatReset,
  formatDetailOutOfRange,
  formatNoMore,
  formatUnregistered,
  formatActivation,
  formatMaintenance,
  describeScope,
};
