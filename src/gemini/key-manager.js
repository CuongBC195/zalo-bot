/**
 * Module quản lý API Key Gemini xoay vòng và phân vai (Role-Based & Cross-Borrowing)
 * Tự động mượn key chéo giữa Tầng 1 (Rewrite) và Tầng 2 (Generate) khi chạm Rate Limit 429
 * Quản lý bộ đếm phạt Cooldown 60.000ms
 */

class GeminiKeyManager {
  constructor() {
    this.rewriteKey = (process.env.GEMINI_REWRITE_API_KEY || '').trim();
    this.generateKey = (process.env.GEMINI_GENERATE_API_KEY || '').trim();

    const fallbackEnv = process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEYS || '';
    const fallbackList = fallbackEnv.split(',').map(k => k.trim()).filter(Boolean);
    this.fallbackKey = fallbackList[0] || '';
    this.extraFallbacks = fallbackList.slice(1);

    // Danh sách toàn bộ các key độc lập không trùng rỗng
    const allUnique = new Set();
    if (this.rewriteKey) allUnique.add(this.rewriteKey);
    if (this.generateKey) allUnique.add(this.generateKey);
    if (this.fallbackKey) allUnique.add(this.fallbackKey);
    for (const k of this.extraFallbacks) allUnique.add(k);

    this.keys = Array.from(allUnique);
    this.currentIndex = 0;
    this.cooldowns = new Map(); // key -> timestamp hết hạn phạt (ms)
  }

  /**
   * Lấy API key khả dụng chuyên biệt theo phân vai (Role-Based) & Mượn key chéo (Cross-Borrowing)
   * @param {'rewrite' | 'generate' | 'normalizer' | 'generator'} role Vai trò yêu cầu
   * @param {string|null} excludeKey Key cần loại trừ (ví dụ key vừa bị lỗi 429)
   * @returns {string} API key khỏe mạnh nhất
   */
  getKeyForRole(role = 'generate', excludeKey = null) {
    if (!this.keys.length) return '';
    const now = Date.now();

    const isRewrite = role === 'rewrite' || role === 'normalizer';
    
    // Thứ tự ưu tiên theo phân vai
    const candidateList = isRewrite
      ? [this.rewriteKey, this.fallbackKey, ...this.extraFallbacks, this.generateKey]
      : [this.generateKey, this.fallbackKey, ...this.extraFallbacks, this.rewriteKey];

    // Lọc bỏ key rỗng và khử trùng lặp có thứ tự
    const seen = new Set();
    const orderedKeys = [];
    for (const k of candidateList) {
      if (k && !seen.has(k)) {
        seen.add(k);
        orderedKeys.push(k);
      }
    }

    // 1. Tìm key đầu tiên không bị loại trừ và không nằm trong thời gian phạt cooldown
    for (const key of orderedKeys) {
      if (excludeKey && key === excludeKey) continue;
      const cooldownUntil = this.cooldowns.get(key) || 0;
      if (now > cooldownUntil) {
        return key;
      }
    }

    // 2. Nếu mọi key đều đang trong thời gian cooldown, ưu tiên key khác excludeKey
    for (const key of orderedKeys) {
      if (excludeKey && key === excludeKey) continue;
      return key;
    }

    // 3. Fallback cuối cùng: Trả về key chính của role
    const primaryKey = isRewrite ? (this.rewriteKey || this.keys[0]) : (this.generateKey || this.keys[0]);
    return primaryKey || this.keys[0] || '';
  }

  /**
   * Lấy API key mặc định (tương thích ngược 100% với getKey() cũ)
   */
  getKey() {
    return this.getKeyForRole('generate');
  }

  /**
   * Đánh dấu key bị lỗi HTTP 429 hoặc lỗi hạn mức, tạm ngưng dùng trong cooldownMs (mặc định 60.000ms)
   * @param {string} key API key cần phạt
   * @param {number} cooldownMs Thời gian phạt (ms)
   */
  markRateLimited(key, cooldownMs = 60000) {
    if (!key) return;
    const keyPreview = key.length > 10 ? `${key.slice(0, 6)}...${key.slice(-4)}` : '***';
    console.warn(`[KeyManager] Key ${keyPreview} chạm Rate Limit 429, tạm ngưng sử dụng ${Math.round(cooldownMs / 1000)}s.`);
    this.cooldowns.set(key, Date.now() + cooldownMs);
  }

  /**
   * Lấy toàn bộ danh sách key để dự phòng
   */
  getAllKeys() {
    return [...this.keys];
  }

  get keyCount() {
    return this.keys.length;
  }
}

module.exports = new GeminiKeyManager();
