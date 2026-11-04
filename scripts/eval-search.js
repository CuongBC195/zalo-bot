/**
 * Đánh giá thứ hạng tìm điều khoản trên PostgreSQL (searchArticles) bằng bộ câu hỏi có đáp án.
 *
 * CHỈ ĐỌC: phiên kết nối bị ép default_transaction_read_only = on, mọi lệnh ghi đều bị Postgres từ chối.
 * Không dùng src/db (không khởi tạo pool, không initSchema); chỉ dựng SQL bằng src/db/article-search.js.
 *
 * Cách chạy:
 *   node scripts/eval-search.js [--env-file .env] [--topk 6] [--show <id>] [--builder <path>] [--json <out>]
 *
 * Mỗi câu chạy 2 biến thể:
 *   raw      : câu người dùng gõ
 *   pipeline : expandAbbreviations(câu) lặp 2 lần — giống chuỗi pipeline gửi vào RAG khi Gemini rewrite fail-open
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const dotenv = require('dotenv');
const { expandAbbreviations } = require('../src/rag/abbreviations');

function parseArgs(argv) {
  const args = { topk: 6, envFile: null, show: null, builder: null, json: null, cases: path.join(__dirname, '..', 'test', 'fixtures', 'search-eval.json') };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--topk') args.topk = parseInt(next(), 10);
    else if (a === '--env-file') args.envFile = next();
    else if (a === '--show') args.show = next();
    else if (a === '--builder') args.builder = next();
    else if (a === '--json') args.json = next();
    else if (a === '--cases') args.cases = next();
    else throw new Error(`Tham số không hợp lệ: ${a}`);
  }
  return args;
}

function resolveDatabaseUrl(envFile) {
  if (envFile) return dotenv.parse(fs.readFileSync(envFile)).DATABASE_URL;
  dotenv.config({ quiet: true });
  return process.env.DATABASE_URL;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const isConnError = (err) => !err.code || /^(08|57P)/.test(err.code) || /ECONN|ETIMEDOUT|terminated|Connection/i.test(err.message);

function makeReadOnlyRunner(connectionString) {
  let client = null;
  async function open() {
    const c = new Client({
      connectionString,
      ssl: /localhost|127\.0\.0\.1/.test(connectionString) ? false : { rejectUnauthorized: false },
      connectionTimeoutMillis: 10000,
      statement_timeout: 20000,
    });
    c.on('error', () => {});
    await c.connect();
    await c.query('SET default_transaction_read_only = on');
    const ro = await c.query('SHOW default_transaction_read_only');
    if (ro.rows[0].default_transaction_read_only !== 'on') {
      await c.end();
      throw new Error('Không ép được chế độ chỉ đọc, dừng để an toàn.');
    }
    return c;
  }
  async function run(text, values) {
    let lastErr;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        if (!client) client = await open();
        return await client.query(text, values);
      } catch (err) {
        lastErr = err;
        if (!isConnError(err)) throw err;
        try { if (client) await client.end(); } catch (_) { /* bỏ qua */ }
        client = null;
        await sleep(1000 * (attempt + 1));
      }
    }
    throw lastErr;
  }
  run.end = async () => { if (client) await client.end().catch(() => {}); };
  return run;
}

function matches(row, expect) {
  return expect.some(e => {
    const [code, num] = e.split('#');
    return row.documentCode === code && (num === '*' || String(row.articleNumber) === num);
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const builder = require(args.builder ? path.resolve(args.builder) : '../src/db/article-search');
  const { cases } = JSON.parse(fs.readFileSync(args.cases, 'utf8'));
  const url = resolveDatabaseUrl(args.envFile);
  if (!url) throw new Error('Thiếu DATABASE_URL (dùng --env-file).');

  const run = makeReadOnlyRunner(url);
  const variants = {
    raw: q => q,
    pipeline: q => { const e = expandAbbreviations(q); return `${e} ${e}`; },
  };
  const results = [];

  try {
    for (const c of cases) {
      if (args.show && c.id !== args.show) continue;
      const row = { id: c.id, expect: c.expect };
      for (const [name, fn] of Object.entries(variants)) {
        const q = fn(c.query);
        const plan = builder.buildArticleSearchQuery(q, { topK: args.topk });
        let top = [];
        if (plan) {
          const res = await run(plan.text, plan.values);
          top = builder.finalizeArticleRows(res.rows, plan, args.topk);
        }
        const idx = top.findIndex(r => matches(r, c.expect));
        row[name] = { rank: idx >= 0 ? idx + 1 : null, top: top.map(r => `${r.documentCode}#${r.articleNumber}`) };
        if (args.show) {
          console.log(`\n[${name}] ${q}`);
          top.forEach((r, i) => console.log(`  ${i + 1}. ${matches(r, c.expect) ? '✔' : ' '} ${Number(r.rank).toFixed(2).padStart(7)}  ${r.documentCode}#${r.articleNumber}  ${String(r.title).slice(0, 80)}`));
        }
      }
      results.push(row);
    }
  } finally {
    await run.end();
  }

  if (!args.show) {
    const fmt = (r) => (r.rank ? String(r.rank) : '-');
    console.log(`\n${'id'.padEnd(24)} raw  pipe  top-1 (raw)`);
    for (const r of results) {
      console.log(`${r.id.padEnd(24)} ${fmt(r.raw).padEnd(4)} ${fmt(r.pipeline).padEnd(5)} ${r.raw.top[0] || '(trống)'}`);
    }
    for (const name of Object.keys(variants)) {
      const ranks = results.map(r => r[name].rank);
      const n = ranks.length;
      const hit = k => ranks.filter(x => x && x <= k).length;
      const mrr = ranks.reduce((s, x) => s + (x ? 1 / x : 0), 0) / n;
      console.log(`\n[${name}] n=${n}  Hit@1=${hit(1)}/${n}  Hit@3=${hit(3)}/${n}  Hit@${args.topk}=${hit(args.topk)}/${n}  MRR=${mrr.toFixed(3)}`);
    }
  }
  if (args.json) fs.writeFileSync(args.json, JSON.stringify(results, null, 2));
}

main().catch(err => {
  console.error('❌', err.message);
  process.exit(1);
});
