/**
 * Module quản lý API Key Gemini xoay vòng và dự phòng (Auto Failover)
 * Hỗ trợ Round-Robin qua nhiều tài khoản Google AI Studio độc lập
 * Tự động phạt (Cooldown 60s) key bị dính lỗi 429 Too Many Requests
 */

class GeminiKeyManager {
  constructor() {
    const keysEnv = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '';
    this.keys = keysEnv.split(',').map(k => k.trim()).filter(Boolean);
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
