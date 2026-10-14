/**
 * PostgreSQL Database Service cho Văn bản Đảng
 * Hỗ trợ CRUD văn bản, Quản lý Người dùng, Quản lý Zalo Users và Nhật ký Audit
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

class DatabaseService {
  constructor() {
    this.pool = null;
    this.isConnected = false;

    // Bộ nhớ đệm fallback khi chưa kết nối PostgreSQL
    this.localUsers = [];
    this.localZaloUsers = new Map();
    this.localQueryLogs = [];

    this._initLocalAdmin();
    this.initPool();
  }

  _initLocalAdmin() {
    const passwordHash = bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'Admin@123456', 10);
    this.localUsers = [
      {
        id: 1,
        username: process.env.ADMIN_USERNAME || 'admin',
        password_hash: passwordHash,
        full_name: 'Quản Trị Viên Hệ Thống',
        email: 'admin@party.gov.vn',
        role: 'superadmin',
        is_active: true,
        created_at: new Date(),
        last_login: null,
      },
    ];
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

      this.pool.on('error', (err) => {
        console.warn('[Postgres] Cảnh báo kết nối pool:', err.message);
        this.isConnected = false;
      });
    } catch (err) {
      console.warn('[Postgres] Không thể tạo Pool kết nối:', err.message);
      this.isConnected = false;
    }
  }

  async checkConnection(force = false) {
    if (!this.pool) return false;
    const now = Date.now();
    const cacheTtl = this.isConnected ? 30000 : 15000;
    if (!force && this._lastCheck && (now - this._lastCheck < cacheTtl)) {
      return this.isConnected;
    }

    this._lastCheck = now;
    try {
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();
      this.isConnected = true;
      return true;
    } catch (err) {
      this.isConnected = false;
      return false;
    }
  }

  async initSchema() {
    const isOk = await this.checkConnection();
    if (!isOk) return false;

    try {
      const schemaPath = path.join(__dirname, 'schema.sql');
      const sql = fs.readFileSync(schemaPath, 'utf8');
      await this.pool.query(sql);
      console.log('✅ [Postgres] Đã khởi tạo schema bảng (documents, articles, users, zalo_users, query_logs).');

      // Tự động khởi tạo tài khoản superadmin mặc định nếu bảng users trống
      await this.seedAdminUser();
      return true;
    } catch (err) {
      console.error('[Postgres] Lỗi khởi tạo schema:', err.message);
      return false;
    }
  }

  // ============================================================
  // QUẢN LÝ TÀI KHOẢN ADMIN (USERS)
  // ============================================================

  async seedAdminUser() {
    const username = process.env.ADMIN_USERNAME || 'admin';
    const password = process.env.ADMIN_PASSWORD || 'Admin@123456';

    const isOk = await this.checkConnection();
    if (isOk) {
      try {
        const exist = await this.pool.query('SELECT id FROM users WHERE username = $1', [username]);
        if (!exist.rows.length) {
          const hash = await bcrypt.hash(password, 10);
          await this.pool.query(
            `INSERT INTO users (username, password_hash, full_name, email, role, is_active)
             VALUES ($1, $2, $3, $4, 'superadmin', true)`,
            [username, hash, 'Quản Trị Viên Hệ Thống', 'admin@party.gov.vn']
          );
          console.log(`👤 [Postgres] Đã tạo tài khoản quản trị mặc định: "${username}"`);
        }
      } catch (err) {
        console.error('[Postgres] Lỗi tạo tài khoản admin mặc định:', err.message);
      }
    }
  }

  async getUserByUsername(username) {
    const isOk = await this.checkConnection();
    if (isOk) {
      try {
        const res = await this.pool.query('SELECT * FROM users WHERE username = $1', [username]);
        return res.rows[0] || null;
      } catch (err) {
        console.error('[Postgres] Lỗi getUserByUsername:', err.message);
      }
    }

    return this.localUsers.find(u => u.username === username) || null;
  }

  async getAllUsers() {
    const isOk = await this.checkConnection();
    if (isOk) {
      try {
        const res = await this.pool.query(
          'SELECT id, username, full_name, email, role, is_active, created_at, last_login FROM users ORDER BY id ASC'
        );
        return res.rows;
      } catch (err) {
        console.error('[Postgres] Lỗi getAllUsers:', err.message);
      }
    }

    return this.localUsers.map(({ password_hash, ...u }) => u);
  }

  async createUser({ username, password, fullName, email, role = 'admin' }) {
    const passwordHash = await bcrypt.hash(password, 10);
    const isOk = await this.checkConnection();

    if (isOk) {
      const res = await this.pool.query(
        `INSERT INTO users (username, password_hash, full_name, email, role, is_active)
         VALUES ($1, $2, $3, $4, $5, true)
         RETURNING id, username, full_name, email, role, is_active, created_at`,
        [username, passwordHash, fullName || username, email || '', role]
      );
      return res.rows[0];
    }

    const newUser = {
      id: Date.now(),
      username,
      password_hash: passwordHash,
      full_name: fullName || username,
      email: email || '',
      role,
      is_active: true,
      created_at: new Date(),
      last_login: null,
    };
    this.localUsers.push(newUser);
    const { password_hash, ...safeUser } = newUser;
    return safeUser;
  }

  async updateUser(id, { fullName, email, role, isActive, password }) {
    const isOk = await this.checkConnection();

    if (isOk) {
      let query = `UPDATE users SET full_name = COALESCE($1, full_name), email = COALESCE($2, email), role = COALESCE($3, role), is_active = COALESCE($4, is_active)`;
      const params = [fullName, email, role, isActive];

      if (password) {
        const hash = await bcrypt.hash(password, 10);
        params.push(hash);
        query += `, password_hash = $${params.length}`;
      }

      params.push(id);
      query += ` WHERE id = $${params.length} RETURNING id, username, full_name, email, role, is_active, created_at`;

      const res = await this.pool.query(query, params);
      return res.rows[0] || null;
    }

    const user = this.localUsers.find(u => u.id === Number(id));
    if (user) {
      if (fullName !== undefined) user.full_name = fullName;
      if (email !== undefined) user.email = email;
      if (role !== undefined) user.role = role;
      if (isActive !== undefined) user.is_active = isActive;
      if (password) user.password_hash = bcrypt.hashSync(password, 10);
      const { password_hash, ...safeUser } = user;
      return safeUser;
    }
    return null;
  }

  async deleteUser(id) {
    const isOk = await this.checkConnection();
    if (isOk) {
      const res = await this.pool.query('DELETE FROM users WHERE id = $1 RETURNING id', [id]);
      return res.rows[0] || null;
    }

    const idx = this.localUsers.findIndex(u => u.id === Number(id));
    if (idx !== -1) {
      const deleted = this.localUsers.splice(idx, 1);
      return deleted[0];
    }
    return null;
  }

  async updateUserLastLogin(id) {
    const isOk = await this.checkConnection();
    if (isOk) {
      try {
        await this.pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [id]);
      } catch (err) {}
    } else {
      const user = this.localUsers.find(u => u.id === Number(id));
      if (user) user.last_login = new Date();
    }
  }

  // ============================================================
  // QUẢN LÝ NGƯỜI DÙNG ZALO (ZALO USERS & INTERACTION AUDIT)
  // ============================================================

  async isZaloUserBlocked(zaloId) {
    if (!zaloId) return false;
    const isOk = await this.checkConnection();

    if (isOk) {
      try {
        const res = await this.pool.query('SELECT is_blocked FROM zalo_users WHERE zalo_id = $1', [String(zaloId)]);
        return res.rows[0]?.is_blocked === true;
      } catch (err) {}
    }

    return this.localZaloUsers.get(String(zaloId))?.is_blocked === true;
  }

  async recordInteraction({ zaloId, displayName, chatId, queryText, intent, retrievedDocs = [], responseText, latencyMs = 0 }) {
    if (!zaloId) return;
    const isOk = await this.checkConnection();

    if (isOk) {
      try {
        // Cập nhật hoặc thêm mới người dùng Zalo
        await this.pool.query(
          `INSERT INTO zalo_users (zalo_id, display_name, chat_id, query_count, last_active)
           VALUES ($1, $2, $3, 1, NOW())
           ON CONFLICT (zalo_id) DO UPDATE
           SET display_name = EXCLUDED.display_name,
               chat_id = EXCLUDED.chat_id,
               query_count = zalo_users.query_count + 1,
               last_active = NOW()`,
          [String(zaloId), displayName || 'Đồng chí', String(chatId)]
        );

        // Ghi log câu hỏi
        await this.pool.query(
          `INSERT INTO query_logs (zalo_user_id, user_name, query_text, intent, retrieved_doc_codes, response_text, latency_ms)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [String(zaloId), displayName, queryText, intent, retrievedDocs, responseText, latencyMs]
        );
        return;
      } catch (err) {
        console.warn('[Postgres] Lỗi ghi interaction:', err.message);
      }
    }

    // Fallback in-memory
    const existing = this.localZaloUsers.get(String(zaloId)) || {
      zalo_id: String(zaloId),
      display_name: displayName,
      chat_id: String(chatId),
      is_blocked: false,
      query_count: 0,
    };
    existing.query_count++;
    existing.last_active = new Date();
    this.localZaloUsers.set(String(zaloId), existing);

    this.localQueryLogs.unshift({
      id: Date.now(),
      zalo_user_id: String(zaloId),
      user_name: displayName,
      query_text: queryText,
      intent,
      retrieved_doc_codes: retrievedDocs,
      response_text: responseText,
      latency_ms: latencyMs,
      created_at: new Date(),
    });

    if (this.localQueryLogs.length > 500) this.localQueryLogs.pop();
  }

  async getZaloUsers({ search = '' } = {}) {
    const isOk = await this.checkConnection();
    if (isOk) {
      try {
        let sql = `SELECT * FROM zalo_users WHERE 1=1`;
        const params = [];
        if (search) {
          params.push(`%${search}%`);
          sql += ` AND (display_name ILIKE $1 OR zalo_id ILIKE $1)`;
        }
        sql += ` ORDER BY last_active DESC LIMIT 100`;
        const res = await this.pool.query(sql, params);
        return res.rows;
      } catch (err) {
        console.error('[Postgres] Lỗi getZaloUsers:', err.message);
      }
    }

    let list = Array.from(this.localZaloUsers.values());
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(u => u.display_name?.toLowerCase().includes(s) || u.zalo_id.includes(s));
    }
    return list;
  }

  async toggleBlockZaloUser(zaloId, isBlocked) {
    const isOk = await this.checkConnection();
    if (isOk) {
      const res = await this.pool.query(
        'UPDATE zalo_users SET is_blocked = $1 WHERE zalo_id = $2 RETURNING *',
        [isBlocked, String(zaloId)]
      );
      return res.rows[0];
    }

    const u = this.localZaloUsers.get(String(zaloId));
    if (u) {
      u.is_blocked = isBlocked;
      return u;
    }
    return null;
  }

  async getQueryLogs({ search = '', limit = 50 } = {}) {
    const isOk = await this.checkConnection();
    if (isOk) {
      try {
        let sql = `SELECT * FROM query_logs WHERE 1=1`;
        const params = [];
        if (search) {
          params.push(`%${search}%`);
          sql += ` AND (query_text ILIKE $1 OR user_name ILIKE $1)`;
        }
        params.push(limit);
        sql += ` ORDER BY created_at DESC LIMIT $${params.length}`;

        const res = await this.pool.query(sql, params);
        return res.rows;
      } catch (err) {
        console.error('[Postgres] Lỗi getQueryLogs:', err.message);
      }
    }

    let list = [...this.localQueryLogs];
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(l => l.query_text.toLowerCase().includes(s) || l.user_name?.toLowerCase().includes(s));
    }
    return list.slice(0, limit);
  }

  // ============================================================
  // QUẢN LÝ VĂN BẢN (DOCUMENTS & ARTICLES)
  // ============================================================

  async getDocuments({ category = null, search = '' } = {}) {
    const isOk = await this.checkConnection();
    if (!isOk) return null;

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
      await client.query('DELETE FROM articles WHERE document_id = $1', [docId]);

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

  async deleteDocument(id) {
    const isOk = await this.checkConnection();
    if (!isOk) throw new Error('Chưa kết nối được tới PostgreSQL');

    const res = await this.pool.query('DELETE FROM documents WHERE id = $1 RETURNING *', [id]);
    return res.rows[0] || null;
  }

  async searchArticles(queryStr, { topK = 4 } = {}) {
    const isOk = await this.checkConnection();
    if (!isOk) return null;

    try {
      // Tách các từ khóa >= 2 ký tự và nối bằng toán tử OR (|) cho to_tsquery
      const cleanWords = queryStr
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/)
        .filter(w => w.length >= 2);

      if (!cleanWords.length) return [];
      const tsQueryStr = cleanWords.join(' | ');

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
          ts_rank_cd(a.tsv, to_tsquery('simple', $1)) +
          CASE WHEN d.document_code ILIKE $2 THEN 5.0 ELSE 0.0 END as rank
        FROM articles a
        JOIN documents d ON a.document_id = d.id
        WHERE 
          a.tsv @@ to_tsquery('simple', $1)
          OR a.title ILIKE $2
          OR a.content ILIKE $2
          OR d.document_code ILIKE $2
        ORDER BY rank DESC, a.id ASC
        LIMIT $3
      `;

      const res = await this.pool.query(searchSql, [
        tsQueryStr,
        `%${queryStr.trim()}%`,
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

  async seedFromFiles(chunks) {
    const isOk = await this.checkConnection();
    if (!isOk) return false;

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
