/**
 * Zalo Message Update Handler
 * Xử lý sự kiện tin nhắn từ Zalo (dùng chung cho cả Polling và Webhook)
 */

const pipeline = require('../pipeline');
const db = require('../db');
const config = require('../config');
const office = require('../office');
const officeStore = require('../office/store');
const responder = require('../office/responder');
const { normText } = require('../office/normalize');

const MAX_ACTIVATION_FAILURES = 5;
const ACTIVATION_RE = /^\/?(?:dangky|dang\s*ky|kichhoat|kich\s*hoat)\b\s*(.*)$/i;
const OFFICE_HINT_RE = /\b(?:van ban|cong van|cv|vb|so)\s+(?:den|di)\b|\b\d{1,5}\s*-\s*[a-z]{1,8}\s*\/|\bky hieu\b|\btrich yeu\b|\bnguoi ky\b|\bso cong van\b|\b\d{7,9}\b/;

/** Che mã kích hoạt khi ghi log */
function maskSecrets(text) {
  return ACTIVATION_RE.test(normText(text)) ? '/dangky ****' : text;
}

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

  console.log(`[Zalo] Nhận tin nhắn từ ${senderName} (${chatId}): "${maskSecrets(text)}"`);

  // Kiểm tra người dùng có bị khóa tương tác không
  const isBlocked = await db.isZaloUserBlocked(from.id);
  if (isBlocked) {
    console.warn(`[Zalo] Người dùng ${senderName} (${from.id}) đang bị khóa tương tác.`);
    await api.sendMessage(chatId, 'Tài khoản của đồng chí hiện đang tạm khóa tương tác với trợ lý. Vui lòng liên hệ quản trị viên.');
    return { ok: false, reason: 'blocked_user' };
  }

  const startTime = Date.now();
  let routed;
  try {
    routed = await routeMessage({ text, chatId, zaloId: from.id, senderName });
  } catch (err) {
    if (!(err instanceof officeStore.DbUnavailableError)) throw err;
    console.warn('[Zalo] Mất kết nối cơ sở dữ liệu, trả lời tạm gián đoạn.');
    routed = { reply: responder.formatBusy(), intent: 'db_unavailable', retrievedDocs: [] };
  }
  const { reply, intent, retrievedDocs } = routed;
  const latencyMs = Date.now() - startTime;

  // Gửi phản hồi lại Zalo
  await api.sendMessage(chatId, reply);
  console.log(`[Zalo] Đã phản hồi thành công cho ${senderName} (${latencyMs}ms)`);

  // Ghi nhật ký tương tác và cập nhật thông tin Zalo user
  await db.recordInteraction({
    zaloId: from.id,
    displayName: senderName,
    chatId,
    queryText: maskSecrets(text),
    intent,
    retrievedDocs,
    responseText: reply,
    latencyMs,
  }).catch(err => {
    console.warn('[ZaloHandler] Lỗi ghi interaction log:', err.message);
  });

  return { ok: true, reply, intent, latencyMs };
}

/** Đổi mã kích hoạt lấy quyền tra cứu sổ công văn */
async function handleActivation({ code, zaloId, senderName }) {
  if (await officeStore.canLookupOffice(zaloId)) return responder.formatActivation('already');
  if (!code) return responder.formatActivation('missing');
  const failures = await officeStore.getActivationFailures(zaloId);
  if (failures >= MAX_ACTIVATION_FAILURES) return responder.formatActivation('locked');
  const res = await officeStore.redeemActivationCode(code, zaloId, senderName);
  if (res.ok) {
    console.log(`[Zalo] Kích hoạt quyền tra cứu sổ công văn cho ${zaloId}`);
    return responder.formatActivation('ok');
  }
  await officeStore.recordActivationFailure(zaloId);
  return responder.formatActivation(failures + 1 >= MAX_ACTIVATION_FAILURES ? 'locked' : 'invalid');
}

/**
 * Chọn luồng xử lý:
 * - /dangky MÃ: kích hoạt quyền.
 * - Có quyền tra cứu + (hỏi đáp quy định đang tắt, hoặc câu hỏi mang dấu hiệu sổ công văn): luồng sổ công văn.
 * - Hỏi đáp quy định đang bật: pipeline cũ.
 * - Còn lại: hướng dẫn xin quyền.
 */
async function routeMessage({ text, chatId, zaloId, senderName }) {
  const norm = normText(text);
  const act = norm.match(ACTIVATION_RE);
  if (act) {
    const code = officeStore.normalizeCode(text.replace(/^\s*\/?\S+\s*/, ''));
    return { reply: await handleActivation({ code, zaloId, senderName }), intent: 'office_activation', retrievedDocs: [] };
  }

  const regulationOn = config.features.regulationQa;
  if (config.features.officeLookup) {
    const allowed = await officeStore.canLookupOffice(zaloId);
    if (allowed) {
      let useOffice = !regulationOn || OFFICE_HINT_RE.test(norm);
      if (!useOffice) useOffice = !!(await officeStore.getSession(zaloId, config.office.sessionTtlMinutes).catch(() => null));
      if (useOffice) {
        const r = await office.handleOfficeMessage({ text, sessionId: String(zaloId) });
        return { reply: r.answer, intent: r.intent, retrievedDocs: r.retrievedDocs };
      }
    } else if (!regulationOn) {
      return { reply: responder.formatUnregistered(), intent: 'office_unregistered', retrievedDocs: [] };
    }
  }

  if (!regulationOn) {
    return { reply: responder.formatMaintenance(), intent: 'maintenance', retrievedDocs: [] };
  }

  const pipelineResult = await pipeline.processMessage({ text, chatId, senderId: zaloId, senderName });
  return {
    reply: typeof pipelineResult === 'string' ? pipelineResult : pipelineResult.answer,
    intent: pipelineResult.intent || 'party_qa',
    retrievedDocs: pipelineResult.retrievedDocs || [],
  };
}

module.exports = { handleZaloUpdate, routeMessage };
