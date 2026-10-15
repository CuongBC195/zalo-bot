/**
 * Gemini Client (System Two - Generation Engine & System 1.5 - Query Rewriter)
 * Kiến trúc Dual-Key Cross-Borrowing:
 * - Tầng 1 (rewriteQuery): Dùng GEMINI_REWRITE_API_KEY, timeout 2.5s, fail-open về RAM 0ms.
 * - Tầng 2 (generateAnswer): Dùng GEMINI_GENERATE_API_KEY, sinh câu trả lời chuẩn hành chính Đảng.
 * - Tự động mượn key chéo (Cross-Borrowing) khi gặp mã lỗi HTTP 429 Too Many Requests.
 */

const dns = require('node:dns');
try {
  dns.setDefaultResultOrder('ipv4first');
} catch (_) {}

const config = require('../config');
const { SYSTEM_INSTRUCTION, buildPrompt } = require('./prompts');
const keyManager = require('./key-manager');

class GeminiService {
  constructor() {
    this.keyManager = keyManager;
    this.primaryModel = config.gemini.model || 'gemini-3.1-flash-lite';
    this.baseUrl = config.gemini.baseUrl;
  }

  get apiKey() {
    return this.keyManager.getKey() || config.gemini.apiKey;
  }

  /**
   * TẦNG 1: CHUẨN HÓA CÂU HỎI & MỞ RỘNG TỪ KHÓA CHUYÊN MÔN (API Key 1 & Cross-Borrowing)
   * Chuẩn hóa chính tả, thêm dấu tiếng Việt, bung viết tắt và nối thêm 2-4 từ khóa pháp lý
   * @param {string} rawQuery Câu hỏi gốc của người dùng
   * @param {string} expandedLocal Câu hỏi đã bung viết tắt cục bộ
   * @returns {Promise<string>} Câu hỏi đã được chuẩn hóa và mở rộng từ khóa
   */
  async rewriteQuery(rawQuery = '', expandedLocal = '') {
    const originalText = (expandedLocal || rawQuery || '').trim();
    if (!originalText) return '';

    let activeKey = this.keyManager.getKeyForRole('rewrite');
    if (!activeKey) {
      return originalText;
    }

    const timeoutMs = config.gemini.rewriteTimeoutMs || 2500;
    const model = 'gemini-3.1-flash-lite';
    const prompt = (
      `Nhiệm vụ: Chuẩn hóa câu hỏi tra cứu quy định Đảng & Văn thư lưu trữ sau đây thành 1 câu tiếng Việt có dấu chuẩn mực, ` +
      `đồng thời nối thêm tối đa 3 từ khóa pháp lý đồng nghĩa sát nhất ở cuối câu để hỗ trợ tìm kiếm toàn văn. ` +
      `Giữ nguyên 100% mọi con số, ngày tháng và ký hiệu văn bản (như 05-HD/VPTW, 24-HD/VPTW, 208-QĐ/TW, T/M, K/T). ` +
      `Chỉ trả về đúng chuỗi kết quả trên 1 dòng, tuyệt đối không giải thích:\n` +
      `Câu gốc: "${originalText}"`
    );

    const callApi = async (key) => {
      const endpoint = `${this.baseUrl}/models/${model}:generateContent?key=${key}`;
      return await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': key,
        },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 100,
          },
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    };

    try {
      let response = await callApi(activeKey);

      // Tự động mượn Key 2 nếu Key 1 chạm Rate Limit 429
      if (response.status === 429) {
        this.keyManager.markRateLimited(activeKey);
        const backupKey = this.keyManager.getKeyForRole('rewrite', activeKey);
        if (backupKey && backupKey !== activeKey) {
          console.warn(`[Gemini Key 1] Chạm 429, mượn chéo Key 2 để hoàn thành Rewrite...`);
          response = await callApi(backupKey);
        }
      }

      if (response && response.ok) {
        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
        if (text) {
          const cleaned = text.replace(/[\r\n]+/g, ' ').replace(/^["']|["']$/g, '').trim();
          console.log(`[Gemini Key 1] Rewrite thành công: "${cleaned}"`);
          return cleaned;
        }
      }
    } catch (err) {
      // Fail-open về RAM 0ms: Nếu timeout 2.5s hoặc lỗi mạng, trả về chuỗi gốc mà không làm gián đoạn
      console.warn(`[Gemini Key 1] Fail-open (timeout/lỗi mạng): ${err.message}. Dùng câu gốc để tiếp tục RAG.`);
    }

    return originalText;
  }

  /**
   * Tương thích ngược với module normalizeUserQuery
   */
  async normalizeUserQuery(rawQuery = '') {
    const text = (rawQuery || '').trim();
    const rewritten = await this.rewriteQuery(text, text);
    return {
      normalizedQuery: rewritten,
      keywords: [],
      searchPhrase: rewritten,
    };
  }

  /**
   * TẦNG 2: TỔNG HỢP CÂU TRẢ LỜI CHUẨN XÁC DỰA TRÊN CONTEXT RAG (API Key 2 & Cross-Borrowing)
   * @param {string} query Câu hỏi người dùng
   * @param {string} context Ngữ cảnh văn bản Đảng trích xuất từ RAG
   * @returns {Promise<string>}
   */
  async generateAnswer(query, context) {
    let initialKey = this.keyManager.getKeyForRole('generate') || this.apiKey;
    if (!initialKey) {
      return this._fallbackFormat(query, context);
    }

    const modelCandidates = Array.from(new Set([
      'gemini-flash-lite-latest',
      'gemini-3.1-flash-lite',
      'gemini-3.5-flash-lite',
      this.primaryModel,
      'gemini-flash-latest',
    ]));

    const userPrompt = buildPrompt(query, context);

    for (const model of modelCandidates) {
      let activeKey = this.keyManager.getKeyForRole('generate') || initialKey;
      
      const executeRequest = async (key) => {
        const endpoint = `${this.baseUrl}/models/${model}:generateContent?key=${key}`;
        return await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': key,
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
          signal: AbortSignal.timeout(12000),
        });
      };

      try {
        let response = await executeRequest(activeKey);

        // Xử lý 429: Phạt key và lập tức thử lại bằng key mượn chéo trước khi đổi sang model khác
        if (response.status === 429) {
          this.keyManager.markRateLimited(activeKey);
          const borrowedKey = this.keyManager.getKeyForRole('generate', activeKey);
          if (borrowedKey && borrowedKey !== activeKey) {
            console.warn(`[Gemini Key 2] Chạm 429 tại model ${model}, mượn chéo key dự phòng...`);
            activeKey = borrowedKey;
            response = await executeRequest(activeKey);
          }
        }

        if (response && response.ok) {
          const data = await response.json();
          const answer = data?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (answer && answer.trim()) {
            // Lọc bỏ Emoji để giữ tính trang nghiêm hành chính Đảng
            const cleanAnswer = answer.replace(/[\p{Extended_Pictographic}\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').trim();
            return cleanAnswer;
          }
        } else {
          console.warn(`[Gemini Key 2] Model ${model} trả về mã ${response.status}, thử phương án tiếp theo...`);
        }
      } catch (err) {
        console.warn(`[Gemini Key 2] Lỗi với model ${model}:`, err.message);
      }
    }

    // Nếu toàn bộ model/key đều không phản hồi thì dùng format trích dẫn an toàn
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
