/**
 * Chuẩn hóa văn bản tiếng Việt cho luồng tra cứu Sổ công văn.
 * Toàn bộ xử lý chạy cục bộ (0 token).
 */

/** Bỏ dấu tiếng Việt, giữ nguyên hoa/thường */
function stripDiacritics(input = '') {
  return String(input)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

/** Chữ thường, bỏ dấu, chỉ giữ chữ/số và các ký tự - / để không làm gãy số ký hiệu */
function normText(input = '') {
  return stripDiacritics(String(input).normalize('NFC'))
    .toLowerCase()
    .replace(/[–—]/g, '-')
    .replace(/[^a-z0-9/\-\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Chuỗi NFC đã trim (dùng khi lưu dữ liệu nhập từ Excel) */
function cleanCell(value) {
  if (value === null || value === undefined) return '';
  return String(value).normalize('NFC').replace(/\u00a0/g, ' ').trim();
}

/**
 * Cụm từ dừng (đã bỏ dấu): bỏ cả cụm trước khi tách token.
 * Bỏ theo cụm để không làm mất âm tiết mang nghĩa khi đứng một mình (vd "chuyển đổi số").
 */
const STOP_PHRASES = [
  'tim kiem', 'tra cuu', 'tim giup', 'xem giup', 'giup toi', 'giup minh', 'giup em', 'cho toi', 'cho minh', 'cho em',
  'toi muon', 'toi can', 'muon biet', 'can tim', 'co the', 'duoc khong', 'hay khong', 'co khong', 'khong a',
  'van ban', 'cong van', 'bao nhieu', 'so luong', 'dong chi', 'liet ke', 'danh sach', 'tat ca', 've viec',
  'lien quan den', 'lien quan toi', 'lien quan', 'noi dung', 'trich yeu', 'co noi dung', 'gan day', 'moi nhat',
  'gan nhat', 'thi sao', 'the nao', 'la gi', 'nao do',
];
const STOP_PHRASE_RE = new RegExp(`\\s(?:${STOP_PHRASES.sort((a, b) => b.length - a.length).join('|')})(?=\\s)`, 'g');

/** Hư từ chắc chắn không mang nghĩa tìm kiếm: loại hẳn */
const STOPWORDS = new Set([
  'viec', 'cua', 'cac', 'va', 'la', 'khong', 'nao', 'gi', 'minh', 'tim', 'cuu', 'giup', 'xem', 'muon',
  'biet', 'duoc', 'voi', 'trong', 'hay', 'nhe', 'oi', 'vay', 'thi', 'sao', 'kia', 'roi', 'se', 'theo', 'het',
  'nua', 'them', 'lai', 'ah', 'nhi', 'ne', 'ok', 'vb', 'cv', 'ha', 'ak', 'nhieu', 've', 'ma', 'gium', 'dum', 'ai', 'e',
]);

/**
 * Âm tiết nhập nhằng khi bỏ dấu (nhà/nha, số/sổ, hội/hỏi, Đảng/đang, chi bộ/chị...).
 * Vẫn giữ làm từ khóa nhưng trọng số thấp, không bắt buộc phải khớp.
 */
const WEAK_WORDS = new Set([
  'co', 'toi', 'em', 'anh', 'chi', 'kiem', 'tra', 'hoi', 'can', 'ra', 'tu', 'den', 'di', 'ngay', 'thang',
  'nam', 'quy', 'tuan', 'so', 'van', 'ban', 'cong', 'ho', 'dong', 'con', 'the', 'nay', 'do', 'ky', 'nguoi', 'boi',
  'bao', 'may', 'ke', 'moi', 'nhat', 'gan', 'day', 'da', 'dang', 'lien', 'gui', 'hanh', 'phat', 'hien', 'danh',
  'sach', 'tat', 'ca', 'mot', 'it', 'nha', 'cho', 'a', 'u', 'quan', 'nhung', 'cai', 'xin', 'ong', 'ba',
]);

/** Từ khóa này có phải âm tiết nhập nhằng (trọng số thấp) không */
function isWeakWord(token) {
  return WEAK_WORDS.has(token);
}

/** Bỏ các cụm từ dừng trên chuỗi đã normText */
function stripStopPhrases(normalized = '') {
  return ` ${normalized} `.replace(STOP_PHRASE_RE, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Viết tắt / cách gõ tắt thường gặp -> dạng đầy đủ (đã bỏ dấu).
 * Áp dụng theo từng token sau khi normText.
 */
const ABBREVIATIONS = {
  vbd: 'van ban den',
  vbden: 'van ban den',
  vbdi: 'van ban di',
  cvd: 'cong van den',
  cvden: 'cong van den',
  cvdi: 'cong van di',
  qd: 'quyet dinh',
  bc: 'bao cao',
  kh: 'ke hoach',
  tb: 'thong bao',
  ctr: 'chuong trinh',
  gm: 'giay moi',
  hd: 'huong dan',
  nq: 'nghi quyet',
  ttr: 'to trinh',
  bb: 'bien ban',
  kl: 'ket luan',
  qc: 'quy che',
  ct: 'chi thi',
  qdi: 'quy dinh',
  ubnd: 'uy ban nhan dan',
  ubkt: 'uy ban kiem tra',
  btc: 'ban to chuc',
  btg: 'ban tuyen giao',
  mttq: 'mat tran to quoc',
  hnay: 'hom nay',
  hqua: 'hom qua',
  ko: 'khong',
  k: 'khong',
  dc: 'duoc',
  tks: '',
  thanks: '',
};

/** Lỗi gõ thường gặp (đã bỏ dấu) */
const TYPO_FIXES = {
  qyet: 'quyet', quyeet: 'quyet', dinhh: 'dinh', cogn: 'cong', vna: 'van', bna: 'ban', thnag: 'thang',
  thag: 'thang', baoo: 'bao', caoo: 'cao', hoahc: 'hoach', thongbao: 'thong bao', quyetdinh: 'quyet dinh',
  baocao: 'bao cao', kehoach: 'ke hoach', congvan: 'cong van', vanban: 'van ban', giaymoi: 'giay moi',
};

/** Bung viết tắt + sửa lỗi gõ trên chuỗi đã normText */
function expandTokens(normalized = '') {
  return normalized
    .split(' ')
    .map((t) => {
      if (/[0-9/]/.test(t)) return t; // không đụng vào số ký hiệu, ngày tháng
      if (Object.prototype.hasOwnProperty.call(TYPO_FIXES, t)) return TYPO_FIXES[t];
      if (Object.prototype.hasOwnProperty.call(ABBREVIATIONS, t)) return ABBREVIATIONS[t];
      return t;
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Tách token tìm kiếm (bỏ từ dừng, bỏ token quá ngắn) */
function keywordTokens(normalized = '') {
  return stripStopPhrases(normalized)
    .split(' ')
    .filter((t) => t && t.length >= 2 && !STOPWORDS.has(t) && !/^\d+$/.test(t));
}

/** Tập trigram ký tự của một từ (dùng để chịu lỗi gõ) */
function trigrams(word) {
  const s = `  ${word} `;
  const set = new Set();
  for (let i = 0; i < s.length - 2; i++) set.add(s.slice(i, i + 3));
  return set;
}

/** Hệ số Dice trên trigram, 0..1 */
function trigramSimilarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const ta = trigrams(a);
  const tb = trigrams(b);
  let inter = 0;
  for (const g of ta) if (tb.has(g)) inter++;
  return (2 * inter) / (ta.size + tb.size);
}

module.exports = {
  stripDiacritics,
  normText,
  cleanCell,
  expandTokens,
  keywordTokens,
  trigramSimilarity,
  stripStopPhrases,
  isWeakWord,
  STOPWORDS,
  ABBREVIATIONS,
};
