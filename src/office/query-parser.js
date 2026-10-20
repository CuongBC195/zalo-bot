/**
 * Phân tích câu hỏi tra cứu Sổ công văn bằng quy tắc (0 token).
 * Đóng vai trò lớp phân loại ý định (như Jev) + tách bộ lọc có cấu trúc.
 *
 * Kết quả:
 * {
 *   intent: 'search' | 'count' | 'detail' | 'more' | 'reset' | 'help' | 'empty',
 *   filters: { direction, theLoai, soKyHieu, number, sourceId, dateFrom, dateTo, dateLabel, nguoiKy },
 *   keywords: string[],        // token đã bỏ dấu
 *   genericCongVan: boolean,   // có dùng chữ "công văn" chung chung
 *   detailIndex: number|null,  // 0-based, cho intent 'detail'
 *   isFollowUp: boolean,
 *   confidence: 'high' | 'medium' | 'low',
 * }
 */

const { normText, stripDiacritics, expandTokens, keywordTokens, isWeakWord } = require('./normalize');
const { DOC_TYPES, findTypeByAbbr } = require('./vocab');

const VN_OFFSET_MS = 7 * 3600 * 1000;

/** Ngày hiện tại theo giờ Việt Nam */
function vnToday(now = new Date()) {
  const d = new Date(now.getTime() + VN_OFFSET_MS);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), dow: d.getUTCDay() };
}

function iso(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function addDays(isoDate, days) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

function lastDayOfMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function validDay(y, m, d) {
  return m >= 1 && m <= 12 && d >= 1 && d <= lastDayOfMonth(y, m);
}

function fmtVn(isoDate) {
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}

const ROMAN = { i: 1, ii: 2, iii: 3, iv: 4 };
const WORD_NUM = { mot: 1, nhat: 1, hai: 2, ba: 3, bon: 4, tu: 4, nam: 5 };

/** Năm hợp lý cho "tháng m"/"ngày d/m" không ghi năm: nếu rơi vào tương lai thì lùi về năm trước */
function inferYear(today, m, d = 1) {
  const candidate = iso(today.y, m, d);
  return candidate > iso(today.y, today.m, today.d) ? today.y - 1 : today.y;
}

/**
 * Tách khoảng thời gian. Trả về { from, to, label, rest } với rest là chuỗi đã bỏ phần thời gian.
 */
function extractDateRange(text, now) {
  const today = vnToday(now);
  const todayIso = iso(today.y, today.m, today.d);
  let rest = ` ${text} `;
  const take = (re) => {
    const m = rest.match(re);
    if (m) rest = rest.replace(m[0], ' ');
    return m;
  };
  const dateToken = '(\\d{1,2})[/\\-](\\d{1,2})(?:[/\\-](\\d{4}))?';
  const toIsoParts = (d, m, y) => {
    const dd = Number(d); const mm = Number(m);
    const yy = y ? Number(y) : inferYear(today, mm, dd);
    return validDay(yy, mm, dd) ? iso(yy, mm, dd) : null;
  };

  // 1. Khoảng "từ ... đến ..."
  let m = take(new RegExp(`\\s(?:tu\\s+)?(?:ngay\\s+)?${dateToken}\\s+(?:den|toi|-)\\s+(?:ngay\\s+)?${dateToken}\\s`));
  if (m) {
    const a = toIsoParts(m[1], m[2], m[3] || m[6]);
    const b = toIsoParts(m[4], m[5], m[6]);
    if (a && b) return { from: a <= b ? a : b, to: a <= b ? b : a, label: `từ ${fmtVn(a)} đến ${fmtVn(b)}`, rest };
  }

  // 2. Tương đối
  const rel = [
    [/\shom nay\s/, () => [todayIso, todayIso, 'hôm nay']],
    [/\shom qua\s/, () => { const x = addDays(todayIso, -1); return [x, x, 'hôm qua']; }],
    [/\stuan (?:nay|hien tai)\s/, () => { const off = (today.dow + 6) % 7; return [addDays(todayIso, -off), todayIso, 'tuần này']; }],
    [/\stuan (?:truoc|roi|qua)\s/, () => { const off = (today.dow + 6) % 7; const mon = addDays(todayIso, -off - 7); return [mon, addDays(mon, 6), 'tuần trước']; }],
    [/\sthang (?:nay|hien tai)\s/, () => [iso(today.y, today.m, 1), todayIso, `tháng ${today.m}/${today.y}`]],
    [/\sthang (?:truoc|roi|qua)\s/, () => { const pm = today.m === 1 ? 12 : today.m - 1; const py = today.m === 1 ? today.y - 1 : today.y; return [iso(py, pm, 1), iso(py, pm, lastDayOfMonth(py, pm)), `tháng ${pm}/${py}`]; }],
    [/\snam (?:nay|hien tai)\s/, () => [iso(today.y, 1, 1), todayIso, `năm ${today.y}`]],
    [/\snam (?:ngoai|truoc|roi|qua)\s/, () => [iso(today.y - 1, 1, 1), iso(today.y - 1, 12, 31), `năm ${today.y - 1}`]],
    [/\s(\d{1,3}) ngay (?:qua|gan day|gan nhat|vua qua)\s/, (mm) => [addDays(todayIso, -Number(mm[1]) + 1), todayIso, `${mm[1]} ngày gần đây`]],
    [/\s(?:gan day|moi day|vua qua|dao nay)\s/, () => [addDays(todayIso, -29), todayIso, '30 ngày gần đây']],
  ];
  for (const [re, fn] of rel) {
    m = take(re);
    if (m) { const [from, to, label] = fn(m); return { from, to, label, rest }; }
  }

  // 3. Ngày cụ thể dd/mm[/yyyy]
  m = take(new RegExp(`\\s(?:ngay\\s+)?${dateToken}\\s`));
  if (m) {
    const a = toIsoParts(m[1], m[2], m[3]);
    if (a) return { from: a, to: a, label: `ngày ${fmtVn(a)}`, rest };
  }

  // 4. Tháng: "thang 10", "thang 10/2026", "thang 10 nam 2026", "t10"
  m = take(/\s(?:thang|t)\s*(\d{1,2})(?:\s*(?:\/|-|nam)\s*(\d{4})|\s+(\d{4}))?\s/);
  if (m && Number(m[1]) >= 1 && Number(m[1]) <= 12) {
    const mm = Number(m[1]);
    const yy = m[2] || m[3] ? Number(m[2] || m[3]) : inferYear(today, mm, 1);
    return { from: iso(yy, mm, 1), to: iso(yy, mm, lastDayOfMonth(yy, mm)), label: `tháng ${mm}/${yy}`, rest };
  }

  // 5. Quý
  m = take(/\squy\s+(i{1,3}|iv|[1-4])(?:\s*(?:\/|-|nam)?\s*(\d{4}))?\s/);
  if (m) {
    const q = ROMAN[m[1]] || Number(m[1]);
    const yy = m[2] ? Number(m[2]) : today.y;
    const sm = (q - 1) * 3 + 1;
    return { from: iso(yy, sm, 1), to: iso(yy, sm + 2, lastDayOfMonth(yy, sm + 2)), label: `quý ${q}/${yy}`, rest };
  }

  // 6. Năm
  m = take(/\s(?:nam\s+)?(20\d{2})\s/);
  if (m) {
    const yy = Number(m[1]);
    return { from: iso(yy, 1, 1), to: iso(yy, 12, 31), label: `năm ${yy}`, rest };
  }

  return { from: null, to: null, label: null, rest };
}

/** Tách số ký hiệu đầy đủ "866-CV/TU" (trên chuỗi đã bỏ dấu, viết hoa) */
function extractSoKyHieu(raw) {
  const up = stripDiacritics(raw).toUpperCase();
  const m = up.match(/(\d{1,5})\s*[-–]\s*([A-Z]{1,8})\s*\/\s*([A-Z0-9][A-Z0-9.\-]{0,20}[A-Z0-9]|[A-Z0-9])/);
  if (m) {
    return { soKyHieu: `${Number(m[1])}-${m[2]}/${m[3]}`, number: Number(m[1]), typeAbbr: m[2], matched: m[0] };
  }
  // Dạng thiếu cơ quan: "866-CV", "263-QĐ"
  const p = up.match(/(?:^|[^0-9A-Z])(\d{1,5})\s*[-–]\s*([A-Z]{1,4})(?![A-Z/])/);
  if (p && findTypeByAbbr(p[2])) {
    return { soKyHieu: null, number: Number(p[1]), typeAbbr: p[2], matched: p[0] };
  }
  return null;
}

/** Cụm từ thể loại, ưu tiên cụm dài */
const TYPE_PHRASES = DOC_TYPES
  .flatMap((t) => t.phrases.map((p) => ({ phrase: p, type: t })))
  .sort((a, b) => b.phrase.length - a.phrase.length);

const TYPE_ALT = TYPE_PHRASES.map((x) => x.phrase).join('|');

const COUNT_RE = new RegExp(`\\b(bao nhieu|so luong|thong ke|tong so|tong cong|dem so)\\b|\\bmay\\s+(?:van ban|vb|cv|${TYPE_ALT})\\b`);
const HELP_RE = /^(?:\/?(?:help|start|huongdan|huong dan)|chao|xin chao|chao ban|chao bot|hello|hi|alo|bot oi|ban la ai|cach dung|cach hoi|huong dan su dung|lam sao de hoi|hoi gi duoc)\b/;
const MORE_RE = /^(?:xem them|them nua|xem tiep|tiep theo|tiep di|tiep|trang sau|trang tiep|con nua khong|con nua|con khong|nua|danh sach|xem danh sach|liet ke|liet ke ra|xem het|xem)$/;
const RESET_RE = /^(?:\/moi|\/reset|tim moi|lam moi|bat dau lai|xoa bo loc|hoi cau khac)$/;
const DETAIL_RE = /^(?:xem\s+)?(?:chi tiet\s+)?(?:so|cai|van ban|vb|muc|dong|ket qua)?\s*(?:thu\s+)?(\d{1,2}|mot|nhat|hai|ba|bon|tu|nam)$/;
const FOLLOWUP_RE = /^(?:con|the con|vay con|con nhung|the|vay)\b|\b(?:thi sao|the nao|thi the nao|nua khong|nua)$/;

/**
 * Phân tích câu hỏi.
 * @param {string} text
 * @param {{ now?: Date, session?: object|null, maxResults?: number }} ctx
 */
function parseQuery(text, { now = new Date(), session = null } = {}) {
  const raw = String(text || '').trim();
  const result = {
    intent: 'search',
    filters: { direction: null, theLoai: null, soKyHieu: null, number: null, sourceId: null, dateFrom: null, dateTo: null, dateLabel: null, nguoiKy: null },
    keywords: [],
    genericCongVan: false,
    detailIndex: null,
    isFollowUp: false,
    confidence: 'low',
  };
  if (!raw) { result.intent = 'empty'; return result; }

  const base = normText(raw);
  const hasSessionResults = !!(session && Array.isArray(session.resultIds) && session.resultIds.length);

  // --- Lệnh và ý định đặc biệt (kiểm tra trên câu gốc đã chuẩn hóa) ---
  if (RESET_RE.test(base)) { result.intent = 'reset'; result.confidence = 'high'; return result; }
  if (HELP_RE.test(base) && base.split(' ').length <= 6) { result.intent = 'help'; result.confidence = 'high'; return result; }
  if (hasSessionResults && MORE_RE.test(base)) { result.intent = 'more'; result.confidence = 'high'; return result; }
  const dm = base.match(DETAIL_RE);
  if (hasSessionResults && dm) {
    // Kiểm tra phạm vi để ở bộ điều phối (có thể nằm ngoài trang đang xem)
    const n = WORD_NUM[dm[1]] || Number(dm[1]);
    result.intent = 'detail';
    result.detailIndex = n - 1;
    result.confidence = 'high';
    return result;
  }

  // --- 1. Số ký hiệu (trên câu gốc để giữ ký tự / -) ---
  let rest = ` ${base} `;
  const kh = extractSoKyHieu(raw);
  if (kh) {
    if (kh.soKyHieu) result.filters.soKyHieu = kh.soKyHieu;
    result.filters.number = kh.number;
    const t = findTypeByAbbr(kh.typeAbbr);
    if (t && !t.generic) result.filters.theLoai = t.name;
    if (t && t.generic) result.genericCongVan = true;
    rest = ` ${normText(stripDiacritics(raw).replace(kh.matched, ' '))} `;
  }

  // --- 2. Mã ID phần mềm QLVB (7-9 chữ số) ---
  const idm = rest.match(/\s(?:ma\s+|id\s+)?(\d{7,9})\s/);
  if (idm) {
    result.filters.sourceId = idm[1];
    rest = rest.replace(idm[0], ' ');
  }

  // --- 3. Ý định đếm ---
  if (COUNT_RE.test(base)) result.intent = 'count';

  // --- 4. Thời gian ---
  const dr = extractDateRange(rest.trim(), now);
  if (dr.from) {
    result.filters.dateFrom = dr.from;
    result.filters.dateTo = dr.to;
    result.filters.dateLabel = dr.label;
  }
  rest = ` ${dr.rest.trim()} `;

  // --- 5. Bung viết tắt / sửa lỗi gõ ---
  rest = ` ${expandTokens(rest.trim())} `;
  // "liên quan đến", "gửi đến" (không phải sổ đến) -> bỏ trước khi xác định sổ
  rest = rest.replace(/\s(?:lien quan (?:den|toi)|ve viec|noi dung|trich yeu)\s/g, ' ');

  // --- 6. Người ký ---
  const signerPatterns = [
    /\s(?:do|boi|duoc)?\s*(?:dong chi|d\/c|dc|ong|ba|anh|chi)\s+([a-z]+(?:\s+[a-z]+){0,3}?)\s+ky\s/,
    /\snguoi ky\s+(?:la\s+)?([a-z]+(?:\s+[a-z]+){0,3})\s/,
    /\sky boi\s+(?:dong chi\s+|d\/c\s+)?([a-z]+(?:\s+[a-z]+){0,3})\s/,
    /\s(?:do|boi)\s+([a-z]+(?:\s+[a-z]+){0,2})\s+ky\s/,
  ];
  for (const re of signerPatterns) {
    const sm = rest.match(re);
    if (sm) {
      const nameTokens = sm[1].replace(/\bvan ban\b/g, ' ').trim().split(/\s+/)
        .filter((t) => t && !['nao', 'gi', 'ai', 'cong', 'da', 'duoc', 'nguoi', 'la'].includes(t));
      if (nameTokens.length && nameTokens.some((t) => t.length >= 2)) {
        result.filters.nguoiKy = nameTokens.join(' ');
        rest = rest.replace(sm[0], ' ');
        break;
      }
    }
  }

  // --- 7. Thể loại ---
  // "công văn" là từ chung; nếu đi kèm thể loại khác ("công văn hướng dẫn...") thì thể loại đó
  // chỉ là từ khóa mềm, không lọc cứng. Thể loại thứ hai trở đi cũng giữ làm từ khóa.
  const genericRe = /\s(?:cong van|cv)\s/;
  if (genericRe.test(rest)) {
    result.genericCongVan = true;
    rest = rest.replace(new RegExp(genericRe.source, 'g'), ' ');
  }
  if (result.filters.theLoai) {
    // Thể loại đã lấy từ số ký hiệu: bỏ cụm từ trùng ("kế hoạch 120-KH/ĐU")
    const t = DOC_TYPES.find((x) => x.name === result.filters.theLoai);
    for (const p of t ? t.phrases : []) rest = rest.replace(` ${p} `, ' ');
  }
  if (!result.filters.theLoai && !result.genericCongVan) {
    let best = null;
    for (const { phrase, type } of TYPE_PHRASES) {
      if (type.generic) continue;
      const idx = rest.indexOf(` ${phrase} `);
      if (idx >= 0 && (!best || idx < best.idx)) best = { idx, phrase, type };
    }
    if (best) {
      result.filters.theLoai = best.type.name;
      rest = rest.replace(` ${best.phrase} `, ' ');
    }
  }

  // --- 8. Số văn bản: "số 253", "quyết định 263", "cv 253" ---
  if (result.filters.number === null) {
    const nm = rest.match(/\s(?:so|cv|vb|van ban)\s+(?:so\s+)?(\d{1,5})\s/)
      || (result.filters.theLoai || result.genericCongVan ? rest.match(/^\s*(?:so\s+)?(\d{1,5})\s/) : null)
      || (/^\s*\d{1,5}\s*$/.test(rest) && !hasSessionResults ? rest.match(/(\d{1,5})/) : null);
    if (nm) {
      result.filters.number = Number(nm[1]);
      rest = rest.replace(nm[0], ' ');
    }
  }

  // --- 9. Sổ đến / sổ đi ---
  const isDen = /\s(?:den|nhan duoc|nhan ve|gui ve|gui den|so den|duoc gui)\s/.test(rest);
  const isDi = /\s(?:di|ban hanh|phat hanh|gui di|so di|da gui|xa ban hanh|dang uy ban hanh)\s/.test(rest);
  if (isDen && !isDi) result.filters.direction = 'den';
  else if (isDi && !isDen) result.filters.direction = 'di';
  rest = rest.replace(/\s(?:nhan duoc|nhan ve|gui ve|gui den|so den|duoc gui|ban hanh|phat hanh|gui di|so di|da gui)(?=\s)/g, ' ');
  if (result.filters.direction) rest = rest.replace(/\s(?:den|di)(?=\s)/g, ' ');

  // --- 10. Từ khóa nội dung ---
  result.keywords = keywordTokens(rest.replace(/\s+/g, ' ').trim());

  // --- 11. Câu nối tiếp: giữ bộ lọc cũ, chỉ thay phần vừa nói ---
  if (session && session.filters && FOLLOWUP_RE.test(base)) {
    result.isFollowUp = true;
    result.keywords = result.keywords.filter((k) => !['con', 'the', 'vay', 'sao', 'nao'].includes(k));
    const prev = session.filters;
    const f = result.filters;
    for (const key of Object.keys(f)) {
      if (f[key] === null && prev[key] !== undefined && prev[key] !== null) f[key] = prev[key];
    }
    // Đổi khoảng thời gian thì phải đổi cả nhãn
    if (result.filters.dateFrom && !dr.from && prev.dateLabel) result.filters.dateLabel = prev.dateLabel;
    if (!result.keywords.length && Array.isArray(session.keywords)) result.keywords = session.keywords.slice();
    if (session.intent === 'count' && result.intent === 'search') result.intent = 'count';
  }

  // --- 12. Độ tin cậy ---
  const f = result.filters;
  const structured = [f.direction, f.theLoai, f.soKyHieu, f.number, f.sourceId, f.dateFrom, f.nguoiKy].filter((v) => v !== null).length;
  const strongKeywords = result.keywords.filter((k) => !isWeakWord(k)).length;
  if (f.soKyHieu || f.sourceId) result.confidence = 'high';
  else if (structured >= 1 || strongKeywords >= 1) result.confidence = 'medium';
  else if (result.genericCongVan && result.intent === 'count') result.confidence = 'medium';
  else result.confidence = 'low';

  return result;
}

module.exports = { parseQuery, extractDateRange, extractSoKyHieu, vnToday, fmtVn, iso };
