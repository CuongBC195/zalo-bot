/**
 * Cấu hình hệ thống tập trung
 */
require('dotenv').config();

const config = {
  // Zalo
  zalo: {
    token: process.env.ZALO_BOT_TOKEN || '',
    baseUrl: process.env.ZALO_API_BASE_URL || 'https://bot-api.zaloplatforms.com',
    pollingIntervalMs: Math.max(1000, parseInt(process.env.POLLING_INTERVAL_SECONDS || '3', 10) * 1000),
    longPollTimeoutSeconds: String(process.env.ZALO_LONG_POLL_TIMEOUT_SECONDS || '30'),
    deleteWebhookOnStart: process.env.DELETE_WEBHOOK_ON_START !== 'false',
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
