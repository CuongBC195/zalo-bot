/**
 * Zalo Message Update Handler
 * Xử lý sự kiện tin nhắn từ Zalo (dùng chung cho cả Polling và Webhook)
 */

const pipeline = require('../pipeline');
const db = require('../db');

// Cache chống xử lý trùng lặp (Deduplication) dùng chung cho cả Polling và Webhook
const seenMessageIds = new Set();
const MAX_SEEN_CACHE = 1000;

function buildUpdateId(update) {
  const message = update?.message || update?.data?.message || {};
  return String(
    update?.update_id ||
    message.message_id ||
    `${update?.event_name || 'msg'}:${message.chat?.id || message.chat_id || ''}:${message.from?.id || message.sender?.id || ''}:${message.date || message.text || Date.now()}`
  );
}

/**
 * Xử lý một update từ Zalo
 * @param {object} api - Instance ZaloAPI
 * @param {object} update - Update payload từ Zalo
 * @returns {Promise<object>} Kết quả xử lý { ok, reply, senderName, chatId, latencyMs }
 */
async function handleZaloUpdate(api, update) {
  const updateId = buildUpdateId(update);
  if (seenMessageIds.has(updateId)) {
    console.log(`[ZaloHandler] Bỏ qua sự kiện trùng lặp: ${updateId}`);
    return { ok: true, reason: 'duplicate_ignored' };
  }
  seenMessageIds.add(updateId);
  if (seenMessageIds.size > MAX_SEEN_CACHE) {
    const firstKey = seenMessageIds.values().next().value;
    seenMessageIds.delete(firstKey);
  }

  const message = update.message || update.data?.message;
  if (!message) return { ok: false, reason: 'no_message' };

  const from = message.from || message.sender || {};
  if (from.is_bot === true || message.is_bot === true) {
    return { ok: false, reason: 'is_bot' };
  }

  const chat = message.chat || {};
  const chatId = chat.id || message.chat_id || from.id;
  if (!chatId) return { ok: false, reason: 'no_chat_id' };

  const text = (message.text || message.caption || '').trim();
  if (!text) return { ok: false, reason: 'empty_text' };

  const senderName = from.display_name || from.name || from.username || message.sender_name || 'Đồng chí';

  console.log(`[Zalo] Nhận tin nhắn từ ${senderName} (${chatId}): "${text}"`);

  // Kiểm tra người dùng có bị khóa tương tác không
  const isBlocked = await db.isZaloUserBlocked(from.id);
  if (isBlocked) {
    console.warn(`[Zalo] Người dùng ${senderName} (${from.id}) đang bị khóa tương tác.`);
    await api.sendMessage(chatId, 'Tài khoản của đồng chí hiện đang tạm khóa tương tác với trợ lý. Vui lòng liên hệ quản trị viên.');
    return { ok: false, reason: 'blocked_user' };
  }

  const startTime = Date.now();

  const pipelineResult = await pipeline.processMessage({
    text,
    chatId,
    senderId: from.id,
    senderName,
  });

  const reply = typeof pipelineResult === 'string' ? pipelineResult : pipelineResult.answer;
  const intent = pipelineResult.intent || 'party_qa';
  const retrievedDocs = pipelineResult.retrievedDocs || [];

  const latencyMs = Date.now() - startTime;

  // Gửi phản hồi lại Zalo
  await api.sendMessage(chatId, reply);
  console.log(`[Zalo] Đã phản hồi thành công cho ${senderName} (${latencyMs}ms)`);

  // Ghi nhật ký tương tác và cập nhật thông tin Zalo user
  await db.recordInteraction({
    zaloId: from.id,
    displayName: senderName,
    chatId,
    queryText: text,
    intent,
    retrievedDocs,
    responseText: reply,
    latencyMs,
  }).catch(err => {
    console.warn('[ZaloHandler] Lỗi ghi interaction log:', err.message);
  });

  return { ok: true, reply, intent, latencyMs };
}

module.exports = { handleZaloUpdate };
