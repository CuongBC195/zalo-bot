/**
 * CLI Script: Khôi phục toàn bộ cơ sở dữ liệu PostgreSQL từ bản sao lưu JSON
 * Cách dùng: node scripts/restore-db.js backups/backup-full-db-YYYY-MM-DD.json --confirm
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../src/db');

const TABLES_IN_ORDER = [
  'app_meta',
  'users',
  'user_sessions',
  'zalo_users',
  'zalo_activation_codes',
  'zalo_sessions',
  'documents',
  'articles',
  'office_doc_imports',
  'office_documents',
  'query_logs',
  'response_cache',
];

const SERIAL_TABLES = [
  'users',
  'zalo_users',
  'query_logs',
  'documents',
  'articles',
  'office_doc_imports',
  'office_documents',
  'zalo_activation_codes',
];

async function main() {
  const fileArg = process.argv[2];
  const confirmed = process.argv.includes('--confirm');

  if (!fileArg || !confirmed) {
    console.error('Cách dùng: node scripts/restore-db.js <đường-dẫn-file-json> --confirm');
    process.exit(1);
  }

  const fullPath = path.resolve(fileArg);
  if (!fs.existsSync(fullPath)) {
    console.error(`❌ Không tìm thấy file sao lưu: ${fullPath}`);
    process.exit(1);
  }

  const dump = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  if (!dump || !dump.tables) {
    console.error('❌ File sao lưu không đúng định dạng.');
    process.exit(1);
  }

  const ok = await db.checkConnection();
  if (!ok) {
    console.error('❌ Không kết nối được PostgreSQL.');
    process.exit(1);
  }

  const client = await db.pool.connect();
  try {
    console.log(`🔄 Đang khôi phục dữ liệu từ: ${fullPath}...`);
    await client.query('BEGIN');

    // Xóa theo thứ tự ngược để đảm bảo khóa ngoại
    const reverseTables = [...TABLES_IN_ORDER].reverse().map((t) => `"${t}"`).join(', ');
    await client.query(`TRUNCATE TABLE ${reverseTables} RESTART IDENTITY CASCADE`);

    for (const tableName of TABLES_IN_ORDER) {
      const rows = dump.tables[tableName] || [];
      if (!rows.length) {
        console.log(`  - ${tableName.padEnd(24)} : 0 bản ghi`);
        continue;
      }

      const cols = Object.keys(rows[0]);
      const colList = cols.map((c) => `"${c}"`).join(', ');

      for (const row of rows) {
        const placeholders = cols.map((_, idx) => `$${idx + 1}`).join(', ');
        const values = cols.map((c) => {
          const v = row[c];
          // Các cột JSONB (errors, state) cần truyền dạng JSON string nếu là object/array
          if ((c === 'errors' || c === 'state') && v !== null && typeof v === 'object') {
            return JSON.stringify(v);
          }
          return v;
        });
        await client.query(`INSERT INTO "${tableName}" (${colList}) VALUES (${placeholders})`, values);
      }
      console.log(`  ✔ ${tableName.padEnd(24)} : đã khôi phục ${rows.length} bản ghi`);
    }

    for (const seqTable of SERIAL_TABLES) {
      await client.query(
        `SELECT setval(pg_get_serial_sequence($1, 'id'), COALESCE((SELECT MAX(id) FROM "${seqTable}"), 1), (SELECT COUNT(*) > 0 FROM "${seqTable}"))`,
        [seqTable]
      );
    }

    await client.query('COMMIT');
    console.log('\n✅ Khôi phục toàn bộ cơ sở dữ liệu thành công!');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('❌ Lỗi khi khôi phục (đã ROLLBACK an toàn):', err.message);
    process.exit(1);
  } finally {
    client.release();
    process.exit(0);
  }
}

main();
