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
  to_char(updated_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD HH24:MI') AS updated_at,
  edited_by_name, to_char(edited_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD HH24:MI') AS edited_at
`;

/** Các cột ghi khi thêm / sửa tay (không có import_id) */
const EDIT_COLUMNS = UPSERT_COLUMNS.filter((c) => c !== 'import_id');

class DuplicateDocumentError extends Error {}

/** Không kết nối được Postgres trong khi môi trường bắt buộc phải có (Vercel) */
class DbUnavailableError extends Error {
  constructor() {
    super('Không kết nối được cơ sở dữ liệu, vui lòng thử lại sau.');
    this.name = 'DbUnavailableError';
  }
}

function nowLocalStamp() {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 16).replace('T', ' ');
}

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
  if (await db.checkConnection()) return true;
  if (db.isRequired()) throw new DbUnavailableError();
  return false;
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
           ON CONFLICT (direction, source_id) DO UPDATE SET ${updates}, updated_at = NOW(),
             edited_by_name = NULL, edited_at = NULL`,
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
    const row = { ...rec, import_id: importId, edited_by_name: null, edited_at: null, updated_at: new Date().toISOString().slice(0, 16).replace('T', ' ') };
    if (idx >= 0) local.docs[idx] = { ...local.docs[idx], ...row };
    else local.docs.push({ id: local.nextId++, ...row });
  }
  summary.importId = importId;
  return summary;
}

// ------------------------------------------------------------
// Thêm / sửa / xóa tay (trang Quản lý văn bản, chỉ admin)
// `rec` đã qua doc-editor.validateDocInput
// ------------------------------------------------------------

function editorName(user) {
  return String(user?.fullName || user?.username || 'Quản trị viên').slice(0, 100);
}

/** @returns {Promise<number>} id mới; ném DuplicateDocumentError nếu trùng Mã trong cùng sổ */
async function createDocument(rec, user) {
  const name = editorName(user);
  if (await isPg()) {
    const params = EDIT_COLUMNS.map((c) => (rec[c] === undefined ? null : rec[c]));
    params.push(name);
    const res = await db.pool.query(
      `INSERT INTO office_documents (${EDIT_COLUMNS.join(',')}, edited_by_name, edited_at)
       VALUES (${EDIT_COLUMNS.map((_, i) => `$${i + 1}`).join(',')}, $${params.length}, NOW())
       ON CONFLICT (direction, source_id) DO NOTHING RETURNING id`,
      params
    );
    if (!res.rows.length) throw new DuplicateDocumentError('Mã văn bản đã có trong sổ.');
    return res.rows[0].id;
  }
  if (local.docs.some((d) => d.direction === rec.direction && d.source_id === rec.source_id)) {
    throw new DuplicateDocumentError('Mã văn bản đã có trong sổ.');
  }
  const stamp = nowLocalStamp();
  const id = local.nextId++;
  local.docs.push({ id, ...rec, import_id: null, edited_by_name: name, edited_at: stamp, updated_at: stamp });
  return id;
}

/** Sửa mọi trường trừ Loại sổ và Mã văn bản. @returns {Promise<boolean>} false nếu không tìm thấy */
async function updateDocument(id, rec, user) {
  const name = editorName(user);
  const cols = EDIT_COLUMNS.filter((c) => c !== 'direction' && c !== 'source_id');
  if (await isPg()) {
    const params = cols.map((c) => (rec[c] === undefined ? null : rec[c]));
    params.push(name, id);
    const res = await db.pool.query(
      `UPDATE office_documents SET ${cols.map((c, i) => `${c} = $${i + 1}`).join(', ')},
         edited_by_name = $${params.length - 1}, edited_at = NOW(), updated_at = NOW()
       WHERE id = $${params.length} RETURNING id`,
      params
    );
    return res.rows.length > 0;
  }
  const doc = local.docs.find((d) => d.id === id);
  if (!doc) return false;
  const stamp = nowLocalStamp();
  for (const c of cols) doc[c] = rec[c] === undefined ? null : rec[c];
  Object.assign(doc, { edited_by_name: name, edited_at: stamp, updated_at: stamp });
  return true;
}

/** @returns {Promise<object|null>} bản ghi đã xóa (để ghi log) hoặc null */
async function deleteDocument(id) {
  if (await isPg()) {
    const res = await db.pool.query(
      'DELETE FROM office_documents WHERE id = $1 RETURNING id, direction, source_id, so_ky_hieu', [id]
    );
    return res.rows[0] || null;
  }
  const idx = local.docs.findIndex((d) => d.id === id);
  if (idx < 0) return null;
  const [doc] = local.docs.splice(idx, 1);
  return { id: doc.id, direction: doc.direction, source_id: doc.source_id, so_ky_hieu: doc.so_ky_hieu };
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

/** Ngày (YYYY-MM-DD) theo giờ Việt Nam, lệch `days` ngày */
function vnDay(now, days = 0) {
  return new Date(now.getTime() + 7 * 3600 * 1000 + days * 86400000).toISOString().slice(0, 10);
}

/** Đầu tháng lùi `back` tháng so với `isoDay` */
function monthStart(isoDay, back = 0) {
  const [y, m] = isoDay.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 - back, 1));
  return d.toISOString().slice(0, 10);
}

const DASHBOARD_MONTHS = 12;
const DUE_SOON_DAYS = 7;

/**
 * Số liệu trang Tổng quan (chỉ admin). Không trả Ý kiến chuyển/chỉ đạo.
 * Ngày hiệu lực: sổ đến lấy ngày nhận (nếu có), sổ đi lấy ngày văn bản (khớp bảng Tra cứu).
 */
async function getDashboard({ now = new Date() } = {}) {
  const today = vnDay(now);
  const curMonth = monthStart(today);
  const prevMonth = monthStart(today, 1);
  const yearStart = `${today.slice(0, 4)}-01-01`;
  const chartFrom = monthStart(today, DASHBOARD_MONTHS - 1);
  const dueTo = vnDay(now, DUE_SOON_DAYS);
  const lookupFrom = vnDay(now, -13);

  const months = [];
  for (let i = DASHBOARD_MONTHS - 1; i >= 0; i--) months.push({ month: monthStart(today, i).slice(0, 7), den: 0, di: 0 });
  const lookups = [];
  for (let i = 13; i >= 0; i--) lookups.push({ day: vnDay(now, -i), count: 0 });
  const out = {
    today,
    totals: { den: 0, di: 0, month: 0, monthDen: 0, monthDi: 0, prevMonth: 0, year: 0, urgent: 0, dueSoon: 0, manual: 0 },
    months, types: [], recent: [], deadlines: [], lookups,
    zalo: { users: 0, granted: 0, pendingCodes: 0 },
    dueSoonDays: DUE_SOON_DAYS,
  };

  if (await isPg()) {
    const eff = `(${EFFECTIVE_DATE_SQL})`;
    const [totals, monthly, types, recent, deadlines, zalo, codes, logs] = await Promise.all([
      db.pool.query(
        `SELECT COUNT(*) FILTER (WHERE direction = 'den')::int AS den,
                COUNT(*) FILTER (WHERE direction = 'di')::int AS di,
                COUNT(*) FILTER (WHERE ${eff} >= $1::date)::int AS month,
                COUNT(*) FILTER (WHERE ${eff} >= $1::date AND direction = 'den')::int AS month_den,
                COUNT(*) FILTER (WHERE ${eff} >= $1::date AND direction = 'di')::int AS month_di,
                COUNT(*) FILTER (WHERE ${eff} >= $2::date AND ${eff} < $1::date)::int AS prev_month,
                COUNT(*) FILTER (WHERE ${eff} >= $3::date)::int AS year,
                COUNT(*) FILTER (WHERE do_khan IS NOT NULL AND do_khan <> 'Thường')::int AS urgent,
                COUNT(*) FILTER (WHERE direction = 'den' AND han_xu_ly BETWEEN $4::date AND $5::date)::int AS due_soon,
                COUNT(*) FILTER (WHERE edited_by_name IS NOT NULL)::int AS manual
         FROM office_documents`,
        [curMonth, prevMonth, yearStart, today, dueTo]
      ),
      db.pool.query(
        `SELECT to_char(${eff}, 'YYYY-MM') AS month, direction, COUNT(*)::int AS count
         FROM office_documents WHERE ${eff} >= $1::date GROUP BY 1, 2`,
        [chartFrom]
      ),
      db.pool.query(
        `SELECT COALESCE(the_loai, 'Chưa phân loại') AS name, COUNT(*)::int AS count
         FROM office_documents GROUP BY 1 ORDER BY count DESC, name`
      ),
      db.pool.query(
        `SELECT id, direction, so_ky_hieu, trich_yeu, the_loai, do_khan, to_char(${eff}, 'YYYY-MM-DD') AS ngay
         FROM office_documents ORDER BY ${eff} DESC NULLS LAST, id DESC LIMIT 6`
      ),
      db.pool.query(
        `SELECT id, so_ky_hieu, trich_yeu, do_khan, to_char(han_xu_ly, 'YYYY-MM-DD') AS han_xu_ly
         FROM office_documents WHERE direction = 'den' AND han_xu_ly >= $1::date
         ORDER BY han_xu_ly ASC, id DESC LIMIT 5`,
        [today]
      ),
      db.pool.query(
        `SELECT COUNT(*)::int AS users,
                COUNT(*) FILTER (WHERE can_lookup_office AND NOT is_blocked)::int AS granted
         FROM zalo_users`
      ),
      db.pool.query('SELECT COUNT(*)::int AS pending FROM zalo_activation_codes WHERE used_at IS NULL AND expires_at > NOW()'),
      db.pool.query(
        `SELECT to_char(created_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD') AS day, COUNT(*)::int AS count
         FROM query_logs WHERE intent = 'office_lookup' AND created_at >= ($1::date - INTERVAL '7 hours')
         GROUP BY 1`,
        [lookupFrom]
      ),
    ]);
    const t = totals.rows[0];
    Object.assign(out.totals, {
      den: t.den, di: t.di, month: t.month, monthDen: t.month_den, monthDi: t.month_di,
      prevMonth: t.prev_month, year: t.year, urgent: t.urgent, dueSoon: t.due_soon, manual: t.manual,
    });
    for (const r of monthly.rows) {
      const slot = months.find((m) => m.month === r.month);
      if (slot && (r.direction === 'den' || r.direction === 'di')) slot[r.direction] = r.count;
    }
    out.types = types.rows;
    out.recent = recent.rows;
    out.deadlines = deadlines.rows;
    out.zalo = { users: zalo.rows[0].users, granted: zalo.rows[0].granted, pendingCodes: codes.rows[0].pending };
    for (const r of logs.rows) {
      const slot = lookups.find((l) => l.day === r.day);
      if (slot) slot.count = r.count;
    }
    return out;
  }

  // Bộ nhớ dự phòng
  const effOf = (d) => ((d.direction === 'den' ? (d.thoi_gian_nhan || d.ngay_van_ban) : d.ngay_van_ban) || '').slice(0, 10);
  const typeCount = new Map();
  for (const d of local.docs) {
    const e = effOf(d);
    const t = out.totals;
    if (d.direction === 'den') t.den++; else t.di++;
    if (e && e >= curMonth) { t.month++; if (d.direction === 'den') t.monthDen++; else t.monthDi++; }
    if (e && e >= prevMonth && e < curMonth) t.prevMonth++;
    if (e && e >= yearStart) t.year++;
    if (d.do_khan && d.do_khan !== 'Thường') t.urgent++;
    if (d.direction === 'den' && d.han_xu_ly && d.han_xu_ly >= today && d.han_xu_ly <= dueTo) t.dueSoon++;
    if (d.edited_by_name) t.manual++;
    const slot = e ? months.find((m) => m.month === e.slice(0, 7)) : null;
    if (slot) slot[d.direction]++;
    const name = d.the_loai || 'Chưa phân loại';
    typeCount.set(name, (typeCount.get(name) || 0) + 1);
  }
  out.types = [...typeCount.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  out.recent = [...local.docs]
    .sort((a, b) => (effOf(b) > effOf(a) ? 1 : effOf(b) < effOf(a) ? -1 : b.id - a.id))
    .slice(0, 6)
    .map((d) => ({ id: d.id, direction: d.direction, so_ky_hieu: d.so_ky_hieu, trich_yeu: d.trich_yeu, the_loai: d.the_loai, do_khan: d.do_khan, ngay: effOf(d) || null }));
  out.deadlines = local.docs
    .filter((d) => d.direction === 'den' && d.han_xu_ly && d.han_xu_ly >= today)
    .sort((a, b) => (a.han_xu_ly > b.han_xu_ly ? 1 : a.han_xu_ly < b.han_xu_ly ? -1 : b.id - a.id))
    .slice(0, 5)
    .map((d) => ({ id: d.id, so_ky_hieu: d.so_ky_hieu, trich_yeu: d.trich_yeu, do_khan: d.do_khan, han_xu_ly: d.han_xu_ly }));
  const users = Array.from(db.localZaloUsers.values());
  const granted = [...local.permissions.values()].filter((p) => p.can_lookup_office).length;
  out.zalo = {
    users: Math.max(users.length, local.permissions.size),
    granted,
    pendingCodes: local.codes.filter((c) => !c.used_at && new Date(c.expires_at).getTime() > now.getTime()).length,
  };
  for (const l of db.localQueryLogs || []) {
    if (l.intent !== 'office_lookup') continue;
    const day = vnDay(new Date(l.created_at));
    const slot = lookups.find((x) => x.day === day);
    if (slot) slot.count++;
  }
  return out;
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

/** Đổi tên cán bộ ghi trên mã (mọi trạng thái); trả về false nếu không có mã */
async function updateActivationCodeLabel(id, staffLabel) {
  if (await isPg()) {
    const res = await db.pool.query('UPDATE zalo_activation_codes SET staff_label = $2 WHERE id = $1 RETURNING id', [id, staffLabel]);
    return res.rowCount > 0;
  }
  const c = local.codes.find((x) => x.id === Number(id));
  if (c) c.staff_label = staffLabel;
  return !!c;
}

/** Xóa mã khỏi danh sách. Mã chưa dùng bị xóa cũng không dùng được nữa; quyền đã cấp từ mã không bị ảnh hưởng. */
async function deleteActivationCode(id) {
  if (await isPg()) {
    const res = await db.pool.query('DELETE FROM zalo_activation_codes WHERE id = $1 RETURNING id, staff_label', [id]);
    return res.rows[0] || null;
  }
  const i = local.codes.findIndex((x) => x.id === Number(id));
  if (i < 0) return null;
  const [removed] = local.codes.splice(i, 1);
  return { id: removed.id, staff_label: removed.staff_label };
}

/**
 * Sửa thông tin tài khoản Zalo: tên cán bộ, ghi chú, quyền tra cứu, chặn bot.
 * Trường undefined giữ nguyên. Trả về bản ghi sau khi sửa, hoặc null nếu không có tài khoản.
 */
async function updateZaloUser(zaloId, { staffLabel, notes, canLookup, isBlocked } = {}, { grantedBy = null } = {}) {
  const id = String(zaloId);
  if (await isPg()) {
    const res = await db.pool.query(
      `UPDATE zalo_users SET
         staff_label = CASE WHEN $2::boolean THEN $3 ELSE staff_label END,
         notes = CASE WHEN $4::boolean THEN $5 ELSE notes END,
         is_blocked = COALESCE($6::boolean, is_blocked),
         granted_by = CASE WHEN $7::boolean IS TRUE AND NOT can_lookup_office THEN $8 ELSE granted_by END,
         granted_at = CASE WHEN $7::boolean IS NULL THEN granted_at
                           WHEN $7::boolean AND NOT can_lookup_office THEN NOW()
                           WHEN $7::boolean THEN granted_at ELSE NULL END,
         can_lookup_office = COALESCE($7::boolean, can_lookup_office)
       WHERE zalo_id = $1
       RETURNING zalo_id, display_name, staff_label, notes, is_blocked, can_lookup_office`,
      [id, staffLabel !== undefined, staffLabel ?? null, notes !== undefined, notes ?? null,
        typeof isBlocked === 'boolean' ? isBlocked : null, typeof canLookup === 'boolean' ? canLookup : null, grantedBy]
    );
    return res.rows[0] || null;
  }
  const u = db.localZaloUsers.get(id);
  const perm = local.permissions.get(id);
  if (!u && !perm) return null;
  const nextPerm = { ...(perm || {}) };
  if (staffLabel !== undefined) nextPerm.staff_label = staffLabel;
  if (typeof canLookup === 'boolean') { nextPerm.can_lookup_office = canLookup; if (canLookup) nextPerm.granted_by = grantedBy; }
  local.permissions.set(id, nextPerm);
  if (u) {
    if (staffLabel !== undefined) u.staff_label = staffLabel;
    if (notes !== undefined) u.notes = notes;
    if (typeof isBlocked === 'boolean') u.is_blocked = isBlocked;
    if (typeof canLookup === 'boolean') u.can_lookup_office = canLookup;
  }
  return {
    zalo_id: id, display_name: u?.display_name || null, staff_label: nextPerm.staff_label ?? null,
    notes: u?.notes ?? null, is_blocked: u?.is_blocked === true, can_lookup_office: nextPerm.can_lookup_office === true,
  };
}

/** Xóa tài khoản Zalo khỏi danh sách (mất quyền tra cứu + bộ nhớ hội thoại). Nhắn lại bot sẽ hiện lại, chưa có quyền. */
async function deleteZaloUser(zaloId) {
  const id = String(zaloId);
  if (await isPg()) {
    const res = await db.pool.query('DELETE FROM zalo_users WHERE zalo_id = $1 RETURNING zalo_id, display_name', [id]);
    await db.pool.query('DELETE FROM zalo_sessions WHERE zalo_id = $1', [id]);
    return res.rows[0] || null;
  }
  const u = db.localZaloUsers.get(id);
  const had = !!u || local.permissions.has(id);
  db.localZaloUsers.delete(id);
  local.permissions.delete(id);
  local.sessions.delete(id);
  return had ? { zalo_id: id, display_name: u?.display_name || null } : null;
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
  createDocument,
  updateDocument,
  deleteDocument,
  DuplicateDocumentError,
  DbUnavailableError,
  fetchCandidates,
  getDocumentsByIds,
  listDocuments,
  getTypeOptions,
  getFilterOptions,
  EXPORT_MAX_ROWS,
  getImports,
  getOverview,
  getDashboard,
  canLookupOffice,
  setOfficePermission,
  createActivationCode,
  listActivationCodes,
  revokeActivationCode,
  updateActivationCodeLabel,
  deleteActivationCode,
  updateZaloUser,
  deleteZaloUser,
  redeemActivationCode,
  normalizeCode,
  getSession,
  saveSession,
  clearSession,
  getActivationFailures,
  recordActivationFailure,
  _resetLocal,
};
