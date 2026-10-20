/**
 * Khởi tạo dịch vụ dùng chung cho Bot (polling), Web Admin và Vercel Serverless.
 *
 * - Khi bật hỏi đáp quy định: nạp RAG Engine (rag.init() đồng thời khởi tạo schema).
 * - Khi tắt (mặc định): chỉ khởi tạo schema Postgres, bỏ qua việc nạp ~460 điều khoản
 *   để cold start nhanh hơn. Bắt buộc gọi initSchema() riêng, nếu không các bảng mới
 *   của luồng công văn sẽ không được tạo trên Vercel.
 */

const config = require('./config');
const db = require('./db');

async function initServices() {
  if (config.features.regulationQa) {
    const rag = require('./rag');
    const count = await rag.init();
    return { mode: 'regulation', articles: count };
  }

  const ok = await db.initSchema();
  if (!ok) {
    console.warn('[Bootstrap] Không khởi tạo được schema Postgres (chế độ dự phòng bộ nhớ).');
  }
  return { mode: 'office', schemaReady: !!ok };
}

module.exports = { initServices };
