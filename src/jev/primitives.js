/**
 * Triển khai các Primitive theo đặc tả TypeSafe Jev (jev-1.13)
 * Tham khảo: https://github.com/dbreunig/building-with-jev-skill
 */

/**
 * Kiểu Choice: Phân loại một thuộc tính vào một tập các lựa chọn rời rạc.
 * @param {string} id
 * @param {object|string} instructions
 * @param {object} options Map từ key sang mô tả/examples
 */
function createChoiceQuestion(id, instructions, options) {
  return {
    id,
    primitive: 'Choice',
    instructions,
    criteria: options,
  };
}

/**
 * Kiểu Score: Chấm điểm trên một phổ giá trị được mô tả theo các cấp độ.
 * @param {string} id
 * @param {object|string} instructions
 * @param {Array<string|object>} levels Danh sách cấp bậc từ thấp đến cao
 */
function createScoreQuestion(id, instructions, levels) {
  return {
    id,
    primitive: 'Score',
    instructions,
    criteria: { levels },
  };
}

/**
 * Kiểu Noul: Đánh giá nhị phân Có/Không (True/False) với xác suất từ 0.0 đến 1.0.
 * @param {string} id
 * @param {object|string} instructions
 * @param {object} [criteria] Tùy chọn { true: {...}, false: {...} }
 */
function createNoulQuestion(id, instructions, criteria = null) {
  return {
    id,
    primitive: 'Noul',
    instructions,
    criteria: criteria || undefined,
  };
}

module.exports = {
  createChoiceQuestion,
  createScoreQuestion,
  createNoulQuestion,
};
