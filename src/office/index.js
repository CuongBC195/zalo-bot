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
  return true;
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

  await store.saveSession(sessionId, {
    filters: parsed.filters,
    keywords: parsed.keywords,
    resultIds: found.resultIds,
    offset: 0,
    total: found.total,
    intent: parsed.intent,
    usedRelated: found.usedRelated,
    listed: parsed.intent !== 'count',
    lastQuery: String(text).slice(0, 200),
  }).catch(() => {});

  if (parsed.intent === 'count') {
    return result(responder.formatCount({ total: found.total, counts: found.counts, filters: parsed.filters }), 'count', { meta });
  }
  if (found.total > 0) {
    return result(
      responder.formatList({ docs: found.matches, total: found.total, offset: 0, filters: parsed.filters, overview }),
      'search', { meta, retrievedDocs: docCodes(found.matches) }
    );
  }
  if (found.related.length) {
    return result(
      responder.formatRelated({ docs: found.related, query: text, overview }),
      'related', { meta, retrievedDocs: docCodes(found.related) }
    );
  }
  return result(responder.formatNotFound({ query: text, filters: parsed.filters }), 'not_found', { meta });
}

module.exports = { handleOfficeMessage, invalidateOverview, getOverviewCached };
