/**
 * Module quản lý API Key Gemini xoay vòng và dự phòng (Auto Failover)
 * Hỗ trợ Round-Robin qua nhiều tài khoản Google AI Studio độc lập
 * Tự động phạt (Cooldown 60s) key bị dính lỗi 429 Too Many Requests
 */

class GeminiKeyManager {
  constructor() {
    this.rewriteKey = (process.env.GEMINI_REWRITE_API_KEY || '').trim();
    this.generateKey = (process.env.GEMINI_GENERATE_API_KEY || '').trim();

    const keysEnv = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '';
    const rawKeys = keysEnv.split(',').map(k => k.trim()).filter(Boolean);

    // Tập hợp toàn bộ các key độc lập không trùng nhau
    const allUnique = new Set();
    if (this.rewriteKey) allUnique.add(this.rewriteKey);
    if (this.generateKey) allUnique.add(this.generateKey);
    for (const k of rawKeys) allUnique.add(k);

    this.keys = Array.from(allUnique);
    this.currentIndex = 0;
    this.cooldowns = new Map(); // key -> timestamp hết hạn phạt
  }

  /**
   * Lấy API key khả dụng tiếp theo theo vòng tròn (Round-Robin)
   * Bỏ qua các key đang trong thời gian cooldown
   */
  getKey() {
    if (!this.keys.length) return '';
    const now = Date.now();

    for (let i = 0; i < this.keys.length; i++) {
      const idx = (this.currentIndex + i) % this.keys.length;
      const key = this.keys[idx];
      const cooldownUntil = this.cooldowns.get(key) || 0;

      if (now > cooldownUntil) {
        this.currentIndex = (idx + 1) % this.keys.length;
        return key;
      }
    }

    // Nếu tất cả key đều đang bị phạt, trả về key đầu tiên
    return this.keys[0];
  }

  /**
   * Lấy API key chuyên biệt theo vai trò kiến trúc 2 tầng:
   * - 'normalizer': Tầng 1 chuẩn hóa câu hỏi & mở rộng từ khóa (ưu tiên GEMINI_REWRITE_API_KEY)
   * - 'generator': Tầng 2 sinh câu trả lời căn cứ văn bản Đảng (ưu tiên GEMINI_GENERATE_API_KEY)
   * Tự động mượn chéo (Failover) nếu một trong hai key bị 429 hoặc cooldown
   */
  getKeyForRole(role = 'generator') {
    if (!this.keys.length) return '';
    const now = Date.now();

    const primaryKey = role === 'normalizer'
      ? (this.rewriteKey || this.keys[0])
      : (this.generateKey || this.keys[1] || this.keys[0]);

    const secondaryKey = role === 'normalizer'
      ? (this.generateKey || this.keys[1] || this.keys[0])
      : (this.rewriteKey || this.keys[0]);

    // 1. Kiểm tra key ưu tiên của role
    if (primaryKey && now > (this.cooldowns.get(primaryKey) || 0)) {
      return primaryKey;
    }

    // 2. Tự động mượn chéo key của role còn lại nếu key ưu tiên bị 429/cooldown
    if (secondaryKey && secondaryKey !== primaryKey && now > (this.cooldowns.get(secondaryKey) || 0)) {
      console.warn(`[KeyManager] Key chính của role "${role}" đang cooldown, tự động mượn chéo key dự phòng.`);
      return secondaryKey;
    }

    // 3. Fallback sang danh sách key xoay vòng bất kỳ khả dụng
    return this.getKey();
  }

  /**
   * Đánh dấu key bị lỗi 429 hoặc lỗi hạn mức, tạm ngưng dùng trong cooldownMs
   */
  markRateLimited(key, cooldownMs = 60000) {
    if (!key) return;
    const keyPreview = key.length > 10 ? `${key.slice(0, 6)}...${key.slice(-4)}` : '***';
    console.warn(`[KeyManager] Key ${keyPreview} bị 429/Hạn mức, tạm ngưng sử dụng ${Math.round(cooldownMs / 1000)} giây.`);
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
