/**
 * Dựng truy vấn tìm điều khoản trên PostgreSQL (thuần, không chạm DB) cho DatabaseService.searchArticles.
 * Tách riêng để kiểm thử offline và chạy bộ đánh giá thứ hạng (scripts/eval-search.js).
 *
 * Điểm xếp hạng bám theo bản tìm trong RAM (src/rag/index.js#_searchMemory):
 *   - mỗi từ khóa có trong điều khoản +1, tỷ lệ phủ từ khóa x5
 *   - mỗi từ khóa có trong TIÊU ĐỀ điều khoản +3, mỗi cặp từ liền nhau có trong tiêu đề +4 (trong nội dung +2)
 *   - mã ký có dấu "/" (T/M, K/T, T/L, T/U) giữ nguyên thành một từ khóa, khớp tiêu đề được cộng thêm
 * ts_rank_cd thô không còn được cộng thẳng: với truy vấn OR nó tăng theo độ dài điều khoản
 * (01-HD/TW Mục 8.1 dài 8.000+ ký tự đạt ~44 điểm), lấn át mọi điểm cộng khác.
 */

const { extractDocNumbers, extractDocSignatures } = require('../rag/abbreviations');

const KHUNG_PL_REGEX = /(khung\s*ph[aâ]n\s*lo[aạ]i|ph[uư][oơ]ng\s*[aá]n\s*ph[aâ]n\s*lo[aạ]i)/i;

// Hư từ không mang nội dung tra cứu: không dùng làm từ khóa đơn (vẫn có thể nằm trong cặp từ)
const STOPWORDS = new Set([
  'và', 'của', 'các', 'những', 'trong', 'theo', 'là', 'có', 'được', 'cho', 'thì', 'hoặc', 'với', 'về',
  'khi', 'nào', 'gì', 'ra', 'sao', 'như', 'thế', 'không', 'bao', 'nhiêu', 'hỏi', 'mấy', 'này', 'đó',
  'đã', 'sẽ', 'đến', 'từ', 'để', 'bị', 'một', 'hay', 'còn', 'ạ', 'nhé', 'vậy', 'ơi', 'ai', 'gồm',
  'phải', 'rồi', 'ở', 'tại', 'do', 'mà', 'nên', 'nếu', 'lại', 'cũng', 'đều', 'rằng', 'nhưng',
]);

const MAX_TERMS = 40;
const MAX_BIGRAMS = 40;
const MAX_SLASH_CODES = 8;

// Trọng số (cùng thang với các điểm cộng sẵn có: số hiệu 30, chữ ký loại văn bản 25, chuyên đề 15...)
const W = {
  bodyTerm: 1.0,
  coverage: 5.0,
  titleTerm: 3.0,
  titleBigram: 4.0,
  bodyBigram: 2.0,
  titleSlashCode: 6.0,
  bodySlashCode: 2.0,
  textRank: 2.0, // ts_rank_cd chuẩn hóa về [0,1), chỉ để phân định khi bằng điểm
  docCodeNumber: 30.0,
  titleNumber: 12.0,
  contentNumber: 4.0,
};

// Hằng số SQL dạng thập phân (5.00) để Postgres không chia nguyên
const f = (x) => Number(x).toFixed(2);

const SLASH_CODE_REGEX = /^\p{L}{1,2}\/\p{L}{1,2}$/u;

/**
 * Tách câu hỏi thành từ khóa cho full-text search.
 * Giữ nguyên mã ký dạng T/M, K/T, T/L, T/U (parser 'simple' của Postgres cũng giữ chúng thành 1 token,
 * vd. to_tsvector('simple', '(T/M, K/T)') = 'k/t' 't/m'); không tách nhầm phần đuôi số hiệu như 208-QĐ/TW.
 * @param {string} queryStr
 * @returns {{ terms: string[], slashCodes: string[], bigrams: string[] }}
 */
function extractQueryTerms(queryStr = '') {
  const text = String(queryStr).normalize('NFC').toLowerCase();
  const tokens = []; // { word, pos } — pos là vị trí liên tiếp trong câu để dựng cặp từ
  const slashCodes = [];
  let pos = 0;

  for (const m of text.matchAll(/[\p{L}\p{N}]+(?:\/[\p{L}\p{N}]+)*/gu)) {
    const raw = m[0];
    const prevChar = m.index > 0 ? text[m.index - 1] : '';
    if (SLASH_CODE_REGEX.test(raw) && prevChar !== '-') {
      tokens.push({ word: raw, pos: pos++ });
      if (!slashCodes.includes(raw) && slashCodes.length < MAX_SLASH_CODES) slashCodes.push(raw);
      continue;
    }
    for (const part of raw.split('/')) {
      if (part.length >= 2) tokens.push({ word: part, pos });
      pos++;
    }
  }

  const unique = [...new Set(tokens.map(t => t.word))];
  let terms = unique.filter(w => !STOPWORDS.has(w));
  if (!terms.length) terms = unique;

  const bigrams = [];
  for (let i = 0; i < tokens.length - 1; i++) {
    const a = tokens[i];
    const b = tokens[i + 1];
    if (b.pos !== a.pos + 1) continue;
    if (STOPWORDS.has(a.word) && STOPWORDS.has(b.word)) continue;
    const bg = `${a.word} ${b.word}`;
    if (!bigrams.includes(bg)) bigrams.push(bg);
  }

  return {
    terms: terms.slice(0, MAX_TERMS),
    slashCodes,
    bigrams: bigrams.slice(0, MAX_BIGRAMS),
  };
}

/**
 * @param {string} queryStr
 * @param {{ topK?: number }} [options]
 * @returns {null | { text: string, values: any[], terms: string[], slashCodes: string[], bigrams: string[],
 *   docNumbers: string[], isKhungPhanLoai: boolean, isSingleDocQuery: boolean }}
 *   null khi câu hỏi không còn từ khóa nào để tìm.
 */
function buildArticleSearchQuery(queryStr, { topK = 8 } = {}) {
  const { terms, slashCodes, bigrams } = extractQueryTerms(queryStr);
  if (!terms.length) return null;

  // Từ khóa chỉ gồm chữ/số hoặc mã T/M nên nối thẳng bằng OR cho to_tsquery là an toàn cú pháp
  const tsQueryStr = terms.join(' | ');
  const params = [tsQueryStr, `%${queryStr.trim()}%`, terms, bigrams];
  const P = { tsq: '$1', whole: '$2', terms: '$3', bigrams: '$4' };
  const addParam = (v) => { params.push(v); return `$${params.length}`; };

  // Tìm số hiệu văn bản và chữ ký loại văn bản trong câu hỏi bằng hàm chuẩn dùng chung
  const docNumbers = extractDocNumbers(queryStr);
  const docSignatures = extractDocSignatures(queryStr);

  // Số hiệu: khớp mã văn bản là tín hiệu mạnh; số xuất hiện trong nội dung chỉ là tín hiệu yếu
  // (01-HD/TW Mục 8.1 chứa rất nhiều con số, trước đây cũng được trọn +30)
  let docCodeNumberMatch = 'FALSE';
  let numberScore = '0.0';
  let numberFilter = 'FALSE';
  if (docNumbers.length > 0) {
    const codeConds = [];
    const titleConds = [];
    const contentConds = [];
    for (const num of docNumbers) {
      const re = addParam(`(^|[^0-9])0*${num}([^0-9]|$)`);
      codeConds.push(`d.document_code ~ ${re}`);
      titleConds.push(`a.title ~ ${re}`);
      contentConds.push(`a.content ~ ${re}`);
    }
    docCodeNumberMatch = `(${codeConds.join(' OR ')})`;
    const titleMatch = `(${titleConds.join(' OR ')})`;
    const contentMatch = `(${contentConds.join(' OR ')})`;
    numberScore = `(CASE WHEN ${docCodeNumberMatch} THEN ${f(W.docCodeNumber)} ELSE 0.0 END
          + CASE WHEN ${titleMatch} THEN ${f(W.titleNumber)} WHEN ${contentMatch} THEN ${f(W.contentNumber)} ELSE 0.0 END)`;
    numberFilter = `(${docCodeNumberMatch} OR ${titleMatch} OR ${contentMatch})`;
  }

  // 1.1 Phân biệt tiền tố loại văn bản (HD vs QĐ vs CT vs CV) để tránh va chạm số 24 và 50.
  // extractDocSignatures trả 'QD' (không dấu) nên so trên mã đã đổi Đ→D; trước đây '%144-QD%' không bao giờ
  // khớp '144-QĐ/TW' nên chính văn bản được hỏi lại bị phạt -15.
  let sigScore = '0.0';
  const sigParts = [];
  for (const sig of docSignatures) {
    if (!sig.type) continue;
    const sigRe = addParam(`(^|[^0-9])0*${sig.number}-${sig.type}([^a-z]|$)`);
    const numRe = addParam(`(^|[^0-9])0*${sig.number}([^0-9]|$)`);
    sigParts.push(`CASE
            WHEN translate(d.document_code, 'Đđ', 'Dd') ~* ${sigRe}
              OR translate(a.title, 'Đđ', 'Dd') ~* ${sigRe}
              OR (d.document_code = 'KHUNG-PHAN-LOAI-VPTW' AND translate(a.content, 'Đđ', 'Dd') ~* ${sigRe}) THEN 25.0
            WHEN d.document_code ~ ${numRe} THEN -15.0
            ELSE 0.0
          END`);
  }
  if (sigParts.length) sigScore = `(${sigParts.join(' + ')})`;

  // Tăng trọng số đặc thù cho từ khóa "xóa tên"
  const isXoaTen = /x[oó]a\s*t[eê]n/i.test(queryStr) || /xoa\s*ten/i.test(queryStr);
  const xoaTenScore = isXoaTen
    ? `CASE WHEN a.title ILIKE '%xóa tên%' OR a.title ILIKE '%xoa ten%' THEN 15.0 WHEN a.content ILIKE '%xóa tên%' OR a.content ILIKE '%xoa ten%' THEN 8.0 ELSE 0.0 END`
    : '0.0';

  // Tăng trọng số cho các câu hỏi về giai đoạn chỉnh lý hoặc xử lý tài liệu loại ra
  const isGiaiDoan = /giai\s*[đd]o[aạ]n/i.test(queryStr);
  const giaiDoanScore = isGiaiDoan ? `CASE WHEN a.title ILIKE '%giai đoạn%' THEN 15.0 ELSE 0.0 END` : '0.0';

  const isLoaiRa = /lo[aạ]i\s*ra/i.test(queryStr);
  const loaiRaScore = isLoaiRa
    ? `CASE WHEN a.title ILIKE '%loại ra%' THEN 15.0 WHEN a.content ILIKE '%loại ra%' THEN 8.0 ELSE 0.0 END`
    : '0.0';

  // Tăng trọng số ưu tiên đặc biệt cho KHUNG-PHAN-LOAI-VPTW khi câu hỏi hỏi về khung/phương án phân loại
  const isKhungPhanLoai = KHUNG_PL_REGEX.test(queryStr);
  const khungPlScore = isKhungPhanLoai ? `CASE WHEN d.document_code = 'KHUNG-PHAN-LOAI-VPTW' THEN 18.0 ELSE 0.0 END` : '0.0';

  // Mã ký T/M, K/T... rất đặc thù: khớp tiêu đề/nội dung được cộng thêm ngoài điểm từ khóa thường
  let slashScore = '0.0';
  if (slashCodes.length) {
    const codesParam = addParam(slashCodes);
    slashScore = `(SELECT COALESCE(SUM(CASE WHEN tt.title_tsv @@ q.q THEN ${f(W.titleSlashCode)}
                                        WHEN tt.body_tsv @@ q.q THEN ${f(W.bodySlashCode)} ELSE 0.0 END), 0.0)
             FROM (SELECT plainto_tsquery('simple', c) AS q FROM unnest(${codesParam}::text[]) AS c) q)`;
  }

  // Lấy dư số lượng để sau đó áp dụng Diversity Cap chống 1 văn bản độc chiếm topK
  const fetchLimit = Math.max(topK * 3, 24);
  const limitParam = addParam(fetchLimit);

  const text = `
      WITH qt AS (
        SELECT plainto_tsquery('simple', t) AS q FROM unnest(${P.terms}::text[]) AS t
      ), qb AS (
        SELECT phraseto_tsquery('simple', b) AS q FROM unnest(${P.bigrams}::text[]) AS b
      )
      SELECT
        a.id,
        a.article_number as "articleNumber",
        a.title,
        a.content,
        d.document_code as "documentCode",
        d.document_name as "documentName",
        d.issuer,
        d.issue_date as "issueDate",
        d.category,
        d.status,
        d.description,
        (
          ${f(W.textRank)} * ts_rank_cd(tt.body_tsv, to_tsquery('simple', ${P.tsq}), 1|32)
          + ${f(W.bodyTerm)} * m.body_hits
          + ${f(W.coverage)} * m.body_hits / GREATEST(cardinality(${P.terms}::text[]), 1)
          + ${f(W.titleTerm)} * m.title_hits
          + ${f(W.titleBigram)} * bg.title_bigrams
          + ${f(W.bodyBigram)} * bg.body_bigrams
          + ${slashScore}
          + ${numberScore}
          + ${sigScore}
          + ${xoaTenScore}
          + ${giaiDoanScore}
          + ${loaiRaScore}
          + ${khungPlScore}
          + CASE WHEN a.article_number = '0' AND ${docCodeNumberMatch} THEN 8.0 ELSE 0.0 END
          + CASE WHEN d.document_name ILIKE ${P.whole} THEN 10.0 ELSE 0.0 END
          + CASE
              WHEN d.status ILIKE '%Hết hiệu lực%' THEN -10.0
              WHEN d.status ILIKE '%Còn hiệu lực%' THEN 10.0
              ELSE 0.0
            END
        ) as rank
      FROM articles a
      JOIN documents d ON a.document_id = d.id
      -- Tính 1 lần mỗi dòng (OFFSET 0 chặn planner gộp subquery): tsv của tiêu đề, và bản sao tsv đã giải nén
      -- (đa số tsv > 2KB bị TOAST; nếu so trực tiếp a.tsv thì mỗi từ khóa lại giải nén 1 lần, chậm ~4 lần)
      CROSS JOIN LATERAL (
        SELECT to_tsvector('simple', a.title) AS title_tsv, setweight(a.tsv, 'D') AS body_tsv OFFSET 0
      ) tt
      CROSS JOIN LATERAL (
        SELECT
          count(*) FILTER (WHERE tt.body_tsv @@ qt.q) AS body_hits,
          count(*) FILTER (WHERE tt.title_tsv @@ qt.q) AS title_hits
        FROM qt
      ) m
      CROSS JOIN LATERAL (
        SELECT
          count(*) FILTER (WHERE tt.title_tsv @@ qb.q) AS title_bigrams,
          count(*) FILTER (WHERE NOT (tt.title_tsv @@ qb.q) AND tt.body_tsv @@ qb.q) AS body_bigrams
        FROM qb
      ) bg
      WHERE
        a.tsv @@ to_tsquery('simple', ${P.tsq})
        OR a.title ILIKE ${P.whole}
        OR a.content ILIKE ${P.whole}
        OR a.full_text ILIKE ${P.whole}
        OR ${numberFilter}
        ${isXoaTen ? "OR a.title ILIKE '%xóa tên%' OR a.content ILIKE '%xóa tên%'" : ''}
      ORDER BY rank DESC, a.id ASC
      LIMIT ${limitParam}
    `;

  // Số hiệu năm (1901-2099) không tính là hỏi đích danh 1 văn bản
  const validDocNums = docNumbers.filter(n => !(parseInt(n, 10) > 1900 && parseInt(n, 10) < 2100));

  return {
    text,
    values: params,
    terms,
    slashCodes,
    bigrams,
    docNumbers,
    isKhungPhanLoai,
    isSingleDocQuery: validDocNums.length === 1,
  };
}

/**
 * Diversity Cap thông minh: tối đa 3 điều/văn bản; cho phép 6 với KHUNG-PHAN-LOAI-VPTW
 * (khi hỏi khung phân loại) hoặc khi câu hỏi nhắm đích danh 1 văn bản. Gắn thêm fullText.
 */
function finalizeArticleRows(rows, plan, topK = 8) {
  const docCount = {};
  const finalRows = [];
  for (const row of rows) {
    const code = row.documentCode;
    docCount[code] = (docCount[code] || 0) + 1;
    let maxCap = 3;
    if (code === 'KHUNG-PHAN-LOAI-VPTW' && plan.isKhungPhanLoai) {
      maxCap = 6;
    } else if (plan.isSingleDocQuery) {
      maxCap = 6;
    }
    if (docCount[code] <= maxCap) {
      finalRows.push(row);
    }
    if (finalRows.length >= topK) break;
  }

  return finalRows.map(row => {
    const descPart = row.description ? ` ${row.description}` : '';
    return {
      ...row,
      fullText: `${row.documentCode} ${row.documentName}${descPart} - Điều ${row.articleNumber}: ${row.title}. ${row.content}`,
    };
  });
}

module.exports = { buildArticleSearchQuery, finalizeArticleRows, extractQueryTerms, STOPWORDS, WEIGHTS: W };
