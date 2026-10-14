/**
 * Các bộ câu hỏi Jev chuẩn hóa cho nghiệp vụ tra cứu văn bản Đảng
 */

const { createChoiceQuestion, createNoulQuestion } = require('./primitives');

/**
 * Câu hỏi Choice: Phân loại ý định của người dùng (Intent Routing)
 */
function buildIntentRoutingQuestion() {
  return createChoiceQuestion(
    'user_intent',
    {
      question: 'Xác định mục đích chính của câu hỏi trong ngữ cảnh tra cứu công tác Đảng.',
      inspect: 'query',
      focus: 'Phân biệt giữa câu hỏi nghiệp vụ Đảng, lời chào/hỏi cách dùng, và nội dung ngoài phạm vi.',
    },
    {
      party_regulation: {
        what: 'Hỏi về quy định, điều lệ, chỉ thị, kết luận, nghị quyết, tiêu chuẩn, nguyên tắc, quyền hạn hoặc điều cấm của Đảng.',
        examples: [
          'Đảng viên dự bị có được biểu quyết không?',
          'Quy định 37 về những điều đảng viên không được làm gồm những gì?',
          'Thời hạn xét công nhận đảng viên chính thức là bao lâu?',
          'Chi bộ sinh hoạt mấy lần một tháng?',
          'Tuổi đời kết nạp đảng quy định thế nào?',
        ],
      },
      party_procedure: {
        what: 'Hỏi về hồ sơ, thủ tục, biểu mẫu, các bước tiến hành công tác đảng (kết nạp, chuyển sinh hoạt, khen thưởng, kỷ luật).',
        examples: [
          'Hồ sơ kết nạp đảng viên gồm những giấy tờ gì?',
          'Thủ tục chuyển sinh hoạt đảng tạm thời làm thế nào?',
          'Mẫu lý lịch người vào Đảng ghi như thế nào?',
        ],
      },
      greeting_or_help: {
        what: 'Chào hỏi, hỏi thông tin giới thiệu về bot, hoặc xin hướng dẫn tra cứu.',
        examples: [
          'Chào bot',
          'Bạn là ai?',
          'Hướng dẫn tôi sử dụng bot',
          '/help',
          '/start',
        ],
      },
      out_of_scope: {
        what: 'Nội dung giải trí, thời tiết, lập trình, toán học, hoặc câu hỏi hoàn toàn không liên quan đến công tác Đảng.',
        examples: [
          'Hôm nay thời tiết thế nào?',
          'Viết giúp tôi bài thơ',
          'Chỉ tôi cách nấu ăn',
          'Giá vàng hôm nay bao nhiêu?',
        ],
      },
    }
  );
}

/**
 * Câu hỏi Noul: Đánh giá một đoạn trích có thực sự chứa quy định trả lời câu hỏi không (Passage Relevance)
 */
function buildPassageRelevanceQuestion(passageId) {
  return createNoulQuestion(
    `relevance_${passageId}`,
    {
      question: `Đoạn trích [${passageId}] có chứa căn cứ quy định trực tiếp liên quan đến câu hỏi không?`,
      inspect: ['query', `passages.${passageId}`],
      focus: 'Xác định xem đoạn văn bản trích dẫn có giải đáp hoặc cung cấp căn cứ cho câu hỏi của người dùng hay không.',
    },
    {
      true: {
        what: 'Đoạn trích chứa thông tin, điều khoản trực tiếp điều chỉnh hoặc giải thích cho câu hỏi.',
      },
      false: {
        what: 'Đoạn trích chỉ nhắc đến từ khóa chung chung nhưng nói về vấn đề khác hoặc không giải đáp câu hỏi.',
      },
    }
  );
}

/**
 * Câu hỏi Noul: Kiểm tra tính trung thực của câu trả lời so với ngữ cảnh (Faithfulness Guardrail)
 */
function buildFaithfulnessQuestion() {
  return createNoulQuestion(
    'is_hallucinated',
    {
      question: 'Câu trả lời có khẳng định điều khoản hoặc quy định nào KHÔNG có trong tài liệu trích dẫn không?',
      inspect: ['context', 'answer'],
      focus: 'Phát hiện câu trả lời tự bịa đặt số hiệu văn bản, điều khoản hoặc quy định không có trong ngữ cảnh căn cứ.',
    },
    {
      true: {
        what: 'Câu trả lời chứa thông tin hoặc số hiệu văn bản không được hỗ trợ bởi tài liệu trích dẫn.',
      },
      false: {
        what: 'Mọi luận điểm và trích dẫn trong câu trả lời đều bám sát đúng tài liệu cung cấp.',
      },
    }
  );
}

module.exports = {
  buildIntentRoutingQuestion,
  buildPassageRelevanceQuestion,
  buildFaithfulnessQuestion,
};
