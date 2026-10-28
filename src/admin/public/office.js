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
  const COLUMN_ROW_KEYS = [
    'soKyHieu', 'docDateFrom', 'docDateTo', 'receivedFrom', 'receivedTo', 'direction', 'theLoai', 'trichYeu',
    'nguoiKy', 'nguoiGui', 'doKhan', 'deadlineFrom', 'deadlineTo', 'soVanBan', 'trangThai', 'sourceId',
  ];
  /** Ô ngày đơn trên hàng lọc cột = khoảng [từ, đến] trùng một ngày */
  const DAY_FILTERS = {
    docDate: ['docDateFrom', 'docDateTo'],
    receivedDate: ['receivedFrom', 'receivedTo'],
    deadlineDate: ['deadlineFrom', 'deadlineTo'],
  };
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
    chatBusy: false,
    exporting: false,
    officeChooser: null,
    manageChooser: null,
    manage: { filters: {}, keyword: '', sort: null, order: 'desc', page: 1, pageSize: 20, seq: 0 },
    tables: {},         // bảng lọc phía trình duyệt: imports, codes, zalo
    selectZaloTab: null,
    dash: null,
    dashSeq: 0,
    zaloEdit: null,     // { mode: 'code' | 'user', row }
    zaloEditFocus: null,
    zaloSaving: false,
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

  /** Hôm nay theo giờ máy (YYYY-MM-DD) */
  function todayIso() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  function addDays(iso, n) {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }

  function daysBetween(fromIso, toIso) {
    return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86400000);
  }

  const isUrgent = (v) => !!v && fold(v) !== 'thuong';

  function urgencyChip(v) {
    if (!v) return '<span class="cell-muted">--</span>';
    return `<span class="urgency-chip ${isUrgent(v) ? 'is-urgent' : ''}">${esc(v)}</span>`;
  }

  /** Hạn xử lý: quá hạn tô đỏ, còn 7 ngày tô vàng */
  function dueCell(iso) {
    if (!iso) return '<span class="cell-muted">--</span>';
    const left = daysBetween(todayIso(), String(iso).slice(0, 10));
    const tone = left < 0 ? 'is-past' : left <= 7 ? 'is-soon' : '';
    const hint = left < 0 ? 'Đã quá hạn' : left === 0 ? 'Hạn hôm nay' : `Còn ${left} ngày`;
    return `<span class="due-date ${tone}" title="${hint}">${fmtDate(iso)}</span>`;
  }

  function visibleCols(table) {
    if (!table) return 1;
    return [...table.querySelectorAll('thead tr:first-child > th')].filter((th) => getComputedStyle(th).display !== 'none').length || 1;
  }

  function emptyRow(tableOrColspan, text) {
    const span = typeof tableOrColspan === 'number' ? tableOrColspan : visibleCols(tableOrColspan);
    return `<tr><td colspan="${span}" class="table-empty"><p>${esc(text)}</p></td></tr>`;
  }

  // ---- Khung xương (skeleton) khi đang tải ----
  const SKEL_W = [72, 48, 88, 60, 80, 54, 92, 66];
  /** w: số = phần trăm, chuỗi = kích thước CSS */
  const skel = (w, cls = '') => `<span class="skel ${cls}" style="width: ${typeof w === 'number' ? `${w}%` : w}"></span>`;

  /** Hàng khung xương theo đúng cột của bảng (giữ class col-* để cột đang ẩn vẫn ẩn) */
  function skeletonRows(table, count = 8) {
    const heads = [...table.querySelectorAll('thead tr:first-child > th')];
    let html = '';
    for (let r = 0; r < count; r++) {
      html += `<tr class="skel-row" aria-hidden="true" style="--skel-i: ${r}">${heads.map((th, c) => {
        const cls = [...th.classList].filter((k) => k.startsWith('col-') || k === 'sticky-action-col').join(' ');
        if (th.classList.contains('sticky-action-col')) return `<td class="${cls}"><span class="skel skel-pill"></span></td>`;
        const w = SKEL_W[(r * 3 + c) % SKEL_W.length];
        // Cột co giãn (không đặt độ rộng) thường là nội dung dài: vẽ 2 dòng
        const wide = !th.style.width;
        return `<td class="${cls}">${skel(w)}${wide ? skel(Math.max(34, w - 28), 'skel-sm') : ''}</td>`;
      }).join('')}</tr>`;
    }
    return html;
  }

  /** Bảng đang có dữ liệu thật (không phải khung xương / dòng thông báo) */
  function hasDataRows(tbody) {
    return !!tbody.querySelector('tr:not(.skel-row) > td:not(.table-empty)');
  }

  /** Lần đầu: khung xương; đã có dữ liệu: giữ nguyên dòng, phủ hiệu ứng quét */
  function beginTableLoad(table, tbody, count) {
    tbody.setAttribute('aria-busy', 'true');
    if (hasDataRows(tbody)) tbody.classList.add('is-loading');
    else tbody.innerHTML = skeletonRows(table, count);
  }

  function endTableLoad(tbody) {
    tbody.classList.remove('is-loading');
    tbody.removeAttribute('aria-busy');
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

  /** Chữ thường, bỏ dấu tiếng Việt (lọc phía trình duyệt) */
  function fold(value) {
    return String(value == null ? '' : value).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  /** Ngày địa phương YYYY-MM-DD của chuỗi thời gian (chuỗi đã là giờ VN thì cắt 10 ký tự) */
  function localDay(value) {
    if (!value) return '';
    const s = String(value);
    if (!/T.*(Z|[+-]\d{2}:?\d{2})$/.test(s)) return s.slice(0, 10);
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return s.slice(0, 10);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  const ICONS = {
    funnel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>',
    clear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>',
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6M14 11v6"></path><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path></svg>',
    ban: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>',
    up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25"><polyline points="18 15 12 9 6 15"></polyline></svg>',
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25"><polyline points="6 9 12 15 18 9"></polyline></svg>',
  };

  // ============================================================
  // CHỌN CỘT HIỂN THỊ (nút phễu) - dùng chung cho mọi bảng
  // Ô th/td mang class col-<key>; cột ẩn bằng <style> sinh động, lưu lựa chọn vào localStorage.
  // ============================================================
  let chooserMenu = null;
  let chooserOwner = null;

  function closeColumnMenu() {
    if (!chooserMenu || chooserMenu.hidden) return;
    chooserMenu.hidden = true;
    if (chooserOwner) {
      chooserOwner.button.setAttribute('aria-expanded', 'false');
      chooserOwner.button.classList.remove('active');
    }
    chooserOwner = null;
  }

  function renderColumnMenu(api) {
    chooserMenu.innerHTML = `
      <div class="column-toggle-header">Cột hiển thị</div>
      ${api.columns.map((c) => `
        <label class="column-toggle-item ${c.locked ? 'is-locked' : ''}">
          <input type="checkbox" data-col="${esc(c.key)}" ${api.isHidden(c.key) ? '' : 'checked'} ${c.locked ? 'disabled' : ''}>
          <span>${esc(c.label)}</span>${c.locked ? '<span class="col-lock">Luôn hiện</span>' : ''}
        </label>`).join('')}
      <div class="column-toggle-footer"><button type="button" class="btn-link-xs" data-action="reset-cols">Về mặc định</button></div>`;
  }

  function openColumnMenu(api) {
    if (!chooserMenu) {
      chooserMenu = document.createElement('div');
      chooserMenu.className = 'column-toggle-menu col-chooser';
      chooserMenu.setAttribute('role', 'dialog');
      chooserMenu.setAttribute('aria-label', 'Chọn cột hiển thị');
      chooserMenu.hidden = true;
      document.body.appendChild(chooserMenu);
      chooserMenu.addEventListener('click', (e) => {
        e.stopPropagation();
        if (e.target.closest('[data-action="reset-cols"]') && chooserOwner) { chooserOwner.reset(); renderColumnMenu(chooserOwner); }
      });
      chooserMenu.addEventListener('change', (e) => {
        const cb = e.target.closest('input[data-col]');
        if (cb && chooserOwner) chooserOwner.setVisible(cb.dataset.col, cb.checked);
      });
      document.addEventListener('click', closeColumnMenu);
      document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape' || !chooserOwner) return;
        const b = chooserOwner.button;
        closeColumnMenu();
        b.focus();
      });
      window.addEventListener('resize', closeColumnMenu);
      document.addEventListener('scroll', (e) => { if (!chooserMenu.contains(e.target)) closeColumnMenu(); }, true);
    }
    closeColumnMenu();
    chooserOwner = api;
    renderColumnMenu(api);
    chooserMenu.hidden = false;
    api.button.setAttribute('aria-expanded', 'true');
    api.button.classList.add('active');
    const r = api.button.getBoundingClientRect();
    const mw = chooserMenu.offsetWidth;
    const mh = chooserMenu.offsetHeight;
    let top = r.bottom + 6;
    if (top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 6);
    chooserMenu.style.left = `${Math.max(8, Math.min(r.right - mw, window.innerWidth - mw - 8))}px`;
    chooserMenu.style.top = `${top}px`;
    const first = chooserMenu.querySelector('input:not([disabled])');
    if (first) first.focus();
  }

  /**
   * @param {{ table: HTMLTableElement, button: HTMLElement, storageKey: string,
   *           columns: { key: string, label: string, locked?: boolean, defaultHidden?: boolean }[],
   *           onChange?: (hidden: Set<string>, changedKey?: string, visible?: boolean) => void }} opts
   */
  function createColumnChooser(opts) {
    const { table, columns, storageKey } = opts;
    const styleEl = document.createElement('style');
    document.head.appendChild(styleEl);
    const defaults = () => new Set(columns.filter((c) => c.defaultHidden).map((c) => c.key));
    let hidden = defaults();
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (Array.isArray(saved)) hidden = new Set(saved.filter((k) => columns.some((c) => c.key === k && !c.locked)));
    } catch (e) { /* chế độ riêng tư / dữ liệu hỏng */ }

    const save = () => { try { localStorage.setItem(storageKey, JSON.stringify([...hidden])); } catch (e) { /* bỏ qua */ } };
    const api = {
      button: opts.button,
      columns,
      isHidden: (key) => hidden.has(key),
      apply(changedKey, visible) {
        styleEl.textContent = [...hidden].map((k) => `#${table.id} .col-${k} { display: none; }`).join('\n');
        // Bảng table-layout: fixed cần min-width bằng tổng các cột đang hiện, cột co giãn tối thiểu 240px
        let width = 0;
        table.querySelectorAll('thead tr:first-child > th').forEach((th) => {
          const cls = [...th.classList].find((c) => c.startsWith('col-'));
          if (cls && hidden.has(cls.slice(4))) return;
          width += parseInt(th.style.width, 10) || (th.classList.contains('sticky-action-col') ? 112 : 240);
        });
        table.style.minWidth = `${width}px`;
        const extra = [...hidden].some((k) => !defaults().has(k)) || [...defaults()].some((k) => !hidden.has(k));
        opts.button.classList.toggle('is-custom', extra);
        if (changedKey && opts.onChange) opts.onChange(hidden, changedKey, visible);
      },
      setVisible(key, visible) {
        const col = columns.find((c) => c.key === key);
        if (!col || col.locked) return;
        if (visible) hidden.delete(key); else hidden.add(key);
        save();
        api.apply(key, visible);
      },
      reset() {
        const before = new Set(hidden);
        hidden = defaults();
        save();
        api.apply();
        before.forEach((k) => { if (!hidden.has(k) && opts.onChange) opts.onChange(hidden, k, true); });
        hidden.forEach((k) => { if (!before.has(k) && opts.onChange) opts.onChange(hidden, k, false); });
      },
    };
    opts.button.addEventListener('click', (e) => {
      e.stopPropagation();
      if (chooserOwner === api) closeColumnMenu(); else openColumnMenu(api);
    });
    api.apply();
    return api;
  }

  // ============================================================
  // BẢNG LỌC / SẮP XẾP / PHÂN TRANG PHÍA TRÌNH DUYỆT
  // (lịch sử nhập, mã kích hoạt, tài khoản Zalo: dữ liệu nhỏ, tải một lần)
  // ============================================================
  /**
   * columns: { key, label, width?, locked?, defaultHidden?, align?, sortable?,
   *            value: row => any (sắp xếp + lọc), dateOf?: row => 'YYYY-MM-DD',
   *            filter?: 'text' | 'date' | { options: {value,label}[] | (rows) => {value,label}[] },
   *            render: row => html }
   * actions: { width, render: row => html }  (nút có data-action, bắt sự kiện qua onAction)
   */
  function createClientTable(opts) {
    const { host, id, columns, rowId, unit = 'mục', pageSize = 20 } = opts;
    const st = { rows: [], filters: {}, sort: opts.defaultSort || null, page: 1 };
    const actionW = opts.actions ? opts.actions.width || 112 : 72;

    const filterCell = (c) => {
      if (!c.filter) return `<th class="col-${c.key}"></th>`;
      const aria = `aria-label="Lọc theo ${esc(c.label.toLowerCase())}"`;
      if (c.filter === 'text') return `<th class="col-${c.key}"><input type="text" class="col-filter" data-ct-filter="${c.key}" maxlength="100" placeholder="Lọc..." ${aria}></th>`;
      if (c.filter === 'date') return `<th class="col-${c.key}"><input type="date" class="col-filter" data-ct-filter="${c.key}" ${aria}></th>`;
      return `<th class="col-${c.key}"><select class="col-filter" data-ct-filter="${c.key}" ${aria}><option value="">Tất cả</option></select></th>`;
    };

    host.innerHTML = `
      <div class="table-responsive">
        <table class="data-table office-table ct-table" id="${id}" style="--ct-action-w: ${actionW}px">
          <thead>
            <tr>
              ${columns.map((c) => `<th class="col-${c.key}${c.sortable ? ' sortable' : ''}" ${c.sortable ? `data-ct-sort="${c.key}" tabindex="0"` : ''} style="${c.width ? `width: ${c.width}px;` : ''}${c.align ? ` text-align: ${c.align};` : ''}">${esc(c.label)}</th>`).join('')}
              <th class="sticky-action-col" style="text-align: center;">
                <button type="button" class="th-filter-toggle" data-ct-columns aria-haspopup="true" aria-expanded="false" title="Chọn cột hiển thị" aria-label="Chọn cột hiển thị">${ICONS.funnel}</button>
              </th>
            </tr>
            <tr class="col-filter-row">
              ${columns.map(filterCell).join('')}
              <th class="sticky-action-col">
                <button type="button" class="col-filter-clear" data-ct-clear aria-label="Xóa lọc theo cột" title="Xóa lọc theo cột">${ICONS.clear}</button>
              </th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
      <div class="pagination-bar">
        <div class="pagination-left"><span class="ct-info">--</span></div>
        <div class="pagination-right ct-pager"></div>
      </div>`;

    const table = host.querySelector('table');
    const tbody = table.querySelector('tbody');
    const info = host.querySelector('.ct-info');
    const pager = host.querySelector('.ct-pager');
    const colByKey = Object.fromEntries(columns.map((c) => [c.key, c]));

    const chooser = createColumnChooser({
      table,
      button: host.querySelector('[data-ct-columns]'),
      storageKey: `office.cols.${id}`,
      columns,
      onChange: (hidden, key, visible) => {
        // Ẩn cột đang lọc thì bỏ lọc cột đó (tránh lọc "vô hình")
        if (!visible && st.filters[key]) { delete st.filters[key]; syncInputs(); st.page = 1; render(); }
      },
    });
    tbody.innerHTML = skeletonRows(table, 6);

    function optionsFor(c) {
      const list = typeof c.filter.options === 'function' ? c.filter.options(st.rows) : c.filter.options;
      return list || [];
    }

    function syncInputs() {
      table.querySelectorAll('[data-ct-filter]').forEach((el) => {
        const v = st.filters[el.dataset.ctFilter] || '';
        if (el.tagName === 'SELECT') {
          const c = colByKey[el.dataset.ctFilter];
          const opts2 = optionsFor(c);
          el.innerHTML = ['<option value="">Tất cả</option>', ...opts2.map((o) => `<option value="${esc(o.value)}">${esc(o.label)}</option>`)].join('');
        }
        if (document.activeElement !== el) el.value = v;
        el.classList.toggle('has-value', !!v);
      });
      table.querySelector('[data-ct-clear]').classList.toggle('is-active', Object.values(st.filters).some(Boolean));
      table.querySelectorAll('th[data-ct-sort]').forEach((th) => {
        const on = st.sort && st.sort.key === th.dataset.ctSort;
        th.classList.toggle('sort-asc', !!on && st.sort.order === 'asc');
        th.classList.toggle('sort-desc', !!on && st.sort.order === 'desc');
        th.setAttribute('aria-sort', on ? (st.sort.order === 'asc' ? 'ascending' : 'descending') : 'none');
      });
    }

    function matches(row) {
      return Object.entries(st.filters).every(([key, v]) => {
        if (!v) return true;
        const c = colByKey[key];
        if (!c) return true;
        if (c.filter === 'text') {
          const hay = fold(c.value(row));
          return fold(v).split(' ').every((t) => hay.includes(t));
        }
        if (c.filter === 'date') return (c.dateOf ? c.dateOf(row) : localDay(c.value(row))) === v;
        return String(c.value(row)) === v;
      });
    }

    function sorted(list) {
      if (!st.sort) return list;
      const c = colByKey[st.sort.key];
      const sign = st.sort.order === 'asc' ? 1 : -1;
      return [...list].sort((a, b) => {
        const va = c.value(a);
        const vb = c.value(b);
        if (va == null || va === '') return 1;
        if (vb == null || vb === '') return -1;
        if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * sign;
        return String(va).localeCompare(String(vb), 'vi', { numeric: true }) * sign;
      });
    }

    function render() {
      endTableLoad(tbody);
      const list = sorted(st.rows.filter(matches));
      const pages = Math.max(1, Math.ceil(list.length / pageSize));
      if (st.page > pages) st.page = pages;
      const slice = list.slice((st.page - 1) * pageSize, st.page * pageSize);
      if (!slice.length) {
        const filtered = Object.values(st.filters).some(Boolean);
        tbody.innerHTML = `<tr><td colspan="${visibleCols(table)}" class="table-empty"><p>${esc(filtered ? (opts.noMatchText || 'Không có dòng phù hợp bộ lọc.') : opts.emptyText || 'Chưa có dữ liệu.')}</p></td></tr>`;
      } else {
        tbody.innerHTML = slice.map((row) => `
          <tr data-row-id="${esc(rowId(row))}">
            ${columns.map((c) => `<td class="col-${c.key}"${c.align ? ` style="text-align: ${c.align};"` : ''}>${c.render ? c.render(row) : esc(c.value(row) == null ? '--' : c.value(row))}</td>`).join('')}
            <td class="sticky-action-col">${opts.actions ? opts.actions.render(row) : ''}</td>
          </tr>`).join('');
      }
      renderPager({ total: list.length, page: st.page, pages, pageSize }, info, pager, unit);
      syncInputs();
    }

    const onText = debounce(() => { st.page = 1; render(); }, 250);
    table.querySelector('.col-filter-row').addEventListener('input', (e) => {
      const el = e.target.closest('input[type="text"][data-ct-filter]');
      if (!el) return;
      st.filters[el.dataset.ctFilter] = el.value.trim();
      onText();
    });
    table.querySelector('.col-filter-row').addEventListener('change', (e) => {
      const el = e.target.closest('select[data-ct-filter], input[type="date"][data-ct-filter]');
      if (!el) return;
      st.filters[el.dataset.ctFilter] = el.value;
      st.page = 1;
      render();
    });
    table.querySelector('[data-ct-clear]').addEventListener('click', () => { st.filters = {}; st.page = 1; render(); });
    table.querySelectorAll('th[data-ct-sort]').forEach((th) => {
      const sortBy = () => {
        const key = th.dataset.ctSort;
        st.sort = st.sort && st.sort.key === key
          ? { key, order: st.sort.order === 'asc' ? 'desc' : 'asc' }
          : { key, order: 'asc' };
        st.page = 1;
        render();
      };
      th.addEventListener('click', sortBy);
      th.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sortBy(); } });
    });
    pager.addEventListener('click', (e) => {
      const b = e.target.closest('.page-btn');
      if (!b || b.disabled) return;
      st.page = parseInt(b.dataset.p, 10) || 1;
      render();
    });

    return {
      chooser,
      setLoading() { beginTableLoad(table, tbody, 6); },
      setRows(rows) { st.rows = Array.isArray(rows) ? rows : []; render(); },
      setError(message) { endTableLoad(tbody); tbody.innerHTML = `<tr><td colspan="${visibleCols(table)}" class="table-empty"><p>${esc(message)}</p></td></tr>`; },
      rowById(rid) { return st.rows.find((r) => String(rowId(r)) === String(rid)) || null; },
      rows: () => st.rows,
      refresh: render,
    };
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
    const dash = $('dashUnit');
    if (dash) dash.textContent = name;
  }

  // ============================================================
  // TRA CỨU: TỔNG QUAN + BẢNG
  // ============================================================
  /** Hai thẻ sổ đến / đi trên trang Tổng quan */
  function fillOverview(overview) {
    ['den', 'di'].forEach((dir) => {
      const ov = (overview && overview[dir]) || {};
      const key = dir === 'den' ? 'Den' : 'Di';
      $(`officeTotal${key}`).textContent = fmtNumber(ov.total);
      $(`officeMeta${key}`).textContent = ov.reportDate
        ? `Dữ liệu chốt ngày ${fmtDate(ov.reportDate)}`
        : (ov.lastImportAt ? `Cập nhật ${fmtDateTime(ov.lastImportAt)}` : 'Chưa nhập dữ liệu');
    });
  }

  async function loadOverview() {
    try {
      const res = await apiRequest('/api/office-docs/overview');
      if (res.unitName) setUnitName(res.unitName);
      fillOverview(res.overview);
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
      // Trang Quản lý văn bản có bộ lọc riêng, không dùng chung với Tra cứu
      const filters = sel.closest('#view-office-manage') ? state.manage.filters : state.filters;
      sel.value = filters[key] || '';
      if (sel.value !== (filters[key] || '')) filters[key] = '';
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
    beginTableLoad($('officeTable'), body, Math.min(state.pageSize, 10));
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
      body.innerHTML = emptyRow($('officeTable'), 'Không tải được sổ công văn: ' + e.message);
      hideSearchInfo();
    } finally {
      if (seq === state.reqSeq) endTableLoad(body);
    }
  }

  function renderTable(res) {
    const body = $('officeTableBody');
    const items = res.items || [];
    if (!items.length) {
      const hasFilter = Object.values(state.filters).some(Boolean);
      body.innerHTML = emptyRow($('officeTable'), hasFilter
        ? 'Không tìm thấy văn bản phù hợp. Thử bỏ bớt bộ lọc hoặc diễn đạt khác.'
        : 'Sổ công văn chưa có dữ liệu. Quản trị viên cần nhập file Excel ở mục "Nhập Sổ Excel".');
      return;
    }
    const offset = (res.page - 1) * res.pageSize;
    // Cột "Ngày đến" đang ẩn thì ghi ngày nhận ngay dưới ngày văn bản
    const nhanHidden = !state.officeChooser || state.officeChooser.isHidden('nhan');
    const muted = '<span class="cell-muted">--</span>';
    body.innerHTML = items.map((d, i) => {
      const isDen = d.direction === 'den';
      const received = nhanHidden && isDen && d.thoi_gian_nhan && d.thoi_gian_nhan !== d.ngay_van_ban
        ? `<span class="cell-sub">Nhận ${fmtDate(d.thoi_gian_nhan)}</span>` : '';
      const sender = isDen ? d.nguoi_gui : d.nguoi_trinh;
      return `
        <tr class="office-row" data-id="${Number(d.id)}" tabindex="0" aria-label="Xem chi tiết ${esc(d.so_ky_hieu || 'văn bản')}">
          <td style="text-align: center;" class="col-stt cell-muted">${offset + i + 1}</td>
          <td class="col-so"><span class="doc-number">${esc(d.so_ky_hieu || '--')}</span></td>
          <td class="col-ngay cell-date">${fmtDate(d.ngay_van_ban)}${received}</td>
          <td class="col-nhan cell-date">${isDen && d.thoi_gian_nhan ? fmtDate(d.thoi_gian_nhan) : muted}</td>
          <td class="col-dir">${dirBadge(d.direction)}</td>
          <td class="col-loai">${d.the_loai ? `<span class="type-chip">${esc(d.the_loai)}</span>` : muted}</td>
          <td class="col-trichyeu cell-summary"><span class="clamp-2" title="${esc(d.trich_yeu || '')}">${esc(d.trich_yeu || '--')}</span></td>
          <td class="col-nguoiky cell-signer">${esc(d.nguoi_ky || '--')}</td>
          <td class="col-nguoigui">${sender ? `<span class="clamp-2" title="${esc(sender)}">${esc(sender)}</span>` : muted}</td>
          <td class="col-dokhan">${urgencyChip(d.do_khan)}</td>
          <td class="col-han cell-date">${isDen ? dueCell(d.han_xu_ly) : muted}</td>
          <td class="col-sovb">${d.so_van_ban ? `<span class="clamp-2" title="${esc(d.so_van_ban)}">${esc(d.so_van_ban)}</span>` : muted}</td>
          <td class="col-trangthai">${!isDen && d.trang_thai_phat_hanh ? esc(d.trang_thai_phat_hanh) : muted}</td>
          <td class="col-ma"><span class="source-id">${esc(d.source_id || '--')}</span></td>
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

  /** Thanh phân trang dùng chung (Tra cứu, Quản lý văn bản và các bảng lọc phía trình duyệt) */
  function renderPager(res, infoEl, box, unit = 'văn bản') {
    const total = res.total || 0;
    const page = res.page || 1;
    const pages = res.pages || 1;
    const from = total ? (page - 1) * res.pageSize + 1 : 0;
    const to = Math.min(page * res.pageSize, total);
    infoEl.textContent = total ? `Hiển thị ${fmtNumber(from)}-${fmtNumber(to)} / ${fmtNumber(total)} ${unit}` : `0 ${unit}`;

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
      const day = DAY_FILTERS[key];
      el.value = day
        ? (f[day[0]] && f[day[0]] === f[day[1]] ? f[day[0]] : '')
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

  /** Cập nhật state từ một ô trên hàng lọc cột */
  function readColumnInput(el) {
    const key = el.dataset.filter;
    const value = el.value.trim();
    const day = DAY_FILTERS[key];
    if (day) {
      state.filters[day[0]] = value;
      state.filters[day[1]] = value;
    } else {
      state.filters[key] = value;
    }
  }

  /** Mở trang Tra cứu với bộ lọc cho trước (từ trang Tổng quan), có thể bật thêm cột liên quan */
  function openLookup(filters = {}, { showCols = [] } = {}) {
    state.filters = { ...emptyFilters(), ...filters };
    state.sort = null;
    state.order = 'desc';
    state.page = 1;
    showCols.forEach((k) => { if (state.officeChooser) state.officeChooser.setVisible(k, true); });
    App.switchView('view-office');
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
      const res = await fetch('/api/office-docs/export?' + buildQuery({ paged: false }), {
        credentials: 'same-origin',
        headers: App.getDeviceKey ? { 'X-Device-Key': App.getDeviceKey() } : {},
      });
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

    // Nút phễu: chọn cột hiển thị. Ẩn cột không xóa bộ lọc (khung nâng cao vẫn hiện và đếm bộ lọc).
    state.officeChooser = createColumnChooser({
      table: $('officeTable'),
      button: $('btnOfficeColumns'),
      storageKey: 'office.cols.officeTable',
      columns: [
        { key: 'stt', label: 'STT', locked: true },
        { key: 'so', label: 'Số / Ký hiệu', locked: true },
        { key: 'ngay', label: 'Ngày văn bản' },
        { key: 'nhan', label: 'Ngày đến', defaultHidden: true },
        { key: 'dir', label: 'Sổ' },
        { key: 'loai', label: 'Thể loại' },
        { key: 'trichyeu', label: 'Trích yếu', locked: true },
        { key: 'nguoiky', label: 'Người ký' },
        { key: 'nguoigui', label: 'Người gửi / trình', defaultHidden: true },
        { key: 'dokhan', label: 'Độ khẩn', defaultHidden: true },
        { key: 'han', label: 'Hạn xử lý', defaultHidden: true },
        { key: 'sovb', label: 'Sổ văn bản', defaultHidden: true },
        { key: 'trangthai', label: 'Trạng thái', defaultHidden: true },
        { key: 'ma', label: 'Mã văn bản' },
      ],
      onChange: (hidden, key) => { if (key === 'nhan' && state.lastResult) renderTable(state.lastResult); },
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
  // TỔNG QUAN (ADMIN): số liệu, biểu đồ 12 tháng, cơ cấu thể loại, việc cần làm
  // ============================================================
  const WEEKDAYS = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  const TYPE_COLORS = ['#BE123C', '#2563EB', '#D97706', '#059669', '#7C3AED', '#94A3B8'];
  const CHECK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>';

  async function loadDashboard() {
    const seq = ++state.dashSeq;
    if (!state.dash) dashSkeleton();
    try {
      const res = await apiRequest('/api/office-docs/dashboard');
      if (seq !== state.dashSeq) return;
      state.dash = res;
      renderDashboard(res);
    } catch (e) {
      if (seq !== state.dashSeq) return;
      if (!state.dash) dashSkeletonFail();
      showToast('Không tải được trang Tổng quan: ' + e.message, 'error');
    }
  }

  /** Khung xương cho trang Tổng quan (chỉ lần tải đầu, lần sau giữ số liệu cũ đến khi có số mới) */
  function dashSkeleton() {
    $('view-office-dashboard').setAttribute('aria-busy', 'true');
    $('dashToday').innerHTML = skel('150px', 'skel-sm skel-inline');
    ['officeTotalDen', 'officeTotalDi', 'dashMonthTotal', 'dashDueSoon', 'dashLookups'].forEach((id) => { $(id).innerHTML = '<span class="skel skel-num"></span>'; });
    ['dashMonthDen', 'dashMonthDi', 'dashMonthDelta', 'dashUrgent'].forEach((id) => { const el = $(id); el.className = 'dash-trend'; el.innerHTML = skel('132px', 'skel-sm'); });
    ['officeMetaDen', 'officeMetaDi', 'dashYearTotal'].forEach((id) => { $(id).innerHTML = skel(78, 'skel-sm'); });
    ['dashGranted', 'dashPending'].forEach((id) => { $(id).innerHTML = '<span class="skel skel-num skel-num-sm"></span>'; });

    const heights = [38, 52, 44, 66, 48, 72, 58, 40, 62, 54, 76, 60];
    $('dashMonthChart').innerHTML = `<div class="skel-chart" aria-hidden="true">${heights.map((h, i) => `
      <div class="skel-chart-col"><span class="skel skel-bar" style="height: ${h}%"></span><span class="skel skel-bar" style="height: ${Math.max(16, h - 24 + (i % 3) * 9)}%"></span></div>`).join('')}</div>`;
    $('dashTypes').innerHTML = `<span class="skel skel-donut" aria-hidden="true"></span>
      <div class="skel-legend" aria-hidden="true">${[70, 55, 62, 46].map((w) => `<div class="skel-legend-row"><span class="skel skel-dot"></span>${skel(w)}</div>`).join('')}</div>`;
    const items = (n) => Array.from({ length: n }, (_, i) => `
      <li class="skel-li" aria-hidden="true" style="--skel-i: ${i}"><span class="skel skel-tile"></span>
        <div class="skel-li-text">${skel([82, 64, 74, 58][i % 4])}${skel([46, 38, 52, 30][i % 4], 'skel-sm')}</div></li>`).join('');
    $('dashRecent').innerHTML = items(4);
    $('dashDeadlines').innerHTML = items(4);
    $('dashSpark').innerHTML = '<span class="skel skel-spark" aria-hidden="true"></span>';
  }

  function dashSkeletonFail() {
    const sec = $('view-office-dashboard');
    sec.removeAttribute('aria-busy');
    $('dashMonthChart').innerHTML = '<div class="dash-empty">Không tải được dữ liệu.</div>';
    $('dashTypes').innerHTML = '<div class="dash-empty">Không tải được dữ liệu.</div>';
    ['dashRecent', 'dashDeadlines'].forEach((id) => { $(id).innerHTML = '<li class="dash-empty">Không tải được dữ liệu.</li>'; });
    $('dashSpark').innerHTML = '';
    sec.querySelectorAll('.skel').forEach((s) => { if (s.parentElement) s.parentElement.textContent = '--'; });
  }

  function setTrend(el, tone, html) {
    el.className = `dash-trend tone-${tone}`;
    el.innerHTML = html;
  }

  function renderDashboard(res) {
    if (res.unitName) setUnitName(res.unitName);
    fillOverview(res.overview || {});
    const t = res.totals || {};
    const today = res.today || todayIso();
    const [y, mo, da] = today.split('-');

    $('dashToday').textContent = `${WEEKDAYS[new Date(`${today}T00:00:00Z`).getUTCDay()]}, ${da}/${mo}/${y}`;
    const h = new Date().getHours();
    const part = h < 11 ? 'buổi sáng' : h < 13 ? 'buổi trưa' : h < 18 ? 'buổi chiều' : 'buổi tối';
    const name = state.user && (state.user.fullName || state.user.username);
    $('dashGreeting').textContent = `Chào ${part}${name ? `, ${name}` : ''}`;

    // Thẻ số liệu
    [['Den', t.monthDen], ['Di', t.monthDi]].forEach(([key, n]) => {
      setTrend($(`dashMonth${key}`), n ? 'up' : 'neutral', n
        ? `${ICONS.up}<span>${fmtNumber(n)} trong tháng ${mo}</span>`
        : '<span>Chưa có trong tháng này</span>');
    });
    $('dashMonthLabel').textContent = `Vào sổ tháng ${mo}/${y}`;
    $('dashMonthTotal').textContent = fmtNumber(t.month);
    const delta = (t.month || 0) - (t.prevMonth || 0);
    if (!t.month && !t.prevMonth) setTrend($('dashMonthDelta'), 'neutral', '<span>Chưa có văn bản</span>');
    else if (!delta) setTrend($('dashMonthDelta'), 'neutral', '<span>Bằng tháng trước</span>');
    else setTrend($('dashMonthDelta'), delta > 0 ? 'up' : 'down', `${delta > 0 ? ICONS.up : ICONS.down}<span>${fmtNumber(Math.abs(delta))} so với tháng trước</span>`);
    $('dashYearTotal').textContent = `Từ đầu năm ${y}: ${fmtNumber(t.year)} văn bản`;
    $('dashDueSoon').textContent = fmtNumber(t.dueSoon);
    $('dashKpiDue').classList.toggle('has-due', !!t.dueSoon);
    setTrend($('dashUrgent'), t.urgent ? 'warn' : 'neutral', t.urgent
      ? `<span>${fmtNumber(t.urgent)} văn bản khẩn trong sổ</span>`
      : '<span>Không có văn bản khẩn</span>');

    renderMonthChart(res.months || [], today);
    renderTypes(res.types || []);
    renderRecent(res.recent || []);
    renderDeadlines(res.deadlines || [], today);
    renderSpark(res.lookups || []);
    const z = res.zalo || {};
    $('dashGranted').textContent = fmtNumber(z.granted);
    $('dashPending').textContent = fmtNumber(z.pendingCodes);
    $('view-office-dashboard').removeAttribute('aria-busy');
  }

  /** Mốc trục tung "đẹp" chia hết 4 vạch */
  function niceMax(v) {
    if (v <= 4) return 4;
    const raw = v / 4;
    const p = 10 ** Math.floor(Math.log10(raw));
    const n = raw / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p * 4;
  }

  function renderMonthChart(months, today) {
    const host = $('dashMonthChart');
    const peak = Math.max(0, ...months.map((m) => Math.max(m.den, m.di)));
    if (!months.length || !peak) {
      host.innerHTML = '<div class="dash-empty">Chưa có văn bản vào sổ trong 12 tháng gần nhất.</div>';
      return;
    }
    const W = 660; const H = 250; const L = 40; const R = 8; const T = 22; const B = 42;
    const cw = W - L - R; const ch = H - T - B;
    const max = niceMax(peak);
    const gw = cw / months.length;
    const bw = Math.min(16, Math.max(6, gw * 0.28));
    const cur = today.slice(0, 7);
    let svg = '';
    for (let i = 0; i <= 4; i++) {
      const v = (max / 4) * i;
      const yy = T + ch - (v / max) * ch;
      svg += `<line class="ch-grid${i ? '' : ' ch-base'}" x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}"></line>`;
      svg += `<text class="ch-axis" x="${L - 8}" y="${yy + 4}" text-anchor="end">${fmtNumber(v)}</text>`;
    }
    months.forEach((m, i) => {
      const [yr, mm] = m.month.split('-');
      const cx = L + gw * i + gw / 2;
      const isCur = m.month === cur;
      if (isCur) svg += `<rect class="ch-cur" x="${L + gw * i + 3}" y="${T - 14}" width="${gw - 6}" height="${ch + 14}" rx="8"></rect>`;
      [['den', cx - bw - 1.5], ['di', cx + 1.5]].forEach(([dir, x], k) => {
        const v = m[dir] || 0;
        const bh = v ? Math.max(2, (v / max) * ch) : 0;
        svg += `<rect class="ch-bar ch-${dir}" x="${x.toFixed(1)}" y="${(T + ch - bh).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="3" style="animation-delay: ${i * 35 + k * 15}ms"><title>${DIRECTION_LABEL[dir]} tháng ${mm}/${yr}: ${fmtNumber(v)} văn bản</title></rect>`;
        if (v) svg += `<text class="ch-val ch-val-${dir}" x="${(x + bw / 2).toFixed(1)}" y="${(T + ch - bh - 5).toFixed(1)}" text-anchor="middle">${fmtNumber(v)}</text>`;
      });
      svg += `<text class="ch-axis${isCur ? ' is-cur' : ''}" x="${cx.toFixed(1)}" y="${H - B + 18}" text-anchor="middle">T${Number(mm)}</text>`;
      if (i === 0 || mm === '01') svg += `<text class="ch-axis ch-year" x="${cx.toFixed(1)}" y="${H - B + 33}" text-anchor="middle">${yr}</text>`;
    });
    host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Biểu đồ số văn bản đến và đi theo tháng">${svg}</svg>`;
  }

  function renderTypes(types) {
    const host = $('dashTypes');
    const total = types.reduce((s, x) => s + (x.count || 0), 0);
    if (!total) { host.innerHTML = '<div class="dash-empty">Sổ chưa có văn bản.</div>'; return; }
    const top = types.slice(0, 5);
    const rest = types.slice(5).reduce((s, x) => s + x.count, 0);
    const parts = rest ? [...top, { name: 'Khác', count: rest, other: true }] : top;
    const r = 54;
    const C = 2 * Math.PI * r;
    let acc = 0;
    const arcs = parts.map((p, i) => {
      const len = (p.count / total) * C;
      const gap = parts.length > 1 ? Math.min(2, len / 3) : 0;
      const seg = `<circle class="donut-seg" cx="70" cy="70" r="${r}" stroke="${TYPE_COLORS[i]}" stroke-dasharray="${Math.max(len - gap, 0.01).toFixed(2)} ${C.toFixed(2)}" stroke-dashoffset="${(-acc).toFixed(2)}"><title>${esc(p.name)}: ${fmtNumber(p.count)} văn bản</title></circle>`;
      acc += len;
      return seg;
    }).join('');
    const legend = parts.map((p, i) => {
      const pct = Math.round((p.count / total) * 1000) / 10;
      const inner = `<i class="legend-dot" style="background: ${TYPE_COLORS[i]}"></i><span class="legend-name">${esc(p.name)}</span><span class="legend-count">${fmtNumber(p.count)}</span><span class="legend-pct">${pct.toLocaleString('vi-VN')}%</span>`;
      const clickable = !p.other && p.name !== 'Chưa phân loại';
      return clickable
        ? `<li><button type="button" class="legend-row" data-type="${esc(p.name)}" title="Xem các văn bản ${esc(p.name)}">${inner}</button></li>`
        : `<li><div class="legend-row">${inner}</div></li>`;
    }).join('');
    host.innerHTML = `
      <div class="donut-wrap">
        <svg class="donut" viewBox="0 0 140 140" role="img" aria-label="Cơ cấu văn bản theo thể loại">
          <circle class="donut-track" cx="70" cy="70" r="${r}"></circle>
          <g transform="rotate(-90 70 70)">${arcs}</g>
        </svg>
        <div class="donut-center"><b>${fmtNumber(total)}</b><span>văn bản</span></div>
      </div>
      <ul class="donut-legend">${legend}</ul>`;
  }

  function renderRecent(list) {
    $('dashRecent').innerHTML = list.length ? list.map((d) => `
      <li>
        <button type="button" class="dash-item" data-doc-id="${Number(d.id)}">
          ${dirBadge(d.direction)}
          <span class="dash-item-main">
            <span class="dash-item-title"><b>${esc(d.so_ky_hieu || '--')}</b>${d.the_loai ? `<span class="dash-item-type">${esc(d.the_loai)}</span>` : ''}${isUrgent(d.do_khan) ? `<span class="urgency-chip is-urgent">${esc(d.do_khan)}</span>` : ''}</span>
            <span class="dash-item-sub">${esc(d.trich_yeu || '')}</span>
          </span>
          <span class="dash-item-date">${fmtDate(d.ngay)}</span>
        </button>
      </li>`).join('') : '<li class="dash-empty">Sổ chưa có văn bản.</li>';
  }

  function renderDeadlines(list, today) {
    $('dashDeadlines').innerHTML = list.length ? list.map((d) => {
      const left = daysBetween(today, d.han_xu_ly);
      const tone = left <= 2 ? 'is-hot' : left <= 7 ? 'is-warm' : '';
      const [, mm, dd] = d.han_xu_ly.split('-');
      return `
        <li>
          <button type="button" class="dash-item" data-doc-id="${Number(d.id)}">
            <span class="due-pill ${tone}"><b>${dd}/${mm}</b><span>${left === 0 ? 'Hôm nay' : `còn ${left} ngày`}</span></span>
            <span class="dash-item-main">
              <span class="dash-item-title"><b>${esc(d.so_ky_hieu || '--')}</b>${isUrgent(d.do_khan) ? `<span class="urgency-chip is-urgent">${esc(d.do_khan)}</span>` : ''}</span>
              <span class="dash-item-sub">${esc(d.trich_yeu || '')}</span>
            </span>
          </button>
        </li>`;
    }).join('') : `<li class="dash-empty dash-empty-ok">${CHECK_ICON}<span>Không có văn bản đến nào sắp tới hạn xử lý.</span></li>`;
  }

  function renderSpark(lookups) {
    const total = lookups.reduce((s, l) => s + (l.count || 0), 0);
    $('dashLookups').textContent = fmtNumber(total);
    const host = $('dashSpark');
    if (!lookups.length) { host.innerHTML = ''; return; }
    const W = 300; const H = 120; const P = 6;
    const max = Math.max(1, ...lookups.map((l) => l.count));
    const step = (W - P * 2) / Math.max(1, lookups.length - 1);
    const pts = lookups.map((l, i) => [P + i * step, H - P - (l.count / max) * (H - P * 2 - 6)]);
    const line = pts.map(([x, yy]) => `${x.toFixed(1)},${yy.toFixed(1)}`).join(' ');
    const area = `M${pts[0][0].toFixed(1)},${H - P} ${pts.map(([x, yy]) => `L${x.toFixed(1)},${yy.toFixed(1)}`).join(' ')} L${pts[pts.length - 1][0].toFixed(1)},${H - P} Z`;
    const dots = pts.map(([x, yy], i) => `<circle class="${i === pts.length - 1 ? 'sp-last' : 'sp-dot'}" cx="${x.toFixed(1)}" cy="${yy.toFixed(1)}" r="${i === pts.length - 1 ? 3.5 : 2.5}"><title>${fmtDate(lookups[i].day)}: ${fmtNumber(lookups[i].count)} lượt</title></circle>`).join('');
    host.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Lượt tra cứu qua Zalo 14 ngày gần nhất">
        <defs><linearGradient id="dashSparkFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#2563EB" stop-opacity="0.22"></stop><stop offset="100%" stop-color="#2563EB" stop-opacity="0"></stop></linearGradient></defs>
        <path class="sp-area" d="${area}" fill="url(#dashSparkFill)"></path>
        <polyline class="sp-line" points="${line}"></polyline>
        ${dots}
      </svg>
      <div class="dash-spark-axis"><span>${fmtDate(lookups[0].day).slice(0, 5)}</span><span>Hôm nay</span></div>`;
  }

  function bindDashboardEvents() {
    const onKey = (el, fn) => {
      el.addEventListener('click', fn);
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } });
    };
    // Thẻ sổ: mở Tra cứu với đúng sổ đó
    ['officeStatDen', 'officeStatDi'].forEach((id) => onKey($(id), () => openLookup({ direction: $(id).dataset.direction })));
    onKey($('dashKpiDue'), () => {
      const today = (state.dash && state.dash.today) || todayIso();
      const days = (state.dash && state.dash.dueSoonDays) || 7;
      openLookup({ direction: 'den', deadlineFrom: today, deadlineTo: addDays(today, days) }, { showCols: ['han'] });
    });
    $('dashGoImport').addEventListener('click', () => App.switchView('view-office-import'));
    $('dashGoZalo').addEventListener('click', () => {
      if (state.selectZaloTab) state.selectZaloTab('zaloPanelCodes');
      App.switchView('view-office-zalo');
      setTimeout(() => $('officeCodeStaff').focus(), 0);
    });
    $('dashGoZaloUsers').addEventListener('click', () => {
      if (state.selectZaloTab) state.selectZaloTab('zaloPanelUsers');
      App.switchView('view-office-zalo');
    });
    $('dashAddDoc').addEventListener('click', () => {
      App.switchView('view-office-manage');
      openEditModal(null);
    });
    $('dashSeeAll').addEventListener('click', () => openLookup({}));
    ['dashRecent', 'dashDeadlines'].forEach((id) => $(id).addEventListener('click', (e) => {
      const b = e.target.closest('[data-doc-id]');
      if (b) openDocModal(parseInt(b.dataset.docId, 10));
    }));
    $('dashTypes').addEventListener('click', (e) => {
      const b = e.target.closest('[data-type]');
      if (b) openLookup({ theLoai: b.dataset.type }, { showCols: ['loai'] });
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
    $('officeDocCode').innerHTML = skel('96px', 'skel-sm skel-inline');
    $('officeDocTitle').innerHTML = `<span class="sr-only">Đang tải văn bản</span>${skel('220px', 'skel-title')}`;
    $('officeDocDirBadge').innerHTML = skel('58px', 'skel-badge skel-inline');
    $('officeDocBody').setAttribute('aria-busy', 'true');
    $('officeDocBody').innerHTML = `
      <div class="od-skel" aria-hidden="true">
        <div class="od-summary">${skel(94)}${skel(68)}</div>
        <div class="od-grid">${[64, 48, 56, 72, 44, 60, 52, 40].map((w) => `<div class="od-field">${skel(36, 'skel-sm')}${skel(w)}</div>`).join('')}</div>
      </div>`;
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
      $('officeDocCode').textContent = '--';
      $('officeDocTitle').textContent = 'Chi tiết văn bản';
      $('officeDocDirBadge').innerHTML = '';
      $('officeDocBody').innerHTML = `<p class="cell-muted">Không tải được văn bản: ${esc(e.message)}</p>`;
    } finally {
      $('officeDocBody').removeAttribute('aria-busy');
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
    const table = state.tables.imports;
    table.setLoading();
    try {
      const res = await apiRequest('/api/office-docs/imports');
      table.setRows(res.imports || []);
    } catch (e) {
      table.setError('Không tải được lịch sử nhập: ' + e.message);
    }
  }

  // ============================================================
  // MÃ KÍCH HOẠT + TÀI KHOẢN ZALO (ADMIN): lọc theo cột, sửa, thu hồi, xóa
  // ============================================================
  const codeState = (c) => (c.used_at ? 'used' : c.is_active ? 'pending' : 'expired');
  const CODE_STATE_LABEL = { used: 'Đã dùng', pending: 'Chờ kích hoạt', expired: 'Hết hạn / thu hồi' };

  function codeStatus(c) {
    if (c.used_at) return `<span class="status-badge badge-active">Đã dùng</span>${c.used_by_name ? `<span class="cell-sub">${esc(c.used_by_name)}</span>` : ''}`;
    if (c.is_active) return '<span class="status-badge status-pending">Chờ kích hoạt</span>';
    return '<span class="status-badge badge-expired">Hết hạn / thu hồi</span>';
  }

  function actionBtn(action, icon, label, tone) {
    return `<button type="button" class="action-icon-btn btn-icon-${tone}" data-action="${action}" aria-label="${esc(label)}" title="${esc(label)}">${icon}</button>`;
  }

  function zaloSwitch(u) {
    return `
      <label class="switch" title="${u.can_lookup_office ? 'Đang được tra cứu' : 'Chưa được tra cứu'}">
        <input type="checkbox" data-zalo-id="${esc(u.zalo_id)}" ${u.can_lookup_office ? 'checked' : ''} aria-label="Quyền tra cứu của ${esc(u.display_name || u.zalo_id)}">
        <span class="switch-track"><span class="switch-thumb"></span></span>
      </label>`;
  }

  /** Tạo 3 bảng lọc phía trình duyệt (dữ liệu nhỏ, tải một lần) */
  function initClientTables() {
    const dirOptions = [{ value: 'den', label: 'Đến' }, { value: 'di', label: 'Đi' }];
    const num = (key, label, width, field, tone = '') => ({
      key, label, width, align: 'right', sortable: true,
      value: (r) => (typeof field === 'function' ? field(r) : Number(r[field] || 0)),
      render: (r) => `<span class="num ${tone}">${fmtNumber(typeof field === 'function' ? field(r) : r[field])}</span>`,
    });

    state.tables.imports = createClientTable({
      host: $('importsTableHost'),
      id: 'importsTable',
      unit: 'lần nhập',
      pageSize: 10,
      defaultSort: { key: 'time', order: 'desc' },
      emptyText: 'Chưa có lần nhập nào.',
      noMatchText: 'Không có lần nhập phù hợp bộ lọc.',
      rowId: (r) => r.id,
      columns: [
        { key: 'time', label: 'Thời gian', width: 156, locked: true, sortable: true, filter: 'date', value: (r) => r.created_at, dateOf: (r) => localDay(r.created_at), render: (r) => `<span class="cell-date">${fmtDateTime(r.created_at)}</span>` },
        { key: 'dir', label: 'Sổ', width: 88, filter: { options: dirOptions }, value: (r) => r.direction, render: (r) => dirBadge(r.direction) },
        { key: 'file', label: 'Tên file', filter: 'text', sortable: true, value: (r) => r.file_name || '', render: (r) => `<span class="clamp-1" title="${esc(r.file_name || '')}">${esc(r.file_name || '--')}</span>` },
        { key: 'report', label: 'Chốt ngày', width: 132, sortable: true, filter: 'date', value: (r) => r.report_date || '', dateOf: (r) => String(r.report_date || '').slice(0, 10), render: (r) => fmtDate(r.report_date) },
        { ...num('rows', 'Số dòng', 96, 'total_rows'), defaultHidden: true },
        num('ins', 'Thêm mới', 100, 'inserted', 'tone-good'),
        num('upd', 'Cập nhật', 100, 'updated'),
        num('same', 'Không đổi', 104, 'unchanged', 'cell-muted'),
        num('skip', 'Bỏ qua', 92, (r) => (r.skipped_secret || 0) + (r.skipped_unpublished || 0)),
        { key: 'by', label: 'Người nhập', width: 160, filter: 'text', sortable: true, value: (r) => r.imported_by_name || '' },
      ],
    });

    state.tables.codes = createClientTable({
      host: $('codesTableHost'),
      id: 'codesTable',
      unit: 'mã',
      pageSize: 10,
      defaultSort: { key: 'created', order: 'desc' },
      emptyText: 'Chưa có mã nào.',
      noMatchText: 'Không có mã phù hợp bộ lọc.',
      rowId: (c) => c.id,
      columns: [
        { key: 'staff', label: 'Cán bộ được cấp', locked: true, filter: 'text', sortable: true, value: (c) => c.staff_label || '', render: (c) => `<b>${esc(c.staff_label || '--')}</b>` },
        { key: 'creator', label: 'Người tạo', width: 150, filter: 'text', sortable: true, value: (c) => c.created_by_name || '' },
        { key: 'created', label: 'Ngày tạo', width: 156, filter: 'date', sortable: true, value: (c) => c.created_at || '', dateOf: (c) => localDay(c.created_at), render: (c) => `<span class="cell-date">${fmtDateTime(c.created_at)}</span>` },
        { key: 'expires', label: 'Hết hạn / dùng lúc', width: 164, filter: 'date', sortable: true, value: (c) => c.used_at || c.expires_at || '', dateOf: (c) => localDay(c.used_at || c.expires_at), render: (c) => `<span class="cell-date">${fmtDateTime(c.used_at || c.expires_at)}</span>` },
        { key: 'status', label: 'Trạng thái', width: 168, filter: { options: Object.entries(CODE_STATE_LABEL).map(([value, label]) => ({ value, label })) }, value: codeState, render: codeStatus },
        { key: 'usedby', label: 'Người kích hoạt', width: 170, defaultHidden: true, filter: 'text', value: (c) => c.used_by_name || '' },
      ],
      actions: {
        width: 124,
        render: (c) => `<div class="row-actions">${actionBtn('edit', ICONS.edit, `Sửa mã của ${c.staff_label || 'cán bộ'}`, 'edit')}${c.is_active ? actionBtn('revoke', ICONS.ban, 'Thu hồi mã', 'warn') : ''}${actionBtn('delete', ICONS.trash, 'Xóa mã', 'delete')}</div>`,
      },
    });

    state.tables.zalo = createClientTable({
      host: $('zaloUsersTableHost'),
      id: 'zaloUsersTable',
      unit: 'tài khoản',
      pageSize: 20,
      defaultSort: { key: 'last', order: 'desc' },
      emptyText: 'Chưa có ai nhắn tin cho bot.',
      noMatchText: 'Không có tài khoản phù hợp bộ lọc.',
      rowId: (u) => u.zalo_id,
      columns: [
        { key: 'name', label: 'Tên Zalo', locked: true, filter: 'text', sortable: true, value: (u) => u.display_name || '', render: (u) => `<b>${esc(u.display_name || 'Người dùng Zalo')}</b>` },
        { key: 'staff', label: 'Cán bộ', width: 190, filter: 'text', sortable: true, value: (u) => u.staff_label || '' },
        { key: 'zid', label: 'Zalo ID', width: 176, filter: 'text', value: (u) => u.zalo_id, render: (u) => `<span class="source-id">${esc(u.zalo_id)}</span>` },
        { key: 'last', label: 'Hoạt động gần nhất', width: 168, filter: 'date', sortable: true, value: (u) => u.last_active || '', dateOf: (u) => localDay(u.last_active), render: (u) => `<span class="cell-date">${fmtDateTime(u.last_active)}</span>` },
        { ...num('count', 'Số câu hỏi', 108, 'query_count'), defaultHidden: true },
        { key: 'notes', label: 'Ghi chú', width: 210, defaultHidden: true, filter: 'text', value: (u) => u.notes || '', render: (u) => (u.notes ? `<span class="clamp-2" title="${esc(u.notes)}">${esc(u.notes)}</span>` : '<span class="cell-muted">--</span>') },
        { key: 'state', label: 'Tình trạng', width: 132, filter: { options: [{ value: 'active', label: 'Hoạt động' }, { value: 'blocked', label: 'Đã chặn' }] }, value: (u) => (u.is_blocked ? 'blocked' : 'active'), render: (u) => (u.is_blocked ? '<span class="status-badge badge-expired">Đã chặn</span>' : '<span class="status-badge badge-active">Hoạt động</span>') },
        { key: 'perm', label: 'Quyền tra cứu', width: 132, align: 'center', filter: { options: [{ value: 'yes', label: 'Được tra cứu' }, { value: 'no', label: 'Chưa cấp' }] }, value: (u) => (u.can_lookup_office ? 'yes' : 'no'), render: zaloSwitch },
      ],
      actions: {
        width: 104,
        render: (u) => `<div class="row-actions">${actionBtn('edit', ICONS.edit, `Sửa ${u.display_name || u.zalo_id}`, 'edit')}${actionBtn('delete', ICONS.trash, `Xóa ${u.display_name || u.zalo_id}`, 'delete')}</div>`,
      },
    });
  }

  async function loadCodes() {
    state.tables.codes.setLoading();
    try {
      const res = await apiRequest('/api/zalo-activation-codes');
      state.tables.codes.setRows(res.codes || []);
    } catch (e) {
      state.tables.codes.setError('Không tải được danh sách mã: ' + e.message);
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

  async function revokeCode(c) {
    const ok = await showConfirmDialog({
      title: 'Thu hồi mã kích hoạt',
      message: `Thu hồi mã đã cấp cho <b>${esc(c.staff_label || 'cán bộ')}</b>? Mã sẽ không dùng được nữa.`,
      type: 'warning',
      confirmText: 'Thu hồi',
    });
    if (!ok) return;
    try {
      const res = await apiRequest(`/api/zalo-activation-codes/${Number(c.id)}/revoke`, { method: 'POST' });
      showToast(res.message || 'Đã thu hồi mã.', 'success');
      loadCodes();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function deleteCode(c) {
    const ok = await showConfirmDialog({
      title: 'Xóa mã kích hoạt',
      message: `Xóa mã đã cấp cho <b>${esc(c.staff_label || 'cán bộ')}</b> khỏi danh sách? ${c.used_at
        ? 'Mã đã được dùng: tài khoản Zalo đã kích hoạt vẫn giữ quyền, muốn thu hồi hãy tắt quyền ở tab Tài khoản Zalo.'
        : 'Mã sẽ không dùng được nữa.'}`,
      type: 'danger',
      confirmText: 'Xóa mã',
      cancelText: 'Giữ lại',
    });
    if (!ok) return;
    try {
      const res = await apiRequest(`/api/zalo-activation-codes/${Number(c.id)}`, { method: 'DELETE' });
      showToast(res.message || 'Đã xóa mã.', 'success');
      loadCodes();
    } catch (err) {
      showToast(err.message, 'error');
    }
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

    $('codesTableHost').addEventListener('click', (e) => {
      const b = e.target.closest('tbody [data-action]');
      if (!b) return;
      const c = state.tables.codes.rowById(b.closest('tr').dataset.rowId);
      if (!c) return;
      if (b.dataset.action === 'edit') openZaloEdit('code', c);
      else if (b.dataset.action === 'revoke') revokeCode(c);
      else if (b.dataset.action === 'delete') deleteCode(c);
    });
  }

  async function loadZaloUsers() {
    state.tables.zalo.setLoading();
    try {
      const res = await apiRequest('/api/zalo-users');
      const users = res.users || [];
      state.tables.zalo.setRows(users);
      const count = $('zaloUsersCount');
      count.textContent = fmtNumber(users.length);
      count.classList.toggle('hidden', !users.length);
    } catch (e) {
      state.tables.zalo.setError('Không tải được danh sách: ' + e.message);
    }
  }

  async function deleteZaloUser(u) {
    const name = esc(u.display_name || u.zalo_id);
    const ok = await showConfirmDialog({
      title: 'Xóa tài khoản Zalo',
      message: `Xóa <b>${name}</b> khỏi danh sách? Tài khoản mất quyền tra cứu và bộ nhớ hội thoại. Nếu người này nhắn bot lần nữa, tài khoản sẽ xuất hiện lại nhưng <b>chưa có quyền</b>; muốn chặn hẳn hãy dùng "Chặn tài khoản" trong Sửa.`,
      type: 'danger',
      confirmText: 'Xóa tài khoản',
      cancelText: 'Giữ lại',
    });
    if (!ok) return;
    try {
      const res = await apiRequest(`/api/zalo-users/${encodeURIComponent(u.zalo_id)}`, { method: 'DELETE' });
      showToast(res.message || 'Đã xóa tài khoản.', 'success');
      loadZaloUsers();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  function bindZaloEvents() {
    const host = $('zaloUsersTableHost');
    host.addEventListener('change', async (e) => {
      const input = e.target.closest('tbody input[data-zalo-id]');
      if (!input) return;
      const zaloId = input.dataset.zaloId;
      const allowed = input.checked;
      const user = state.tables.zalo.rowById(zaloId) || {};
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
        state.tables.zalo.refresh();
      } catch (err) {
        input.checked = !allowed;
        input.disabled = false;
        showToast(err.message, 'error');
      }
    });
    host.addEventListener('click', (e) => {
      const b = e.target.closest('tbody [data-action]');
      if (!b) return;
      const u = state.tables.zalo.rowById(b.closest('tr').dataset.rowId);
      if (!u) return;
      if (b.dataset.action === 'edit') openZaloEdit('user', u);
      else if (b.dataset.action === 'delete') deleteZaloUser(u);
    });

    // Modal sửa mã / tài khoản
    $('zaloEditForm').addEventListener('submit', saveZaloEdit);
    $('btnCloseZaloEdit').addEventListener('click', closeZaloEdit);
    $('btnCancelZaloEdit').addEventListener('click', closeZaloEdit);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && $('zaloEditModal').classList.contains('active')) closeZaloEdit();
    });
  }

  // ---- Modal sửa mã kích hoạt / tài khoản Zalo ----
  function openZaloEdit(mode, row) {
    const form = $('zaloEditForm');
    const isUser = mode === 'user';
    state.zaloEdit = { mode, row };
    state.zaloEditFocus = document.activeElement;
    form.reset();
    $('zaloEditError').classList.add('hidden');
    $('zaloEditError').textContent = '';
    $('zaloEditTitle').textContent = isUser ? 'Sửa tài khoản Zalo' : 'Sửa mã kích hoạt';
    form.querySelector('[data-mode="user"]').hidden = !isUser;
    $('zaloEditLabelReq').hidden = isUser;
    const meta = isUser
      ? [['Tên Zalo', row.display_name || 'Người dùng Zalo'], ['Zalo ID', row.zalo_id], ['Hoạt động gần nhất', fmtDateTime(row.last_active)], ['Số câu hỏi', fmtNumber(row.query_count)]]
      : [['Trạng thái', CODE_STATE_LABEL[codeState(row)]], ['Người tạo', row.created_by_name || '--'], ['Ngày tạo', fmtDateTime(row.created_at)], [row.used_at ? 'Dùng lúc' : 'Hết hạn', fmtDateTime(row.used_at || row.expires_at)]];
    $('zaloEditMeta').innerHTML = meta.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('');
    form.elements.staffLabel.value = row.staff_label || '';
    if (isUser) {
      form.elements.notes.value = row.notes || '';
      form.elements.canLookup.checked = !!row.can_lookup_office;
      form.elements.isBlocked.checked = !!row.is_blocked;
    }
    $('zaloEditModal').classList.add('active');
    setTimeout(() => form.elements.staffLabel.focus(), 0);
  }

  function closeZaloEdit() {
    if (state.zaloSaving) return;
    $('zaloEditModal').classList.remove('active');
    state.zaloEdit = null;
    if (state.zaloEditFocus && state.zaloEditFocus.focus && document.contains(state.zaloEditFocus)) state.zaloEditFocus.focus();
  }

  async function saveZaloEdit(e) {
    e.preventDefault();
    const ctx = state.zaloEdit;
    if (!ctx || state.zaloSaving) return;
    const form = $('zaloEditForm');
    const staffLabel = form.elements.staffLabel.value.trim();
    const errBox = $('zaloEditError');
    if (ctx.mode === 'code' && !staffLabel) {
      errBox.textContent = 'Vui lòng nhập họ tên, chức vụ cán bộ.';
      errBox.classList.remove('hidden');
      form.elements.staffLabel.focus();
      return;
    }
    const isUser = ctx.mode === 'user';
    const url = isUser
      ? `/api/zalo-users/${encodeURIComponent(ctx.row.zalo_id)}`
      : `/api/zalo-activation-codes/${Number(ctx.row.id)}`;
    const body = isUser
      ? { staffLabel, notes: form.elements.notes.value.trim(), canLookup: form.elements.canLookup.checked, isBlocked: form.elements.isBlocked.checked }
      : { staffLabel };
    const btn = $('btnSaveZaloEdit');
    state.zaloSaving = true;
    setBusy(btn, true, 'Đang lưu...');
    try {
      const res = await apiRequest(url, { method: 'PUT', body: JSON.stringify(body) });
      state.zaloSaving = false;
      closeZaloEdit();
      showToast(res.message || 'Đã lưu.', 'success');
      if (isUser) loadZaloUsers(); else loadCodes();
    } catch (err) {
      errBox.textContent = err.message;
      errBox.classList.remove('hidden');
    } finally {
      state.zaloSaving = false;
      setBusy(btn, false);
    }
  }

  // ============================================================
  // TAB (trang Cấp quyền Zalo): ARIA tabs, phím mũi tên để chuyển
  // ============================================================
  /** Trả về hàm chọn tab theo id panel (dùng khi mở từ trang Tổng quan) */
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
    return (panelId) => { const t = tabs.find((x) => x.dataset.panel === panelId); if (t) select(t); };
  }

  // ============================================================
  // QUẢN LÝ VĂN BẢN (ADMIN): danh sách + thêm / sửa / xóa
  // ============================================================
  /** Cột -> khóa lọc trên hàng lọc cột (ẩn cột thì bỏ lọc cột đó) */
  const MANAGE_COL_FILTER = { ngay: 'docDate', loai: 'theLoai', nguoiky: 'nguoiKy', ma: 'sourceId', nguon: 'nguon' };

  const manageHasFilter = () => !!state.manage.keyword || Object.values(state.manage.filters).some(Boolean);

  async function loadManage() {
    const m = state.manage;
    const seq = ++m.seq;
    const body = $('manageTableBody');
    beginTableLoad($('manageTable'), body, Math.min(m.pageSize, 10));
    const p = new URLSearchParams({ page: m.page, pageSize: m.pageSize });
    Object.entries(m.filters).forEach(([k, v]) => {
      if (!v) return;
      if (k === 'docDate') { p.set('docDateFrom', v); p.set('docDateTo', v); } else p.set(k, v);
    });
    if (m.keyword) p.set('keyword', m.keyword);
    if (m.sort) { p.set('sort', m.sort); p.set('order', m.order); }
    try {
      const res = await apiRequest('/api/office-docs?' + p.toString());
      if (seq !== m.seq) return;
      // Xóa hết dòng ở trang cuối thì lùi về trang trước
      if (!res.items.length && m.page > 1 && res.total > 0) { m.page = res.pages; loadManage(); return; }
      renderManage(res);
      renderPager(res, $('managePaginationInfo'), $('managePaginationButtons'));
    } catch (e) {
      if (seq !== m.seq) return;
      body.innerHTML = emptyRow($('manageTable'), 'Không tải được danh sách: ' + e.message);
    } finally {
      if (seq === m.seq) endTableLoad(body);
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
      body.innerHTML = emptyRow($('manageTable'), manageHasFilter()
        ? 'Không có văn bản phù hợp.'
        : 'Sổ chưa có văn bản. Bấm "Thêm văn bản" hoặc nhập file Excel.');
      return;
    }
    const offset = (res.page - 1) * res.pageSize;
    body.innerHTML = items.map((d, i) => `
      <tr data-id="${Number(d.id)}">
        <td style="text-align: center;" class="col-stt cell-muted">${offset + i + 1}</td>
        <td class="col-so"><span class="doc-number">${esc(d.so_ky_hieu || '--')}</span></td>
        <td class="col-ngay cell-date">${fmtDate(d.ngay_van_ban)}</td>
        <td class="col-dir">${dirBadge(d.direction)}</td>
        <td class="col-loai">${d.the_loai ? `<span class="type-chip">${esc(d.the_loai)}</span>` : '<span class="cell-muted">--</span>'}</td>
        <td class="col-trichyeu cell-summary"><span class="clamp-2" title="${esc(d.trich_yeu || '')}">${esc(d.trich_yeu || '--')}</span></td>
        <td class="col-nguoiky cell-signer">${esc(d.nguoi_ky || '--')}</td>
        <td class="col-ma"><span class="source-id">${esc(d.source_id || '--')}</span></td>
        <td class="col-nguon cell-source">${sourceCell(d)}</td>
        <td class="sticky-action-col">
          <div class="row-actions">
            <button type="button" class="action-icon-btn btn-icon-edit" data-edit="${Number(d.id)}" aria-label="Sửa ${esc(d.so_ky_hieu || 'văn bản')}" title="Sửa">${ICONS.edit}</button>
            <button type="button" class="action-icon-btn btn-icon-delete" data-delete="${Number(d.id)}" data-label="${esc(d.so_ky_hieu || d.source_id || '')}" aria-label="Xóa ${esc(d.so_ky_hieu || 'văn bản')}" title="Xóa">${ICONS.trash}</button>
          </div>
        </td>
      </tr>`).join('');
  }

  /** Ghi trạng thái lọc / sắp xếp của trang Quản lý ra hàng lọc, tab sổ và tiêu đề cột */
  function syncManageInputs(except) {
    const m = state.manage;
    document.querySelectorAll('#manageFilterRow [data-filter]').forEach((el) => {
      if (el !== except) el.value = m.filters[el.dataset.filter] || '';
      el.classList.toggle('has-value', !!el.value);
    });
    document.querySelectorAll('#manageDirectionTabs .segmented-btn').forEach((b) => {
      const on = (b.dataset.direction || '') === (m.filters.direction || '');
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    $('btnManageClearColumns').classList.toggle('is-active', Object.values(m.filters).some(Boolean));
    const activeSort = m.sort || 'ngay';
    const activeOrder = m.sort ? m.order : 'desc';
    document.querySelectorAll('#manageTable th.sortable').forEach((th) => {
      const on = th.dataset.sort === activeSort;
      th.classList.toggle('sort-asc', on && activeOrder === 'asc');
      th.classList.toggle('sort-desc', on && activeOrder === 'desc');
      th.setAttribute('aria-sort', on ? (activeOrder === 'asc' ? 'ascending' : 'descending') : 'none');
    });
  }

  function applyManage(except) {
    state.manage.page = 1;
    syncManageInputs(except);
    loadManage();
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
      const dir = state.manage.filters.direction || 'den';
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
      m.filters.direction = b.dataset.direction || '';
      applyManage();
    });
    $('manageSearchInput').addEventListener('input', debounce((e) => {
      m.keyword = e.target.value.trim();
      m.page = 1;
      loadManage();
    }, 350));

    // Hàng lọc theo cột (lọc ở máy chủ): ô chữ áp dụng sau 400ms ngừng gõ, ô chọn/ngày áp dụng ngay
    const row = $('manageFilterRow');
    const onText = debounce((el) => applyManage(el), 400);
    row.addEventListener('input', (e) => {
      const el = e.target.closest('input[type="text"].col-filter');
      if (!el) return;
      m.filters[el.dataset.filter] = el.value.trim();
      onText(el);
    });
    row.addEventListener('change', (e) => {
      const el = e.target.closest('select.col-filter, input[type="date"].col-filter');
      if (!el) return;
      m.filters[el.dataset.filter] = el.value;
      applyManage(el);
    });
    row.addEventListener('keydown', (e) => {
      const el = e.target.closest('input[type="text"].col-filter');
      if (el && e.key === 'Enter') { e.preventDefault(); m.filters[el.dataset.filter] = el.value.trim(); applyManage(el); }
    });
    $('btnManageClearColumns').addEventListener('click', () => { m.filters = {}; applyManage(); });

    document.querySelectorAll('#manageTable th.sortable').forEach((th) => {
      th.tabIndex = 0;
      const sortBy = () => {
        const key = th.dataset.sort;
        if ((m.sort || 'ngay') === key) { m.sort = key; m.order = m.order === 'asc' ? 'desc' : 'asc'; }
        else { m.sort = key; m.order = key === 'ngay' ? 'desc' : 'asc'; }
        applyManage();
      };
      th.addEventListener('click', sortBy);
      th.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sortBy(); } });
    });

    state.manageChooser = createColumnChooser({
      table: $('manageTable'),
      button: $('btnManageColumns'),
      storageKey: 'office.cols.manageTable',
      columns: [
        { key: 'stt', label: 'STT', locked: true },
        { key: 'so', label: 'Số / Ký hiệu', locked: true },
        { key: 'ngay', label: 'Ngày văn bản' },
        { key: 'dir', label: 'Sổ' },
        { key: 'loai', label: 'Thể loại' },
        { key: 'trichyeu', label: 'Trích yếu', locked: true },
        { key: 'nguoiky', label: 'Người ký', defaultHidden: true },
        { key: 'ma', label: 'Mã văn bản' },
        { key: 'nguon', label: 'Nguồn dữ liệu' },
      ],
      onChange: (hidden, key, visible) => {
        const fk = MANAGE_COL_FILTER[key];
        if (!visible && fk && m.filters[fk]) { delete m.filters[fk]; applyManage(); }
      },
    });

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
  initClientTables();
  bindTableEvents();
  bindDashboardEvents();
  bindModalEvents();
  bindChatEvents();
  bindImportEvents();
  bindCodeEvents();
  bindZaloEvents();
  state.selectZaloTab = bindTabs('zaloTabs');
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
      $('zaloEditModal').classList.remove('active');
    }
  });

  document.addEventListener('admin:viewchange', (e) => {
    const viewId = e.detail && e.detail.viewId;
    if (ADMIN_VIEWS.includes(viewId) && !isAdmin()) { App.switchView('view-office'); return; }
    switch (viewId) {
      case 'view-office-dashboard':
        loadDashboard();
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
        syncManageInputs();
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
