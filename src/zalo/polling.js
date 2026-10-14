/**
 * Zalo Polling Engine
 * Lắng nghe tin nhắn tuần tự và điều phối qua Pipeline AI
 */

const config = require('../config');
const pipeline = require('../pipeline');
const db = require('../db');
const { handleZaloUpdate } = require('./handler');

class PollingEngine {
  constructor(api) {
    this.api = api;
    this.isRunning = false;
    this.seenMessageIds = new Set();
  }

  async start() {
    this.isRunning = true;
    await pipeline.init();
    console.log('🚀 Zalo Polling Engine đã bắt đầu...');
    this._pollLoop();
  }

  stop() {
    this.isRunning = false;
    console.log('🛑 Đã nhận lệnh dừng Polling Engine.');
  }

  async _pollLoop() {
    while (this.isRunning) {
      try {
        const data = await this.api.getUpdates();
        const updates = this._normalizeUpdates(data?.result);

        if (updates.length) {
          console.log(`[Polling] Nhận được ${updates.length} cập nhật mới từ Zalo`);

          for (const update of updates) {
            const updateId = this._buildUpdateId(update);
            if (this.seenMessageIds.has(updateId)) continue;
            this.seenMessageIds.add(updateId);

            // Giữ kích thước cache tối đa 500 ID
            if (this.seenMessageIds.size > 500) {
              const firstKey = this.seenMessageIds.values().next().value;
              this.seenMessageIds.delete(firstKey);
            }

            await this._handleUpdate(update).catch(err => {
              console.error('[Polling] Lỗi xử lý update:', err.message);
            });
          }
        }
      } catch (err) {
        if (!err.message?.includes('timeout')) {
          console.error('[Polling] Lỗi trong vòng lặp polling:', err.message);
        }
        await this._sleep(config.zalo.pollingIntervalMs);
      }
    }
  }

  async _handleUpdate(update) {
    return handleZaloUpdate(this.api, update);
  }

  _normalizeUpdates(result) {
    if (!result) return [];
    if (Array.isArray(result)) return result;
    if (typeof result === 'object') return [result];
    return [];
  }

  _buildUpdateId(update) {
    const message = update?.message || update?.data?.message || {};
    return String(
      update?.update_id ||
      message.message_id ||
      `${update?.event_name || 'update'}:${message.chat?.id || ''}:${message.from?.id || ''}:${message.date || Date.now()}`
    );
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = PollingEngine;
