/**
 * Web Admin Dashboard Server
 * Quản trị cơ sở dữ liệu văn bản Đảng, thêm/sửa/xóa và thử nghiệm RAG
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const rag = require('../rag');
const pipeline = require('../pipeline');

const app = express();
const PORT = process.env.ADMIN_PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================
// API ROUTES
// ============================================================

// 1. Lấy trạng thái hệ thống và thống kê
app.get('/api/stats', async (req, res) => {
  try {
    const isDbConnected = await db.checkConnection();
    let docs = [];

    if (isDbConnected) {
      docs = (await db.getDocuments()) || [];
    } else {
      // Đọc từ loader memory
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

    res.json({
      ok: true,
      isDbConnected,
      stats: {
        totalDocs: docs.length,
        totalArticles,
        theThucCount,
        vanThuCount,
        quyDinhCount,
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 2. Danh sách văn bản
app.get('/api/documents', async (req, res) => {
  const { category, search } = req.query;
  const isDbConnected = await db.checkConnection();

  if (isDbConnected) {
    const docs = await db.getDocuments({ category, search });
    return res.json({ ok: true, source: 'postgresql', documents: docs });
  }

  // Fallback từ RAG memory
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

// 3. Chi tiết một văn bản
app.get('/api/documents/:id', async (req, res) => {
  const { id } = req.params;
  const isDbConnected = await db.checkConnection();

  if (isDbConnected && !isNaN(id)) {
    const doc = await db.getDocumentById(id);
    if (!doc) return res.status(404).json({ ok: false, error: 'Không tìm thấy văn bản' });
    return res.json({ ok: true, document: doc });
  }

  // Tìm trong memory
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

// 4. Thêm văn bản mới
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

    // Nếu chưa có DB, lưu tạm thành file JSON vào data/regulations/
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

// 5. Cập nhật văn bản
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

// 6. Xóa văn bản
app.delete('/api/documents/:id', async (req, res) => {
  const { id } = req.params;
  const isDbConnected = await db.checkConnection();

  try {
    if (isDbConnected && !isNaN(id)) {
      const deleted = await db.deleteDocument(id);
      await rag.reload();
      return res.json({ ok: true, message: 'Đã xóa văn bản khỏi PostgreSQL', document: deleted });
    }

    // Xóa file nếu ở chế độ file
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

// 7. Tự động bóc tách văn bản thô (Auto Parser)
app.post('/api/parse-raw', (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ ok: false, error: 'Chưa có nội dung văn bản' });
  }

  const articles = [];
  // Regex nhận diện các khối "Điều 1.", "Điều 2:", "Điều 3 -"
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

  // Nếu không khớp pattern "Điều", chia thành 1 khối duy nhất
  if (!articles.length) {
    articles.push({
      articleNumber: '1',
      title: 'Nội dung quy định',
      content: text.trim(),
    });
  }

  res.json({ ok: true, count: articles.length, articles });
});

// 8. Thử nghiệm truy vấn RAG trực tiếp (AI Playground)
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

// 9. Đồng bộ toàn bộ dữ liệu mẫu vào PostgreSQL
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

// Phục vụ Single Page App
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Khởi chạy server nếu chạy trực tiếp
if (require.main === module) {
  rag.init().then(() => {
    app.listen(PORT, () => {
      console.log(`\n🌐 [Web Admin] Giao diện quản trị đang chạy tại: http://localhost:${PORT}`);
    });
  });
}

module.exports = app;
