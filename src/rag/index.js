/**
 * RAG Search & Retrieval Engine cho Văn bản Đảng
 * Hỗ trợ truy xuất từ PostgreSQL (ưu tiên) và Local Memory/JSON Fallback
 */

const DocumentLoader = require('./loader');
const db = require('../db');
const config = require('../config');
const { extractDocNumbers } = require('./abbreviations');

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
        } else {
          // Nếu DB đã có dữ liệu từ trước, đồng bộ các văn bản mới do Admin thêm vào this.chunks
          await this._syncFromDb();
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

  async reload() {
    this.chunks = this.loader.loadAll();
    await this._syncFromDb();
    console.log(`[RAG Engine] Đã làm mới chỉ mục (${this.chunks.length} điều khoản).`);
    return this.chunks.length;
  }

  /**
   * Đồng bộ thêm các tài liệu từ PostgreSQL (nếu có thêm từ Web Admin)
   */
  async _syncFromDb() {
    try {
      if (db.isConnected) {
        const docs = await db.getDocuments();
        if (docs && docs.length) {
          const existingCodes = new Set(this.chunks.map(c => c.documentCode || c.documentId));
          for (const doc of docs) {
            if (!existingCodes.has(doc.document_code)) {
              const fullDoc = await db.getDocumentById(doc.id);
              if (fullDoc && fullDoc.articles) {
                for (const art of fullDoc.articles) {
                  const descPart = fullDoc.description ? ` ${fullDoc.description}` : '';
                  this.chunks.push({
                    documentId: fullDoc.document_code,
                    documentCode: fullDoc.document_code,
                    documentName: fullDoc.document_name,
                    issuer: fullDoc.issuer,
                    issueDate: fullDoc.issue_date,
                    category: fullDoc.category || 'quy_dinh_dang',
                    status: fullDoc.status || 'Còn hiệu lực',
                    description: fullDoc.description || '',
                    articleNumber: art.article_number,
                    title: art.title,
                    content: art.content,
                    fullText: `${fullDoc.document_code} ${fullDoc.document_name}${descPart} - Điều ${art.article_number}: ${art.title}. ${art.content}`,
                  });
                }
              }
            }
          }
        }
      }
    } catch (err) {
      console.warn('[RAG Engine] Cảnh báo đồng bộ chunks từ DB:', err.message);
    }
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

    const topK = options.topK || config.rag.topK || 6;

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

    const topK = options.topK || config.rag.topK || 6;
    const minSim = options.minSimilarity ?? config.rag.minSimilarity ?? 0.2;

    const normalizedQuery = this._normalize(query);
    const queryTokens = this._tokenize(normalizedQuery);
    const docNumbers = extractDocNumbers(query);

    // Xây dựng danh sách bigrams cho việc nhận diện đa ý định / đa hành vi
    const bigrams = [];
    for (let i = 0; i < queryTokens.length - 1; i++) {
      if (queryTokens[i].length > 1 && queryTokens[i + 1].length > 1) {
        bigrams.push(`${queryTokens[i]} ${queryTokens[i + 1]}`);
      }
    }

    const scored = this.chunks.map(chunk => {
      const normChunk = this._normalize(chunk.fullText);
      let score = 0;

      // 1. Khớp số hiệu văn bản bằng regex ranh giới số độc lập
      for (const num of docNumbers) {
        const numRegex = new RegExp('(^|[^0-9])0*' + num + '([^0-9]|$)');
        if (chunk.documentCode && numRegex.test(chunk.documentCode)) {
          score += 15.0;
          if (chunk.articleNumber === '0') {
            score += 8.0; // Bẫy Điều 0: Ưu tiên đặc biệt Điều 0 khi văn bản được hỏi
          }
        }
        if (chunk.articleNumber === num) {
          score += 8.0;
        }
      }

      // 2. Khớp cụm từ nguyên văn
      if (normChunk.includes(normalizedQuery)) {
        score += 10.0;
      }

      // 3. Khớp cụm từ khóa liên tiếp (bigrams) - Phục vụ truy xuất đa ý định / đa hành vi
      const normTitle = this._normalize(chunk.title);
      for (const bg of bigrams) {
        if (normTitle.includes(bg)) {
          score += 4.0;
        } else if (normChunk.includes(bg)) {
          score += 2.0;
        }
      }

      // 4. Khớp tiêu đề điều khoản
      for (const token of queryTokens) {
        if (token.length > 1 && normTitle.includes(token)) {
          score += 3.0;
        }
      }

      // 5. Khớp từ khóa trong nội dung
      let matchedTokens = 0;
      for (const token of queryTokens) {
        if (token.length > 1 && normChunk.includes(token)) {
          matchedTokens++;
          score += 1.0;
        }
      }

      const matchRatio = queryTokens.length > 0 ? matchedTokens / queryTokens.length : 0;
      score += matchRatio * 5.0;

      // 5. Ưu tiên văn bản Còn hiệu lực; giảm điểm các điều khoản cũ của văn bản Hết hiệu lực nếu không hỏi đích danh
      const isExpired = (chunk.status || '').toLowerCase().includes('hết hiệu lực');
      const explicitlyAsked = docNumbers.some(num => {
        if (parseInt(num, 10) > 1900 && parseInt(num, 10) < 2100) return false;
        return new RegExp('(^|[^0-9])0*' + num + '([^0-9]|$)').test(chunk.documentCode || '');
      });

      if (isExpired && !explicitlyAsked) {
        score = chunk.articleNumber === '0' ? score * 0.6 : score * 0.2;
      } else if (!isExpired && score > 0) {
        score += 2.5;
      }

      return {
        ...chunk,
        score,
        matchRatio,
      };
    });

    const sorted = scored
      .filter(item => item.score >= minSim)
      .sort((a, b) => b.score - a.score);

    // Diversity Cap: Nếu có từ 2 số hiệu văn bản trở lên được nhắc đến
    const validDocNums = docNumbers.filter(n => !(parseInt(n, 10) > 1900 && parseInt(n, 10) < 2100));
    if (validDocNums.length >= 2) {
      const docCount = {};
      const capped = [];
      for (const item of sorted) {
        const code = item.documentCode;
        docCount[code] = (docCount[code] || 0) + 1;
        if (docCount[code] <= 3) {
          capped.push(item);
        }
        if (capped.length >= topK) break;
      }
      return capped;
    }

    return sorted.slice(0, topK);
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
      context += `• Tình trạng hiệu lực: ${c.status || 'Còn hiệu lực'}\n`;
      if (c.description) {
        context += `• Ghi chú hiệu lực & Văn bản thay thế: ${c.description}\n`;
      }
      context += `• Căn cứ: Điều ${c.articleNumber} - ${c.title}\n`;
      context += `• Nội dung trích dẫn:\n"${c.content}"\n\n`;
    });

    return context;
  }

  _normalize(str) {
    if (!str) return '';
    return str
      .toLowerCase()
      .replace(/đ/g, 'd')
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
