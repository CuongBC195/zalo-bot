/**
 * RAG Document Loader
 * Đọc và chuẩn hóa văn bản quy định Đảng thành các chunks theo Điều/Khoản
 */

const fs = require('fs');
const path = require('path');

const REGULATIONS_DIR = path.join(__dirname, '..', '..', 'data', 'regulations');

class DocumentLoader {
  constructor(dir = REGULATIONS_DIR) {
    this.dir = dir;
  }

  /**
   * Tải toàn bộ văn bản trong thư mục regulations
   * @returns {Array<object>} Danh sách chunks
   */
  loadAll() {
    if (!fs.existsSync(this.dir)) {
      fs.mkdirSync(this.dir, { recursive: true });
      return [];
    }

    const files = fs.readdirSync(this.dir).filter(f => f.endsWith('.json'));
    const chunks = [];

    for (const file of files) {
      const filePath = path.join(this.dir, file);
      try {
        const raw = fs.readFileSync(filePath, 'utf8');
        const doc = JSON.parse(raw);

        if (!doc.articles || !Array.isArray(doc.articles)) continue;

        for (const art of doc.articles) {
          chunks.push({
            id: `${doc.documentCode || doc.documentId}_d${art.articleNumber}`,
            documentId: doc.documentId,
            documentCode: doc.documentCode,
            documentName: doc.documentName,
            issuer: doc.issuer,
            issueDate: doc.issueDate,
            status: doc.status || 'Còn hiệu lực',
            articleNumber: art.articleNumber,
            title: art.title || '',
            content: art.content,
            fullText: `${doc.documentCode || ''} ${doc.documentName || ''} - Điều ${art.articleNumber}: ${art.title || ''}. ${art.content}`,
          });
        }
      } catch (err) {
        console.error(`[Loader] Lỗi đọc file ${file}:`, err.message);
      }
    }

    return chunks;
  }
}

module.exports = DocumentLoader;
