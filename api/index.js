require('dotenv').config();

let rag = null;
let app = null;
let bootError = null;

try {
  rag = require('../src/rag');
  app = require('../src/admin/server');
} catch (err) {
  bootError = err;
  console.error('[Vercel Boot Error]:', err);
}

let initPromise = null;
function ensureInit() {
  if (!initPromise && rag) {
    initPromise = rag.init().catch(err => {
      console.warn('[Vercel Serverless] Cảnh báo khởi tạo RAG Engine:', err.message);
    });
  }
  return initPromise || Promise.resolve();
}

module.exports = (req, res) => {
  if (bootError) {
    return res.status(500).json({
      ok: false,
      error: 'Vercel Serverless Boot Error: ' + bootError.message,
      stack: bootError.stack,
    });
  }

  return new Promise((resolve) => {
    res.on('finish', resolve);
    res.on('close', resolve);

    ensureInit()
      .then(() => {
        app(req, res);
      })
      .catch((err) => {
        console.error('[Serverless Error]:', err);
        if (!res.headersSent) {
          res.status(500).json({
            ok: false,
            error: 'Serverless Runtime Error: ' + err.message,
            stack: err.stack,
          });
        }
        resolve();
      });
  });
};
