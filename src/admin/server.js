/**
 * Web Admin Dashboard Server
 * Quản trị cơ sở dữ liệu văn bản Đảng, Xác thực Admin, Quản lý Người dùng & Audit Logs
 */

const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const db = require('../db');
const rag = require('../rag');
const { generateToken, authMiddleware } = require('./auth');

const app = express();
const PORT = process.env.ADMIN_PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================
// AUTHENTICATION ROUTES (PUBLIC)
// ============================================================

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ ok: false, error: 'Vui lòng nhập tên đăng nhập và mật khẩu.' });
  }

  try {
    const user = await db.getUserByUsername(username);
    if (!user) {
      return res.status(401).json({ ok: false, error: 'Tài khoản không tồn tại trên hệ thống.' });
    }

    if (!user.is_active) {
      return res.status(403).json({ ok: false, error: 'Tài khoản này đã bị khóa. Vui lòng liên hệ quản trị viên cấp cao.' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ ok: false, error: 'Mật khẩu không chính xác.' });
    }

    await db.updateUserLastLogin(user.id);
    const token = generateToken(user);

    res.cookie('token', token, {
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: 'strict',
    });

    res.json({
      ok: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.full_name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json({ ok: true, user: req.user });
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true, message: 'Đã đăng xuất.' });
});

// ============================================================
// BẢO VỆ CÁC ROUTE QUẢN TRỊ BẰNG AUTHMIDDLEWARE
// ============================================================
app.use('/api', authMiddleware);

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
// QUẢN LÝ TÀI KHOẢN ADMIN (USERS)
// ============================================================
app.get('/api/users', async (req, res) => {
  const users = await db.getAllUsers();
  res.json({ ok: true, users });
});

app.post('/api/users', async (req, res) => {
  const { username, password, fullName, email, role } = req.body;
  if (!username || !password) {
    return res.status(400).json({ ok: false, error: 'Tên đăng nhập và mật khẩu là bắt buộc.' });
  }

  try {
    const existing = await db.getUserByUsername(username);
    if (existing) {
      return res.status(400).json({ ok: false, error: 'Tên đăng nhập này đã được sử dụng.' });
    }

    const user = await db.createUser({ username, password, fullName, email, role });
    res.json({ ok: true, message: 'Tạo tài khoản quản trị thành công', user });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.put('/api/users/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const updated = await db.updateUser(id, req.body);
    res.json({ ok: true, message: 'Cập nhật tài khoản thành công', user: updated });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.delete('/api/users/:id', async (req, res) => {
  const { id } = req.params;
  if (req.user.id === Number(id)) {
    return res.status(400).json({ ok: false, error: 'Không thể tự xóa tài khoản của chính mình.' });
  }

  try {
    await db.deleteUser(id);
    res.json({ ok: true, message: 'Đã xóa tài khoản quản trị.' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ============================================================
// QUẢN LÝ NGƯỜI DÙNG ZALO (ZALO USERS)
// ============================================================
app.get('/api/zalo-users', async (req, res) => {
  const { search } = req.query;
  const users = await db.getZaloUsers({ search });
  res.json({ ok: true, users });
});

app.post('/api/zalo-users/:zaloId/toggle-block', async (req, res) => {
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
app.get('/api/query-logs', async (req, res) => {
  const { search, limit } = req.query;
  const logs = await db.getQueryLogs({ search, limit: parseInt(limit, 10) || 50 });
  res.json({ ok: true, logs });
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

app.post('/api/documents', async (req, res) => {
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

app.put('/api/documents/:id', async (req, res) => {
  const { id } = req.params;
  const isDbConnected = await db.checkConnection();

  if (!isDbConnected) {
    return res.status(400).json({ ok: false, error: 'Cần kết nối PostgreSQL để thực hiện cập nhật động.' });
  }

  try {
    const updated = await db.updateDocument(id, req.body);
    await rag.reload();
    res.json({ ok: true, message: 'Cập nhật văn bản thành công', document: updated });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.delete('/api/documents/:id', async (req, res) => {
  const { id } = req.params;
  const isDbConnected = await db.checkConnection();

  try {
    if (isDbConnected && !isNaN(id)) {
      const deleted = await db.deleteDocument(id);
      await rag.reload();
      return res.json({ ok: true, message: 'Đã xóa văn bản khỏi PostgreSQL', document: deleted });
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

app.post('/api/parse-raw', (req, res) => {
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

app.post('/api/rag-test', async (req, res) => {
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

app.post('/api/seed-db', async (req, res) => {
  try {
    const isDbConnected = await db.checkConnection();
    if (!isDbConnected) {
      return res.status(400).json({ ok: false, error: 'Chưa kết nối được PostgreSQL. Vui lòng kiểm tra DATABASE_URL trong .env.' });
    }

    await db.initSchema();
    const chunks = rag.loader.loadAll();
    await db.seedFromFiles(chunks);
    await rag.reload();

    res.json({ ok: true, message: 'Đã nạp toàn bộ văn bản vào PostgreSQL thành công!' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Single Page App fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

if (require.main === module) {
  rag.init().then(() => {
    app.listen(PORT, () => {
      console.log(`\n🌐 [Web Admin] Giao diện quản trị đang chạy tại: http://localhost:${PORT}`);
      console.log(`🔑 Tài khoản mặc định: admin / ${process.env.ADMIN_PASSWORD || 'Admin@123456'}`);
    });
  });
}

module.exports = app;
