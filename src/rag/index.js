/**
 * RAG Search & Retrieval Engine cho Văn bản Đảng
 * Hỗ trợ truy xuất từ PostgreSQL (ưu tiên) và Local Memory/JSON Fallback
 */

const DocumentLoader = require('./loader');
const db = require('../db');
const config = require('../config');

class RagEngine {
  constructor() {
    this.loader = new DocumentLoader();
    this.chunks = [];
    this.initialized = false;
  }

  /**
   * Khởi tạo chỉ mục
   */
  async init() {
    // 1. Tải dữ liệu từ file local
    this.chunks = this.loader.loadAll();
    this.initialized = true;

    // 2. Thử kết nối PostgreSQL và khởi tạo schema / seed dữ liệu
    try {
      const isDbConnected = await db.checkConnection();
      if (isDbConnected) {
        console.log('🐘 [Postgres] Đã kết nối cơ sở dữ liệu PostgreSQL.');
        await db.initSchema();
        // Kiểm tra xem DB đã có dữ liệu chưa
        const existingDocs = await db.getDocuments();
        if (existingDocs && existingDocs.length === 0) {
          console.log('🌱 [Postgres] Đang tự động nạp dữ liệu mẫu vào PostgreSQL...');
          await db.seedFromFiles(this.chunks);
        }
      } else {
        console.log('📦 [RAG Engine] Chế độ lưu trữ: Local In-Memory / File JSON.');
      }
    } catch (err) {
      console.warn('[RAG Engine] Cảnh báo kết nối DB:', err.message);
    }

    console.log(`[RAG Engine] Đã nạp ${this.chunks.length} điều khoản văn bản Đảng.`);
    return this.chunks.length;
  }

  /**
   * Tải lại dữ liệu (khi admin thêm/xóa/sửa văn bản)
   */
  async reload() {
    this.chunks = this.loader.loadAll();
    console.log(`[RAG Engine] Đã làm mới chỉ mục (${this.chunks.length} điều khoản).`);
    return this.chunks.length;
  }

  /**
   * Truy xuất các điều khoản liên quan nhất cho câu hỏi
   * @param {string} query
   * @param {object} [options]
   * @returns {Promise<Array<object>>}
   */
  async search(query, options = {}) {
    if (!this.initialized) await this.init();
    if (!query || !query.trim()) return [];

    const topK = options.topK || config.rag.topK || 4;

    // 1. Ưu tiên tìm kiếm từ PostgreSQL nếu DB đang hoạt động
    try {
      if (db.isConnected) {
        const dbResults = await db.searchArticles(query, { topK });
        if (dbResults && dbResults.length > 0) {
          return dbResults;
        }
      }
    } catch (err) {
      console.warn('[RAG Engine] Lỗi truy vấn Postgres, chuyển sang Local Fallback:', err.message);
    }

    // 2. Fallback tìm kiếm trong bộ nhớ
    return this._searchMemory(query, options);
  }

  _searchMemory(query, options = {}) {
    if (!this.chunks.length) return [];

    const topK = options.topK || config.rag.topK || 4;
    const minSim = options.minSimilarity ?? config.rag.minSimilarity ?? 0.2;

    const normalizedQuery = this._normalize(query);
    const queryTokens = this._tokenize(normalizedQuery);
    const docNumbers = query.match(/\b\d{1,3}\b/g) || [];

    const scored = this.chunks.map(chunk => {
      const normChunk = this._normalize(chunk.fullText);
      let score = 0;

      // 1. Khớp số hiệu văn bản (vd: hỏi "17", "37", "05", "24"...)
      for (const num of docNumbers) {
        if (chunk.documentCode?.includes(num)) {
          score += 15.0;
        }
        if (chunk.articleNumber === num) {
          score += 8.0;
        }
      }

      // 2. Khớp cụm từ nguyên văn
      if (normChunk.includes(normalizedQuery)) {
        score += 10.0;
      }

      // 3. Khớp tiêu đề điều khoản
      const normTitle = this._normalize(chunk.title);
      for (const token of queryTokens) {
        if (token.length > 1 && normTitle.includes(token)) {
          score += 3.0;
        }
      }

      // 4. Khớp từ khóa trong nội dung
      let matchedTokens = 0;
      for (const token of queryTokens) {
        if (token.length > 1 && normChunk.includes(token)) {
          matchedTokens++;
          score += 1.0;
        }
      }

      const matchRatio = queryTokens.length > 0 ? matchedTokens / queryTokens.length : 0;
      score += matchRatio * 5.0;

      return {
        ...chunk,
        score,
        matchRatio,
      };
    });

    return scored
      .filter(item => item.score >= minSim)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  /**
   * Định dạng danh sách chunks thành ngữ cảnh chuẩn cho LLM
   */
  formatContext(chunks) {
    if (!chunks || !chunks.length) return 'Không tìm thấy tài liệu căn cứ liên quan trực tiếp.';

    let context = '=== TÀI LIỆU CĂN CỨ VĂN BẢN ĐẢNG ===\n\n';
    chunks.forEach((c, idx) => {
      context += `[Tài liệu ${idx + 1}]\n`;
      context += `• Văn bản: ${c.documentName} (${c.documentCode || 'N/A'})\n`;
      context += `• Cơ quan ban hành: ${c.issuer} | Ngày: ${c.issueDate || 'N/A'}\n`;
      context += `• Căn cứ: Điều ${c.articleNumber} - ${c.title}\n`;
      context += `• Nội dung trích dẫn:\n"${c.content}"\n\n`;
    });

    return context;
  }

  _normalize(str) {
    if (!str) return '';
    return str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s\d]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  _tokenize(str) {
    if (!str) return [];
    return str.split(/\s+/).filter(w => w.length > 1);
  }
}

module.exports = new RagEngine();
