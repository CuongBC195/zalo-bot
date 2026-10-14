/**
 * Frontend Application Logic cho Web Admin Dashboard
 * Thiết kế chuẩn mực Institutional Executive (Anti-Slop, Zero Emoji, Pure SVG)
 * Hỗ trợ Phân Quyền RBAC:
 * - Admin/Superadmin: Quản trị toàn hệ thống & quản trị cán bộ (thêm, sửa, xóa cán bộ).
 * - Cán bộ nghiệp vụ (User): Thêm văn bản, bóc tách tài liệu, nạp dữ liệu mẫu, thử nghiệm RAG khi Admin bận. Ẩn hoàn toàn tab quản lý cán bộ.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Authentication Elements
  const loginScreen = document.getElementById('loginScreen');
  const loginForm = document.getElementById('loginForm');
  const loginUsername = document.getElementById('loginUsername');
  const loginPassword = document.getElementById('loginPassword');
  const loginError = document.getElementById('loginError');
  const mainApp = document.getElementById('mainApp');
  const currentUserName = document.getElementById('currentUserName');
  const currentUserRoleBadge = document.getElementById('currentUserRoleBadge');
  const btnLogout = document.getElementById('btnLogout');

  // Status & Seed Elements
  const dbStatusBadge = document.getElementById('dbStatusBadge');
  const dbStatusText = document.getElementById('dbStatusText');
  const btnSeedDb = document.getElementById('btnSeedDb');

  // Stats Elements
  const statTotalDocs = document.getElementById('statTotalDocs');
  const statTotalArticles = document.getElementById('statTotalArticles');
  const statTheThuc = document.getElementById('statTheThuc');
  const statVanThu = document.getElementById('statVanThu');
  const statAdminCount = document.getElementById('statAdminCount');

  // Tabs
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');
  const tabNavUsers = document.getElementById('tabNavUsers');

  // Tab 1: Documents list
  const searchInput = document.getElementById('searchInput');
  const categoryFilter = document.getElementById('categoryFilter');
  const btnRefresh = document.getElementById('btnRefresh');
  const documentsTableBody = document.getElementById('documentsTableBody');

  // Tab 2: Add Document & Auto Parser
  const addDocForm = document.getElementById('addDocForm');
  const btnAutoParse = document.getElementById('btnAutoParse');
  const rawTextContent = document.getElementById('rawTextContent');
  const articlesListContainer = document.getElementById('articlesListContainer');
  const parsedCount = document.getElementById('parsedCount');
  const btnAddSingleArticle = document.getElementById('btnAddSingleArticle');

  // Tab 3: Users Management (Chỉ dành cho Admin)
  const adminUsersTableBody = document.getElementById('adminUsersTableBody');
  const btnOpenAddAdminModal = document.getElementById('btnOpenAddAdminModal');
  const addAdminModal = document.getElementById('addAdminModal');
  const btnCloseAdminModal = document.getElementById('btnCloseAdminModal');
  const createAdminForm = document.getElementById('createAdminForm');

  // Tab 4: Audit Logs
  const queryLogsTableBody = document.getElementById('queryLogsTableBody');
  const btnRefreshLogs = document.getElementById('btnRefreshLogs');
  const logDetailModal = document.getElementById('logDetailModal');
  const btnCloseLogModal = document.getElementById('btnCloseLogModal');
  const logUser = document.getElementById('logUser');
  const logTime = document.getElementById('logTime');
  const logLatency = document.getElementById('logLatency');
  const logQueryText = document.getElementById('logQueryText');
  const logResponseText = document.getElementById('logResponseText');

  // Tab 5: RAG Playground
  const playgroundQuery = document.getElementById('playgroundQuery');
  const btnRunQueryTest = document.getElementById('btnRunQueryTest');
  const playgroundResults = document.getElementById('playgroundResults');
  const passagesList = document.getElementById('passagesList');
  const resCount = document.getElementById('resCount');
  const sampleChips = document.querySelectorAll('.chip');

  // Document Detail Modal
  const detailModal = document.getElementById('detailModal');
  const btnCloseModal = document.getElementById('btnCloseModal');
  const modalDocCode = document.getElementById('modalDocCode');
  const modalDocName = document.getElementById('modalDocName');
  const modalIssuer = document.getElementById('modalIssuer');
  const modalCategory = document.getElementById('modalCategory');
  const modalDate = document.getElementById('modalDate');
  const modalArticlesList = document.getElementById('modalArticlesList');

  // Profile & Password Elements
  const btnOpenProfileModal = document.getElementById('btnOpenProfileModal');
  const profileModal = document.getElementById('profileModal');
  const btnCloseProfileModal = document.getElementById('btnCloseProfileModal');
  const updateProfileForm = document.getElementById('updateProfileForm');
  const changePasswordForm = document.getElementById('changePasswordForm');
  const profileUsername = document.getElementById('profileUsername');
  const profileFullName = document.getElementById('profileFullName');
  const profileEmail = document.getElementById('profileEmail');
  const pwdCurrent = document.getElementById('pwdCurrent');
  const pwdNew = document.getElementById('pwdNew');
  const pwdConfirm = document.getElementById('pwdConfirm');

  // Local State
  let currentArticles = [];
  let authToken = localStorage.getItem('auth_token') || null;
  let currentUser = null;

  // ============================================================
  // 1. KHỞI ĐỘNG & KIỂM TRA PHIÊN ĐĂNG NHẬP (AUTH SESSION)
  // ============================================================
  checkAuth();

  async function checkAuth() {
    if (!authToken) {
      showLogin();
      return;
    }

    try {
      const res = await authFetch('/api/auth/me');
      const data = await res.json();

      if (data.ok && data.user) {
        showApp(data.user);
        initDashboard();
      } else {
        showLogin();
      }
    } catch (err) {
      showLogin();
    }
  }

  function showLogin() {
    authToken = null;
    currentUser = null;
    localStorage.removeItem('auth_token');
    loginScreen.classList.remove('hidden');
    mainApp.classList.add('hidden');
  }

  function showApp(user) {
    currentUser = user;
    loginScreen.classList.add('hidden');
    mainApp.classList.remove('hidden');

    // Hiển thị tên cán bộ
    const displayName = user.fullName || user.full_name || user.username;
    currentUserName.textContent = displayName;

    // Hiển thị badge vai trò & Áp dụng chính sách phân quyền RBAC
    const isAdmin = user.role === 'admin' || user.role === 'superadmin';

    if (currentUserRoleBadge) {
      if (user.role === 'superadmin') {
        currentUserRoleBadge.textContent = 'Quản trị tối cao';
        currentUserRoleBadge.className = 'badge badge-crimson';
      } else if (user.role === 'admin') {
        currentUserRoleBadge.textContent = 'Quản trị viên';
        currentUserRoleBadge.className = 'badge badge-crimson';
      } else {
        currentUserRoleBadge.textContent = 'Cán bộ nghiệp vụ';
        currentUserRoleBadge.className = 'badge badge-blue';
      }
    }

    // Ẩn/Hiện Tab Quản trị Cán bộ theo quyền
    if (tabNavUsers) {
      if (isAdmin) {
        tabNavUsers.style.display = 'inline-flex';
      } else {
        tabNavUsers.style.display = 'none';
        // Nếu đang ở tab quản trị cán bộ mà không có quyền thì tự động lùi về tab văn bản
        const activeTab = document.querySelector('.tab-btn.active');
        if (activeTab && activeTab.dataset.tab === 'tab-users') {
          document.querySelector('[data-tab="tab-list"]')?.click();
        }
      }
    }
  }

  // ============================================================
  // 2. ĐĂNG NHẬP & ĐĂNG XUẤT
  // ============================================================
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.classList.add('hidden');

    const username = loginUsername.value.trim();
    const password = loginPassword.value;

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();

      if (!data.ok) {
        loginError.textContent = data.error || 'Đăng nhập không thành công.';
        loginError.classList.remove('hidden');
        return;
      }

      authToken = data.token;
      localStorage.setItem('auth_token', authToken);
      showApp(data.user);
      initDashboard();
      showToast('Đăng nhập thành công!', 'success');
    } catch (err) {
      loginError.textContent = 'Lỗi kết nối máy chủ: ' + err.message;
      loginError.classList.remove('hidden');
    }
  });

  btnLogout.addEventListener('click', async () => {
    try {
      await authFetch('/api/auth/logout', { method: 'POST' });
    } catch (err) {}
    showToast('Đã đăng xuất khỏi hệ thống.', 'info');
    showLogin();
  });

  // Wrapper gọi API có gắn Bearer Token
  function authFetch(url, options = {}) {
    options.headers = options.headers || {};
    if (authToken) {
      options.headers['Authorization'] = `Bearer ${authToken}`;
    }
    return fetch(url, options);
  }

  // ============================================================
  // 3. KHỞI TẠO DASHBOARD & SỰ KIỆN
  // ============================================================
  let hasInitialized = false;

  function initDashboard() {
    if (!hasInitialized) {
      setupTabSwitching();
      setupEventListeners();
      hasInitialized = true;
    }
    loadStats();
    loadDocuments();
    if (currentUser && (currentUser.role === 'admin' || currentUser.role === 'superadmin')) {
      loadUsers();
    }
    loadQueryLogs();
  }

  function setupTabSwitching() {
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        tabBtns.forEach(b => b.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));

        btn.classList.add('active');
        const targetId = btn.dataset.tab;
        document.getElementById(targetId)?.classList.add('active');

        // Tải lại dữ liệu tương ứng khi chuyển tab
        if (targetId === 'tab-users') loadUsers();
        if (targetId === 'tab-logs') loadQueryLogs();
        if (targetId === 'tab-list') loadDocuments();
      });
    });
  }

  function setupEventListeners() {
    // Tab Danh sách Văn bản
    btnRefresh.addEventListener('click', () => {
      loadStats();
      loadDocuments();
    });

    searchInput.addEventListener('input', debounce(loadDocuments, 300));
    categoryFilter.addEventListener('change', loadDocuments);

    // Tab Thêm Văn bản & Auto Parse
    btnAutoParse.addEventListener('click', handleAutoParse);
    btnAddSingleArticle.addEventListener('click', () => {
      addArticleRow({ articleNumber: currentArticles.length + 1, title: '', content: '' });
    });
    addDocForm.addEventListener('submit', handleAddDocumentSubmit);

    // Đồng bộ Dữ liệu mẫu
    btnSeedDb.addEventListener('click', handleSeedDatabase);

    // Tab Thử nghiệm RAG Playground
    btnRunQueryTest.addEventListener('click', handleRagTest);
    playgroundQuery.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleRagTest();
    });

    sampleChips.forEach(chip => {
      chip.addEventListener('click', () => {
        playgroundQuery.value = chip.dataset.q;
        handleRagTest();
      });
    });

    // Modal Xem Chi Tiết Văn Bản
    btnCloseModal.addEventListener('click', () => detailModal.classList.add('hidden'));
    detailModal.querySelector('.modal-backdrop').addEventListener('click', () => detailModal.classList.add('hidden'));

    // Modal Thêm Cán Bộ (Chỉ Admin)
    if (btnOpenAddAdminModal) {
      btnOpenAddAdminModal.addEventListener('click', () => addAdminModal.classList.remove('hidden'));
    }
    if (btnCloseAdminModal) {
      btnCloseAdminModal.addEventListener('click', () => addAdminModal.classList.add('hidden'));
    }
    if (addAdminModal) {
      addAdminModal.querySelector('.modal-backdrop').addEventListener('click', () => addAdminModal.classList.add('hidden'));
    }
    if (createAdminForm) {
      createAdminForm.addEventListener('submit', handleCreateAdminSubmit);
    }

    // Modal Chi Tiết Nhật Ký Audit
    btnRefreshLogs.addEventListener('click', loadQueryLogs);
    btnCloseLogModal.addEventListener('click', () => logDetailModal.classList.add('hidden'));
    logDetailModal.querySelector('.modal-backdrop').addEventListener('click', () => logDetailModal.classList.add('hidden'));

    // Modal Hồ Sơ Cán Bộ & Đổi Mật Khẩu
    if (btnOpenProfileModal) {
      btnOpenProfileModal.addEventListener('click', () => {
        if (currentUser) {
          profileUsername.value = currentUser.username || '';
          profileFullName.value = currentUser.fullName || currentUser.full_name || '';
          profileEmail.value = currentUser.email || '';
        }
        pwdCurrent.value = '';
        pwdNew.value = '';
        pwdConfirm.value = '';
        profileModal.classList.remove('hidden');
      });
    }

    if (btnCloseProfileModal) {
      btnCloseProfileModal.addEventListener('click', () => profileModal.classList.add('hidden'));
      profileModal.querySelector('.modal-backdrop').addEventListener('click', () => profileModal.classList.add('hidden'));
    }

    if (updateProfileForm) {
      updateProfileForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fullName = profileFullName.value.trim();
        const email = profileEmail.value.trim();

        try {
          const res = await authFetch('/api/auth/profile', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fullName, email }),
          });
          const data = await res.json();
          if (data.ok) {
            showToast(data.message || 'Cập nhật thông tin cán bộ thành công!', 'success');
            if (currentUser) {
              currentUser.fullName = fullName;
              currentUser.full_name = fullName;
              currentUser.email = email;
              currentUserName.textContent = fullName || currentUser.username;
            }
            profileModal.classList.add('hidden');
          } else {
            showToast(data.error || 'Lỗi cập nhật thông tin.', 'error');
          }
        } catch (err) {
          showToast('Lỗi mạng: ' + err.message, 'error');
        }
      });
    }

    if (changePasswordForm) {
      changePasswordForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const currentPassword = pwdCurrent.value;
        const newPassword = pwdNew.value;
        const confirmPassword = pwdConfirm.value;

        if (newPassword !== confirmPassword) {
          showToast('Mật khẩu xác nhận không trùng khớp!', 'error');
          return;
        }

        if (newPassword.length < 6) {
          showToast('Mật khẩu mới phải có tối thiểu 6 ký tự!', 'error');
          return;
        }

        try {
          const res = await authFetch('/api/auth/change-password', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ currentPassword, newPassword }),
          });
          const data = await res.json();
          if (data.ok) {
            showToast(data.message || 'Đổi mật khẩu bảo mật thành công!', 'success');
            pwdCurrent.value = '';
            pwdNew.value = '';
            pwdConfirm.value = '';
            profileModal.classList.add('hidden');
          } else {
            showToast(data.error || 'Lỗi đổi mật khẩu.', 'error');
          }
        } catch (err) {
          showToast('Lỗi mạng: ' + err.message, 'error');
        }
      });
    }
  }

  // ============================================================
  // 4. TẢI THỐNG KÊ (STATS LOADER)
  // ============================================================
  async function loadStats() {
    try {
      const res = await authFetch('/api/stats');
      const data = await res.json();
      if (!data.ok) return;

      if (data.isDbConnected) {
        dbStatusBadge.className = 'status-pill status-connected';
        dbStatusText.textContent = 'PostgreSQL: Đã kết nối';
      } else {
        dbStatusBadge.className = 'status-pill status-fallback';
        dbStatusText.textContent = 'Chế độ Local File / Cache';
      }

      statTotalDocs.textContent = data.stats.totalDocs;
      statTotalArticles.textContent = data.stats.totalArticles;
      statTheThuc.textContent = data.stats.theThucCount;
      statVanThu.textContent = data.stats.vanThuCount;
      statAdminCount.textContent = data.stats.adminCount || 0;
    } catch (err) {
      console.error('Lỗi tải thống kê:', err);
    }
  }

  // ============================================================
  // 5. QUẢN LÝ VĂN BẢN (DOCUMENTS TABLE)
  // ============================================================
  async function loadDocuments() {
    try {
      const search = searchInput.value.trim();
      const category = categoryFilter.value;
      const url = `/api/documents?search=${encodeURIComponent(search)}&category=${encodeURIComponent(category)}`;

      const res = await authFetch(url);
      const data = await res.json();

      if (!data.ok || !data.documents) {
        documentsTableBody.innerHTML = `<tr><td colspan="7" class="text-center py-8">Không tìm thấy văn bản phù hợp.</td></tr>`;
        return;
      }

      renderDocumentsTable(data.documents);
    } catch (err) {
      documentsTableBody.innerHTML = `<tr><td colspan="7" class="text-center py-8" style="color: var(--accent-rose);">Lỗi kết nối máy chủ: ${escapeHtml(err.message)}</td></tr>`;
    }
  }

  function renderDocumentsTable(docs) {
    if (!docs.length) {
      documentsTableBody.innerHTML = `<tr><td colspan="7" class="text-center py-8">Chưa có văn bản nào trong hệ thống.</td></tr>`;
      return;
    }

    documentsTableBody.innerHTML = docs.map(doc => {
      const catBadge = getCategoryBadge(doc.category);
      return `
        <tr>
          <td><span class="badge badge-crimson font-mono">${escapeHtml(doc.document_code)}</span></td>
          <td><strong>${escapeHtml(doc.document_name)}</strong></td>
          <td>${escapeHtml(doc.issuer || 'N/A')}</td>
          <td>${catBadge}</td>
          <td><span class="badge badge-blue">${doc.articles_count || 0} điều</span></td>
          <td><span class="badge badge-emerald">${escapeHtml(doc.status || 'Còn hiệu lực')}</span></td>
          <td style="text-align: right;">
            <div style="display: inline-flex; gap: 0.35rem;">
              <button class="btn btn-outline btn-sm" onclick="window.viewDocDetails('${escapeHtml(doc.id || doc.document_code)}')">Xem Chi Tiết</button>
              <button class="btn btn-danger btn-sm" onclick="window.deleteDoc('${escapeHtml(doc.id || doc.document_code)}')">Xóa</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  function getCategoryBadge(cat) {
    switch (cat) {
      case 'the_thuc':
        return '<span class="badge badge-gold">Thể thức (HD 05 &amp; QĐ 399)</span>';
      case 'van_thu_luu_tru':
        return '<span class="badge badge-blue">Văn thư & Lưu trữ</span>';
      case 'quy_dinh_dang':
      default:
        return '<span class="badge badge-crimson">Quy định Đảng</span>';
    }
  }

  // ============================================================
  // 6. QUẢN TRỊ CÁN BỘ (CHỈ DÀNH CHO ADMIN)
  // ============================================================
  async function loadUsers() {
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'superadmin')) {
      return;
    }

    try {
      const res = await authFetch('/api/users');
      const data = await res.json();

      if (!data.ok || !data.users) {
        adminUsersTableBody.innerHTML = `<tr><td colspan="6" class="text-center py-4">Không thể tải danh sách cán bộ.</td></tr>`;
        return;
      }

      adminUsersTableBody.innerHTML = data.users.map(u => {
        const isSelf = currentUser && currentUser.id === u.id;
        let roleBadge = '<span class="badge badge-blue">Cán bộ nghiệp vụ</span>';
        if (u.role === 'superadmin') roleBadge = '<span class="badge badge-crimson">Quản trị tối cao</span>';
        else if (u.role === 'admin') roleBadge = '<span class="badge badge-crimson">Quản trị viên</span>';

        return `
          <tr>
            <td><strong>${escapeHtml(u.username)}</strong> ${isSelf ? '<small style="color: var(--accent-blue);">(Bạn)</small>' : ''}</td>
            <td>${escapeHtml(u.full_name || 'N/A')}</td>
            <td>${escapeHtml(u.email || 'N/A')}</td>
            <td>${roleBadge}</td>
            <td><span class="badge ${u.is_active ? 'badge-emerald' : 'badge-slate'}">${u.is_active ? 'Hoạt động' : 'Đã khóa'}</span></td>
            <td style="text-align: right;">
              ${isSelf ? '<span style="font-size: 0.75rem; color: var(--text-muted);">Đang đăng nhập</span>' : `
                <button class="btn btn-danger btn-sm" onclick="window.deleteAdminUser(${u.id})">Xóa</button>
              `}
            </td>
          </tr>
        `;
      }).join('');
    } catch (err) {
      adminUsersTableBody.innerHTML = `<tr><td colspan="6" class="text-center py-4" style="color: var(--accent-rose);">Lỗi tải danh sách cán bộ: ${escapeHtml(err.message)}</td></tr>`;
    }
  }

  async function handleCreateAdminSubmit(e) {
    e.preventDefault();
    const payload = {
      username: document.getElementById('adminUsername').value.trim(),
      fullName: document.getElementById('adminFullName').value.trim(),
      email: document.getElementById('adminEmail').value.trim(),
      password: document.getElementById('adminPassword').value,
      role: document.getElementById('adminRole').value,
    };

    try {
      const res = await authFetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.ok) {
        showToast(data.error || 'Lỗi tạo tài khoản cán bộ', 'error');
        return;
      }
      showToast('Khởi tạo tài khoản cán bộ thành công!', 'success');
      createAdminForm.reset();
      addAdminModal.classList.add('hidden');
      loadUsers();
      loadStats();
    } catch (err) {
      showToast('Lỗi: ' + err.message, 'error');
    }
  }

  window.deleteAdminUser = async (id) => {
    if (!confirm('Bạn có chắc chắn muốn xóa tài khoản cán bộ này khỏi hệ thống?')) return;
    try {
      const res = await authFetch(`/api/users/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.ok) {
        showToast(data.error || 'Lỗi xóa tài khoản', 'error');
        return;
      }
      showToast('Đã xóa tài khoản cán bộ thành công.', 'success');
      loadUsers();
      loadStats();
    } catch (err) {
      showToast('Lỗi: ' + err.message, 'error');
    }
  };

  // ============================================================
  // 7. NHẬT KÝ HỎI ĐÁP (AUDIT LOGS)
  // ============================================================
  async function loadQueryLogs() {
    try {
      const res = await authFetch('/api/query-logs?limit=50');
      const data = await res.json();
      if (!data.ok || !data.logs || !data.logs.length) {
        queryLogsTableBody.innerHTML = `<tr><td colspan="6" class="text-center py-8">Chưa có câu hỏi nào được ghi nhận.</td></tr>`;
        return;
      }

      window._currentLogs = data.logs;

      queryLogsTableBody.innerHTML = data.logs.map((log, idx) => `
        <tr>
          <td><small class="tabular-nums" style="color: var(--text-secondary);">${new Date(log.created_at).toLocaleString('vi-VN')}</small></td>
          <td><strong>${escapeHtml(log.user_name || log.zalo_user_id || 'Cán bộ / Đảng viên')}</strong></td>
          <td>${escapeHtml(log.query_text.length > 70 ? log.query_text.slice(0, 70) + '...' : log.query_text)}</td>
          <td><span class="badge badge-slate">${escapeHtml(log.intent || 'Tra cứu')}</span></td>
          <td><span class="tabular-nums" style="color: var(--accent-blue);">${log.latency_ms || 0}ms</span></td>
          <td style="text-align: right;">
            <button class="btn btn-outline btn-sm" onclick="window.viewLogDetail(${idx})">Chi Tiết</button>
          </td>
        </tr>
      `).join('');
    } catch (err) {
      queryLogsTableBody.innerHTML = `<tr><td colspan="6" class="text-center py-8" style="color: var(--accent-rose);">Lỗi tải nhật ký: ${escapeHtml(err.message)}</td></tr>`;
    }
  }

  window.viewLogDetail = (idx) => {
    const log = window._currentLogs?.[idx];
    if (!log) return;

    logUser.textContent = log.user_name || log.zalo_user_id;
    logTime.textContent = new Date(log.created_at).toLocaleString('vi-VN');
    logLatency.textContent = `${log.latency_ms || 0}ms`;
    logQueryText.textContent = log.query_text;
    logResponseText.textContent = log.response_text;

    logDetailModal.classList.remove('hidden');
  };

  // ============================================================
  // 8. AUTO PARSER & THÊM VĂN BẢN (MỞ CHO CẢ USER & ADMIN)
  // ============================================================
  async function handleAutoParse() {
    const text = rawTextContent.value.trim();
    if (!text) {
      showToast('Vui lòng dán nội dung toàn văn văn bản vào ô trước khi bóc tách.', 'error');
      return;
    }

    try {
      const res = await authFetch('/api/parse-raw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();

      if (!data.ok || !data.articles) {
        showToast(data.error || 'Lỗi bóc tách văn bản.', 'error');
        return;
      }

      currentArticles = data.articles;
      parsedCount.textContent = currentArticles.length;
      renderArticlesList();
      showToast(`Đã tự động nhận diện và bóc tách ${currentArticles.length} điều khoản thành công!`, 'success');
    } catch (err) {
      showToast('Lỗi bóc tách: ' + err.message, 'error');
    }
  }

  function renderArticlesList() {
    if (!currentArticles.length) {
      articlesListContainer.innerHTML = `<p class="empty-hint">Chưa có điều khoản nào. Dán văn bản vào ô trên và bấm "Tự Động Bóc Tách".</p>`;
      return;
    }

    articlesListContainer.innerHTML = currentArticles.map((art, idx) => `
      <div class="article-item" data-idx="${idx}" style="display: flex; gap: 0.75rem; margin-bottom: 0.75rem; background: var(--bg-card); padding: 0.85rem; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle);">
        <div style="width: 100px; flex-shrink: 0;">
          <label style="font-size: 0.72rem; color: var(--text-muted); display: block; margin-bottom: 0.2rem;">Số điều:</label>
          <input type="text" value="${escapeHtml(art.articleNumber)}" onchange="window.updateArticleField(${idx}, 'articleNumber', this.value)" style="font-weight: 600; padding: 0.4rem;">
        </div>
        <div style="flex: 1;">
          <label style="font-size: 0.72rem; color: var(--text-muted); display: block; margin-bottom: 0.2rem;">Tiêu đề điều:</label>
          <input type="text" placeholder="Tiêu đề điều (nếu có)" value="${escapeHtml(art.title)}" onchange="window.updateArticleField(${idx}, 'title', this.value)" style="margin-bottom: 0.4rem; padding: 0.4rem;">
          <textarea rows="3" placeholder="Nội dung chi tiết điều khoản..." onchange="window.updateArticleField(${idx}, 'content', this.value)">${escapeHtml(art.content)}</textarea>
        </div>
        <div style="align-self: center;">
          <button type="button" class="btn btn-danger btn-sm" onclick="window.removeArticle(${idx})">Xóa</button>
        </div>
      </div>
    `).join('');
  }

  function addArticleRow(art) {
    currentArticles.push(art);
    parsedCount.textContent = currentArticles.length;
    renderArticlesList();
  }

  window.updateArticleField = (idx, field, val) => {
    if (currentArticles[idx]) currentArticles[idx][field] = val;
  };

  window.removeArticle = (idx) => {
    currentArticles.splice(idx, 1);
    parsedCount.textContent = currentArticles.length;
    renderArticlesList();
  };

  async function handleAddDocumentSubmit(e) {
    e.preventDefault();

    if (!currentArticles.length) {
      showToast('Văn bản cần ít nhất 1 Điều khoản. Vui lòng thêm điều khoản.', 'error');
      return;
    }

    const payload = {
      documentCode: document.getElementById('docCode').value.trim(),
      documentName: document.getElementById('docName').value.trim(),
      issuer: document.getElementById('docIssuer').value.trim(),
      category: document.getElementById('docCategory').value,
      issueDate: document.getElementById('docDate').value,
      articles: currentArticles,
    };

    try {
      const res = await authFetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!data.ok) {
        showToast(data.error || 'Lỗi lưu văn bản', 'error');
        return;
      }

      showToast('Đã lưu văn bản vào cơ sở dữ liệu thành công!', 'success');
      addDocForm.reset();
      currentArticles = [];
      parsedCount.textContent = '0';
      renderArticlesList();

      document.querySelector('[data-tab="tab-list"]').click();
      loadStats();
      loadDocuments();
    } catch (err) {
      showToast('Lỗi gửi dữ liệu: ' + err.message, 'error');
    }
  }

  // ============================================================
  // 9. MODAL CHI TIẾT & XÓA VĂN BẢN
  // ============================================================
  window.viewDocDetails = async (id) => {
    try {
      const res = await authFetch(`/api/documents/${encodeURIComponent(id)}`);
      const data = await res.json();
      if (!data.ok || !data.document) return;

      const doc = data.document;
      modalDocCode.textContent = doc.document_code;
      modalDocName.textContent = doc.document_name;
      modalIssuer.textContent = doc.issuer || 'N/A';
      modalCategory.textContent = doc.category;
      modalDate.textContent = doc.issue_date || 'N/A';

      const articles = doc.articles || [];
      modalArticlesList.innerHTML = articles.map(a => `
        <div class="passage-card" style="margin-bottom: 0.75rem;">
          <h5 style="color: var(--text-primary); margin-bottom: 0.4rem;">Điều ${escapeHtml(a.article_number)}: ${escapeHtml(a.title)}</h5>
          <p style="font-size: 0.82rem; color: var(--text-secondary); line-height: 1.6;">${escapeHtml(a.content)}</p>
        </div>
      `).join('') || '<p>Chưa có điều khoản nào.</p>';

      detailModal.classList.remove('hidden');
    } catch (err) {
      showToast('Lỗi xem chi tiết: ' + err.message, 'error');
    }
  };

  window.deleteDoc = async (id) => {
    if (!confirm(`Bạn có chắc chắn muốn xóa văn bản "${id}" khỏi cơ sở dữ liệu?`)) return;

    try {
      const res = await authFetch(`/api/documents/${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.ok) {
        showToast(data.error || 'Lỗi xóa văn bản', 'error');
        return;
      }
      showToast('Đã xóa văn bản khỏi hệ thống thành công.', 'success');
      loadStats();
      loadDocuments();
    } catch (err) {
      showToast('Lỗi xóa: ' + err.message, 'error');
    }
  };

  // ============================================================
  // 10. THỬ NGHIỆM TRUY VẤN RAG PLAYGROUND
  // ============================================================
  async function handleRagTest() {
    const query = playgroundQuery.value.trim();
    if (!query) {
      showToast('Vui lòng nhập câu hỏi thử nghiệm tra cứu.', 'error');
      return;
    }

    btnRunQueryTest.disabled = true;
    btnRunQueryTest.textContent = 'Đang truy vấn...';

    try {
      const res = await authFetch('/api/rag-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      const data = await res.json();

      btnRunQueryTest.disabled = false;
      btnRunQueryTest.innerHTML = `
        <svg class="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        Kiểm Tra Truy Vấn
      `;

      if (!data.ok) {
        showToast(data.error || 'Lỗi truy vấn RAG', 'error');
        return;
      }

      resCount.textContent = data.resultsCount;
      passagesList.innerHTML = data.passages.map((p, i) => `
        <div class="passage-card">
          <div class="passage-header">
            <strong style="color: var(--text-primary);">[#${i + 1}] ${escapeHtml(p.documentName || p.documentCode)} - Điều ${escapeHtml(p.articleNumber)}: ${escapeHtml(p.title)}</strong>
            <span class="badge badge-blue">Điểm khớp: ${(p.score ? p.score.toFixed(1) : 'Reranked')}</span>
          </div>
          <div class="passage-content">${escapeHtml(p.content)}</div>
        </div>
      `).join('') || '<p style="color: var(--text-muted); font-size: 0.85rem;">Không tìm thấy đoạn trích nào đạt ngưỡng tin cậy.</p>';

      playgroundResults.classList.remove('hidden');
    } catch (err) {
      btnRunQueryTest.disabled = false;
      btnRunQueryTest.innerHTML = `
        <svg class="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        Kiểm Tra Truy Vấn
      `;
      showToast('Lỗi truy vấn: ' + err.message, 'error');
    }
  }

  // ============================================================
  // 11. SEED DATABASE (NẠP DỮ LIỆU MẪU)
  // ============================================================
  async function handleSeedDatabase() {
    if (!confirm('Bạn có muốn đồng bộ toàn bộ văn bản mẫu (HD 17, HD 05, HD 06, TT 02, QĐ 24, QĐ 37...) vào PostgreSQL không?')) return;

    btnSeedDb.disabled = true;
    btnSeedDb.textContent = 'Đang nạp...';

    try {
      const res = await authFetch('/api/seed-db', { method: 'POST' });
      const data = await res.json();
      btnSeedDb.disabled = false;
      btnSeedDb.innerHTML = `
        <svg class="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
          <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
          <path d="M3 3v5h5"></path>
          <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"></path>
          <path d="M16 21h5v-5"></path>
        </svg>
        Nạp Dữ Liệu Mẫu
      `;

      if (!data.ok) {
        showToast(data.error || 'Lỗi nạp dữ liệu mẫu.', 'error');
        return;
      }

      showToast(data.message || 'Nạp toàn bộ văn bản mẫu thành công!', 'success');
      loadStats();
      loadDocuments();
    } catch (err) {
      btnSeedDb.disabled = false;
      btnSeedDb.innerHTML = `
        <svg class="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
          <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
          <path d="M3 3v5h5"></path>
          <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"></path>
          <path d="M16 21h5v-5"></path>
        </svg>
        Nạp Dữ Liệu Mẫu
      `;
      showToast('Lỗi: ' + err.message, 'error');
    }
  }

  // ============================================================
  // 12. UTILITIES & TOAST
  // ============================================================
  function showToast(msg, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.className = `toast toast-${type}`;
    setTimeout(() => {
      toast.classList.add('hidden');
    }, 4000);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function debounce(fn, ms) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), ms);
    };
  }
});
