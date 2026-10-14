/**
 * RAG Search & Retrieval Engine cho Văn bản Đảng
 * Kết hợp tìm kiếm ngữ nghĩa, từ khóa pháp lý và khớp cụm từ
 */

const DocumentLoader = require('./loader');
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
  init() {
    this.chunks = this.loader.loadAll();
    this.initialized = true;
    console.log(`[RAG Engine] Đã nạp ${this.chunks.length} điều khoản văn bản Đảng.`);
    return this.chunks.length;
  }

  /**
   * Truy xuất các điều khoản liên quan nhất cho câu hỏi
   * @param {string} query
   * @param {object} [options]
   * @returns {Array<object>} Danh sách chunks xếp hạng theo độ liên quan
   */
  search(query, options = {}) {
    if (!this.initialized) this.init();
    if (!query || !query.trim() || !this.chunks.length) return [];

    const topK = options.topK || config.rag.topK || 4;
    const minSim = options.minSimilarity ?? config.rag.minSimilarity ?? 0.2;

    const normalizedQuery = this._normalize(query);
    const queryTokens = this._tokenize(normalizedQuery);
    const docNumbers = query.match(/\b\d{1,3}\b/g) || [];

    const scored = this.chunks.map(chunk => {
      const normChunk = this._normalize(chunk.fullText);
      let score = 0;

      // 1. Khớp số hiệu văn bản (vd: hỏi "37" hoặc "quy định 37" -> boost cực mạnh văn bản 37)
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

      // 4. Khớp từ khóa trong nội dung (TF tính theo token)
      let matchedTokens = 0;
      for (const token of queryTokens) {
        if (token.length > 1 && normChunk.includes(token)) {
          matchedTokens++;
          score += 1.0;
        }
      }

      // Tỷ lệ khớp từ
      const matchRatio = queryTokens.length > 0 ? matchedTokens / queryTokens.length : 0;
      score += matchRatio * 5.0;

      return {
        ...chunk,
        score,
        matchRatio,
      };
    });

    // Lọc theo ngưỡng và sắp xếp giảm dần
    const results = scored
      .filter(item => item.score >= minSim)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    return results;
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
      context += `• Cơ quan ban hành: ${c.issuer} | Ngày: ${c.issueDate}\n`;
      context += `• Căn cứ: Điều ${c.articleNumber} - ${c.title}\n`;
      context += `• Nội dung trích dẫn:\n"${c.content}"\n\n`;
    });

    return context;
  }

  // ============================================================
  // Helpers chuẩn hóa chuỗi tiếng Việt
  // ============================================================
  _normalize(str) {
    if (!str) return '';
    return str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // bỏ dấu để so sánh linh hoạt
      .replace(/[^\w\s\d]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  _tokenize(str) {
    if (!str) return [];
    return str
      .split(/\s+/)
      .filter(w => w.length > 1);
  }
}

module.exports = new RagEngine();
