/**
 * Lớp lưu trữ cho luồng Tra cứu Sổ công văn.
 * Dùng chung pool Postgres của DatabaseService; có dự phòng bộ nhớ khi mất kết nối
 * (theo đúng mô hình các phần khác của dự án).
 */

const crypto = require('crypto');
const db = require('../db');
const { columnFiltersSql, matchesColumnFilters } = require('./column-filters');

/** Số dòng tối đa một lần xuất Excel (giữ phản hồi dưới giới hạn 4.5MB của Vercel) */
const EXPORT_MAX_ROWS = 5000;

const UPSERT_COLUMNS = [
  'direction', 'source_id', 'so_ky_hieu', 'so_dang_ky', 'trich_yeu', 'so_van_ban', 'the_loai', 'do_khan',
  'do_mat', 'nguoi_gui', 'nguoi_trinh', 'nguoi_ky', 'y_kien_chuyen', 'y_kien_chi_dao', 'noi_nhan',
  'trang_thai_phat_hanh', 'ngay_van_ban', 'thoi_gian_nhan', 'han_xu_ly', 'so_trang', 'so_ban',
  'file_names', 'search_norm', 'row_hash', 'import_id',
];
const UPSERT_CHUNK = 200;

const SELECT_COLUMNS = `
  id, direction, source_id, so_ky_hieu, so_dang_ky, trich_yeu, so_van_ban, the_loai, do_khan, do_mat,
  nguoi_gui, nguoi_trinh, nguoi_ky, noi_nhan, trang_thai_phat_hanh, y_kien_chuyen, y_kien_chi_dao,
  to_char(ngay_van_ban, 'YYYY-MM-DD') AS ngay_van_ban,
  to_char(thoi_gian_nhan, 'YYYY-MM-DD') AS thoi_gian_nhan,
  to_char(han_xu_ly, 'YYYY-MM-DD') AS han_xu_ly,
  so_trang, so_ban, COALESCE(cardinality(file_names), 0) AS file_count, search_norm,
  to_char(updated_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD HH24:MI') AS updated_at
`;

// ------------------------------------------------------------
// Dự phòng bộ nhớ
// ------------------------------------------------------------
const local = {
  docs: [],            // bản ghi office_documents
  imports: [],
  codes: [],           // { id, code_hash, staff_label, ... }
  sessions: new Map(), // zaloId -> { state, updated_at, failed_activation_count, failed_activation_window_start }
  permissions: new Map(), // zaloId -> { can_lookup_office, staff_label, granted_by, granted_at }
  nextId: 1,
};

function sha256(text) {
  return crypto.createHash('sha256').update(String(text)).digest('hex');
}

async function isPg() {
  return db.checkConnection();
}

function localToRow(doc) {
  return { ...doc, file_count: (doc.file_names || []).length };
}

// ============================================================
// SỔ CÔNG VĂN
// ============================================================

/**
 * Ghi kết quả phân tích file Excel vào DB.
 * @returns {{ inserted, updated, unchanged, importId }}
 */
async function saveImport({ parsed, fileName, user, dryRun = false }) {
  const { direction, records } = parsed;
  const sourceIds = records.map((r) => r.source_id);

  // 1. Lấy hash hiện có để phân loại mới / cập nhật / không đổi
  const existing = new Map();
  if (await isPg()) {
    const res = await db.pool.query(
      'SELECT source_id, row_hash FROM office_documents WHERE direction = $1 AND source_id = ANY($2::text[])',
      [direction, sourceIds]
    );
    for (const r of res.rows) existing.set(r.source_id, r.row_hash);
  } else {
    for (const d of local.docs) if (d.direction === direction) existing.set(d.source_id, d.row_hash);
  }

  const toWrite = [];
  let inserted = 0;
  let updated = 0;
  let unchanged = 0;
  for (const rec of records) {
    if (!existing.has(rec.source_id)) { inserted++; toWrite.push(rec); }
    else if (existing.get(rec.source_id) !== rec.row_hash) { updated++; toWrite.push(rec); }
    else unchanged++;
  }

  const summary = { direction, inserted, updated, unchanged, importId: null };
  if (dryRun) return summary;

  const importRow = {
    direction,
    file_name: String(fileName || '').slice(0, 255),
    report_date: parsed.reportDate,
    total_rows: parsed.totalRows,
    inserted, updated, unchanged,
    skipped_secret: parsed.skipped.secret,
    skipped_unpublished: parsed.skipped.unpublished,
    errors: parsed.errors.slice(0, 200),
    imported_by: user?.id || null,
    imported_by_name: user?.fullName || user?.username || null,
  };

  if (await isPg()) {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const ins = await client.query(
        `INSERT INTO office_doc_imports
         (direction, file_name, report_date, total_rows, inserted, updated, unchanged, skipped_secret,
          skipped_unpublished, errors, imported_by, imported_by_name)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
        [importRow.direction, importRow.file_name, importRow.report_date, importRow.total_rows,
          inserted, updated, unchanged, importRow.skipped_secret, importRow.skipped_unpublished,
          JSON.stringify(importRow.errors), importRow.imported_by, importRow.imported_by_name]
      );
      const importId = ins.rows[0].id;

      for (let i = 0; i < toWrite.length; i += UPSERT_CHUNK) {
        const chunk = toWrite.slice(i, i + UPSERT_CHUNK);
        const params = [];
        const tuples = chunk.map((rec) => {
          const placeholders = UPSERT_COLUMNS.map((col) => {
            params.push(col === 'import_id' ? importId : (rec[col] === undefined ? null : rec[col]));
            return `$${params.length}`;
          });
          return `(${placeholders.join(',')})`;
        });
        const updates = UPSERT_COLUMNS
          .filter((c) => c !== 'direction' && c !== 'source_id')
          .map((c) => `${c} = EXCLUDED.${c}`)
          .join(', ');
        await client.query(
          `INSERT INTO office_documents (${UPSERT_COLUMNS.join(',')}) VALUES ${tuples.join(',')}
           ON CONFLICT (direction, source_id) DO UPDATE SET ${updates}, updated_at = NOW()`,
          params
        );
      }
      await client.query('COMMIT');
      summary.importId = importId;
      return summary;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  // Dự phòng bộ nhớ
  const importId = local.nextId++;
  local.imports.unshift({ id: importId, ...importRow, created_at: new Date().toISOString() });
  for (const rec of toWrite) {
    const idx = local.docs.findIndex((d) => d.direction === direction && d.source_id === rec.source_id);
    const row = { ...rec, import_id: importId, updated_at: new Date().toISOString().slice(0, 16).replace('T', ' ') };
    if (idx >= 0) local.docs[idx] = { ...local.docs[idx], ...row };
    else local.docs.push({ id: local.nextId++, ...row });
  }
  summary.importId = importId;
  return summary;
}

/**
 * Lấy tập ứng viên theo bộ lọc thô (hướng, khoảng ngày, ID, tiền tố từ khóa).
 * Bộ lọc chính xác và chấm điểm được thực hiện ở search.js.
 */
async function fetchCandidates({ direction = null, dateFrom = null, dateTo = null, sourceId = null, keywordPrefixes = [], columnFilters = null, limit = 3000 } = {}) {
  if (await isPg()) {
    const where = [];
    const params = [];
    if (direction) { params.push(direction); where.push(`direction = $${params.length}`); }
    if (dateFrom) { params.push(dateFrom); where.push(`ngay_van_ban >= $${params.length}`); }
    if (dateTo) { params.push(dateTo); where.push(`ngay_van_ban <= $${params.length}`); }
    if (sourceId) { params.push(String(sourceId)); where.push(`source_id = $${params.length}`); }
    if (keywordPrefixes.length) {
      params.push(keywordPrefixes.map((p) => `%${p.replace(/[%_\\]/g, '')}%`));
      where.push(`search_norm LIKE ANY($${params.length}::text[])`);
    }
    where.push(...columnFiltersSql(columnFilters, params));
    params.push(Math.min(Math.max(limit, 1), 10000));
    const sql = `SELECT ${SELECT_COLUMNS} FROM office_documents
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY ngay_van_ban DESC NULLS LAST, id DESC LIMIT $${params.length}`;
    const res = await db.pool.query(sql, params);
    return res.rows;
  }

  return local.docs
    .filter((d) => (!direction || d.direction === direction)
      && (!dateFrom || (d.ngay_van_ban && d.ngay_van_ban >= dateFrom))
      && (!dateTo || (d.ngay_van_ban && d.ngay_van_ban <= dateTo))
      && (!sourceId || d.source_id === String(sourceId))
      && (!keywordPrefixes.length || keywordPrefixes.some((p) => d.search_norm.includes(p)))
      && matchesColumnFilters(d, columnFilters))
    .sort((a, b) => String(b.ngay_van_ban || '').localeCompare(String(a.ngay_van_ban || '')) || b.id - a.id)
    .slice(0, limit)
    .map(localToRow);
}

async function getDocumentsByIds(ids = []) {
  const clean = ids.map((n) => parseInt(n, 10)).filter(Number.isFinite);
  if (!clean.length) return [];
  if (await isPg()) {
    const res = await db.pool.query(`SELECT ${SELECT_COLUMNS}, file_names FROM office_documents WHERE id = ANY($1::int[])`, [clean]);
    const byId = new Map(res.rows.map((r) => [r.id, r]));
    return clean.map((id) => byId.get(id)).filter(Boolean);
  }
  return clean.map((id) => local.docs.find((d) => d.id === id)).filter(Boolean).map(localToRow);
}

const EFFECTIVE_DATE_SQL = `(CASE WHEN direction = 'den' THEN COALESCE(thoi_gian_nhan, ngay_van_ban) ELSE ngay_van_ban END)`;
const SORT_SQL = {
  ngay: EFFECTIVE_DATE_SQL,
  so_ky_hieu: `NULLIF(substring(so_ky_hieu from '^[0-9]+'), '')::int`,
  the_loai: 'the_loai',
  trich_yeu: 'trich_yeu',
  nguoi_ky: 'nguoi_ky',
  source_id: 'source_id',
};

/**
 * Danh sách dạng bảng (không có ô tìm tự do): lọc + sắp xếp + phân trang ở SQL.
 * @returns {{ total: number, items: object[] }}
 */
async function listDocuments({ direction = null, theLoai = null, dateFrom = null, dateTo = null, columnFilters = null, sort = 'ngay', order = 'desc', limit = 20, offset = 0, maxLimit = 100 } = {}) {
  const sortKey = SORT_SQL[sort] ? sort : 'ngay';
  const dir = order === 'asc' ? 'ASC' : 'DESC';
  const size = Math.min(Math.max(parseInt(limit, 10) || 20, 1), Math.min(maxLimit, EXPORT_MAX_ROWS));
  const skip = Math.max(parseInt(offset, 10) || 0, 0);

  if (await isPg()) {
    const where = [];
    const params = [];
    if (direction) { params.push(direction); where.push(`direction = $${params.length}`); }
    if (theLoai) { params.push(theLoai); where.push(`the_loai = $${params.length}`); }
    if (dateFrom) { params.push(dateFrom); where.push(`${EFFECTIVE_DATE_SQL} >= $${params.length}`); }
    if (dateTo) { params.push(dateTo); where.push(`${EFFECTIVE_DATE_SQL} <= $${params.length}`); }
    where.push(...columnFiltersSql(columnFilters, params));
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const countRes = await db.pool.query(`SELECT COUNT(*)::int AS total FROM office_documents ${whereSql}`, params);
    params.push(size, skip);
    const res = await db.pool.query(
      `SELECT ${SELECT_COLUMNS} FROM office_documents ${whereSql}
       ORDER BY ${SORT_SQL[sortKey]} ${dir} NULLS LAST, id DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return { total: countRes.rows[0].total, items: res.rows };
  }

  const eff = (d) => (d.direction === 'den' ? (d.thoi_gian_nhan || d.ngay_van_ban) : d.ngay_van_ban) || '';
  const keyFns = {
    ngay: eff,
    so_ky_hieu: (d) => parseInt(d.so_ky_hieu, 10) || 0,
    the_loai: (d) => d.the_loai || '',
    trich_yeu: (d) => d.trich_yeu || '',
    nguoi_ky: (d) => d.nguoi_ky || '',
    source_id: (d) => d.source_id || '',
  };
  const key = keyFns[sortKey];
  const sign = dir === 'ASC' ? 1 : -1;
  const list = local.docs
    .filter((d) => (!direction || d.direction === direction)
      && (!theLoai || d.the_loai === theLoai)
      && (!dateFrom || (eff(d) && eff(d) >= dateFrom))
      && (!dateTo || (eff(d) && eff(d) <= dateTo))
      && matchesColumnFilters(d, columnFilters))
    .sort((a, b) => { const ka = key(a); const kb = key(b); return (ka < kb ? -1 : ka > kb ? 1 : 0) * sign || b.id - a.id; });
  return { total: list.length, items: list.slice(skip, skip + size).map(localToRow) };
}

/** Danh sách thể loại đang có trong sổ (cho bộ lọc) */
async function getTypeOptions() {
  if (await isPg()) {
    const res = await db.pool.query(
      `SELECT the_loai AS name, COUNT(*)::int AS count FROM office_documents
       WHERE the_loai IS NOT NULL GROUP BY the_loai ORDER BY count DESC, the_loai`
    );
    return res.rows;
  }
  const m = new Map();
  for (const d of local.docs) if (d.the_loai) m.set(d.the_loai, (m.get(d.the_loai) || 0) + 1);
  return [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
}

/** Giá trị cho các ô chọn của bộ lọc cột: Sổ văn bản, Độ khẩn, Trạng thái phát hành */
const OPTION_COLUMNS = { books: 'so_van_ban', urgencies: 'do_khan', statuses: 'trang_thai_phat_hanh' };

async function getFilterOptions() {
  const out = { books: [], urgencies: [], statuses: [] };
  if (await isPg()) {
    const parts = Object.entries(OPTION_COLUMNS).map(([kind, col]) =>
      `SELECT '${kind}' AS kind, ${col} AS name, COUNT(*)::int AS count FROM office_documents
       WHERE ${col} IS NOT NULL AND ${col} <> '' GROUP BY ${col}`);
    const res = await db.pool.query(`${parts.join(' UNION ALL ')} ORDER BY kind, count DESC, name`);
    for (const r of res.rows) out[r.kind].push({ name: r.name, count: r.count });
    return out;
  }
  for (const [kind, col] of Object.entries(OPTION_COLUMNS)) {
    const m = new Map();
    for (const d of local.docs) if (d[col]) m.set(d[col], (m.get(d[col]) || 0) + 1);
    out[kind] = [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  }
  return out;
}

async function getImports({ limit = 30 } = {}) {
  if (await isPg()) {
    const res = await db.pool.query(
      `SELECT id, direction, file_name, to_char(report_date, 'YYYY-MM-DD') AS report_date, total_rows, inserted,
              updated, unchanged, skipped_secret, skipped_unpublished, errors, imported_by_name,
              to_char(created_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD HH24:MI') AS created_at
       FROM office_doc_imports ORDER BY created_at DESC LIMIT $1`,
      [Math.min(Math.max(limit, 1), 200)]
    );
    return res.rows;
  }
  return local.imports.slice(0, limit);
}

/** Tổng số văn bản và ngày chốt dữ liệu mới nhất theo từng sổ */
async function getOverview() {
  const empty = { den: { total: 0, reportDate: null, lastImportAt: null }, di: { total: 0, reportDate: null, lastImportAt: null } };
  if (await isPg()) {
    const counts = await db.pool.query('SELECT direction, COUNT(*)::int AS total FROM office_documents GROUP BY direction');
    const latest = await db.pool.query(
      `SELECT DISTINCT ON (direction) direction, to_char(report_date, 'YYYY-MM-DD') AS report_date,
              to_char(created_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD HH24:MI') AS created_at
       FROM office_doc_imports ORDER BY direction, created_at DESC`
    );
    for (const r of counts.rows) if (empty[r.direction]) empty[r.direction].total = r.total;
    for (const r of latest.rows) {
      if (empty[r.direction]) {
        empty[r.direction].reportDate = r.report_date;
        empty[r.direction].lastImportAt = r.created_at;
      }
    }
    return empty;
  }
  for (const d of local.docs) if (empty[d.direction]) empty[d.direction].total++;
  for (const dir of ['den', 'di']) {
    const imp = local.imports.find((i) => i.direction === dir);
    if (imp) { empty[dir].reportDate = imp.report_date; empty[dir].lastImportAt = imp.created_at; }
  }
  return empty;
}

// ============================================================
// QUYỀN TRA CỨU CỦA NGƯỜI DÙNG ZALO
// ============================================================

async function canLookupOffice(zaloId) {
  if (!zaloId) return false;
  if (await isPg()) {
    const res = await db.pool.query(
      'SELECT can_lookup_office, is_blocked FROM zalo_users WHERE zalo_id = $1', [String(zaloId)]
    );
    const row = res.rows[0];
    return !!row && row.can_lookup_office === true && row.is_blocked !== true;
  }
  return local.permissions.get(String(zaloId))?.can_lookup_office === true;
}

async function setOfficePermission(zaloId, allowed, { grantedBy = null, staffLabel = null, displayName = null } = {}) {
  if (await isPg()) {
    const res = await db.pool.query(
      `INSERT INTO zalo_users (zalo_id, display_name, can_lookup_office, staff_label, granted_by, granted_at)
       VALUES ($1, COALESCE($2, 'Đồng chí'), $3, $4, $5, CASE WHEN $3 THEN NOW() ELSE NULL END)
       ON CONFLICT (zalo_id) DO UPDATE SET
         can_lookup_office = EXCLUDED.can_lookup_office,
         staff_label = COALESCE(EXCLUDED.staff_label, zalo_users.staff_label),
         granted_by = CASE WHEN EXCLUDED.can_lookup_office THEN EXCLUDED.granted_by ELSE zalo_users.granted_by END,
         granted_at = CASE WHEN EXCLUDED.can_lookup_office THEN NOW() ELSE NULL END
       RETURNING zalo_id, display_name, can_lookup_office, staff_label`,
      [String(zaloId), displayName, !!allowed, staffLabel, grantedBy]
    );
    return res.rows[0];
  }
  const cur = local.permissions.get(String(zaloId)) || {};
  const next = { ...cur, can_lookup_office: !!allowed, staff_label: staffLabel || cur.staff_label || null, granted_by: grantedBy };
  local.permissions.set(String(zaloId), next);
  return { zalo_id: String(zaloId), ...next };
}

// ============================================================
// MÃ KÍCH HOẠT (dùng một lần, chỉ lưu SHA-256)
// ============================================================

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // bỏ 0/O/1/I dễ nhầm

function generatePlainCode() {
  const bytes = crypto.randomBytes(8);
  let out = '';
  for (let i = 0; i < 8; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}

function normalizeCode(code) {
  return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

async function createActivationCode({ staffLabel, createdBy = null, createdByName = null, ttlHours = 24 }) {
  const code = generatePlainCode();
  const codeHash = sha256(normalizeCode(code));
  const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000);
  if (await isPg()) {
    const res = await db.pool.query(
      `INSERT INTO zalo_activation_codes (code_hash, staff_label, created_by, created_by_name, expires_at)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [codeHash, staffLabel, createdBy, createdByName, expiresAt]
    );
    return { id: res.rows[0].id, code, staffLabel, expiresAt: expiresAt.toISOString() };
  }
  const id = local.nextId++;
  local.codes.unshift({ id, code_hash: codeHash, staff_label: staffLabel, created_by: createdBy, created_by_name: createdByName, expires_at: expiresAt.toISOString(), used_at: null, used_by_zalo_id: null, created_at: new Date().toISOString() });
  return { id, code, staffLabel, expiresAt: expiresAt.toISOString() };
}

async function listActivationCodes({ limit = 50 } = {}) {
  if (await isPg()) {
    const res = await db.pool.query(
      `SELECT c.id, c.staff_label, c.created_by_name, c.used_by_zalo_id, u.display_name AS used_by_name,
              to_char(c.expires_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD HH24:MI') AS expires_at,
              to_char(c.used_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD HH24:MI') AS used_at,
              to_char(c.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD HH24:MI') AS created_at,
              (c.used_at IS NULL AND c.expires_at > NOW()) AS is_active
       FROM zalo_activation_codes c LEFT JOIN zalo_users u ON u.zalo_id = c.used_by_zalo_id
       ORDER BY c.created_at DESC LIMIT $1`,
      [Math.min(Math.max(limit, 1), 200)]
    );
    return res.rows;
  }
  const now = Date.now();
  return local.codes.slice(0, limit).map(({ code_hash, ...c }) => ({ ...c, is_active: !c.used_at && new Date(c.expires_at).getTime() > now }));
}

async function revokeActivationCode(id) {
  if (await isPg()) {
    const res = await db.pool.query(
      'UPDATE zalo_activation_codes SET expires_at = NOW() WHERE id = $1 AND used_at IS NULL RETURNING id', [id]
    );
    return res.rowCount > 0;
  }
  const c = local.codes.find((x) => x.id === Number(id) && !x.used_at);
  if (c) c.expires_at = new Date().toISOString();
  return !!c;
}

/**
 * Đổi mã lấy quyền tra cứu. Atomic: mã chỉ dùng được một lần.
 * @returns {{ ok: boolean, staffLabel?: string }}
 */
async function redeemActivationCode(code, zaloId, displayName) {
  const codeHash = sha256(normalizeCode(code));
  if (await isPg()) {
    const res = await db.pool.query(
      `UPDATE zalo_activation_codes SET used_at = NOW(), used_by_zalo_id = $2
       WHERE code_hash = $1 AND used_at IS NULL AND expires_at > NOW()
       RETURNING staff_label, created_by`,
      [codeHash, String(zaloId)]
    );
    if (!res.rowCount) return { ok: false };
    const { staff_label: staffLabel, created_by: createdBy } = res.rows[0];
    await setOfficePermission(zaloId, true, { grantedBy: createdBy, staffLabel, displayName });
    return { ok: true, staffLabel };
  }
  const c = local.codes.find((x) => x.code_hash === codeHash && !x.used_at && new Date(x.expires_at).getTime() > Date.now());
  if (!c) return { ok: false };
  c.used_at = new Date().toISOString();
  c.used_by_zalo_id = String(zaloId);
  await setOfficePermission(zaloId, true, { grantedBy: c.created_by, staffLabel: c.staff_label, displayName });
  return { ok: true, staffLabel: c.staff_label };
}

// ============================================================
// TRẠNG THÁI HỘI THOẠI + GIỚI HẠN NHẬP SAI MÃ
// ============================================================

async function getSession(zaloId, ttlMinutes = 30) {
  if (!zaloId) return null;
  if (await isPg()) {
    const res = await db.pool.query(
      `SELECT state FROM zalo_sessions WHERE zalo_id = $1 AND updated_at > NOW() - ($2 || ' minutes')::interval`,
      [String(zaloId), String(ttlMinutes)]
    );
    const st = res.rows[0]?.state;
    return st && Object.keys(st).length ? st : null;
  }
  const s = local.sessions.get(String(zaloId));
  if (!s || !s.state || Date.now() - s.updated_at > ttlMinutes * 60000) return null;
  return Object.keys(s.state).length ? s.state : null;
}

async function saveSession(zaloId, state) {
  if (!zaloId) return;
  if (await isPg()) {
    await db.pool.query(
      `INSERT INTO zalo_sessions (zalo_id, state, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (zalo_id) DO UPDATE SET state = EXCLUDED.state, updated_at = NOW()`,
      [String(zaloId), JSON.stringify(state || {})]
    );
    return;
  }
  const cur = local.sessions.get(String(zaloId)) || {};
  local.sessions.set(String(zaloId), { ...cur, state: state || {}, updated_at: Date.now() });
}

async function clearSession(zaloId) {
  return saveSession(zaloId, {});
}

/** Số lần nhập sai mã trong cửa sổ 1 giờ gần nhất */
async function getActivationFailures(zaloId) {
  if (await isPg()) {
    const res = await db.pool.query(
      `SELECT failed_activation_count FROM zalo_sessions
       WHERE zalo_id = $1 AND failed_activation_window_start > NOW() - INTERVAL '1 hour'`,
      [String(zaloId)]
    );
    return res.rows[0]?.failed_activation_count || 0;
  }
  const s = local.sessions.get(String(zaloId));
  if (!s || !s.failed_activation_window_start || Date.now() - s.failed_activation_window_start > 3600000) return 0;
  return s.failed_activation_count || 0;
}

async function recordActivationFailure(zaloId) {
  if (await isPg()) {
    await db.pool.query(
      `INSERT INTO zalo_sessions (zalo_id, failed_activation_count, failed_activation_window_start)
       VALUES ($1, 1, NOW())
       ON CONFLICT (zalo_id) DO UPDATE SET
         failed_activation_count = CASE
           WHEN zalo_sessions.failed_activation_window_start > NOW() - INTERVAL '1 hour'
           THEN zalo_sessions.failed_activation_count + 1 ELSE 1 END,
         failed_activation_window_start = CASE
           WHEN zalo_sessions.failed_activation_window_start > NOW() - INTERVAL '1 hour'
           THEN zalo_sessions.failed_activation_window_start ELSE NOW() END`,
      [String(zaloId)]
    );
    return;
  }
  const s = local.sessions.get(String(zaloId)) || {};
  const inWindow = s.failed_activation_window_start && Date.now() - s.failed_activation_window_start <= 3600000;
  local.sessions.set(String(zaloId), {
    ...s,
    failed_activation_count: inWindow ? (s.failed_activation_count || 0) + 1 : 1,
    failed_activation_window_start: inWindow ? s.failed_activation_window_start : Date.now(),
  });
}

/** Chỉ dùng cho kiểm thử */
function _resetLocal() {
  local.docs = []; local.imports = []; local.codes = []; local.sessions.clear(); local.permissions.clear(); local.nextId = 1;
}

module.exports = {
  saveImport,
  fetchCandidates,
  getDocumentsByIds,
  listDocuments,
  getTypeOptions,
  getFilterOptions,
  EXPORT_MAX_ROWS,
  getImports,
  getOverview,
  canLookupOffice,
  setOfficePermission,
  createActivationCode,
  listActivationCodes,
  revokeActivationCode,
  redeemActivationCode,
  normalizeCode,
  getSession,
  saveSession,
  clearSession,
  getActivationFailures,
  recordActivationFailure,
  _resetLocal,
};
