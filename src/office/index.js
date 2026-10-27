/**
 * Bộ điều phối luồng Tra cứu Sổ công văn.
 *
 * Quy trình mỗi tin nhắn:
 *  1. Nạp trạng thái hội thoại (bộ nhớ ngắn hạn 30 phút, chỉ lưu bộ lọc + danh sách ID).
 *  2. Phân tích bằng quy tắc (0 token).
 *  3. Chỉ khi quy tắc không chắc chắn hoặc tìm ra 0 kết quả -> AI viết lại câu hỏi thành bộ lọc.
 *  4. Tìm kiếm, soạn trả lời, lưu trạng thái.
 */

const config = require('../config');
const store = require('./store');
const { parseQuery } = require('./query-parser');
const { normText, isWeakWord } = require('./normalize');
const { search } = require('./search');
const aiRewriter = require('./ai-rewriter');
const responder = require('./responder');

const MAX_SESSION_IDS = 50;
const OVERVIEW_TTL_MS = 60 * 1000;
let overviewCache = { at: 0, value: null };

async function getOverviewCached() {
  if (overviewCache.value && Date.now() - overviewCache.at < OVERVIEW_TTL_MS) return overviewCache.value;
  try {
    const value = await store.getOverview();
    overviewCache = { at: Date.now(), value };
    return value;
  } catch (_) {
    return overviewCache.value;
  }
}

/** Gọi sau khi nhập Excel để ngày chốt dữ liệu hiển thị ngay */
function invalidateOverview() {
  overviewCache = { at: 0, value: null };
}

function pageSize() {
  return Math.min(Math.max(config.office.maxResults || 5, 1), 10);
}

function result(answer, subIntent, extra = {}) {
  return {
    answer,
    intent: 'office_lookup',
    retrievedDocs: extra.retrievedDocs || [],
    meta: { subIntent, ...extra.meta },
  };
}

const docCodes = (docs) => docs.map((x) => x.so_ky_hieu || x.source_id).filter(Boolean).slice(0, 20);

/** Có nên nhờ AI viết lại không (khi tìm ra 0 kết quả) */
function shouldRetryWithAi(parsed) {
  if (!config.office.aiRewrite) return false;
  if (parsed.filters.sourceId) return false; // tra theo Mã: không cần AI
  if (parsed.reusedKeywords) return false; // lọc tiếp chủ đề cũ: AI không biết chủ đề nên dễ trả sai
  return true;
}

/** Chủ đề có dấu để hiển thị: lấy lại từ gốc người dùng gõ ứng với từng từ khóa */
function topicOf(text, keywords) {
  if (!keywords.length) return null;
  const tokens = String(text).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return keywords.map((k) => tokens.find((t) => normText(t) === k) || k).join(' ').slice(0, 100);
}

/**
 * Xử lý một câu hỏi tra cứu.
 * @param {{ text: string, sessionId: string, now?: Date }} input
 * @returns {Promise<{ answer: string, intent: string, retrievedDocs: string[], meta: object }>}
 */
async function handleOfficeMessage({ text, sessionId, now = new Date() }) {
  const ttl = config.office.sessionTtlMinutes || 30;
  const limit = pageSize();
  const session = await store.getSession(sessionId, ttl).catch(() => null);
  let parsed = parseQuery(text, { now, session });

  // --- Lệnh hội thoại ---
  if (parsed.intent === 'empty' || parsed.intent === 'help') return result(responder.formatHelp(), 'help');
  if (parsed.intent === 'reset') {
    await store.clearSession(sessionId).catch(() => {});
    return result(responder.formatReset(), 'reset');
  }
  if (parsed.intent === 'detail') {
    const ids = session?.resultIds || [];
    if (parsed.detailIndex < 0 || parsed.detailIndex >= ids.length) {
      return result(responder.formatDetailOutOfRange(ids.length), 'detail_out_of_range');
    }
    const [doc] = await store.getDocumentsByIds([ids[parsed.detailIndex]]);
    if (!doc) return result(responder.formatDetailOutOfRange(ids.length), 'detail_missing');
    await store.saveSession(sessionId, session).catch(() => {});
    return result(responder.formatDetail(doc, await getOverviewCached()), 'detail', { retrievedDocs: docCodes([doc]) });
  }
  if (parsed.intent === 'more') {
    const ids = session?.resultIds || [];
    const fromCount = session.intent === 'count' && !session.listed;
    const offset = fromCount ? 0 : (session.offset || 0) + limit;
    if (offset >= ids.length) {
      const capped = (session.total || 0) > ids.length;
      return result(capped
        ? `Đã hiển thị ${ids.length} kết quả đầu tiên. Đồng chí vui lòng thu hẹp điều kiện (thêm tháng, thể loại, từ khóa) để xem chính xác hơn.`
        : responder.formatNoMore(), 'more_end');
    }
    const docs = await store.getDocumentsByIds(ids.slice(offset, offset + limit));
    await store.saveSession(sessionId, { ...session, offset, listed: true }).catch(() => {});
    const answer = session.usedRelated
      ? responder.formatList({ docs, total: ids.length, offset, filters: session.filters, overview: await getOverviewCached(), title: `Văn bản gần giống (${offset + 1}-${offset + docs.length}/${ids.length}):` })
      : responder.formatList({ docs, total: session.total || ids.length, offset, filters: session.filters, overview: await getOverviewCached() });
    return result(answer, 'more', { retrievedDocs: docCodes(docs) });
  }

  // --- Tìm kiếm / đếm ---
  let aiUsed = false;
  let aiFromCache = false;
  let aiOutOfScope = false;
  const prevFilters = parsed.isFollowUp ? session?.filters || null : null;

  const tryAi = async () => {
    const ai = await aiRewriter.rewriteQuery(text, { now, prevFilters });
    if (!ai) return null;
    aiUsed = true;
    aiFromCache = !!ai.fromCache;
    if (ai.inScope === false) { aiOutOfScope = true; return null; }
    return ai;
  };

  if (parsed.confidence === 'low' && config.office.aiRewrite) {
    const ai = await tryAi();
    if (ai) parsed = ai;
  }

  let found = await search(parsed, { limit, maxIds: MAX_SESSION_IDS });

  // Lọc tiếp mà ra 0 và câu vừa nhắn tự đứng được ("văn bản đến tháng 10") -> coi là câu hỏi mới.
  // Ngày trần ("năm 2025") luôn là lọc tiếp: báo không có kèm chủ đề, không liệt kê cả năm.
  if (parsed.isRefinement && found.total === 0 && !found.related.length) {
    const fresh = parseQuery(text, { now });
    const ff = fresh.filters;
    const standalone = ff.direction || ff.theLoai || ff.nguoiKy || fresh.keywords.some((k) => !isWeakWord(k));
    const retry = standalone ? await search(fresh, { limit, maxIds: MAX_SESSION_IDS }) : null;
    if (retry && retry.total > 0) {
      parsed = fresh;
      found = retry;
    }
  }

  if (found.total === 0 && !aiUsed && shouldRetryWithAi(parsed)) {
    const ai = await tryAi();
    if (ai) {
      const retry = await search(ai, { limit, maxIds: MAX_SESSION_IDS });
      if (retry.total > 0 || (retry.related.length && !found.related.length)) {
        parsed = ai;
        found = retry;
      }
    }
  }

  const overview = await getOverviewCached();
  const meta = { aiUsed, aiFromCache, total: found.total, confidence: parsed.confidence, filters: parsed.filters };

  if (found.total === 0 && !found.related.length && aiOutOfScope) {
    return result(responder.formatOutOfScope(), 'out_of_scope', { meta });
  }

  // Lọc tiếp cùng chủ đề: ghi rõ chủ đề trên tiêu đề để người dùng thấy bot vẫn nhớ
  const sameTopic = !!parsed.reusedKeywords;
  const topic = sameTopic ? (session?.topic || parsed.keywords.join(' ')) : topicOf(text, parsed.keywords || []);
  const keywordsText = sameTopic ? topic : undefined;
  // Thể loại chỉ đoán từ trích yếu mà kết quả có văn bản khác loại -> bỏ khỏi tiêu đề và phiên
  const shownFilters = found.typeRelaxed ? { ...parsed.filters, theLoai: null } : parsed.filters;

  await store.saveSession(sessionId, {
    filters: shownFilters,
    keywords: parsed.keywords,
    topic,
    resultIds: found.resultIds,
    offset: 0,
    total: found.total,
    intent: parsed.intent,
    usedRelated: found.usedRelated,
    listed: parsed.intent !== 'count',
    lastQuery: String(text).slice(0, 200),
  }).catch(() => {});

  if (parsed.intent === 'count') {
    return result(responder.formatCount({ total: found.total, counts: found.counts, filters: parsed.filters, keywordsText }), 'count', { meta });
  }
  if (found.total > 0) {
    return result(
      responder.formatList({ docs: found.matches, total: found.total, offset: 0, filters: shownFilters, keywordsText, overview }),
      'search', { meta, retrievedDocs: docCodes(found.matches) }
    );
  }
  if (found.related.length) {
    return result(
      responder.formatRelated({ docs: found.related, query: sameTopic ? `${topic} (${text})` : text, overview }),
      'related', { meta, retrievedDocs: docCodes(found.related) }
    );
  }
  return result(responder.formatNotFound({ query: text, filters: parsed.filters, keywordsText }), 'not_found', { meta });
}

module.exports = { handleOfficeMessage, invalidateOverview, getOverviewCached };
