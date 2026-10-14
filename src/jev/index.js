/**
 * TypeSafe Jev Client (System One Judgment Model)
 * Hỗ trợ gọi API TypeSafe Jev và bộ Local Evaluator Fallback
 */

const config = require('../config');
const {
  buildIntentRoutingQuestion,
  buildPassageRelevanceQuestion,
  buildFaithfulnessQuestion,
} = require('./prompts');

class JevService {
  constructor() {
    this.apiKey = config.jev.apiKey;
    this.baseUrl = config.jev.baseUrl;
    this.model = config.jev.model;
    this.enableFallback = config.jev.enableLocalFallback;
  }

  /**
   * Gọi phán đoán từ Jev với state và danh sách questions
   * @param {object} state Dữ liệu ngữ cảnh
   * @param {Array<object>} questions Danh sách câu hỏi Choice/Score/Noul
   * @returns {Promise<object>} Map kết quả theo question id
   */
  async judge(state, questions) {
    if (this.apiKey) {
      try {
        const response = await fetch(`${this.baseUrl}/judge`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: this.model,
            state,
            questions,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          return data.results || data;
        }

        console.warn(`[Jev API] Lỗi HTTP ${response.status}, kích hoạt local evaluator fallback.`);
      } catch (err) {
        console.warn('[Jev API] Lỗi kết nối:', err.message);
      }
    }

    if (this.enableFallback) {
      return this._localEvaluate(state, questions);
    }

    throw new Error('JEV_API_KEY chưa được cấu hình và chế độ local fallback bị tắt.');
  }

  /**
   * Phán đoán phân loại ý định người dùng (Intent Routing)
   */
  async routeIntent(query) {
    const question = buildIntentRoutingQuestion();
    const result = await this.judge({ query }, [question]);
    const answer = result[question.id] || {};

    return {
      intent: answer.choice || 'party_regulation',
      confidence: answer.confidence ?? 0.85,
      probabilities: answer.probabilities || {},
    };
  }

  /**
   * Lọc và chấm điểm mức độ phù hợp của các đoạn trích (RAG Relevance Filter)
   */
  async filterRelevantPassages(query, passages) {
    if (!passages || !passages.length) return [];

    const passagesMap = {};
    const questions = [];

    passages.forEach((p, idx) => {
      const pId = `p_${idx}`;
      passagesMap[pId] = `${p.documentName || ''} - Điều ${p.articleNumber || ''}: ${p.content}`;
      questions.push(buildPassageRelevanceQuestion(pId));
    });

    const results = await this.judge(
      { query, passages: passagesMap },
      questions
    );

    return passages.filter((p, idx) => {
      const pId = `p_${idx}`;
      const res = results[buildPassageRelevanceQuestion(pId).id];
      // Nếu Noul >= 0.45 thì giữ lại đoạn trích
      const noulScore = res?.noul ?? 0.6;
      return noulScore >= 0.45;
    });
  }

  /**
   * Guardrail: Kiểm tra xem câu trả lời có bịa đặt quy định không
   */
  async checkFaithfulness(context, answer) {
    const question = buildFaithfulnessQuestion();
    const result = await this.judge({ context, answer }, [question]);
    const res = result[question.id] || {};

    // is_hallucinated: nếu noul cao nghĩa là có nguy cơ bịa đặt
    const isHallucinated = (res.noul ?? 0.1) > 0.65;
    return {
      isFaithful: !isHallucinated,
      hallucinationScore: res.noul ?? 0.1,
      confidence: res.confidence ?? 0.8,
    };
  }

  // ============================================================
  // Local Evaluator Fallback (Mô phỏng phán đoán System One)
  // ============================================================
  _localEvaluate(state, questions) {
    const results = {};

    for (const q of questions) {
      if (q.primitive === 'Choice' && q.id === 'user_intent') {
        results[q.id] = this._evalIntent(state.query);
      } else if (q.primitive === 'Noul' && q.id.startsWith('relevance_')) {
        const pId = q.id.replace('relevance_', '');
        const passage = state.passages?.[pId] || '';
        results[q.id] = this._evalRelevance(state.query, passage);
      } else if (q.primitive === 'Noul' && q.id === 'is_hallucinated') {
        results[q.id] = this._evalFaithfulness(state.context, state.answer);
      } else {
        results[q.id] = { confidence: 0.5 };
      }
    }

    return results;
  }

  _evalIntent(query = '') {
    const text = query.toLowerCase().trim();

    // Chào hỏi / Help
    if (
      /^(chào|alo|hello|hi|bạn là ai|bot là gì|\/start|\/help|hướng dẫn)/i.test(text) &&
      text.length < 50
    ) {
      return {
        choice: 'greeting_or_help',
        confidence: 0.95,
        probabilities: { greeting_or_help: 0.95, party_regulation: 0.05 },
      };
    }

    // Thủ tục / Quy trình
    if (/(hồ sơ|thủ tục|mẫu biểu|các bước|quy trình|hướng dẫn lập)/i.test(text)) {
      return {
        choice: 'party_procedure',
        confidence: 0.88,
        probabilities: { party_procedure: 0.88, party_regulation: 0.12 },
      };
    }

    // Từ khóa Đảng, Thể thức & Văn thư lưu trữ
    const partyKeywords = [
      'đảng', 'đảng viên', 'chi bộ', 'đảng ủy', 'quy định', 'điều lệ', 'nghị quyết',
      'kết nạp', 'chính thức', 'dự bị', 'tuổi đảng', 'sinh hoạt', 'kỷ luật', 'kiểm tra',
      'giám sát', 'chi ủy', 'cấp ủy', 'trung ương', 'bộ chính trị', 'ban bí thư',
      '37-qđ', '24-qđ', '22-qđ', '69-qđ', '01-hd', 'những điều không được làm',
      // Thể thức & Kỹ thuật trình bày văn bản Đảng (HD 17-HD/VPTW)
      'thể thức', 'văn bản', 'vptw', 'văn phòng trung ương', '17-hd', 'trình bày văn bản',
      'thẩm quyền ký', 'ký thay', 'ký thay mặt', 'thừa lệnh', 'thừa uỷ quyền', 'thừa ủy quyền',
      't/m', 'k/t', 't/l', 't/u', 'con dấu', 'đóng dấu', 'phông chữ', 'cỡ chữ', 'định lề', 'ký hiệu',
      // Văn thư & Lưu trữ Đảng và Nhà nước (HD 05, HD 06, TT 02/2019/TT-BNV)
      'văn thư', 'lưu trữ', 'nộp lưu', 'hồ sơ', 'danh mục hồ sơ', 'tiêu hủy', 'hủy tài liệu',
      'thời hạn bảo quản', '05-hd', '06-hd', 'tt-bnv', 'bộ nội vụ', '02/2019', 'lưu trữ điện tử',
      'pdf/a', 'siêu dữ liệu', 'metadata', 'bảo quản tài liệu'
    ];

    const hasPartyKw = partyKeywords.some(kw => text.includes(kw));

    if (hasPartyKw) {
      return {
        choice: 'party_regulation',
        confidence: 0.94,
        probabilities: { party_regulation: 0.94, party_procedure: 0.06 },
      };
    }

    // Ngoài phạm vi
    const outOfScopeKw = [
      'thời tiết', 'mưa', 'nắng', 'nhiệt độ', 'nấu ăn', 'chơi game', 'bài thơ',
      'tình yêu', 'phim', 'nhạc', 'bóng đá', 'giá vàng', 'xổ số', 'chứng khoán',
      'lập trình', 'code', 'toán', 'vật lý', 'hóa học'
    ];
    if (outOfScopeKw.some(kw => text.includes(kw))) {
      return {
        choice: 'out_of_scope',
        confidence: 0.95,
        probabilities: { out_of_scope: 0.95, party_regulation: 0.05 },
      };
    }

    // Nếu không có bất kỳ từ khóa nào liên quan đến Đảng hoặc chính trị
    return {
      choice: 'out_of_scope',
      confidence: 0.75,
      probabilities: { out_of_scope: 0.75, party_regulation: 0.25 },
    };
  }

  _evalRelevance(query = '', passage = '') {
    const qTokens = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const pText = passage.toLowerCase();

    let matchCount = 0;
    for (const t of qTokens) {
      if (pText.includes(t)) matchCount++;
    }

    const ratio = qTokens.length > 0 ? matchCount / qTokens.length : 0;
    const noul = Math.min(1.0, Math.max(0.1, ratio * 1.2));

    return {
      noul,
      confidence: 0.8,
    };
  }

  _evalFaithfulness(context = '', answer = '') {
    // Nếu trong answer nhắc tới số quy định mà context không hề có
    const answerRegs = answer.match(/\b\d{1,3}-(?:QĐ|HD|CT|KL)\/[A-Z0-9]+\b/gi) || [];
    let hallucinated = false;

    for (const reg of answerRegs) {
      if (!context.includes(reg)) {
        hallucinated = true;
        break;
      }
    }

    return {
      noul: hallucinated ? 0.85 : 0.1,
      confidence: 0.85,
    };
  }
}

module.exports = new JevService();
