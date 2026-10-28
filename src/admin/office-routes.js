/**
 * API quản trị luồng Tra cứu Sổ công văn.
 * Gắn sau authMiddleware. Phân quyền:
 *  - Mọi tài khoản đăng nhập: xem/tìm sổ (vai trò 'user' không thấy Ý kiến chuyển/chỉ đạo), thử câu hỏi.
 *  - admin/superadmin: tổng quan, nhập Excel, thêm/sửa/xóa từng văn bản, xem lịch sử nhập,
 *    cấp/sửa/xóa mã kích hoạt Zalo, cấp/thu quyền, sửa/xóa tài khoản Zalo.
 */

const express = require('express');
const config = require('../config');
const { requireRole } = require('./auth');
const store = require('../office/store');
const office = require('../office');
const { parseRegisterWorkbook, ImportError, MAX_FILE_BYTES } = require('../office/importer');
const { parseQuery } = require('../office/query-parser');
const { rankCandidates, buildCandidateQuery, paginateRanked, SORTABLE } = require('../office/search');
const aiRewriter = require('../office/ai-rewriter');
const XLSX = require('xlsx');
const { readColumnFilters } = require('../office/column-filters');
const { validateDocInput } = require('../office/doc-editor');

const router = express.Router();
const adminOnly = requireRole('superadmin', 'admin');

const INTERNAL_FIELDS = ['y_kien_chuyen', 'y_kien_chi_dao'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isAdmin(user) {
  return user && (user.role === 'admin' || user.role === 'superadmin');
}

/** Bỏ trường nội bộ / kỹ thuật trước khi trả về giao diện */
function sanitizeDoc(doc, user) {
  if (!doc) return doc;
  const { search_norm, row_hash, import_id, _score, ...rest } = doc;
  if (!isAdmin(user)) for (const f of INTERNAL_FIELDS) delete rest[f];
  return rest;
}

function readFilters(q) {
  const direction = q.direction === 'den' || q.direction === 'di' ? q.direction : null;
  const theLoai = typeof q.theLoai === 'string' && q.theLoai.trim() ? q.theLoai.trim().slice(0, 60) : null;
  const dateFrom = ISO_DATE.test(q.dateFrom || '') ? q.dateFrom : null;
  const dateTo = ISO_DATE.test(q.dateTo || '') ? q.dateTo : null;
  const sort = q.sort === 'relevance' || SORTABLE[q.sort] ? q.sort : null;
  const order = q.order === 'asc' ? 'asc' : 'desc';
  const page = Math.max(parseInt(q.page, 10) || 1, 1);
  const pageSize = Math.min(Math.max(parseInt(q.pageSize, 10) || 20, 5), 100);
  const text = typeof q.q === 'string' ? q.q.trim().slice(0, 300) : '';
  return { direction, theLoai, dateFrom, dateTo, sort, order, page, pageSize, text, columns: readColumnFilters(q) };
}

// ------------------------------------------------------------
// Tra cứu (mọi vai trò)
// ------------------------------------------------------------

router.get('/office-docs/overview', async (req, res) => {
  try {
    const [overview, types, options] = await Promise.all([store.getOverview(), store.getTypeOptions(), store.getFilterOptions()]);
    res.json({ ok: true, overview, types, options, unitName: config.office.unitName });
  } catch (err) {
    console.error('[Office API] overview:', err.message);
    res.status(500).json({ ok: false, error: 'Không tải được tổng quan sổ công văn.' });
  }
});

/**
 * Lõi tra cứu dùng chung cho bảng và Xuất Excel.
 *  - Không có ô tìm tự do: lọc + phân trang ở SQL.
 *  - Có ô tìm tự do: cùng bộ phân tích như Zalo, bộ lọc trên giao diện được ưu tiên.
 * @param {object} f kết quả readFilters()
 * @param {{ all?: boolean }} opts all=true: lấy toàn bộ (tối đa EXPORT_MAX_ROWS), bỏ phân trang
 */
async function queryDocuments(f, { all = false } = {}) {
  const limit = all ? store.EXPORT_MAX_ROWS : f.pageSize;
  if (!f.text) {
    const sort = f.sort && f.sort !== 'relevance' ? f.sort : 'ngay';
    const { total, items } = await store.listDocuments({
      direction: f.direction, theLoai: f.theLoai, dateFrom: f.dateFrom, dateTo: f.dateTo, columnFilters: f.columns,
      sort, order: f.order, limit, offset: all ? 0 : (f.page - 1) * f.pageSize, maxLimit: limit,
    });
    return {
      mode: 'table', total, page: all ? 1 : f.page, pageSize: limit,
      pages: Math.max(1, Math.ceil(total / limit)), items,
    };
  }

  let parsed = parseQuery(f.text);
  const applyUiFilters = (p) => {
    if (f.direction) p.filters.direction = f.direction;
    if (f.theLoai) p.filters.theLoai = f.theLoai;
    if (f.dateFrom) p.filters.dateFrom = f.dateFrom;
    if (f.dateTo) p.filters.dateTo = f.dateTo;
    return p;
  };
  const candidates = (p) => store.fetchCandidates({ ...buildCandidateQuery(p), columnFilters: f.columns });
  applyUiFilters(parsed);
  let ranked = rankCandidates(await candidates(parsed), parsed);
  let aiUsed = false;
  if (!ranked.matches.length && config.office.aiRewrite) {
    const ai = await aiRewriter.rewriteQuery(f.text);
    if (ai && ai.inScope !== false) {
      applyUiFilters(ai);
      const retry = rankCandidates(await candidates(ai), ai);
      if (retry.matches.length || (retry.related.length && !ranked.related.length)) {
        parsed = ai; ranked = retry; aiUsed = true;
      }
    }
  }
  const usedRelated = !ranked.matches.length;
  const list = usedRelated ? ranked.related.slice(0, 50) : ranked.matches;
  const pageData = paginateRanked(list, {
    sort: f.sort || 'relevance', order: f.order, page: all ? 1 : f.page, pageSize: all ? list.length || 1 : f.pageSize, maxPageSize: limit,
  });
  return {
    mode: 'search', usedRelated, aiUsed,
    parsed: { intent: parsed.intent, filters: parsed.filters, keywords: parsed.keywords },
    ...pageData,
  };
}

router.get('/office-docs', async (req, res) => {
  try {
    const result = await queryDocuments(readFilters(req.query));
    res.json({ ok: true, ...result, items: result.items.map((d) => sanitizeDoc(d, req.user)) });
  } catch (err) {
    console.error('[Office API] search:', err.message);
    res.status(500).json({ ok: false, error: 'Không tra cứu được sổ công văn.' });
  }
});

// ------------------------------------------------------------
// Xuất Excel kết quả đang lọc (mọi vai trò). Chỉ thông tin sổ, không có Ý kiến chuyển/chỉ đạo.
// ------------------------------------------------------------

const EXPORT_COLUMNS = [
  ['STT', 6, (d, i) => i + 1],
  ['Sổ', 8, (d) => (d.direction === 'den' ? 'Đến' : 'Đi')],
  ['Số, ký hiệu', 18, (d) => d.so_ky_hieu],
  ['Ngày văn bản', 13, (d) => vnDate(d.ngay_van_ban)],
  ['Ngày đến', 13, (d) => vnDate(d.thoi_gian_nhan)],
  ['Thể loại', 14, (d) => d.the_loai],
  ['Trích yếu nội dung', 70, (d) => d.trich_yeu],
  ['Người ký', 22, (d) => d.nguoi_ky],
  ['Người gửi / trình', 22, (d) => d.nguoi_gui || d.nguoi_trinh],
  ['Độ khẩn', 10, (d) => d.do_khan],
  ['Hạn xử lý', 13, (d) => vnDate(d.han_xu_ly)],
  ['Trạng thái phát hành', 18, (d) => d.trang_thai_phat_hanh],
  ['Sổ văn bản', 28, (d) => d.so_van_ban],
  ['Số trang', 9, (d) => d.so_trang],
  ['Số bản', 8, (d) => d.so_ban],
  ['Mã văn bản', 13, (d) => d.source_id],
];

function vnDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

function describeFilters(f) {
  const c = f.columns || {};
  const range = (a, b) => `${a ? vnDate(a) : '...'} - ${b ? vnDate(b) : '...'}`;
  const parts = [];
  if (f.text) parts.push(`Tìm: "${f.text}"`);
  if (c.keyword) parts.push(`Từ khóa: ${c.keyword}`);
  if (f.theLoai) parts.push(`Thể loại: ${f.theLoai}`);
  if (c.soKyHieu) parts.push(`Số, ký hiệu: ${c.soKyHieu}`);
  if (c.sourceId) parts.push(`Mã VB: ${c.sourceId}`);
  if (c.trichYeu) parts.push(`Trích yếu: ${c.trichYeu}`);
  if (c.nguoiKy) parts.push(`Người ký: ${c.nguoiKy}`);
  if (c.nguoiGui) parts.push(`Người gửi/trình: ${c.nguoiGui}`);
  if (c.soVanBan) parts.push(`Sổ: ${c.soVanBan}`);
  if (c.doKhan) parts.push(`Độ khẩn: ${c.doKhan}`);
  if (c.trangThai) parts.push(`Trạng thái: ${c.trangThai}`);
  if (c.docDateFrom || c.docDateTo) parts.push(`Ngày VB: ${range(c.docDateFrom, c.docDateTo)}`);
  if (c.receivedFrom || c.receivedTo) parts.push(`Ngày đến: ${range(c.receivedFrom, c.receivedTo)}`);
  if (c.deadlineFrom || c.deadlineTo) parts.push(`Hạn xử lý: ${range(c.deadlineFrom, c.deadlineTo)}`);
  if (c.nguon) parts.push(`Nguồn: ${c.nguon === 'tay' ? 'Sửa tay' : 'Từ file Excel'}`);
  return parts.join('; ');
}

function sanitizeExcelCell(val) {
  if (val === null || val === undefined) return '';
  if (typeof val !== 'string') return val;
  if (/^[=+\-@\t\r]/.test(val)) {
    return `'${val}`;
  }
  return val;
}

function buildExportWorkbook(items, f) {
  const now = new Date(Date.now() + 7 * 3600 * 1000).toISOString(); // giờ Việt Nam
  const stamp = `${now.slice(8, 10)}/${now.slice(5, 7)}/${now.slice(0, 4)} ${now.slice(11, 16)}`;
  const book = f.direction === 'den' ? 'SỔ VĂN BẢN ĐẾN' : f.direction === 'di' ? 'SỔ VĂN BẢN ĐI' : 'SỔ VĂN BẢN ĐẾN / ĐI';
  const rows = [
    [`${book} - ${config.office.unitName.toUpperCase()}`],
    [`Xuất lúc ${stamp}. ${items.length} văn bản.${describeFilters(f) ? ` Bộ lọc: ${describeFilters(f)}` : ''}`],
    [`Cần bản gốc, liên hệ Văn thư ${config.office.unitName} và cung cấp Mã văn bản.`],
    [],
    EXPORT_COLUMNS.map(([h]) => h),
    ...items.map((d, i) => EXPORT_COLUMNS.map(([, , get]) => sanitizeExcelCell(get(d, i)))),
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = EXPORT_COLUMNS.map(([, wch]) => ({ wch }));
  ws['!merges'] = [0, 1, 2].map((r) => ({ s: { r, c: 0 }, e: { r, c: EXPORT_COLUMNS.length - 1 } }));
  ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 4, c: 0 }, e: { r: 4 + items.length, c: EXPORT_COLUMNS.length - 1 } }) };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'So cong van');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', compression: true });
}

router.get('/office-docs/export', async (req, res) => {
  try {
    const f = readFilters(req.query);
    const result = await queryDocuments(f, { all: true });
    const buffer = buildExportWorkbook(result.items, f);
    const d = new Date(Date.now() + 7 * 3600 * 1000).toISOString();
    const fileName = `so-cong-van-${d.slice(0, 10).replace(/-/g, '')}-${d.slice(11, 16).replace(':', '')}.xlsx`;
    console.log(`[Office API] export: user=${req.user.username} rows=${result.items.length} total=${result.total}`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('X-Export-Rows', String(result.items.length));
    res.setHeader('X-Export-Total', String(result.total));
    res.setHeader('Cache-Control', 'no-store');
    res.send(buffer);
  } catch (err) {
    console.error('[Office API] export:', err.message);
    res.status(500).json({ ok: false, error: 'Không xuất được file Excel.' });
  }
});

router.get('/office-docs/imports', adminOnly, async (req, res) => {
  try {
    res.json({ ok: true, imports: await store.getImports({ limit: 30 }) });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Không tải được lịch sử nhập.' });
  }
});

/** Trang Tổng quan (admin): số liệu theo tháng, thể loại, văn bản mới, hạn xử lý, Zalo */
router.get('/office-docs/dashboard', adminOnly, async (req, res) => {
  try {
    const [dashboard, overview] = await Promise.all([store.getDashboard(), store.getOverview()]);
    res.json({ ok: true, ...dashboard, overview, unitName: config.office.unitName });
  } catch (err) {
    console.error('[Office API] dashboard:', err.message);
    res.status(500).json({ ok: false, error: 'Không tải được số liệu tổng quan.' });
  }
});

router.get('/office-docs/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'Mã không hợp lệ.' });
  try {
    const [doc] = await store.getDocumentsByIds([id]);
    if (!doc) return res.status(404).json({ ok: false, error: 'Không tìm thấy văn bản.' });
    res.json({ ok: true, doc: sanitizeDoc(doc, req.user), unitName: config.office.unitName });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Không tải được văn bản.' });
  }
});

// ------------------------------------------------------------
// Thêm / sửa / xóa từng văn bản (admin). Excel vẫn là nguồn chuẩn: lần nhập sau ghi đè văn bản cùng Mã.
// ------------------------------------------------------------

function invalidInput(res, errors) {
  const first = Object.values(errors)[0] || 'Dữ liệu không hợp lệ.';
  return res.status(400).json({ ok: false, error: first, fields: errors });
}

router.post('/office-docs', adminOnly, async (req, res) => {
  const v = validateDocInput(req.body);
  if (!v.ok) return invalidInput(res, v.errors);
  try {
    const id = await store.createDocument(v.record, req.user);
    office.invalidateOverview();
    console.log(`[Office API] create doc: user=${req.user.username} id=${id} source=${v.record.source_id}`);
    const [doc] = await store.getDocumentsByIds([id]);
    res.status(201).json({ ok: true, doc: sanitizeDoc(doc, req.user), message: 'Đã thêm văn bản vào sổ.' });
  } catch (err) {
    if (err instanceof store.DuplicateDocumentError) {
      return res.status(409).json({ ok: false, error: `Mã văn bản ${v.record.source_id} đã có trong sổ này.`, fields: { source_id: 'Mã đã tồn tại.' } });
    }
    console.error('[Office API] create doc:', err.message);
    res.status(500).json({ ok: false, error: 'Không thêm được văn bản.' });
  }
});

router.put('/office-docs/:id', adminOnly, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'Mã không hợp lệ.' });
  try {
    const [existing] = await store.getDocumentsByIds([id]);
    if (!existing) return res.status(404).json({ ok: false, error: 'Không tìm thấy văn bản.' });
    const v = validateDocInput(req.body, { existing });
    if (!v.ok) return invalidInput(res, v.errors);
    const updated = await store.updateDocument(id, v.record, req.user);
    if (!updated) return res.status(404).json({ ok: false, error: 'Không tìm thấy văn bản.' });
    office.invalidateOverview();
    console.log(`[Office API] update doc: user=${req.user.username} id=${id}`);
    const [doc] = await store.getDocumentsByIds([id]);
    res.json({ ok: true, doc: sanitizeDoc(doc, req.user), message: 'Đã lưu thay đổi.' });
  } catch (err) {
    console.error('[Office API] update doc:', err.message);
    res.status(500).json({ ok: false, error: 'Không lưu được văn bản.' });
  }
});

router.delete('/office-docs/:id', adminOnly, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'Mã không hợp lệ.' });
  try {
    const removed = await store.deleteDocument(id);
    if (!removed) return res.status(404).json({ ok: false, error: 'Không tìm thấy văn bản.' });
    office.invalidateOverview();
    console.log(`[Office API] delete doc: user=${req.user.username} id=${id} source=${removed.direction}/${removed.source_id}`);
    res.json({ ok: true, message: `Đã xóa văn bản ${removed.so_ky_hieu || removed.source_id}.` });
  } catch (err) {
    console.error('[Office API] delete doc:', err.message);
    res.status(500).json({ ok: false, error: 'Không xóa được văn bản.' });
  }
});

/** Thử câu hỏi như trên Zalo (có bộ nhớ hội thoại riêng theo tài khoản web) */
router.post('/office-docs/test-query', async (req, res) => {
  const text = typeof req.body?.text === 'string' ? req.body.text.trim().slice(0, 300) : '';
  if (!text) return res.status(400).json({ ok: false, error: 'Vui lòng nhập câu hỏi.' });
  try {
    const started = Date.now();
    const r = await office.handleOfficeMessage({ text, sessionId: `web:${req.user.id}` });
    res.json({ ok: true, answer: r.answer, meta: r.meta, latencyMs: Date.now() - started });
  } catch (err) {
    console.error('[Office API] test-query:', err.message);
    res.status(500).json({ ok: false, error: 'Không xử lý được câu hỏi.' });
  }
});

// ------------------------------------------------------------
// Nhập Excel (admin)
// ------------------------------------------------------------

router.post('/office-docs/import', adminOnly, async (req, res) => {
  const { fileName, contentBase64, direction = 'auto', dryRun = true } = req.body || {};
  const name = typeof fileName === 'string' ? fileName.trim().slice(0, 255) : '';
  if (!/\.(xls|xlsx)$/i.test(name)) {
    return res.status(400).json({ ok: false, error: 'Chỉ nhận file .xls hoặc .xlsx xuất từ phần mềm quản lý văn bản.' });
  }
  if (typeof contentBase64 !== 'string' || !contentBase64) {
    return res.status(400).json({ ok: false, error: 'Thiếu nội dung file.' });
  }
  if (contentBase64.length > Math.ceil(MAX_FILE_BYTES * 4 / 3) + 16) {
    return res.status(413).json({ ok: false, error: 'File vượt quá 8MB.' });
  }
  if (!['auto', 'den', 'di'].includes(direction)) {
    return res.status(400).json({ ok: false, error: 'Loại sổ không hợp lệ.' });
  }

  try {
    const buffer = Buffer.from(contentBase64.replace(/^data:[^,]*,/, ''), 'base64');
    const parsed = parseRegisterWorkbook(buffer, { direction });
    const summary = await store.saveImport({ parsed, fileName: name, user: req.user, dryRun: dryRun !== false });
    if (dryRun === false) office.invalidateOverview();
    res.json({
      ok: true,
      dryRun: dryRun !== false,
      direction: parsed.direction,
      reportDate: parsed.reportDate,
      totalRows: parsed.totalRows,
      accepted: parsed.records.length,
      skipped: parsed.skipped,
      errors: parsed.errors.slice(0, 100),
      errorCount: parsed.errors.length,
      ...summary,
      sample: parsed.records.slice(0, 5).map((r) => ({
        source_id: r.source_id, so_ky_hieu: r.so_ky_hieu, ngay_van_ban: r.ngay_van_ban, the_loai: r.the_loai, trich_yeu: r.trich_yeu,
      })),
    });
  } catch (err) {
    if (err instanceof ImportError) return res.status(400).json({ ok: false, error: err.message });
    console.error('[Office API] import:', err.message);
    res.status(500).json({ ok: false, error: 'Không nhập được file. Vui lòng thử lại.' });
  }
});

// ------------------------------------------------------------
// Quyền tra cứu qua Zalo (admin)
// ------------------------------------------------------------

router.post('/zalo-activation-codes', adminOnly, async (req, res) => {
  const staffLabel = typeof req.body?.staffLabel === 'string' ? req.body.staffLabel.trim().slice(0, 100) : '';
  if (!staffLabel) return res.status(400).json({ ok: false, error: 'Vui lòng nhập họ tên/chức vụ cán bộ được cấp mã.' });
  try {
    const created = await store.createActivationCode({
      staffLabel,
      createdBy: req.user.id,
      createdByName: req.user.fullName || req.user.username,
      ttlHours: config.office.activationCodeTtlHours,
    });
    // Mã gốc chỉ trả về một lần, DB chỉ lưu SHA-256
    res.json({ ok: true, ...created });
  } catch (err) {
    console.error('[Office API] create code:', err.message);
    res.status(500).json({ ok: false, error: 'Không tạo được mã kích hoạt.' });
  }
});

router.get('/zalo-activation-codes', adminOnly, async (req, res) => {
  try {
    res.json({ ok: true, codes: await store.listActivationCodes({ limit: 50 }) });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Không tải được danh sách mã.' });
  }
});

router.post('/zalo-activation-codes/:id/revoke', adminOnly, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'Mã không hợp lệ.' });
  try {
    const ok = await store.revokeActivationCode(id);
    if (!ok) return res.status(404).json({ ok: false, error: 'Mã không tồn tại hoặc đã được sử dụng.' });
    res.json({ ok: true, message: 'Đã thu hồi mã kích hoạt.' });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Không thu hồi được mã.' });
  }
});

router.post('/zalo-users/:zaloId/office-permission', adminOnly, async (req, res) => {
  const zaloId = String(req.params.zaloId || '').slice(0, 64);
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(zaloId)) return res.status(400).json({ ok: false, error: 'Zalo ID không hợp lệ.' });
  const allowed = req.body?.allowed === true;
  const staffLabel = typeof req.body?.staffLabel === 'string' ? req.body.staffLabel.trim().slice(0, 100) || null : null;
  try {
    const user = await store.setOfficePermission(zaloId, allowed, { grantedBy: req.user.id, staffLabel });
    if (!allowed) await store.clearSession(zaloId).catch(() => {});
    res.json({ ok: true, user, message: allowed ? 'Đã cấp quyền tra cứu sổ công văn.' : 'Đã thu hồi quyền tra cứu.' });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Không cập nhật được quyền.' });
  }
});

const readLabel = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : undefined);
const ZALO_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** Sửa tên cán bộ ghi trên mã kích hoạt */
router.put('/zalo-activation-codes/:id', adminOnly, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'Mã không hợp lệ.' });
  const staffLabel = readLabel(req.body?.staffLabel, 100);
  if (!staffLabel) return res.status(400).json({ ok: false, error: 'Vui lòng nhập họ tên/chức vụ cán bộ.', fields: { staffLabel: 'Bắt buộc' } });
  try {
    if (!(await store.updateActivationCodeLabel(id, staffLabel))) return res.status(404).json({ ok: false, error: 'Không tìm thấy mã.' });
    res.json({ ok: true, message: 'Đã lưu tên cán bộ trên mã.' });
  } catch (err) {
    console.error('[Office API] update code:', err.message);
    res.status(500).json({ ok: false, error: 'Không lưu được.' });
  }
});

router.delete('/zalo-activation-codes/:id', adminOnly, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'Mã không hợp lệ.' });
  try {
    const removed = await store.deleteActivationCode(id);
    if (!removed) return res.status(404).json({ ok: false, error: 'Không tìm thấy mã.' });
    console.log(`[Office API] delete code: user=${req.user.username} id=${id}`);
    res.json({ ok: true, message: `Đã xóa mã của ${removed.staff_label}.` });
  } catch (err) {
    console.error('[Office API] delete code:', err.message);
    res.status(500).json({ ok: false, error: 'Không xóa được mã.' });
  }
});

/** Sửa tài khoản Zalo: tên cán bộ, ghi chú, quyền tra cứu, chặn bot */
router.put('/zalo-users/:zaloId', adminOnly, async (req, res) => {
  const zaloId = String(req.params.zaloId || '');
  if (!ZALO_ID_RE.test(zaloId)) return res.status(400).json({ ok: false, error: 'Zalo ID không hợp lệ.' });
  const b = req.body || {};
  const staffLabel = readLabel(b.staffLabel, 100);
  const notes = readLabel(b.notes, 500);
  const patch = {
    staffLabel: staffLabel === undefined ? undefined : staffLabel || null,
    notes: notes === undefined ? undefined : notes || null,
    canLookup: typeof b.canLookup === 'boolean' ? b.canLookup : undefined,
    isBlocked: typeof b.isBlocked === 'boolean' ? b.isBlocked : undefined,
  };
  try {
    const user = await store.updateZaloUser(zaloId, patch, { grantedBy: req.user.id });
    if (!user) return res.status(404).json({ ok: false, error: 'Không tìm thấy tài khoản Zalo.' });
    if (patch.canLookup === false || patch.isBlocked === true) await store.clearSession(zaloId).catch(() => {});
    console.log(`[Office API] update zalo user: user=${req.user.username} zalo=${zaloId}`);
    res.json({ ok: true, user, message: 'Đã lưu tài khoản Zalo.' });
  } catch (err) {
    console.error('[Office API] update zalo user:', err.message);
    res.status(500).json({ ok: false, error: 'Không lưu được tài khoản Zalo.' });
  }
});

router.delete('/zalo-users/:zaloId', adminOnly, async (req, res) => {
  const zaloId = String(req.params.zaloId || '');
  if (!ZALO_ID_RE.test(zaloId)) return res.status(400).json({ ok: false, error: 'Zalo ID không hợp lệ.' });
  try {
    const removed = await store.deleteZaloUser(zaloId);
    if (!removed) return res.status(404).json({ ok: false, error: 'Không tìm thấy tài khoản Zalo.' });
    console.log(`[Office API] delete zalo user: user=${req.user.username} zalo=${zaloId}`);
    res.json({ ok: true, message: `Đã xóa tài khoản ${removed.display_name || zaloId}.` });
  } catch (err) {
    console.error('[Office API] delete zalo user:', err.message);
    res.status(500).json({ ok: false, error: 'Không xóa được tài khoản Zalo.' });
  }
});

// Dùng cho kiểm thử
router._queryDocuments = queryDocuments;
router._readFilters = readFilters;
router._buildExportWorkbook = buildExportWorkbook;

module.exports = router;
