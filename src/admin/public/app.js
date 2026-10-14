/**
 * Frontend Application Logic cho Web Admin Dashboard
 * Hỗ trợ Đăng nhập JWT, Quản lý Người dùng, Quản trị Văn bản & Nhật ký Audit
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
  const btnLogout = document.getElementById('btnLogout');

  // Status & Seed
  const dbStatusBadge = document.getElementById('dbStatusBadge');
  const dbStatusText = document.getElementById('dbStatusText');
  const btnSeedDb = document.getElementById('btnSeedDb');

  // Stats Elements
  const statTotalDocs = document.getElementById('statTotalDocs');
  const statTotalArticles = document.getElementById('statTotalArticles');
  const statTheThuc = document.getElementById('statTheThuc');
  const statVanThu = document.getElementById('statVanThu');
  const statZaloUsers = document.getElementById('statZaloUsers');

  // Tabs
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  // Tab 1: Documents list
  const searchInput = document.getElementById('searchInput');
  const categoryFilter = document.getElementById('categoryFilter');
  const btnRefresh = document.getElementById('btnRefresh');
  const documentsTableBody = document.getElementById('documentsTableBody');

  // Tab 2: Add Document
  const addDocForm = document.getElementById('addDocForm');
  const btnAutoParse = document.getElementById('btnAutoParse');
  const rawTextContent = document.getElementById('rawTextContent');
  const articlesListContainer = document.getElementById('articlesListContainer');
  const parsedCount = document.getElementById('parsedCount');
  const btnAddSingleArticle = document.getElementById('btnAddSingleArticle');

  // Tab 3: Users Management
  const adminUsersTableBody = document.getElementById('adminUsersTableBody');
  const zaloUsersTableBody = document.getElementById('zaloUsersTableBody');
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

  // Modals
  const detailModal = document.getElementById('detailModal');
  const btnCloseModal = document.getElementById('btnCloseModal');
  const modalDocCode = document.getElementById('modalDocCode');
  const modalDocName = document.getElementById('modalDocName');
  const modalIssuer = document.getElementById('modalIssuer');
  const modalCategory = document.getElementById('modalCategory');
  const modalDate = document.getElementById('modalDate');
  const modalArticlesList = document.getElementById('modalArticlesList');

  // Local State
  let currentArticles = [];
  let authToken = localStorage.getItem('auth_token') || null;

  // ============================================================
  // KHỞI ĐỘNG & KIỂM TRA PHIÊN ĐĂNG NHẬP
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
    localStorage.removeItem('auth_token');
    loginScreen.classList.remove('hidden');
    mainApp.classList.add('hidden');
  }

  function showApp(user) {
    loginScreen.classList.add('hidden');
    mainApp.classList.remove('hidden');
    currentUserName.textContent = user.fullName || user.username;
  }

  // ============================================================
  // ĐĂNG NHẬP & ĐĂNG XUẤT
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
    showToast('Đã đăng xuất.', 'success');
    showLogin();
  });

  // Wrapper gọi API có đính kèm Bearer Token
  function authFetch(url, options = {}) {
    options.headers = options.headers || {};
    if (authToken) {
      options.headers['Authorization'] = `Bearer ${authToken}`;
    }
    return fetch(url, options);
  }

  // ============================================================
  // KHỞI TẠO DASHBOARD
  // ============================================================
  function initDashboard() {
    setupTabSwitching();
    setupEventListeners();
    loadStats();
    loadDocuments();
    loadUsers();
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

        // Tải dữ liệu tương ứng khi bấm tab
        if (targetId === 'tab-users') loadUsers();
        if (targetId === 'tab-logs') loadQueryLogs();
      });
    });
  }

  function setupEventListeners() {
    btnRefresh.addEventListener('click', () => {
      loadStats();
      loadDocuments();
    });

    searchInput.addEventListener('input', debounce(loadDocuments, 300));
    categoryFilter.addEventListener('change', loadDocuments);

    // Auto Parse button
    btnAutoParse.addEventListener('click', handleAutoParse);
    btnAddSingleArticle.addEventListener('click', () => addArticleRow({ articleNumber: currentArticles.length + 1, title: '', content: '' }));

    // Form Submit
    addDocForm.addEventListener('submit', handleAddDocumentSubmit);

    // Seed Database
    btnSeedDb.addEventListener('click', handleSeedDatabase);

    // Playground
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

    // Modals
    btnCloseModal.addEventListener('click', () => detailModal.classList.add('hidden'));
    detailModal.querySelector('.modal-backdrop').addEventListener('click', () => detailModal.classList.add('hidden'));

    btnOpenAddAdminModal.addEventListener('click', () => addAdminModal.classList.remove('hidden'));
    btnCloseAdminModal.addEventListener('click', () => addAdminModal.classList.add('hidden'));
    addAdminModal.querySelector('.modal-backdrop').addEventListener('click', () => addAdminModal.classList.add('hidden'));

    createAdminForm.addEventListener('submit', handleCreateAdminSubmit);

    btnRefreshLogs.addEventListener('click', loadQueryLogs);
    btnCloseLogModal.addEventListener('click', () => logDetailModal.classList.add('hidden'));
    logDetailModal.querySelector('.modal-backdrop').addEventListener('click', () => logDetailModal.classList.add('hidden'));
  }

  // ============================================================
  // LOADERS
  // ============================================================
  async function loadStats() {
    try {
      const res = await authFetch('/api/stats');
      const data = await res.json();
      if (!data.ok) return;

      if (data.isDbConnected) {
        dbStatusBadge.className = 'status-pill status-connected';
        dbStatusText.textContent = 'PostgreSQL: Đang kết nối';
      } else {
        dbStatusBadge.className = 'status-pill status-fallback';
        dbStatusText.textContent = 'Chế độ Local File / Cache';
      }

      statTotalDocs.textContent = data.stats.totalDocs;
      statTotalArticles.textContent = data.stats.totalArticles;
      statTheThuc.textContent = data.stats.theThucCount;
      statVanThu.textContent = data.stats.vanThuCount;
      statZaloUsers.textContent = data.stats.zaloUserCount || 0;
    } catch (err) {
      console.error('Lỗi tải thống kê:', err);
    }
  }

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
      documentsTableBody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-danger">Lỗi kết nối máy chủ: ${err.message}</td></tr>`;
    }
  }

  function renderDocumentsTable(docs) {
    if (!docs.length) {
      documentsTableBody.innerHTML = `<tr><td colspan="7" class="text-center py-8">Không có dữ liệu.</td></tr>`;
      return;
    }

    documentsTableBody.innerHTML = docs.map(doc => {
      const catBadge = getCategoryBadge(doc.category);
      return `
        <tr>
          <td><span class="badge badge-primary">${escapeHtml(doc.document_code)}</span></td>
          <td><strong>${escapeHtml(doc.document_name)}</strong></td>
          <td>${escapeHtml(doc.issuer || 'N/A')}</td>
          <td>${catBadge}</td>
          <td><span class="badge badge-blue">${doc.articles_count || 0} điều</span></td>
          <td><span class="badge badge-success">${escapeHtml(doc.status || 'Còn hiệu lực')}</span></td>
          <td>
            <button class="btn-info-sm" onclick="window.viewDocDetails('${escapeHtml(doc.id || doc.document_code)}')">Xem điều khoản</button>
            <button class="btn-danger-sm" onclick="window.deleteDoc('${escapeHtml(doc.id || doc.document_code)}')">Xóa</button>
          </td>
        </tr>
      `;
    }).join('');
  }

  function getCategoryBadge(cat) {
    switch (cat) {
      case 'the_thuc':
        return '<span class="badge badge-gold">Thể thức (HD 17)</span>';
      case 'van_thu_luu_tru':
        return '<span class="badge badge-indigo">Văn thư - Lưu trữ</span>';
      case 'quy_dinh_dang':
      default:
        return '<span class="badge badge-primary">Quy định Đảng</span>';
    }
  }

  // ============================================================
  // QUẢN LÝ NGƯỜI DÙNG (USERS & ZALO USERS)
  // ============================================================
  async function loadUsers() {
    // 1. Tải Admin Users
    try {
      const res = await authFetch('/api/users');
      const data = await res.json();
      if (data.ok && data.users) {
        adminUsersTableBody.innerHTML = data.users.map(u => `
          <tr>
            <td><strong>${escapeHtml(u.username)}</strong></td>
            <td>${escapeHtml(u.full_name || 'N/A')}</td>
            <td><span class="badge ${u.role === 'superadmin' ? 'badge-primary' : 'badge-blue'}">${escapeHtml(u.role)}</span></td>
            <td><span class="badge ${u.is_active ? 'badge-success' : 'badge-danger'}">${u.is_active ? 'Hoạt động' : 'Đã khóa'}</span></td>
            <td>
              <button class="btn-danger-sm" onclick="window.deleteAdminUser(${u.id})">Xóa</button>
            </td>
          </tr>
        `).join('');
      }
    } catch (err) {
      adminUsersTableBody.innerHTML = `<tr><td colspan="5">Lỗi tải danh sách admin: ${err.message}</td></tr>`;
    }

    // 2. Tải Zalo Users
    try {
      const res = await authFetch('/api/zalo-users');
      const data = await res.json();
      if (data.ok && data.users) {
        if (!data.users.length) {
          zaloUsersTableBody.innerHTML = `<tr><td colspan="5" class="text-center py-4">Chưa có tương tác nào từ Zalo.</td></tr>`;
          return;
        }

        zaloUsersTableBody.innerHTML = data.users.map(u => `
          <tr>
            <td>
              <strong>${escapeHtml(u.display_name || 'Đồng chí')}</strong><br>
              <small style="color: var(--text-dim);">${escapeHtml(u.zalo_id)}</small>
            </td>
            <td><span class="badge badge-blue">${u.query_count || 0} câu</span></td>
            <td>${u.last_active ? new Date(u.last_active).toLocaleString('vi-VN') : 'N/A'}</td>
            <td><span class="badge ${u.is_blocked ? 'badge-danger' : 'badge-success'}">${u.is_blocked ? 'Bị chặn' : 'Bình thường'}</span></td>
            <td>
              <button class="${u.is_blocked ? 'btn-info-sm' : 'btn-danger-sm'}" onclick="window.toggleBlockUser('${escapeHtml(u.zalo_id)}', ${!u.is_blocked})">
                ${u.is_blocked ? 'Mở khóa' : 'Chặn'}
              </button>
            </td>
          </tr>
        `).join('');
      }
    } catch (err) {
      zaloUsersTableBody.innerHTML = `<tr><td colspan="5">Lỗi tải danh sách Zalo users: ${err.message}</td></tr>`;
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
        showToast(data.error || 'Lỗi tạo admin', 'error');
        return;
      }
      showToast('Tạo tài khoản quản trị viên thành công!', 'success');
      createAdminForm.reset();
      addAdminModal.classList.add('hidden');
      loadUsers();
      loadStats();
    } catch (err) {
      showToast('Lỗi: ' + err.message, 'error');
    }
  }

  window.deleteAdminUser = async (id) => {
    if (!confirm('Bạn có chắc chắn muốn xóa tài khoản quản trị này?')) return;
    try {
      const res = await authFetch(`/api/users/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.ok) {
        showToast(data.error || 'Lỗi xóa admin', 'error');
        return;
      }
      showToast('Đã xóa tài khoản admin.', 'success');
      loadUsers();
      loadStats();
    } catch (err) {
      showToast('Lỗi: ' + err.message, 'error');
    }
  };

  window.toggleBlockUser = async (zaloId, isBlocked) => {
    const actionText = isBlocked ? 'chặn' : 'mở khóa';
    if (!confirm(`Bạn có chắc muốn ${actionText} người dùng Zalo này?`)) return;

    try {
      const res = await authFetch(`/api/zalo-users/${encodeURIComponent(zaloId)}/toggle-block`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isBlocked }),
      });
      const data = await res.json();
      if (!data.ok) {
        showToast(data.error || 'Lỗi thao tác', 'error');
        return;
      }
      showToast(data.message, 'success');
      loadUsers();
    } catch (err) {
      showToast('Lỗi: ' + err.message, 'error');
    }
  };

  // ============================================================
  // NHẬT KÝ HỎI ĐÁP (AUDIT LOGS)
  // ============================================================
  async function loadQueryLogs() {
    try {
      const res = await authFetch('/api/query-logs?limit=50');
      const data = await res.json();
      if (!data.ok || !data.logs) {
        queryLogsTableBody.innerHTML = `<tr><td colspan="6" class="text-center py-4">Chưa có nhật ký nào.</td></tr>`;
        return;
      }

      window._currentLogs = data.logs;

      queryLogsTableBody.innerHTML = data.logs.map((log, idx) => `
        <tr>
          <td><small>${new Date(log.created_at).toLocaleString('vi-VN')}</small></td>
          <td><strong>${escapeHtml(log.user_name || log.zalo_user_id || 'Đồng chí')}</strong></td>
          <td>${escapeHtml(log.query_text.length > 60 ? log.query_text.slice(0, 60) + '...' : log.query_text)}</td>
          <td><span class="badge badge-indigo">${escapeHtml(log.intent || 'N/A')}</span></td>
          <td><small style="color: #38bdf8;">${log.latency_ms || 0}ms</small></td>
          <td>
            <button class="btn-info-sm" onclick="window.viewLogDetail(${idx})">Chi tiết</button>
          </td>
        </tr>
      `).join('') || `<tr><td colspan="6" class="text-center py-4">Chưa có câu hỏi nào được ghi nhận.</td></tr>`;
    } catch (err) {
      queryLogsTableBody.innerHTML = `<tr><td colspan="6">Lỗi tải nhật ký: ${err.message}</td></tr>`;
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
  // AUTO PARSER & THÊM VĂN BẢN
  // ============================================================
  async function handleAutoParse() {
    const text = rawTextContent.value.trim();
    if (!text) {
      showToast('Vui lòng dán nội dung văn bản vào ô trước khi bóc tách', 'error');
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
        showToast(data.error || 'Lỗi bóc tách văn bản', 'error');
        return;
      }

      currentArticles = data.articles;
      parsedCount.textContent = currentArticles.length;
      renderArticlesList();
      showToast(`Đã tự động nhận diện và bóc tách ${currentArticles.length} điều khoản!`, 'success');
    } catch (err) {
      showToast('Lỗi bóc tách: ' + err.message, 'error');
    }
  }

  function renderArticlesList() {
    if (!currentArticles.length) {
      articlesListContainer.innerHTML = `<p class="empty-hint">Chưa có điều khoản nào.</p>`;
      return;
    }

    articlesListContainer.innerHTML = currentArticles.map((art, idx) => `
      <div class="article-item" data-idx="${idx}">
        <div class="article-num-col">
          <label style="font-size: 0.75rem; color: var(--text-dim);">Số điều:</label>
          <input type="text" value="${escapeHtml(art.articleNumber)}" onchange="window.updateArticleField(${idx}, 'articleNumber', this.value)" style="padding: 0.4rem; font-weight: bold;">
        </div>
        <div class="article-content-col">
          <input type="text" placeholder="Tiêu đề điều (nếu có)" value="${escapeHtml(art.title)}" onchange="window.updateArticleField(${idx}, 'title', this.value)" style="padding: 0.4rem;">
          <textarea rows="3" placeholder="Nội dung điều khoản..." onchange="window.updateArticleField(${idx}, 'content', this.value)">${escapeHtml(art.content)}</textarea>
        </div>
        <div class="article-actions-col">
          <button type="button" class="btn-danger-sm" onclick="window.removeArticle(${idx})">Xóa</button>
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

      showToast('Đã lưu văn bản vào hệ thống thành công!', 'success');
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
  // MODAL CHI TIẾT & XÓA VĂN BẢN
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
        <div class="modal-article-item">
          <h5>Điều ${escapeHtml(a.article_number)}: ${escapeHtml(a.title)}</h5>
          <p>${escapeHtml(a.content)}</p>
        </div>
      `).join('') || '<p>Chưa có điều khoản nào.</p>';

      detailModal.classList.remove('hidden');
    } catch (err) {
      showToast('Lỗi xem chi tiết: ' + err.message, 'error');
    }
  };

  window.deleteDoc = async (id) => {
    if (!confirm(`Bạn có chắc chắn muốn xóa văn bản "${id}" khỏi hệ thống?`)) return;

    try {
      const res = await authFetch(`/api/documents/${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.ok) {
        showToast(data.error || 'Lỗi xóa văn bản', 'error');
        return;
      }
      showToast('Đã xóa văn bản thành công!', 'success');
      loadStats();
      loadDocuments();
    } catch (err) {
      showToast('Lỗi xóa: ' + err.message, 'error');
    }
  };

  // ============================================================
  // THỬ NGHIỆM TRUY VẤN RAG PLAYGROUND
  // ============================================================
  async function handleRagTest() {
    const query = playgroundQuery.value.trim();
    if (!query) {
      showToast('Vui lòng nhập câu hỏi thử nghiệm', 'error');
      return;
    }

    btnRunQueryTest.disabled = true;
    btnRunQueryTest.textContent = '⏳ Đang truy vấn...';

    try {
      const res = await authFetch('/api/rag-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      const data = await res.json();

      btnRunQueryTest.disabled = false;
      btnRunQueryTest.textContent = '🚀 Kiểm Tra Truy Vấn';

      if (!data.ok) {
        showToast(data.error || 'Lỗi truy vấn', 'error');
        return;
      }

      resCount.textContent = data.resultsCount;
      passagesList.innerHTML = data.passages.map((p, i) => `
        <div class="passage-card">
          <div class="passage-card-header">
            <h5>[#${i + 1}] ${escapeHtml(p.documentName || p.documentCode)} - Điều ${escapeHtml(p.articleNumber)}: ${escapeHtml(p.title)}</h5>
            <span class="passage-score">Độ khớp: ${(p.score ? p.score.toFixed(1) : 'Reranked')}</span>
          </div>
          <div class="passage-text">${escapeHtml(p.content)}</div>
        </div>
      `).join('') || '<p>Không tìm thấy đoạn trích nào đạt ngưỡng.</p>';

      playgroundResults.classList.remove('hidden');
    } catch (err) {
      btnRunQueryTest.disabled = false;
      btnRunQueryTest.textContent = '🚀 Kiểm Tra Truy Vấn';
      showToast('Lỗi: ' + err.message, 'error');
    }
  }

  // ============================================================
  // SEED DATABASE
  // ============================================================
  async function handleSeedDatabase() {
    if (!confirm('Bạn có muốn đồng bộ toàn bộ văn bản mẫu (HD 17, HD 05, HD 06, TT 02, QĐ 24, QĐ 37...) vào PostgreSQL không?')) return;

    btnSeedDb.disabled = true;
    btnSeedDb.textContent = '⏳ Đang nạp...';

    try {
      const res = await authFetch('/api/seed-db', { method: 'POST' });
      const data = await res.json();
      btnSeedDb.disabled = false;
      btnSeedDb.textContent = '⚡ Nạp Dữ Liệu Mẫu';

      if (!data.ok) {
        showToast(data.error || 'Lỗi nạp dữ liệu', 'error');
        return;
      }

      showToast(data.message, 'success');
      loadStats();
      loadDocuments();
    } catch (err) {
      btnSeedDb.disabled = false;
      btnSeedDb.textContent = '⚡ Nạp Dữ Liệu Mẫu';
      showToast('Lỗi: ' + err.message, 'error');
    }
  }

  // ============================================================
  // HELPERS
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
