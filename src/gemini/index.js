/**
 * Gemini Client (System Two - Generation Engine)
 * Kết nối Google Gemini API để tạo phản hồi chuẩn xác dựa trên context RAG
 */

const config = require('../config');
const { SYSTEM_INSTRUCTION, buildPrompt } = require('./prompts');

class GeminiService {
  constructor() {
    this.apiKey = config.gemini.apiKey;
    this.model = config.gemini.model;
    this.baseUrl = config.gemini.baseUrl;
  }

  /**
   * Sinh câu trả lời dựa trên câu hỏi và ngữ cảnh trích dẫn từ RAG
   * @param {string} query Câu hỏi người dùng
   * @param {string} context Ngữ cảnh văn bản Đảng trích xuất từ RAG
   * @returns {Promise<string>}
   */
  async generateAnswer(query, context) {
    if (!this.apiKey) {
      return this._fallbackFormat(query, context);
    }

    const endpoint = `${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`;
    const userPrompt = buildPrompt(query, context);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: SYSTEM_INSTRUCTION }],
          },
          contents: [
            {
              role: 'user',
              parts: [{ text: userPrompt }],
            },
          ],
          generationConfig: {
            temperature: config.gemini.temperature,
            maxOutputTokens: config.gemini.maxOutputTokens,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Gemini API] Lỗi HTTP ${response.status}:`, errorText);
        return this._fallbackFormat(query, context);
      }

      const data = await response.json();
      const answer = data?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (answer && answer.trim()) {
        return answer.trim();
      }

      return this._fallbackFormat(query, context);
    } catch (err) {
      console.error('[Gemini API] Lỗi ngoại lệ:', err.message);
      return this._fallbackFormat(query, context);
    }
  }

  /**
   * Định dạng câu trả lời trích dẫn trực tiếp từ RAG khi chưa có API key Gemini
   */
  _fallbackFormat(query, context) {
    if (!context || context.includes('Không tìm thấy tài liệu căn cứ')) {
      return (
        `⚠️ Chưa tìm thấy quy định phù hợp trong kho dữ liệu văn bản hiện tại để giải đáp câu hỏi:\n` +
        `"${query}"\n\n` +
        `Đồng chí vui lòng kiểm tra lại từ khóa hoặc đối chiếu trực tiếp với cấp ủy/chi bộ.`
      );
    }

    return (
      `📌 KẾT QUẢ TRA CỨU CĂN CỨ VĂN BẢN ĐẢNG:\n\n` +
      `${context}\n` +
      `💡 Lưu ý: Hệ thống đang trích xuất trực tiếp từ các Điều/Khoản trong kho dữ liệu Đảng. ` +
      `Để bật tính năng tổng hợp tự động bằng AI, hãy cấu hình GEMINI_API_KEY trong file .env.`
    );
  }
}

module.exports = new GeminiService();
