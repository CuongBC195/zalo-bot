/**
 * Authentication & Security Middleware
 * Quản lý phiên đăng nhập JWT có trạng thái (Stateful Session + Device/IP Binding) cho Web Admin
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../db');

const FALLBACK_RANDOM_SECRET = crypto.randomBytes(48).toString('hex');
let warnedMissingSecret = false;

function getJwtSecret() {
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.trim().length >= 16) {
    return process.env.JWT_SECRET.trim();
  }
  const isProd = Boolean(process.env.VERCEL || process.env.NODE_ENV === 'production');
  if (!warnedMissingSecret) {
    warnedMissingSecret = true;
    console.warn(
      isProd
        ? '[Security WARNING] Chưa cấu hình JWT_SECRET trên Production. Hãy thiết lập JWT_SECRET (>= 32 bytes) trong biến môi trường.'
        : '[Security] Chưa cấu hình JWT_SECRET trong .env, đang dùng khóa tạm thời cho môi trường phát triển.'
    );
  }
  // Nếu trên Serverless chưa cấu hình JWT_SECRET, dẫn xuất khóa ổn định từ bí mật sẵn có để không lệch giữa các instance
  const seed = process.env.ADMIN_PASSWORD_HASH || process.env.ADMIN_PASSWORD || process.env.CRON_SECRET || process.env.DATABASE_URL;
  if (isProd && seed) {
    return crypto.createHmac('sha256', 'zalo-bot-jwt-fallback-v1').update(seed).digest('hex');
  }
  return FALLBACK_RANDOM_SECRET;
}

const SESSION_TTL_HOURS = Math.max(1, parseInt(process.env.SESSION_TTL_HOURS || '12', 10) || 12);
const SESSION_TTL_MS = SESSION_TTL_HOURS * 3600 * 1000;
const TOKEN_EXPIRY = `${SESSION_TTL_HOURS}h`;

function sha256Short(input) {
  return crypto.createHash('sha256').update(String(input || '')).digest('hex').slice(0, 32);
}

/**
 * Lấy IP thực của client một cách an toàn:
 * - Chỉ tin cậy header proxy (x-real-ip / phần tử cuối của x-forwarded-for) khi chạy trên Vercel hoặc bật TRUST_PROXY=true.
 * - Ngăn chặn tấn công giả mạo phần tử đầu của X-Forwarded-For để vượt Rate Limiter.
 */
function getClientIp(req) {
  const trustProxy = Boolean(process.env.VERCEL === '1' || process.env.VERCEL === 'true' || process.env.TRUST_PROXY === 'true');
  let rawIp = '';

  if (trustProxy) {
    const realIp = req.headers?.['x-real-ip'];
    const xff = req.headers?.['x-forwarded-for'];
    if (typeof realIp === 'string' && realIp.trim()) {
      rawIp = realIp.trim();
    } else if (typeof xff === 'string' && xff.trim()) {
      const parts = xff.split(',').map((s) => s.trim()).filter(Boolean);
      rawIp = parts[parts.length - 1] || '';
    }
  }

  if (!rawIp) {
    rawIp = req.socket?.remoteAddress || req.connection?.remoteAddress || 'unknown';
  }

  // Chuẩn hóa IPv4-mapped IPv6 và loopback trên môi trường local
  if (rawIp === '::1' || rawIp === '::ffff:127.0.0.1') {
    return '127.0.0.1';
  }
  if (rawIp.startsWith('::ffff:')) {
    return rawIp.slice(7);
  }
  return rawIp;
}

/**
 * Chuẩn hóa chuỗi User-Agent chỉ lấy major version (ví dụ Chrome/130.0.6723.58 -> Chrome/130)
 * để trình duyệt tự cập nhật bản vá nhỏ trong ngày không làm văng phiên.
 */
function normalizeUserAgent(ua) {
  return String(ua || '')
    .trim()
    .replace(/\/(\d+)\.\d+(?:\.\d+)*/g, '/$1');
}

/**
 * Tính toán dấu vân tay ngữ cảnh phiên đăng nhập (Thiết bị/Trình duyệt + Mạng IP)
 */
function computeContextHashes(req) {
  const ua = normalizeUserAgent(req.headers?.['user-agent']);
  const chPlatform = String(req.headers?.['sec-ch-ua-platform'] || '').trim();
  const deviceKey = String(req.headers?.['x-device-key'] || '').trim();

  const uaHash = sha256Short(`${ua}|${chPlatform}|${deviceKey}`);
  const ipHash = sha256Short(getClientIp(req));
  return { uaHash, ipHash };
}

function isSecureRequest(req) {
  return Boolean(
    process.env.NODE_ENV === 'production' ||
    process.env.VERCEL ||
    req.secure ||
    req.headers?.['x-forwarded-proto'] === 'https'
  );
}

function getCookieOptions(req, maxAge = SESSION_TTL_MS) {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: isSecureRequest(req),
    path: '/',
    maxAge,
  };
}

function generateToken(user, ctx = {}) {
  const payload = {
    sid: ctx.sessionId || crypto.randomBytes(24).toString('hex'),
    id: user.id,
    username: user.username,
    fullName: user.full_name || user.fullName || user.username,
    role: user.role || 'admin',
  };
  if (ctx.uaHash) payload.uah = ctx.uaHash;
  if (ctx.ipHash) payload.iph = ctx.ipHash;

  return jwt.sign(payload, getJwtSecret(), { expiresIn: TOKEN_EXPIRY });
}

async function createSessionToken(user, req) {
  const sessionId = crypto.randomBytes(24).toString('hex');
  const { uaHash, ipHash } = computeContextHashes(req);

  await db.createUserSession({
    sessionId,
    userId: user.id,
    uaHash,
    ipHash,
    ttlMs: SESSION_TTL_MS,
  });

  const token = generateToken(user, { sessionId, uaHash, ipHash });
  return { token, sessionId, maxAge: SESSION_TTL_MS };
}

function verifyToken(token) {
  try {
    return jwt.verify(token, getJwtSecret());
  } catch (err) {
    return null;
  }
}

function extractToken(req) {
  const authHeader = req.headers?.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.split(' ')[1];
  }
  if (req.cookies && req.cookies.token) {
    return req.cookies.token;
  }
  return null;
}

async function authMiddleware(req, res, next) {
  // Bỏ qua xác thực cho các route công khai
  const publicPaths = ['/api/auth/login', '/api/auth/status'];
  if (publicPaths.includes(req.path)) {
    return next();
  }

  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ ok: false, error: 'Chưa đăng nhập. Vui lòng đăng nhập để tiếp tục.' });
  }

  const decoded = verifyToken(token);
  if (!decoded || !decoded.sid) {
    res.clearCookie('token', { path: '/' });
    return res.status(401).json({ ok: false, error: 'Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.' });
  }

  // Kiểm tra trạng thái phiên trên Server/DB (chống dùng lại cookie sau khi logout/đổi mật khẩu/khóa tài khoản)
  const session = await db.getValidUserSession(decoded.sid);
  if (!session) {
    res.clearCookie('token', { path: '/' });
    return res.status(401).json({ ok: false, error: 'Phiên làm việc đã hết hạn hoặc bị thu hồi. Vui lòng đăng nhập lại.' });
  }

  // Kiểm tra ràng buộc Thiết bị (User-Agent + Device Key) và Mạng (IP)
  const { uaHash, ipHash } = computeContextHashes(req);
  const uaMismatch = session.ua_hash !== uaHash || (decoded.uah && decoded.uah !== uaHash);
  const ipChanged = Boolean(session.ip_hash && session.ip_hash !== ipHash);
  const strictIp = process.env.STRICT_SESSION_IP === 'true';
  const ipMismatch = strictIp && ipChanged;

  if (uaMismatch || ipMismatch) {
    await db.revokeUserSession(decoded.sid);
    res.clearCookie('token', { path: '/' });
    return res.status(401).json({
      ok: false,
      error: 'Phát hiện phiên đăng nhập từ thiết bị hoặc mạng khác. Phiên làm việc đã bị thu hồi để bảo mật.',
    });
  }

  if (ipChanged) {
    console.info(`[Security] Phiên của "${session.username}" chuyển mạng IP mới (giữ phiên vì khớp thiết bị).`);
    db.updateSessionIp(session.session_id, ipHash).catch(() => {});
  }

  req.sessionId = session.session_id;
  req.user = {
    id: session.user_id,
    username: session.username,
    fullName: session.full_name || session.username,
    email: session.email,
    role: session.role || 'user',
  };
  next();
}

/**
 * Middleware phân quyền vai trò (Role-Based Access Control)
 * @param  {...string} roles - Danh sách vai trò được phép (ví dụ: 'superadmin', 'admin')
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ ok: false, error: 'Chưa xác thực người dùng.' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        ok: false,
        error: `Bạn không có quyền thực hiện thao tác này. Yêu cầu quyền: [${roles.join(', ')}].`,
      });
    }

    next();
  };
}

module.exports = {
  SESSION_TTL_MS,
  getClientIp,
  computeContextHashes,
  isSecureRequest,
  getCookieOptions,
  generateToken,
  createSessionToken,
  verifyToken,
  extractToken,
  authMiddleware,
  requireRole,
};
