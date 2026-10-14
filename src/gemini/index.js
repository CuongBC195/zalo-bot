/**
 * Gemini Client (System Two - Generation Engine)
 * Kết nối Google Gemini API để tạo phản hồi chuẩn xác dựa trên context RAG
 * Tự động hỗ trợ Fallback giữa các model Flash (gemini-flash-latest, gemini-3.8-flash...)
 */

const dns = require('node:dns');
try {
  dns.setDefaultResultOrder('ipv4first');
} catch (_) {}

const config = require('../config');
const { SYSTEM_INSTRUCTION, buildPrompt } = require('./prompts');

class GeminiService {
  constructor() {
    this.apiKey = config.gemini.apiKey;
    this.primaryModel = config.gemini.model || 'gemini-flash-latest';
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

    // Danh sách model ưu tiên (gemini-3.1-flash-lite phản hồi cực nhanh ~1.6s, ổn định 100%)
    const modelCandidates = Array.from(new Set([
      this.primaryModel,
      'gemini-3.1-flash-lite',
      'gemini-3-flash-preview',
      'gemini-3.8-flash',
      'gemini-flash-latest',
    ]));

    const userPrompt = buildPrompt(query, context);

    for (const model of modelCandidates) {
      try {
        const endpoint = `${this.baseUrl}/models/${model}:generateContent?key=${this.apiKey}`;
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': this.apiKey,
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
          signal: AbortSignal.timeout(15000),
        });

        if (response.ok) {
          const data = await response.json();
          const answer = data?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (answer && answer.trim()) {
            const cleanAnswer = answer.replace(/[\p{Extended_Pictographic}\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').trim();
            return cleanAnswer;
          }
        } else {
          const errorText = await response.text();
          console.warn(`[Gemini API] Model ${model} trả về mã ${response.status}, thử model tiếp theo...`);
        }
      } catch (err) {
        console.warn(`[Gemini API] Lỗi với model ${model}:`, err.message);
      }
    }

    // Nếu toàn bộ model đều không phản hồi thì dùng format trích dẫn an toàn
    return this._fallbackFormat(query, context);
  }

  /**
   * Định dạng câu trả lời trích dẫn trực tiếp từ RAG khi chưa có API key Gemini hoặc lỗi mạng
   */
  _fallbackFormat(query, context) {
    if (!context || context.includes('Không tìm thấy tài liệu căn cứ')) {
      return (
        `Chưa tìm thấy quy định phù hợp trong kho dữ liệu văn bản hiện tại để giải đáp câu hỏi:\n` +
        `"${query}"\n\n` +
        `Đồng chí vui lòng kiểm tra lại từ khóa hoặc đối chiếu trực tiếp với cấp ủy/chi bộ.`
      );
    }

    return (
      `KẾT QUẢ TRA CỨU CĂN CỨ VĂN BẢN ĐẢNG:\n\n` +
      `${context}\n` +
      `Lưu ý: Hệ thống đang trích xuất trực tiếp từ các Điều/Khoản trong kho dữ liệu Đảng.`
    );
  }
}

module.exports = new GeminiService();
