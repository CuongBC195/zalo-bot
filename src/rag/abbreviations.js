/**
 * Từ điển viết tắt nghiệp vụ Đảng và Hành chính công
 * Mở rộng từ viết tắt trực tiếp trong RAM (0ms, 0 token)
 * Cung cấp hàm chuẩn hóa cache key và trích xuất số hiệu văn bản dùng chung
 */

const ABBR_MAP = {
  // Từ viết tắt chuyên ngành Đảng & Văn thư
  'đv': 'đảng viên',
  'dv': 'đảng viên',
  'đvdb': 'đảng viên dự bị',
  'dvdb': 'đảng viên dự bị',
  'đvct': 'đảng viên chính thức',
  'dvct': 'đảng viên chính thức',
  'cb': 'chi bộ',
  'shcb': 'sinh hoạt chi bộ',
  'shđ': 'sinh hoạt đảng',
  'shd': 'sinh hoạt đảng',
  'knđ': 'kết nạp đảng',
  'knd': 'kết nạp đảng',
  'kn': 'kết nạp',
  'đp': 'đảng phí',
  'bct': 'bộ chính trị',
  'bbt': 'ban bí thư',
  'bch': 'ban chấp hành',
  'btv': 'ban thường vụ',
  'tw': 'trung ương',
  'tư': 'trung ương',
  'vptw': 'văn phòng trung ương',
  'btctw': 'ban tổ chức trung ương',
  'ubkt': 'ủy ban kiểm tra',
  'mttq': 'mặt trận tổ quốc',
  'bhxh': 'bảo hiểm xã hội',
  'ubnd': 'ủy ban nhân dân',
  'hđnd': 'hội đồng nhân dân',
  'hdnd': 'hội đồng nhân dân',
  't/m': 'ký thay mặt t/m',
  'k/t': 'ký thay k/t',
  't/l': 'ký thừa lệnh t/l',
  't/u': 'ký thừa ủy quyền t/u',
  'qđ': 'quy định',
  'qd': 'quy định',
  'hd': 'hướng dẫn',
  'hđ': 'hướng dẫn',
  'ct': 'chỉ thị',
  'kl': 'kết luận',
  'nq': 'nghị quyết',
  'tt': 'thông tư',
  'bnv': 'bộ nội vụ',

  // Từ viết tắt chat đời thường trên Zalo
  'ko': 'không',
  'k': 'không',
  'khg': 'không',
  'hong': 'không',
  'dc': 'được',
  'đc': 'được',
  'bn': 'bao nhiêu',
  'bnhieu': 'bao nhiêu',
  'ntn': 'như thế nào',
  'sao': 'như thế nào',
  'vs': 'với',
  'trc': 'trước',
  'ng': 'người',
  'ctac': 'công tác',
  'hs': 'hồ sơ',
  'tl': 'tài liệu',
  'vb': 'văn bản',
  'kỉ luật': 'kỷ luật',
  'kĩ luật': 'kỷ luật',
  'ki luat': 'kỷ luật',
  'xoa ten': 'xóa tên',
  'cv': 'công văn',
  'clt': 'cục lưu trữ',
};

// Sắp xếp các từ viết tắt theo độ dài giảm dần
const SORTED_ABBR_KEYS = Object.keys(ABBR_MAP).sort((a, b) => b.length - a.length);

// Xây dựng Regex single-pass:
// Ranh giới từ chuẩn Unicode (\p{L}\p{N}), loại trừ dấu gạch ngang (-) và gạch chéo (/)
// để không bao giờ thay thế các mã số hiệu như 05-HD/VPTW, 207-QĐ/TW
const ESCAPED_ABBR_PATTERNS = SORTED_ABBR_KEYS.map(k => k.replace(/[\/\-\.]/g, '\\$&')).join('|');
const SINGLE_PASS_ABBR_REGEX = new RegExp(
  '(^|[^\\p{L}\\p{N}\\-\\/])(' + ESCAPED_ABBR_PATTERNS + ')(?=[^\\p{L}\\p{N}\\-\\/]|$)',
  'giu'
);

/**
 * Bung từ viết tắt độc lập theo ranh giới từ (word boundary)
 * Giữ nguyên các mã số hiệu như 05-HD/VPTW, 207-QĐ/TW
 * @param {string} text
 * @returns {string}
 */
function expandAbbreviations(text = '') {
  if (!text) return '';

  // Loc bo payload tan cong SQL Injection doc hai de giu cau hoi tra cuu trong sach
  let cleanText = text.replace(/;\s*(drop|delete|insert|update|select|alter|truncate)\b.*/gi, '');

  let res = cleanText.replace(SINGLE_PASS_ABBR_REGEX, (match, prefix, abbr) => {
    const lower = abbr.toLowerCase();
    const replacement = ABBR_MAP[lower] || abbr;
    return prefix + replacement;
  });

  // Mở rộng ngữ nghĩa cho câu hỏi có con số đi kèm chữ tuổi hoặc hỏi về tuổi kết nạp Đảng
  if (/\b\d{1,3}\s*tu[oổ]i\b/i.test(res) || /(tu[oổ]i\s*k[eế]t\s*n[aạ]p|ng[uư][oợ]i\s*v[aà]o\s*[đd][aả]ng|[đd][oộ]\s*tu[oổ]i)/i.test(res)) {
    res += ' tuổi đời độ tuổi tiêu chuẩn người vào đảng Điều 1 ';
  }

  return res;
}

// Danh sách từ dừng và từ đệm không mang ngữ nghĩa nội dung tra cứu
const CACHE_STOPWORDS = new Set([
  'a', 'nhe', 'vay', 'ha', 'nhi', 'oi', 'khong', 'sao', 'cho', 'hoi',
  'la', 'nhung', 'cac', 'cua', 'va', 'o', 'tai', 'trong', 'theo', 'thi', 'co', 'duoc', 'gi', 'nao', 'the', 'nhu', 'may'
]);

/**
 * Chuẩn hóa câu hỏi thành mã cache_key duy nhất (hashing/token sorting)
 * Khử dấu thanh, bung viết tắt, lọc bỏ từ đệm để 2 câu hỏi cùng bản chất cho ra cùng 1 key
 * @param {string} text
 * @returns {string}
 */
function buildCacheKey(text = '') {
  if (!text) return '';

  // 1. Bung từ viết tắt
  let expanded = expandAbbreviations(text);

  // 2. Chuyển đ -> d và bỏ toàn bộ dấu thanh tiếng Việt (NFD)
  let normalized = expanded
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  // 3. Lọc bỏ các cụm từ đệm phổ biến ở đầu và cuối câu
  normalized = normalized
    .replace(/\b(dong\s+chi|ad|bot|tro\s+ly|admin)\s*(cho\s*)?(toi\s*)?hoi\b/gi, ' ')
    .replace(/\b(cho\s*)?(toi\s*)?hoi\b/gi, ' ')
    .replace(/\b(xin\s+)?chao\s+(dong\s+chi|ad|bot|ban)?\b/gi, ' ')
    .replace(/\b(ad|bot)\s+oi\b/gi, ' ')
    .replace(/\b(vay\s*)?(a|nhe|ha|nhi|sao)\s*$/gi, ' ');

  // 4. Lọc bỏ dấu câu, ký tự đặc biệt, chỉ giữ chữ cái và chữ số
  normalized = normalized.replace(/[^\w\d\s]/g, ' ').replace(/\s+/g, ' ').trim();

  // 5. Tách thành danh sách tokens, loại bỏ từ dừng
  const tokens = normalized
    .split(/\s+/)
    .filter(token => token.length > 0 && !CACHE_STOPWORDS.has(token));

  // 6. Sắp xếp các tokens theo thứ tự bảng chữ cái để tạo chuỗi đặc trưng bất biến
  if (tokens.length >= 2) {
    tokens.sort();
  }

  const key = tokens.join('_');
  return key.slice(0, 280); // Giới hạn độ dài VARCHAR(300)
}

/**
 * Trích xuất số hiệu văn bản chuẩn ngữ pháp tiếng Việt (Dùng chung cho RAG, DB và JEV)
 * Chỉ bắt số đứng sau loại văn bản hoặc đứng trước ký hiệu viết tắt
 * Bao gồm cả công văn (CV), cục lưu trữ (CLT)
 * Loại trừ hoàn toàn các số đếm (3 bước, 5 chuẩn mực, 19 điều, 12 tháng, 30 ngày)
 * @param {string} queryStr
 * @returns {Array<string>}
 */
function extractDocNumbers(queryStr = '') {
  if (!queryStr) return [];

  // Loại bỏ các định dạng ngày tháng như 27/05/2026, 09-01-2026
  const queryWithoutDates = queryStr.replace(/\b\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}\b/g, ' ');

  // 1. Đi sau danh từ chỉ loại văn bản: (quy định|hướng dẫn|chỉ thị|công văn|thông tư|kết luận|nghị quyết|luật|qđ|hd|ct|cv|tt|kl|nq) số? 123
  // 2. Đi liền trước ký hiệu viết tắt: 123-(qđ|hd|ct|cv|tt|kl|nq|tw|vptw|btctw|clt|bnv|qh15|qh)
  const docNumRegex = /(?:quy\s*[đd][iị]nh|quy[eế]t\s*[đd][iị]nh|h[uư][oơ]ng\s*d[aẫãắằặẳẵáàảạâ]n|ch[iỉ]\s*th[iị]|c[oô]ng\s*v[aă]n|th[oô]ng\s*t[uư]|k[eế]t\s*lu[aậãảạ]n|ngh[iị]\s*quy[eế]t|lu[aậ]t|q[đd]|h[dđ]|ct|cv|tt|kl|nq)\s*(?:s[oố]\s*)?(\d{1,4})\b|\b(\d{1,4})(?=[-\/](?:q[đd]|h[dđ]|ct|cv|tt|kl|nq|tw|vptw|btctw|clt|bnv|qh15|qh))/gi;

  const docNumbers = [];
  let m;
  while ((m = docNumRegex.exec(queryWithoutDates)) !== null) {
    const num = m[1] || m[2];
    if (num && !docNumbers.includes(num)) {
      const nInt = parseInt(num, 10);
      // Loại bỏ số năm (1901 - 2099)
      if (!(nInt > 1900 && nInt < 2100)) {
        docNumbers.push(num);
      }
    }
  }

  return docNumbers;
}

/**
 * Trích xuất chi tiết số hiệu và loại văn bản (HD, QĐ, CT, CV, TT...)
 * Phân biệt rạch ròi giữa 24-HD (Thời hạn lưu trữ) và 24-QĐ (Thi hành Điều lệ Đảng),
 * 50-HD (Chỉnh lý tài liệu) và 50-CT (Chỉ thị 50).
 * @param {string} queryStr
 * @returns {Array<object>}
 */
function extractDocSignatures(queryStr = '') {
  if (!queryStr) return [];
  const queryWithoutDates = queryStr.replace(/\b\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}\b/g, ' ');

  const signatures = [];

  // Pattern 1: Tiền tố loại văn bản + số
  const prefixRegex = /\b(quy\s*[đd][iị]nh|quy[eế]t\s*[đd][iị]nh|h[uư][oơ]ng\s*d[aẫãắằặẳẵáàảạâ]n|ch[iỉ]\s*th[iị]|c[oô]ng\s*v[aă]n|th[oô]ng\s*t[uư]|k[eế]t\s*lu[aậãảạ]n|ngh[iị]\s*quy[eế]t|lu[aậ]t|q[đd]|h[dđ]|ct|cv|tt|kl|nq)\s*(?:s[oố]\s*)?(\d{1,4})\b/gi;
  let m;
  while ((m = prefixRegex.exec(queryWithoutDates)) !== null) {
    const rawType = m[1].toLowerCase();
    const num = m[2];
    const nInt = parseInt(num, 10);
    if (nInt > 1900 && nInt < 2100) continue;

    let type = null;
    if (/h[uư][oơ]ng\s*d[aẫãắằặẳẵáàảạâ]n|h[dđ]/i.test(rawType)) type = 'HD';
    else if (/quy\s*[đd][iị]nh|quy[eế]t\s*[đd][iị]nh|q[đd]/i.test(rawType)) type = 'QD';
    else if (/ch[iỉ]\s*th[iị]|ct/i.test(rawType)) type = 'CT';
    else if (/c[oô]ng\s*v[aă]n|cv/i.test(rawType)) type = 'CV';
    else if (/th[oô]ng\s*t[uư]|tt/i.test(rawType)) type = 'TT';
    else if (/k[eế]t\s*lu[aậãảạ]n|kl/i.test(rawType)) type = 'KL';
    else if (/ngh[iị]\s*quy[eế]t|nq/i.test(rawType)) type = 'NQ';
    else if (/lu[aậ]t/i.test(rawType)) type = 'LUAT';

    signatures.push({
      number: num,
      type,
      rawType,
      fullCode: type ? `${num}-${type}` : num,
    });
  }

  // Pattern 2: Dạng viết tắt có gạch nối: 24-HD, 24-QĐ, 50-CT, 561-CV...
  const hyphenRegex = /\b(\d{1,4})[-\/](q[đd]|h[dđ]|ct|cv|tt|kl|nq)(?:[-\/](?:tw|vptw|btctw|clt|bnv|qh15|qh))?/gi;
  while ((m = hyphenRegex.exec(queryWithoutDates)) !== null) {
    const num = m[1];
    const rawType = m[2].toLowerCase();
    const nInt = parseInt(num, 10);
    if (nInt > 1900 && nInt < 2100) continue;

    let type = null;
    if (/h[dđ]/i.test(rawType)) type = 'HD';
    else if (/q[đd]/i.test(rawType)) type = 'QD';
    else if (/ct/i.test(rawType)) type = 'CT';
    else if (/cv/i.test(rawType)) type = 'CV';
    else if (/tt/i.test(rawType)) type = 'TT';
    else if (/kl/i.test(rawType)) type = 'KL';
    else if (/nq/i.test(rawType)) type = 'NQ';

    if (!signatures.some(s => s.number === num && s.type === type)) {
      signatures.push({
        number: num,
        type,
        rawType,
        fullCode: type ? `${num}-${type}` : num,
      });
    }
  }

  return signatures;
}

module.exports = {
  ABBR_MAP,
  expandAbbreviations,
  buildCacheKey,
  extractDocNumbers,
  extractDocSignatures,
};
