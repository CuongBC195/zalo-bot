/**
 * Vercel Serverless Entry Point
 * Mount toàn bộ Express App (Web Admin Dashboard + Zalo Webhook API)
 */
require('dotenv').config();
const rag = require('../src/rag');
const app = require('../src/admin/server');

let initPromise = null;
function ensureInit() {
  if (!initPromise) {
    initPromise = rag.init().catch(err => {
      console.warn('[Vercel Serverless] Cảnh báo khởi tạo RAG Engine:', err.message);
    });
  }
  return initPromise;
}

module.exports = async (req, res) => {
  await ensureInit();
  return app(req, res);
};
