/**
 * Pipeline Orchestrator
 * Điều phối toàn bộ luồng Jev (System 1) + RAG + Gemini (System 2)
 */

const jev = require('./jev');
const rag = require('./rag');
const gemini = require('./gemini');
const config = require('./config');

class PipelineResult {
  constructor(answer, intent, retrievedDocs = []) {
    this.answer = answer;
    this.intent = intent;
    this.retrievedDocs = retrievedDocs;
  }

  toString() {
    return this.answer;
  }

  includes(...args) {
    return this.answer.includes(...args);
  }

  get length() {
    return this.answer.length;
  }

  toLowerCase() {
    return this.answer.toLowerCase();
  }

  toUpperCase() {
    return this.answer.toUpperCase();
  }

  slice(...args) {
    return this.answer.slice(...args);
  }
}

class PipelineOrchestrator {
  constructor() {
    this.rag = rag;
    this.jev = jev;
    this.gemini = gemini;
  }

  /**
   * Khởi chạy nạp tài liệu cho pipeline
   */
  async init() {
    await this.rag.init();
  }

  /**
   * Xử lý một tin nhắn từ người dùng
   * @param {object} param0
   * @returns {Promise<PipelineResult>} Kết quả câu trả lời kèm metadata
   */
  async processMessage({ text = '', senderName = 'Đồng chí' }) {
    const query = text.trim();
    if (!query) {
      return new PipelineResult('Vui lòng nhập câu hỏi hoặc nội dung quy định cần tra cứu.', 'empty', []);
    }

    // Xử lý các lệnh nhanh
    if (query.startsWith('/')) {
      const cmdAnswer = await this._handleCommand(query);
      return new PipelineResult(cmdAnswer, 'command', []);
    }

    // 1. TẦNG JEV: Phân loại ý định & Ràng buộc đầu vào (Strict Scope Gatekeeper)
    console.log(`[Pipeline] Đang phân loại ý định cho câu hỏi: "${query}"`);
    const route = await this.jev.routeIntent(query);
    console.log(`[Pipeline] Ý định nhận diện: ${route.intent} (độ tin cậy: ${Math.round(route.confidence * 100)}%)`);

    // Nhánh chuỗi rác / quá ngắn / ký tự vô nghĩa (Early return: 0 token, 0 DB query)
    if (route.intent === 'invalid_or_empty') {
      const invalidText = (
        `Chào ${senderName},\n\n` +
        `Nội dung tra cứu chưa rõ ràng. Đồng chí vui lòng nhập câu hỏi hoặc số hiệu văn bản cụ thể cần tìm hiểu ` +
        `(ví dụ: "Thẩm quyền ký T/M", "Quy định 37 về 19 điều cấm", "Thời hạn nộp lưu hồ sơ").`
      );
      return new PipelineResult(invalidText, route.intent, []);
    }

    // Nhánh chào hỏi / hỏi cách sử dụng (Early return: 0 token Gemini, 0 DB query)
    if (route.intent === 'greeting_or_help') {
      return new PipelineResult(this._buildGreeting(senderName), route.intent, []);
    }

    // Nhánh ngoài phạm vi (Early return: Chặn đứng mọi câu hỏi không liên quan, bảo toàn 100% token Gemini và hạ tầng DB)
    if (route.intent === 'out_of_scope') {
      const outText = (
        `Chào ${senderName},\n\n` +
        `Tôi là Trợ lý AI chuyên trách hỗ trợ tra cứu về Cương lĩnh, Điều lệ, Quy định của Đảng, Thể thức văn bản và Công tác văn thư lưu trữ.\n\n` +
        `Nội dung câu hỏi của đồng chí nằm ngoài phạm vi nghiệp vụ được phân công. Đồng chí vui lòng đặt các câu hỏi thuộc các lĩnh vực sau:\n` +
        `• Thể thức và kỹ thuật trình bày văn bản Đảng (HD 05-HD/VPTW ngày 27/05/2026, QĐ 399-QĐ/TW, thẩm quyền ký T/M, K/T, con dấu, chữ ký số...)\n` +
        `• Công tác văn thư và lưu trữ cơ quan Đảng (HD 05, HD 06, Thông tư 02 BNV, nộp lưu hồ sơ...)\n` +
        `• Quy định, điều lệ và thi hành Điều lệ Đảng (Quy định 24, Quy định 37, Hướng dẫn 01, Quy định 22...)`
      );
      return new PipelineResult(outText, route.intent, []);
    }

    // 2. TẦNG RAG: Truy xuất các điều khoản liên quan
    console.log(`[Pipeline] Đang truy xuất tài liệu từ RAG...`);
    const candidatePassages = await this.rag.search(query, { topK: config.rag.topK });

    if (!candidatePassages.length) {
      const notFoundText = (
        `Chào ${senderName},\n\n` +
        `Hiện tại trong kho dữ liệu văn bản Đảng của hệ thống chưa tìm thấy quy định nào điều chỉnh trực tiếp nội dung:\n` +
        `"${query}"\n\n` +
        `Gợi ý:\n` +
        `• Đồng chí có thể thử tìm bằng từ khóa cụ thể hơn (ví dụ: "tuổi kết nạp", "quy định 37", "thời hạn dự bị").\n` +
        `• Gõ /docs để xem danh mục các văn bản Đảng hiện có trong kho dữ liệu.`
      );
      return new PipelineResult(notFoundText, route.intent, []);
    }

    // 3. TẦNG JEV: Lọc và Rerank các đoạn trích (System One Relevance Filter)
    console.log(`[Pipeline] Jev đang lọc ${candidatePassages.length} đoạn trích liên quan...`);
    const filteredPassages = await this.jev.filterRelevantPassages(query, candidatePassages);
    const finalPassages = filteredPassages.length > 0 ? filteredPassages : candidatePassages.slice(0, 2);

    const docCodes = [...new Set(finalPassages.map(p => p.documentCode || p.documentId).filter(Boolean))];

    console.log(`[Pipeline] Giữ lại ${finalPassages.length} đoạn trích đạt chuẩn.`);
    const context = this.rag.formatContext(finalPassages);

    // 4. TẦNG GEMINI: Tổng hợp câu trả lời chuẩn hành chính Đảng (System Two)
    console.log(`[Pipeline] Đang gửi context tới Gemini để sinh câu trả lời...`);
    let answer = await this.gemini.generateAnswer(query, context);

    // 5. TẦNG JEV GUARDRAIL: Kiểm tra tính trung thực (Faithfulness Check)
    if (config.jev.enableGuardrails) {
      console.log(`[Pipeline] Jev đang kiểm tra tính xác thực (Guardrail)...`);
      const check = await this.jev.checkFaithfulness(context, answer);
      if (!check.isFaithful) {
        console.warn(`[Pipeline] Cảnh báo: Câu trả lời có nguy cơ không khớp tài liệu trích dẫn!`);
        answer += `\n\nLưu ý: Nội dung trên được tổng hợp tự động; đồng chí vui lòng đối chiếu lại văn bản gốc trước khi áp dụng chính thức.`;
      }
    }

    return new PipelineResult(answer, route.intent, docCodes);
  }

  async _handleCommand(command) {
    const cmd = command.toLowerCase().split(/\s+/)[0];

    switch (cmd) {
      case '/start':
      case '/help':
        return this._buildGreeting();

      case '/docs': {
        const chunks = this.rag.chunks || [];
        const docMap = new Map();
        for (const c of chunks) {
          const code = c.documentCode || c.documentId;
          if (code && !docMap.has(code)) {
            docMap.set(code, {
              code,
              name: c.documentName,
              issuer: c.issuer,
              issueDate: c.issueDate,
            });
          }
        }

        let listText = '';
        let i = 1;
        for (const doc of docMap.values()) {
          listText += `${i++}. ${doc.code} (${doc.issueDate || 'Ban hành'}): ${doc.name} - Cơ quan: ${doc.issuer || 'N/A'}\n`;
        }

        if (!listText) {
          listText = (
            `1. 05-HD/VPTW (27/05/2026): Thể thức và kỹ thuật trình bày văn bản Đảng (văn bản điện tử, chữ ký số)\n` +
            `2. 399-QĐ/TW (09/01/2026): Thể loại, thẩm quyền ban hành và thể thức văn bản của Đảng (25 thể loại)\n` +
            `3. 05-HD/VPTW-VT (26/12/2014): Hướng dẫn công tác văn thư trong cơ quan Đảng\n` +
            `4. 06-HD/VPTW (26/12/2014): Lập hồ sơ và nộp lưu hồ sơ vào Lưu trữ cơ quan Đảng\n` +
            `5. 02/2019/TT-BNV (24/01/2019): Tiêu chuẩn dữ liệu thông tin và lưu trữ điện tử\n` +
            `6. 24-QĐ/TW (30/07/2021): Thi hành Điều lệ Đảng\n` +
            `7. 37-QĐ/TW (25/10/2021): Quy định về những điều đảng viên không được làm\n` +
            `8. 01-HD/TW (28/09/2021): Một số vấn đề cụ thể thi hành Điều lệ Đảng\n` +
            `9. 22-QĐ/TW (28/07/2021): Công tác kiểm tra, giám sát và kỷ luật của Đảng\n`
          );
        }

        return (
          `DANH MỤC VĂN BẢN ĐẢNG TRONG KHO DỮ LIỆU (${docMap.size || 9} VĂN BẢN):\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          listText +
          `\nLưu ý: Đồng chí có thể nạp thêm văn bản mới qua Web Admin Dashboard hoặc thư mục /data/regulations/`
        );
      }

      case '/ping':
        return `Pong! Hệ thống AI (Jev + RAG + Gemini) đang hoạt động ổn định.`;

      default:
        return `Lệnh ${cmd} không hợp lệ. Gõ /help để xem hướng dẫn.`;
    }
  }

  _buildGreeting(senderName = 'Đồng chí') {
    return (
      `HỆ THỐNG TRỢ LÝ VĂN BẢN ĐẢNG & ZALO AI\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `Chào ${senderName},\n\n` +
      `Tôi là trợ lý AI chuyên giải đáp các thắc mắc về Cương lĩnh, Điều lệ, Quy định, Thông tư và Hướng dẫn của Đảng Cộng sản Việt Nam.\n\n` +
      `CÁC CHUYÊN MỤC HỖ TRỢ CHÍNH (CẬP NHẬT 2026):\n` +
      `• Thể thức và kỹ thuật trình bày văn bản Đảng (Hướng dẫn số 05-HD/VPTW ngày 27/05/2026 và Quy định số 399-QĐ/TW ngày 09/01/2026: thẩm quyền ký T/M, K/T, con dấu, chữ ký số, 25 thể loại văn bản...).\n` +
      `• Công tác văn thư và lưu trữ cơ quan Đảng (Hướng dẫn 05, Hướng dẫn 06, Thông tư 02 BNV: nộp lưu hồ sơ, lưu trữ điện tử...).\n` +
      `• Quy định và thi hành Điều lệ Đảng (Quy định 24, Quy định 37 về 19 điều cấm, Hướng dẫn 01, Quy định 22 về kiểm tra kỷ luật...).\n\n` +
      `MỘT SỐ CÂU HỎI MẪU:\n` +
      `• "Thẩm quyền ký thay mặt T/M và ký thay K/T theo Hướng dẫn 05/2026 quy định thế nào?"\n` +
      `• "Hệ thống 25 thể loại văn bản của Đảng theo Quy định 399-QĐ/TW gồm những gì?"\n` +
      `• "Quy chuẩn kỹ thuật chữ ký số trên văn bản điện tử của Đảng theo Hướng dẫn 05/2026?"\n` +
      `• "Thời hạn nộp lưu hồ sơ vào Lưu trữ cơ quan Đảng là bao lâu?"\n` +
      `• "Những điều đảng viên không được làm theo Quy định 37?"\n\n` +
      `Gõ /docs để tra cứu toàn bộ danh mục văn bản hiện có trong cơ sở dữ liệu.`
    );
  }
}

module.exports = new PipelineOrchestrator();
