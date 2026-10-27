/**
 * CLI Script: Khởi tạo bảng schema trên PostgreSQL
 * Chạy: npm run db:init
 */

require('dotenv').config();
const db = require('../src/db');

async function run() {
  console.log('🐘 Đang kết nối PostgreSQL để khởi tạo bảng schema...');
  const ok = await db.initSchema({ force: true });
  if (ok) {
    console.log('✅ Khởi tạo cơ sở dữ liệu PostgreSQL thành công!');
    process.exit(0);
  } else {
    console.error('❌ Không thể kết nối hoặc khởi tạo schema trên PostgreSQL.');
    console.error('   Vui lòng kiểm tra biến DATABASE_URL trong .env.');
    process.exit(1);
  }
}

run();
