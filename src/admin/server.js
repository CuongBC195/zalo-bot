/**
 * Web Admin Dashboard Server
 * Quản trị cơ sở dữ liệu văn bản Đảng, Xác thực Admin, Quản lý Người dùng & Audit Logs
 */

require('dotenv').config();

const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../db');
const rag = require('../rag');
const config = require('../config');
const { initServices } = require('../bootstrap');
const {
  getClientIp,
  isSecureRequest,
  getCookieOptions,
  createSessionToken,
  verifyToken,
  extractToken,
  authMiddleware,
  requireRole,
} = require('./auth');

const app = express();
const PORT = process.env.ADMIN_PORT || 3000;

// ============================================================
// SECURITY HEADERS & DEFENSE-IN-DEPTH
// ============================================================
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: https:; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'"
  );
  if (isSecureRequest(req)) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

// Rate Limiter chống Brute-Force đăng nhập (5 lần sai -> khóa tạm thời 15 phút)
const loginAttempts = new Map();
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_TIME_MS = 15 * 60 * 1000;
const DUMMY_BCRYPT_HASH = bcrypt.hashSync('dummy-timing-guard-zalo-bot', 10);

function getRateLimitKeys(req) {
  const keys = [`ip:${getClientIp(req)}`];
  const username = typeof req.body?.username === 'string' ? req.body.username.trim().toLowerCase() : '';
  if (username) keys.push(`user:${username}`);
  return keys;
}

function loginRateLimiter(req, res, next) {
  const now = Date.now();
  for (const key of getRateLimitKeys(req)) {
    const attempt = loginAttempts.get(key);
    if (attempt && attempt.count >= MAX_FAILED_ATTEMPTS) {
      if (now - attempt.lastAttempt < LOCKOUT_TIME_MS) {
        const waitMinutes = Math.ceil((LOCKOUT_TIME_MS - (now - attempt.lastAttempt)) / 60000);
        return res.status(429).json({
          ok: false,
          error: `Phát hiện nhiều lần đăng nhập không thành công. Hệ thống tạm khóa truy cập trong ${waitMinutes} phút để phòng chống tấn công.`,
        });
      }
      loginAttempts.delete(key);
    }
  }
  next();
}

function recordFailedLogin(req) {
  const now = Date.now();
  for (const key of getRateLimitKeys(req)) {
    const attempt = loginAttempts.get(key) || { count: 0, lastAttempt: now };
    attempt.count += 1;
    attempt.lastAttempt = now;
    loginAttempts.set(key, attempt);
  }
}

function clearFailedLogin(req) {
  for (const key of getRateLimitKeys(req)) {
    loginAttempts.delete(key);
  }
}

app._resetLoginRateLimiter = () => loginAttempts.clear();

app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================
// AUTHENTICATION ROUTES (PUBLIC)
// ============================================================

app.post('/api/auth/login', loginRateLimiter, async (req, res) => {
  const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!username || !password) {
    return res.status(400).json({ ok: false, error: 'Vui lòng nhập tên đăng nhập và mật khẩu.' });
  }

  try {
    const user = await db.getUserByUsername(username);

    if (user && user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
      const waitMinutes = Math.max(1, Math.ceil((new Date(user.locked_until).getTime() - Date.now()) / 60000));
      return res.status(429).json({
        ok: false,
        error: `Tài khoản đang tạm khóa do đăng nhập sai nhiều lần. Vui lòng thử lại sau ${waitMinutes} phút.`,
      });
    }

    // Luôn chạy bcrypt.compare (kể cả khi không tìm thấy user) để chống dò tên tài khoản qua thời gian phản hồi
    const isMatch = await bcrypt.compare(password, user ? user.password_hash : DUMMY_BCRYPT_HASH);
    if (!user || !isMatch) {
      recordFailedLogin(req);
      if (user) {
        await db.recordUserFailedLogin(user.username, MAX_FAILED_ATTEMPTS, LOCKOUT_TIME_MS);
      }
      return res.status(401).json({ ok: false, error: 'Tên đăng nhập hoặc mật khẩu không chính xác.' });
    }

    if (!user.is_active) {
      return res.status(403).json({ ok: false, error: 'Tài khoản này đã bị khóa. Vui lòng liên hệ quản trị viên cấp cao.' });
    }

    clearFailedLogin(req);
    await db.updateUserLastLogin(user.id);
    const { token, maxAge } = await createSessionToken(user, req);

    res.cookie('token', token, getCookieOptions(req, maxAge));

    res.json({
      ok: true,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.full_name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error('[Auth] Lỗi đăng nhập:', err.message);
    res.status(500).json({ ok: false, error: 'Lỗi hệ thống khi đăng nhập.' });
  }
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json({ ok: true, user: req.user });
});

app.post('/api/auth/logout', async (req, res) => {
  try {
    const token = extractToken(req);
    const decoded = token ? verifyToken(token) : null;
    if (decoded?.sid) {
      await db.revokeUserSession(decoded.sid);
    }
  } catch (err) {}
  res.clearCookie('token', { path: '/' });
  res.json({ ok: true, message: 'Đã đăng xuất.' });
});

// ============================================================
// PUBLIC ZALO WEBHOOK ROUTE (Không yêu cầu xác thực JWT)
// ============================================================

const ZaloAPI = require('../zalo/api');
const { handleZaloUpdate } = require('../zalo/handler');

let zaloApiInstance = null;
function getZaloApi() {
  if (!zaloApiInstance) {
    zaloApiInstance = new ZaloAPI();
  }
  return zaloApiInstance;
}

/**
 * Xác thực webhook đến từ Zalo Bot Platform qua header X-Bot-Api-Secret-Token.
 * Quyền tra cứu công văn gắn theo Zalo ID (from.id), nên nếu không xác thực,
 * bất kỳ ai biết URL webhook đều có thể giả tin nhắn để mạo danh cán bộ.
 */
let warnedMissingWebhookSecret = false;
function verifyWebhookSecret(req) {
  const expected = config.zalo.webhookSecret || process.env.ZALO_WEBHOOK_SECRET || '';
  if (!expected) {
    if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
      console.error('[Bảo mật] Từ chối webhook vì chưa cấu hình ZALO_WEBHOOK_SECRET trên Production.');
      return false;
    }
    if (!warnedMissingWebhookSecret) {
      console.warn('[Bảo mật] Chưa cấu hình ZALO_WEBHOOK_SECRET: webhook không được xác thực nguồn gửi (chỉ cho phép ở môi trường dev).');
      warnedMissingWebhookSecret = true;
    }
    return true;
  }
  const received = Buffer.from(String(req.headers['x-bot-api-secret-token'] || ''));
  const target = Buffer.from(expected);
  return received.length === target.length && crypto.timingSafeEqual(received, target);
}

app.post('/api/webhook', async (req, res) => {
  if (!verifyWebhookSecret(req)) {
    console.warn('[Webhook] Từ chối request sai hoặc thiếu X-Bot-Api-Secret-Token.');
    return res.status(403).json({ ok: false, error: 'Unauthorized webhook request' });
  }

  try {
    const update = req.body;
    if (!update || Object.keys(update).length === 0) {
      return res.status(400).json({ ok: false, error: 'Empty update payload' });
    }

    const api = getZaloApi();
    const result = await handleZaloUpdate(api, update);
    res.json({ ok: true, result });
  } catch (err) {
    console.error('[Webhook] Lỗi xử lý update:', err.message);
    res.status(500).json({ ok: false, error: 'Webhook processing error' });
  }
});

app.get('/api/webhook', (req, res) => {
  res.json({
    ok: true,
    service: 'Zalo Bot Webhook Endpoint',
    status: 'active',
    timestamp: new Date().toISOString(),
  });
});

// Vercel Cron gọi mỗi ngày (vercel.json): đọc nhẹ một bảng thật để Supabase gói Free
// không tạm dừng project vì 7 ngày không có hoạt động (dịp nghỉ dài).
// Có CRON_SECRET thì bắt buộc header "Authorization: Bearer <CRON_SECRET>" (Vercel tự gửi).
app.get('/api/cron/keepalive', async (req, res) => {
  const secret = process.env.CRON_SECRET || '';
  if (!secret && (process.env.VERCEL || process.env.NODE_ENV === 'production')) {
    return res.status(401).json({ ok: false });
  }
  if (secret) {
    const received = Buffer.from(String(req.headers.authorization || ''));
    const target = Buffer.from(`Bearer ${secret}`);
    if (received.length !== target.length || !crypto.timingSafeEqual(received, target)) {
      return res.status(401).json({ ok: false });
    }
  }
  if (!db.pool) return res.status(503).json({ ok: false });
  try {
    await db.pool.query('SELECT 1 FROM office_documents LIMIT 1');
    res.json({ ok: true });
  } catch (err) {
    console.warn('[Cron] Keepalive lỗi:', err.message);
    res.status(503).json({ ok: false });
  }
});

// ============================================================
// BẢO VỆ CÁC ROUTE QUẢN TRỊ BẰNG AUTHMIDDLEWARE
// ============================================================
app.use('/api', authMiddleware);

app.get('/api/webhook/status', requireRole('superadmin', 'admin'), async (req, res) => {
  try {
    const api = getZaloApi();
    const info = await api.getWebhookInfo();
    res.json({ ok: true, info });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Trạng thái cờ tính năng để giao diện hiển thị đúng (bảo trì / sẵn sàng)
app.get('/api/features', (req, res) => {
  res.json({
    ok: true,
    features: {
      regulationQa: config.features.regulationQa,
      officeLookup: config.features.officeLookup,
    },
    office: { unitName: config.office.unitName },
    webhookSecured: !!config.zalo.webhookSecret,
  });
});

// API thử nghiệm luồng quy định tạm dừng khi tắt cờ (đang bảo trì)
function requireRegulationQa(req, res, next) {
  if (config.features.regulationQa) return next();
  return res.status(503).json({ ok: false, maintenance: true, error: 'Luồng hỏi đáp quy định đang bảo trì.' });
}

// Tra cứu Sổ công văn đến/đi + cấp quyền Zalo
app.use('/api', require('./office-routes'));

// ============================================================
// HỒ SƠ CÁ NHÂN & ĐỔI MẬT KHẨU
// ============================================================
app.put('/api/auth/profile', async (req, res) => {
  const { fullName, email } = req.body;
  try {
    const updated = await db.updateUser(req.user.id, { fullName, email });
    res.json({ ok: true, message: 'Cập nhật thông tin thành công!', user: updated });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.put('/api/auth/change-password', async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ ok: false, error: 'Vui lòng nhập mật khẩu hiện tại và mật khẩu mới.' });
  }
  if (String(newPassword).length < 6) {
    return res.status(400).json({ ok: false, error: 'Mật khẩu mới phải có ít nhất 6 ký tự.' });
  }

  try {
    const user = await db.getUserByUsername(req.user.username);
    if (!user) {
      return res.status(404).json({ ok: false, error: 'Không tìm thấy tài khoản.' });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ ok: false, error: 'Mật khẩu hiện tại không chính xác.' });
    }

    // updateUser sẽ tự động thu hồi toàn bộ phiên cũ trên mọi thiết bị
    await db.updateUser(user.id, { password: newPassword });

    // Cấp lại phiên mới cho thiết bị hiện tại để người dùng không bị văng ra
    const { token, maxAge } = await createSessionToken(user, req);
    res.cookie('token', token, getCookieOptions(req, maxAge));

    res.json({ ok: true, message: 'Đổi mật khẩu thành công! Các phiên đăng nhập trên thiết bị khác đã được thu hồi.' });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Không thể đổi mật khẩu.' });
  }
});

// 1. Thống kê tổng quan (Dashboard)
app.get('/api/stats', async (req, res) => {
  try {
    const isDbConnected = await db.checkConnection();
    let docs = [];

    if (isDbConnected) {
      docs = (await db.getDocuments()) || [];
    } else {
      const chunks = rag.chunks || [];
      const codeSet = new Set();
      chunks.forEach(c => codeSet.add(c.documentCode || c.documentId));
      docs = Array.from(codeSet).map(code => {
        const found = chunks.filter(c => (c.documentCode || c.documentId) === code);
        return {
          document_code: code,
          document_name: found[0]?.documentName || code,
          issuer: found[0]?.issuer || 'Không rõ',
          category: found[0]?.category || 'quy_dinh_dang',
          articles_count: found.length,
          status: 'Còn hiệu lực',
        };
      });
    }

    const totalArticles = docs.reduce((acc, d) => acc + (parseInt(d.articles_count, 10) || 0), 0);
    const theThucCount = docs.filter(d => d.category === 'the_thuc').length;
    const vanThuCount = docs.filter(d => d.category === 'van_thu_luu_tru').length;
    const quyDinhCount = docs.filter(d => d.category === 'quy_dinh_dang').length;

    // Lấy số lượng người dùng
    const adminUsers = await db.getAllUsers();
    const zaloUsers = await db.getZaloUsers();

    res.json({
      ok: true,
      isDbConnected,
      stats: {
        totalDocs: docs.length,
        totalArticles,
        theThucCount,
        vanThuCount,
        quyDinhCount,
        adminCount: adminUsers.length,
        zaloUserCount: zaloUsers.length,
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ============================================================
// QUẢN LÝ TÀI KHOẢN HỆ THỐNG (CHỈ ADMIN MỚI CÓ QUYỀN)
// ============================================================
const ALLOWED_USER_ROLES = ['superadmin', 'admin', 'user'];

app.get('/api/users', requireRole('superadmin', 'admin'), async (req, res) => {
  const users = await db.getAllUsers();
  res.json({ ok: true, users });
});

app.post('/api/users', requireRole('superadmin', 'admin'), async (req, res) => {
  const { username, password, fullName, email, role } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ ok: false, error: 'Tên đăng nhập và mật khẩu là bắt buộc.' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ ok: false, error: 'Mật khẩu phải có ít nhất 6 ký tự.' });
  }

  const targetRole = role || 'user';
  if (!ALLOWED_USER_ROLES.includes(targetRole)) {
    return res.status(400).json({ ok: false, error: 'Vai trò phân quyền không hợp lệ.' });
  }

  if (req.user.role !== 'superadmin' && (targetRole === 'superadmin' || targetRole === 'admin')) {
    return res.status(403).json({
      ok: false,
      error: 'Chỉ Quản trị tối cao (superadmin) mới có quyền tạo tài khoản quản trị.',
    });
  }

  try {
    const existing = await db.getUserByUsername(String(username).trim());
    if (existing) {
      return res.status(400).json({ ok: false, error: 'Tên đăng nhập này đã được sử dụng.' });
    }

    const user = await db.createUser({
      username: String(username).trim(),
      password: String(password),
      fullName,
      email,
      role: targetRole,
    });
    res.json({ ok: true, message: 'Tạo tài khoản cán bộ thành công', user });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Không thể tạo tài khoản.' });
  }
});

app.put('/api/users/:id', requireRole('superadmin', 'admin'), async (req, res) => {
  const { id } = req.params;
  const { fullName, email, role, isActive, password } = req.body || {};

  if (role !== undefined && !ALLOWED_USER_ROLES.includes(role)) {
    return res.status(400).json({ ok: false, error: 'Vai trò phân quyền không hợp lệ.' });
  }
  if (password !== undefined && password !== '' && String(password).length < 6) {
    return res.status(400).json({ ok: false, error: 'Mật khẩu phải có ít nhất 6 ký tự.' });
  }
  if (Number(id) === Number(req.user.id) && isActive === false) {
    return res.status(400).json({ ok: false, error: 'Không thể tự khóa tài khoản của chính mình.' });
  }

  try {
    const targetUser = await db.getUserById(id);
    if (!targetUser) {
      return res.status(404).json({ ok: false, error: 'Không tìm thấy tài khoản.' });
    }

    if (req.user.role !== 'superadmin') {
      const isEditingOtherAdmin =
        targetUser.role === 'superadmin' ||
        (targetUser.role === 'admin' && Number(targetUser.id) !== Number(req.user.id));
      if (isEditingOtherAdmin) {
        return res.status(403).json({
          ok: false,
          error: 'Bạn không có quyền chỉnh sửa tài khoản Quản trị tối cao hoặc Quản trị viên khác.',
        });
      }

      if (role !== undefined && role !== targetUser.role && (role === 'superadmin' || role === 'admin')) {
        return res.status(403).json({
          ok: false,
          error: 'Chỉ Quản trị tối cao (superadmin) mới có quyền nâng cấp lên vai trò quản trị.',
        });
      }
    }

    const updated = await db.updateUser(id, {
      fullName,
      email,
      role,
      isActive: typeof isActive === 'boolean' ? isActive : undefined,
      password: password || undefined,
    });
    res.json({ ok: true, message: 'Cập nhật tài khoản thành công', user: updated });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Không thể cập nhật tài khoản.' });
  }
});

app.delete('/api/users/:id', requireRole('superadmin', 'admin'), async (req, res) => {
  const { id } = req.params;
  if (Number(req.user.id) === Number(id)) {
    return res.status(400).json({ ok: false, error: 'Không thể tự xóa tài khoản của chính mình.' });
  }

  try {
    const targetUser = await db.getUserById(id);
    if (!targetUser) {
      return res.status(404).json({ ok: false, error: 'Không tìm thấy tài khoản.' });
    }

    if (req.user.role !== 'superadmin' && (targetUser.role === 'superadmin' || targetUser.role === 'admin')) {
      return res.status(403).json({
        ok: false,
        error: 'Chỉ Quản trị tối cao (superadmin) mới có quyền xóa tài khoản quản trị.',
      });
    }

    await db.deleteUser(id);
    res.json({ ok: true, message: 'Đã xóa tài khoản cán bộ.' });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Không thể xóa tài khoản quản trị.' });
  }
});

// ============================================================
// QUẢN LÝ NGƯỜI DÙNG ZALO (ZALO USERS)
// ============================================================
app.get('/api/zalo-users', requireRole('superadmin', 'admin'), async (req, res) => {
  const { search } = req.query;
  const users = await db.getZaloUsers({ search });
  res.json({ ok: true, users });
});

app.post('/api/zalo-users/:zaloId/toggle-block', requireRole('superadmin', 'admin'), async (req, res) => {
  const { zaloId } = req.params;
  const { isBlocked } = req.body;
  try {
    const user = await db.toggleBlockZaloUser(zaloId, isBlocked);
    res.json({ ok: true, message: isBlocked ? 'Đã chặn người dùng Zalo này.' : 'Đã mở khóa cho người dùng.', user });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ============================================================
// NHẬT KÝ HỎI ĐÁP (AUDIT & QUERY LOGS)
// ============================================================
app.get('/api/query-logs', requireRole('superadmin', 'admin'), async (req, res) => {
  const { search, limit } = req.query;
  const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 200, 1), 500);
  const logs = await db.getQueryLogs({ search, limit: parsedLimit });
  res.json({ ok: true, logs });
});

// ============================================================
// QUẢN LÝ BỘ NHỚ ĐỆM CÂU TRẢ LỜI AI (RESPONSE CACHE)
// ============================================================
app.post('/api/cache/clear', requireRole('superadmin', 'admin'), async (req, res) => {
  try {
    await db.clearResponseCache();
    res.json({ ok: true, message: 'Đã xóa toàn bộ bộ nhớ đệm câu trả lời AI.' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ============================================================
// QUẢN LÝ VĂN BẢN (DOCUMENTS & ARTICLES)
// ============================================================
app.get('/api/documents', async (req, res) => {
  const { category, search } = req.query;
  const isDbConnected = await db.checkConnection();

  if (isDbConnected) {
    const docs = await db.getDocuments({ category, search });
    return res.json({ ok: true, source: 'postgresql', documents: docs });
  }

  let chunks = rag.chunks || [];
  const map = {};
  for (const c of chunks) {
    const code = c.documentCode || c.documentId;
    if (!map[code]) {
      map[code] = {
        id: code,
        document_code: code,
        document_name: c.documentName,
        issuer: c.issuer,
        category: c.category || 'quy_dinh_dang',
        issue_date: c.issueDate,
        status: c.status || 'Còn hiệu lực',
        articles_count: 0,
      };
    }
    map[code].articles_count++;
  }

  let list = Object.values(map);
  if (category) list = list.filter(d => d.category === category);
  if (search) {
    const s = search.toLowerCase();
    list = list.filter(d => d.document_code.toLowerCase().includes(s) || d.document_name.toLowerCase().includes(s));
  }

  res.json({ ok: true, source: 'local_memory', documents: list });
});

app.get('/api/documents/:id', async (req, res) => {
  const { id } = req.params;
  const isDbConnected = await db.checkConnection();

  if (isDbConnected && !isNaN(id)) {
    const doc = await db.getDocumentById(id);
    if (!doc) return res.status(404).json({ ok: false, error: 'Không tìm thấy văn bản' });
    return res.json({ ok: true, document: doc });
  }

  const chunks = (rag.chunks || []).filter(c => (c.documentCode || c.documentId) === id);
  if (!chunks.length) return res.status(404).json({ ok: false, error: 'Không tìm thấy văn bản' });

  const doc = {
    id,
    document_code: chunks[0].documentCode || id,
    document_name: chunks[0].documentName,
    issuer: chunks[0].issuer,
    category: chunks[0].category || 'quy_dinh_dang',
    issue_date: chunks[0].issueDate,
    status: chunks[0].status || 'Còn hiệu lực',
    articles: chunks.map(c => ({
      article_number: c.articleNumber,
      title: c.title,
      content: c.content,
    })),
  };

  res.json({ ok: true, document: doc });
});

app.post('/api/documents', requireRole('superadmin', 'admin'), async (req, res) => {
  const { documentCode, documentName, issuer, category, issueDate, status, description, articles } = req.body;

  if (!documentCode || !documentName || !articles?.length) {
    return res.status(400).json({ ok: false, error: 'Vui lòng điền đủ Số hiệu, Tên văn bản và ít nhất 1 Điều khoản' });
  }

  try {
    const isDbConnected = await db.checkConnection();
    if (isDbConnected) {
      const doc = await db.createDocument({
        documentCode,
        documentName,
        issuer: issuer || 'Cơ quan có thẩm quyền',
        category: category || 'quy_dinh_dang',
        issueDate,
        status: status || 'Còn hiệu lực',
        description,
        articles,
      });
      await rag.reload();
      return res.json({ ok: true, message: 'Đã lưu văn bản vào PostgreSQL thành công', document: doc });
    }

    if (process.env.VERCEL) {
      return res.status(400).json({
        ok: false,
        error: 'Hệ thống đang chạy trên Vercel Serverless (Read-Only Filesystem). Vui lòng cấu hình kết nối PostgreSQL (DATABASE_URL) để lưu trữ văn bản.',
      });
    }

    const filename = `custom-${documentCode.toLowerCase().replace(/[^a-z0-9]/g, '-')}.json`;
    const filePath = path.join(__dirname, '..', '..', 'data', 'regulations', filename);
    const data = {
      documentId: documentCode,
      documentCode,
      documentName,
      issuer: issuer || 'Cơ quan có thẩm quyền',
      category: category || 'quy_dinh_dang',
      issueDate: issueDate || new Date().toISOString().split('T')[0],
      status: status || 'Còn hiệu lực',
      description,
      articles,
    };
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    await rag.reload();

    res.json({ ok: true, message: 'Đã lưu văn bản vào kho dữ liệu JSON thành công', document: data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.put('/api/documents/:id', requireRole('superadmin', 'admin'), async (req, res) => {
  const { id } = req.params;
  const { documentCode, documentName, issuer, category, issueDate, status, description, articles } = req.body;
  const isDbConnected = await db.checkConnection();

  if (!isDbConnected) {
    return res.status(400).json({ ok: false, error: 'Cần kết nối PostgreSQL để thực hiện cập nhật động.' });
  }

  try {
    const updated = await db.updateDocument(id, {
      documentCode,
      documentName,
      issuer,
      category,
      issueDate,
      status,
      description,
      articles,
    });
    await rag.reload();
    res.json({ ok: true, message: 'Cập nhật văn bản thành công', document: updated });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.delete('/api/documents/:id', requireRole('superadmin', 'admin'), async (req, res) => {
  const { id } = req.params;
  const isDbConnected = await db.checkConnection();

  try {
    if (isDbConnected && !isNaN(id)) {
      const deleted = await db.deleteDocument(id);
      await rag.reload();
      return res.json({ ok: true, message: 'Đã xóa văn bản khỏi PostgreSQL', document: deleted });
    }

    if (process.env.VERCEL) {
      return res.status(400).json({
        ok: false,
        error: 'Hệ thống đang chạy trên Vercel Serverless (Read-Only Filesystem). Vui lòng cấu hình kết nối PostgreSQL (DATABASE_URL) để quản lý văn bản.',
      });
    }

    const regDir = path.join(__dirname, '..', '..', 'data', 'regulations');
    const files = fs.readdirSync(regDir);
    let deletedFile = false;

    for (const f of files) {
      if (f.endsWith('.json')) {
        const p = path.join(regDir, f);
        const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (raw.documentCode === id || raw.documentId === id) {
          fs.unlinkSync(p);
          deletedFile = true;
          break;
        }
      }
    }

    await rag.reload();
    res.json({ ok: true, message: deletedFile ? 'Đã xóa tệp văn bản' : 'Đã làm mới dữ liệu' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/parse-raw', requireRole('superadmin', 'admin'), (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ ok: false, error: 'Chưa có nội dung văn bản' });
  }

  const articles = [];
  const articleRegex = /(?:^|\n)\s*(Điều\s+(\d+[a-zA-Z]?)[.:\-–—]?\s*([^\n]*))\n([\s\S]*?)(?=(?:\n\s*Điều\s+\d+[a-zA-Z]?[.:\-–—]?)|$)/gi;

  let match;
  while ((match = articleRegex.exec(text)) !== null) {
    const articleNumber = match[2].trim();
    const title = (match[3] || '').trim();
    const content = match[4].trim();

    articles.push({
      articleNumber,
      title: title || `Điều ${articleNumber}`,
      content,
    });
  }

  if (!articles.length) {
    articles.push({
      articleNumber: '1',
      title: 'Nội dung quy định',
      content: text.trim(),
    });
  }

  res.json({ ok: true, count: articles.length, articles });
});

app.post('/api/rag-test', requireRegulationQa, async (req, res) => {
  const { query } = req.body;
  if (!query || !query.trim()) {
    return res.status(400).json({ ok: false, error: 'Vui lòng nhập câu hỏi thử nghiệm' });
  }

  try {
    const passages = await rag.search(query, { topK: 4 });
    const formatted = rag.formatContext(passages);

    res.json({
      ok: true,
      query,
      resultsCount: passages.length,
      passages,
      formattedContext: formatted,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ============================================================
// THỬ NGHIỆM ĐIỀU PHỐI PIPELINE 7 TẦNG & RAG X-RAY
// ============================================================
app.post('/api/pipeline-test', requireRegulationQa, async (req, res) => {
  const { query, skipCache } = req.body;
  if (!query || !query.trim()) {
    return res.status(400).json({ ok: false, error: 'Vui lòng nhập câu hỏi kiểm thử.' });
  }

  const startTime = Date.now();
  try {
    const pipeline = require('../pipeline');
    const { expandAbbreviations, buildCacheKey } = require('../rag/abbreviations');

    if (skipCache) {
      const cacheKey = buildCacheKey(expandAbbreviations(query));
      if (typeof db.deleteCachedResponse === 'function') {
        await db.deleteCachedResponse(cacheKey);
      }
    }

    const pRes = await pipeline.processMessage({
      text: query,
      senderName: req.user?.fullName || 'Quản trị viên',
      skipCache: !!skipCache,
    });

    const passages = await rag.search(query, { topK: 6 });

    res.json({
      ok: true,
      query,
      answer: pRes.answer,
      intent: pRes.intent,
      retrievedDocs: pRes.retrievedDocs || [],
      fromCache: !!pRes.fromCache,
      latencyMs: Date.now() - startTime,
      passages: passages || [],
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message,
      latencyMs: Date.now() - startTime,
    });
  }
});

// Endpoint kiểm tra sức khỏe và phân vai 3 Gemini Key trên Production
app.get('/api/health-keys', requireRole('superadmin', 'admin'), async (req, res) => {
  const keyManager = require('../gemini/key-manager');
  const maskKey = (k) => (!k || k.length < 8 ? 'CHƯA_CẤU_HÌNH' : `${k.slice(0, 6)}...${k.slice(-4)}`);

  const key1 = keyManager.getKeyForRole('rewrite');
  const key2 = keyManager.getKeyForRole('generate');
  const fallback = keyManager.fallbackKey || keyManager.getKey();

  const status = {
    ok: true,
    timestamp: new Date().toISOString(),
    architecture: 'Dual-Key Cross-Borrowing & 7-Tier Pipeline',
    active_keys_count: keyManager.keyCount,
    roles: {
      tier1_rewrite: {
        role: 'Tầng 1: Chuẩn hóa câu hỏi & Mở rộng từ khóa',
        configured: Boolean(keyManager.rewriteKey),
        key_preview: maskKey(keyManager.rewriteKey || key1),
        status: keyManager.cooldowns.has(key1) ? 'COOLDOWN_429' : 'HEALTHY',
      },
      tier2_generate: {
        role: 'Tầng 2: Tổng hợp câu trả lời hành chính',
        configured: Boolean(keyManager.generateKey),
        key_preview: maskKey(keyManager.generateKey || key2),
        status: keyManager.cooldowns.has(key2) ? 'COOLDOWN_429' : 'HEALTHY',
      },
      fallback: {
        role: 'Dự phòng chung (Fallback)',
        configured: Boolean(fallback),
        key_preview: maskKey(fallback),
        status: keyManager.cooldowns.has(fallback) ? 'COOLDOWN_429' : 'HEALTHY',
      },
    },
    database: {
      connected: await db.checkConnection(),
      total_articles_in_memory: rag.chunks ? rag.chunks.length : 0,
    },
  };

  // Nếu có tham số ?ping=true, thực hiện kiểm tra độ trễ trực tiếp tới Google AI API
  if (req.query.ping === 'true') {
    const pingResults = {};
    const testKeys = [
      { name: 'tier1_rewrite', key: keyManager.rewriteKey || key1 },
      { name: 'tier2_generate', key: keyManager.generateKey || key2 },
      { name: 'fallback', key: fallback },
    ];

    for (const item of testKeys) {
      if (!item.key) {
        pingResults[item.name] = { ok: false, error: 'Chưa cấu hình key' };
        continue;
      }
      const start = Date.now();
      try {
        const pingUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${item.key}`;
        const pingRes = await fetch(pingUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: 'ping' }] }],
            generationConfig: { maxOutputTokens: 2 },
          }),
          signal: AbortSignal.timeout(5000),
        });
        pingResults[item.name] = {
          ok: pingRes.ok,
          http_status: pingRes.status,
          latency_ms: Date.now() - start,
        };
      } catch (err) {
        pingResults[item.name] = {
          ok: false,
          error: err.message,
          latency_ms: Date.now() - start,
        };
      }
    }
    status.live_ping = pingResults;
  }

  res.json(status);
});

app.post('/api/seed-db', requireRole('superadmin', 'admin'), async (req, res) => {
  try {
    const isDbConnected = await db.checkConnection();
    if (!isDbConnected) {
      return res.status(400).json({ ok: false, error: 'Chưa kết nối được PostgreSQL. Vui lòng kiểm tra DATABASE_URL trong .env.' });
    }

    await db.initSchema({ force: true });
    const chunks = rag.loader.loadAll();
    await db.seedFromFiles(chunks);
    await rag.reload();

    res.json({ ok: true, message: 'Đã nạp toàn bộ văn bản vào PostgreSQL thành công!' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Single Page App fallback (Express 5 compatible)
app.use((req, res) => {
  const indexPath = path.join(__dirname, 'public', 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(200).send('Zalo Dang Bot Serverless Gateway Active');
  }
});

if (require.main === module) {
  initServices().then(() => {
    app.listen(PORT, () => {
      console.log(`\n[Web Admin] Giao diện quản trị đang chạy tại: http://localhost:${PORT}`);
      if (!process.env.ADMIN_PASSWORD) {
        console.warn('[Bảo mật] Chưa cấu hình ADMIN_PASSWORD trong .env! Vui lòng đặt mật khẩu bảo vệ tài khoản admin.');
      } else {
        console.log(`[Bảo mật] Tài khoản admin: ${process.env.ADMIN_USERNAME || 'admin'} (mật khẩu đã được mã hóa bcrypt)`);
      }
    });
  });
}

module.exports = app;
