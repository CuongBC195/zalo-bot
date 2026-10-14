/**
 * Frontend Application Logic cho Web Admin Dashboard
 */

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const dbStatusBadge = document.getElementById('dbStatusBadge');
  const dbStatusText = document.getElementById('dbStatusText');
  const btnSeedDb = document.getElementById('btnSeedDb');

  // Stats
  const statTotalDocs = document.getElementById('statTotalDocs');
  const statTotalArticles = document.getElementById('statTotalArticles');
  const statTheThuc = document.getElementById('statTheThuc');
  const statVanThu = document.getElementById('statVanThu');

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

  // Tab 3: RAG Playground
  const playgroundQuery = document.getElementById('playgroundQuery');
  const btnRunQueryTest = document.getElementById('btnRunQueryTest');
  const playgroundResults = document.getElementById('playgroundResults');
  const passagesList = document.getElementById('passagesList');
  const resCount = document.getElementById('resCount');
  const sampleChips = document.querySelectorAll('.chip');

  // Modal
  const detailModal = document.getElementById('detailModal');
  const btnCloseModal = document.getElementById('btnCloseModal');
  const modalDocCode = document.getElementById('modalDocCode');
  const modalDocName = document.getElementById('modalDocName');
  const modalIssuer = document.getElementById('modalIssuer');
  const modalCategory = document.getElementById('modalCategory');
  const modalDate = document.getElementById('modalDate');
  const modalArticlesList = document.getElementById('modalArticlesList');

  // State
  let currentArticles = [];

  // ============================================================
  // KHỞI ĐỘNG VÀ TẢI DỮ LIỆU
  // ============================================================
  init();

  async function init() {
    setupTabSwitching();
    setupEventListeners();
    await loadStats();
    await loadDocuments();
  }

  // ============================================================
  // TABS & EVENT LISTENERS
  // ============================================================
  function setupTabSwitching() {
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        tabBtns.forEach(b => b.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));

        btn.classList.add('active');
        const targetId = btn.dataset.tab;
        document.getElementById(targetId)?.classList.add('active');
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

    // Modal close
    btnCloseModal.addEventListener('click', () => detailModal.classList.add('hidden'));
    detailModal.querySelector('.modal-backdrop').addEventListener('click', () => detailModal.classList.add('hidden'));
  }

  // ============================================================
  // API LOADERS
  // ============================================================
  async function loadStats() {
    try {
      const res = await fetch('/api/stats');
      const data = await res.json();
      if (!data.ok) return;

      // Cập nhật trạng thái DB
      if (data.isDbConnected) {
        dbStatusBadge.className = 'status-pill status-connected';
        dbStatusText.textContent = 'PostgreSQL: Đang kết nối';
      } else {
        dbStatusBadge.className = 'status-pill status-fallback';
        dbStatusText.textContent = 'Chế độ Local File / Cache';
      }

      // Cập nhật các con số
      statTotalDocs.textContent = data.stats.totalDocs;
      statTotalArticles.textContent = data.stats.totalArticles;
      statTheThuc.textContent = data.stats.theThucCount;
      statVanThu.textContent = data.stats.vanThuCount;
    } catch (err) {
      console.error('Lỗi tải thống kê:', err);
    }
  }

  async function loadDocuments() {
    try {
      const search = searchInput.value.trim();
      const category = categoryFilter.value;
      const url = `/api/documents?search=${encodeURIComponent(search)}&category=${encodeURIComponent(category)}`;

      const res = await fetch(url);
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
  // AUTO PARSER & THÊM VĂN BẢN
  // ============================================================
  async function handleAutoParse() {
    const text = rawTextContent.value.trim();
    if (!text) {
      showToast('Vui lòng dán nội dung văn bản vào ô trước khi bóc tách', 'error');
      return;
    }

    try {
      const res = await fetch('/api/parse-raw', {
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
      const res = await fetch('/api/documents', {
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

      // Chuyển về tab danh sách
      document.querySelector('[data-tab="tab-list"]').click();
      loadStats();
      loadDocuments();
    } catch (err) {
      showToast('Lỗi gửi dữ liệu: ' + err.message, 'error');
    }
  }

  // ============================================================
  // MODAL CHI TIẾT & XÓA
  // ============================================================
  window.viewDocDetails = async (id) => {
    try {
      const res = await fetch(`/api/documents/${encodeURIComponent(id)}`);
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
      const res = await fetch(`/api/documents/${encodeURIComponent(id)}`, { method: 'DELETE' });
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
      const res = await fetch('/api/rag-test', {
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
      const res = await fetch('/api/seed-db', { method: 'POST' });
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
