/**
 * Từ điển viết tắt nghiệp vụ Đảng và Hành chính công
 * Mở rộng từ viết tắt trực tiếp trong RAM (0ms, 0 token)
 */

const ABBR_MAP = {
  'đv': 'đảng viên',
  'dv': 'đảng viên',
  'cb': 'chi bộ',
  'kn': 'kết nạp',
  'knd': 'kết nạp đảng',
  'dbdb': 'đảng viên dự bị',
  'đvdb': 'đảng viên dự bị',
  't/m': 'thay mặt',
  'k/t': 'ký thay',
  't/l': 'thừa lệnh',
  't/u': 'thừa ủy quyền',
  'qd': 'quy định',
  'qđ': 'quy định',
  'hd': 'hướng dẫn',
  'hđ': 'hướng dẫn',
  'vptw': 'văn phòng trung ương',
  'btctw': 'ban tổ chức trung ương',
  'ubkt': 'ủy ban kiểm tra',
  'tt': 'thông tư',
  'bct': 'bộ chính trị',
  'bb': 'ban bí thư',
  'bch': 'ban chấp hành',
  'btv': 'ban thường vụ',
  'ubnd': 'ủy ban nhân dân',
  'hđnd': 'hội đồng nhân dân',
  'hdnd': 'hội đồng nhân dân',
  'mttq': 'mặt trận tổ quốc',
};

function expandAbbreviations(text = '') {
  if (!text) return '';
  let result = text;
  for (const [abbr, full] of Object.entries(ABBR_MAP)) {
    const escaped = abbr.replace(/[.*+?^${}()|[\]\/\\]/g, '\\$&');
    const regex = new RegExp(`(^|\\s)${escaped}(\\s|$)`, 'gi');
    result = result.replace(regex, `$1${full}$2`);
  }
  return result;
}

module.exports = {
  ABBR_MAP,
  expandAbbreviations,
};
