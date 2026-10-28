require('dotenv').config();

let bootstrap = null;
let app = null;
let bootError = null;

try {
  bootstrap = require('../src/bootstrap');
  app = require('../src/admin/server');
} catch (err) {
  bootError = err;
  console.error('[Vercel Boot Error]:', err);
}

let initPromise = null;
function ensureInit() {
  if (!initPromise && bootstrap) {
    initPromise = bootstrap.initServices().catch(err => {
      console.warn('[Vercel Serverless] Cảnh báo khởi tạo dịch vụ:', err.message);
    });
  }
  return initPromise || Promise.resolve();
}

module.exports = (req, res) => {
  if (bootError) {
    return res.status(500).json({
      ok: false,
      error: 'Lỗi khởi tạo hệ thống máy chủ. Vui lòng thử lại sau.',
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
            error: 'Lỗi xử lý yêu cầu trên máy chủ.',
          });
        }
        resolve();
      });
  });
};
