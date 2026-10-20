/**
 * Module giao diện "Sổ Công Văn" (tổng quan, tra cứu, hỏi đáp, quản lý văn bản, nhập Excel, cấp quyền Zalo).
 * Phụ thuộc window.AdminApp do app.js cung cấp; lắng nghe sự kiện:
 *  - admin:login      -> phân luồng giao diện theo vai trò và cờ tính năng
 *  - admin:viewchange -> tải dữ liệu khi mở từng trang của Sổ công văn:
 *      view-office-dashboard (admin) | view-office | view-office-chat
 *      view-office-manage | view-office-import | view-office-zalo (admin)
 */
(function () {
  'use strict';

  const App = window.AdminApp;
  if (!App) {
    console.error('[office.js] Thiếu window.AdminApp, cần nạp sau app.js.');
    return;
  }

  const { apiRequest, showToast, showConfirmDialog, escapeHtml: esc, copyToClipboard, debounce } = App;
  const $ = (id) => document.getElementById(id);

  const MAX_UPLOAD_BYTES = 3 * 1024 * 1024; // Vercel giới hạn body 4.5MB, base64 tăng ~33%
  const DIRECTION_LABEL = { den: 'Đến', di: 'Đi' };

  /** Các khóa bộ lọc gửi lên API (trùng tên tham số query) */
  const FILTER_KEYS = [
    'q', 'direction', 'theLoai', 'soKyHieu', 'sourceId', 'trichYeu', 'nguoiKy', 'nguoiGui',
    'soVanBan', 'doKhan', 'trangThai', 'docDateFrom', 'docDateTo', 'receivedFrom', 'receivedTo',
    'deadlineFrom', 'deadlineTo',
  ];
  /** Các khóa có trên hàng lọc dưới tiêu đề cột (nút X xóa nhóm này) */
  const COLUMN_ROW_KEYS = ['soKyHieu', 'docDateFrom', 'docDateTo', 'direction', 'theLoai', 'trichYeu', 'nguoiKy', 'sourceId'];
  const FILTER_ROW_PREF = 'office.filterRow';
  const emptyFilters = () => Object.fromEntries(FILTER_KEYS.map((k) => [k, '']));
  /** Các trang chỉ admin mở được (cán bộ bị đưa về Tra cứu) */
  const ADMIN_VIEWS = ['view-office-dashboard', 'view-office-manage', 'view-office-import', 'view-office-zalo'];

  const state = {
    user: null,
    features: null,
    unitName: 'Văn phòng Đảng ủy xã Thạnh Phú',
    filters: emptyFilters(),
    sort: null,
    order: 'desc',
    page: 1,
    pageSize: 20,
    lastResult: null,
    reqSeq: 0,
    currentDoc: null,
    lastFocus: null,
    importFile: null,
    importPreviewOk: false,
    zaloUsers: [],
    chatBusy: false,
    exporting: false,
    manage: { direction: '', keyword: '', page: 1, pageSize: 20, seq: 0 },
    editing: null,      // bản ghi đang sửa (null = thêm mới)
    editFocus: null,
    saving: false,
  };

  const isAdmin = () => !!state.user && (state.user.role === 'admin' || state.user.role === 'superadmin');

  // ============================================================
  // TIỆN ÍCH
  // ============================================================
  function fmtDate(iso) {
    if (!iso) return '--';
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
    return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso);
  }

  function fmtDateTime(value) {
    if (!value) return '--';
    const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(String(value));
    if (m && !/Z|[+-]\d{2}:?\d{2}$/.test(String(value))) return `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}`;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  function fmtNumber(n) {
    return Number(n || 0).toLocaleString('vi-VN');
  }

  function dirBadge(direction) {
    if (!DIRECTION_LABEL[direction]) return '';
    return `<span class="dir-badge dir-${direction}">${DIRECTION_LABEL[direction]}</span>`;
  }

  function emptyRow(colspan, text) {
    return `<tr><td colspan="${colspan}" class="table-empty"><p>${esc(text)}</p></td></tr>`;
  }

  function setBusy(btn, busy, busyText) {
    if (!btn) return;
    if (busy) {
      btn.dataset.label = btn.textContent;
      btn.textContent = busyText;
      btn.disabled = true;
    } else {
      btn.textContent = btn.dataset.label || btn.textContent;
      btn.disabled = false;
    }
  }

  // ============================================================
  // PHÂN LUỒNG THEO VAI TRÒ + CỜ TÍNH NĂNG
  // ============================================================
  function applyRoleVisibility() {
    const admin = isAdmin();
    document.querySelectorAll('.nav-admin-only').forEach((el) => { el.style.display = admin ? '' : 'none'; });
    // Cán bộ (user) chỉ tra cứu sổ công văn
    document.querySelectorAll('.nav-regulation').forEach((el) => { el.style.display = admin ? '' : 'none'; });
    ['btnClearAiCache', 'btnSeedDb'].forEach((id) => { const el = $(id); if (el) el.style.display = admin ? '' : 'none'; });
  }

  function applyMaintenance(regulationQaOn) {
    document.querySelectorAll('.nav-item.nav-regulation').forEach((btn) => {
      let badge = btn.querySelector('.nav-maint-badge');
      if (!regulationQaOn && !badge) {
        badge = document.createElement('span');
        badge.className = 'nav-maint-badge';
        badge.textContent = 'Bảo trì';
        btn.appendChild(badge);
      } else if (regulationQaOn && badge) {
        badge.remove();
      }
    });

    ['view-documents', 'view-editor', 'view-playground'].forEach((viewId) => {
      const section = $(viewId);
      if (!section) return;
      let banner = section.querySelector(':scope > .maintenance-banner');
      if (!banner) {
        banner = document.createElement('div');
        banner.className = 'maintenance-banner';
        banner.setAttribute('role', 'status');
        banner.innerHTML = `
          <div class="maintenance-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg>
          </div>
          <div>
            <span class="maintenance-title">Luồng Hỏi đáp Quy định đang bảo trì</span>
            <span class="maintenance-text">Bot Zalo tạm dừng trả lời câu hỏi về quy định. Dữ liệu vẫn được giữ nguyên, quản trị viên có thể xem và biên tập. Hệ thống đang ưu tiên luồng Tra cứu Sổ công văn.</span>
          </div>`;
        section.prepend(banner);
      }
      banner.classList.toggle('hidden', !!regulationQaOn);
    });
  }

  async function loadFeatures() {
    try {
      const res = await apiRequest('/api/features');
      state.features = res.features || {};
      if (res.office && res.office.unitName) setUnitName(res.office.unitName);
      applyMaintenance(!!state.features.regulationQa);
    } catch (e) {
      applyMaintenance(false);
    }
  }

  function setUnitName(name) {
    state.unitName = name;
    const el = $('officeUnitName');
    if (el) el.textContent = `Văn thư ${name}`;
  }

  // ============================================================
  // TRA CỨU: TỔNG QUAN + BẢNG
  // ============================================================
  async function loadOverview() {
    try {
      const res = await apiRequest('/api/office-docs/overview');
      if (res.unitName) setUnitName(res.unitName);
      ['den', 'di'].forEach((dir) => {
        const ov = (res.overview && res.overview[dir]) || {};
        const key = dir === 'den' ? 'Den' : 'Di';
        $(`officeTotal${key}`).textContent = fmtNumber(ov.total);
        $(`officeMeta${key}`).textContent = ov.reportDate
          ? `Dữ liệu chốt ngày ${fmtDate(ov.reportDate)}`
          : (ov.lastImportAt ? `Cập nhật ${fmtDateTime(ov.lastImportAt)}` : 'Chưa nhập dữ liệu');
      });
      renderSelectOptions(res.types || [], res.options || {});
    } catch (e) {
      showToast('Không tải được tổng quan sổ công văn: ' + e.message, 'error');
    }
  }

  /** Đổ giá trị thật trong sổ vào mọi ô chọn có data-options (hàng lọc + khung nâng cao) và gợi ý của form sửa */
  function renderSelectOptions(types, options) {
    const lists = { types, books: options.books || [], urgencies: options.urgencies || [], statuses: options.statuses || [] };
    document.querySelectorAll('select[data-options]').forEach((sel) => {
      const list = lists[sel.dataset.options] || [];
      const key = sel.dataset.filter;
      const allLabel = sel.dataset.allLabel || (sel.options[0] ? sel.options[0].textContent : 'Tất cả');
      sel.dataset.allLabel = allLabel;
      const compact = sel.classList.contains('col-filter');
      sel.innerHTML = [`<option value="">${esc(allLabel)}</option>`, ...list.map((t) => {
        const name = typeof t === 'string' ? t : t.name;
        const count = !compact && t && t.count != null ? ` (${fmtNumber(t.count)})` : '';
        return `<option value="${esc(name)}">${esc(name)}${count}</option>`;
      })].join('');
      sel.value = state.filters[key] || '';
      if (sel.value !== (state.filters[key] || '')) state.filters[key] = '';
    });
    const fillList = (id, items, defaults = []) => {
      const names = [...new Set([...items.map((t) => (typeof t === 'string' ? t : t.name)), ...defaults])];
      $(id).innerHTML = names.map((n) => `<option value="${esc(n)}"></option>`).join('');
    };
    fillList('dlOfficeTypes', lists.types);
    fillList('dlOfficeBooks', lists.books);
    fillList('dlOfficeUrgencies', lists.urgencies, ['Thường', 'Khẩn', 'Thượng khẩn', 'Hỏa tốc']);
  }

  function buildQuery({ paged = true } = {}) {
    const p = new URLSearchParams();
    FILTER_KEYS.forEach((k) => { if (state.filters[k]) p.set(k, state.filters[k]); });
    if (state.sort) { p.set('sort', state.sort); p.set('order', state.order); }
    if (paged) {
      p.set('page', state.page);
      p.set('pageSize', state.pageSize);
    }
    return p.toString();
  }

  async function loadTable() {
    const seq = ++state.reqSeq;
    const body = $('officeTableBody');
    body.classList.add('is-loading');
    if (state.filters.q) {
      showSearchInfo('<span class="search-info-pending">Đang phân tích câu hỏi...</span>');
    }
    try {
      const res = await apiRequest('/api/office-docs?' + buildQuery());
      if (seq !== state.reqSeq) return; // bỏ kết quả cũ khi người dùng gõ tiếp
      state.lastResult = res;
      renderTable(res);
      renderSearchInfo(res);
      renderPagination(res);
      renderSortState(res);
    } catch (e) {
      if (seq !== state.reqSeq) return;
      body.innerHTML = emptyRow(9, 'Không tải được sổ công văn: ' + e.message);
      hideSearchInfo();
    } finally {
      if (seq === state.reqSeq) body.classList.remove('is-loading');
    }
  }

  function renderTable(res) {
    const body = $('officeTableBody');
    const items = res.items || [];
    if (!items.length) {
      const hasFilter = Object.values(state.filters).some(Boolean);
      body.innerHTML = emptyRow(9, hasFilter
        ? 'Không tìm thấy văn bản phù hợp. Thử bỏ bớt bộ lọc hoặc diễn đạt khác.'
        : 'Sổ công văn chưa có dữ liệu. Quản trị viên cần nhập file Excel ở mục "Nhập Sổ Excel".');
      return;
    }
    const offset = (res.page - 1) * res.pageSize;
    body.innerHTML = items.map((d, i) => {
      const received = d.direction === 'den' && d.thoi_gian_nhan && d.thoi_gian_nhan !== d.ngay_van_ban
        ? `<span class="cell-sub">Nhận ${fmtDate(d.thoi_gian_nhan)}</span>` : '';
      return `
        <tr class="office-row" data-id="${Number(d.id)}" tabindex="0" aria-label="Xem chi tiết ${esc(d.so_ky_hieu || 'văn bản')}">
          <td style="text-align: center;" class="cell-muted">${offset + i + 1}</td>
          <td><span class="doc-number">${esc(d.so_ky_hieu || '--')}</span></td>
          <td class="cell-date">${fmtDate(d.ngay_van_ban)}${received}</td>
          <td>${dirBadge(d.direction)}</td>
          <td>${d.the_loai ? `<span class="type-chip">${esc(d.the_loai)}</span>` : '<span class="cell-muted">--</span>'}</td>
          <td class="cell-summary"><span class="clamp-2" title="${esc(d.trich_yeu || '')}">${esc(d.trich_yeu || '--')}</span></td>
          <td class="cell-signer">${esc(d.nguoi_ky || '--')}</td>
          <td><span class="source-id">${esc(d.source_id || '--')}</span></td>
          <td class="sticky-action-col" style="text-align: center;">
            <button type="button" class="action-icon-btn btn-icon-view" data-view-id="${Number(d.id)}" aria-label="Xem chi tiết">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
            </button>
          </td>
        </tr>`;
    }).join('');
  }

  function showSearchInfo(html) {
    const el = $('officeSearchInfo');
    el.innerHTML = html;
    el.classList.remove('hidden');
  }

  function hideSearchInfo() {
    $('officeSearchInfo').classList.add('hidden');
  }

  function renderSearchInfo(res) {
    if (res.mode !== 'search') { hideSearchInfo(); return; }
    const chips = [];
    const pf = (res.parsed && res.parsed.filters) || {};
    if (pf.direction) chips.push(`Sổ ${DIRECTION_LABEL[pf.direction] ? DIRECTION_LABEL[pf.direction].toLowerCase() : ''}`);
    if (pf.theLoai) chips.push(pf.theLoai);
    if (pf.soKyHieu) chips.push(`Số ${pf.soKyHieu}`);
    if (pf.sourceId) chips.push(`Mã ${pf.sourceId}`);
    if (pf.dateLabel) chips.push(pf.dateLabel);
    else if (pf.dateFrom || pf.dateTo) chips.push(`${pf.dateFrom ? fmtDate(pf.dateFrom) : '...'} - ${pf.dateTo ? fmtDate(pf.dateTo) : '...'}`);
    if (pf.nguoiKy) chips.push(`Ký: ${pf.nguoiKy}`);
    ((res.parsed && res.parsed.keywords) || []).slice(0, 6).forEach((k) => chips.push(`"${k}"`));

    const headline = res.usedRelated
      ? (res.total
        ? `<span class="info-tone-warn">Không có văn bản khớp chính xác.</span> Gợi ý <b>${fmtNumber(res.total)}</b> văn bản gần giống, đồng chí xem thử có đúng không.`
        : '<span class="info-tone-warn">Không tìm thấy văn bản phù hợp.</span> Thử bỏ bớt từ khóa hoặc bộ lọc.')
      : `Tìm thấy <b>${fmtNumber(res.total)}</b> văn bản khớp câu hỏi.`;

    const ai = res.aiUsed
      ? '<span class="info-ai-badge" title="Câu hỏi được AI viết lại cho chuẩn (sai chính tả, viết tắt, không dấu)">AI đã hiểu lại câu hỏi</span>' : '';
    const sortHint = state.sort && state.sort !== 'relevance'
      ? '<button type="button" class="info-link" data-action="sort-relevance">Sắp xếp theo độ liên quan</button>' : '';

    showSearchInfo(`
      <div class="search-info-main">${headline} ${ai}</div>
      ${chips.length ? `<div class="search-info-chips"><span class="cell-muted">Hệ thống hiểu:</span>${chips.map((c) => `<span class="info-chip">${esc(c)}</span>`).join('')}</div>` : ''}
      ${sortHint}`);
  }

  function renderPagination(res) {
    renderPager(res, $('officePaginationInfo'), $('officePaginationButtons'));
  }

  /** Thanh phân trang dùng chung (Tra cứu + Quản lý văn bản) */
  function renderPager(res, infoEl, box) {
    const total = res.total || 0;
    const page = res.page || 1;
    const pages = res.pages || 1;
    const from = total ? (page - 1) * res.pageSize + 1 : 0;
    const to = Math.min(page * res.pageSize, total);
    infoEl.textContent = total ? `Hiển thị ${fmtNumber(from)}-${fmtNumber(to)} / ${fmtNumber(total)} văn bản` : '0 văn bản';

    if (pages <= 1) { box.innerHTML = ''; return; }
    const btn = (p, label, opts = {}) =>
      `<button type="button" class="page-btn ${opts.active ? 'active' : ''}" data-p="${p}" ${opts.disabled ? 'disabled' : ''} ${opts.title ? `title="${opts.title}" aria-label="${opts.title}"` : ''}>${label}</button>`;
    const chevron = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="${d}"></polyline></svg>`;
    let html = btn(page - 1, chevron('15 18 9 12 15 6'), { disabled: page === 1, title: 'Trang trước' });
    const start = Math.max(1, Math.min(page - 2, pages - 4));
    const end = Math.min(pages, start + 4);
    if (start > 1) html += btn(1, '1') + (start > 2 ? '<span class="page-ellipsis">...</span>' : '');
    for (let p = start; p <= end; p++) html += btn(p, String(p), { active: p === page });
    if (end < pages) html += (end < pages - 1 ? '<span class="page-ellipsis">...</span>' : '') + btn(pages, String(pages));
    html += btn(page + 1, chevron('9 18 15 12 9 6'), { disabled: page === pages, title: 'Trang tiếp' });
    box.innerHTML = html;
  }

  function renderSortState(res) {
    const activeSort = state.sort || (res.mode === 'search' ? 'relevance' : 'ngay');
    const activeOrder = state.sort ? state.order : 'desc';
    document.querySelectorAll('#officeTable th.sortable').forEach((th) => {
      const on = th.dataset.sort === activeSort;
      th.classList.toggle('sort-asc', on && activeOrder === 'asc');
      th.classList.toggle('sort-desc', on && activeOrder === 'desc');
      th.setAttribute('aria-sort', on ? (activeOrder === 'asc' ? 'ascending' : 'descending') : 'none');
    });
  }

  /** Ghi trạng thái bộ lọc ra mọi nơi nhập (trừ phần tử đang gõ để không mất con trỏ) */
  function syncFilterInputs(except) {
    const f = state.filters;
    document.querySelectorAll('#view-office [data-filter]').forEach((el) => {
      if (el === except) return;
      const key = el.dataset.filter;
      el.value = key === 'docDate'
        ? (f.docDateFrom && f.docDateFrom === f.docDateTo ? f.docDateFrom : '')
        : (f[key] || '');
      el.classList.toggle('has-value', !!el.value);
    });
    if (except) except.classList.toggle('has-value', !!except.value);
    if (except !== $('officeSearchInput')) $('officeSearchInput').value = f.q;

    document.querySelectorAll('#officeDirectionTabs .segmented-btn').forEach((b) => {
      const on = b.dataset.direction === f.direction;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });

    const advCount = FILTER_KEYS.filter((k) => k !== 'q' && k !== 'direction' && f[k]).length;
    const badge = $('officeAdvCount');
    badge.textContent = advCount;
    badge.classList.toggle('hidden', !advCount);
    const colCount = COLUMN_ROW_KEYS.filter((k) => f[k]).length;
    $('btnOfficeClearColumns').classList.toggle('is-active', colCount > 0);
    $('btnOfficeFilterToggle').classList.toggle('has-filters', colCount > 0);
  }

  function applyFilters({ except } = {}) {
    state.page = 1;
    syncFilterInputs(except);
    loadTable();
  }

  function setDirection(direction) {
    state.filters.direction = direction;
    applyFilters();
  }

  function resetFilters() {
    state.filters = emptyFilters();
    state.sort = null;
    state.order = 'desc';
    applyFilters();
  }

  function setAdvancedOpen(open) {
    const panel = $('officeAdvancedPanel');
    panel.hidden = !open;
    $('btnOfficeAdvanced').setAttribute('aria-expanded', open ? 'true' : 'false');
    $('btnOfficeAdvanced').classList.toggle('active', open);
    if (open) {
      syncFilterInputs();
      const first = panel.querySelector('[data-filter]');
      if (first) first.focus();
    }
  }

  function setFilterRowVisible(visible, persist = true) {
    $('officeFilterRow').classList.toggle('hidden', !visible);
    $('btnOfficeFilterToggle').setAttribute('aria-pressed', visible ? 'true' : 'false');
    $('btnOfficeFilterToggle').classList.toggle('active', visible);
    if (persist) { try { localStorage.setItem(FILTER_ROW_PREF, visible ? '1' : '0'); } catch (e) { /* chế độ riêng tư */ } }
  }

  /** Cập nhật state từ một ô trên hàng lọc cột */
  function readColumnInput(el) {
    const key = el.dataset.filter;
    const value = el.value.trim();
    if (key === 'docDate') {
      state.filters.docDateFrom = value;
      state.filters.docDateTo = value;
    } else {
      state.filters[key] = value;
    }
  }

  function contentDispositionName(header) {
    const m = /filename="?([^";]+)"?/i.exec(header || '');
    return m ? m[1] : 'so-cong-van.xlsx';
  }

  async function exportExcel(btn) {
    if (state.exporting) return;
    state.exporting = true;
    const label = btn.querySelector('span');
    const original = label ? label.textContent : '';
    btn.disabled = true;
    btn.classList.add('is-busy');
    if (label) label.textContent = 'Đang xuất...';
    try {
      const res = await fetch('/api/office-docs/export?' + buildQuery({ paged: false }), { credentials: 'same-origin' });
      if (!res.ok) {
        let msg = `Xuất thất bại (HTTP ${res.status})`;
        try { msg = (await res.json()).error || msg; } catch (e) { /* không phải JSON */ }
        throw new Error(res.status === 401 ? 'Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.' : msg);
      }
      const rows = parseInt(res.headers.get('X-Export-Rows'), 10) || 0;
      const total = parseInt(res.headers.get('X-Export-Total'), 10) || rows;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = contentDispositionName(res.headers.get('Content-Disposition'));
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      if (!rows) showToast('Danh sách đang lọc trống, file chỉ có tiêu đề.', 'warning');
      else if (total > rows) showToast(`Đã xuất ${fmtNumber(rows)}/${fmtNumber(total)} văn bản (giới hạn mỗi lần). Hãy lọc hẹp hơn để xuất phần còn lại.`, 'warning');
      else showToast(`Đã xuất ${fmtNumber(rows)} văn bản ra Excel.`, 'success');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      state.exporting = false;
      btn.disabled = false;
      btn.classList.remove('is-busy');
      if (label) label.textContent = original;
    }
  }

  function bindTableEvents() {
    // Ô tìm tự do: chỉ chạy khi Enter / bấm kính lúp (tránh gọi AI theo từng lần gõ)
    $('officeSearchForm').addEventListener('submit', (e) => {
      e.preventDefault();
      state.filters.q = $('officeSearchInput').value.trim();
      state.sort = null;
      applyFilters({ except: $('officeSearchInput') });
    });
    $('officeSearchInput').addEventListener('input', (e) => {
      if (!e.target.value.trim() && state.filters.q) {
        state.filters.q = '';
        applyFilters({ except: e.target });
      }
    });

    $('officeDirectionTabs').addEventListener('click', (e) => {
      const b = e.target.closest('.segmented-btn');
      if (b) setDirection(b.dataset.direction || '');
    });

    // Thẻ sổ trên trang Tổng quan: mở Tra cứu với đúng sổ đó
    ['officeStatDen', 'officeStatDi'].forEach((id) => {
      const el = $(id);
      const open = () => {
        state.filters = { ...emptyFilters(), direction: el.dataset.direction };
        state.sort = null;
        state.page = 1;
        App.switchView('view-office');
      };
      el.addEventListener('click', open);
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    });

    // Hàng lọc theo cột: ô chữ áp dụng sau 400ms ngừng gõ, ô chọn/ngày áp dụng ngay
    const filterRow = $('officeFilterRow');
    const onColumnText = debounce((el) => applyFilters({ except: el }), 400);
    filterRow.addEventListener('input', (e) => {
      const el = e.target.closest('input[type="text"].col-filter');
      if (el) { readColumnInput(el); onColumnText(el); }
    });
    filterRow.addEventListener('change', (e) => {
      const el = e.target.closest('select.col-filter, input[type="date"].col-filter');
      if (el) { readColumnInput(el); applyFilters({ except: el }); }
    });
    filterRow.addEventListener('keydown', (e) => {
      const el = e.target.closest('input[type="text"].col-filter');
      if (el && e.key === 'Enter') { e.preventDefault(); readColumnInput(el); applyFilters({ except: el }); }
    });
    $('btnOfficeClearColumns').addEventListener('click', () => {
      COLUMN_ROW_KEYS.forEach((k) => { state.filters[k] = ''; });
      applyFilters();
    });
    $('btnOfficeFilterToggle').addEventListener('click', () => {
      setFilterRowVisible($('officeFilterRow').classList.contains('hidden'));
    });
    let rowPref = '1';
    try { rowPref = localStorage.getItem(FILTER_ROW_PREF) || '1'; } catch (e) { /* chế độ riêng tư */ }
    setFilterRowVisible(rowPref !== '0', false);

    // Khung tìm kiếm nâng cao: áp dụng khi bấm Tìm kiếm / Enter
    $('btnOfficeAdvanced').addEventListener('click', () => setAdvancedOpen($('officeAdvancedPanel').hidden));
    $('btnOfficeAdvCollapse').addEventListener('click', () => setAdvancedOpen(false));
    $('btnOfficeAdvHide').addEventListener('click', () => setAdvancedOpen(false));
    $('officeAdvancedForm').addEventListener('submit', (e) => {
      e.preventDefault();
      e.currentTarget.querySelectorAll('[data-filter]').forEach((el) => { state.filters[el.dataset.filter] = el.value.trim(); });
      const f = state.filters;
      const swapped = [['docDateFrom', 'docDateTo'], ['receivedFrom', 'receivedTo'], ['deadlineFrom', 'deadlineTo']]
        .some(([a, b]) => f[a] && f[b] && f[a] > f[b]);
      if (swapped) { showToast('Ngày "từ" đang lớn hơn ngày "đến". Vui lòng kiểm tra lại.', 'warning'); return; }
      applyFilters();
    });
    $('officeAdvancedPanel').addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { setAdvancedOpen(false); $('btnOfficeAdvanced').focus(); }
    });
    $('btnOfficeReset').addEventListener('click', resetFilters);
    $('btnOfficeExport').addEventListener('click', (e) => exportExcel(e.currentTarget));
    $('btnOfficeAdvExport').addEventListener('click', (e) => exportExcel(e.currentTarget));

    $('officePageSize').addEventListener('change', (e) => { state.pageSize = parseInt(e.target.value, 10) || 20; state.page = 1; loadTable(); });

    $('officePaginationButtons').addEventListener('click', (e) => {
      const b = e.target.closest('.page-btn');
      if (!b || b.disabled) return;
      state.page = parseInt(b.dataset.p, 10) || 1;
      loadTable();
      $('officeTable').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    document.querySelectorAll('#officeTable th.sortable').forEach((th) => {
      th.tabIndex = 0;
      const sortBy = () => {
        const key = th.dataset.sort;
        if (state.sort === key) state.order = state.order === 'asc' ? 'desc' : 'asc';
        else { state.sort = key; state.order = key === 'ngay' ? 'desc' : 'asc'; }
        state.page = 1;
        loadTable();
      };
      th.addEventListener('click', sortBy);
      th.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sortBy(); } });
    });

    $('officeSearchInfo').addEventListener('click', (e) => {
      if (e.target.closest('[data-action="sort-relevance"]')) { state.sort = null; state.page = 1; loadTable(); }
    });

    const body = $('officeTableBody');
    body.addEventListener('click', (e) => {
      const row = e.target.closest('tr.office-row');
      if (row) openDocModal(parseInt(row.dataset.id, 10));
    });
    body.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const row = e.target.closest('tr.office-row');
      if (row) openDocModal(parseInt(row.dataset.id, 10));
    });
  }

  // ============================================================
  // MODAL CHI TIẾT VĂN BẢN
  // ============================================================
  function field(label, value, opts = {}) {
    if (value == null || value === '' || (Array.isArray(value) && !value.length)) return '';
    const content = opts.html ? value : esc(value);
    return `<div class="od-field ${opts.wide ? 'od-wide' : ''}"><span class="od-label">${esc(label)}</span><span class="od-value ${opts.mono ? 'mono' : ''}">${content}</span></div>`;
  }

  function renderDocBody(d) {
    const isDen = d.direction === 'den';
    const files = Array.isArray(d.file_names) && d.file_names.length
      ? `<div class="od-files">${d.file_names.map((f) => `<span class="od-file"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>${esc(f)}</span>`).join('')}</div>`
      : '';
    const internal = (d.y_kien_chuyen || d.y_kien_chi_dao)
      ? `<div class="od-internal">
           <div class="od-internal-head">Thông tin nội bộ <span>Chỉ quản trị viên thấy, không gửi qua Zalo</span></div>
           ${field('Ý kiến chuyển', d.y_kien_chuyen, { wide: true })}
           ${field('Ý kiến chỉ đạo', d.y_kien_chi_dao, { wide: true })}
         </div>` : '';
    const pages = [d.so_trang ? `${d.so_trang} trang` : '', d.so_ban ? `${d.so_ban} bản` : ''].filter(Boolean).join(' · ');

    return `
      <div class="od-summary">${esc(d.trich_yeu || 'Không có trích yếu')}</div>
      <div class="od-grid">
        ${field('Số / Ký hiệu', d.so_ky_hieu, { mono: true })}
        ${field('Ngày văn bản', d.ngay_van_ban ? fmtDate(d.ngay_van_ban) : '')}
        ${isDen ? field('Ngày nhận', d.thoi_gian_nhan ? fmtDate(d.thoi_gian_nhan) : '') : ''}
        ${field('Thể loại', d.the_loai)}
        ${field('Người ký', d.nguoi_ky)}
        ${isDen ? field('Nơi gửi / Người gửi', d.nguoi_gui) : field('Người trình', d.nguoi_trinh)}
        ${!isDen ? field('Số đăng ký', d.so_dang_ky) : ''}
        ${!isDen ? field('Trạng thái', d.trang_thai_phat_hanh) : ''}
        ${field('Độ khẩn', d.do_khan)}
        ${isDen ? field('Hạn xử lý', d.han_xu_ly ? fmtDate(d.han_xu_ly) : '') : ''}
        ${field('Sổ văn bản', d.so_van_ban)}
        ${field('Số trang / bản', pages)}
        ${!isDen ? field('Nơi nhận', d.noi_nhan, { wide: true }) : ''}
        ${files ? field('File lưu tại Văn thư', files, { wide: true, html: true }) : ''}
      </div>
      ${internal}
      <div class="od-contact">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
        <div>Để nhận bản gốc, liên hệ <b>Văn thư ${esc(state.unitName)}</b> và cung cấp <b>Mã văn bản <span class="mono">${esc(d.source_id || '--')}</span></b>${d.so_ky_hieu ? ` (số ${esc(d.so_ky_hieu)})` : ''}.</div>
      </div>`;
  }

  async function openDocModal(id) {
    if (!Number.isFinite(id)) return;
    const modal = $('officeDocModal');
    state.lastFocus = document.activeElement;
    $('officeDocCode').textContent = '...';
    $('officeDocTitle').textContent = 'Đang tải văn bản';
    $('officeDocDirBadge').innerHTML = '';
    $('officeDocBody').innerHTML = '<div class="od-loading"><span class="spinner-dot"></span><span class="spinner-dot"></span><span class="spinner-dot"></span></div>';
    modal.classList.add('active');
    $('btnCloseOfficeDocModal').focus();
    try {
      const res = await apiRequest(`/api/office-docs/${id}`);
      const d = res.doc;
      if (res.unitName) setUnitName(res.unitName);
      state.currentDoc = d;
      $('officeDocCode').textContent = d.source_id ? `Mã ${d.source_id}` : '--';
      $('officeDocTitle').textContent = d.so_ky_hieu || (d.the_loai ? d.the_loai : 'Chi tiết văn bản');
      $('officeDocDirBadge').innerHTML = dirBadge(d.direction);
      $('officeDocBody').innerHTML = renderDocBody(d);
    } catch (e) {
      $('officeDocBody').innerHTML = `<p class="cell-muted">Không tải được văn bản: ${esc(e.message)}</p>`;
    }
  }

  function closeDocModal() {
    $('officeDocModal').classList.remove('active');
    state.currentDoc = null;
    if (state.lastFocus && state.lastFocus.focus) state.lastFocus.focus();
  }

  function docToText(d) {
    const lines = [
      `${d.direction === 'den' ? 'Văn bản đến' : 'Văn bản đi'}: ${d.so_ky_hieu || '--'}`,
      `Ngày: ${fmtDate(d.ngay_van_ban)}`,
      d.the_loai ? `Thể loại: ${d.the_loai}` : '',
      `Trích yếu: ${d.trich_yeu || '--'}`,
      d.nguoi_ky ? `Người ký: ${d.nguoi_ky}` : '',
      `Mã văn bản: ${d.source_id || '--'}`,
      `Liên hệ Văn thư ${state.unitName} để nhận bản gốc.`,
    ];
    return lines.filter(Boolean).join('\n');
  }

  function bindModalEvents() {
    const modal = $('officeDocModal');
    $('btnCloseOfficeDocModal').addEventListener('click', closeDocModal);
    $('btnCloseOfficeDocFooter').addEventListener('click', closeDocModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeDocModal(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.classList.contains('active')) closeDocModal();
    });
    $('btnCopyOfficeDoc').addEventListener('click', () => {
      if (state.currentDoc) copyToClipboard(docToText(state.currentDoc), 'Đã sao chép thông tin văn bản.');
    });
  }

  // ============================================================
  // HỎI NHƯ TRÊN ZALO
  // ============================================================
  function appendBubble(role, text, metaHtml) {
    const log = $('officeChatLog');
    const el = document.createElement('div');
    el.className = `chat-bubble chat-${role}`;
    el.innerHTML = `<div class="chat-text">${esc(text)}</div>${metaHtml ? `<div class="chat-meta">${metaHtml}</div>` : ''}`;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return el;
  }

  async function sendChat(text) {
    if (state.chatBusy || !text) return;
    state.chatBusy = true;
    const btn = $('btnOfficeChatSend');
    btn.disabled = true;
    appendBubble('user', text);
    const typing = document.createElement('div');
    typing.className = 'chat-bubble chat-bot chat-typing';
    typing.innerHTML = '<span class="spinner-dot"></span><span class="spinner-dot"></span><span class="spinner-dot"></span>';
    $('officeChatLog').appendChild(typing);
    $('officeChatLog').scrollTop = $('officeChatLog').scrollHeight;
    try {
      const res = await apiRequest('/api/office-docs/test-query', { method: 'POST', body: JSON.stringify({ text }) });
      typing.remove();
      const meta = [`${fmtNumber(res.latencyMs)} ms`];
      if (res.meta && res.meta.aiUsed) meta.push(res.meta.aiFromCache ? 'AI (bộ nhớ đệm)' : 'AI hiểu lại câu hỏi');
      appendBubble('bot', res.answer || '(Không có trả lời)', meta.map((m) => `<span>${esc(m)}</span>`).join(''));
    } catch (e) {
      typing.remove();
      appendBubble('bot', 'Lỗi: ' + e.message);
    } finally {
      state.chatBusy = false;
      btn.disabled = false;
      $('officeChatInput').focus();
    }
  }

  function resetChatLog() {
    $('officeChatLog').innerHTML = '';
    appendBubble('bot', 'Chào đồng chí. Hãy nhập câu hỏi về sổ công văn đến/đi, ví dụ: "văn bản đến tuần này".');
  }

  function bindChatEvents() {
    $('officeChatForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = $('officeChatInput');
      const text = input.value.trim();
      input.value = '';
      sendChat(text);
    });
    $('btnOfficeChatReset').addEventListener('click', async () => {
      try { await apiRequest('/api/office-docs/test-query', { method: 'POST', body: JSON.stringify({ text: '/moi' }) }); } catch (e) { /* bỏ qua */ }
      resetChatLog();
    });
    $('officeChatSuggestions').addEventListener('click', (e) => {
      const b = e.target.closest('.chat-suggestion');
      if (b) sendChat(b.dataset.q);
    });
  }

  // ============================================================
  // NHẬP EXCEL (ADMIN)
  // ============================================================
  function readFileBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
      reader.onerror = () => reject(new Error('Không đọc được file.'));
      reader.readAsDataURL(file);
    });
  }

  function selectImportFile(file) {
    state.importPreviewOk = false;
    $('btnOfficeCommit').disabled = true;
    $('officeImportReport').classList.add('hidden');
    if (!file) return;
    if (!/\.(xls|xlsx)$/i.test(file.name)) {
      showToast('Chỉ nhận file .xls hoặc .xlsx.', 'warning');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      showToast('File vượt quá 3MB. Hãy xuất theo từng năm hoặc từng quý.', 'warning');
      return;
    }
    state.importFile = file;
    $('officeFileName').textContent = `${file.name} (${(file.size / 1024).toFixed(0)} KB)`;
    $('officeDropzone').classList.add('has-file');
    $('btnOfficePreview').disabled = false;
  }

  function renderImportReport(r) {
    const el = $('officeImportReport');
    const dirText = r.direction === 'den' ? 'Sổ văn bản đến' : 'Sổ văn bản đi';
    const stat = (label, value, tone) => `<div class="ir-stat ${tone || ''}"><span class="ir-value">${fmtNumber(value)}</span><span class="ir-label">${label}</span></div>`;
    const skipped = r.skipped || {};
    const changes = r.dryRun
      ? `${stat('Sẽ thêm mới', r.inserted, 'tone-good')}${stat('Sẽ cập nhật', r.updated, 'tone-info')}${stat('Không đổi', r.unchanged)}`
      : `${stat('Đã thêm mới', r.inserted, 'tone-good')}${stat('Đã cập nhật', r.updated, 'tone-info')}${stat('Không đổi', r.unchanged)}`;
    const errors = (r.errors || []).length
      ? `<details class="ir-errors"><summary>${fmtNumber(r.errorCount)} dòng lỗi, bấm để xem</summary><ul>${r.errors.map((e) => `<li>${esc(typeof e === 'string' ? e : `Dòng ${e.row || '?'}: ${e.message || e.error || JSON.stringify(e)}`)}</li>`).join('')}</ul></details>` : '';
    const sample = (r.sample || []).length
      ? `<div class="ir-sample"><div class="panel-subhead">Xem trước 5 dòng đầu</div>${r.sample.map((s) => `<div class="ir-sample-row"><span class="doc-number">${esc(s.so_ky_hieu || '--')}</span><span class="cell-muted">${fmtDate(s.ngay_van_ban)}</span><span class="clamp-1">${esc(s.trich_yeu || '')}</span></div>`).join('')}</div>` : '';

    el.innerHTML = `
      <div class="ir-head ${r.dryRun ? 'is-preview' : 'is-done'}">
        <b>${r.dryRun ? 'Kết quả kiểm tra (chưa ghi)' : 'Đã ghi vào hệ thống'}</b>
        <span>${dirText}${r.reportDate ? ` · chốt ngày ${fmtDate(r.reportDate)}` : ''} · ${fmtNumber(r.totalRows)} dòng trong file</span>
      </div>
      <div class="ir-stats">
        ${stat('Hợp lệ', r.accepted)}
        ${changes}
        ${stat('Bỏ qua (mật)', skipped.secret, 'tone-warn')}
        ${stat('Bỏ qua (chưa phát hành)', skipped.unpublished, 'tone-warn')}
      </div>
      ${errors}
      ${sample}`;
    el.classList.remove('hidden');
  }

  async function runImport(dryRun) {
    if (!state.importFile) return;
    const btn = dryRun ? $('btnOfficePreview') : $('btnOfficeCommit');
    if (!dryRun) {
      const ok = await showConfirmDialog({
        title: 'Ghi sổ công văn',
        message: `Ghi dữ liệu từ file <b>${esc(state.importFile.name)}</b> vào hệ thống? Văn bản trùng Mã sẽ được cập nhật, không tạo bản sao.`,
        type: 'info',
        confirmText: 'Ghi vào hệ thống',
        cancelText: 'Để sau',
      });
      if (!ok) return;
    }
    setBusy(btn, true, dryRun ? 'Đang kiểm tra...' : 'Đang ghi...');
    try {
      const contentBase64 = await readFileBase64(state.importFile);
      const res = await apiRequest('/api/office-docs/import', {
        method: 'POST',
        body: JSON.stringify({ fileName: state.importFile.name, contentBase64, direction: $('officeImportDirection').value, dryRun }),
      });
      renderImportReport(res);
      if (dryRun) {
        state.importPreviewOk = res.accepted > 0;
        $('btnOfficeCommit').disabled = !state.importPreviewOk;
        if (!state.importPreviewOk) showToast('File không có văn bản hợp lệ để ghi.', 'warning');
      } else {
        showToast(`Đã nhập sổ: ${fmtNumber(res.inserted)} mới, ${fmtNumber(res.updated)} cập nhật.`, 'success');
        state.importFile = null;
        state.importPreviewOk = false;
        $('officeFileInput').value = '';
        $('officeFileName').textContent = 'Kéo thả file vào đây hoặc bấm để chọn';
        $('officeDropzone').classList.remove('has-file');
        $('btnOfficePreview').disabled = true;
        $('btnOfficeCommit').disabled = true;
        loadImports();
      }
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setBusy(btn, false);
      if (!dryRun) btn.disabled = true;
      else btn.disabled = !state.importFile;
    }
  }

  function bindImportEvents() {
    const zone = $('officeDropzone');
    $('officeFileInput').addEventListener('change', (e) => selectImportFile(e.target.files[0]));
    ['dragenter', 'dragover'].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add('drag-over'); }));
    ['dragleave', 'drop'].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.remove('drag-over'); }));
    zone.addEventListener('drop', (e) => selectImportFile(e.dataTransfer.files[0]));
    zone.tabIndex = 0;
    zone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('officeFileInput').click(); } });
    $('officeImportDirection').addEventListener('change', () => { state.importPreviewOk = false; $('btnOfficeCommit').disabled = true; });
    $('btnOfficePreview').addEventListener('click', () => runImport(true));
    $('btnOfficeCommit').addEventListener('click', () => runImport(false));
  }

  async function loadImports() {
    const body = $('officeImportsBody');
    try {
      const res = await apiRequest('/api/office-docs/imports');
      const rows = res.imports || [];
      body.innerHTML = rows.length ? rows.map((r) => `
        <tr>
          <td class="cell-date">${fmtDateTime(r.created_at)}</td>
          <td>${dirBadge(r.direction)}</td>
          <td class="clamp-cell" title="${esc(r.file_name || '')}">${esc(r.file_name || '--')}</td>
          <td>${fmtDate(r.report_date)}</td>
          <td class="num tone-good">${fmtNumber(r.inserted)}</td>
          <td class="num">${fmtNumber(r.updated)}</td>
          <td class="num cell-muted">${fmtNumber(r.unchanged)}</td>
          <td class="num">${fmtNumber((r.skipped_secret || 0) + (r.skipped_unpublished || 0))}</td>
          <td>${esc(r.imported_by_name || '--')}</td>
        </tr>`).join('') : emptyRow(9, 'Chưa có lần nhập nào.');
    } catch (e) {
      body.innerHTML = emptyRow(9, 'Không tải được lịch sử nhập: ' + e.message);
    }
  }

  // ============================================================
  // MÃ KÍCH HOẠT + QUYỀN ZALO (ADMIN)
  // ============================================================
  function codeStatus(c) {
    if (c.used_at) return `<span class="status-badge badge-active">Đã dùng</span>${c.used_by_name ? `<span class="cell-sub">${esc(c.used_by_name)}</span>` : ''}`;
    if (c.is_active) return '<span class="status-badge status-pending">Chờ kích hoạt</span>';
    return '<span class="status-badge badge-expired">Hết hạn / thu hồi</span>';
  }

  async function loadCodes() {
    const body = $('officeCodesBody');
    try {
      const res = await apiRequest('/api/zalo-activation-codes');
      const rows = res.codes || [];
      body.innerHTML = rows.length ? rows.map((c) => `
        <tr>
          <td><b>${esc(c.staff_label || '--')}</b></td>
          <td>${esc(c.created_by_name || '--')}</td>
          <td class="cell-date">${fmtDateTime(c.used_at || c.expires_at)}</td>
          <td>${codeStatus(c)}</td>
          <td style="text-align: right;">${c.is_active ? `<button type="button" class="btn-text-danger" data-revoke="${Number(c.id)}" data-label="${esc(c.staff_label || '')}">Thu hồi</button>` : ''}</td>
        </tr>`).join('') : emptyRow(5, 'Chưa có mã nào.');
    } catch (e) {
      body.innerHTML = emptyRow(5, 'Không tải được danh sách mã: ' + e.message);
    }
  }

  function revealCode(created) {
    const el = $('officeCodeReveal');
    const command = `/dangky ${created.code}`;
    el.innerHTML = `
      <div class="code-reveal-head">
        <span>Mã cho <b>${esc(created.staffLabel)}</b>, hết hạn ${fmtDateTime(created.expiresAt)}</span>
        <button type="button" class="btn-close-inline" data-action="hide-code" aria-label="Ẩn mã">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>
      <div class="code-reveal-value">
        <code>${esc(command)}</code>
        <button type="button" class="btn btn-primary" data-action="copy-code">Sao chép</button>
      </div>
      <p class="code-reveal-note">Mã chỉ hiển thị một lần. Gửi riêng cho cán bộ, cán bộ nhắn đúng nội dung trên cho bot Zalo để được cấp quyền.</p>`;
    el.dataset.command = command;
    el.classList.remove('hidden');
  }

  function bindCodeEvents() {
    $('officeCodeForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = $('officeCodeStaff');
      const staffLabel = input.value.trim();
      if (!staffLabel) return;
      const btn = $('btnOfficeCreateCode');
      setBusy(btn, true, 'Đang tạo...');
      try {
        const created = await apiRequest('/api/zalo-activation-codes', { method: 'POST', body: JSON.stringify({ staffLabel }) });
        revealCode(created);
        input.value = '';
        loadCodes();
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        setBusy(btn, false);
      }
    });

    $('officeCodeReveal').addEventListener('click', (e) => {
      const el = $('officeCodeReveal');
      if (e.target.closest('[data-action="copy-code"]')) copyToClipboard(el.dataset.command, 'Đã sao chép lệnh kích hoạt.');
      if (e.target.closest('[data-action="hide-code"]')) { el.classList.add('hidden'); el.innerHTML = ''; delete el.dataset.command; }
    });

    $('officeCodesBody').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-revoke]');
      if (!b) return;
      const ok = await showConfirmDialog({
        title: 'Thu hồi mã kích hoạt',
        message: `Thu hồi mã đã cấp cho <b>${esc(b.dataset.label || 'cán bộ')}</b>? Mã sẽ không dùng được nữa.`,
        type: 'warning',
        confirmText: 'Thu hồi',
      });
      if (!ok) return;
      try {
        const res = await apiRequest(`/api/zalo-activation-codes/${b.dataset.revoke}/revoke`, { method: 'POST' });
        showToast(res.message || 'Đã thu hồi mã.', 'success');
        loadCodes();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  function renderZaloUsers() {
    const body = $('officeZaloBody');
    const q = $('officeZaloSearch').value.trim().toLowerCase();
    const rows = state.zaloUsers.filter((u) => !q
      || String(u.display_name || '').toLowerCase().includes(q)
      || String(u.staff_label || '').toLowerCase().includes(q)
      || String(u.zalo_id || '').includes(q));
    if (!rows.length) {
      body.innerHTML = emptyRow(5, state.zaloUsers.length ? 'Không có tài khoản phù hợp.' : 'Chưa có ai nhắn tin cho bot.');
      return;
    }
    body.innerHTML = rows.map((u) => `
      <tr>
        <td><b>${esc(u.display_name || 'Người dùng Zalo')}</b>${u.is_blocked ? ' <span class="status-badge badge-expired">Đã chặn</span>' : ''}</td>
        <td>${esc(u.staff_label || '--')}</td>
        <td><span class="source-id">${esc(u.zalo_id)}</span></td>
        <td class="cell-date">${fmtDateTime(u.last_active)}</td>
        <td style="text-align: center;">
          <label class="switch" title="${u.can_lookup_office ? 'Đang được tra cứu' : 'Chưa được tra cứu'}">
            <input type="checkbox" data-zalo-id="${esc(u.zalo_id)}" ${u.can_lookup_office ? 'checked' : ''} aria-label="Quyền tra cứu của ${esc(u.display_name || u.zalo_id)}">
            <span class="switch-track"><span class="switch-thumb"></span></span>
          </label>
        </td>
      </tr>`).join('');
  }

  async function loadZaloUsers() {
    try {
      const res = await apiRequest('/api/zalo-users');
      state.zaloUsers = res.users || [];
      const count = $('zaloUsersCount');
      count.textContent = fmtNumber(state.zaloUsers.length);
      count.classList.toggle('hidden', !state.zaloUsers.length);
      renderZaloUsers();
    } catch (e) {
      $('officeZaloBody').innerHTML = emptyRow(5, 'Không tải được danh sách: ' + e.message);
    }
  }

  function bindZaloEvents() {
    $('officeZaloSearch').addEventListener('input', debounce(renderZaloUsers, 200));
    $('officeZaloBody').addEventListener('change', async (e) => {
      const input = e.target.closest('input[data-zalo-id]');
      if (!input) return;
      const zaloId = input.dataset.zaloId;
      const allowed = input.checked;
      const user = state.zaloUsers.find((u) => u.zalo_id === zaloId) || {};
      const name = esc(user.display_name || zaloId);
      const ok = await showConfirmDialog({
        title: allowed ? 'Cấp quyền tra cứu' : 'Thu hồi quyền tra cứu',
        message: allowed
          ? `Cho phép <b>${name}</b> tra cứu sổ công văn qua Zalo?`
          : `Thu hồi quyền tra cứu sổ công văn của <b>${name}</b>? Bộ nhớ hội thoại của người này cũng được xóa.`,
        type: allowed ? 'info' : 'warning',
        confirmText: allowed ? 'Cấp quyền' : 'Thu hồi',
      });
      if (!ok) { input.checked = !allowed; return; }
      input.disabled = true;
      try {
        const res = await apiRequest(`/api/zalo-users/${encodeURIComponent(zaloId)}/office-permission`, {
          method: 'POST',
          body: JSON.stringify({ allowed }),
        });
        user.can_lookup_office = allowed;
        showToast(res.message, 'success');
      } catch (err) {
        input.checked = !allowed;
        showToast(err.message, 'error');
      } finally {
        input.disabled = false;
      }
    });
  }

  // ============================================================
  // TAB (trang Cấp quyền Zalo): ARIA tabs, phím mũi tên để chuyển
  // ============================================================
  function bindTabs(listId) {
    const list = $(listId);
    const tabs = [...list.querySelectorAll('[role="tab"]')];
    const select = (tab, focus) => {
      tabs.forEach((t) => {
        const on = t === tab;
        t.classList.toggle('active', on);
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.tabIndex = on ? 0 : -1;
        $(t.dataset.panel).hidden = !on;
      });
      if (focus) tab.focus();
    };
    list.addEventListener('click', (e) => { const t = e.target.closest('[role="tab"]'); if (t) select(t); });
    list.addEventListener('keydown', (e) => {
      const i = tabs.indexOf(document.activeElement);
      if (i < 0 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault();
      const next = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      select(tabs[next], true);
    });
  }

  // ============================================================
  // QUẢN LÝ VĂN BẢN (ADMIN): danh sách + thêm / sửa / xóa
  // ============================================================
  const EDIT_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>';
  const DELETE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6M14 11v6"></path><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path></svg>';

  async function loadManage() {
    const m = state.manage;
    const seq = ++m.seq;
    const body = $('manageTableBody');
    body.classList.add('is-loading');
    const p = new URLSearchParams({ page: m.page, pageSize: m.pageSize });
    if (m.direction) p.set('direction', m.direction);
    if (m.keyword) p.set('keyword', m.keyword);
    try {
      const res = await apiRequest('/api/office-docs?' + p.toString());
      if (seq !== m.seq) return;
      // Xóa hết dòng ở trang cuối thì lùi về trang trước
      if (!res.items.length && m.page > 1 && res.total > 0) { m.page = res.pages; loadManage(); return; }
      renderManage(res);
      renderPager(res, $('managePaginationInfo'), $('managePaginationButtons'));
    } catch (e) {
      if (seq !== m.seq) return;
      body.innerHTML = emptyRow(8, 'Không tải được danh sách: ' + e.message);
    } finally {
      if (seq === m.seq) body.classList.remove('is-loading');
    }
  }

  function sourceCell(d) {
    if (d.edited_by_name) {
      return `<span class="source-chip is-manual">Sửa tay</span><span class="cell-sub">${esc(d.edited_by_name)} · ${fmtDateTime(d.edited_at)}</span>`;
    }
    return `<span class="source-chip">Từ file Excel</span><span class="cell-sub">${fmtDateTime(d.updated_at)}</span>`;
  }

  function renderManage(res) {
    const body = $('manageTableBody');
    const items = res.items || [];
    if (!items.length) {
      body.innerHTML = emptyRow(8, state.manage.keyword || state.manage.direction
        ? 'Không có văn bản phù hợp.'
        : 'Sổ chưa có văn bản. Bấm "Thêm văn bản" hoặc nhập file Excel.');
      return;
    }
    const offset = (res.page - 1) * res.pageSize;
    body.innerHTML = items.map((d, i) => `
      <tr data-id="${Number(d.id)}">
        <td style="text-align: center;" class="cell-muted">${offset + i + 1}</td>
        <td><span class="doc-number">${esc(d.so_ky_hieu || '--')}</span></td>
        <td class="cell-date">${fmtDate(d.ngay_van_ban)}</td>
        <td>${dirBadge(d.direction)}</td>
        <td class="cell-summary"><span class="clamp-2" title="${esc(d.trich_yeu || '')}">${esc(d.trich_yeu || '--')}</span></td>
        <td><span class="source-id">${esc(d.source_id || '--')}</span></td>
        <td class="cell-source">${sourceCell(d)}</td>
        <td class="sticky-action-col">
          <div class="row-actions">
            <button type="button" class="action-icon-btn btn-icon-edit" data-edit="${Number(d.id)}" aria-label="Sửa ${esc(d.so_ky_hieu || 'văn bản')}" title="Sửa">${EDIT_ICON}</button>
            <button type="button" class="action-icon-btn btn-icon-delete" data-delete="${Number(d.id)}" data-label="${esc(d.so_ky_hieu || d.source_id || '')}" aria-label="Xóa ${esc(d.so_ky_hieu || 'văn bản')}" title="Xóa">${DELETE_ICON}</button>
          </div>
        </td>
      </tr>`).join('');
  }

  // ---- Form thêm / sửa ----
  const editForm = () => $('officeEditForm');

  function setEditDirection(dir) {
    editForm().querySelectorAll('[data-dir]').forEach((s) => { s.hidden = s.dataset.dir !== dir; });
  }

  function clearEditErrors() {
    $('officeEditError').classList.add('hidden');
    $('officeEditError').textContent = '';
    editForm().querySelectorAll('.is-invalid').forEach((el) => { el.classList.remove('is-invalid'); el.removeAttribute('aria-invalid'); });
  }

  function showEditError(message, fieldNames = []) {
    const box = $('officeEditError');
    box.textContent = message;
    box.classList.remove('hidden');
    let first = null;
    fieldNames.forEach((name) => {
      const el = editForm().elements[name];
      const target = el && el.length && !el.tagName ? el[0] : el;
      if (!target) return;
      target.classList.add('is-invalid');
      target.setAttribute('aria-invalid', 'true');
      if (!first) first = target;
    });
    (first || box).focus && (first || box).focus();
  }

  async function openEditModal(id) {
    const form = editForm();
    state.editFocus = document.activeElement;
    form.reset();
    clearEditErrors();
    state.editing = null;
    const isEdit = Number.isFinite(id);
    $('officeEditTitle').textContent = isEdit ? 'Sửa văn bản' : 'Thêm văn bản vào sổ';
    $('officeEditBadge').innerHTML = '';
    form.querySelectorAll('input[name="direction"]').forEach((r) => { r.disabled = false; });
    form.elements.source_id.readOnly = false;
    $('btnSaveOfficeEdit').disabled = isEdit;
    $('officeEditModal').classList.add('active');

    if (!isEdit) {
      const dir = state.manage.direction || 'den';
      form.querySelector(`input[name="direction"][value="${dir}"]`).checked = true;
      setEditDirection(dir);
      form.elements.so_ky_hieu.focus();
      return;
    }
    try {
      const res = await apiRequest(`/api/office-docs/${id}`);
      const d = res.doc;
      state.editing = d;
      $('officeEditTitle').textContent = `Sửa văn bản ${d.so_ky_hieu || ''}`.trim();
      $('officeEditBadge').innerHTML = dirBadge(d.direction);
      form.querySelector(`input[name="direction"][value="${d.direction}"]`).checked = true;
      form.querySelectorAll('input[name="direction"]').forEach((r) => { r.disabled = true; });
      form.elements.source_id.readOnly = true;
      setEditDirection(d.direction);
      [...form.elements].forEach((el) => {
        if (!el.name || el.name === 'direction') return;
        if (el.name === 'file_names') el.value = (d.file_names || []).join('\n');
        else el.value = d[el.name] == null ? '' : d[el.name];
      });
      $('btnSaveOfficeEdit').disabled = false;
      form.elements.so_ky_hieu.focus();
    } catch (e) {
      showEditError('Không tải được văn bản: ' + e.message);
    }
  }

  function closeEditModal() {
    if (state.saving) return;
    $('officeEditModal').classList.remove('active');
    state.editing = null;
    if (state.editFocus && state.editFocus.focus) state.editFocus.focus();
  }

  function readEditForm() {
    const form = editForm();
    const data = {};
    [...form.elements].forEach((el) => {
      if (!el.name || el.disabled && el.name !== 'direction') return;
      if (el.type === 'radio') { if (el.checked) data[el.name] = el.value; return; }
      data[el.name] = el.value.trim();
    });
    if (state.editing) data.direction = state.editing.direction;
    return data;
  }

  async function saveEdit(e) {
    e.preventDefault();
    if (state.saving) return;
    clearEditErrors();
    const data = readEditForm();
    const missing = [['so_ky_hieu', 'Số, ký hiệu'], ['ngay_van_ban', 'Ngày văn bản'], ['trich_yeu', 'Trích yếu']].filter(([k]) => !data[k]);
    if (missing.length) {
      showEditError(`Vui lòng nhập: ${missing.map(([, l]) => l).join(', ')}.`, missing.map(([k]) => k));
      return;
    }
    if (data.direction === 'den' && data.thoi_gian_nhan && data.thoi_gian_nhan < data.ngay_van_ban) {
      showEditError('Ngày đến không được trước ngày văn bản.', ['thoi_gian_nhan']);
      return;
    }
    const btn = $('btnSaveOfficeEdit');
    state.saving = true;
    setBusy(btn, true, 'Đang lưu...');
    try {
      const res = state.editing
        ? await apiRequest(`/api/office-docs/${state.editing.id}`, { method: 'PUT', body: JSON.stringify(data) })
        : await apiRequest('/api/office-docs', { method: 'POST', body: JSON.stringify(data) });
      state.saving = false;
      closeEditModal();
      showToast(res.message || 'Đã lưu.', 'success');
      if (!state.editing) state.manage.page = 1;
      loadManage();
    } catch (err) {
      showEditError(err.message);
    } finally {
      state.saving = false;
      setBusy(btn, false);
    }
  }

  async function deleteDoc(btn) {
    const label = btn.dataset.label || 'văn bản này';
    const ok = await showConfirmDialog({
      title: 'Xóa văn bản khỏi sổ',
      message: `Xóa <b>${esc(label)}</b> khỏi sổ công văn? Cán bộ sẽ không tra cứu được nữa. Nếu văn bản có trong file Excel, lần nhập sau sẽ thêm lại.`,
      type: 'danger',
      confirmText: 'Xóa văn bản',
      cancelText: 'Giữ lại',
    });
    if (!ok) return;
    btn.disabled = true;
    try {
      const res = await apiRequest(`/api/office-docs/${btn.dataset.delete}`, { method: 'DELETE' });
      showToast(res.message || 'Đã xóa văn bản.', 'success');
      loadManage();
    } catch (err) {
      btn.disabled = false;
      showToast(err.message, 'error');
    }
  }

  function bindManageEvents() {
    const m = state.manage;
    $('manageDirectionTabs').addEventListener('click', (e) => {
      const b = e.target.closest('.segmented-btn');
      if (!b) return;
      m.direction = b.dataset.direction || '';
      m.page = 1;
      document.querySelectorAll('#manageDirectionTabs .segmented-btn').forEach((x) => {
        x.classList.toggle('active', x === b);
        x.setAttribute('aria-selected', x === b ? 'true' : 'false');
      });
      loadManage();
    });
    $('manageSearchInput').addEventListener('input', debounce((e) => {
      m.keyword = e.target.value.trim();
      m.page = 1;
      loadManage();
    }, 350));
    $('managePageSize').addEventListener('change', (e) => { m.pageSize = parseInt(e.target.value, 10) || 20; m.page = 1; loadManage(); });
    $('managePaginationButtons').addEventListener('click', (e) => {
      const b = e.target.closest('.page-btn');
      if (!b || b.disabled) return;
      m.page = parseInt(b.dataset.p, 10) || 1;
      loadManage();
    });
    $('btnManageAdd').addEventListener('click', () => openEditModal(null));
    $('manageTableBody').addEventListener('click', (e) => {
      const edit = e.target.closest('[data-edit]');
      if (edit) { openEditModal(parseInt(edit.dataset.edit, 10)); return; }
      const del = e.target.closest('[data-delete]');
      if (del) deleteDoc(del);
    });

    const form = editForm();
    form.addEventListener('submit', saveEdit);
    form.addEventListener('change', (e) => {
      if (e.target.name === 'direction') setEditDirection(e.target.value);
    });
    form.addEventListener('input', (e) => {
      if (e.target.classList.contains('is-invalid')) { e.target.classList.remove('is-invalid'); e.target.removeAttribute('aria-invalid'); }
    });
    $('btnCloseOfficeEdit').addEventListener('click', closeEditModal);
    $('btnCancelOfficeEdit').addEventListener('click', closeEditModal);
    // Không đóng khi bấm ra ngoài (tránh mất dữ liệu đang nhập); Esc vẫn đóng
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && $('officeEditModal').classList.contains('active')) closeEditModal();
    });
  }

  // ============================================================
  // KHỞI TẠO
  // ============================================================
  bindTableEvents();
  bindModalEvents();
  bindChatEvents();
  bindImportEvents();
  bindCodeEvents();
  bindZaloEvents();
  bindTabs('zaloTabs');
  bindManageEvents();

  document.addEventListener('admin:login', (e) => {
    const prevUserId = state.user && state.user.id;
    state.user = (e.detail && e.detail.user) || null;
    applyRoleVisibility();
    loadFeatures();
    if (prevUserId && state.user && prevUserId !== state.user.id) {
      resetChatLog();
      $('officeCodeReveal').classList.add('hidden');
      $('officeCodeReveal').innerHTML = '';
      $('officeEditModal').classList.remove('active');
    }
  });

  document.addEventListener('admin:viewchange', (e) => {
    const viewId = e.detail && e.detail.viewId;
    if (ADMIN_VIEWS.includes(viewId) && !isAdmin()) { App.switchView('view-office'); return; }
    switch (viewId) {
      case 'view-office-dashboard':
        loadOverview();
        break;
      case 'view-office':
        loadOverview();
        syncFilterInputs();
        loadTable();
        break;
      case 'view-office-chat':
        setTimeout(() => $('officeChatInput').focus(), 0);
        break;
      case 'view-office-manage':
        loadOverview();
        loadManage();
        break;
      case 'view-office-import':
        loadImports();
        break;
      case 'view-office-zalo':
        loadCodes();
        loadZaloUsers();
        break;
      default:
        break;
    }
  });
})();
