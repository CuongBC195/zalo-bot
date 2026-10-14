/**
 * TypeSafe Jev Client (System One Judgment Model)
 * Ràng buộc đầu vào nghiêm ngặt (Strict Scope Gatekeeper):
 * - Fast Pre-Filter chặn ngay lập tức các câu hỏi ngoài phạm vi hoặc spam
 * - Giảm tải 100% hạ tầng RAG/Database và tiết kiệm token Gemini API
 */

const config = require('../config');
const {
  buildIntentRoutingQuestion,
  buildPassageRelevanceQuestion,
  buildFaithfulnessQuestion,
} = require('./prompts');

// Danh sách từ khóa ngoài phạm vi (Out-of-Scope Blacklist)
const OUT_OF_SCOPE_KEYWORDS = [
  // Đời thường & Giải trí
  'thời tiết', 'dự báo thời tiết', 'mưa', 'nắng', 'nhiệt độ', 'độ ẩm',
  'nấu ăn', 'công thức', 'món ăn', 'phở', 'bún bò', 'cơm tấm', 'bánh mì',
  'chơi game', 'trò chơi', 'game', 'playstation', 'bài thơ', 'thơ ca',
  'tình yêu', 'tỏ tình', 'hẹn hò', 'người yêu', 'phim', 'điện ảnh', 'diễn viên',
  'nhạc', 'bài hát', 'ca sĩ', 'showbiz', 'bóng đá', 'ngoại hạng anh', 'world cup',
  'kết quả bóng đá', 'thể thao', 'gym', 'thể hình', 'du lịch', 'khách sạn', 'vé máy bay',
  // Tài chính cá nhân, đầu tư & Tiêu cực
  'giá vàng', 'xổ số', 'kết quả xổ số', 'chứng khoán', 'cổ phiếu', 'tiền ảo', 'crypto',
  'bitcoin', 'ethereum', 'vay tiền', 'tín dụng đen', 'lãi suất ngân hàng', 'cá độ',
  'đánh bạc', 'lô đề', 'bói toán', 'tử vi', 'phong thủy', 'xem bói',
  // Công nghệ, lập trình & Khoa học tự nhiên
  'lập trình', 'viết code', 'python', 'javascript', 'java', 'c++', 'html', 'css',
  'toán học', 'giải phương trình', 'vật lý', 'hóa học', 'bài tập về nhà',
  'sửa xe', 'sửa máy tính', 'iphone', 'samsung', 'điện thoại', 'laptop'
];

// Danh sách từ khóa thuộc phạm vi nghiệp vụ Đảng, Thể thức & Văn thư lưu trữ (Scope Whitelist)
const PARTY_AND_REGULATION_KEYWORDS = [
  // 1. Tổ chức & Công tác Đảng
  'đảng', 'đảng viên', 'đảng ủy', 'chi bộ', 'chi ủy', 'cấp ủy', 'đảng bộ',
  'quy định', 'điều lệ', 'nghị quyết', 'chỉ thị', 'kết luận', 'hướng dẫn',
  'kết nạp', 'kết nạp đảng', 'chính thức', 'dự bị', 'đảng viên dự bị', 'tuổi đảng',
  'sinh hoạt', 'sinh hoạt đảng', 'sinh hoạt chi bộ', 'kỷ luật', 'kiểm tra', 'giám sát',
  'trung ương', 'bộ chính trị', 'ban bí thư', 'bch trung ương', 'tổng bí thư',
  'thường trực ban bí thư', 'thường vụ', 'ban thường vụ', 'thường trực',
  'biểu quyết', 'ứng cử', 'bầu cử', 'huy hiệu', 'huy hiệu đảng', 'thẻ đảng', 'thẻ đảng viên',
  'chuyển sinh hoạt', 'sinh hoạt tạm thời', 'xóa tên', 'xóa tên đảng viên', 'khai trừ',
  '37-qđ', '207-qđ', '24-qđ', '232-qđ', '294-qđ', '208-qđ', '22-qđ', '296-qđ', '21-qđ', '212-qđ', '69-qđ', '01-hd', '06-hd/tw', '02-hd/tw', '02-hd', '01-qđ', '144-qđ', '366-qđ', '383-qđ', '45-ct', '50-ct', '12-hd', '42-hd', '33/2024', 'luật lưu trữ', 'phông lưu trữ', 'đạo đức cách mạng', 'đại hội xiv', 'những điều không được làm', '19 điều cấm',
  'đảng phí', 'thu đảng phí', 'đóng đảng phí', 'mức đóng đảng phí', 'trích giữ', '342-qđ', '03-hd',
  'đánh giá xếp loại', 'kiểm điểm cuối năm', '124-qđ', '366-qđ', 'xếp loại chất lượng', 'hoàn thành xuất sắc',
  'tiêu chuẩn đảng viên', 'người vào đảng', 'lý lịch người vào đảng', 'thẩm tra lý lịch',
  // 2. Thể thức & Kỹ thuật trình bày văn bản Đảng (HD 05-HD/VPTW ngày 27/05/2026, QĐ 399-QĐ/TW, NĐ 30/2020)
  'thể thức', 'văn bản', 'vptw', 'văn phòng trung ương', '05-hd/vptw', '399-qđ/tw', '399-qđ', '05-hd', '17-hd', '36-hd', 'trình bày văn bản',
  '25 thể loại văn bản', 'thể loại văn bản', 'chữ ký số', 'văn bản điện tử',
  'thẩm quyền ký', 'ký thay', 'ký thay mặt', 'thừa lệnh', 'thừa uỷ quyền', 'thừa ủy quyền',
  't/m', 'k/t', 't/l', 't/u', 'con dấu', 'đóng dấu', 'dấu giáp lai', 'dấu treo', 'đóng dấu treo',
  'phông chữ', 'cỡ chữ', 'kiểu chữ', 'định lề', 'lề trái', 'lề phải', 'lề trên', 'lề dưới',
  'khổ giấy', 'khổ a4', 'ký hiệu', 'số và ký hiệu', 'trích yếu', 'nơi nhận', 'thẩm quyền ban hành',
  'in nghiêng', 'in đậm', 'times new roman', 'bản sao', 'sao y', 'sao lục', 'trích sao',
  'công văn', 'tờ trình', 'thông báo', 'biên bản', 'báo cáo', 'kế hoạch', 'chương trình',
  // 3. Công tác Văn thư & Lưu trữ Đảng và Nhà nước (HD 05, HD 06, TT 02/2019/TT-BNV)
  'văn thư', 'lưu trữ', 'nộp lưu', 'hồ sơ', 'danh mục hồ sơ', 'tiêu hủy', 'hủy tài liệu',
  'thời hạn bảo quản', '05-hd', '06-hd', 'tt-bnv', 'bộ nội vụ', '02/2019', 'lưu trữ điện tử',
  'pdf/a', 'siêu dữ liệu', 'metadata', 'bảo quản tài liệu', 'chỉnh lý tài liệu', 'số hóa tài liệu',
  'nộp lưu hồ sơ', 'thu thập tài liệu', 'lưu trữ cơ quan', 'lưu trữ lịch sử',
  // 4. Hệ thống chính trị cơ sở cấp xã/phường/thị trấn
  'đảng ủy xã', 'đảng bộ xã', 'văn phòng đảng ủy', 'chuyên viên', 'thường trực đảng ủy',
  '299-qđ', 'tham mưu cấp ủy', 'lịch công tác', 'tiếp công dân', 'mặt trận tổ quốc',
  'đoàn thanh niên', 'hội phụ nữ', 'hội nông dân', 'hội cựu chiến binh', 'công đoàn cơ sở',
  'ủy ban nhân dân', 'hội đồng nhân dân',
  // Bộ từ khóa tiếng Việt không dấu bổ trợ
  'dang vien', 'du bi', 'bieu quyet', 'ket nap', 'chi bo', 'ky luat', 'dang phi', 'the thuc', 'luu tru'
];

function stripAccents(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

const NORM_PARTY_KEYWORDS = PARTY_AND_REGULATION_KEYWORDS.map(kw => stripAccents(kw));
const NORM_OUT_OF_SCOPE_KEYWORDS = OUT_OF_SCOPE_KEYWORDS.map(kw => stripAccents(kw));

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
   * Phán đoán phân loại ý định người dùng (Strict Intent Routing & Fast Pre-Filter)
   * Ràng buộc đầu vào nghiêm ngặt: Trả về out_of_scope ngay lập tức nếu không liên quan
   */
  async routeIntent(query) {
    const rawText = (query || '').trim();

    // 1. Kiểm tra chuỗi rác / spam / quá ngắn (< 3 ký tự hoặc toàn số/ký tự đặc biệt)
    if (rawText.length < 3 || /^[\d\s\W_]+$/i.test(rawText)) {
      return {
        intent: 'invalid_or_empty',
        confidence: 0.99,
        probabilities: { invalid_or_empty: 0.99, out_of_scope: 0.01 },
      };
    }

    // 2. Chạy Fast Pre-Filter cục bộ (0ms, 0đ token)
    const localGateCheck = this._evalIntent(rawText);

    // Nếu đã xác định rõ là chào hỏi, ngoài phạm vi hoặc thủ tục cụ thể thì trả về luôn
    if (localGateCheck.choice === 'greeting_or_help' || localGateCheck.choice === 'out_of_scope') {
      return {
        intent: localGateCheck.choice,
        confidence: localGateCheck.confidence,
        probabilities: localGateCheck.probabilities,
      };
    }

    // 3. Nếu cấu hình JEV API và câu hỏi hợp lệ thì có thể gọi Deep Intent Routing
    if (this.apiKey) {
      try {
        const question = buildIntentRoutingQuestion();
        const result = await this.judge({ query: rawText }, [question]);
        const answer = result[question.id] || {};
        const chosenIntent = answer.choice || localGateCheck.choice || 'out_of_scope';

        return {
          intent: chosenIntent,
          confidence: answer.confidence ?? 0.85,
          probabilities: answer.probabilities || {},
        };
      } catch (err) {
        // Fallback về kết quả Local Gatekeeper
      }
    }

    return {
      intent: localGateCheck.choice,
      confidence: localGateCheck.confidence,
      probabilities: localGateCheck.probabilities,
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
      passagesMap[pId] = `[${p.documentCode || p.documentId || ''}] ${p.documentName || ''} - Điều ${p.articleNumber || ''} (${p.title || ''}): ${p.content}`;
      questions.push(buildPassageRelevanceQuestion(pId));
    });

    const results = await this.judge(
      { query, passages: passagesMap },
      questions
    );

    return passages.filter((p, idx) => {
      const pId = `p_${idx}`;
      const res = results[buildPassageRelevanceQuestion(pId).id];
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

    const isHallucinated = (res.noul ?? 0.1) > 0.65;
    return {
      isFaithful: !isHallucinated,
      hallucinationScore: res.noul ?? 0.1,
      confidence: res.confidence ?? 0.8,
    };
  }

  // ============================================================
  // Local Evaluator & Scope Gatekeeper
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
    const normText = stripAccents(text);

    // 1. Nhận diện chào hỏi / xin hướng dẫn (/help, /start)
    if (
      /^(chào|alo|hello|hi|bạn là ai|bot là gì|\/start|\/help|hướng dẫn|chào bạn|chào ad|xin chào)$/i.test(text) ||
      /^(chao|alo|hello|hi|ban la ai|bot la gi|\/start|\/help|huong dan|chao ban|chao ad|xin chao)$/i.test(normText) ||
      ((/^(chào|alo|hello|hi|bạn là ai|bot là gì)/i.test(text) || /^(chao|alo|hello|hi|ban la ai|bot la gi)/i.test(normText)) && text.length < 40)
    ) {
      return {
        choice: 'greeting_or_help',
        confidence: 0.98,
        probabilities: { greeting_or_help: 0.98, party_regulation: 0.02 },
      };
    }

    // 2. Kiểm tra Whitelist TRƯỚC: Nếu câu hỏi chứa từ khóa nghiệp vụ Đảng, thể thức hoặc văn thư lưu trữ
    const hasValidScopeKeyword = PARTY_AND_REGULATION_KEYWORDS.some((kw, i) =>
      text.includes(kw) || normText.includes(NORM_PARTY_KEYWORDS[i])
    );

    if (hasValidScopeKeyword) {
      if (
        /(hồ sơ|thủ tục|mẫu biểu|các bước|quy trình|hướng dẫn lập|hướng dẫn viết)/i.test(text) ||
        /(ho so|thu tuc|mau bieu|cac buoc|quy trinh|huong dan lap|huong dan viet)/i.test(normText)
      ) {
        return {
          choice: 'party_procedure',
          confidence: 0.92,
          probabilities: { party_procedure: 0.92, party_regulation: 0.08 },
        };
      }
      return {
        choice: 'party_regulation',
        confidence: 0.95,
        probabilities: { party_regulation: 0.95, party_procedure: 0.05 },
      };
    }

    // 3. Chặn Blacklist: Kiểm tra từ khóa ngoài phạm vi đời thường/giải trí
    const isExplicitlyOutOfScope = OUT_OF_SCOPE_KEYWORDS.some((kw, i) =>
      text.includes(kw) || normText.includes(NORM_OUT_OF_SCOPE_KEYWORDS[i])
    );
    if (isExplicitlyOutOfScope) {
      return {
        choice: 'out_of_scope',
        confidence: 0.99,
        probabilities: { out_of_scope: 0.99, party_regulation: 0.01 },
      };
    }

    // 4. Nếu không chứa từ khóa chuyên môn nào -> BẮT BUỘC coi là OUT OF SCOPE
    return {
      choice: 'out_of_scope',
      confidence: 0.90,
      probabilities: { out_of_scope: 0.90, party_regulation: 0.10 },
    };
  }

  _normalizeText(str) {
    if (!str) return '';
    return str
      .toLowerCase()
      .replace(/đ/g, 'd')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  _evalRelevance(query = '', passage = '') {
    const normQ = this._normalizeText(query);
    const normP = this._normalizeText(passage);

    // 1. Kiểm tra nếu câu hỏi có chứa số hiệu văn bản và passage thuộc đúng văn bản có số hiệu đó
    const queryWithoutDates = query.replace(/\b\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}\b/g, ' ');
    const docNumbers = queryWithoutDates.match(/\b\d{1,3}\b/g) || [];

    for (const num of docNumbers) {
      if (parseInt(num, 10) > 1900 && parseInt(num, 10) < 2100) continue;
      const numBoundaryRegex = new RegExp('(^|[^0-9])0*' + num + '([^0-9]|$)');
      // Trích xuất mã văn bản ở đầu passage dạng [MÃ_VĂN_BẢN]
      const codeMatch = passage.match(/^\[([^\]]+)\]/);
      const docCode = codeMatch ? codeMatch[1] : '';
      if (docCode && numBoundaryRegex.test(docCode)) {
        return {
          noul: 0.95,
          confidence: 0.95,
        };
      }
    }

    // 2. So sánh từ khóa trên chuỗi đã chuẩn hóa bỏ dấu
    const qTokens = normQ.split(/\s+/).filter(w => w.length > 2);
    let matchCount = 0;
    for (const t of qTokens) {
      if (normP.includes(t)) matchCount++;
    }

    const ratio = qTokens.length > 0 ? matchCount / qTokens.length : 0;
    const noul = Math.min(1.0, Math.max(0.1, ratio * 1.2));

    return {
      noul,
      confidence: 0.8,
    };
  }

  _evalFaithfulness(context = '', answer = '') {
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
