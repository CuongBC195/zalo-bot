/**
 * CLI Script: Đồng bộ toàn bộ văn bản mẫu vào PostgreSQL
 * Chạy: npm run db:seed
 */

require('dotenv').config();
const db = require('../src/db');
const DocumentLoader = require('../src/rag/loader');

async function run() {
  console.log('🐘 Đang kết nối PostgreSQL để đồng bộ văn bản mẫu...');
  const isConnected = await db.checkConnection();
  if (!isConnected) {
    console.error('❌ Không thể kết nối PostgreSQL. Vui lòng kiểm tra DATABASE_URL trong .env.');
    process.exit(1);
  }

  await db.initSchema({ force: true });

  const loader = new DocumentLoader();
  const chunks = loader.loadAll();
  console.log(`📚 Đọc được ${chunks.length} điều khoản từ thư mục data/regulations/.`);

  await db.seedFromFiles(chunks);
  console.log('🎉 Đồng bộ dữ liệu vào PostgreSQL hoàn tất!');
  process.exit(0);
}

run();
