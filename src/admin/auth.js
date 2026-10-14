/**
 * Authentication & Security Middleware
 * Quản lý phiên đăng nhập JWT cho Web Admin
 */

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'zalo_dang_ai_bot_secure_secret_key_2026';
const TOKEN_EXPIRY = '7d';

function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      fullName: user.full_name || user.username,
      role: user.role || 'admin',
    },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

function authMiddleware(req, res, next) {
  // Bỏ qua xác thực cho các route công khai
  const publicPaths = ['/api/auth/login', '/api/auth/status'];
  if (publicPaths.includes(req.path)) {
    return next();
  }

  // Lấy token từ Header Authorization hoặc Cookie
  let token = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }

  if (!token) {
    return res.status(401).json({ ok: false, error: 'Chưa đăng nhập. Vui lòng đăng nhập để tiếp tục.' });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ ok: false, error: 'Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.' });
  }

  req.user = decoded;
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
  generateToken,
  verifyToken,
  authMiddleware,
  requireRole,
};
