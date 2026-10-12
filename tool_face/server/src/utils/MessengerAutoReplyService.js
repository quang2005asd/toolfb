/**
 * MessengerAutoReplyService.js
 * Tự động trả lời MỌI tin nhắn mới của khách (Messenger / Instagram), kể cả tin vô nghĩa như "shgagdwy".
 * - Chỉ trả lời tin của khách gửi SAU thời điểm bật tính năng (không trả lời tồn đọng cũ).
 * - Mỗi tin của khách được trả lời đúng một lần (ghi nhật ký trong CSDL, an toàn khi khởi động lại).
 * - Nếu nhân viên đã trả lời trước thì không gửi trả lời tự động.
 * - Chế độ AI tự soạn; AI lỗi hoặc chưa cấu hình thì dùng mẫu cố định để luôn có câu trả lời.
 */
const axios = require('axios');
const { sql, getPool } = require('../../config/db');
const messenger = require('./MessengerService');
const { getAiConfig } = require('./AiContentGenerator');

const AUTO_REPLY_SENDER = 'auto';
const MODES = ['template', 'ai'];
const PLATFORM_KEYS = ['messenger', 'instagram'];
const MAX_TEMPLATE_LENGTH = 1000;
const MAX_INSTRUCTION_LENGTH = 1500;
const MAX_ATTEMPTS = 3;
const DEFAULT_TEMPLATE = 'Dạ {ten_page} xin chào {ten_khach} ạ! Shop đã nhận được tin nhắn của bạn và sẽ phản hồi chi tiết ngay. Bạn cần hỗ trợ gì cứ nhắn cho shop nhé! ❤️';
// Lỗi không thể khắc phục bằng cách gửi lại
const PERMANENT_ERRORS = ['outside_window', 'recipient_unavailable', 'no_permission', 'ig_access_disabled', 'cannot_reply', 'no_recipient', 'text_too_long', 'graph_rejected', 'conversation_not_found'];

const processing = new Set();
let schemaPromise = null;

async function ensureAutoReplySchema() {
  if (!schemaPromise) {
    schemaPromise = getPool().then((pool) => pool.request().query(`
      IF OBJECT_ID(N'dbo.MessengerAutoReplySettings', N'U') IS NULL
      BEGIN
        CREATE TABLE dbo.MessengerAutoReplySettings (
          page_id varchar(64) NOT NULL PRIMARY KEY,
          enabled bit NOT NULL DEFAULT 0,
          platforms_json nvarchar(200) NOT NULL DEFAULT '["messenger","instagram"]',
          mode varchar(20) NOT NULL DEFAULT 'template',
          template_text nvarchar(2000) NULL,
          ai_instruction nvarchar(2000) NULL,
          enabled_at datetime2 NULL,
          updated_by varchar(64) NULL,
          updated_at datetime2 NOT NULL DEFAULT SYSUTCDATETIME()
        );
      END;
      IF OBJECT_ID(N'dbo.MessengerAutoReplyLog', N'U') IS NULL
      BEGIN
        CREATE TABLE dbo.MessengerAutoReplyLog (
          customer_message_id varchar(256) NOT NULL PRIMARY KEY,
          conversation_id varchar(128) NOT NULL,
          page_id varchar(64) NOT NULL,
          reply_message_id varchar(256) NULL,
          mode_used varchar(30) NULL,
          status varchar(20) NOT NULL DEFAULT 'pending',
          attempts int NOT NULL DEFAULT 1,
          error nvarchar(1000) NULL,
          created_at datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
          updated_at datetime2 NOT NULL DEFAULT SYSUTCDATETIME()
        );
        CREATE INDEX IX_MessengerAutoReplyLog_page_created ON dbo.MessengerAutoReplyLog(page_id, created_at);
      END;
    `)).catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
}

function toIso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value).replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeSettings(pageId, row) {
  let platforms = PLATFORM_KEYS;
  try {
    const parsed = JSON.parse(row?.platforms_json || '[]');
    if (Array.isArray(parsed)) platforms = parsed.filter((item) => PLATFORM_KEYS.includes(item));
  } catch {}
  return {
    pageId: String(pageId),
    enabled: Boolean(row && (row.enabled === 1 || row.enabled === true)),
    platforms: row ? platforms : PLATFORM_KEYS,
    mode: MODES.includes(row?.mode) ? row.mode : 'template',
    templateText: row?.template_text || DEFAULT_TEMPLATE,
    aiInstruction: row?.ai_instruction || '',
    enabledAt: toIso(row?.enabled_at),
    updatedAt: toIso(row?.updated_at)
  };
}

async function getSettingsMap(pageIds) {
  const map = new Map(pageIds.map((id) => [String(id), normalizeSettings(id, null)]));
  if (!pageIds.length) return map;
  await ensureAutoReplySchema();
  const pool = await getPool();
  const request = pool.request();
  pageIds.forEach((id, index) => request.input(`pg${index}`, sql.VarChar(64), String(id)));
  const result = await request.query(`SELECT * FROM dbo.MessengerAutoReplySettings WHERE page_id IN (${pageIds.map((_, index) => `@pg${index}`).join(', ')})`);
  result.recordset.forEach((row) => map.set(String(row.page_id), normalizeSettings(row.page_id, row)));
  return map;
}

function validateSettings({ mode, platforms, templateText, aiInstruction }) {
  if (!MODES.includes(mode)) throw new messenger.MessengerError('Kiểu trả lời không hợp lệ.', 400, 'invalid_mode');
  if (!Array.isArray(platforms) || !platforms.length || platforms.some((item) => !PLATFORM_KEYS.includes(item))) {
    throw new messenger.MessengerError('Hãy chọn ít nhất một nền tảng (Messenger hoặc Instagram).', 400, 'invalid_platforms');
  }
  if (String(templateText || '').trim().length > MAX_TEMPLATE_LENGTH) {
    throw new messenger.MessengerError(`Nội dung mẫu tối đa ${MAX_TEMPLATE_LENGTH} ký tự.`, 400, 'template_too_long');
  }
  if (mode === 'template' && !String(templateText || '').trim()) {
    throw new messenger.MessengerError('Nội dung trả lời mẫu không được để trống.', 400, 'template_empty');
  }
  if (String(aiInstruction || '').trim().length > MAX_INSTRUCTION_LENGTH) {
    throw new messenger.MessengerError(`Hướng dẫn cho AI tối đa ${MAX_INSTRUCTION_LENGTH} ký tự.`, 400, 'instruction_too_long');
  }
}

// Lưu cùng một cấu hình cho nhiều Page; thời điểm bật chỉ đặt lại khi chuyển từ tắt sang bật
async function saveSettings({ pageIds, enabled, platforms, mode, templateText, aiInstruction, userId }) {
  validateSettings({ mode, platforms, templateText, aiInstruction });
  const existing = await getSettingsMap(pageIds);
  const pool = await getPool();
  const now = new Date();
  for (const pageId of pageIds) {
    const previous = existing.get(String(pageId));
    const enabledAt = enabled ? (previous?.enabled && previous.enabledAt ? new Date(previous.enabledAt) : now) : null;
    await pool.request()
      .input('pageId', sql.VarChar(64), String(pageId))
      .input('enabled', sql.Bit, Boolean(enabled))
      .input('platforms', sql.NVarChar(200), JSON.stringify(platforms))
      .input('mode', sql.VarChar(20), mode)
      .input('template', sql.NVarChar(2000), String(templateText || '').trim() || DEFAULT_TEMPLATE)
      .input('instruction', sql.NVarChar(2000), String(aiInstruction || '').trim() || null)
      .input('enabledAt', sql.DateTime2, enabledAt)
      .input('userId', sql.VarChar(64), String(userId))
      .input('now', sql.DateTime2, now)
      .query(`
        UPDATE dbo.MessengerAutoReplySettings
        SET enabled=@enabled, platforms_json=@platforms, mode=@mode, template_text=@template, ai_instruction=@instruction,
            enabled_at=@enabledAt, updated_by=@userId, updated_at=@now
        WHERE page_id=@pageId;
        IF @@ROWCOUNT = 0
          INSERT INTO dbo.MessengerAutoReplySettings (page_id, enabled, platforms_json, mode, template_text, ai_instruction, enabled_at, updated_by, updated_at)
          VALUES (@pageId, @enabled, @platforms, @mode, @template, @instruction, @enabledAt, @userId, @now);
      `);
  }
  return getSettingsMap(pageIds);
}

function renderTemplate(template, { customerName, pageName }) {
  const text = String(template || DEFAULT_TEMPLATE)
    .replace(/\{ten_khach\}/gi, customerName || 'bạn')
    .replace(/\{ten_page\}/gi, pageName || 'Shop')
    .trim();
  return text.slice(0, messenger.MAX_TEXT_LENGTH);
}

async function generateAiReply({ messages, pageName, customerName, instruction }) {
  const { apiKey, model, baseUrl } = await getAiConfig();
  if (!apiKey) throw new Error('AI chưa được cấu hình API Key.');
  const system = [
    instruction || `Bạn là nhân viên chăm sóc khách hàng của Fanpage "${pageName || 'Shop'}".`,
    'Quy tắc bắt buộc:',
    '- Trả lời bằng tiếng Việt, ngắn gọn (tối đa 3 câu), lịch sự, thân thiện, xưng "shop" / "mình" và gọi khách là "bạn".',
    '- LUÔN trả lời, kể cả khi tin nhắn của khách vô nghĩa, gõ nhầm hoặc chỉ là ký tự ngẫu nhiên: khi đó hãy chào khách và hỏi khách cần hỗ trợ gì.',
    '- Không bịa thông tin về giá, khuyến mãi, chính sách nếu không được cung cấp; hẹn nhân viên sẽ phản hồi chi tiết.',
    '- Chỉ trả về nội dung tin nhắn, không dùng markdown.',
    customerName ? `Tên khách: ${customerName}.` : ''
  ].filter(Boolean).join('\n');
  const history = messages.slice(-10).map((message) => ({
    role: message.isFromPage ? 'assistant' : 'user',
    content: (message.text || (message.attachments?.length ? '[Khách gửi một tệp/hình ảnh]' : '[Tin nhắn không có nội dung]')).slice(0, 1000)
  }));
  const response = await axios.post(`${baseUrl}/chat/completions`, {
    model,
    messages: [{ role: 'system', content: system }, ...history],
    temperature: 0.6,
    max_tokens: 300
  }, { headers: { Authorization: `Bearer ${apiKey}` }, timeout: 20000 });
  const reply = String(response.data?.choices?.[0]?.message?.content || '').replace(/\*\*/g, '').trim();
  if (!reply) throw new Error('AI trả về nội dung rỗng.');
  return reply.slice(0, messenger.MAX_TEXT_LENGTH);
}

async function buildReply({ settings, messages, pageName, customerName }) {
  if (settings.mode === 'ai') {
    try {
      return { text: await generateAiReply({ messages, pageName, customerName, instruction: settings.aiInstruction }), modeUsed: 'ai' };
    } catch (error) {
      return { text: renderTemplate(settings.templateText, { customerName, pageName }), modeUsed: 'template_fallback', aiError: error.message };
    }
  }
  return { text: renderTemplate(settings.templateText, { customerName, pageName }), modeUsed: 'template' };
}

async function getPageName(pageId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('pageId', sql.VarChar(64), String(pageId))
    .query('SELECT TOP 1 page_name FROM dbo.FacebookPages WHERE page_id=@pageId');
  return result.recordset[0]?.page_name || null;
}

// Giữ chỗ trả lời cho một tin của khách; chỉ một tiến trình giành được, tin lỗi tạm thời được thử lại tối đa 3 lần
async function claimMessage(customerMessageId, conversation) {
  const pool = await getPool();
  const now = new Date();
  const existing = await pool.request()
    .input('id', sql.VarChar(256), customerMessageId)
    .query('SELECT status, attempts FROM dbo.MessengerAutoReplyLog WHERE customer_message_id=@id');
  const row = existing.recordset[0];
  if (row) {
    if (row.status !== 'retry' || Number(row.attempts) >= MAX_ATTEMPTS) return false;
    const retry = await pool.request()
      .input('id', sql.VarChar(256), customerMessageId)
      .input('now', sql.DateTime2, now)
      .query("UPDATE dbo.MessengerAutoReplyLog SET status='pending', attempts=attempts+1, updated_at=@now WHERE customer_message_id=@id AND status='retry'");
    return (retry.rowsAffected?.[0] || 0) > 0;
  }
  try {
    await pool.request()
      .input('id', sql.VarChar(256), customerMessageId)
      .input('conversationId', sql.VarChar(128), conversation.id)
      .input('pageId', sql.VarChar(64), conversation.page_id)
      .input('now', sql.DateTime2, now)
      .query("INSERT INTO dbo.MessengerAutoReplyLog (customer_message_id, conversation_id, page_id, status, attempts, created_at, updated_at) VALUES (@id, @conversationId, @pageId, 'pending', 1, @now, @now)");
    return true;
  } catch {
    return false; // tiến trình khác vừa giành trước
  }
}

async function finishLog(customerMessageId, { status, replyMessageId = null, modeUsed = null, error = null }) {
  const pool = await getPool();
  await pool.request()
    .input('id', sql.VarChar(256), customerMessageId)
    .input('status', sql.VarChar(20), status)
    .input('replyId', sql.VarChar(256), replyMessageId)
    .input('mode', sql.VarChar(30), modeUsed)
    .input('error', sql.NVarChar(1000), error ? String(error).slice(0, 1000) : null)
    .input('now', sql.DateTime2, new Date())
    .query('UPDATE dbo.MessengerAutoReplyLog SET status=@status, reply_message_id=@replyId, mode_used=@mode, error=@error, updated_at=@now WHERE customer_message_id=@id');
}

// Hook chạy sau mỗi lần đồng bộ tin của một hội thoại
async function processConversation(conversationId) {
  if (processing.has(conversationId)) return null;
  processing.add(conversationId);
  try {
    await ensureAutoReplySchema();
    const conversation = await messenger.getConversationRow(conversationId);
    if (!conversation) return null;
    const platform = conversation.platform === 'instagram' ? 'instagram' : 'messenger';
    const settings = (await getSettingsMap([conversation.page_id])).get(String(conversation.page_id));
    if (!settings.enabled || !settings.enabledAt || !settings.platforms.includes(platform)) return null;

    const messages = await messenger.listMessages(conversation.id, 20);
    const last = messages[messages.length - 1];
    // Chỉ trả lời khi tin cuối cùng là của khách (nhân viên chưa trả lời) và gửi sau lúc bật
    if (!last || last.isFromPage || !last.createdTime) return null;
    if (new Date(last.createdTime) < new Date(settings.enabledAt)) return null;
    if (!(await claimMessage(last.id, conversation))) return null;

    try {
      const pageName = await getPageName(conversation.page_id);
      const reply = await buildReply({ settings, messages, pageName, customerName: conversation.participant_name });
      const result = await messenger.sendMessage({
        conversationId: conversation.id,
        text: reply.text,
        userId: AUTO_REPLY_SENDER,
        refresh: false,
        markRead: false
      });
      await finishLog(last.id, { status: 'sent', replyMessageId: result.messageIds[0] || null, modeUsed: reply.modeUsed, error: reply.aiError || null });
      console.log(`🤖 [Auto Reply] Đã trả lời ${platform} ${conversation.participant_name || conversation.participant_id} (${reply.modeUsed}).`);
      return { sent: true, modeUsed: reply.modeUsed };
    } catch (error) {
      const permanent = PERMANENT_ERRORS.includes(error.code);
      await finishLog(last.id, { status: permanent ? 'failed' : 'retry', error: error.message });
      console.warn(`[Auto Reply] Không gửi được trả lời tự động (${permanent ? 'bỏ qua' : 'sẽ thử lại'}):`, error.message);
      return { sent: false, error: error.message };
    }
  } finally {
    processing.delete(conversationId);
  }
}

async function previewReply({ settings, pageName, sampleText }) {
  const sample = String(sampleText || '').trim() || 'shgagdwy';
  return buildReply({
    settings: { ...normalizeSettings('preview', null), ...settings },
    messages: [{ isFromPage: false, text: sample, attachments: [] }],
    pageName,
    customerName: 'Khách hàng'
  });
}

async function getStats(pageIds) {
  if (!pageIds.length) return { sent24h: 0, failed24h: 0 };
  await ensureAutoReplySchema();
  const pool = await getPool();
  const request = pool.request().input('since', sql.DateTime2, new Date(Date.now() - 24 * 60 * 60 * 1000));
  pageIds.forEach((id, index) => request.input(`pg${index}`, sql.VarChar(64), String(id)));
  const result = await request.query(`
    SELECT status, COUNT(*) AS total FROM dbo.MessengerAutoReplyLog
    WHERE created_at >= @since AND page_id IN (${pageIds.map((_, index) => `@pg${index}`).join(', ')})
    GROUP BY status
  `);
  const byStatus = Object.fromEntries(result.recordset.map((row) => [row.status, Number(row.total) || 0]));
  return { sent24h: byStatus.sent || 0, failed24h: byStatus.failed || 0 };
}

module.exports = {
  AUTO_REPLY_SENDER,
  DEFAULT_TEMPLATE,
  ensureAutoReplySchema,
  getSettingsMap,
  getStats,
  previewReply,
  processConversation,
  renderTemplate,
  saveSettings
};
