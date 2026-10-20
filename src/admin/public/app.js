/**
 * Hệ Thống Tri Thức Đảng & Quản Trị RAG Zalo AI v2.0
 * Frontend Application Controller - Enterprise GovTech Light Theme
 * Tuân thủ nghiêm ngặt: ZERO-EMOJI 100%, Vector SVG Icons, Tooltip trễ 0.3s
 */

(function () {
  'use strict';

  // ============================================================
  // GLOBAL STATE MANAGEMENT
  // ============================================================
  const state = {
    currentUser: null,
    activeView: 'view-documents',
    
    // Documents State
    allDocuments: [],
    filteredDocuments: [],
    docSearchQuery: '',
    docCategoryFilter: '',
    docStatusFilter: '',
    docSort: 'date_desc',
    docCurrentPage: 1,
    docPageSize: 10,
    docColumns: {
      issuer: true,
      category: true,
      status: true,
      date: false,
      count: false,
      desc: false,
    },
    
    // Editor State
    editingDocId: null,
    editingArticles: [],
    editorArticleFilterQuery: '',
    
    // Logs State
    activeSubTab: 'subtab-logs',
    allLogs: [],
    filteredLogs: [],
    logSearchQuery: '',
    logIntentFilter: '',
    logSpeedFilter: '',
    logCurrentPage: 1,
    logPageSize: 10,
    
    // Zalo Users State
    allZaloUsers: [],
    filteredZaloUsers: [],
    zaloUserSearchQuery: '',
    zaloUserStatusFilter: '',
    zaloUserCurrentPage: 1,
    zaloUserPageSize: 10,
    
    // Admin Users State
    allAdmins: [],
    filteredAdmins: [],
    adminSearchQuery: '',
    adminRoleFilter: '',
    adminStatusFilter: '',
    adminCurrentPage: 1,
    adminPageSize: 10,
    
    // Modal View Detail State
    currentModalDoc: null,
  };

  // Khôi phục cấu hình cột từ localStorage nếu có
  try {
    const savedCols = localStorage.getItem('doc_table_columns');
    if (savedCols) {
      state.docColumns = Object.assign(state.docColumns, JSON.parse(savedCols));
    }
  } catch (e) {}

  // ============================================================
  // SVG ICONS LIBRARY (100% PURE VECTOR - ZERO EMOJI)
  // ============================================================
  const ICONS = {
    view: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`,
    edit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>`,
    delete: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>`,
    copy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`,
    test: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>`,
    lock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`,
    unlock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg>`,
    history: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 14 14"></polyline></svg>`,
    arrowUp: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>`,
    arrowDown: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline></svg>`,
    insertBelow: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`,
    firstPage: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><polyline points="11 17 6 12 11 7"></polyline><polyline points="18 17 13 12 18 7"></polyline></svg>`,
    prevPage: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><polyline points="15 18 9 12 15 6"></polyline></svg>`,
    nextPage: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><polyline points="9 18 15 12 9 6"></polyline></svg>`,
    lastPage: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><polyline points="13 17 18 12 13 7"></polyline><polyline points="6 17 11 12 6 7"></polyline></svg>`,
    success: `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`,
    error: `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`,
    warning: `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`,
    info: `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`,
  };

  // ============================================================
  // TOAST NOTIFICATION UTILITY (ZERO EMOJI)
  // ============================================================
  function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let iconHtml = ICONS.info;
    if (type === 'success') iconHtml = ICONS.success;
    else if (type === 'error') iconHtml = ICONS.error;
    else if (type === 'warning') iconHtml = ICONS.warning;

    toast.innerHTML = `
      ${iconHtml}
      <div class="toast-message">${escapeHtml(message)}</div>
    `;

    container.appendChild(toast);
    
    // Kích hoạt animation hiện
    requestAnimationFrame(() => {
      toast.classList.add('show');
    });

    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 300);
    }, 3500);
  }

  // ============================================================
  // CUSTOM CONFIRMATION MODAL UTILITY (ENTERPRISE GOVTECH)
  // ============================================================
  const confirmModal = document.getElementById('confirmModal');
  const confirmModalTitle = document.getElementById('confirmModalTitle');
  const confirmModalMessage = document.getElementById('confirmModalMessage');
  const confirmModalIconBox = document.getElementById('confirmModalIconBox');
  const btnConfirmSubmit = document.getElementById('btnConfirmSubmit');
  const btnConfirmSubmitText = document.getElementById('btnConfirmSubmitText');
  const btnConfirmCancel = document.getElementById('btnConfirmCancel');
  const btnConfirmCancelText = document.getElementById('btnConfirmCancelText');

  function showConfirmDialog({
    title = 'Xác nhận thao tác',
    message = 'Đồng chí có chắc chắn muốn thực hiện thao tác này?',
    type = 'danger', // 'danger' | 'warning' | 'info'
    confirmText = 'Xác nhận',
    cancelText = 'Hủy bỏ',
  } = {}) {
    return new Promise((resolve) => {
      if (!confirmModal) {
        return resolve(window.confirm(message.replace(/<[^>]+>/g, '')));
      }

      confirmModalTitle.textContent = title;
      confirmModalMessage.innerHTML = message;
      btnConfirmSubmitText.textContent = confirmText;
      btnConfirmCancelText.textContent = cancelText;

      // Cập nhật kiểu dáng và icon theo type
      confirmModalIconBox.className = `confirm-icon-box confirm-icon-${type}`;
      btnConfirmSubmit.className = `btn btn-${type === 'info' ? 'primary' : type}`;

      let iconHtml = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
      `;

      if (type === 'danger') {
        iconHtml = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            <line x1="10" y1="11" x2="10" y2="17"></line>
            <line x1="14" y1="11" x2="14" y2="17"></line>
          </svg>
        `;
      } else if (type === 'warning') {
        iconHtml = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
            <line x1="12" y1="9" x2="12" y2="13"></line>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
          </svg>
        `;
      }

      confirmModalIconBox.innerHTML = iconHtml;

      function cleanup(result) {
        confirmModal.classList.remove('active');
        btnConfirmSubmit.removeEventListener('click', onConfirm);
        btnConfirmCancel.removeEventListener('click', onCancel);
        document.removeEventListener('keydown', onKeyDown);
        confirmModal.removeEventListener('click', onOverlayClick);
        resolve(result);
      }

      function onConfirm() { cleanup(true); }
      function onCancel() { cleanup(false); }
      function onOverlayClick(e) {
        if (e.target === confirmModal) cleanup(false);
      }
      function onKeyDown(e) {
        if (e.key === 'Escape') cleanup(false);
      }

      btnConfirmSubmit.addEventListener('click', onConfirm);
      btnConfirmCancel.addEventListener('click', onCancel);
      confirmModal.addEventListener('click', onOverlayClick);
      document.addEventListener('keydown', onKeyDown);

      confirmModal.classList.add('active');
      btnConfirmSubmit.focus();
    });
  }

  // ============================================================
  // UTILITY HELPERS
  // ============================================================
  function escapeHtml(text) {
    if (!text && text !== 0) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatDate(isoStr) {
    if (!isoStr) return '--';
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return isoStr;
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      return `${day}/${month}/${year}`;
    } catch (e) {
      return isoStr;
    }
  }

  function formatDateTime(isoStr) {
    if (!isoStr) return '--';
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return isoStr;
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      const hours = String(d.getHours()).padStart(2, '0');
      const mins = String(d.getMinutes()).padStart(2, '0');
      const secs = String(d.getSeconds()).padStart(2, '0');
      return `${day}/${month}/${year} ${hours}:${mins}:${secs}`;
    } catch (e) {
      return isoStr;
    }
  }

  function debounce(func, wait) {
    let timeout;
    return function (...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  function copyToClipboard(text, successMsg = 'Đã sao chép nội dung vào bộ nhớ tạm.') {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        showToast(successMsg, 'success');
      }).catch(() => {
        fallbackCopy(text, successMsg);
      });
    } else {
      fallbackCopy(text, successMsg);
    }
  }

  function fallbackCopy(text, successMsg) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      showToast(successMsg, 'success');
    } catch (e) {
      showToast('Không thể tự động sao chép, vui lòng sao chép thủ công.', 'warning');
    }
    document.body.removeChild(ta);
  }

  function getCategoryLabel(cat) {
    switch (cat) {
      case 'quy_dinh_dang':
        return '<span class="category-badge cat-quy-dinh">Quy định Đảng</span>';
      case 'the_thuc':
        return '<span class="category-badge cat-the-thuc">Thể thức văn bản</span>';
      case 'van_thu_luu_tru':
        return '<span class="category-badge cat-van-thu">Văn thư & Lưu trữ</span>';
      default:
        return `<span class="category-badge cat-quy-dinh">${escapeHtml(cat || 'Quy định')}</span>`;
    }
  }

  function getRoleBadge(role) {
    if (role === 'superadmin') {
      return '<span class="category-badge cat-quy-dinh">Quản trị tối cao</span>';
    } else if (role === 'admin') {
      return '<span class="category-badge cat-the-thuc">Quản trị viên</span>';
    }
    return '<span class="category-badge cat-van-thu">Cán bộ nghiệp vụ</span>';
  }

  // ============================================================
  // API CLIENT
  // ============================================================
  async function apiRequest(endpoint, options = {}) {
    try {
      const res = await fetch(endpoint, {
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {}),
        },
        ...options,
      });

      if (res.status === 401) {
        showLoginScreen();
        throw new Error('Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.');
      }

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Yêu cầu thất bại (HTTP ${res.status})`);
      }
      return data;
    } catch (err) {
      console.warn(`[API Error] ${endpoint}:`, err.message);
      throw err;
    }
  }

  // ============================================================
  // AUTHENTICATION & APP INITIALIZATION
  // ============================================================
  const loginScreen = document.getElementById('loginScreen');
  const mainApp = document.getElementById('mainApp');
  const loginForm = document.getElementById('loginForm');
  const loginUsername = document.getElementById('loginUsername');
  const loginPassword = document.getElementById('loginPassword');
  const loginError = document.getElementById('loginError');
  const currentUserName = document.getElementById('currentUserName');
  const currentUserRoleBadge = document.getElementById('currentUserRoleBadge');
  const userAvatarBadge = document.getElementById('userAvatarBadge');
  const btnLogout = document.getElementById('btnLogout');
  const navItemUsers = document.getElementById('navItemUsers');
  const navAdminSectionTitle = document.getElementById('navAdminSectionTitle');

  function showLoginScreen() {
    state.currentUser = null;
    loginScreen.classList.remove('hidden');
    mainApp.classList.add('hidden');
    loginPassword.value = '';
    loginError.classList.add('hidden');
  }

  function showMainApp(user) {
    state.currentUser = user;
    loginScreen.classList.add('hidden');
    mainApp.classList.remove('hidden');

    currentUserName.textContent = user.fullName || user.username;
    currentUserRoleBadge.textContent = user.role === 'superadmin' ? 'Quản trị tối cao' : (user.role === 'admin' ? 'Quản trị viên' : 'Cán bộ');
    userAvatarBadge.textContent = (user.fullName || user.username || 'CB').slice(0, 2).toUpperCase();

    // Ẩn tab Quản Trị Cán Bộ nếu là tài khoản user thường
    if (user.role === 'user') {
      if (navItemUsers) navItemUsers.style.display = 'none';
      if (navAdminSectionTitle) navAdminSectionTitle.style.display = 'none';
    } else {
      if (navItemUsers) navItemUsers.style.display = 'flex';
      if (navAdminSectionTitle) navAdminSectionTitle.style.display = 'block';
    }

    // office.js lắng nghe để phân luồng giao diện theo vai trò / cờ tính năng
    document.dispatchEvent(new CustomEvent('admin:login', { detail: { user } }));
    // Quản trị vào Tổng quan, cán bộ vào thẳng Tra cứu
    switchView(user.role === 'user' ? 'view-office' : 'view-office-dashboard');
    loadInitialData();
  }

  async function checkAuthSession() {
    try {
      const data = await apiRequest('/api/auth/me');
      if (data.ok && data.user) {
        showMainApp(data.user);
      } else {
        showLoginScreen();
      }
    } catch (e) {
      showLoginScreen();
    }
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.classList.add('hidden');
    const u = loginUsername.value.trim();
    const p = loginPassword.value;
    if (!u || !p) return;

    try {
      const btn = document.getElementById('btnLoginSubmit');
      btn.disabled = true;
      btn.innerHTML = 'Đang xác thực...';

      const res = await apiRequest('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: u, password: p }),
      });

      if (res.ok && res.user) {
        showToast('Đăng nhập thành công vào Hệ Thống Tri Thức Đảng!', 'success');
        showMainApp(res.user);
      }
    } catch (err) {
      loginError.textContent = err.message || 'Tên đăng nhập hoặc mật khẩu không chính xác.';
      loginError.classList.remove('hidden');
    } finally {
      const btn = document.getElementById('btnLoginSubmit');
      btn.disabled = false;
      btn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
          <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>
          <polyline points="10 17 15 12 10 7"></polyline>
          <line x1="15" y1="12" x2="3" y2="12"></line>
        </svg>
        Xác Thực & Đăng Nhập
      `;
    }
  });

  btnLogout.addEventListener('click', async () => {
    const ok = await showConfirmDialog({
      title: 'Đăng Xuất Hệ Thống',
      message: 'Đồng chí có chắc chắn muốn đăng xuất khỏi phiên làm việc hiện tại trên Web Admin?',
      type: 'warning',
      confirmText: 'Đăng xuất',
      cancelText: 'Ở lại',
    });
    if (!ok) return;
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } catch (e) {}
    showToast('Đã đăng xuất tài khoản.', 'info');
    showLoginScreen();
  });

  // ============================================================
  // NAVIGATION ROUTER
  // ============================================================
  const navItems = document.querySelectorAll('.nav-item');
  const viewSections = document.querySelectorAll('.view-section');
  const pageTitle = document.getElementById('pageTitle');
  const pageSubtitle = document.getElementById('pageSubtitle');

  const VIEW_TITLES = {
    'view-office-dashboard': {
      title: 'Tổng Quan Sổ Công Văn',
      subtitle: 'Số văn bản trong sổ đến / đi và ngày chốt dữ liệu gần nhất',
    },
    'view-office': {
      title: 'Tra Cứu Sổ Công Văn',
      subtitle: 'Sổ văn bản đến / đi của Văn phòng Đảng ủy. Cần bản gốc, liên hệ Văn thư.',
    },
    'view-office-chat': {
      title: 'Hỏi Đáp Như Trên Zalo',
      subtitle: 'Gõ câu hỏi tự nhiên, bot trả lời đúng như khi cán bộ nhắn tin qua Zalo',
    },
    'view-office-manage': {
      title: 'Quản Lý Văn Bản',
      subtitle: 'Thêm, sửa, xóa từng văn bản trong sổ. File Excel nhập sau vẫn là nguồn chuẩn.',
    },
    'view-office-import': {
      title: 'Nhập Sổ Từ Excel',
      subtitle: 'Nạp file "Danh sách văn bản" xuất từ phần mềm quản lý văn bản',
    },
    'view-office-zalo': {
      title: 'Cấp Quyền Tra Cứu Qua Zalo',
      subtitle: 'Cấp mã kích hoạt và bật / tắt quyền tra cứu cho từng tài khoản Zalo',
    },
    'view-documents': {
      title: 'Kho Văn Bản Quy Định',
      subtitle: 'Quản lý toàn bộ danh mục văn bản Đảng và nghiệp vụ văn thư lưu trữ',
    },
    'view-editor': {
      title: 'Soạn Thảo & Bóc Tách Văn Bản',
      subtitle: 'Biên tập, phân tách cấu trúc điều khoản và lưu trữ vào cơ sở tri thức',
    },
    'view-playground': {
      title: 'Thử Nghiệm AI & X-Ray RAG',
      subtitle: 'Kiểm thử phản hồi Zalo Bot, đo độ trễ và soi chiếu tài liệu truy xuất',
    },
    'view-logs': {
      title: 'Nhật Ký & Quản Lý Người Dùng Zalo',
      subtitle: 'Giám sát tương tác thời gian thực và quản trị quyền hỏi đáp của cán bộ',
    },
    'view-users': {
      title: 'Quản Trị Cán Bộ Hệ Thống',
      subtitle: 'Phân quyền tài khoản quản trị viên và cán bộ nghiệp vụ',
    },
  };

  function switchView(viewId) {
    state.activeView = viewId;
    navItems.forEach(n => {
      if (n.getAttribute('data-view') === viewId) n.classList.add('active');
      else n.classList.remove('active');
    });

    viewSections.forEach(v => {
      if (v.id === viewId) v.classList.add('active');
      else v.classList.remove('active');
    });

    if (VIEW_TITLES[viewId]) {
      pageTitle.textContent = VIEW_TITLES[viewId].title;
      pageSubtitle.textContent = VIEW_TITLES[viewId].subtitle;
    }

    // Refresh view data tương ứng
    if (viewId === 'view-documents') {
      loadDocuments();
      loadStats();
    } else if (viewId === 'view-logs') {
      if (state.activeSubTab === 'subtab-logs') loadQueryLogs();
      else loadZaloUsers();
    } else if (viewId === 'view-users') {
      loadAdminUsers();
    }

    document.dispatchEvent(new CustomEvent('admin:viewchange', { detail: { viewId } }));
  }

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const viewId = item.getAttribute('data-view');
      if (viewId) switchView(viewId);
    });
  });

  // ============================================================
  // DATABASE STATUS & TOPBAR ACTIONS
  // ============================================================
  const btnClearAiCache = document.getElementById('btnClearAiCache');
  const btnSeedDb = document.getElementById('btnSeedDb');
  const btnToggleSidebar = document.getElementById('btnToggleSidebar');

  if (btnToggleSidebar) {
    btnToggleSidebar.addEventListener('click', () => {
      document.body.classList.toggle('sidebar-collapsed');
    });
  }

  async function checkDbStatus() {
    const badge = document.getElementById('dbStatusBadge');
    const text = document.getElementById('dbStatusText');
    if (!badge || !text) return;
    try {
      const res = await apiRequest('/api/stats');
      if (res && res.isDbConnected) {
        badge.className = 'db-status-badge status-online';
        text.textContent = 'PostgreSQL: Đã kết nối';
      } else {
        badge.className = 'db-status-badge status-offline';
        text.textContent = 'Local Fallback (Bộ Nhớ RAM)';
      }
    } catch (e) {
      badge.className = 'db-status-badge status-offline';
      text.textContent = 'Mất kết nối máy chủ';
    }
  }

  // Giám sát kết nối Zalo Webhook
  const webhookStatusBadge = document.getElementById('webhookStatusBadge');
  const webhookStatusText = document.getElementById('webhookStatusText');

  async function checkWebhookStatus() {
    if (!webhookStatusBadge || !webhookStatusText) return;
    try {
      const res = await apiRequest('/api/webhook/status');
      if (res && res.ok && res.info) {
        webhookStatusBadge.className = 'db-status-badge status-online';
        webhookStatusText.textContent = 'Zalo Webhook: Hoạt động';
        webhookStatusBadge.setAttribute('data-webhook-url', res.info.url || 'Đã liên kết');
      } else {
        webhookStatusBadge.className = 'db-status-badge status-offline';
        webhookStatusText.textContent = 'Zalo: Polling / Chưa cấu hình';
        webhookStatusBadge.setAttribute('data-webhook-url', '');
      }
    } catch (e) {
      webhookStatusBadge.className = 'db-status-badge status-offline';
      webhookStatusText.textContent = 'Zalo: Ngoại tuyến';
    }
  }

  if (webhookStatusBadge) {
    webhookStatusBadge.addEventListener('click', () => {
      const url = webhookStatusBadge.getAttribute('data-webhook-url');
      if (url) {
        showToast(`Địa chỉ Webhook Zalo OA hiện tại: ${url}`, 'info');
      } else {
        showToast('Zalo Bot đang chạy ở chế độ Polling hoặc chưa kết nối Webhook.', 'warning');
      }
    });
  }

  if (btnClearAiCache) {
    btnClearAiCache.addEventListener('click', async () => {
      try {
        const res = await apiRequest('/api/cache/clear', { method: 'POST' });
        showToast(res.message || 'Đã xóa toàn bộ bộ nhớ đệm câu trả lời AI.', 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  if (btnSeedDb) {
    btnSeedDb.addEventListener('click', async () => {
      const ok = await showConfirmDialog({
        title: 'Đồng Bộ Kho Dữ Liệu Mẫu',
        message: 'Đồng chí có chắc chắn muốn nạp lại <b>462 điều khoản chuẩn</b> từ thư mục regulations vào cơ sở dữ liệu PostgreSQL? Thao tác này sẽ đồng bộ lại toàn bộ dữ liệu mẫu.',
        type: 'warning',
        confirmText: 'Đồng bộ ngay',
        cancelText: 'Hủy bỏ',
      });
      if (!ok) return;

      const originalHtml = btnSeedDb.innerHTML;
      try {
        btnSeedDb.disabled = true;
        const res = await apiRequest('/api/seed-db', { method: 'POST' });
        showToast(res.message || 'Đã đồng bộ dữ liệu mẫu thành công!', 'success');
        loadInitialData();
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        btnSeedDb.disabled = false;
        btnSeedDb.innerHTML = originalHtml;
      }
    });
  }

  // ============================================================
  // STATS & KPI LOADER
  // ============================================================
  const statTotalDocs = document.getElementById('statTotalDocs');
  const statDocStatusSummary = document.getElementById('statDocStatusSummary');
  const statTotalArticles = document.getElementById('statTotalArticles');
  const statQuyDinh = document.getElementById('statQuyDinh');
  const statTheThuc = document.getElementById('statTheThuc');
  const statVanThu = document.getElementById('statVanThu');
  const statZaloUsers = document.getElementById('statZaloUsers');
  const statAdminCount = document.getElementById('statAdminCount');

  async function loadStats() {
    try {
      const res = await apiRequest('/api/stats');
      if (res.ok && res.stats) {
        const s = res.stats;
        statTotalDocs.textContent = s.totalDocs || 0;
        statTotalArticles.textContent = s.totalArticles || 0;
        statQuyDinh.textContent = s.quyDinhCount || 0;
        statTheThuc.textContent = s.theThucCount || 0;
        statVanThu.textContent = s.vanThuCount || 0;
        statZaloUsers.textContent = s.zaloUserCount || 0;
        statAdminCount.textContent = s.adminCount || 0;

        // Tính số lượng còn hiệu lực vs hết hiệu lực từ allDocuments
        if (state.allDocuments.length) {
          const expired = state.allDocuments.filter(d => (d.status || '').toLowerCase().includes('hết hiệu lực')).length;
          const active = state.allDocuments.length - expired;
          statDocStatusSummary.innerHTML = `
            <span class="kpi-pill kpi-pill-active">${active} còn hiệu lực</span>
            <span class="kpi-pill kpi-pill-expired">${expired} hết hiệu lực</span>
          `;
        }
      }
    } catch (e) {}
  }

  // ============================================================
  // MÀN HÌNH 1: KHO VĂN BẢN QUY ĐỊNH
  // ============================================================
  const docSearchInput = document.getElementById('docSearchInput');
  const docCategoryFilter = document.getElementById('docCategoryFilter');
  const docStatusFilter = document.getElementById('docStatusFilter');
  const docSortSelect = document.getElementById('docSortSelect');
  const btnResetDocFilter = document.getElementById('btnResetDocFilter');
  const btnGoToAddDoc = document.getElementById('btnGoToAddDoc');
  const documentsTableBody = document.getElementById('documentsTableBody');
  const docPaginationInfo = document.getElementById('docPaginationInfo');
  const docPageSizeSelect = document.getElementById('docPageSizeSelect');
  const docPaginationButtons = document.getElementById('docPaginationButtons');

  // Quản lý Tùy Biến Cột Hiển Thị
  const btnColumnToggle = document.getElementById('btnColumnToggle');
  const btnColumnToggleText = document.getElementById('btnColumnToggleText');
  const columnToggleMenu = document.getElementById('columnToggleMenu');
  const btnResetColumns = document.getElementById('btnResetColumns');

  function applyColumnVisibility() {
    const cols = state.docColumns || {};
    let activeOptional = 0;
    Object.values(cols).forEach(v => { if (v) activeOptional++; });
    const totalActive = 4 + activeOptional; // 4 cột cố định: STT, Số hiệu, Tên, Thao tác

    if (btnColumnToggleText) {
      btnColumnToggleText.textContent = `Cột hiển thị (${totalActive}/10)`;
    }

    // Đồng bộ trạng thái checkbox trong dropdown menu
    if (columnToggleMenu) {
      columnToggleMenu.querySelectorAll('input[type="checkbox"]').forEach(chk => {
        const colKey = chk.getAttribute('data-col').replace('col-', '');
        if (cols[colKey] !== undefined) {
          chk.checked = !!cols[colKey];
        }
      });
    }

    // Ẩn / Hiện các cột th và td tương ứng
    const colMap = {
      issuer: '.col-issuer',
      category: '.col-category',
      status: '.col-status',
      date: '.col-date',
      count: '.col-count',
      desc: '.col-desc',
    };

    Object.entries(colMap).forEach(([key, selector]) => {
      const isVisible = !!cols[key];
      document.querySelectorAll(`#documentsTable ${selector}`).forEach(el => {
        if (isVisible) {
          el.classList.remove('col-hidden');
        } else {
          el.classList.add('col-hidden');
        }
      });
    });

    try {
      localStorage.setItem('doc_table_columns', JSON.stringify(cols));
    } catch (e) {}
  }

  if (btnColumnToggle && columnToggleMenu) {
    btnColumnToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      columnToggleMenu.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
      if (!columnToggleMenu.contains(e.target) && !btnColumnToggle.contains(e.target)) {
        columnToggleMenu.classList.add('hidden');
      }
    });

    columnToggleMenu.querySelectorAll('input[type="checkbox"]').forEach(chk => {
      chk.addEventListener('change', () => {
        const colKey = chk.getAttribute('data-col').replace('col-', '');
        state.docColumns[colKey] = chk.checked;
        renderDocumentsTable();
      });
    });

    if (btnResetColumns) {
      btnResetColumns.addEventListener('click', () => {
        state.docColumns = {
          issuer: true,
          category: true,
          status: true,
          date: false,
          count: false,
          desc: false,
        };

        try {
          localStorage.removeItem('doc_table_col_widths');
        } catch (e) {}

        const docTable = document.getElementById('documentsTable');
        if (docTable) {
          const defaultWidths = {
            stt: '56px',
            code: '140px',
            name: '320px',
            issuer: '180px',
            date: '110px',
            category: '155px',
            count: '100px',
            desc: '220px',
            status: '125px',
          };
          docTable.querySelectorAll('thead th').forEach(th => {
            const colId = th.getAttribute('data-col-id');
            if (colId && defaultWidths[colId]) {
              th.style.width = defaultWidths[colId];
              th.style.minWidth = defaultWidths[colId];
            } else if (!th.classList.contains('sticky-action-col')) {
              th.style.width = '';
              th.style.minWidth = '';
            }
          });
        }

        renderDocumentsTable();
        showToast('Đã khôi phục 7 cột và kích thước hiển thị mặc định.', 'info');
      });
    }
  }

  // ============================================================
  // CƠ CHẾ KÉO THẢ ĐỘ RỘNG CỘT LINH HOẠT (RESIZABLE COLUMNS)
  // ============================================================
  const docColMinWidths = {
    stt: 50,
    code: 110,
    name: 200,
    issuer: 130,
    date: 90,
    category: 120,
    count: 80,
    desc: 150,
    status: 105,
  };

  function initDocTableResizable() {
    const table = document.getElementById('documentsTable');
    if (!table) return;
    const thead = table.querySelector('thead');
    if (!thead) return;
    const ths = thead.querySelectorAll('th');
    if (!ths || !ths.length) return;

    let savedWidths = {};
    try {
      savedWidths = JSON.parse(localStorage.getItem('doc_table_col_widths')) || {};
    } catch (e) {
      savedWidths = {};
    }

    ths.forEach((th) => {
      const colId = th.getAttribute('data-col-id') || '';
      if (!colId) return;

      // Áp dụng kích thước đã lưu nếu có (không áp dụng cho sticky-action-col)
      if (savedWidths[colId] && !th.classList.contains('sticky-action-col')) {
        th.style.width = `${savedWidths[colId]}px`;
        th.style.minWidth = `${savedWidths[colId]}px`;
      }

      // Cột thao tác cố định ở mép phải không gắn tay kéo resize
      if (th.classList.contains('sticky-action-col')) return;

      let resizer = th.querySelector('.col-resizer');
      if (!resizer) {
        resizer = document.createElement('span');
        resizer.className = 'col-resizer';
        resizer.setAttribute('title', 'Kéo sang trái hoặc phải để chỉnh độ rộng cột');
        th.appendChild(resizer);
      }

      resizer.onmousedown = (e) => {
        e.preventDefault();
        e.stopPropagation();

        const startX = e.pageX;
        const startWidth = th.offsetWidth;
        const minW = docColMinWidths[colId] || parseInt(window.getComputedStyle(th).minWidth, 10) || 60;

        document.body.classList.add('is-col-resizing');
        resizer.classList.add('is-resizing');

        function onMouseMove(moveEvent) {
          const delta = moveEvent.pageX - startX;
          const newWidth = Math.max(minW, startWidth + delta);
          th.style.width = `${newWidth}px`;
          th.style.minWidth = `${newWidth}px`;
        }

        function onMouseUp() {
          document.body.classList.remove('is-col-resizing');
          resizer.classList.remove('is-resizing');
          document.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('mouseup', onMouseUp);

          try {
            const currentWidths = JSON.parse(localStorage.getItem('doc_table_col_widths')) || {};
            currentWidths[colId] = th.offsetWidth;
            localStorage.setItem('doc_table_col_widths', JSON.stringify(currentWidths));
          } catch (e) {}
        }

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      };
    });
  }

  async function loadDocuments() {
    try {
      const res = await apiRequest('/api/documents');
      if (res.ok) {
        state.allDocuments = res.documents || [];
        applyDocumentFilters();
      }
    } catch (err) {
      showToast('Không thể tải danh sách văn bản: ' + err.message, 'error');
    }
  }

  function applyDocumentFilters() {
    let list = [...state.allDocuments];

    // Lọc theo từ khóa
    if (state.docSearchQuery) {
      const q = state.docSearchQuery.toLowerCase();
      list = list.filter(d => {
        const code = (d.document_code || '').toLowerCase();
        const name = (d.document_name || '').toLowerCase();
        const issuer = (d.issuer || '').toLowerCase();
        const desc = (d.description || '').toLowerCase();
        const status = (d.status || '').toLowerCase();
        return code.includes(q) || name.includes(q) || issuer.includes(q) || desc.includes(q) || status.includes(q);
      });
    }

    // Lọc theo Chuyên mục
    if (state.docCategoryFilter) {
      list = list.filter(d => d.category === state.docCategoryFilter);
    }

    // Lọc theo Hiệu lực
    if (state.docStatusFilter) {
      if (state.docStatusFilter === 'active') {
        list = list.filter(d => !(d.status || '').toLowerCase().includes('hết hiệu lực'));
      } else if (state.docStatusFilter === 'expired') {
        list = list.filter(d => (d.status || '').toLowerCase().includes('hết hiệu lực'));
      }
    }

    // Sắp xếp
    if (state.docSort === 'date_desc') {
      list.sort((a, b) => new Date(b.issue_date || 0) - new Date(a.issue_date || 0));
    } else if (state.docSort === 'date_asc') {
      list.sort((a, b) => new Date(a.issue_date || 0) - new Date(b.issue_date || 0));
    } else if (state.docSort === 'code_asc') {
      list.sort((a, b) => (a.document_code || '').localeCompare(b.document_code || ''));
    } else if (state.docSort === 'articles_desc') {
      list.sort((a, b) => (parseInt(b.articles_count, 10) || 0) - (parseInt(a.articles_count, 10) || 0));
    }

    state.filteredDocuments = list;
    state.docCurrentPage = 1;
    renderDocumentsTable();
    loadStats();
  }

  function renderDocumentsTable() {
    const list = state.filteredDocuments;
    const total = list.length;
    const pageSize = state.docPageSize;
    const totalPages = Math.ceil(total / pageSize) || 1;
    if (state.docCurrentPage > totalPages) state.docCurrentPage = totalPages;

    const startIdx = (state.docCurrentPage - 1) * pageSize;
    const endIdx = Math.min(startIdx + pageSize, total);
    const pageItems = list.slice(startIdx, endIdx);

    if (total === 0) {
      if (documentsTableBody) {
        documentsTableBody.innerHTML = `
          <tr>
            <td colspan="10">
              <div class="table-empty">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
                <p>Không tìm thấy văn bản quy định nào phù hợp với bộ lọc.</p>
              </div>
            </td>
          </tr>
        `;
      }
      if (docPaginationInfo) docPaginationInfo.textContent = 'Hiển thị 0 - 0 trên tổng số 0 văn bản';
      if (docPaginationButtons) docPaginationButtons.innerHTML = '';
      applyColumnVisibility();
      return;
    }

    if (docPaginationInfo) {
      docPaginationInfo.textContent = `Hiển thị ${startIdx + 1} - ${endIdx} trên tổng số ${total} văn bản`;
    }

    const cols = state.docColumns || {};
    let html = '';
    pageItems.forEach((doc, idx) => {
      const stt = startIdx + idx + 1;
      const isExpired = (doc.status || '').toLowerCase().includes('hết hiệu lực');
      
      // Subnote
      let subnote = '';
      if (doc.description) {
        subnote = escapeHtml(doc.description);
      } else if (doc.status && doc.status.includes('(')) {
        subnote = escapeHtml(doc.status);
      }

      html += `
        <tr>
          <td class="col-stt" style="text-align: center; color: var(--text-muted); font-weight: 600;">${stt}</td>
          <td class="col-code">
            <span class="code-badge font-mono">${escapeHtml(doc.document_code)}</span>
          </td>
          <td class="col-name">
            <div class="doc-title-cell">
              <span class="doc-name-link" data-doc-id="${doc.id}">${escapeHtml(doc.document_name)}</span>
              ${!cols.desc && subnote ? `<span class="doc-subnote" title="${subnote}">${subnote}</span>` : ''}
            </div>
          </td>
          <td class="col-issuer">
            <div style="font-weight: 600; color: var(--text-main); font-size: 13px;">${escapeHtml(doc.issuer || '--')}</div>
            ${!cols.date ? `<div style="font-size: 11.5px; color: var(--text-muted); margin-top: 2px;">Ngày BH: ${formatDate(doc.issue_date)}</div>` : ''}
          </td>
          <td class="col-date" style="text-align: center;">${formatDate(doc.issue_date)}</td>
          <td class="col-category">
            <div>${getCategoryLabel(doc.category)}</div>
            ${!cols.count ? `<div style="font-size: 11.5px; color: var(--text-muted); margin-top: 2px;">${doc.articles_count || 0} điều khoản</div>` : ''}
          </td>
          <td class="col-count" style="text-align: center;">
            <span class="scale-badge">${doc.articles_count || 0} điều</span>
          </td>
          <td class="col-desc">${subnote || '--'}</td>
          <td class="col-status" style="text-align: center;">
            ${isExpired 
              ? `<span class="status-badge badge-expired">Hết hiệu lực</span>` 
              : `<span class="status-badge badge-active">Còn hiệu lực</span>`}
          </td>
          <td class="col-actions sticky-action-col">
            <div class="table-actions">
              <button type="button" class="action-icon-btn btn-icon-view" data-tooltip="Xem chi tiết toàn văn &amp; điều khoản" data-action="view" data-doc-id="${doc.id}">
                ${ICONS.view}
              </button>
              <button type="button" class="action-icon-btn btn-icon-edit" data-tooltip="Chỉnh sửa văn bản &amp; điều khoản" data-action="edit" data-doc-id="${doc.id}">
                ${ICONS.edit}
              </button>
              <button type="button" class="action-icon-btn btn-icon-delete" data-tooltip="Xóa văn bản khỏi cơ sở dữ liệu" data-action="delete" data-doc-id="${doc.id}" data-doc-code="${escapeHtml(doc.document_code)}">
                ${ICONS.delete}
              </button>
            </div>
          </td>
        </tr>
      `;
    });

    if (documentsTableBody) {
      documentsTableBody.innerHTML = html;
    }

    if (docPaginationButtons) {
      renderPaginationButtons(docPaginationButtons, state.docCurrentPage, totalPages, (p) => {
        state.docCurrentPage = p;
        renderDocumentsTable();
      });
    }

    applyColumnVisibility();
    initDocTableResizable();
  }

  // Render các nút phân trang
  function renderPaginationButtons(container, currentPage, totalPages, onPageClick) {
    if (!container) return;
    if (totalPages <= 1) {
      container.innerHTML = '';
      return;
    }

    let btns = '';

    // First Page
    btns += `<button type="button" class="page-btn" ${currentPage === 1 ? 'disabled' : ''} data-p="1" title="Trang đầu">${ICONS.firstPage}</button>`;
    // Prev Page
    btns += `<button type="button" class="page-btn" ${currentPage === 1 ? 'disabled' : ''} data-p="${currentPage - 1}" title="Trang trước">${ICONS.prevPage}</button>`;

    // Page Numbers (tối đa 5 nút)
    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, startPage + 4);
    if (endPage - startPage < 4) {
      startPage = Math.max(1, endPage - 4);
    }

    for (let p = startPage; p <= endPage; p++) {
      btns += `<button type="button" class="page-btn ${p === currentPage ? 'active' : ''}" data-p="${p}">${p}</button>`;
    }

    // Next Page
    btns += `<button type="button" class="page-btn" ${currentPage === totalPages ? 'disabled' : ''} data-p="${currentPage + 1}" title="Trang tiếp">${ICONS.nextPage}</button>`;
    // Last Page
    btns += `<button type="button" class="page-btn" ${currentPage === totalPages ? 'disabled' : ''} data-p="${totalPages}" title="Trang cuối">${ICONS.lastPage}</button>`;

    container.innerHTML = btns;

    container.querySelectorAll('.page-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = parseInt(btn.getAttribute('data-p'), 10);
        if (p && p !== currentPage && p >= 1 && p <= totalPages) {
          onPageClick(p);
        }
      });
    });
  }

  // Document Filters Event Listeners
  docSearchInput.addEventListener('input', debounce((e) => {
    state.docSearchQuery = e.target.value.trim();
    applyDocumentFilters();
  }, 250));

  docCategoryFilter.addEventListener('change', (e) => {
    state.docCategoryFilter = e.target.value;
    applyDocumentFilters();
  });

  docStatusFilter.addEventListener('change', (e) => {
    state.docStatusFilter = e.target.value;
    applyDocumentFilters();
  });

  docSortSelect.addEventListener('change', (e) => {
    state.docSort = e.target.value;
    applyDocumentFilters();
  });

  btnResetDocFilter.addEventListener('click', () => {
    docSearchInput.value = '';
    docCategoryFilter.value = '';
    docStatusFilter.value = '';
    docSortSelect.value = 'date_desc';
    state.docSearchQuery = '';
    state.docCategoryFilter = '';
    state.docStatusFilter = '';
    state.docSort = 'date_desc';
    applyDocumentFilters();
    showToast('Đã đặt lại bộ lọc danh mục văn bản.', 'info');
  });

  docPageSizeSelect.addEventListener('change', (e) => {
    state.docPageSize = parseInt(e.target.value, 10) || 10;
    state.docCurrentPage = 1;
    renderDocumentsTable();
  });

  btnGoToAddDoc.addEventListener('click', () => {
    resetEditorForm();
    switchView('view-editor');
  });

  // Table Action Click (Delegation)
  documentsTableBody.addEventListener('click', (e) => {
    const target = e.target.closest('button, .doc-name-link');
    if (!target) return;

    // Click vào tên văn bản
    if (target.classList.contains('doc-name-link')) {
      const docId = target.getAttribute('data-doc-id');
      if (docId) openDetailModal(docId);
      return;
    }

    const action = target.getAttribute('data-action');
    const docId = target.getAttribute('data-doc-id');

    if (action === 'view') {
      openDetailModal(docId);
    } else if (action === 'edit') {
      loadDocToEditor(docId);
    } else if (action === 'delete') {
      const docCode = target.getAttribute('data-doc-code') || docId;
      deleteDocument(docId, docCode);
    }
  });

  async function deleteDocument(docId, docCode) {
    const ok = await showConfirmDialog({
      title: 'Xóa Văn Bản Quy Định',
      message: `Đồng chí có chắc chắn muốn xóa văn bản <b>[${escapeHtml(docCode)}]</b> khỏi cơ sở dữ liệu? Toàn bộ các điều khoản liên quan sẽ bị gỡ bỏ vĩnh viễn.`,
      type: 'danger',
      confirmText: 'Đồng ý xóa',
      cancelText: 'Hủy bỏ',
    });
    if (!ok) return;

    try {
      const res = await apiRequest(`/api/documents/${docId}`, { method: 'DELETE' });
      showToast(res.message || 'Đã xóa văn bản thành công.', 'success');
      loadDocuments();
      loadStats();
    } catch (err) {
      showToast('Lỗi khi xóa văn bản: ' + err.message, 'error');
    }
  }

  // ============================================================
  // MÀN HÌNH 2: SOẠN THẢO & BÓC TÁCH VĂN BẢN (LUỒNG LIỀN MẠCH)
  // ============================================================
  const editorStatusText = document.getElementById('editorStatusText');
  const btnCancelEditDoc = document.getElementById('btnCancelEditDoc');
  const btnBackToDocsFromEditor = document.getElementById('btnBackToDocsFromEditor');
  if (btnBackToDocsFromEditor) {
    btnBackToDocsFromEditor.addEventListener('click', () => {
      switchView('view-documents');
    });
  }
  const editorDocForm = document.getElementById('editorDocForm');
  const editingDocIdInput = document.getElementById('editingDocId');
  const docCode = document.getElementById('docCode');
  const docName = document.getElementById('docName');
  const docIssuer = document.getElementById('docIssuer');
  const docCategory = document.getElementById('docCategory');
  const docDate = document.getElementById('docDate');
  const docStatus = document.getElementById('docStatus');
  const docDescription = document.getElementById('docDescription');

  // Khối 2: Ngăn Bóc Tách Tự Động Thông Minh (Collapsible Panel)
  const parserCollapsiblePanel = document.getElementById('parserCollapsiblePanel');
  const btnToggleParserDrawer = document.getElementById('btnToggleParserDrawer');
  const btnCloseParserPanel = document.getElementById('btnCloseParserPanel');
  const parserPanelHeader = document.getElementById('parserPanelHeader');
  const rawTextContent = document.getElementById('rawTextContent');
  const btnAutoParse = document.getElementById('btnAutoParse');
  const parserPreviewCount = document.getElementById('parserPreviewCount');
  const parserPreviewList = document.getElementById('parserPreviewList');
  const btnApplyOverwrite = document.getElementById('btnApplyOverwrite');
  const btnApplyAppend = document.getElementById('btnApplyAppend');
  let lastParsedArticles = [];

  // Khối 3: Danh Sách Điều Khoản & Nút Lưu
  const parsedCount = document.getElementById('parsedCount');
  const editorArticleFilter = document.getElementById('editorArticleFilter');
  const btnAddSingleArticle = document.getElementById('btnAddSingleArticle');
  const btnSubmitDoc = document.getElementById('btnSubmitDoc');
  const btnSubmitDocText = document.getElementById('btnSubmitDocText');
  const btnSubmitDocBottom = document.getElementById('btnSubmitDocBottom');
  const articlesListContainer = document.getElementById('articlesListContainer');

  // Logic đóng/mở Ngăn Bóc Tách Collapsible
  function toggleParserPanel() {
    if (parserCollapsiblePanel) {
      parserCollapsiblePanel.classList.toggle('collapsed');
      if (!parserCollapsiblePanel.classList.contains('collapsed')) {
        setTimeout(() => rawTextContent && rawTextContent.focus(), 150);
      }
    }
  }

  if (btnToggleParserDrawer) {
    btnToggleParserDrawer.addEventListener('click', toggleParserPanel);
  }

  if (btnCloseParserPanel) {
    btnCloseParserPanel.addEventListener('click', (e) => {
      e.stopPropagation();
      if (parserCollapsiblePanel) parserCollapsiblePanel.classList.add('collapsed');
    });
  }

  if (parserPanelHeader) {
    parserPanelHeader.addEventListener('click', (e) => {
      if (e.target.closest('#btnCloseParserPanel')) return;
      toggleParserPanel();
    });
  }

  if (btnSubmitDocBottom) {
    btnSubmitDocBottom.addEventListener('click', () => {
      if (btnSubmitDoc) btnSubmitDoc.click();
    });
  }

  function resetEditorForm() {
    state.editingDocId = null;
    state.editingArticles = [];
    state.editorArticleFilterQuery = '';
    lastParsedArticles = [];

    editingDocIdInput.value = '';
    docCode.value = '';
    docName.value = '';
    docIssuer.value = 'Văn phòng Trung ương Đảng';
    docCategory.value = 'quy_dinh_dang';
    docDate.value = new Date().toISOString().split('T')[0];
    docStatus.value = 'Còn hiệu lực';
    docDescription.value = '';
    rawTextContent.value = '';
    editorArticleFilter.value = '';

    if (btnApplyOverwrite) btnApplyOverwrite.disabled = true;
    if (btnApplyAppend) btnApplyAppend.disabled = true;
    if (parserPreviewCount) parserPreviewCount.textContent = '0 điều khoản';
    if (parserPreviewList) {
      parserPreviewList.innerHTML = `
        <div class="table-empty" style="padding: 24px 12px;">
          <p style="font-size: 12px;">Dán văn bản vào bên trái và bấm "Bắt Đầu Bóc Tách" để xem trước danh sách điều khoản tại đây.</p>
        </div>
      `;
    }

    editorStatusText.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" style="width: 18px; height: 18px; color: var(--primary);">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
      </svg>
      <span>Chế độ: Thêm mới văn bản quy định</span>
    `;
    btnCancelEditDoc.classList.add('hidden');
    btnSubmitDocText.textContent = 'Lưu Văn Bản Vào Hệ Thống';

    renderEditorArticlesList();
  }

  async function loadDocToEditor(docId) {
    try {
      const res = await apiRequest(`/api/documents/${docId}`);
      if (res.ok && res.document) {
        const d = res.document;
        state.editingDocId = d.id;
        editingDocIdInput.value = d.id;
        docCode.value = d.document_code || '';
        docName.value = d.document_name || '';
        docIssuer.value = d.issuer || '';
        docCategory.value = d.category || 'quy_dinh_dang';
        
        if (d.issue_date) {
          try {
            docDate.value = new Date(d.issue_date).toISOString().split('T')[0];
          } catch (e) {
            docDate.value = d.issue_date;
          }
        } else {
          docDate.value = '';
        }

        docStatus.value = (d.status || '').toLowerCase().includes('hết hiệu lực') ? 'Hết hiệu lực' : 'Còn hiệu lực';
        docDescription.value = d.description || '';

        // Nạp articles
        state.editingArticles = (d.articles || []).map(a => ({
          articleNumber: a.article_number || '',
          title: a.title || '',
          content: a.content || '',
        }));

        editorStatusText.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" style="width: 18px; height: 18px; color: var(--amber);">
            <path d="M12 20h9"></path>
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
          </svg>
          <span>Chế độ: Đang chỉnh sửa văn bản [${escapeHtml(d.document_code)}]</span>
        `;
        btnCancelEditDoc.classList.remove('hidden');
        btnSubmitDocText.textContent = 'Lưu Thay Đổi Văn Bản';

        // Đóng panel parser nếu đang mở để tập trung biên tập
        if (parserCollapsiblePanel) parserCollapsiblePanel.classList.add('collapsed');

        renderEditorArticlesList();
        switchView('view-editor');
      }
    } catch (err) {
      showToast('Không thể nạp dữ liệu văn bản để chỉnh sửa: ' + err.message, 'error');
    }
  }

  btnCancelEditDoc.addEventListener('click', () => {
    resetEditorForm();
    showToast('Đã chuyển về chế độ thêm mới văn bản.', 'info');
  });

  // Auto Parser - Thực hiện bóc tách tự động
  if (btnAutoParse) {
    btnAutoParse.addEventListener('click', async () => {
      const text = rawTextContent.value.trim();
      if (!text) {
        showToast('Vui lòng dán văn bản toàn văn vào ô bóc tách.', 'warning');
        return;
      }

      try {
        btnAutoParse.disabled = true;
        btnAutoParse.innerHTML = 'Đang bóc tách các điều khoản...';

        const res = await apiRequest('/api/parse-raw', {
          method: 'POST',
          body: JSON.stringify({ text }),
        });

        if (res.ok && res.articles && res.articles.length) {
          lastParsedArticles = res.articles;
          if (parserPreviewCount) {
            parserPreviewCount.textContent = `${lastParsedArticles.length} điều khoản`;
          }
          if (parserPreviewList) {
            let previewHtml = '';
            lastParsedArticles.forEach((art, idx) => {
              const artNum = art.articleNumber || (idx + 1);
              previewHtml += `
                <div class="parser-preview-card">
                  <div class="parser-preview-header">
                    <span class="parser-preview-badge">Điều ${escapeHtml(artNum)}</span>
                    <span style="font-weight: 600; font-size: 12.5px; color: var(--text-main); flex: 1; margin-left: 8px;">${escapeHtml(art.title || '')}</span>
                  </div>
                  <div class="parser-preview-text">${escapeHtml(art.content || '')}</div>
                </div>
              `;
            });
            parserPreviewList.innerHTML = previewHtml;
          }
          if (btnApplyOverwrite) btnApplyOverwrite.disabled = false;
          if (btnApplyAppend) btnApplyAppend.disabled = false;
          showToast(`Đã bóc tách thành công ${lastParsedArticles.length} điều khoản! Hãy chọn "Ghi Đè" hoặc "Nối Thêm" vào danh sách bên dưới.`, 'success');
        } else {
          showToast('Không tìm thấy cấu trúc điều khoản chuẩn nào trong văn bản.', 'warning');
        }
      } catch (err) {
        showToast('Lỗi khi bóc tách: ' + err.message, 'error');
      } finally {
        btnAutoParse.disabled = false;
        btnAutoParse.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
          </svg>
          <span>Bắt Đầu Bóc Tách Thành Các Điều Khoản</span>
        `;
      }
    });
  }

  // 1. Ghi đè toàn bộ điều khoản xuống danh sách biên tập
  if (btnApplyOverwrite) {
    btnApplyOverwrite.addEventListener('click', () => {
      if (!lastParsedArticles.length) {
        showToast('Chưa có điều khoản nào được bóc tách.', 'warning');
        return;
      }
      state.editingArticles = [...lastParsedArticles];
      renderEditorArticlesList();
      const count = lastParsedArticles.length;
      lastParsedArticles = [];
      btnApplyOverwrite.disabled = true;
      btnApplyAppend.disabled = true;
      rawTextContent.value = '';
      if (parserCollapsiblePanel) parserCollapsiblePanel.classList.add('collapsed');
      const articlesCanvasCard = document.getElementById('articlesCanvasCard');
      if (articlesCanvasCard) articlesCanvasCard.scrollIntoView({ behavior: 'smooth' });
      showToast(`Đã ghi đè ${count} điều khoản xuống danh sách biên tập!`, 'success');
    });
  }

  // 2. Nối thêm điều khoản vào danh sách hiện tại
  if (btnApplyAppend) {
    btnApplyAppend.addEventListener('click', () => {
      if (!lastParsedArticles.length) {
        showToast('Chưa có điều khoản nào được bóc tách.', 'warning');
        return;
      }
      state.editingArticles.push(...lastParsedArticles);
      renderEditorArticlesList();
      const count = lastParsedArticles.length;
      lastParsedArticles = [];
      btnApplyOverwrite.disabled = true;
      btnApplyAppend.disabled = true;
      rawTextContent.value = '';
      if (parserCollapsiblePanel) parserCollapsiblePanel.classList.add('collapsed');
      const articlesCanvasCard = document.getElementById('articlesCanvasCard');
      if (articlesCanvasCard) articlesCanvasCard.scrollIntoView({ behavior: 'smooth' });
      showToast(`Đã nối thêm ${count} điều khoản vào danh sách biên tập!`, 'success');
    });
  }

  // --- TÍNH NĂNG NHẬP / XUẤT FILE .JSON (1 CHẠM) ---
  const btnImportJsonFile = document.getElementById('btnImportJsonFile');
  const jsonFileInput = document.getElementById('jsonFileInput');
  const btnExportJsonFile = document.getElementById('btnExportJsonFile');

  function downloadJsonFile(filename, jsonData) {
    const jsonString = JSON.stringify(jsonData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  if (btnImportJsonFile && jsonFileInput) {
    btnImportJsonFile.addEventListener('click', () => {
      jsonFileInput.value = '';
      jsonFileInput.click();
    });

    jsonFileInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = JSON.parse(event.target.result);

          // Map các trường metadata bìa văn bản
          docCode.value = data.documentCode || data.document_code || data.code || '';
          docName.value = data.documentName || data.document_name || data.name || data.title || '';
          docIssuer.value = data.issuer || 'Văn phòng Trung ương Đảng';
          docCategory.value = data.category || 'quy_dinh_dang';

          const rawDate = data.issueDate || data.issue_date || data.date;
          if (rawDate) {
            try {
              docDate.value = new Date(rawDate).toISOString().split('T')[0];
            } catch (err) {
              docDate.value = rawDate;
            }
          }

          docStatus.value = (data.status || '').toLowerCase().includes('hết hiệu lực') ? 'Hết hiệu lực' : 'Còn hiệu lực';
          docDescription.value = data.description || '';

          // Map danh sách điều khoản
          const rawArticles = data.articles || [];
          state.editingArticles = rawArticles.map((a, i) => ({
            articleNumber: a.articleNumber || a.article_number || String(i + 1),
            title: a.title || `Điều ${a.articleNumber || a.article_number || (i + 1)}`,
            content: a.content || '',
          }));

          renderEditorArticlesList();
          showToast(`Đã nạp văn bản [${docCode.value || file.name}] với ${state.editingArticles.length} điều khoản từ file JSON thành công!`, 'success');
        } catch (parseErr) {
          showToast('Không thể đọc file JSON: ' + parseErr.message, 'error');
        }
      };
      reader.readAsText(file);
    });
  }

  if (btnExportJsonFile) {
    btnExportJsonFile.addEventListener('click', () => {
      const code = docCode.value.trim();
      const name = docName.value.trim();
      if (!code && !name) {
        showToast('Vui lòng nhập số hiệu hoặc tên văn bản trước khi xuất file JSON.', 'warning');
        return;
      }

      const exportData = {
        documentCode: code || 'VAN-BAN-MOI',
        documentName: name,
        issuer: docIssuer.value.trim() || 'Văn phòng Trung ương Đảng',
        category: docCategory.value || 'quy_dinh_dang',
        issueDate: docDate.value || new Date().toISOString().split('T')[0],
        status: docStatus.value || 'Còn hiệu lực',
        description: docDescription.value.trim() || null,
        articles: state.editingArticles.map((a, i) => ({
          articleNumber: a.articleNumber || String(i + 1),
          title: a.title || `Điều ${a.articleNumber || (i + 1)}`,
          content: a.content || '',
        })),
      };

      const cleanFileName = (code || 'van_ban').replace(/[/\\?%*:|"<>]/g, '_') + '.json';
      downloadJsonFile(cleanFileName, exportData);
      showToast(`Đã xuất file [${cleanFileName}] thành công!`, 'success');
    });
  }

  // Thêm 1 điều thủ công
  btnAddSingleArticle.addEventListener('click', () => {
    const nextNum = state.editingArticles.length + 1;
    state.editingArticles.push({
      articleNumber: String(nextNum),
      title: `Điều ${nextNum}`,
      content: '',
    });
    renderEditorArticlesList();
    showToast(`Đã thêm mới Điều ${nextNum}.`, 'info');
  });

  // Filter điều khoản trong Editor
  editorArticleFilter.addEventListener('input', (e) => {
    state.editorArticleFilterQuery = e.target.value.trim().toLowerCase();
    renderEditorArticlesList();
  });

  function renderEditorArticlesList() {
    parsedCount.textContent = state.editingArticles.length;

    if (!state.editingArticles.length) {
      articlesListContainer.innerHTML = `
        <div class="table-empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
            <line x1="8" y1="6" x2="21" y2="6"></line>
            <line x1="8" y1="12" x2="21" y2="12"></line>
            <line x1="8" y1="18" x2="21" y2="18"></line>
          </svg>
          <p>Chưa có điều khoản nào. Đồng chí hãy dùng chức năng <b>Tự Động Bóc Tách</b> hoặc bấm <b>+ Thêm Điều Thủ Công</b>.</p>
        </div>
      `;
      return;
    }

    let itemsToRender = state.editingArticles.map((item, idx) => ({ ...item, originalIndex: idx }));

    if (state.editorArticleFilterQuery) {
      const q = state.editorArticleFilterQuery;
      itemsToRender = itemsToRender.filter(a => 
        (a.articleNumber || '').toLowerCase().includes(q) ||
        (a.title || '').toLowerCase().includes(q) ||
        (a.content || '').toLowerCase().includes(q)
      );
    }

    let html = '';
    itemsToRender.forEach(art => {
      const idx = art.originalIndex;
      html += `
        <div class="article-item-card" data-idx="${idx}">
          <div class="article-item-header">
            <div class="article-inputs-row">
              <input type="text" class="form-control article-num-input" value="${escapeHtml(art.articleNumber)}" placeholder="Số điều" data-field="articleNumber" data-idx="${idx}">
              <input type="text" class="form-control article-title-input" value="${escapeHtml(art.title)}" placeholder="Tiêu đề điều khoản..." data-field="title" data-idx="${idx}">
            </div>
            <div class="article-actions-group">
              <button type="button" class="action-icon-btn btn-icon-up" data-tooltip="Di chuyển lên trên" data-action="move-up" data-idx="${idx}" ${idx === 0 ? 'disabled' : ''}>
                ${ICONS.arrowUp}
              </button>
              <button type="button" class="action-icon-btn btn-icon-down" data-tooltip="Di chuyển xuống dưới" data-action="move-down" data-idx="${idx}" ${idx === state.editingArticles.length - 1 ? 'disabled' : ''}>
                ${ICONS.arrowDown}
              </button>
              <button type="button" class="action-icon-btn btn-icon-insert" data-tooltip="Chèn điều mới bên dưới" data-action="insert-below" data-idx="${idx}">
                ${ICONS.insertBelow}
              </button>
              <button type="button" class="action-icon-btn btn-icon-delete" data-tooltip="Xóa điều khoản này" data-action="delete-article" data-idx="${idx}">
                ${ICONS.delete}
              </button>
            </div>
          </div>
          <div>
            <textarea class="form-control article-content-input" placeholder="Nội dung chi tiết điều khoản..." data-field="content" data-idx="${idx}">${escapeHtml(art.content)}</textarea>
          </div>
        </div>
      `;
    });

    articlesListContainer.innerHTML = html;
  }

  // Articles Input & Action Handling (Delegation)
  articlesListContainer.addEventListener('input', (e) => {
    const target = e.target;
    const field = target.getAttribute('data-field');
    const idx = parseInt(target.getAttribute('data-idx'), 10);
    if (field && !isNaN(idx) && state.editingArticles[idx]) {
      state.editingArticles[idx][field] = target.value;
    }
  });

  articlesListContainer.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    const idx = parseInt(btn.getAttribute('data-idx'), 10);
    if (isNaN(idx)) return;

    if (action === 'move-up' && idx > 0) {
      const temp = state.editingArticles[idx];
      state.editingArticles[idx] = state.editingArticles[idx - 1];
      state.editingArticles[idx - 1] = temp;
      renderEditorArticlesList();
    } else if (action === 'move-down' && idx < state.editingArticles.length - 1) {
      const temp = state.editingArticles[idx];
      state.editingArticles[idx] = state.editingArticles[idx + 1];
      state.editingArticles[idx + 1] = temp;
      renderEditorArticlesList();
    } else if (action === 'insert-below') {
      state.editingArticles.splice(idx + 1, 0, {
        articleNumber: '',
        title: '',
        content: '',
      });
      renderEditorArticlesList();
    } else if (action === 'delete-article') {
      const artNum = state.editingArticles[idx].articleNumber || (idx + 1);
      const ok = await showConfirmDialog({
        title: 'Xóa Điều Khoản',
        message: `Đồng chí có chắc muốn xóa <b>Điều ${escapeHtml(artNum)}</b> khỏi danh sách biên tập của văn bản này?`,
        type: 'danger',
        confirmText: 'Xóa điều',
        cancelText: 'Giữ lại',
      });
      if (ok) {
        state.editingArticles.splice(idx, 1);
        renderEditorArticlesList();
      }
    }
  });

  // Submit Lưu Văn Bản (POST nếu tạo mới, PUT nếu sửa)
  btnSubmitDoc.addEventListener('click', async () => {
    const code = docCode.value.trim();
    const name = docName.value.trim();
    const issuer = docIssuer.value.trim();
    const category = docCategory.value;
    const issueDate = docDate.value;
    const status = docStatus.value;
    const description = docDescription.value.trim();

    if (!code || !name) {
      showToast('Vui lòng nhập đầy đủ Số/Ký hiệu và Tên văn bản.', 'warning');
      docCode.focus();
      return;
    }

    if (!state.editingArticles.length) {
      showToast('Văn bản phải có ít nhất 1 điều khoản quy định.', 'warning');
      return;
    }

    const payload = {
      documentCode: code,
      documentName: name,
      issuer: issuer || 'Cơ quan có thẩm quyền',
      category: category || 'quy_dinh_dang',
      issueDate: issueDate || new Date().toISOString().split('T')[0],
      status: status || 'Còn hiệu lực',
      description: description || null,
      articles: state.editingArticles.map((a, i) => ({
        articleNumber: a.articleNumber || String(i + 1),
        title: a.title || `Điều ${a.articleNumber || (i + 1)}`,
        content: a.content || '',
      })),
    };

    try {
      btnSubmitDoc.disabled = true;
      btnSubmitDocText.textContent = 'Đang lưu trữ dữ liệu...';

      let res;
      if (state.editingDocId) {
        res = await apiRequest(`/api/documents/${state.editingDocId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        showToast(res.message || 'Cập nhật văn bản thành công!', 'success');
      } else {
        res = await apiRequest('/api/documents', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        showToast(res.message || 'Đã thêm mới văn bản vào cơ sở tri thức!', 'success');
      }

      resetEditorForm();
      switchView('view-documents');
    } catch (err) {
      showToast('Lỗi khi lưu văn bản: ' + err.message, 'error');
    } finally {
      btnSubmitDoc.disabled = false;
      btnSubmitDocText.textContent = state.editingDocId ? 'Lưu Thay Đổi Văn Bản' : 'Lưu Văn Bản Vào Hệ Thống';
    }
  });

  // ============================================================
  // MÀN HÌNH 3: THỬ NGHIỆM AI & RAG (CHAT SIMULATOR & RAG X-RAY)
  // ============================================================
  const playgroundQuery = document.getElementById('playgroundQuery');
  const chkSkipCache = document.getElementById('chkSkipCache');
  const btnRunQueryTest = document.getElementById('btnRunQueryTest');
  const btnResetChat = document.getElementById('btnResetChat');
  const chatUserBubble = document.getElementById('chatUserBubble');
  const chatUserText = document.getElementById('chatUserText');
  const chatBotBubble = document.getElementById('chatBotBubble');
  const chatMetaBar = document.getElementById('chatMetaBar');
  const telemetryIntent = document.getElementById('telemetryIntent');
  const telemetryLatency = document.getElementById('telemetryLatency');
  const telemetrySource = document.getElementById('telemetrySource');
  const telemetryDocs = document.getElementById('telemetryDocs');
  const botAnswerContent = document.getElementById('botAnswerContent');
  const btnCopyPlaygroundAnswer = document.getElementById('btnCopyPlaygroundAnswer');
  const passagesCountBadge = document.getElementById('passagesCountBadge');
  const passagesContainer = document.getElementById('passagesContainer');

  if (btnResetChat) {
    btnResetChat.addEventListener('click', () => {
      if (playgroundQuery) playgroundQuery.value = '';
      if (chatUserBubble) chatUserBubble.style.display = 'none';
      if (chatMetaBar) chatMetaBar.style.display = 'none';
      if (botAnswerContent) {
        botAnswerContent.innerHTML = 'Xin chào đồng chí! Tôi là Trợ Lý AI hỗ trợ thể thức văn bản Đảng. Đồng chí hãy chọn câu hỏi gợi ý bên trên hoặc nhập nội dung nghiệp vụ vào ô bên dưới để bắt đầu kiểm thử.';
      }
      if (passagesContainer) {
        passagesContainer.innerHTML = `
          <div class="table-empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <p>Sau khi chạy kiểm thử câu hỏi, các đoạn trích điều khoản được RAG truy xuất sẽ hiển thị chi tiết tại đây kèm theo số hiệu, độ tương đồng ngữ nghĩa và tình trạng hiệu lực.</p>
          </div>
        `;
      }
      if (passagesCountBadge) passagesCountBadge.textContent = '0 điều khoản';
      showToast('Đã làm mới khung trò chuyện thử nghiệm.', 'info');
    });
  }

  async function runPlaygroundTest(queryText) {
    const q = (queryText || playgroundQuery.value).trim();
    if (!q) {
      showToast('Vui lòng nhập câu hỏi kiểm thử.', 'warning');
      playgroundQuery.focus();
      return;
    }

    playgroundQuery.value = q;
    const skipCache = chkSkipCache ? chkSkipCache.checked : false;

    // Hiển thị bong bóng chat người dùng và trạng thái đang suy luận của bot
    if (chatUserBubble && chatUserText) {
      chatUserText.textContent = q;
      chatUserBubble.style.display = 'block';
    }
    if (chatBotBubble) {
      chatBotBubble.style.display = 'block';
    }
    if (chatMetaBar) {
      chatMetaBar.style.display = 'none';
    }
    botAnswerContent.innerHTML = '<em>Đang phân tích ý định, truy xuất tài liệu và tổng hợp câu trả lời qua Pipeline 7 Tầng &amp; Gemini AI...</em>';
    passagesContainer.innerHTML = '<div class="table-empty"><p>Đang truy xuất các đoạn trích liên quan từ cơ sở dữ liệu...</p></div>';
    if (passagesCountBadge) passagesCountBadge.textContent = 'Đang truy xuất...';

    try {
      btnRunQueryTest.disabled = true;
      btnRunQueryTest.innerHTML = 'Đang thực thi Pipeline...';

      const res = await apiRequest('/api/pipeline-test', {
        method: 'POST',
        body: JSON.stringify({ query: q, skipCache }),
      });

      if (res.ok) {
        // Cập nhật câu trả lời của Bot
        botAnswerContent.textContent = res.answer || 'Không có phản hồi từ hệ thống.';

        // Cập nhật Telemetry Performance Pill
        if (telemetrySource) {
          if (res.fromCache) {
            telemetrySource.textContent = 'HIT CACHE (< 10ms)';
            telemetrySource.className = 'chat-meta-pill pill-cache-hit';
          } else {
            telemetrySource.textContent = 'DIRECT GEMINI LLM';
            telemetrySource.className = 'chat-meta-pill pill-cache-miss';
          }
        }

        if (telemetryLatency) {
          telemetryLatency.textContent = `${res.latencyMs || 0} ms`;
        }

        if (telemetryIntent) {
          telemetryIntent.textContent = res.intent || 'party_regulation';
        }

        if (telemetryDocs) {
          const docCount = (res.retrievedDocs && res.retrievedDocs.length) || 0;
          telemetryDocs.textContent = `${docCount} văn bản viện dẫn`;
        }

        if (chatMetaBar) {
          chatMetaBar.style.display = 'flex';
        }

        // Cập nhật X-Ray Passages
        renderPlaygroundPassages(res.passages || []);
      }
    } catch (err) {
      botAnswerContent.textContent = 'Lỗi thực thi: ' + err.message;
      if (chatMetaBar) chatMetaBar.style.display = 'none';
      showToast('Lỗi khi kiểm thử Pipeline: ' + err.message, 'error');
    } finally {
      btnRunQueryTest.disabled = false;
      btnRunQueryTest.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
          <polygon points="5 3 19 12 5 21 5 3"></polygon>
        </svg>
        <span>Thực Thi</span>
      `;
    }
  }

  btnRunQueryTest.addEventListener('click', () => runPlaygroundTest());

  playgroundQuery.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      runPlaygroundTest();
    }
  });

  // Gợi ý câu hỏi mẫu
  document.querySelectorAll('.chip-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const q = btn.getAttribute('data-query');
      if (q) runPlaygroundTest(q);
    });
  });

  btnCopyPlaygroundAnswer.addEventListener('click', () => {
    const text = botAnswerContent.textContent;
    if (text) copyToClipboard(text, 'Đã sao chép câu trả lời AI.');
  });

  function renderPlaygroundPassages(passages) {
    if (passagesCountBadge) {
      passagesCountBadge.textContent = `${passages.length} điều khoản`;
    }

    if (!passages.length) {
      passagesContainer.innerHTML = `
        <div class="table-empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <p>Không có điều khoản nào được trích xuất cho truy vấn này.</p>
        </div>
      `;
      return;
    }

    let html = '';
    passages.forEach((p, idx) => {
      const rank = idx + 1;
      const docCode = p.documentCode || p.documentId || '--';
      const artNum = p.articleNumber || '';
      const title = p.title || `Điều ${artNum}`;
      const score = p.score ? Number(p.score).toFixed(2) : `Top #${rank}`;
      const isExpired = (p.status || '').toLowerCase().includes('hết hiệu lực');

      html += `
        <div class="passage-card">
          <div class="passage-header">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="passage-rank-badge">#${rank}</span>
              <span class="code-badge">${escapeHtml(docCode)}</span>
              <span style="font-weight: 700; font-size: 13px; color: var(--text-main);">Điều ${escapeHtml(artNum)}: ${escapeHtml(title)}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 6px;">
              <span class="passage-score-badge">Khớp: ${score}</span>
              ${isExpired 
                ? `<span class="status-badge badge-expired" style="font-size: 10.5px; padding: 1px 6px;">Hết hiệu lực</span>` 
                : `<span class="status-badge badge-active" style="font-size: 10.5px; padding: 1px 6px;">Còn hiệu lực</span>`}
              <button type="button" class="action-icon-btn btn-icon-view" data-tooltip="Xem toàn văn văn bản này" data-doc-code="${escapeHtml(docCode)}">
                ${ICONS.view}
              </button>
              <button type="button" class="action-icon-btn btn-icon-edit" data-tooltip="Chỉnh sửa văn bản này trong Studio" data-doc-code="${escapeHtml(docCode)}">
                ${ICONS.edit}
              </button>
            </div>
          </div>
          <div class="passage-text">${escapeHtml(p.content || p.fullText || '')}</div>
        </div>
      `;
    });

    passagesContainer.innerHTML = html;

    // Xem toàn văn văn bản từ passage
    passagesContainer.querySelectorAll('.btn-icon-view').forEach(b => {
      b.addEventListener('click', () => {
        const dCode = b.getAttribute('data-doc-code');
        const found = state.allDocuments.find(d => d.document_code === dCode);
        if (found) {
          openDetailModal(found.id);
        } else {
          showToast(`Không tìm thấy văn bản ID cho mã [${dCode}]`, 'warning');
        }
      });
    });

    // Chỉnh sửa văn bản từ passage
    passagesContainer.querySelectorAll('.btn-icon-edit').forEach(b => {
      b.addEventListener('click', () => {
        const dCode = b.getAttribute('data-doc-code');
        const found = state.allDocuments.find(d => d.document_code === dCode);
        if (found) {
          loadDocToEditor(found.id);
        } else {
          showToast(`Không tìm thấy văn bản ID cho mã [${dCode}]`, 'warning');
        }
      });
    });
  }

  // ============================================================
  // MÀN HÌNH 4: NHẬT KÝ & NGƯỜI DÙNG ZALO
  // ============================================================
  const subtabBtns = document.querySelectorAll('.subtab-btn');
  const subtabLogs = document.getElementById('subtab-logs');
  const subtabZaloUsers = document.getElementById('subtab-zalo-users');

  subtabBtns.forEach(b => {
    b.addEventListener('click', () => {
      const tabKey = b.getAttribute('data-subtab');
      state.activeSubTab = tabKey;
      subtabBtns.forEach(btn => btn.classList.remove('active'));
      b.classList.add('active');

      if (tabKey === 'subtab-logs') {
        subtabLogs.classList.add('active');
        subtabZaloUsers.classList.remove('active');
        loadQueryLogs();
      } else {
        subtabLogs.classList.remove('active');
        subtabZaloUsers.classList.add('active');
        loadZaloUsers();
      }
    });
  });

  // --- SUB-TAB 4A: AUDIT LOGS ---
  const logSearchInput = document.getElementById('logSearchInput');
  const logIntentFilter = document.getElementById('logIntentFilter');
  const logSpeedFilter = document.getElementById('logSpeedFilter');
  const btnRefreshLogs = document.getElementById('btnRefreshLogs');
  const queryLogsTableBody = document.getElementById('queryLogsTableBody');
  const logPaginationInfo = document.getElementById('logPaginationInfo');
  const logPageSizeSelect = document.getElementById('logPageSizeSelect');
  const logPaginationButtons = document.getElementById('logPaginationButtons');

  async function loadQueryLogs() {
    try {
      const res = await apiRequest('/api/query-logs?limit=300');
      if (res.ok) {
        state.allLogs = res.logs || [];
        applyLogFilters();
      }
    } catch (err) {
      showToast('Lỗi khi tải nhật ký hỏi đáp: ' + err.message, 'error');
    }
  }

  function applyLogFilters() {
    let list = [...state.allLogs];

    if (state.logSearchQuery) {
      const q = state.logSearchQuery.toLowerCase();
      list = list.filter(l => {
        const query = (l.query_text || '').toLowerCase();
        const user = (l.sender_name || l.sender_id || '').toLowerCase();
        return query.includes(q) || user.includes(q);
      });
    }

    if (state.logIntentFilter) {
      list = list.filter(l => l.intent === state.logIntentFilter);
    }

    if (state.logSpeedFilter) {
      if (state.logSpeedFilter === 'fast') {
        list = list.filter(l => (parseInt(l.latency_ms, 10) || 0) < 50);
      } else if (state.logSpeedFilter === 'normal') {
        list = list.filter(l => {
          const lat = parseInt(l.latency_ms, 10) || 0;
          return lat >= 50 && lat <= 3000;
        });
      } else if (state.logSpeedFilter === 'slow') {
        list = list.filter(l => (parseInt(l.latency_ms, 10) || 0) > 3000);
      }
    }

    state.filteredLogs = list;
    state.logCurrentPage = 1;
    renderQueryLogsTable();
  }

  function renderQueryLogsTable() {
    const list = state.filteredLogs;
    const total = list.length;
    const pageSize = state.logPageSize;
    const totalPages = Math.ceil(total / pageSize) || 1;
    if (state.logCurrentPage > totalPages) state.logCurrentPage = totalPages;

    const startIdx = (state.logCurrentPage - 1) * pageSize;
    const endIdx = Math.min(startIdx + pageSize, total);
    const pageItems = list.slice(startIdx, endIdx);

    if (total === 0) {
      queryLogsTableBody.innerHTML = `
        <tr>
          <td colspan="7">
            <div class="table-empty">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <p>Không có nhật ký hội thoại nào phù hợp với bộ lọc.</p>
            </div>
          </td>
        </tr>
      `;
      logPaginationInfo.textContent = 'Hiển thị 0 - 0 trên tổng số 0 nhật ký';
      logPaginationButtons.innerHTML = '';
      return;
    }

    logPaginationInfo.textContent = `Hiển thị ${startIdx + 1} - ${endIdx} trên tổng số ${total} nhật ký`;

    let html = '';
    pageItems.forEach((log, idx) => {
      const stt = startIdx + idx + 1;
      const latency = parseInt(log.latency_ms, 10) || 0;
      let latencyCls = 'latency-normal';
      if (latency < 50) latencyCls = 'latency-fast';
      else if (latency > 3000) latencyCls = 'latency-slow';

      const docs = Array.isArray(log.retrieved_docs) ? log.retrieved_docs.join(', ') : (log.retrieved_docs || '--');

      html += `
        <tr>
          <td style="text-align: center; color: var(--text-muted); font-weight: 600;">${stt}</td>
          <td>${formatDateTime(log.created_at)}</td>
          <td>
            <div style="font-weight: 600; color: var(--text-main);">${escapeHtml(log.sender_name || 'Đồng chí')}</div>
            <div style="font-size: 11px; color: var(--text-muted); font-family: var(--font-mono);">${escapeHtml(log.sender_id || '--')}</div>
          </td>
          <td>
            <div class="doc-name-link" style="max-width: 400px; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;" data-log-idx="${startIdx + idx}">
              ${escapeHtml(log.query_text)}
            </div>
          </td>
          <td>
            <div style="display: flex; flex-direction: column; gap: 3px;">
              <span class="category-badge cat-quy-dinh" style="font-size: 11px; align-self: flex-start;">${escapeHtml(log.intent || 'party_regulation')}</span>
              <span style="font-size: 11px; color: var(--text-muted);">${escapeHtml(docs)}</span>
            </div>
          </td>
          <td style="text-align: center;">
            <span class="${latencyCls}">${latency} ms</span>
          </td>
          <td style="text-align: right;">
            <div class="table-actions">
              <button type="button" class="action-icon-btn btn-icon-view" data-tooltip="Xem chi tiết câu hỏi & toàn văn câu trả lời" data-action="view-log" data-log-idx="${startIdx + idx}">
                ${ICONS.view}
              </button>
              <button type="button" class="action-icon-btn btn-icon-edit" data-tooltip="Đưa câu hỏi này sang AI Playground" data-action="replay-log" data-log-idx="${startIdx + idx}">
                ${ICONS.test}
              </button>
            </div>
          </td>
        </tr>
      `;
    });

    queryLogsTableBody.innerHTML = html;
    renderPaginationButtons(logPaginationButtons, state.logCurrentPage, totalPages, (p) => {
      state.logCurrentPage = p;
      renderQueryLogsTable();
    });
  }

  logSearchInput.addEventListener('input', debounce((e) => {
    state.logSearchQuery = e.target.value.trim();
    applyLogFilters();
  }, 250));

  logIntentFilter.addEventListener('change', (e) => {
    state.logIntentFilter = e.target.value;
    applyLogFilters();
  });

  logSpeedFilter.addEventListener('change', (e) => {
    state.logSpeedFilter = e.target.value;
    applyLogFilters();
  });

  btnRefreshLogs.addEventListener('click', () => {
    loadQueryLogs();
    showToast('Đã làm mới dữ liệu nhật ký hỏi đáp.', 'info');
  });

  logPageSizeSelect.addEventListener('change', (e) => {
    state.logPageSize = parseInt(e.target.value, 10) || 10;
    state.logCurrentPage = 1;
    renderQueryLogsTable();
  });

  // Table Logs Click Delegation
  queryLogsTableBody.addEventListener('click', (e) => {
    const target = e.target.closest('button, .doc-name-link');
    if (!target) return;

    const idx = parseInt(target.getAttribute('data-log-idx'), 10);
    if (isNaN(idx) || !state.filteredLogs[idx]) return;

    const logItem = state.filteredLogs[idx];
    const action = target.getAttribute('data-action');

    if (action === 'replay-log') {
      playgroundQuery.value = logItem.query_text;
      switchView('view-playground');
      runPlaygroundTest(logItem.query_text);
    } else {
      openLogDetailModal(logItem);
    }
  });

  // --- SUB-TAB 4B: ZALO USERS ---
  const zaloUserSearchInput = document.getElementById('zaloUserSearchInput');
  const zaloUserStatusFilter = document.getElementById('zaloUserStatusFilter');
  const btnRefreshZaloUsers = document.getElementById('btnRefreshZaloUsers');
  const zaloUsersTableBody = document.getElementById('zaloUsersTableBody');
  const zaloUserPaginationInfo = document.getElementById('zaloUserPaginationInfo');
  const zaloUserPageSizeSelect = document.getElementById('zaloUserPageSizeSelect');
  const zaloUserPaginationButtons = document.getElementById('zaloUserPaginationButtons');

  async function loadZaloUsers() {
    try {
      const res = await apiRequest('/api/zalo-users');
      if (res.ok) {
        state.allZaloUsers = res.users || [];
        applyZaloUserFilters();
      }
    } catch (err) {
      showToast('Lỗi khi tải danh sách người dùng Zalo: ' + err.message, 'error');
    }
  }

  function applyZaloUserFilters() {
    let list = [...state.allZaloUsers];

    if (state.zaloUserSearchQuery) {
      const q = state.zaloUserSearchQuery.toLowerCase();
      list = list.filter(u => {
        const name = (u.display_name || '').toLowerCase();
        const zid = (u.zalo_id || '').toLowerCase();
        return name.includes(q) || zid.includes(q);
      });
    }

    if (state.zaloUserStatusFilter) {
      if (state.zaloUserStatusFilter === 'active') {
        list = list.filter(u => !u.is_blocked);
      } else if (state.zaloUserStatusFilter === 'blocked') {
        list = list.filter(u => u.is_blocked);
      }
    }

    state.filteredZaloUsers = list;
    state.zaloUserCurrentPage = 1;
    renderZaloUsersTable();
  }

  function renderZaloUsersTable() {
    const list = state.filteredZaloUsers;
    const total = list.length;
    const pageSize = state.zaloUserPageSize;
    const totalPages = Math.ceil(total / pageSize) || 1;
    if (state.zaloUserCurrentPage > totalPages) state.zaloUserCurrentPage = totalPages;

    const startIdx = (state.zaloUserCurrentPage - 1) * pageSize;
    const endIdx = Math.min(startIdx + pageSize, total);
    const pageItems = list.slice(startIdx, endIdx);

    if (total === 0) {
      zaloUsersTableBody.innerHTML = `
        <tr>
          <td colspan="7">
            <div class="table-empty">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <p>Không có người dùng Zalo nào phù hợp với bộ lọc.</p>
            </div>
          </td>
        </tr>
      `;
      zaloUserPaginationInfo.textContent = 'Hiển thị 0 - 0 trên tổng số 0 người dùng';
      zaloUserPaginationButtons.innerHTML = '';
      return;
    }

    zaloUserPaginationInfo.textContent = `Hiển thị ${startIdx + 1} - ${endIdx} trên tổng số ${total} người dùng`;

    let html = '';
    pageItems.forEach((u, idx) => {
      const stt = startIdx + idx + 1;
      const isBlocked = !!u.is_blocked;

      html += `
        <tr>
          <td style="text-align: center; color: var(--text-muted); font-weight: 600;">${stt}</td>
          <td>
            <span class="code-badge">${escapeHtml(u.zalo_id)}</span>
          </td>
          <td>
            <span style="font-weight: 700; color: var(--text-main);">${escapeHtml(u.display_name || 'Đồng chí')}</span>
          </td>
          <td style="text-align: center;">
            <span class="scale-badge">${u.query_count || 0} lượt</span>
          </td>
          <td>${formatDateTime(u.last_interaction_at || u.updated_at)}</td>
          <td style="text-align: center;">
            ${isBlocked 
              ? `<span class="status-badge badge-expired">Đã chặn</span>` 
              : `<span class="status-badge badge-active">Hoạt động</span>`}
          </td>
          <td style="text-align: right;">
            <div class="table-actions">
              <button type="button" class="action-icon-btn btn-icon-view" data-tooltip="Lọc lịch sử câu hỏi của người dùng này" data-action="filter-history" data-zalo-id="${escapeHtml(u.zalo_id)}">
                ${ICONS.history}
              </button>
              <button type="button" class="action-icon-btn ${isBlocked ? 'btn-icon-copy' : 'btn-icon-delete'}" data-tooltip="${isBlocked ? 'Mở khóa quyền hỏi đáp cho người dùng này' : 'Chặn quyền hỏi đáp của người dùng này'}" data-action="toggle-block" data-zalo-id="${escapeHtml(u.zalo_id)}" data-blocked="${isBlocked}">
                ${isBlocked ? ICONS.unlock : ICONS.lock}
              </button>
            </div>
          </td>
        </tr>
      `;
    });

    zaloUsersTableBody.innerHTML = html;
    renderPaginationButtons(zaloUserPaginationButtons, state.zaloUserCurrentPage, totalPages, (p) => {
      state.zaloUserCurrentPage = p;
      renderZaloUsersTable();
    });
  }

  zaloUserSearchInput.addEventListener('input', debounce((e) => {
    state.zaloUserSearchQuery = e.target.value.trim();
    applyZaloUserFilters();
  }, 250));

  zaloUserStatusFilter.addEventListener('change', (e) => {
    state.zaloUserStatusFilter = e.target.value;
    applyZaloUserFilters();
  });

  btnRefreshZaloUsers.addEventListener('click', () => {
    loadZaloUsers();
    showToast('Đã làm mới danh sách người dùng Zalo.', 'info');
  });

  zaloUserPageSizeSelect.addEventListener('change', (e) => {
    state.zaloUserPageSize = parseInt(e.target.value, 10) || 10;
    state.zaloUserCurrentPage = 1;
    renderZaloUsersTable();
  });

  // Table Zalo Users Action Click Delegation
  zaloUsersTableBody.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    const zaloId = btn.getAttribute('data-zalo-id');

    if (action === 'filter-history') {
      // Chuyển sang subtab logs và lọc theo Zalo ID
      const tabLogsBtn = document.querySelector('.subtab-btn[data-subtab="subtab-logs"]');
      if (tabLogsBtn) tabLogsBtn.click();
      logSearchInput.value = zaloId;
      state.logSearchQuery = zaloId;
      applyLogFilters();
      showToast(`Đang lọc lịch sử hội thoại của Zalo ID [${zaloId}]`, 'info');
    } else if (action === 'toggle-block') {
      const isCurrentlyBlocked = btn.getAttribute('data-blocked') === 'true';
      const targetBlockState = !isCurrentlyBlocked;
      const ok = await showConfirmDialog({
        title: targetBlockState ? 'Chặn Người Dùng Zalo' : 'Mở Khóa Người Dùng Zalo',
        message: targetBlockState 
          ? `Đồng chí có chắc chắn muốn <b>CHẶN</b> người dùng Zalo ID <b>[${escapeHtml(zaloId)}]</b>? Người này sẽ không thể nhận câu trả lời từ AI Bot.`
          : `Đồng chí có chắc muốn <b>MỞ KHÓA</b> quyền hỏi đáp cho người dùng Zalo ID <b>[${escapeHtml(zaloId)}]</b>?`,
        type: targetBlockState ? 'danger' : 'info',
        confirmText: targetBlockState ? 'Xác nhận chặn' : 'Xác nhận mở khóa',
        cancelText: 'Hủy bỏ',
      });
      if (!ok) return;

      try {
        const res = await apiRequest(`/api/zalo-users/${zaloId}/toggle-block`, {
          method: 'POST',
          body: JSON.stringify({ isBlocked: targetBlockState }),
        });
        showToast(res.message || 'Cập nhật trạng thái thành công.', 'success');
        loadZaloUsers();
      } catch (err) {
        showToast('Lỗi khi cập nhật trạng thái chặn: ' + err.message, 'error');
      }
    }
  });

  // ============================================================
  // MÀN HÌNH 5: QUẢN TRỊ CÁN BỘ
  // ============================================================
  const adminSearchInput = document.getElementById('adminSearchInput');
  const adminRoleFilter = document.getElementById('adminRoleFilter');
  const adminStatusFilter = document.getElementById('adminStatusFilter');
  const btnOpenAddAdminModal = document.getElementById('btnOpenAddAdminModal');
  const adminUsersTableBody = document.getElementById('adminUsersTableBody');
  const adminPaginationInfo = document.getElementById('adminPaginationInfo');
  const adminPaginationButtons = document.getElementById('adminPaginationButtons');

  async function loadAdminUsers() {
    try {
      const res = await apiRequest('/api/users');
      if (res.ok) {
        state.allAdmins = res.users || [];
        applyAdminFilters();
      }
    } catch (err) {
      showToast('Lỗi khi tải danh sách cán bộ: ' + err.message, 'error');
    }
  }

  function applyAdminFilters() {
    let list = [...state.allAdmins];

    if (state.adminSearchQuery) {
      const q = state.adminSearchQuery.toLowerCase();
      list = list.filter(u => {
        const username = (u.username || '').toLowerCase();
        const fullName = (u.full_name || '').toLowerCase();
        const email = (u.email || '').toLowerCase();
        return username.includes(q) || fullName.includes(q) || email.includes(q);
      });
    }

    if (state.adminRoleFilter) {
      list = list.filter(u => u.role === state.adminRoleFilter);
    }

    if (state.adminStatusFilter) {
      if (state.adminStatusFilter === 'active') {
        list = list.filter(u => u.is_active);
      } else if (state.adminStatusFilter === 'locked') {
        list = list.filter(u => !u.is_active);
      }
    }

    state.filteredAdmins = list;
    state.adminCurrentPage = 1;
    renderAdminUsersTable();
  }

  function renderAdminUsersTable() {
    const list = state.filteredAdmins;
    const total = list.length;
    const pageSize = state.adminPageSize;
    const totalPages = Math.ceil(total / pageSize) || 1;
    if (state.adminCurrentPage > totalPages) state.adminCurrentPage = totalPages;

    const startIdx = (state.adminCurrentPage - 1) * pageSize;
    const endIdx = Math.min(startIdx + pageSize, total);
    const pageItems = list.slice(startIdx, endIdx);

    if (total === 0) {
      adminUsersTableBody.innerHTML = `
        <tr>
          <td colspan="7">
            <div class="table-empty">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <p>Không có tài khoản cán bộ nào phù hợp.</p>
            </div>
          </td>
        </tr>
      `;
      adminPaginationInfo.textContent = 'Hiển thị 0 - 0 trên tổng số 0 cán bộ';
      adminPaginationButtons.innerHTML = '';
      return;
    }

    adminPaginationInfo.textContent = `Hiển thị ${startIdx + 1} - ${endIdx} trên tổng số ${total} cán bộ`;

    let html = '';
    pageItems.forEach((u, idx) => {
      const stt = startIdx + idx + 1;
      const isMe = state.currentUser && state.currentUser.id === u.id;
      const isActive = !!u.is_active;

      html += `
        <tr>
          <td style="text-align: center; color: var(--text-muted); font-weight: 600;">${stt}</td>
          <td>
            <div style="font-weight: 700; color: var(--text-main);">
              ${escapeHtml(u.username)} ${isMe ? `<span class="category-badge cat-the-thuc" style="font-size: 10.5px; padding: 1px 6px;">(Bạn)</span>` : ''}
            </div>
          </td>
          <td>${escapeHtml(u.full_name || '--')}</td>
          <td>${escapeHtml(u.email || '--')}</td>
          <td>${getRoleBadge(u.role)}</td>
          <td>
            <div style="display: flex; flex-direction: column; gap: 2px;">
              ${isActive 
                ? `<span class="status-badge badge-active" style="align-self: flex-start;">Hoạt động</span>` 
                : `<span class="status-badge badge-expired" style="align-self: flex-start;">Đã khóa</span>`}
              <span style="font-size: 11px; color: var(--text-muted);">${u.last_login ? formatDateTime(u.last_login) : 'Chưa đăng nhập'}</span>
            </div>
          </td>
          <td style="text-align: right;">
            <div class="table-actions">
              <button type="button" class="action-icon-btn btn-icon-edit" data-tooltip="Chỉnh sửa thông tin & phân quyền cán bộ" data-action="edit-user" data-user-id="${u.id}">
                ${ICONS.edit}
              </button>
              <button type="button" class="action-icon-btn ${isActive ? 'btn-icon-delete' : 'btn-icon-copy'}" data-tooltip="${isActive ? 'Khóa tài khoản cán bộ' : 'Mở khóa tài khoản cán bộ'}" data-action="toggle-user-active" data-user-id="${u.id}" data-active="${isActive}" ${isMe ? 'disabled' : ''}>
                ${isActive ? ICONS.lock : ICONS.unlock}
              </button>
              <button type="button" class="action-icon-btn btn-icon-delete" data-tooltip="Xóa tài khoản cán bộ" data-action="delete-user" data-user-id="${u.id}" ${isMe ? 'disabled' : ''}>
                ${ICONS.delete}
              </button>
            </div>
          </td>
        </tr>
      `;
    });

    adminUsersTableBody.innerHTML = html;
    renderPaginationButtons(adminPaginationButtons, state.adminCurrentPage, totalPages, (p) => {
      state.adminCurrentPage = p;
      renderAdminUsersTable();
    });
  }

  adminSearchInput.addEventListener('input', debounce((e) => {
    state.adminSearchQuery = e.target.value.trim();
    applyAdminFilters();
  }, 250));

  adminRoleFilter.addEventListener('change', (e) => {
    state.adminRoleFilter = e.target.value;
    applyAdminFilters();
  });

  adminStatusFilter.addEventListener('change', (e) => {
    state.adminStatusFilter = e.target.value;
    applyAdminFilters();
  });

  // Table Users Action Delegation
  adminUsersTableBody.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    const userId = parseInt(btn.getAttribute('data-user-id'), 10);
    if (!userId) return;

    if (action === 'edit-user') {
      const u = state.allAdmins.find(x => x.id === userId);
      if (u) openUserModal(u);
    } else if (action === 'toggle-user-active') {
      const isCurrentlyActive = btn.getAttribute('data-active') === 'true';
      const targetState = !isCurrentlyActive;
      const ok = await showConfirmDialog({
        title: targetState ? 'Mở Khóa Tài Khoản Cán Bộ' : 'Khóa Tài Khoản Cán Bộ',
        message: targetState 
          ? `Đồng chí có chắc chắn muốn <b>MỞ KHÓA</b> tài khoản cán bộ này để người dùng có thể đăng nhập bình thường?` 
          : `Đồng chí có chắc chắn muốn <b>KHÓA</b> tài khoản cán bộ này? Người dùng sẽ không thể đăng nhập.`,
        type: targetState ? 'info' : 'warning',
        confirmText: targetState ? 'Mở khóa ngay' : 'Khóa tài khoản',
        cancelText: 'Hủy bỏ',
      });
      if (!ok) return;

      try {
        const res = await apiRequest(`/api/users/${userId}`, {
          method: 'PUT',
          body: JSON.stringify({ isActive: targetState }),
        });
        showToast(res.message || 'Đã cập nhật trạng thái tài khoản.', 'success');
        loadAdminUsers();
      } catch (err) {
        showToast('Lỗi khi cập nhật trạng thái: ' + err.message, 'error');
      }
    } else if (action === 'delete-user') {
      const ok = await showConfirmDialog({
        title: 'Xóa Tài Khoản Cán Bộ',
        message: 'Đồng chí có chắc chắn muốn <b>XÓA VĨNH VIỄN</b> tài khoản cán bộ này khỏi hệ thống quản trị? Thao tác này không thể hoàn tác.',
        type: 'danger',
        confirmText: 'Đồng ý xóa',
        cancelText: 'Hủy bỏ',
      });
      if (!ok) return;

      try {
        const res = await apiRequest(`/api/users/${userId}`, { method: 'DELETE' });
        showToast(res.message || 'Đã xóa tài khoản cán bộ.', 'success');
        loadAdminUsers();
      } catch (err) {
        showToast('Lỗi khi xóa tài khoản: ' + err.message, 'error');
      }
    }
  });

  // ============================================================
  // HỆ THỐNG MODAL CHI TIẾT
  // ============================================================

  // --- MODAL 1: CHI TIẾT VĂN BẢN (#detailModal) ---
  const detailModal = document.getElementById('detailModal');
  const btnCloseDetailModal = document.getElementById('btnCloseDetailModal');
  const btnCloseDetailModalFooter = document.getElementById('btnCloseDetailModalFooter');
  const btnModalEditDoc = document.getElementById('btnModalEditDoc');
  const modalDocCode = document.getElementById('modalDocCode');
  const modalDocName = document.getElementById('modalDocName');
  const modalDocStatusBadge = document.getElementById('modalDocStatusBadge');
  const modalDocIssuer = document.getElementById('modalDocIssuer');
  const modalDocCategory = document.getElementById('modalDocCategory');
  const modalDocDate = document.getElementById('modalDocDate');
  const modalDocCount = document.getElementById('modalDocCount');
  const modalDocDescriptionBox = document.getElementById('modalDocDescriptionBox');
  const modalDocDescription = document.getElementById('modalDocDescription');
  const modalArticleSearchInput = document.getElementById('modalArticleSearchInput');
  const modalArticlesList = document.getElementById('modalArticlesList');

  async function openDetailModal(docId) {
    try {
      const res = await apiRequest(`/api/documents/${docId}`);
      if (res.ok && res.document) {
        const doc = res.document;
        state.currentModalDoc = doc;

        modalDocCode.textContent = doc.document_code;
        modalDocName.textContent = doc.document_name;

        const isExpired = (doc.status || '').toLowerCase().includes('hết hiệu lực');
        modalDocStatusBadge.innerHTML = isExpired 
          ? `<span class="status-badge badge-expired">Hết hiệu lực</span>` 
          : `<span class="status-badge badge-active">Còn hiệu lực</span>`;

        modalDocIssuer.textContent = doc.issuer || '--';
        modalDocCategory.innerHTML = getCategoryLabel(doc.category);
        modalDocDate.textContent = formatDate(doc.issue_date);
        modalDocCount.textContent = `${(doc.articles || []).length} điều khoản`;

        if (doc.description) {
          modalDocDescriptionBox.style.display = 'block';
          modalDocDescription.textContent = doc.description;
        } else {
          modalDocDescriptionBox.style.display = 'none';
        }

        modalArticleSearchInput.value = '';
        renderModalArticles(doc.articles || []);

        detailModal.classList.add('active');
      }
    } catch (err) {
      showToast('Không thể mở chi tiết văn bản: ' + err.message, 'error');
    }
  }

  function renderModalArticles(articles) {
    if (!articles.length) {
      modalArticlesList.innerHTML = `
        <div class="table-empty">
          <p>Không có điều khoản nào trong văn bản này.</p>
        </div>
      `;
      return;
    }

    const query = modalArticleSearchInput.value.trim().toLowerCase();
    let filtered = articles;
    if (query) {
      filtered = articles.filter(a => 
        (a.article_number || '').toLowerCase().includes(query) ||
        (a.title || '').toLowerCase().includes(query) ||
        (a.content || '').toLowerCase().includes(query)
      );
    }

    if (!filtered.length) {
      modalArticlesList.innerHTML = `
        <div class="table-empty">
          <p>Không tìm thấy điều khoản nào khớp với từ khóa tìm kiếm trong văn bản.</p>
        </div>
      `;
      return;
    }

    let html = '';
    filtered.forEach(art => {
      const artNum = art.article_number || '';
      const artTitle = art.title || `Điều ${artNum}`;
      const textToCopy = `[${state.currentModalDoc?.document_code}] Điều ${artNum}: ${artTitle}\n${art.content || ''}`;

      html += `
        <div class="modal-article-card">
          <div class="modal-article-header">
            <span class="modal-article-title">Điều ${escapeHtml(artNum)}: ${escapeHtml(artTitle)}</span>
            <button type="button" class="action-icon-btn btn-icon-copy" data-tooltip="Sao chép điều khoản này" data-copy-text="${escapeHtml(textToCopy)}">
              ${ICONS.copy}
            </button>
          </div>
          <div class="modal-article-body">${escapeHtml(art.content || '')}</div>
        </div>
      `;
    });

    modalArticlesList.innerHTML = html;

    modalArticlesList.querySelectorAll('.btn-icon-copy').forEach(btn => {
      btn.addEventListener('click', () => {
        const txt = btn.getAttribute('data-copy-text');
        if (txt) copyToClipboard(txt, 'Đã sao chép điều khoản vào bộ nhớ tạm.');
      });
    });
  }

  modalArticleSearchInput.addEventListener('input', () => {
    if (state.currentModalDoc) {
      renderModalArticles(state.currentModalDoc.articles || []);
    }
  });

  function closeDetailModal() {
    detailModal.classList.remove('active');
  }

  btnCloseDetailModal.addEventListener('click', closeDetailModal);
  btnCloseDetailModalFooter.addEventListener('click', closeDetailModal);

  const btnModalExportJson = document.getElementById('btnModalExportJson');
  if (btnModalExportJson) {
    btnModalExportJson.addEventListener('click', () => {
      if (!state.currentModalDoc) {
        showToast('Không có dữ liệu văn bản để tải.', 'warning');
        return;
      }
      const doc = state.currentModalDoc;
      const exportData = {
        documentCode: doc.document_code,
        documentName: doc.document_name,
        issuer: doc.issuer,
        category: doc.category,
        issueDate: doc.issue_date,
        status: doc.status,
        description: doc.description,
        articles: (doc.articles || []).map(a => ({
          articleNumber: a.article_number,
          title: a.title,
          content: a.content,
        })),
      };
      const cleanFileName = (doc.document_code || 'van_ban').replace(/[/\\?%*:|"<>]/g, '_') + '.json';
      downloadJsonFile(cleanFileName, exportData);
      showToast(`Đã tải file [${cleanFileName}] thành công!`, 'success');
    });
  }

  btnModalEditDoc.addEventListener('click', () => {
    if (state.currentModalDoc) {
      const docId = state.currentModalDoc.id;
      closeDetailModal();
      loadDocToEditor(docId);
    }
  });

  // --- MODAL 2: CHI TIẾT NHẬT KÝ (#logDetailModal) ---
  const logDetailModal = document.getElementById('logDetailModal');
  const btnCloseLogModal = document.getElementById('btnCloseLogModal');
  const btnCloseLogModalFooter = document.getElementById('btnCloseLogModalFooter');
  const logUser = document.getElementById('logUser');
  const logZaloId = document.getElementById('logZaloId');
  const logTime = document.getElementById('logTime');
  const logLatency = document.getElementById('logLatency');
  const logIntent = document.getElementById('logIntent');
  const logDocs = document.getElementById('logDocs');
  const logQueryText = document.getElementById('logQueryText');
  const logResponseText = document.getElementById('logResponseText');
  const btnCopyLogAnswer = document.getElementById('btnCopyLogAnswer');
  const btnSendLogToPlayground = document.getElementById('btnSendLogToPlayground');

  let currentDetailLog = null;

  function openLogDetailModal(log) {
    currentDetailLog = log;
    logUser.textContent = log.sender_name || 'Đồng chí';
    logZaloId.textContent = log.sender_id || '--';
    logTime.textContent = formatDateTime(log.created_at);

    const lat = parseInt(log.latency_ms, 10) || 0;
    logLatency.textContent = `${lat} ms`;
    logIntent.textContent = log.intent || 'party_regulation';

    const docs = Array.isArray(log.retrieved_docs) ? log.retrieved_docs.join(', ') : (log.retrieved_docs || '--');
    logDocs.textContent = docs;

    logQueryText.textContent = log.query_text || '--';
    logResponseText.textContent = log.response_text || 'Không có câu trả lời.';

    logDetailModal.classList.add('active');
  }

  function closeLogDetailModal() {
    logDetailModal.classList.remove('active');
  }

  btnCloseLogModal.addEventListener('click', closeLogDetailModal);
  btnCloseLogModalFooter.addEventListener('click', closeLogDetailModal);

  btnCopyLogAnswer.addEventListener('click', () => {
    if (currentDetailLog && currentDetailLog.response_text) {
      copyToClipboard(currentDetailLog.response_text, 'Đã sao chép toàn văn câu trả lời.');
    }
  });

  btnSendLogToPlayground.addEventListener('click', () => {
    if (currentDetailLog) {
      closeLogDetailModal();
      playgroundQuery.value = currentDetailLog.query_text;
      switchView('view-playground');
      runPlaygroundTest(currentDetailLog.query_text);
    }
  });

  // --- MODAL 3: THÊM / SỬA CÁN BỘ (#userModal) ---
  const userModal = document.getElementById('userModal');
  const btnCloseUserModal = document.getElementById('btnCloseUserModal');
  const btnCloseUserModalFooter = document.getElementById('btnCloseUserModalFooter');
  const userModalTitle = document.getElementById('userModalTitle');
  const userForm = document.getElementById('userForm');
  const modalUserId = document.getElementById('modalUserId');
  const modalUsername = document.getElementById('modalUsername');
  const modalFullName = document.getElementById('modalFullName');
  const modalEmail = document.getElementById('modalEmail');
  const modalRole = document.getElementById('modalRole');
  const modalPassword = document.getElementById('modalPassword');
  const modalPasswordReq = document.getElementById('modalPasswordReq');
  const modalPasswordHint = document.getElementById('modalPasswordHint');
  const modalIsActive = document.getElementById('modalIsActive');

  function openUserModal(user = null) {
    if (user) {
      userModalTitle.textContent = 'Chỉnh Sửa Thông Tin Cán Bộ';
      modalUserId.value = user.id;
      modalUsername.value = user.username;
      modalUsername.disabled = true; // Không sửa username
      modalFullName.value = user.full_name || '';
      modalEmail.value = user.email || '';
      modalRole.value = user.role || 'user';
      modalPassword.value = '';
      modalPassword.required = false;
      modalPasswordReq.style.display = 'none';
      modalPasswordHint.textContent = 'Để trống nếu không muốn đổi mật khẩu cán bộ.';
      modalIsActive.checked = !!user.is_active;
    } else {
      userModalTitle.textContent = 'Thêm Cán Bộ Quản Trị Mới';
      modalUserId.value = '';
      modalUsername.value = '';
      modalUsername.disabled = false;
      modalFullName.value = '';
      modalEmail.value = '';
      modalRole.value = 'user';
      modalPassword.value = '';
      modalPassword.required = true;
      modalPasswordReq.style.display = 'inline';
      modalPasswordHint.textContent = 'Mật khẩu bắt buộc khi tạo mới cán bộ (tối thiểu 6 ký tự).';
      modalIsActive.checked = true;
    }
    userModal.classList.add('active');
  }

  function closeUserModal() {
    userModal.classList.remove('active');
  }

  btnCloseUserModal.addEventListener('click', closeUserModal);
  btnCloseUserModalFooter.addEventListener('click', closeUserModal);
  btnOpenAddAdminModal.addEventListener('click', () => openUserModal(null));

  userForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = modalUserId.value;
    const username = modalUsername.value.trim();
    const fullName = modalFullName.value.trim();
    const email = modalEmail.value.trim();
    const role = modalRole.value;
    const password = modalPassword.value;
    const isActive = modalIsActive.checked;

    const payload = {
      fullName,
      email,
      role,
      isActive,
    };

    if (password) payload.password = password;

    try {
      if (id) {
        const res = await apiRequest(`/api/users/${id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        showToast(res.message || 'Cập nhật cán bộ thành công!', 'success');
      } else {
        payload.username = username;
        if (!password) {
          showToast('Vui lòng nhập mật khẩu cho tài khoản mới.', 'warning');
          return;
        }
        const res = await apiRequest('/api/users', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        showToast(res.message || 'Thêm cán bộ mới thành công!', 'success');
      }

      closeUserModal();
      loadAdminUsers();
      loadStats();
    } catch (err) {
      showToast('Lỗi khi lưu tài khoản: ' + err.message, 'error');
    }
  });

  // --- MODAL 4: CÀI ĐẶT TÀI KHOẢN & ĐỔI MẬT KHẨU (#profileModal) ---
  const profileModal = document.getElementById('profileModal');
  const btnOpenProfile = document.getElementById('btnOpenProfile');
  const btnCloseProfileModal = document.getElementById('btnCloseProfileModal');
  const btnCloseProfileModalFooter = document.getElementById('btnCloseProfileModalFooter');

  // Sub-Tabs elements
  const btnTabProfileInfo = document.getElementById('btnTabProfileInfo');
  const btnTabProfilePassword = document.getElementById('btnTabProfilePassword');
  const tabProfileInfo = document.getElementById('tabProfileInfo');
  const tabProfilePassword = document.getElementById('tabProfilePassword');

  // Profile Header Card elements
  const profileAvatarBig = document.getElementById('profileAvatarBig');
  const profileDisplayName = document.getElementById('profileDisplayName');
  const profileTagUsername = document.getElementById('profileTagUsername');
  const profileTagRole = document.getElementById('profileTagRole');

  // Form Profile Info elements
  const profileInfoForm = document.getElementById('profileInfoForm');
  const profileUsernameDisplay = document.getElementById('profileUsernameDisplay');
  const profileFullName = document.getElementById('profileFullName');
  const profileEmail = document.getElementById('profileEmail');

  // Form Password elements
  const profilePasswordForm = document.getElementById('profilePasswordForm');
  const pwdCurrent = document.getElementById('pwdCurrent');
  const pwdNew = document.getElementById('pwdNew');
  const pwdConfirm = document.getElementById('pwdConfirm');

  // Chuyển đổi giữa 2 Sub-Tabs
  if (btnTabProfileInfo && btnTabProfilePassword) {
    btnTabProfileInfo.addEventListener('click', () => {
      btnTabProfileInfo.classList.add('active');
      btnTabProfilePassword.classList.remove('active');
      tabProfileInfo.classList.remove('hidden');
      tabProfilePassword.classList.add('hidden');
    });

    btnTabProfilePassword.addEventListener('click', () => {
      btnTabProfilePassword.classList.add('active');
      btnTabProfileInfo.classList.remove('active');
      tabProfilePassword.classList.remove('hidden');
      tabProfileInfo.classList.add('hidden');
    });
  }

  btnOpenProfile.addEventListener('click', () => {
    if (state.currentUser) {
      const u = state.currentUser;
      const dName = u.fullName || u.username || 'Cán bộ';
      const roleText = u.role === 'superadmin' ? 'Quản trị tối cao' : (u.role === 'admin' ? 'Quản trị viên' : 'Cán bộ');

      if (profileUsernameDisplay) profileUsernameDisplay.value = u.username || '';
      if (profileTagUsername) profileTagUsername.textContent = '@' + (u.username || 'admin');
      if (profileDisplayName) profileDisplayName.textContent = dName;
      if (profileTagRole) profileTagRole.textContent = roleText;
      if (profileAvatarBig) profileAvatarBig.textContent = (dName).slice(0, 2).toUpperCase();

      profileFullName.value = u.fullName || '';
      profileEmail.value = u.email || '';

      pwdCurrent.value = '';
      pwdNew.value = '';
      pwdConfirm.value = '';

      // Mặc định kích hoạt tab 1
      if (btnTabProfileInfo) btnTabProfileInfo.click();

      profileModal.classList.add('active');
    }
  });

  function closeProfileModal() {
    profileModal.classList.remove('active');
  }

  btnCloseProfileModal.addEventListener('click', closeProfileModal);
  btnCloseProfileModalFooter.addEventListener('click', closeProfileModal);

  profileInfoForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fullName = profileFullName.value.trim();
    const email = profileEmail.value.trim();

    if (!fullName) {
      showToast('Vui lòng nhập họ và tên cán bộ.', 'warning');
      profileFullName.focus();
      return;
    }

    if (email && (!email.includes('@') || !email.includes('.'))) {
      showToast('Định dạng email công tác không hợp lệ.', 'warning');
      profileEmail.focus();
      return;
    }

    try {
      const res = await apiRequest('/api/auth/profile', {
        method: 'PUT',
        body: JSON.stringify({ fullName, email }),
      });
      if (res.ok && res.user) {
        state.currentUser.fullName = res.user.full_name;
        state.currentUser.email = res.user.email;

        // Cập nhật ngay lập tức giao diện
        const updatedName = res.user.full_name || state.currentUser.username;
        const initials = updatedName.slice(0, 2).toUpperCase();

        currentUserName.textContent = updatedName;
        userAvatarBadge.textContent = initials;
        if (profileDisplayName) profileDisplayName.textContent = updatedName;
        if (profileAvatarBig) profileAvatarBig.textContent = initials;

        showToast('Đã lưu thông tin cán bộ thành công!', 'success');
      }
    } catch (err) {
      showToast('Lỗi cập nhật thông tin: ' + err.message, 'error');
    }
  });

  profilePasswordForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const currentPassword = pwdCurrent.value;
    const newPassword = pwdNew.value;
    const confirmPassword = pwdConfirm.value;

    if (!currentPassword) {
      showToast('Vui lòng nhập mật khẩu hiện tại.', 'warning');
      pwdCurrent.focus();
      return;
    }

    if (newPassword.length < 6) {
      showToast('Mật khẩu mới phải có tối thiểu 6 ký tự.', 'warning');
      pwdNew.focus();
      return;
    }

    if (newPassword !== confirmPassword) {
      showToast('Mật khẩu mới và mật khẩu xác nhận không khớp.', 'warning');
      pwdConfirm.focus();
      return;
    }

    if (currentPassword === newPassword) {
      showToast('Mật khẩu mới không được trùng với mật khẩu hiện tại.', 'warning');
      pwdNew.focus();
      return;
    }

    try {
      const res = await apiRequest('/api/auth/change-password', {
        method: 'PUT',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      showToast(res.message || 'Đổi mật khẩu bảo mật thành công!', 'success');
      pwdCurrent.value = '';
      pwdNew.value = '';
      pwdConfirm.value = '';
      closeProfileModal();
    } catch (err) {
      showToast('Lỗi đổi mật khẩu: ' + err.message, 'error');
    }
  });

  // ============================================================
  // LOAD INITIAL DATA
  // ============================================================
  function loadInitialData() {
    checkDbStatus();
    checkWebhookStatus();
    // Kho quy định không còn là màn mặc định: dữ liệu được tải khi mở view-documents
    applyColumnVisibility();
    initDocTableResizable();
  }

  // API dùng chung cho các module giao diện khác (office.js)
  window.AdminApp = {
    apiRequest,
    showToast,
    showConfirmDialog,
    escapeHtml,
    copyToClipboard,
    formatDate,
    debounce,
    switchView,
    getUser: () => state.currentUser,
  };

  // Khởi động ứng dụng
  document.addEventListener('DOMContentLoaded', () => {
    checkAuthSession();
  });

})();
