/**
 * Lớp AI "rào" câu hỏi: chỉ gọi khi quy tắc cục bộ không chắc chắn hoặc tìm không ra.
 * Gemini CHỈ nhận câu hỏi của người dùng (+ bộ lọc trước đó dạng JSON) và trả về bộ lọc JSON.
 * Tuyệt đối không gửi trích yếu / dữ liệu sổ công văn ra ngoài.
 */

const crypto = require('crypto');
const config = require('../config');
const db = require('../db');
const keyManager = require('../gemini/key-manager');
const { normText, expandTokens, keywordTokens } = require('./normalize');
const { DOC_TYPES } = require('./vocab');
const { vnToday, iso, fmtVn } = require('./query-parser');

const CACHE_PREFIX = 'office_rw:';
const CACHE_TTL_HOURS = 30 * 24;
const MAX_QUESTION_CHARS = 300;
const TYPE_NAMES = DOC_TYPES.map((t) => t.name);
const RELATIVE_RE = /\b(hom nay|hom qua|tuan|thang nay|thang truoc|thang roi|nam nay|nam ngoai|nam truoc|gan day|moi day|vua qua|quy nay|dao nay|ngay qua)\b/;

function buildPrompt(question, todayIso, prevFilters) {
  const prev = prevFilters ? `\nBộ lọc của câu trước (dùng nếu câu này hỏi tiếp): ${JSON.stringify(prevFilters)}` : '';
  return (
    'Bạn chuyển câu hỏi tra cứu sổ công văn đến/đi của Văn phòng Đảng ủy xã thành bộ lọc JSON. ' +
    'Câu hỏi có thể viết tắt, sai chính tả, không dấu. Chỉ trả JSON, không giải thích.\n' +
    `Hôm nay: ${todayIso}. Thể loại hợp lệ: ${TYPE_NAMES.join(', ')}.\n` +
    'Khóa JSON:\n' +
    '{"pham_vi":true nếu là câu hỏi tìm/đếm văn bản trong sổ công văn, false nếu hỏi việc khác,' +
    '"huong":"den"|"di"|null,"the_loai":tên thể loại hợp lệ|null (chữ "công văn" chung chung thì null),' +
    '"so_ky_hieu":"vd 866-CV/TU"|null,"so":số văn bản|null,"tu_ngay":"YYYY-MM-DD"|null,"den_ngay":"YYYY-MM-DD"|null,' +
    '"nguoi_ky":"họ tên có dấu"|null,"tu_khoa":"từ khóa nội dung tiếng Việt có dấu, sửa chính tả"|"",' +
    '"dem":true nếu hỏi số lượng,"cau_chuan":"câu hỏi viết lại có dấu, chuẩn"}' +
    `${prev}\nCâu hỏi: ${JSON.stringify(question)}`
  );
}

function sha1(text) {
  return crypto.createHash('sha1').update(text).digest('hex');
}

function cacheKeyFor(question, todayIso) {
  const norm = normText(question);
  const timeScope = RELATIVE_RE.test(norm) ? todayIso : todayIso.slice(0, 4);
  return `${CACHE_PREFIX}${sha1(`${timeScope}|${norm}`)}`;
}

const isIsoDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
const cleanStr = (s, max) => (typeof s === 'string' ? s.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max) : '');

/** Kiểm tra chặt đầu ra của AI theo danh sách trắng */
function validateAiOutput(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = {
    inScope: raw.pham_vi !== false,
    direction: raw.huong === 'den' || raw.huong === 'di' ? raw.huong : null,
    theLoai: TYPE_NAMES.includes(raw.the_loai) && raw.the_loai !== 'Công văn' ? raw.the_loai : null,
    soKyHieu: null,
    number: null,
    dateFrom: isIsoDate(raw.tu_ngay) ? raw.tu_ngay : null,
    dateTo: isIsoDate(raw.den_ngay) ? raw.den_ngay : null,
    nguoiKy: cleanStr(raw.nguoi_ky, 60) || null,
    keywordsText: cleanStr(raw.tu_khoa, 150),
    count: raw.dem === true,
    normalizedQuestion: cleanStr(raw.cau_chuan, 200),
  };
  const kh = cleanStr(raw.so_ky_hieu, 40);
  if (/^\d{1,5}-[A-Za-zĐđ]{1,8}\/[A-Za-zĐđ0-9.\-]{1,20}$/.test(kh)) out.soKyHieu = kh;
  const n = Number(raw.so);
  if (Number.isInteger(n) && n > 0 && n < 100000) out.number = n;
  if (out.soKyHieu && !out.number) out.number = parseInt(out.soKyHieu, 10);
  if (out.dateFrom && out.dateTo && out.dateFrom > out.dateTo) [out.dateFrom, out.dateTo] = [out.dateTo, out.dateFrom];
  if (out.dateFrom && !out.dateTo) out.dateTo = out.dateFrom;
  if (out.dateTo && !out.dateFrom) out.dateFrom = out.dateTo;
  return out;
}

/** Đổi đầu ra AI đã kiểm tra thành cấu trúc giống parseQuery */
function toParsed(ai) {
  let dateLabel = null;
  if (ai.dateFrom) dateLabel = ai.dateFrom === ai.dateTo ? `ngày ${fmtVn(ai.dateFrom)}` : `từ ${fmtVn(ai.dateFrom)} đến ${fmtVn(ai.dateTo)}`;
  return {
    intent: ai.count ? 'count' : 'search',
    filters: {
      direction: ai.direction,
      theLoai: ai.theLoai,
      soKyHieu: ai.soKyHieu,
      number: ai.number,
      sourceId: null,
      dateFrom: ai.dateFrom,
      dateTo: ai.dateTo,
      dateLabel,
      nguoiKy: ai.nguoiKy ? (normText(ai.nguoiKy).replace(/^(?:dong chi|d\/c|dc|ong|ba|anh|chi)\s+/, '') || null) : null,
    },
    keywords: keywordTokens(expandTokens(normText(ai.keywordsText)))
      .filter((k) => !(ai.nguoiKy && normText(ai.nguoiKy).split(' ').includes(k))),
    genericCongVan: false,
    detailIndex: null,
    isFollowUp: false,
    confidence: 'ai',
    inScope: ai.inScope,
    normalizedQuestion: ai.normalizedQuestion,
  };
}

function extractJson(text) {
  const t = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(t.slice(start, end + 1)); } catch (_) { return null; }
}

async function callGemini(prompt) {
  let key = keyManager.getKeyForRole('rewrite');
  if (!key) return null;
  const deadline = Date.now() + (config.office.aiRewriteTimeoutMs || 5000);
  const models = [...new Set([config.office.aiModel, config.gemini.model].filter(Boolean))];
  const body = JSON.stringify({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0, maxOutputTokens: 256, responseMimeType: 'application/json' },
  });
  const call = (model, k) => fetch(`${config.gemini.baseUrl}/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': k },
    body,
    signal: AbortSignal.timeout(Math.max(deadline - Date.now(), 1)),
  });

  for (const model of models) {
    if (deadline - Date.now() < 300) break;
    let res = await call(model, key);
    if (res.status === 429) {
      keyManager.markRateLimited(key);
      const backup = keyManager.getKeyForRole('rewrite', key);
      if (backup && backup !== key && deadline - Date.now() > 300) { key = backup; res = await call(model, key); }
    }
    if (res.ok) {
      const data = await res.json();
      return data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || null;
    }
    console.warn(`[Office AI] ${model} trả về mã ${res.status}`);
  }
  return null;
}

/**
 * Viết lại câu hỏi thành bộ lọc. Lỗi/timeout -> trả null (luồng chính vẫn chạy bằng quy tắc).
 * @param {string} question
 * @param {{ now?: Date, prevFilters?: object|null }} ctx
 * @returns {Promise<object|null>} cấu trúc như parseQuery, kèm inScope, fromCache
 */
async function rewriteQuery(question, { now = new Date(), prevFilters = null } = {}) {
  if (!config.office.aiRewrite) return null;
  const q = String(question || '').trim().slice(0, MAX_QUESTION_CHARS);
  if (!q) return null;
  const t = vnToday(now);
  const todayIso = iso(t.y, t.m, t.d);
  const useCache = !prevFilters; // có ngữ cảnh hội thoại thì không dùng cache
  const key = cacheKeyFor(q, todayIso);

  if (useCache) {
    const hit = await db.getCachedResponse(key).catch(() => null);
    if (hit && hit.response_text) {
      const ai = validateAiOutput(extractJson(hit.response_text));
      if (ai) return { ...toParsed(ai), fromCache: true };
    }
  }

  try {
    const compactPrev = prevFilters
      ? Object.fromEntries(Object.entries(prevFilters).filter(([k, v]) => v !== null && v !== undefined && k !== 'dateLabel'))
      : null;
    const text = await callGemini(buildPrompt(q, todayIso, compactPrev));
    const raw = extractJson(text);
    const ai = validateAiOutput(raw);
    if (!ai) return null;
    if (useCache) {
      db.setCachedResponse({
        cacheKey: key,
        originalQuery: q,
        intent: 'office_rewrite',
        responseText: JSON.stringify(raw),
        ttlHours: CACHE_TTL_HOURS,
      }).catch(() => {});
    }
    return { ...toParsed(ai), fromCache: false };
  } catch (err) {
    console.warn(`[Office AI] Bỏ qua viết lại câu hỏi: ${err.message}`);
    return null;
  }
}

module.exports = { rewriteQuery, validateAiOutput, toParsed, buildPrompt, cacheKeyFor, extractJson };
