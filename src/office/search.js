/**
 * Tìm kiếm Sổ công văn: SQL lọc thô (store.fetchCandidates), JS lọc chính xác + chấm điểm.
 * Không phụ thuộc pg_trgm/unaccent để chạy được cả trên bộ nhớ dự phòng.
 */

const store = require('./store');
const { normText, stripDiacritics, trigramSimilarity, isWeakWord } = require('./normalize');
const { findTypeByName, findTypeByAbbr } = require('./vocab');

const MATCH_THRESHOLD = 0.75;
const RELATED_THRESHOLD = 0.5;
const CANDIDATE_LIMIT = 3000;
const INCOMING_DATE_WIDEN_DAYS = 60; // văn bản đến: ngày nhận có thể trễ hơn ngày văn bản

function addDays(isoDate, days) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** Chuẩn hóa số ký hiệu để so sánh: "866 - CV/TU" -> "866-CV/TU" */
function normKyHieu(s) {
  const up = stripDiacritics(String(s || '')).toUpperCase().replace(/[–—]/g, '-').replace(/\s+/g, '');
  return up.replace(/^0+(\d)/, '$1');
}

/** Phần viết tắt thể loại trong số ký hiệu: "866-CV/TU" -> "CV" */
function kyHieuTypeAbbr(soKyHieu) {
  const m = normKyHieu(soKyHieu).match(/^\d+-([A-Z]+)/);
  return m ? m[1] : null;
}

/** Ngày hiệu lực để lọc theo thời gian: sổ đến dùng ngày nhận, sổ đi dùng ngày văn bản */
function effectiveDate(doc) {
  return doc.direction === 'den' ? (doc.thoi_gian_nhan || doc.ngay_van_ban) : doc.ngay_van_ban;
}

// ------------------------------------------------------------
// Bộ lọc
// ------------------------------------------------------------

/** Bộ lọc cứng: sai là loại */
function passesHardFilters(doc, f) {
  if (f.direction && doc.direction !== f.direction) return false;
  if (f.sourceId && String(doc.source_id) !== String(f.sourceId)) return false;
  if (f.dateFrom || f.dateTo) {
    const d = effectiveDate(doc);
    if (!d) return false;
    if (f.dateFrom && d < f.dateFrom) return false;
    if (f.dateTo && d > f.dateTo) return false;
  }
  return true;
}

function matchTheLoai(doc, theLoai) {
  if (normText(doc.the_loai || '') === normText(theLoai)) return true;
  const type = findTypeByName(theLoai);
  const abbr = kyHieuTypeAbbr(doc.so_ky_hieu);
  return !!(type && abbr && type.abbr.includes(abbr));
}

function matchNumber(doc, number) {
  const n = parseInt(normKyHieu(doc.so_ky_hieu), 10);
  return n === number || Number(doc.so_dang_ky) === number;
}

function matchSigner(doc, nguoiKy) {
  const signer = ` ${normText(doc.nguoi_ky || '')} `;
  const tokens = String(nguoiKy).split(/\s+/).filter(Boolean);
  return tokens.length > 0 && tokens.every((t) => signer.includes(` ${t} `));
}

/** Bộ lọc mềm: trả về { total, passed } để tính độ gần đúng khi không có kết quả khớp hoàn toàn */
function softFilterResult(doc, f) {
  const checks = [];
  if (f.theLoai) checks.push(matchTheLoai(doc, f.theLoai));
  if (f.soKyHieu) checks.push(normKyHieu(doc.so_ky_hieu) === normKyHieu(f.soKyHieu));
  if (f.number !== null && f.number !== undefined) checks.push(matchNumber(doc, f.number));
  if (f.nguoiKy) checks.push(matchSigner(doc, f.nguoiKy));
  return { total: checks.length, passed: checks.filter(Boolean).length };
}

// ------------------------------------------------------------
// Chấm điểm từ khóa
// ------------------------------------------------------------

function tokenMatch(keyword, docTokens) {
  let best = 0;
  for (const t of docTokens) {
    if (t === keyword) return 1;
    if (keyword.length >= 3 && t.length >= 3 && (t.startsWith(keyword) || keyword.startsWith(t))) best = Math.max(best, 0.85);
    else if (keyword.length >= 5 && t.length >= 4) {
      const sim = trigramSimilarity(keyword, t);
      if (sim >= 0.6) best = Math.max(best, sim);
    }
  }
  return best;
}

/**
 * Điểm 0..1(+thưởng cụm). Từ nhập nhằng (weak) có trọng số thấp.
 * strongHit: có ít nhất một từ khóa mạnh khớp.
 */
function keywordScore(doc, keywords) {
  if (!keywords.length) return { score: 1, strongHit: true, hasStrong: false };
  const norm = doc.search_norm || normText([doc.so_ky_hieu, doc.trich_yeu, doc.the_loai].join(' '));
  const docTokens = new Set(norm.split(/[\s/-]+/).filter(Boolean));
  let sum = 0;
  let weightSum = 0;
  let strongHit = false;
  let hasStrong = false;
  for (const k of keywords) {
    const weak = isWeakWord(k);
    const w = weak ? 0.3 : 1;
    const m = tokenMatch(k, docTokens);
    if (!weak) { hasStrong = true; if (m >= 0.75) strongHit = true; }
    sum += w * m;
    weightSum += w;
  }
  let score = weightSum ? sum / weightSum : 0;
  if (keywords.length >= 2 && ` ${norm} `.includes(` ${keywords.join(' ')} `)) score += 0.15;
  return { score, strongHit: hasStrong ? strongHit : true, hasStrong };
}

// ------------------------------------------------------------
// Tìm kiếm chính
// ------------------------------------------------------------

function buildCandidateQuery(parsed) {
  const f = parsed.filters;
  const strong = parsed.keywords.filter((k) => !isWeakWord(k));
  let prefixes = strong.map((k) => k.slice(0, Math.min(k.length, 3)));
  if (!prefixes.length && f.nguoiKy) prefixes = f.nguoiKy.split(' ').filter((t) => t.length >= 2);
  if (f.soKyHieu && f.number !== null && f.number !== undefined) prefixes = [`${f.number}-`];
  return {
    direction: f.direction || null,
    dateFrom: f.dateFrom ? addDays(f.dateFrom, f.direction === 'di' ? 0 : -INCOMING_DATE_WIDEN_DAYS) : null,
    dateTo: f.dateTo || null,
    sourceId: f.sourceId || null,
    keywordPrefixes: [...new Set(prefixes)],
    limit: CANDIDATE_LIMIT,
  };
}

/**
 * Chấm điểm và phân loại toàn bộ ứng viên.
 * @returns {{ matches: object[], related: object[] }} đã sắp xếp, mỗi phần tử có _score
 */
function rankCandidates(candidates, parsed) {
  const f = parsed.filters;
  const matches = [];
  const related = [];
  for (const doc of candidates) {
    if (!passesHardFilters(doc, f)) continue;
    const soft = softFilterResult(doc, f);
    const kw = keywordScore(doc, parsed.keywords);
    let score = kw.score;
    if (parsed.genericCongVan && kyHieuTypeAbbr(doc.so_ky_hieu) === 'CV') score += 0.05;

    const softAll = soft.passed === soft.total;
    const kwOk = !kw.hasStrong || (kw.strongHit && kw.score >= MATCH_THRESHOLD);
    if (softAll && kwOk) {
      matches.push({ ...doc, _score: score });
      continue;
    }
    const softRatio = soft.total ? soft.passed / soft.total : null;
    const relKw = parsed.keywords.length ? Math.min(kw.score, 1) : null;
    let relScore = 0;
    if (softRatio !== null && relKw !== null) relScore = softRatio * 0.5 + relKw * 0.5;
    else if (softRatio !== null) relScore = softRatio;
    else if (relKw !== null) relScore = relKw;
    if (relScore >= RELATED_THRESHOLD) {
      related.push({ ...doc, _score: relScore });
    }
  }
  const byScoreThenDate = (a, b) => (b._score - a._score)
    || String(effectiveDate(b) || '').localeCompare(String(effectiveDate(a) || ''))
    || (b.id - a.id);
  const byDate = (a, b) => String(effectiveDate(b) || '').localeCompare(String(effectiveDate(a) || '')) || (b.id - a.id);
  matches.sort(parsed.keywords.length ? byScoreThenDate : byDate);
  related.sort(byScoreThenDate);
  return { matches, related };
}

/**
 * Tìm theo câu hỏi đã phân tích.
 * @returns {{ total, matches, related, resultIds, counts? }}
 */
async function search(parsed, { limit = 5, offset = 0, maxIds = 50 } = {}) {
  const candidates = await store.fetchCandidates(buildCandidateQuery(parsed));
  const { matches, related } = rankCandidates(candidates, parsed);
  const out = {
    total: matches.length,
    matches: matches.slice(offset, offset + limit),
    related: matches.length ? [] : related.slice(0, limit),
    resultIds: (matches.length ? matches : related).slice(0, maxIds).map((d) => d.id),
    usedRelated: !matches.length && related.length > 0,
  };
  if (parsed.intent === 'count') out.counts = countBreakdown(matches);
  return out;
}

/** Thống kê theo sổ và thể loại */
function countBreakdown(docs) {
  const byDirection = { den: 0, di: 0 };
  const byType = new Map();
  for (const d of docs) {
    byDirection[d.direction] = (byDirection[d.direction] || 0) + 1;
    const t = d.the_loai || findTypeByAbbr(kyHieuTypeAbbr(d.so_ky_hieu) || '')?.name || 'Khác';
    byType.set(t, (byType.get(t) || 0) + 1);
  }
  return {
    byDirection,
    byType: [...byType.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })),
  };
}

// ------------------------------------------------------------
// Bảng tra cứu trên web (sắp xếp + phân trang)
// ------------------------------------------------------------

const SORTABLE = {
  ngay: (d) => effectiveDate(d) || '',
  so_ky_hieu: (d) => normKyHieu(d.so_ky_hieu),
  the_loai: (d) => normText(d.the_loai || ''),
  trich_yeu: (d) => normText(d.trich_yeu || ''),
  nguoi_ky: (d) => normText(d.nguoi_ky || ''),
  source_id: (d) => String(d.source_id || ''),
};

/**
 * Lọc + sắp xếp + phân trang trên tập đã xếp hạng (dùng khi có ô tìm tự do).
 * sort = 'relevance' giữ thứ tự điểm.
 */
function paginateRanked(docs, { sort = 'relevance', order = 'desc', page = 1, pageSize = 20, maxPageSize = 100 } = {}) {
  let list = docs;
  if (sort !== 'relevance' && SORTABLE[sort]) {
    const key = SORTABLE[sort];
    const dir = order === 'asc' ? 1 : -1;
    list = [...docs].sort((a, b) => {
      const ka = key(a); const kb = key(b);
      if (sort === 'so_ky_hieu') {
        const na = parseInt(ka, 10); const nb = parseInt(kb, 10);
        if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return (na - nb) * dir;
      }
      return (ka < kb ? -1 : ka > kb ? 1 : 0) * dir || (b.id - a.id);
    });
  }
  const size = Math.min(Math.max(parseInt(pageSize, 10) || 20, 1), maxPageSize);
  const total = list.length;
  const pages = Math.max(1, Math.ceil(total / size));
  const current = Math.min(Math.max(parseInt(page, 10) || 1, 1), pages);
  return { total, page: current, pages, pageSize: size, items: list.slice((current - 1) * size, current * size) };
}

module.exports = {
  search,
  rankCandidates,
  buildCandidateQuery,
  paginateRanked,
  countBreakdown,
  effectiveDate,
  normKyHieu,
  keywordScore,
  SORTABLE,
};
