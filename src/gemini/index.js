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
   * TẦNG 1: CHUẨN HÓA TRUY VẤN VÀ MỞ RỘNG TỪ KHÓA NGHIỆP VỤ (Ưu tiên API Key 1)
   * Chuyển hóa câu hỏi khẩu ngữ/dân dã thành thuật ngữ hành chính văn thư lưu trữ Đảng
   * @param {string} rawQuery
   * @returns {Promise<{ normalizedQuery: string, keywords: string[], searchPhrase: string }>}
   */
  async normalizeUserQuery(rawQuery = '') {
    const text = (rawQuery || '').trim();
    if (!text) {
      return { normalizedQuery: text, keywords: [], searchPhrase: text };
    }

    const activeKey = this.keyManager.getKeyForRole('normalizer') || this.apiKey;
    if (!activeKey) {
      return { normalizedQuery: text, keywords: [], searchPhrase: text };
    }

    const normalizerModels = ['gemini-flash-lite-latest', 'gemini-3.1-flash-lite', 'gemini-3.5-flash-lite'];
    const prompt = `Bạn là chuyên gia chuyển hóa truy vấn nghiệp vụ công tác Đảng, Thể thức văn bản và Văn thư - Lưu trữ.
Nhiệm vụ: Phân tích câu hỏi khẩu ngữ/dân dã của cán bộ, đảng viên và chuẩn hóa thành truy vấn nghiệp vụ chính thức để hệ thống Full-Text Search (RAG) tìm kiếm chính xác trong kho văn bản Đảng.

Quy tắc chuyển hóa:
1. "giấy mời lưu bao lâu" -> mở rộng sang: thời hạn lưu trữ bảo quản giấy mời công văn triệu tập danh sách đại biểu khách mời hồ sơ hội nghị đại hội đảng bộ cấp xã 24-HD/VPTW 06-HD/VPTW
2. "phông chữ thể thức đảng size bao nhiêu" -> mở rộng sang: thể thức và kỹ thuật trình bày văn bản Đảng phông chữ Times New Roman cỡ chữ kiểu chữ căn lề khổ giấy A4 05-HD/VPTW 399-QĐ/TW
3. "sinh hoạt chi bộ ngày mấy" -> mở rộng sang: sinh hoạt chi bộ định kỳ thời gian nguyên tắc nội dung sinh hoạt 208-QĐ/TW 02-HD/TW 42-HD/BTCTW

Chỉ trả về đúng 1 đối tượng JSON duy nhất (không bọc trong markdown block hay bất kỳ lời dẫn nào) với cấu trúc sau:
{"normalizedQuery": "câu hỏi nghiệp vụ chuẩn hóa", "keywords": ["từ khóa 1", "từ khóa 2"], "searchPhrase": "chuỗi các từ khóa chính xác nhất để full-text search"}

Câu hỏi cần chuẩn hóa: "${text}"`;

    for (const model of normalizerModels) {
      const keyToUse = this.keyManager.getKeyForRole('normalizer') || activeKey;
      try {
        const endpoint = `${this.baseUrl}/models/${model}:generateContent?key=${keyToUse}`;
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': keyToUse,
          },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 250,
            },
          }),
          signal: AbortSignal.timeout(4500),
        });

        if (response.status === 429) {
          this.keyManager.markRateLimited(keyToUse);
          continue;
        }

        if (response.ok) {
          const data = await response.json();
          let rawRes = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
          // Bóc tách JSON nếu bị bọc trong markdown ```json ... ```
          rawRes = rawRes.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
          try {
            const parsed = JSON.parse(rawRes);
            if (parsed.searchPhrase || parsed.normalizedQuery) {
              console.log(`[Normalizer-Key1] "${text}" -> searchPhrase: "${parsed.searchPhrase}" (model: ${model})`);
              return {
                normalizedQuery: parsed.normalizedQuery || text,
                keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
                searchPhrase: parsed.searchPhrase || parsed.normalizedQuery || text,
              };
            }
          } catch (_) {
            // Nếu parse JSON lỗi nhưng có chuỗi trả về
            if (rawRes.length > 5) {
              return { normalizedQuery: rawRes, keywords: [], searchPhrase: rawRes };
            }
          }
        }
      } catch (err) {
        // Thử model tiếp theo
      }
    }

    return { normalizedQuery: text, keywords: [], searchPhrase: text };
  }

  /**
   * Smart Query Rewriter (Dự phòng cho chuỗi không dấu)
   */
  async rewriteQuery(rawQuery = '') {
    const text = (rawQuery || '').trim();
    if (!text) return text;
    const res = await this.normalizeUserQuery(text);
    return res.normalizedQuery || text;
  }

  /**
   * TẦNG 2: SINH CÂU TRẢ LỜI CHUẨN XÁC DỰA TRÊN CONTEXT RAG (Ưu tiên API Key 2)
   * @param {string} query Câu hỏi người dùng
   * @param {string} context Ngữ cảnh văn bản Đảng trích xuất từ RAG
   * @returns {Promise<string>}
   */
  async generateAnswer(query, context) {
    const initialKey = this.keyManager.getKeyForRole('generator') || this.apiKey;
    if (!initialKey) {
      return this._fallbackFormat(query, context);
    }

    // Danh sách model ưu tiên (phản hồi cực nhanh < 2s, dự phòng đa tầng ổn định 100%)
    const modelCandidates = Array.from(new Set([
      'gemini-flash-lite-latest',
      'gemini-3.1-flash-lite',
      'gemini-3.5-flash-lite',
      this.primaryModel,
      'gemini-flash-latest',
    ]));

    const userPrompt = buildPrompt(query, context);

    for (const model of modelCandidates) {
      const activeKey = this.keyManager.getKeyForRole('generator') || initialKey;
      try {
        const endpoint = `${this.baseUrl}/models/${model}:generateContent?key=${activeKey}`;
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': activeKey,
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

        if (response.status === 429) {
          this.keyManager.markRateLimited(activeKey);
          continue;
        }

        if (response.ok) {
          const data = await response.json();
          const answer = data?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (answer && answer.trim()) {
            const cleanAnswer = answer.replace(/[\p{Extended_Pictographic}\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').trim();
            return cleanAnswer;
          }
        } else {
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
