/**
 * Pipeline Orchestrator
 * Điều phối toàn bộ luồng Jev (System 1) + RAG + Gemini (System 2)
 */

const jev = require('./jev');
const rag = require('./rag');
const gemini = require('./gemini');
const config = require('./config');

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
   * @returns {Promise<string>} Câu trả lời hoàn chỉnh
   */
  async processMessage({ text = '', senderName = 'Đồng chí' }) {
    const query = text.trim();
    if (!query) return 'Vui lòng nhập câu hỏi hoặc nội dung quy định cần tra cứu.';

    // Xử lý các lệnh nhanh
    if (query.startsWith('/')) {
      return this._handleCommand(query);
    }

    // 1. TẦNG JEV: Phân loại ý định (System One Intent Routing)
    console.log(`[Pipeline] Đang phân loại ý định cho câu hỏi: "${query}"`);
    const route = await this.jev.routeIntent(query);
    console.log(`[Pipeline] Ý định nhận diện: ${route.intent} (độ tin cậy: ${Math.round(route.confidence * 100)}%)`);

    // Nhánh chào hỏi / hỏi cách sử dụng
    if (route.intent === 'greeting_or_help') {
      return this._buildGreeting(senderName);
    }

    // Nhánh ngoài phạm vi
    if (route.intent === 'out_of_scope') {
      return (
        `Chào ${senderName},\n\n` +
        `Tôi là Trợ lý AI chuyên trách giải đáp về Cương lĩnh, Điều lệ, Quy định, Thông tư và Hướng dẫn của Đảng.\n\n` +
        `Nội dung câu hỏi của đồng chí nằm ngoài phạm vi hỗ trợ của tôi. Đồng chí vui lòng đặt các câu hỏi liên quan đến công tác Đảng (ví dụ: kết nạp đảng, những điều đảng viên không được làm, sinh hoạt chi bộ, kỷ luật đảng viên...).`
      );
    }

    // 2. TẦNG RAG: Truy xuất các điều khoản liên quan
    console.log(`[Pipeline] Đang truy xuất tài liệu từ RAG...`);
    const candidatePassages = await this.rag.search(query, { topK: config.rag.topK });

    if (!candidatePassages.length) {
      return (
        `Chào ${senderName},\n\n` +
        `Hiện tại trong kho dữ liệu văn bản Đảng của hệ thống chưa tìm thấy quy định nào điều chỉnh trực tiếp nội dung:\n` +
        `"${query}"\n\n` +
        `💡 Gợi ý:\n` +
        `• Đồng chí có thể thử tìm bằng từ khóa cụ thể hơn (ví dụ: "tuổi kết nạp", "quy định 37", "thời hạn dự bị").\n` +
        `• Gõ /docs để xem danh mục các văn bản Đảng hiện có trong kho dữ liệu.`
      );
    }

    // 3. TẦNG JEV: Lọc và Rerank các đoạn trích (System One Relevance Filter)
    console.log(`[Pipeline] Jev đang lọc ${candidatePassages.length} đoạn trích liên quan...`);
    const filteredPassages = await this.jev.filterRelevantPassages(query, candidatePassages);
    const finalPassages = filteredPassages.length > 0 ? filteredPassages : candidatePassages.slice(0, 2);

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
        answer += `\n\n⚠️ Lưu ý: Nội dung trên được tổng hợp tự động; đồng chí vui lòng đối chiếu lại văn bản gốc trước khi áp dụng chính thức.`;
      }
    }

    return answer;
  }

  _handleCommand(command) {
    const cmd = command.toLowerCase().split(/\s+/)[0];

    switch (cmd) {
      case '/start':
      case '/help':
        return this._buildGreeting();

      case '/docs':
        return (
          `📚 DANH MỤC VĂN BẢN ĐẢNG TRONG KHO DỮ LIỆU:\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `1. Quy định số 24-QĐ/TW (30/07/2021) của BCH Trung ương: Thi hành Điều lệ Đảng.\n` +
          `2. Quy định số 37-QĐ/TW (25/10/2021) của BCH Trung ương: Về những điều đảng viên không được làm (19 điều cấm).\n` +
          `3. Hướng dẫn số 01-HD/TW (28/09/2021) của Ban Bí thư: Một số vấn đề cụ thể thi hành Điều lệ Đảng.\n` +
          `4. Quy định số 22-QĐ/TW (28/07/2021) của BCH Trung ương: Công tác kiểm tra, giám sát và kỷ luật của Đảng.\n\n` +
          `💡 Đồng chí có thể nạp thêm văn bản mới vào thư mục /data/regulations/`
        );

      case '/ping':
        return `🏓 Pong! Hệ thống AI (Jev + RAG + Gemini) đang hoạt động ổn định.`;

      default:
        return `Lệnh ${cmd} không hợp lệ. Gõ /help để xem hướng dẫn.`;
    }
  }

  _buildGreeting(senderName = 'Đồng chí') {
    return (
      `🇻🇳 CHÀO MỪNG ${senderName.toUpperCase()} ĐẾN VỚI TRỢ LÝ VĂN BẢN ĐẢNG AI\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `Tôi là trợ lý AI chuyên giải đáp các thắc mắc về Cương lĩnh, Điều lệ, Quy định, Thông tư và Hướng dẫn của Đảng Cộng sản Việt Nam.\n\n` +
      `✨ CÔNG NGHỆ ỨNG DỤNG:\n` +
      `• Jev (TypeSafe System 1): Định tuyến ý định & kiểm duyệt độ tin cậy.\n` +
      `• RAG: Truy xuất chính xác từng Điều/Khoản từ kho dữ liệu Đảng.\n` +
      `• Gemini (System 2): Phân tích và soạn thảo phản hồi chuẩn mực.\n\n` +
      `📌 MỘT SỐ CÂU HỎI MẪU:\n` +
      `• "Tuổi đời và trình độ học vấn để được kết nạp Đảng quy định ra sao?"\n` +
      `• "Quy định 37 về những điều đảng viên không được làm gồm những gì?"\n` +
      `• "Đảng viên dự bị có được quyền biểu quyết hay ứng cử không?"\n` +
      `• "Hồ sơ của người vào Đảng gồm những giấy tờ gì?"\n` +
      `• "Chi bộ có thẩm quyền khai trừ đảng viên không?"\n\n` +
      `💡 Gõ /docs để xem danh sách các văn bản hiện có.`
    );
  }
}

module.exports = new PipelineOrchestrator();
