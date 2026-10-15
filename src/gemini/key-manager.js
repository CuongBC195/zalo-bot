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
   * Lấy API key chuyên biệt theo vai trò kiến trúc 2 tầng:
   * - 'normalizer': Tầng 1 chuẩn hóa câu hỏi và trích xuất từ khóa nghiệp vụ (ưu tiên Key 1)
   * - 'generator': Tầng 2 sinh câu trả lời căn cứ chính xác văn bản Đảng (ưu tiên Key 2)
   * Tự động failover qua lại nếu một key bị hạn mức hoặc cooldown
   */
  getKeyForRole(role = 'generator') {
    if (!this.keys.length) return '';
    if (this.keys.length === 1) return this.getKey();

    const now = Date.now();
    const primaryIdx = role === 'normalizer' ? 0 : 1;
    const secondaryIdx = role === 'normalizer' ? 1 : 0;

    const primaryKey = this.keys[primaryIdx];
    const primaryCooldown = this.cooldowns.get(primaryKey) || 0;

    if (now > primaryCooldown) {
      return primaryKey;
    }

    // Nếu key ưu tiên bị cooldown, dùng key dự phòng
    const secondaryKey = this.keys[secondaryIdx];
    const secondaryCooldown = this.cooldowns.get(secondaryKey) || 0;
    if (now > secondaryCooldown) {
      console.log(`[KeyManager] Key vai trò ${role} đang cooldown, tự động chuyển đổi sang key dự phòng.`);
      return secondaryKey;
    }

    // Nếu cả hai đều cooldown, quay về lấy bất kỳ key nào khả dụng
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
