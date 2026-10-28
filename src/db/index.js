/**
 * PostgreSQL Database Service cho Văn bản Đảng
 * Hỗ trợ CRUD văn bản, Quản lý Người dùng, Quản lý Zalo Users và Nhật ký Audit
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { extractDocNumbers, extractDocSignatures } = require('../rag/abbreviations');

class DatabaseService {
  constructor() {
    this.pool = null;
    this.isConnected = false;

    // Bộ nhớ đệm fallback khi chưa kết nối PostgreSQL
    this.localUsers = [];
    this.localSessions = new Map();
    this.sessionCache = new Map(); // Bộ đệm phiên đăng nhập (TTL 10s) giúp kiểm tra 0ms
    this.localZaloUsers = new Map();
    this.localQueryLogs = [];
    this.localResponseCache = new Map(); // Bộ đệm phản hồi nhanh giới hạn 500 mục

    this._initLocalAdmin();
    this.initPool();
  }

  _getAdminPasswordHash() {
    if (process.env.ADMIN_PASSWORD_HASH) {
      return process.env.ADMIN_PASSWORD_HASH.trim();
    }
    if (process.env.ADMIN_PASSWORD) {
      return bcrypt.hashSync(process.env.ADMIN_PASSWORD, 10);
    }
    const isCloudOrProd = Boolean(process.env.VERCEL || process.env.NODE_ENV === 'production');
    if (isCloudOrProd) {
      return null;
    }
    return bcrypt.hashSync('Admin@123456', 10);
  }

  _initLocalAdmin() {
    const passwordHash = this._getAdminPasswordHash();
    if (!passwordHash) {
      console.warn('[Security] Môi trường Production/Cloud phát hiện chưa cấu hình ADMIN_PASSWORD hoặc ADMIN_PASSWORD_HASH. Bỏ qua khởi tạo local superadmin mặc định.');
      this.localUsers = [];
      return;
    }
    this.localUsers = [
      {
        id: 1,
        username: process.env.ADMIN_USERNAME || 'admin',
        password_hash: passwordHash,
        full_name: 'Quản Trị Viên Hệ Thống',
        email: 'admin@party.gov.vn',
        role: 'superadmin',
        is_active: true,
        failed_login_count: 0,
        locked_until: null,
        created_at: new Date(),
        last_login: null,
      },
    ];
  }

  initPool() {
    const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/zalo_dang_bot';
    const isRemote = !connectionString.includes('localhost') && !connectionString.includes('127.0.0.1');
    
    try {
      const poolConfig = {
        connectionString,
        connectionTimeoutMillis: 5000,
        idleTimeoutMillis: 10000,
        max: 10,
      };

      if (isRemote || connectionString.includes('sslmode=require') || connectionString.includes('supabase')) {
        poolConfig.ssl = {
          rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true',
        };
      }

      this.pool = new Pool(poolConfig);

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
   * Bắt buộc có Postgres: trên Vercel bộ nhớ tạm trống, rơi về đó sẽ trả lời sai
   * ("chưa đăng ký", "không tìm thấy") thay vì báo hệ thống bận.
   */
  isRequired() {
    return process.env.VERCEL === '1' || process.env.DB_REQUIRED === 'true';
  }

  async _ping() {
    const client = await this.pool.connect();
    try {
      await client.query('SELECT 1');
      client.release();
    } catch (err) {
      client.release(err); // kết nối hỏng: hủy, không trả lại pool
      throw err;
    }
  }

  async checkConnection(force = false) {
    if (!this.pool) return false;
    const now = Date.now();
    const cacheTtl = this.isConnected ? 30000 : (this.isRequired() ? 5000 : 15000);
    if (!force && this._lastCheck && (now - this._lastCheck < cacheTtl)) {
      return this.isConnected;
    }

    this._lastCheck = now;
    try {
      await this._ping();
      this.isConnected = true;
    } catch (err) {
      // Thử lại một lần: mạng chập chờn hoặc pooler vừa đóng kết nối cũ
      try {
        await this._ping();
        this.isConnected = true;
      } catch (err2) {
        console.warn('[Postgres] Mất kết nối:', err2.message);
        this.isConnected = false;
      }
    }
    return this.isConnected;
  }

  /**
   * Chạy schema.sql. Bỏ qua khi file không đổi so với lần chạy trước (dấu lưu ở app_meta),
   * để mỗi lần Vercel khởi động lại không phải chạy toàn bộ lệnh tạo bảng.
   * @param {{ force?: boolean }} opts force: luôn chạy lại
   */
  async initSchema({ force = false } = {}) {
    const isOk = await this.checkConnection();
    if (!isOk) return false;

    try {
      const schemaPath = path.join(__dirname, 'schema.sql');
      if (fs.existsSync(schemaPath)) {
        const sql = fs.readFileSync(schemaPath, 'utf8');
        const hash = crypto.createHash('sha1').update(sql).digest('hex');
        const readHash = (q) => q(`SELECT value FROM app_meta WHERE key = 'schema_hash'`)
          .then((r) => r.rows[0]?.value || null)
          .catch(() => null); // chưa có bảng app_meta -> chạy schema
        const current = force ? null : await readHash((s) => this.pool.query(s));
        if (current !== hash) {
          // Nhiều instance Vercel khởi động cùng lúc: khóa để chạy lần lượt (tránh deadlock
          // do DROP/CREATE TRIGGER), instance đến sau đọc lại dấu rồi bỏ qua.
          const client = await this.pool.connect();
          let ran = false;
          try {
            await client.query('BEGIN');
            await client.query('SELECT pg_advisory_xact_lock(7240531)');
            await client.query('SAVEPOINT read_hash');
            const latest = force ? null : await readHash((s) => client.query(s));
            if (latest === null) await client.query('ROLLBACK TO SAVEPOINT read_hash'); // lỗi đọc làm hỏng transaction
            if (latest !== hash) {
              await client.query(sql);
              await client.query(
                `INSERT INTO app_meta (key, value, updated_at) VALUES ('schema_hash', $1, NOW())
                 ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
                [hash]
              );
              ran = true;
            }
            await client.query('COMMIT');
          } catch (err) {
            await client.query('ROLLBACK').catch(() => {});
            throw err;
          } finally {
            client.release();
          }
          if (ran) console.log('[Postgres] Da khoi tao schema bang (documents, articles, users, zalo_users, query_logs).');
        }
      } else {
        console.warn('[Postgres] Khong tim thay tap tin schema.sql tai runtime, bo qua initSchema.');
      }

      // Tu dong khoi tao tai khoan superadmin mac dinh neu bang users trong
      await this.seedAdminUser();
      return true;
    } catch (err) {
      console.error('[Postgres] Loi khoi tao schema:', err.message);
      return false;
    }
  }

  // ============================================================
  // QUAN LY TAI KHOAN ADMIN (USERS)
  // ============================================================

  async seedAdminUser() {
    const username = process.env.ADMIN_USERNAME || 'admin';
    const passwordHash = this._getAdminPasswordHash();

    if (!passwordHash) {
      console.warn('[Security] Bo qua seedAdminUser vi chua cau hinh ADMIN_PASSWORD hoac ADMIN_PASSWORD_HASH tren moi truong Production/Cloud.');
      return;
    }

    const hasExplicitEnvPass = Boolean(process.env.ADMIN_PASSWORD_HASH || process.env.ADMIN_PASSWORD);

    const isOk = await this.checkConnection();
    if (isOk) {
      try {
        const exist = await this.pool.query(
          'SELECT id, password_hash, last_login FROM users WHERE username = $1',
          [username]
        );
        if (!exist.rows.length) {
          await this.pool.query(
            `INSERT INTO users (username, password_hash, full_name, email, role, is_active)
             VALUES ($1, $2, $3, $4, 'superadmin', true)`,
            [username, passwordHash, 'Quan Tri Vien He Thong', 'admin@party.gov.vn']
          );
          console.log(`[Postgres] Da tao tai khoan quan tri: "${username}"`);
        } else if (hasExplicitEnvPass) {
          const user = exist.rows[0];
          // Neu tai khoan chua tung dang nhap (last_login IS NULL) va co cau hinh mat khau tu Env, dong bo mat khau moi
          if (user.last_login === null && user.password_hash !== passwordHash) {
            await this.pool.query(
              'UPDATE users SET password_hash = $1 WHERE id = $2',
              [passwordHash, user.id]
            );
            console.log(`[Postgres] Da dong bo mat khau moi tu bien moi truong cho tai khoan: "${username}" (chua dang nhap lan nao)`);
          }
        }
      } catch (err) {
        console.error('[Postgres] Loi tao/cap nhat tai khoan admin:', err.message);
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

  async getUserById(id) {
    const numId = Number(id);
    if (!Number.isFinite(numId)) return null;
    const isOk = await this.checkConnection();
    if (isOk) {
      try {
        const res = await this.pool.query('SELECT * FROM users WHERE id = $1', [numId]);
        return res.rows[0] || null;
      } catch (err) {
        console.error('[Postgres] Lỗi getUserById:', err.message);
      }
    }

    return this.localUsers.find(u => u.id === numId) || null;
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
      id: Date.now() + Math.floor(Math.random() * 1000),
      username,
      password_hash: passwordHash,
      full_name: fullName || username,
      email: email || '',
      role,
      is_active: true,
      failed_login_count: 0,
      locked_until: null,
      created_at: new Date(),
      last_login: null,
    };
    this.localUsers.push(newUser);
    const { password_hash, ...safeUser } = newUser;
    return safeUser;
  }

  async updateUser(id, { fullName, email, role, isActive, password }) {
    const isOk = await this.checkConnection();
    const shouldRevokeSessions = Boolean(password || role !== undefined || isActive === false);
    let updatedUser = null;

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
      updatedUser = res.rows[0] || null;
    } else {
      const user = this.localUsers.find(u => u.id === Number(id));
      if (user) {
        if (fullName !== undefined) user.full_name = fullName;
        if (email !== undefined) user.email = email;
        if (role !== undefined) user.role = role;
        if (isActive !== undefined) user.is_active = isActive;
        if (password) user.password_hash = bcrypt.hashSync(password, 10);
        const { password_hash, ...safeUser } = user;
        updatedUser = safeUser;
      }
    }

    if (shouldRevokeSessions) {
      await this.revokeAllUserSessions(id);
    } else {
      this._clearUserSessionCache(id);
    }

    return updatedUser;
  }

  async deleteUser(id) {
    await this.revokeAllUserSessions(id);
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
        await this.pool.query(
          'UPDATE users SET last_login = NOW(), failed_login_count = 0, locked_until = NULL WHERE id = $1',
          [id]
        );
      } catch (err) {
        await this.pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [id]).catch(() => {});
      }
    } else {
      const user = this.localUsers.find(u => u.id === Number(id));
      if (user) {
        user.last_login = new Date();
        user.failed_login_count = 0;
        user.locked_until = null;
      }
    }
  }

  async recordUserFailedLogin(username, maxAttempts = 5, lockoutMs = 15 * 60 * 1000) {
    if (!username) return;
    const isOk = await this.checkConnection();
    const lockUntil = new Date(Date.now() + lockoutMs);

    if (isOk) {
      try {
        await this.pool.query(
          `UPDATE users
           SET failed_login_count = COALESCE(failed_login_count, 0) + 1,
               locked_until = CASE
                 WHEN COALESCE(failed_login_count, 0) + 1 >= $2 THEN $3
                 ELSE locked_until
               END
           WHERE username = $1`,
          [username, maxAttempts, lockUntil]
        );
        return;
      } catch (err) {
        // Bỏ qua nếu cột chưa kịp migrate
      }
    }

    const user = this.localUsers.find(u => u.username === username);
    if (user) {
      user.failed_login_count = (user.failed_login_count || 0) + 1;
      if (user.failed_login_count >= maxAttempts) {
        user.locked_until = lockUntil;
      }
    }
  }

  // ============================================================
  // QUẢN LÝ PHIÊN ĐĂNG NHẬP WEB (USER SESSIONS & REVOCATION)
  // ============================================================

  _clearUserSessionCache(userId) {
    const targetId = Number(userId);
    for (const [sid, entry] of this.sessionCache.entries()) {
      if (Number(entry.data?.user_id) === targetId) {
        this.sessionCache.delete(sid);
      }
    }
  }

  _setSessionCache(sessionId, sessionData, ttlMs = 10000) {
    if (this.sessionCache.size >= 1000) {
      const oldestKey = this.sessionCache.keys().next().value;
      this.sessionCache.delete(oldestKey);
    }
    this.sessionCache.set(sessionId, {
      data: sessionData,
      cacheExpiresAt: Date.now() + ttlMs,
    });
  }

  async createUserSession({ sessionId, userId, uaHash, ipHash, ttlMs = 12 * 3600 * 1000 }) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMs);

    if (this.localSessions.size >= 2000) {
      const oldestKey = this.localSessions.keys().next().value;
      this.localSessions.delete(oldestKey);
    }
    this.localSessions.set(sessionId, {
      session_id: sessionId,
      user_id: Number(userId),
      ua_hash: uaHash,
      ip_hash: ipHash,
      created_at: now,
      last_active_at: now,
      expires_at: expiresAt,
      revoked_at: null,
    });

    const isOk = await this.checkConnection();
    if (isOk) {
      try {
        await this.pool.query(
          `INSERT INTO user_sessions (session_id, user_id, ua_hash, ip_hash, created_at, last_active_at, expires_at)
           VALUES ($1, $2, $3, $4, NOW(), NOW(), $5)`,
          [sessionId, Number(userId), uaHash, ipHash, expiresAt]
        );
        // Dọn nhẹ các phiên hết hạn hoặc đã thu hồi quá 1 ngày (bất đồng bộ, không chặn request)
        this.pool.query(
          `DELETE FROM user_sessions WHERE expires_at < NOW() OR (revoked_at IS NOT NULL AND revoked_at < NOW() - INTERVAL '1 day')`
        ).catch(() => {});
      } catch (err) {
        console.warn('[Postgres] Lỗi createUserSession (dùng bộ nhớ dự phòng):', err.message);
      }
    }
  }

  async getValidUserSession(sessionId) {
    if (!sessionId || typeof sessionId !== 'string') return null;

    // 1. Kiểm tra bộ đệm phiên trong RAM (TTL 10s -> ~0ms)
    const cached = this.sessionCache.get(sessionId);
    if (cached) {
      if (cached.cacheExpiresAt > Date.now() && new Date(cached.data.expires_at).getTime() > Date.now()) {
        return cached.data;
      }
      this.sessionCache.delete(sessionId);
    }

    // 2. Truy vấn bảng user_sessions kết hợp bảng users trên PostgreSQL
    const isOk = await this.checkConnection();
    if (isOk) {
      try {
        const res = await this.pool.query(
          `SELECT s.session_id, s.user_id, s.ua_hash, s.ip_hash, s.last_active_at, s.expires_at,
                  u.username, u.full_name, u.email, u.role, u.is_active
           FROM user_sessions s
           JOIN users u ON u.id = s.user_id
           WHERE s.session_id = $1
             AND s.revoked_at IS NULL
             AND s.expires_at > NOW()
             AND u.is_active = TRUE`,
          [sessionId]
        );
        if (!res.rows.length) return null;
        const row = res.rows[0];
        this._setSessionCache(sessionId, row, 10000);

        // Chỉ cập nhật last_active_at tối đa 5 phút/lần dưới nền để không tốn I/O
        if (Date.now() - new Date(row.last_active_at).getTime() > 5 * 60 * 1000) {
          this.pool.query(
            'UPDATE user_sessions SET last_active_at = NOW() WHERE session_id = $1',
            [sessionId]
          ).catch(() => {});
        }
        return row;
      } catch (err) {
        console.warn('[Postgres] Lỗi getValidUserSession (chuyển sang fallback):', err.message);
      }
    }

    // 3. Fallback in-memory khi chạy offline / kiểm thử
    const local = this.localSessions.get(sessionId);
    if (!local || local.revoked_at || new Date(local.expires_at).getTime() <= Date.now()) {
      return null;
    }

    const user = this.localUsers.find(u => u.id === Number(local.user_id));
    if (!user || !user.is_active) {
      return null;
    }

    const sessionData = {
      session_id: local.session_id,
      user_id: user.id,
      ua_hash: local.ua_hash,
      ip_hash: local.ip_hash,
      last_active_at: local.last_active_at,
      expires_at: local.expires_at,
      username: user.username,
      full_name: user.full_name,
      email: user.email,
      role: user.role,
      is_active: user.is_active,
    };
    this._setSessionCache(sessionId, sessionData, 10000);
    return sessionData;
  }

  async revokeUserSession(sessionId) {
    if (!sessionId) return;
    this.sessionCache.delete(sessionId);
    const local = this.localSessions.get(sessionId);
    if (local) {
      local.revoked_at = new Date();
      this.localSessions.delete(sessionId);
    }

    const isOk = await this.checkConnection();
    if (isOk) {
      try {
        await this.pool.query(
          'UPDATE user_sessions SET revoked_at = NOW() WHERE session_id = $1 AND revoked_at IS NULL',
          [sessionId]
        );
      } catch (err) {}
    }
  }

  async updateSessionIp(sessionId, newIpHash) {
    if (!sessionId || !newIpHash) return;
    const cached = this.sessionCache.get(sessionId);
    if (cached && cached.data) {
      cached.data.ip_hash = newIpHash;
    }
    const local = this.localSessions.get(sessionId);
    if (local) {
      local.ip_hash = newIpHash;
      local.last_active_at = new Date();
    }

    const isOk = await this.checkConnection();
    if (isOk) {
      this.pool.query(
        'UPDATE user_sessions SET ip_hash = $2, last_active_at = NOW() WHERE session_id = $1 AND revoked_at IS NULL',
        [sessionId, newIpHash]
      ).catch(() => {});
    }
  }

  async revokeAllUserSessions(userId) {
    const targetId = Number(userId);
    this._clearUserSessionCache(targetId);

    for (const [sid, s] of this.localSessions.entries()) {
      if (Number(s.user_id) === targetId) {
        this.localSessions.delete(sid);
      }
    }

    const isOk = await this.checkConnection();
    if (isOk) {
      try {
        await this.pool.query(
          'UPDATE user_sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
          [targetId]
        );
      } catch (err) {}
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
  // QUẢN LÝ BỘ ĐỆM CÂU TRẢ LỜI (RESPONSE CACHE - TTL 48H)
  // ============================================================

  _setLocalResponseCache(cacheKey, item) {
    if (this.localResponseCache.has(cacheKey)) {
      this.localResponseCache.delete(cacheKey);
    } else if (this.localResponseCache.size >= 500) {
      const oldestKey = this.localResponseCache.keys().next().value;
      this.localResponseCache.delete(oldestKey);
    }
    this.localResponseCache.set(cacheKey, item);
  }

  async getCachedResponse(cacheKey) {
    if (!cacheKey) return null;

    // 1. Kiểm tra trong In-Memory LRU Cache trước (0ms)
    const localHit = this.localResponseCache.get(cacheKey);
    if (localHit) {
      if (localHit.expiresAt > Date.now()) {
        localHit.hit_count = (localHit.hit_count || 1) + 1;
        this.localResponseCache.delete(cacheKey);
        this.localResponseCache.set(cacheKey, localHit);
        return localHit;
      }
      this.localResponseCache.delete(cacheKey);
    }

    // 2. Nếu chưa có trong RAM, kiểm tra bảng response_cache trong PostgreSQL
    const isOk = await this.checkConnection();
    if (isOk) {
      try {
        const res = await this.pool.query(
          'SELECT * FROM response_cache WHERE cache_key = $1 AND expires_at > NOW()',
          [cacheKey]
        );
        if (res.rows.length > 0) {
          const row = res.rows[0];
          this.pool.query(
            'UPDATE response_cache SET hit_count = hit_count + 1 WHERE cache_key = $1',
            [cacheKey]
          ).catch(() => {});

          const cachedItem = {
            cache_key: row.cache_key,
            original_query: row.original_query,
            intent: row.intent,
            retrieved_doc_codes: row.retrieved_doc_codes || [],
            response_text: row.response_text,
            hit_count: (row.hit_count || 1) + 1,
            created_at: row.created_at,
            expires_at: row.expires_at,
            expiresAt: new Date(row.expires_at).getTime(),
          };

          this._setLocalResponseCache(cacheKey, cachedItem);
          return cachedItem;
        }
      } catch (err) {
        console.warn('[Postgres] Lỗi getCachedResponse:', err.message);
      }
    }

    return null;
  }

  async setCachedResponse({ cacheKey, originalQuery, intent, retrievedDocs = [], responseText, ttlHours = 48 }) {
    if (!cacheKey || !responseText) return;

    // Chỉ lưu cache khi câu trả lời hợp lệ
    const isInvalid = (
      responseText.includes('Lưu ý: Hệ thống đang hoạt động ở chế độ dự phòng') ||
      responseText.includes('Hiện tại các API Key cấu hình cho Gemini đều tạm thời bị giới hạn') ||
      responseText.includes('Lỗi hệ thống khi tạo câu trả lời')
    );
    if (isInvalid) return;

    const expiresDate = new Date(Date.now() + ttlHours * 3600 * 1000);
    const item = {
      cache_key: cacheKey,
      original_query: originalQuery,
      intent,
      retrieved_doc_codes: retrievedDocs,
      response_text: responseText,
      hit_count: 1,
      created_at: new Date(),
      expires_at: expiresDate,
      expiresAt: expiresDate.getTime(),
    };

    // 1. Lưu vào In-Memory LRU Cache
    this._setLocalResponseCache(cacheKey, item);

    // 2. Lưu vào PostgreSQL response_cache
    const isOk = await this.checkConnection();
    if (isOk) {
      try {
        await this.pool.query(
          `INSERT INTO response_cache (cache_key, original_query, intent, retrieved_doc_codes, response_text, hit_count, created_at, expires_at)
           VALUES ($1, $2, $3, $4, $5, 1, NOW(), $6)
           ON CONFLICT (cache_key) DO UPDATE
           SET original_query = EXCLUDED.original_query,
               intent = EXCLUDED.intent,
               retrieved_doc_codes = EXCLUDED.retrieved_doc_codes,
               response_text = EXCLUDED.response_text,
               expires_at = EXCLUDED.expires_at`,
          [cacheKey, originalQuery, intent, retrievedDocs, responseText, expiresDate]
        );
      } catch (err) {
        console.warn('[Postgres] Lỗi setCachedResponse:', err.message);
      }
    }
  }

  async clearResponseCache() {
    this.localResponseCache.clear();
    const isOk = await this.checkConnection();
    if (isOk) {
      try {
        await this.pool.query('DELETE FROM response_cache');
        console.log('[Postgres] Đã xóa sạch bộ đệm response_cache.');
      } catch (err) {
        console.warn('[Postgres] Lỗi clearResponseCache:', err.message);
      }
    }
  }

  async deleteCachedResponse(cacheKey) {
    if (!cacheKey) return;
    this.localResponseCache.delete(cacheKey);
    const isOk = await this.checkConnection();
    if (isOk) {
      try {
        await this.pool.query('DELETE FROM response_cache WHERE cache_key = $1', [cacheKey]);
      } catch (err) {
        console.warn('[Postgres] Lỗi deleteCachedResponse:', err.message);
      }
    }
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
        const descPart = description ? ` ${description}` : '';
        const fullText = `${documentCode} ${documentName}${descPart} - Điều ${art.articleNumber || ''}: ${art.title || ''}. ${art.content || ''}`;
        await client.query(
          `INSERT INTO articles (document_id, article_number, title, content, full_text)
           VALUES ($1, $2, $3, $4, $5)`,
          [docId, String(art.articleNumber || ''), art.title || '', art.content || '', fullText]
        );
      }

      await client.query('COMMIT');
      await this.clearResponseCache();
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
          const descPart = description ? ` ${description}` : '';
          const fullText = `${documentCode} ${documentName}${descPart} - Điều ${art.articleNumber || ''}: ${art.title || ''}. ${art.content || ''}`;
          await client.query(
            `INSERT INTO articles (document_id, article_number, title, content, full_text)
             VALUES ($1, $2, $3, $4, $5)`,
            [id, String(art.articleNumber || ''), art.title || '', art.content || '', fullText]
          );
        }
      }

      await client.query('COMMIT');
      await this.clearResponseCache();
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
    await this.clearResponseCache();
    return res.rows[0] || null;
  }

  async searchArticles(queryStr, { topK = 8 } = {}) {
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

      // Tìm số hiệu văn bản và chữ ký loại văn bản trong câu hỏi bằng hàm chuẩn dùng chung
      const docNumbers = extractDocNumbers(queryStr);
      const docSignatures = extractDocSignatures(queryStr);

      let numberClause = '0.0';
      const params = [tsQueryStr, `%${queryStr.trim()}%`];

      if (docNumbers.length > 0) {
        const conds = [];
        for (const num of docNumbers) {
          params.push(num);
          const pIdx = params.length;
          // Khớp số hiệu trong mã văn bản, hoặc trong tiêu đề/nội dung điều khoản (đặc biệt cho Công văn 561-CV/CLT, 457-CV/CLT)
          conds.push(`d.document_code ~ ('(^|[^0-9])0*' || $${pIdx} || '([^0-9]|$)')`);
          conds.push(`a.title ~ ('(^|[^0-9])0*' || $${pIdx} || '([^0-9]|$)')`);
          conds.push(`a.content ~ ('(^|[^0-9])0*' || $${pIdx} || '([^0-9]|$)')`);
        }
        if (conds.length > 0) {
          numberClause = `CASE WHEN (${conds.join(' OR ')}) THEN 30.0 ELSE 0.0 END`;
        }
      }

      // 1.1 Phân biệt tiền tố loại văn bản (HD vs QĐ vs CT vs CV) để tránh va chạm số 24 và 50
      let sigBonusClause = '';
      if (docSignatures.length > 0) {
        const sigConds = [];
        for (const sig of docSignatures) {
          if (sig.type) {
            params.push(`%${sig.number}-${sig.type}%`);
            const pIdx = params.length;
            params.push(sig.number);
            const numIdx = params.length;
            sigConds.push(`
              CASE 
                WHEN d.document_code ILIKE $${pIdx} OR a.title ILIKE $${pIdx} OR (d.document_code = 'KHUNG-PHAN-LOAI-VPTW' AND a.content ILIKE $${pIdx}) THEN 25.0
                WHEN d.document_code ~ ('(^|[^0-9])0*' || $${numIdx} || '([^0-9]|$)') THEN -15.0
                ELSE 0.0
              END
            `);
          }
        }
        if (sigConds.length > 0) {
          sigBonusClause = `${sigConds.join(' + ')} + `;
        }
      }

      // Tăng trọng số đặc thù cho từ khóa "xóa tên"
      const isXoaTen = /x[oó]a\s*t[eê]n/i.test(queryStr) || /xoa\s*ten/i.test(queryStr);
      const xoaTenClause = isXoaTen
        ? `CASE WHEN a.title ILIKE '%xóa tên%' OR a.title ILIKE '%xoa ten%' THEN 15.0 WHEN a.content ILIKE '%xóa tên%' OR a.content ILIKE '%xoa ten%' THEN 8.0 ELSE 0.0 END + `
        : '';

      // Tăng trọng số cho các câu hỏi về giai đoạn chỉnh lý hoặc xử lý tài liệu loại ra
      const isGiaiDoan = /giai\s*[đd]o[aạ]n/i.test(queryStr);
      const giaiDoanClause = isGiaiDoan
        ? `CASE WHEN a.title ILIKE '%giai đoạn%' THEN 15.0 ELSE 0.0 END + `
        : '';

      const isLoaiRa = /lo[aạ]i\s*ra/i.test(queryStr);
      const loaiRaClause = isLoaiRa
        ? `CASE WHEN a.title ILIKE '%loại ra%' THEN 15.0 WHEN a.content ILIKE '%loại ra%' THEN 8.0 ELSE 0.0 END + `
        : '';

      // Tăng trọng số ưu tiên đặc biệt cho KHUNG-PHAN-LOAI-VPTW khi câu hỏi hỏi về khung/phương án phân loại
      const isKhungPlQuery = /(khung\s*ph[aâ]n\s*lo[aạ]i|ph[uư][oơ]ng\s*[aá]n\s*ph[aâ]n\s*lo[aạ]i)/i.test(queryStr);
      const khungPlClause = isKhungPlQuery
        ? `CASE WHEN d.document_code = 'KHUNG-PHAN-LOAI-VPTW' THEN 18.0 ELSE 0.0 END + `
        : '';

      // Lấy dư số lượng để sau đó áp dụng Diversity Cap chống 1 văn bản độc chiếm topK
      const fetchLimit = Math.max(topK * 3, 24);
      params.push(fetchLimit);
      const limitParamIdx = params.length;

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
          d.status,
          d.description,
          ts_rank_cd(a.tsv, to_tsquery('simple', $1)) +
          ${numberClause} +
          ${sigBonusClause}
          ${xoaTenClause}
          ${giaiDoanClause}
          ${loaiRaClause}
          ${khungPlClause}
          CASE WHEN a.article_number = '0' THEN 8.0 ELSE 0.0 END +
          CASE WHEN d.document_name ILIKE $2 THEN 10.0 ELSE 0.0 END +
          CASE 
            WHEN d.status ILIKE '%Hết hiệu lực%' THEN -10.0 
            WHEN d.status ILIKE '%Còn hiệu lực%' THEN 10.0 
            ELSE 0.0 
          END as rank
        FROM articles a
        JOIN documents d ON a.document_id = d.id
        WHERE 
          a.tsv @@ to_tsquery('simple', $1)
          OR a.title ILIKE $2
          OR a.content ILIKE $2
          OR a.full_text ILIKE $2
          OR (${numberClause} > 0)
          ${isXoaTen ? "OR a.title ILIKE '%xóa tên%' OR a.content ILIKE '%xóa tên%'" : ''}
        ORDER BY rank DESC, a.id ASC
        LIMIT $${limitParamIdx}
      `;

      const res = await this.pool.query(searchSql, params);

      // Diversity Cap thông minh: Cho phép lấy tối đa 6 điều khoản cho KHUNG-PHAN-LOAI-VPTW hoặc văn bản đơn lẻ
      const validDocNums = docNumbers.filter(n => !(parseInt(n, 10) > 1900 && parseInt(n, 10) < 2100));
      const isKhungPhanLoai = /(khung\s*ph[aâ]n\s*lo[aạ]i|ph[uư][oơ]ng\s*[aá]n\s*ph[aâ]n\s*lo[aạ]i)/i.test(queryStr);
      const isSingleDocQuery = validDocNums.length === 1;

      const docCount = {};
      const finalRows = [];
      for (const row of res.rows) {
        const code = row.documentCode;
        docCount[code] = (docCount[code] || 0) + 1;
        let maxCap = 3;
        if (code === 'KHUNG-PHAN-LOAI-VPTW' && isKhungPhanLoai) {
          maxCap = 6;
        } else if (isSingleDocQuery) {
          maxCap = 6;
        }
        if (docCount[code] <= maxCap) {
          finalRows.push(row);
        }
        if (finalRows.length >= topK) break;
      }

      return finalRows.map(row => {
        const descPart = row.description ? ` ${row.description}` : '';
        return {
          ...row,
          fullText: `${row.documentCode} ${row.documentName}${descPart} - Điều ${row.articleNumber}: ${row.title}. ${row.content}`,
        };
      });
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
          description: c.description || '',
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

    await this.clearResponseCache();
    console.log(`✅ [Postgres] Đã đồng bộ ${Object.keys(docsMap).length} văn bản vào PostgreSQL.`);
    return true;
  }
}

module.exports = new DatabaseService();
