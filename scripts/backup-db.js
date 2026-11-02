/**
 * CLI Script: Sao lưu toàn bộ cơ sở dữ liệu PostgreSQL (JSON + Excel Sổ công văn)
 * Cách dùng: node scripts/backup-db.js
 * Kết quả lưu trong thư mục backups/ (đã được .gitignore bảo vệ, không đẩy lên Git).
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const XLSX = require('xlsx');
const { types } = require('pg');
const db = require('../src/db');

// Giữ nguyên cột DATE (OID 1082) dưới dạng chuỗi 'YYYY-MM-DD' không bị lệch múi giờ
types.setTypeParser(1082, (val) => val);

const TABLES_IN_ORDER = [
  { name: 'app_meta', orderBy: 'key ASC' },
  { name: 'users', orderBy: 'id ASC' },
  { name: 'user_sessions', orderBy: 'created_at ASC' },
  { name: 'zalo_users', orderBy: 'id ASC' },
  { name: 'zalo_activation_codes', orderBy: 'id ASC' },
  { name: 'zalo_sessions', orderBy: 'zalo_id ASC' },
  { name: 'documents', orderBy: 'id ASC' },
  {
    name: 'articles',
    select: 'id, document_id, article_number, title, content, full_text, created_at',
    orderBy: 'id ASC',
  },
  { name: 'office_doc_imports', orderBy: 'id ASC' },
  { name: 'office_documents', orderBy: 'id ASC' },
  { name: 'query_logs', orderBy: 'id ASC' },
  { name: 'response_cache', orderBy: 'cache_key ASC' },
];

async function main() {
  const ok = await db.checkConnection();
  if (!ok) {
    console.error('❌ Không kết nối được PostgreSQL. Vui lòng kiểm tra DATABASE_URL trong .env.');
    process.exit(1);
  }

  const backupDir = path.join(__dirname, '..', 'backups');
  fs.mkdirSync(backupDir, { recursive: true });

  const now = new Date(Date.now() + 7 * 3600 * 1000);
  const dateTag = now.toISOString().slice(0, 10);

  const dump = {
    meta: {
      project: 'zalo-dang-ai-bot',
      createdAt: new Date().toISOString(),
      dateTag,
      counts: {},
    },
    tables: {},
  };

  console.log('📦 Đang sao lưu toàn bộ 12 bảng từ PostgreSQL...');
  for (const t of TABLES_IN_ORDER) {
    const cols = t.select || '*';
    const res = await db.pool.query(`SELECT ${cols} FROM "${t.name}" ORDER BY ${t.orderBy}`);
    dump.tables[t.name] = res.rows;
    dump.meta.counts[t.name] = res.rows.length;
    console.log(`  ✔ ${t.name.padEnd(24)} : ${res.rows.length} bản ghi`);
  }

  const jsonPath = path.join(backupDir, `backup-full-db-${dateTag}.json`);
  const jsonContent = JSON.stringify(dump, null, 2);
  fs.writeFileSync(jsonPath, jsonContent, { encoding: 'utf8', mode: 0o600 });
  const sha256 = crypto.createHash('sha256').update(jsonContent).digest('hex');

  // Xuất thêm file Excel (.xlsx) riêng cho Sổ công văn đến & đi để dễ mở xem trực tiếp
  const officeDocs = dump.tables.office_documents || [];
  const denDocs = officeDocs.filter((d) => d.direction === 'den');
  const diDocs = officeDocs.filter((d) => d.direction === 'di');

  const toSheetRows = (rows) =>
    rows.map((d, i) => ({
      STT: i + 1,
      ID_He_Thong: d.id,
      Ma_Van_Ban: d.source_id || '',
      Loai_So: d.direction === 'den' ? 'Văn bản đến' : 'Văn bản đi',
      So_Ky_Hieu: d.so_ky_hieu || '',
      So_Dang_Ky: d.so_dang_ky ?? '',
      Ngay_Van_Ban: d.ngay_van_ban || '',
      Thoi_Gian_Nhan: d.thoi_gian_nhan || '',
      Han_Xu_Ly: d.han_xu_ly || '',
      The_Loai: d.the_loai || '',
      Trich_Yeu: d.trich_yeu || '',
      Nguoi_Ky: d.nguoi_ky || '',
      Nguoi_Gui: d.nguoi_gui || '',
      Nguoi_Trinh: d.nguoi_trinh || '',
      Noi_Nhan: d.noi_nhan || '',
      YKien_Chuyen: d.y_kien_chuyen || '',
      YKien_Chi_Dao: d.y_kien_chi_dao || '',
      Do_Khan: d.do_khan || '',
      Do_Mat: d.do_mat || '',
      Trang_Thai_Phat_Hanh: d.trang_thai_phat_hanh || '',
      So_Van_Ban: d.so_van_ban || '',
      So_Trang: d.so_trang ?? '',
      So_Ban: d.so_ban ?? '',
      Tep_Dinh_Kem: Array.isArray(d.file_names) ? d.file_names.join('; ') : '',
      Nguoi_Sua_Tay: d.edited_by_name || '',
    }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(toSheetRows(denDocs)), 'So_Van_Ban_Den');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(toSheetRows(diDocs)), 'So_Van_Ban_Di');

  const xlsxPath = path.join(backupDir, `backup-so-cong-van-${dateTag}.xlsx`);
  XLSX.writeFile(wb, xlsxPath);
  fs.chmodSync(xlsxPath, 0o600);

  console.log('\n✅ Sao lưu hoàn tất:');
  console.log(`   1. Bản sao lưu toàn bộ DB (JSON) : ${jsonPath}`);
  console.log(`      Dung lượng                    : ${(Buffer.byteLength(jsonContent) / 1024 / 1024).toFixed(2)} MB`);
  console.log(`      Mã kiểm tra toàn vẹn (SHA256) : ${sha256}`);
  console.log(`   2. Bản sao lưu Sổ công văn (XLSX): ${xlsxPath} (${denDocs.length} đến, ${diDocs.length} đi)`);
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Lỗi sao lưu:', err.message);
  process.exit(1);
});
