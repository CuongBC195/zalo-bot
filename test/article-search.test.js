/**
 * Kiểm thử offline phần dựng SQL tìm điều khoản (src/db/article-search.js) và searchArticles.
 * Không kết nối Postgres: ép DATABASE_URL về địa chỉ không tồn tại, pool được thay bằng bản giả.
 */

process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/none';

const assert = require('assert');
const {
  buildArticleSearchQuery,
  finalizeArticleRows,
  extractQueryTerms,
} = require('../src/db/article-search');

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`  FAIL ${name}\n       ${err.message}`);
    process.exitCode = 1;
  }
}

// Regex trong tham số được Postgres chạy bằng toán tử ~ / ~*; mẫu dùng ở đây tương thích cú pháp JS.
const pgRegex = (pattern, flags = '') => new RegExp(pattern, flags);
const pgTranslateD = (s) => s.replace(/Đ/g, 'D').replace(/đ/g, 'd');

const TM_QUERY = 'Thẩm quyền ký T/M và K/T trong văn bản Đảng quy định ra sao?';

async function main() {
  console.log('🧪 Tìm điều khoản trên Postgres (dựng SQL offline)');

  await test('giữ nguyên mã ký T/M, K/T, T/L, T/U thành 1 từ khóa', () => {
    const { terms, slashCodes } = extractQueryTerms('vptw quy định ký t/m, (K/T), T/L, t/u khác nhau ntn?');
    assert.deepStrictEqual(slashCodes, ['t/m', 'k/t', 't/l', 't/u']);
    for (const code of slashCodes) assert(terms.includes(code), `thiếu ${code} trong từ khóa`);
    assert(!terms.includes('t') && !terms.includes('m'), 'không được tách T/M thành chữ đơn');
  });

  await test('không coi đuôi số hiệu (208-QĐ/TW) hay ngày tháng là mã ký', () => {
    const { slashCodes, terms } = extractQueryTerms('Theo 208-QĐ/TW, 05-HD/VPTW ngày 27/05/2026');
    assert.deepStrictEqual(slashCodes, []);
    assert(terms.includes('208') && terms.includes('qđ') && terms.includes('tw'));
    assert(!terms.some(t => t.includes('/')), 'không được còn từ khóa chứa "/"');
  });

  await test('bỏ hư từ khỏi từ khóa đơn nhưng vẫn dựng cặp từ liền nhau', () => {
    const { terms, bigrams } = extractQueryTerms(TM_QUERY);
    assert(!terms.includes('và') && !terms.includes('trong') && !terms.includes('sao'));
    assert(terms.includes('thẩm') && terms.includes('quyền') && terms.includes('ký'));
    assert(bigrams.includes('thẩm quyền') && bigrams.includes('văn bản') && bigrams.includes('ký t/m'));
  });

  await test('câu chỉ gồm hư từ vẫn tìm được; câu không có chữ thì bỏ qua', () => {
    assert.deepStrictEqual(extractQueryTerms('và của các').terms, ['và', 'của', 'các']);
    assert.strictEqual(buildArticleSearchQuery('?? !!! @@'), null);
    assert.strictEqual(buildArticleSearchQuery('a b c'), null);
  });

  await test('chuẩn hóa Unicode NFC (bàn phím gõ dạng tổ hợp)', () => {
    const decomposed = TM_QUERY.normalize('NFD');
    assert.deepStrictEqual(extractQueryTerms(decomposed).terms, extractQueryTerms(TM_QUERY).terms);
  });

  await test('truy vấn T/M: tsquery có t/m, k/t và có điểm khớp tiêu đề/cặp từ', () => {
    const plan = buildArticleSearchQuery(TM_QUERY, { topK: 6 });
    const tsq = plan.values[0].split(' | ');
    assert(tsq.includes('t/m') && tsq.includes('k/t'), `tsquery thiếu mã ký: ${plan.values[0]}`);
    assert.deepStrictEqual(plan.slashCodes, ['t/m', 'k/t']);
    assert(plan.values.some(v => Array.isArray(v) && v.includes('t/m') && v.length === 2), 'thiếu tham số mã ký');
    assert(/title_tsv @@ qt\.q/.test(plan.text), 'thiếu điểm khớp từ khóa trong tiêu đề');
    assert(/title_tsv @@ qb\.q/.test(plan.text), 'thiếu điểm khớp cặp từ trong tiêu đề');
  });

  await test('ts_rank_cd được chuẩn hóa, không còn cộng điểm thô theo độ dài điều khoản', () => {
    const { text } = buildArticleSearchQuery(TM_QUERY);
    const calls = text.match(/ts_rank_cd\([^)]*\)[^)]*\)/g) || [];
    assert.strictEqual(calls.length, 1);
    assert(/, 1\|32\)$/.test(calls[0]), `ts_rank_cd thiếu chuẩn hóa: ${calls[0]}`);
  });

  await test('hệ số điểm luôn là số thập phân (tránh phép chia nguyên trong Postgres)', () => {
    const { text } = buildArticleSearchQuery(TM_QUERY);
    assert(/\d+\.\d+ \* m\.body_hits \/ GREATEST/.test(text));
    assert(!/(^|[^.\d])\d+ \* (m|bg)\./m.test(text), 'còn hệ số số nguyên');
  });

  await test('chữ ký QĐ khớp mã có chữ Đ và không phạt nhầm chính văn bản được hỏi', () => {
    const plan = buildArticleSearchQuery('5 chuẩn mực đạo đức theo Quy định 144-QĐ/TW gồm gì?');
    assert(/translate\(d\.document_code, 'Đđ', 'Dd'\) ~\* \$\d+/.test(plan.text));
    const sigPattern = plan.values.find(v => typeof v === 'string' && v.includes('144-QD'));
    assert(sigPattern, 'thiếu mẫu chữ ký 144-QD');
    const re = pgRegex(sigPattern, 'i');
    assert(re.test(pgTranslateD('144-QĐ/TW')), 'phải khớp 144-QĐ/TW');
    assert(!re.test(pgTranslateD('1144-QĐ/TW')), 'không được khớp 1144-QĐ/TW');
    assert(!re.test(pgTranslateD('144-HD/VPTW')), 'không được khớp sai loại văn bản');
  });

  await test('số hiệu: khớp mã văn bản mạnh, khớp nội dung chỉ là tín hiệu yếu', () => {
    const plan = buildArticleSearchQuery('Thời hạn nộp lưu theo HD 6 của VPTW?');
    const numPattern = plan.values.find(v => typeof v === 'string' && v.startsWith('(^|[^0-9])0*6('));
    assert(numPattern, 'thiếu mẫu số hiệu 6');
    assert(pgRegex(numPattern).test('06-HD/VPTW') && !pgRegex(numPattern).test('16-HD/VPTW'));
    assert(/d\.document_code ~ \$\d+\) THEN 30\.00/.test(plan.text));
    assert(/a\.content ~ \$\d+\) THEN 4\.00/.test(plan.text));
    // Điều 0 chỉ được ưu tiên khi câu hỏi nhắm đúng văn bản
    assert(/a\.article_number = '0' AND \(d\.document_code ~/.test(plan.text));
    const noNum = buildArticleSearchQuery(TM_QUERY);
    assert(/a\.article_number = '0' AND FALSE/.test(noNum.text));
  });

  await test('nội dung câu hỏi chỉ đi qua tham số, không chèn vào SQL', () => {
    const evil = "Quy định về con dấu ' % _ ; DROP TABLE documents; -- t/m";
    const plan = buildArticleSearchQuery(evil);
    assert(!/DROP|con dấu|t\/m/i.test(plan.text), 'chuỗi người dùng lọt vào SQL');
    const placeholders = [...plan.text.matchAll(/\$(\d+)/g)].map(m => Number(m[1]));
    assert.strictEqual(Math.max(...placeholders), plan.values.length, 'số tham số không khớp placeholder');
  });

  await test('topK quyết định số dòng lấy dư cho Diversity Cap', () => {
    const plan = buildArticleSearchQuery(TM_QUERY, { topK: 10 });
    assert.strictEqual(plan.values[plan.values.length - 1], 30);
    assert.strictEqual(buildArticleSearchQuery(TM_QUERY, { topK: 6 }).values.slice(-1)[0], 24);
  });

  const row = (code, num) => ({ documentCode: code, articleNumber: num, documentName: 'Tên', title: `Điều ${num}`, content: 'Nội dung', description: '' });

  await test('Diversity Cap: tối đa 3 điều/văn bản, 6 khi hỏi đích danh 1 văn bản', () => {
    const rows = [1, 2, 3, 4, 5].map(n => row('01-HD/TW', String(n))).concat([row('05-HD/VPTW', '6')]);
    const general = finalizeArticleRows(rows, buildArticleSearchQuery(TM_QUERY), 6);
    assert.deepStrictEqual(general.map(r => r.articleNumber), ['1', '2', '3', '6']);
    const single = finalizeArticleRows(rows, buildArticleSearchQuery('Hướng dẫn 01-HD/TW quy định gì?'), 6);
    assert.strictEqual(single.length, 6);
    assert(single[0].fullText.startsWith('01-HD/TW Tên - Điều 1: Điều 1. Nội dung'));
  });

  await test('searchArticles dùng SQL dựng sẵn và áp Diversity Cap', async () => {
    const db = require('../src/db');
    const calls = [];
    const origCheck = db.checkConnection;
    const origPool = db.pool;
    db.checkConnection = async () => true;
    db.pool = { query: async (text, values) => { calls.push({ text, values }); return { rows: [row('05-HD/VPTW', '6')] }; } };
    try {
      const res = await db.searchArticles(TM_QUERY, { topK: 6 });
      assert.strictEqual(res.length, 1);
      assert.strictEqual(res[0].documentCode, '05-HD/VPTW');
      assert.strictEqual(calls.length, 1);
      assert.deepStrictEqual(calls[0].values, buildArticleSearchQuery(TM_QUERY, { topK: 6 }).values);
      assert.deepStrictEqual(await db.searchArticles('???'), []);
      assert.strictEqual(calls.length, 1, 'câu rỗng không được gọi DB');
    } finally {
      db.checkConnection = origCheck;
      db.pool = origPool;
    }
  });

  console.log(`\n${passed} kiểm thử đạt${process.exitCode ? ', có lỗi' : ''}.`);
  process.exit(process.exitCode || 0);
}

main();
