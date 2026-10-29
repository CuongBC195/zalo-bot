/**
 * Cấu hình hệ thống tập trung
 */
require('dotenv').config();
const crypto = require('crypto');

function deriveWebhookSecret(botToken) {
  const token = String(botToken || '').trim();
  if (!token) return '';
  return crypto.createHmac('sha256', 'zalo-bot-webhook-secret-v1').update(token).digest('hex').slice(0, 32);
}

const config = {
  // Zalo
  zalo: {
    token: process.env.ZALO_BOT_TOKEN || '',
    baseUrl: process.env.ZALO_API_BASE_URL || 'https://bot-api.zaloplatforms.com',
    pollingIntervalMs: Math.max(1000, parseInt(process.env.POLLING_INTERVAL_SECONDS || '3', 10) * 1000),
    longPollTimeoutSeconds: String(process.env.ZALO_LONG_POLL_TIMEOUT_SECONDS || '30'),
    deleteWebhookOnStart: process.env.DELETE_WEBHOOK_ON_START !== 'false',
    // Chuỗi bí mật đã đăng ký qua setWebhook; Zalo gửi lại trong header X-Bot-Api-Secret-Token.
    // Nếu chưa đặt ZALO_WEBHOOK_SECRET riêng, tự dẫn xuất ổn định từ ZALO_BOT_TOKEN để đồng bộ giữa local và Vercel.
    webhookSecret:
      (process.env.ZALO_WEBHOOK_SECRET || '').trim() ||
      deriveWebhookSecret(process.env.ZALO_BOT_TOKEN),
    deriveWebhookSecret,
  },

  // Cờ bật/tắt tính năng
  features: {
    // Hỏi đáp quy định Đảng (Jev + RAG + Gemini). Mặc định TẮT (đang bảo trì).
    regulationQa: process.env.FEATURE_REGULATION_QA === 'true',
    // Tra cứu Sổ công văn đến/đi. Mặc định BẬT.
    officeLookup: process.env.FEATURE_OFFICE_LOOKUP !== 'false',
  },

  // Tra cứu Sổ công văn đến/đi
  office: {
    unitName: process.env.OFFICE_UNIT_NAME || 'Văn phòng Đảng ủy xã Thạnh Phú',
    maxResults: parseInt(process.env.OFFICE_MAX_RESULTS || '5', 10),
    sessionTtlMinutes: parseInt(process.env.OFFICE_SESSION_TTL_MINUTES || '30', 10),
    // Cho phép gọi Gemini viết lại câu hỏi khi bộ quy tắc không hiểu (chỉ gửi câu hỏi, không gửi dữ liệu sổ)
    aiRewrite: process.env.OFFICE_AI_REWRITE !== 'false',
    aiRewriteTimeoutMs: parseInt(process.env.OFFICE_AI_REWRITE_TIMEOUT_MS || '5000', 10),
    // Model nhanh cho bước viết lại câu hỏi; nếu lỗi sẽ thử GEMINI_MODEL trong thời gian còn lại
    aiModel: process.env.OFFICE_AI_MODEL || 'gemini-flash-lite-latest',
    activationCodeTtlHours: parseInt(process.env.OFFICE_ACTIVATION_TTL_HOURS || '24', 10),
  },

  // Gemini (System 1.5 Rewrite & System 2 Generation)
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    rewriteApiKey: process.env.GEMINI_REWRITE_API_KEY || '',
    generateApiKey: process.env.GEMINI_GENERATE_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite',
    baseUrl: process.env.GEMINI_API_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta',
    maxOutputTokens: 2048,
    temperature: 0.2, // Nhiệt độ thấp để đảm bảo câu trả lời chuẩn xác, không suy diễn
    rewriteTimeoutMs: parseInt(process.env.GEMINI_REWRITE_TIMEOUT_MS || '2500', 10),
  },

  // TypeSafe Jev (System One - Judgment & Routing)
  jev: {
    apiKey: process.env.JEV_API_KEY || '',
    baseUrl: process.env.JEV_API_BASE_URL || 'https://api.typesafe.ai/v1',
    model: process.env.JEV_MODEL || 'jev-1.13',
    enableLocalFallback: process.env.ENABLE_LOCAL_JEV_FALLBACK !== 'false',
    enableGuardrails: process.env.ENABLE_JEV_GUARDRAIL !== 'false',
  },

  // RAG (Retrieval-Augmented Generation)
  rag: {
    topK: parseInt(process.env.RAG_TOP_K || '6', 10),
    minSimilarity: parseFloat(process.env.RAG_MIN_SIMILARITY || '0.25'),
  },
};

module.exports = config;
