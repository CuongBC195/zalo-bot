/**
 * PostgreSQL Database Service cho Văn bản Đảng
 * Hỗ trợ CRUD văn bản, Full-text Search và tự động Fallback
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

class DatabaseService {
  constructor() {
    this.pool = null;
    this.isConnected = false;
    this.initPool();
  }

  initPool() {
    const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/zalo_dang_bot';
    
    try {
      this.pool = new Pool({
        connectionString,
        connectionTimeoutMillis: 3000,
        idleTimeoutMillis: 10000,
        max: 10,
      });

      // Lắng nghe sự kiện lỗi của client idle
      this.pool.on('error', (err) => {
        console.warn('[Postgres] Cảnh báo kết nối pool:', err.message);
        this.isConnected = false;
      });
    } catch (err) {
      console.warn('[Postgres] Không thể tạo Pool kết nối:', err.message);
      this.isConnected = false;
    }
  }

  /**
   * Kiểm tra kết nối tới cơ sở dữ liệu PostgreSQL
   */
  async checkConnection() {
    if (!this.pool) return false;
    try {
      const client = await this.pool.connect();
      const res = await client.query('SELECT NOW()');
      client.release();
      this.isConnected = true;
      return true;
    } catch (err) {
      this.isConnected = false;
      return false;
    }
  }

  /**
   * Khởi tạo bảng dữ liệu từ schema.sql
   */
  async initSchema() {
    const isOk = await this.checkConnection();
    if (!isOk) {
      console.warn('[Postgres] Chưa kết nối được PostgreSQL, bỏ qua khởi tạo schema.');
      return false;
    }

    try {
      const schemaPath = path.join(__dirname, 'schema.sql');
      const sql = fs.readFileSync(schemaPath, 'utf8');
      await this.pool.query(sql);
      console.log('✅ [Postgres] Đã khởi tạo schema bảng documents và articles thành công.');
      return true;
    } catch (err) {
      console.error('[Postgres] Lỗi khởi tạo schema:', err.message);
      return false;
    }
  }

  /**
   * Lấy danh sách tất cả văn bản kèm số lượng điều khoản
   */
  async getDocuments({ category = null, search = '' } = {}) {
    const isOk = await this.checkConnection();
    if (!isOk) return null; // fallback signal

    try {
      let query = `
        SELECT d.*, COUNT(a.id)::int as articles_count
        FROM documents d
        LEFT JOIN articles a ON d.id = a.document_id
        WHERE 1=1
      `;
      const params = [];

      if (category) {
        params.push(category);
        query += ` AND d.category = $${params.length}`;
      }

      if (search) {
        params.push(`%${search}%`);
        query += ` AND (d.document_code ILIKE $${params.length} OR d.document_name ILIKE $${params.length} OR d.issuer ILIKE $${params.length})`;
      }

      query += ` GROUP BY d.id ORDER BY d.id DESC`;

      const res = await this.pool.query(query, params);
      return res.rows;
    } catch (err) {
      console.error('[Postgres] Lỗi getDocuments:', err.message);
      return null;
    }
  }

  /**
   * Lấy chi tiết văn bản kèm toàn bộ Điều/Khoản
   */
  async getDocumentById(id) {
    const isOk = await this.checkConnection();
    if (!isOk) return null;

    try {
      const docRes = await this.pool.query('SELECT * FROM documents WHERE id = $1', [id]);
      if (!docRes.rows.length) return null;

      const doc = docRes.rows[0];
      const artRes = await this.pool.query(
        'SELECT * FROM articles WHERE document_id = $1 ORDER BY id ASC',
        [id]
      );
      doc.articles = artRes.rows;
      return doc;
    } catch (err) {
      console.error('[Postgres] Lỗi getDocumentById:', err.message);
      return null;
    }
  }

  /**
   * Thêm mới một văn bản kèm các Điều/Khoản vào PostgreSQL
   */
  async createDocument({ documentCode, documentName, issuer, category = 'quy_dinh_dang', issueDate = '', status = 'Còn hiệu lực', description = '', articles = [] }) {
    const isOk = await this.checkConnection();
    if (!isOk) throw new Error('Chưa kết nối được tới PostgreSQL');

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const docRes = await client.query(
        `INSERT INTO documents (document_code, document_name, issuer, category, issue_date, status, description, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         ON CONFLICT (document_code) DO UPDATE
         SET document_name = EXCLUDED.document_name,
             issuer = EXCLUDED.issuer,
             category = EXCLUDED.category,
             issue_date = EXCLUDED.issue_date,
             status = EXCLUDED.status,
             description = EXCLUDED.description,
             updated_at = NOW()
         RETURNING *`,
        [documentCode, documentName, issuer, category, issueDate, status, description]
      );

      const docId = docRes.rows[0].id;

      // Xóa các điều cũ nếu có để ghi mới
      await client.query('DELETE FROM articles WHERE document_id = $1', [docId]);

      // Thêm các Điều/Khoản mới
      for (const art of articles) {
        await client.query(
          `INSERT INTO articles (document_id, article_number, title, content)
           VALUES ($1, $2, $3, $4)`,
          [docId, String(art.articleNumber || ''), art.title || '', art.content || '']
        );
      }

      await client.query('COMMIT');
      return docRes.rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Cập nhật văn bản và các điều khoản
   */
  async updateDocument(id, { documentCode, documentName, issuer, category, issueDate, status, description, articles }) {
    const isOk = await this.checkConnection();
    if (!isOk) throw new Error('Chưa kết nối được tới PostgreSQL');

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const docRes = await client.query(
        `UPDATE documents 
         SET document_code = $1, document_name = $2, issuer = $3, category = $4, issue_date = $5, status = $6, description = $7, updated_at = NOW()
         WHERE id = $8
         RETURNING *`,
        [documentCode, documentName, issuer, category, issueDate, status, description, id]
      );

      if (!docRes.rows.length) {
        throw new Error(`Không tìm thấy văn bản ID ${id}`);
      }

      if (Array.isArray(articles)) {
        await client.query('DELETE FROM articles WHERE document_id = $1', [id]);
        for (const art of articles) {
          await client.query(
            `INSERT INTO articles (document_id, article_number, title, content)
             VALUES ($1, $2, $3, $4)`,
            [id, String(art.articleNumber || ''), art.title || '', art.content || '']
          );
        }
      }

      await client.query('COMMIT');
      return docRes.rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Xóa văn bản (CASCADE tự xóa các articles liên quan)
   */
  async deleteDocument(id) {
    const isOk = await this.checkConnection();
    if (!isOk) throw new Error('Chưa kết nối được tới PostgreSQL');

    const res = await this.pool.query('DELETE FROM documents WHERE id = $1 RETURNING *', [id]);
    return res.rows[0] || null;
  }

  /**
   * Tìm kiếm Điều/Khoản trong PostgreSQL phục vụ RAG
   */
  async searchArticles(queryStr, { topK = 4 } = {}) {
    const isOk = await this.checkConnection();
    if (!isOk) return null;

    try {
      const searchSql = `
        SELECT 
          a.id,
          a.article_number as "articleNumber",
          a.title,
          a.content,
          d.document_code as "documentCode",
          d.document_name as "documentName",
          d.issuer,
          d.issue_date as "issueDate",
          d.category,
          ts_rank(a.tsv, plainto_tsquery('simple', $1)) as rank
        FROM articles a
        JOIN documents d ON a.document_id = d.id
        WHERE 
          a.tsv @@ plainto_tsquery('simple', $1)
          OR a.title ILIKE $2
          OR a.content ILIKE $2
          OR d.document_code ILIKE $2
        ORDER BY rank DESC, a.id ASC
        LIMIT $3
      `;

      const res = await this.pool.query(searchSql, [
        queryStr,
        `%${queryStr}%`,
        topK,
      ]);

      return res.rows.map(row => ({
        ...row,
        fullText: `${row.documentCode} ${row.documentName} - Điều ${row.articleNumber}: ${row.title}. ${row.content}`,
      }));
    } catch (err) {
      console.warn('[Postgres] Lỗi searchArticles:', err.message);
      return null;
    }
  }

  /**
   * Đồng bộ toàn bộ tài liệu từ file JSON vào PostgreSQL (Seeding)
   */
  async seedFromFiles(chunks) {
    const isOk = await this.checkConnection();
    if (!isOk) return false;

    // Gom nhóm chunks theo documentCode
    const docsMap = {};
    for (const c of chunks) {
      const code = c.documentCode || c.documentId;
      if (!docsMap[code]) {
        docsMap[code] = {
          documentCode: code,
          documentName: c.documentName,
          issuer: c.issuer,
          category: c.category || 'quy_dinh_dang',
          issueDate: c.issueDate,
          status: c.status || 'Còn hiệu lực',
          articles: [],
        };
      }
      docsMap[code].articles.push({
        articleNumber: c.articleNumber,
        title: c.title,
        content: c.content,
      });
    }

    for (const doc of Object.values(docsMap)) {
      await this.createDocument(doc);
    }

    console.log(`✅ [Postgres] Đã đồng bộ ${Object.keys(docsMap).length} văn bản vào PostgreSQL.`);
    return true;
  }
}

module.exports = new DatabaseService();
