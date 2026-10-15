/**
 * Zalo Bot API Client Adapter
 * Triển khai Native HTTP Client chuẩn xác, độc lập 100%, tương thích hoàn toàn Zalo Bot API
 * Loại bỏ sự phụ thuộc vào thư viện bên thứ ba bị obfuscate (nguyên nhân gây lỗi module errors trên Vercel)
 */

const config = require('../config');

const MESSAGE_CHUNK_SIZE = 1800;

class NativeZaloBot {
  constructor(token, options = {}) {
    this.token = token;
    this.baseApiUrl = options.baseApiUrl || config.zalo.baseUrl || 'https://bot-api.zaloplatforms.com';
  }

  _getUrl(method) {
    return `${this.baseApiUrl}/bot${this.token}/${method}`;
  }

  async _request(method, payload = {}) {
    if (!this.token) {
      throw new Error('Zalo Bot Token not provided!');
    }

    const url = this._getUrl(method);
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok || !data.ok) {
      const err = new Error(data.description || `Zalo API Error (${data.error_code || response.status})`);
      err.response = { status: response.status, data };
      throw err;
    }

    return data.result;
  }

  async getMe() {
    if (!this.token) {
      throw new Error('Zalo Bot Token not provided!');
    }
    const url = this._getUrl('getMe');
    const response = await fetch(url, { method: 'GET' });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      const err = new Error(data.description || `Zalo API Error (${data.error_code || response.status})`);
      err.response = { status: response.status, data };
      throw err;
    }
    return data.result;
  }

  async getUpdates(options = {}) {
    return this._request('getUpdates', options);
  }

  async sendMessage(chatId, text, options = {}) {
    return this._request('sendMessage', {
      chat_id: String(chatId),
      text,
      ...options,
    });
  }

  async setWebHook(url, options = {}) {
    return this._request('setWebhook', {
      url,
      ...options,
    });
  }

  async getWebHookInfo() {
    return this._request('getWebhookInfo', {});
  }

  async deleteWebHook() {
    return this._request('deleteWebhook', {});
  }
}

class ZaloAPI {
  constructor(token = config.zalo.token) {
    this.token = token;
    this.bot = new NativeZaloBot(token, {
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

  async setWebhook(url, secretToken) {
    try {
      const options = {};
      if (secretToken) options.secret_token = secretToken;
      const result = await this.bot.setWebHook(url, options);
      return { ok: true, result };
    } catch (err) {
      this._logError('setWebhook', err);
      return { ok: false, error: err.message };
    }
  }

  async getWebhookInfo() {
    try {
      const result = await this.bot.getWebHookInfo();
      return { ok: true, result };
    } catch (err) {
      this._logError('getWebhookInfo', err);
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
