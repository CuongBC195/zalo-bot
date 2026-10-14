/**
 * Zalo Bot API Client Adapter
 */

const ZaloBot = require('node-zalo-bot');
const config = require('../config');

const MESSAGE_CHUNK_SIZE = 1800;

class ZaloAPI {
  constructor(token = config.zalo.token) {
    this.token = token;
    this.bot = new ZaloBot(token, {
      polling: false,
      baseApiUrl: config.zalo.baseUrl,
    });
  }

  async getMe() {
    try {
      const result = await this.bot.getMe();
      return { ok: true, result };
    } catch (err) {
      this._logError('getMe', err);
      return null;
    }
  }

  async getUpdates() {
    try {
      const timeout = config.zalo.longPollTimeoutSeconds;
      const result = await this.bot.getUpdates({ timeout });
      return { ok: true, result };
    } catch (err) {
      if (this._isNoUpdateError(err)) {
        return { ok: true, result: [] };
      }
      this._logError('getUpdates', err);
      return null;
    }
  }

  async sendMessage(chatId, text) {
    const chunks = this._splitText(text);
    let lastResult = null;

    for (const chunk of chunks) {
      lastResult = await this._sendMessageChunk(chatId, chunk);
    }

    return lastResult;
  }

  async _sendMessageChunk(chatId, text) {
    try {
      const result = await this.bot.sendMessage(String(chatId), text);
      return { ok: true, result };
    } catch (err) {
      this._logError('sendMessage', err);
      return null;
    }
  }

  async deleteWebhook() {
    try {
      const result = await this.bot.deleteWebHook();
      return { ok: true, result };
    } catch (err) {
      if (this._isWebhookOptionalError(err)) {
        return { ok: false, ignored: true, description: 'deleteWebhook endpoint skipped' };
      }
      this._logError('deleteWebhook', err);
      return null;
    }
  }

  _splitText(text) {
    const value = String(text || '');
    if (value.length <= MESSAGE_CHUNK_SIZE) return [value];

    const chunks = [];
    let remaining = value;

    while (remaining.length > MESSAGE_CHUNK_SIZE) {
      let splitAt = remaining.lastIndexOf('\n', MESSAGE_CHUNK_SIZE);
      if (splitAt < MESSAGE_CHUNK_SIZE * 0.6) {
        splitAt = remaining.lastIndexOf(' ', MESSAGE_CHUNK_SIZE);
      }
      if (splitAt < MESSAGE_CHUNK_SIZE * 0.6) splitAt = MESSAGE_CHUNK_SIZE;

      chunks.push(remaining.slice(0, splitAt).trimEnd());
      remaining = remaining.slice(splitAt).trimStart();
    }

    if (remaining) chunks.push(remaining);
    return chunks;
  }

  _isNoUpdateError(err) {
    const message = String(err?.message || '');
    const code = err?.response?.data?.error_code || err?.response?.status;
    return code === 408 || message.includes('408') || message.toLowerCase().includes('timeout');
  }

  _isWebhookOptionalError(err) {
    const message = String(err?.message || '');
    const code = err?.response?.data?.error_code || err?.response?.status;
    return code === 400 || code === 404 || message.includes('400') || message.includes('404');
  }

  _logError(method, err) {
    const data = err?.response?.data;
    if (data?.error_code || data?.description) {
      console.error(`[Zalo API] ${method} error:`, {
        error_code: data.error_code,
        description: data.description,
      });
      return;
    }
    console.error(`[Zalo API] ${method} error:`, err?.message || err);
  }
}

module.exports = ZaloAPI;
