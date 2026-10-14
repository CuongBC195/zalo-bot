/**
 * Script nạp và kiểm tra tính hợp lệ của kho tài liệu văn bản Đảng
 * Chạy: node scripts/ingest.js
 * hoặc: npm run ingest
 */

const DocumentLoader = require('../src/rag/loader');
const path = require('path');
const fs = require('fs');

function run() {
  console.log('📚 Đang kiểm tra và nạp văn bản Đảng vào kho dữ liệu RAG...');

  const loader = new DocumentLoader();
  const chunks = loader.loadAll();

  console.log(`✅ Đã nạp thành công tổng cộng ${chunks.length} điều khoản quy định.\n`);

  const docStats = {};
  for (const c of chunks) {
    const code = c.documentCode || c.documentId || 'Không rõ';
    if (!docStats[code]) {
      docStats[code] = {
        name: c.documentName,
        issuer: c.issuer,
        articlesCount: 0,
      };
    }
    docStats[code].articlesCount++;
  }

  console.log('📊 THỐNG KÊ VĂN BẢN ĐÃ CHỈ MỤC:');
  console.log('────────────────────────────────────────────────');
  for (const [code, info] of Object.entries(docStats)) {
    console.log(`• [${code}] ${info.name}`);
    console.log(`  Cơ quan: ${info.issuer} | Số lượng điều: ${info.articlesCount}`);
  }
  console.log('────────────────────────────────────────────────');
  console.log('✨ Kho dữ liệu đã sẵn sàng phục vụ tra cứu!\n');
}

run();
