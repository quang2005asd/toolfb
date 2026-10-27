/**
 * MessengerService.js
 * Hộp thư Fanpage: Messenger + Instagram Direct (qua Fanpage đã liên kết Instagram).
 * Đồng bộ hội thoại / tin nhắn từ Facebook Graph API về CSDL, gửi tin trả lời,
 * nhận sự kiện webhook và chạy vòng tự đồng bộ định kỳ (mặc định 5 giây).
 * Facebook luôn là nguồn dữ liệu gốc; CSDL chỉ là bản sao để hộp thư tải nhanh và giữ lịch sử.
 */
const axios = require('axios');
const crypto = require('crypto');
const { sql, getPool } = require('../../config/db');
const { getFacebookPageAccessToken } = require('./FacebookPageAccessToken');
const instagramService = require('./InstagramService');

const GRAPH = `https://graph.facebook.com/${process.env.FB_GRAPH_VERSION || 'v19.0'}`;
const TOKEN_CACHE_MS = 10 * 60 * 1000;
const CONVERSATION_SYNC_THROTTLE_MS = 4000;
const MESSAGE_SYNC_THROTTLE_MS = 4000;
const REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;
// Giãn nhịp khi Facebook từ chối: giới hạn tần suất chờ lâu hơn, lỗi tạm thời chỉ chờ tối đa 1 phút
const BACKOFF_STEPS_MS = {
  rate_limited: [30000, 60000, 120000, 300000],
  fb_unavailable: [10000, 20000, 30000, 60000]
};
const DIRECT_SYNC_INTERVAL_MS = 15000;
const DIRECT_SYNC_LIMIT = 3;
const PERMISSION_RETRY_MS = 5 * 60 * 1000; // nền tảng thiếu quyền: chỉ thử lại định kỳ, không gọi mỗi vòng
const INSTAGRAM_REFRESH_MS = 10 * 60 * 1000;
const MAX_TEXT_LENGTH = 2000; // giới hạn của Send API
const PLATFORMS = {
  messenger: {
    label: 'Messenger',
    conversationFields: 'id,updated_time,unread_count,message_count,snippet,can_reply,link,participants',
    messageFields: 'id,message,from,created_time,sticker,attachments{id,mime_type,name,size,image_data,video_data,file_url},shares{link,name}'
  },
  instagram: {
    label: 'Instagram',
    conversationFields: 'id,updated_time,participants',
    messageFields: 'id,message,from,created_time,attachments'
  }
};

class MessengerError extends Error {
  constructor(message, status = 400, code = 'messenger_error') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const tokenCache = new Map();        // pageId -> { token, expiresAt }
const pageStatus = new Map();        // statusKey -> { state, message, syncedAt }
const backoff = new Map();           // pageId -> { until, step, kind }
const lastDirectSync = new Map();    // pageId -> lần cuối đồng bộ trực tiếp các hội thoại đang hoạt động
const instagramRetryAfter = new Map(); // pageId -> thời điểm được thử lại Instagram khi đang thiếu quyền
const lastConversationSync = new Map();
const lastMessageSync = new Map();
const inflightSyncs = new Map();     // tránh đồng bộ trùng cùng lúc cho một Page / hội thoại
const avatarAttempted = new Set();
const syncHooks = [];                // chạy sau mỗi lần đồng bộ tin nhắn của một hội thoại (vd. trả lời tự động)
const tokenExpiredHooks = [];        // chạy khi token Fanpage hết hạn (vd. tự lấy lại token)
const autoSyncState = { enabled: false, intervalSeconds: 0, lastRunAt: null };

let schemaPromise = null;

async function ensureMessengerSchema() {
  if (!schemaPromise) {
    schemaPromise = getPool().then((pool) => pool.request().query(`
      IF OBJECT_ID(N'dbo.MessengerConversations', N'U') IS NULL
      BEGIN
        CREATE TABLE dbo.MessengerConversations (
          id varchar(128) NOT NULL PRIMARY KEY,
          page_id varchar(64) NOT NULL,
          platform varchar(20) NOT NULL DEFAULT 'messenger',
          participant_id varchar(64) NULL,
          participant_name nvarchar(200) NULL,
          participant_username nvarchar(200) NULL,
          participant_avatar nvarchar(1000) NULL,
          snippet nvarchar(1000) NULL,
          unread_count int NOT NULL DEFAULT 0,
          message_count int NOT NULL DEFAULT 0,
          can_reply bit NOT NULL DEFAULT 1,
          link nvarchar(500) NULL,
          updated_time datetime2 NULL,
          last_customer_message_at datetime2 NULL,
          read_at datetime2 NULL,
          last_synced_at datetime2 NULL,
          created_at datetime2 NOT NULL DEFAULT SYSUTCDATETIME()
        );
        CREATE INDEX IX_MessengerConversations_page_updated ON dbo.MessengerConversations(page_id, updated_time DESC);
      END;
      IF COL_LENGTH('dbo.MessengerConversations', 'platform') IS NULL
        ALTER TABLE dbo.MessengerConversations ADD platform varchar(20) NOT NULL CONSTRAINT DF_MessengerConversations_platform DEFAULT 'messenger';
      IF COL_LENGTH('dbo.MessengerConversations', 'participant_username') IS NULL
        ALTER TABLE dbo.MessengerConversations ADD participant_username nvarchar(200) NULL;

      IF OBJECT_ID(N'dbo.MessengerMessages', N'U') IS NULL
      BEGIN
        CREATE TABLE dbo.MessengerMessages (
          id varchar(256) NOT NULL PRIMARY KEY,
          conversation_id varchar(128) NOT NULL,
          page_id varchar(64) NOT NULL,
          from_id varchar(64) NULL,
          from_name nvarchar(200) NULL,
          is_from_page bit NOT NULL DEFAULT 0,
          message_text nvarchar(max) NULL,
          attachments_json nvarchar(max) NOT NULL DEFAULT '[]',
          created_time datetime2 NULL,
          sent_by_user_id varchar(64) NULL,
          created_at datetime2 NOT NULL DEFAULT SYSUTCDATETIME()
        );
        CREATE INDEX IX_MessengerMessages_conversation_time ON dbo.MessengerMessages(conversation_id, created_time);
      END;
    `)).catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
}

// ═══ TIỆN ÍCH ═══
// Facebook trả thời gian dạng "2026-10-10T03:21:45+0000"
function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const date = new Date(String(value).replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
  return Number.isNaN(date.getTime()) ? null : date;
}

function toIso(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const text = String(value);
  const date = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(text) ? new Date(text.replace(' ', 'T')) : new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function isHttpUrl(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value);
}

function normalizePlatform(value) {
  return value === 'instagram' ? 'instagram' : 'messenger';
}

function statusKey(pageId, platform = 'messenger') {
  return normalizePlatform(platform) === 'instagram' ? `${pageId}:instagram` : String(pageId);
}

function setPageStatus(pageId, platform, state, message = null) {
  pageStatus.set(statusKey(pageId, platform), { state, message, syncedAt: new Date().toISOString() });
}

function getPageStatus(pageId, platform = 'messenger') {
  return pageStatus.get(statusKey(pageId, platform)) || { state: 'unknown', message: null, syncedAt: null };
}

function isBackedOff(pageId) {
  const entry = backoff.get(String(pageId));
  return Boolean(entry && entry.until > Date.now());
}

function registerBackoff(pageId, kind) {
  const key = String(pageId);
  const steps = BACKOFF_STEPS_MS[kind] || BACKOFF_STEPS_MS.rate_limited;
  const previous = backoff.get(key);
  const step = Math.min(previous?.kind === kind ? previous.step + 1 : 0, steps.length - 1);
  backoff.set(key, { until: Date.now() + steps[step], step, kind });
  return steps[step];
}

async function getPageToken(pageId) {
  const key = String(pageId);
  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.token;
  const token = await getFacebookPageAccessToken(key);
  tokenCache.set(key, { token, expiresAt: Date.now() + TOKEN_CACHE_MS });
  return token;
}

// Chuyển lỗi Graph API sang thông báo dễ hiểu + trạng thái liên kết của Page
function describeGraphError(error, context = 'sync', platform = 'messenger') {
  const fb = error.response?.data?.error;
  if (!fb) {
    return { state: 'error', status: 502, code: 'network', message: `Không kết nối được tới Facebook: ${error.message}` };
  }
  if ([4, 17, 32, 613, 80001, 80006].includes(fb.code)) {
    return { state: 'rate_limited', status: 429, code: 'rate_limited', message: 'Facebook đang giới hạn tần suất gọi API của Page, hệ thống tạm giãn nhịp đồng bộ rồi tự chạy lại.' };
  }
  if (fb.is_transient || [1, 2].includes(fb.code)) {
    return { state: 'temporarily_unavailable', status: 503, code: 'fb_unavailable', message: 'Facebook đang tạm thời lỗi (“Please retry your request later”), hệ thống tạm giãn nhịp đồng bộ rồi tự thử lại.' };
  }
  if (fb.code === 190) {
    return { state: 'token_expired', status: 401, code: 'token_expired', message: 'Token của Fanpage đã hết hạn hoặc bị thu hồi. Vào trang Kênh để cập nhật lại token.' };
  }
  if ((fb.code === 10 && fb.error_subcode === 2018278) || /outside of allowed window/i.test(fb.message || '')) {
    return { state: 'linked', status: 409, code: 'outside_window', message: 'Đã quá 24 giờ kể từ tin nhắn gần nhất của khách nên Facebook không cho Page gửi tin. Hãy chờ khách nhắn lại.' };
  }
  if (fb.code === 551 || fb.error_subcode === 1545041) {
    return { state: 'linked', status: 409, code: 'recipient_unavailable', message: 'Người này hiện không nhận được tin nhắn từ Page.' };
  }
  if (context === 'send' && fb.code === 100) {
    return { state: 'linked', status: 400, code: 'graph_rejected', message: `Facebook từ chối tin nhắn: ${fb.message}` };
  }
  if (platform === 'instagram' && [3, 10, 100, 200, 230].includes(fb.code)) {
    return {
      state: 'ig_access_disabled',
      status: 403,
      code: 'ig_access_disabled',
      message: 'Chưa đọc được tin nhắn Instagram: bật "Cho phép truy cập tin nhắn" trong ứng dụng Instagram (Cài đặt → Tin nhắn và lượt phản hồi tin → Công cụ đã kết nối) và dùng token có quyền instagram_manage_messages.'
    };
  }
  if ([3, 10, 100, 200, 230, 283].includes(fb.code)) {
    return { state: 'no_permission', status: 403, code: 'no_permission', message: 'Fanpage chưa liên kết được Messenger: token cần quyền pages_messaging và tài khoản Facebook phải có vai trò nhắn tin trên Page.' };
  }
  return { state: 'error', status: 502, code: 'graph_error', message: fb.message || 'Facebook từ chối yêu cầu.' };
}

function graphFailure(pageId, platform, error, context) {
  const info = describeGraphError(error, context, platform);
  if (info.code === 'token_expired') {
    tokenCache.delete(String(pageId));
    for (const hook of tokenExpiredHooks) Promise.resolve().then(() => hook(String(pageId))).catch(() => {});
  }
  if (info.code === 'rate_limited' || info.code === 'fb_unavailable') {
    const wait = registerBackoff(pageId, info.code);
    info.message = `${info.message} (thử lại sau ${Math.round(wait / 1000)} giây)`;
  }
  if (context === 'sync' || info.state !== 'linked') setPageStatus(pageId, platform, info.state, info.message);
  return new MessengerError(info.message, info.status, info.code);
}

function runOnce(key, task) {
  if (inflightSyncs.has(key)) return inflightSyncs.get(key);
  const promise = task().finally(() => inflightSyncs.delete(key));
  inflightSyncs.set(key, promise);
  return promise;
}

function normalizeAttachments(message) {
  const list = [];
  for (const item of message.attachments?.data || []) {
    if (item.image_data && isHttpUrl(item.image_data.url)) {
      list.push({
        type: 'image',
        url: item.image_data.url,
        previewUrl: isHttpUrl(item.image_data.preview_url) ? item.image_data.preview_url : item.image_data.url,
        width: item.image_data.width || null,
        height: item.image_data.height || null
      });
    } else if (item.video_data && isHttpUrl(item.video_data.url)) {
      list.push({ type: 'video', url: item.video_data.url, previewUrl: isHttpUrl(item.video_data.preview_url) ? item.video_data.preview_url : null });
    } else if (isHttpUrl(item.file_url)) {
      list.push({
        type: String(item.mime_type || '').startsWith('audio/') ? 'audio' : 'file',
        url: item.file_url,
        name: item.name || 'Tệp đính kèm',
        size: item.size || null
      });
    }
  }
  if (isHttpUrl(message.sticker)) list.push({ type: 'sticker', url: message.sticker });
  for (const share of message.shares?.data || []) {
    if (isHttpUrl(share.link)) list.push({ type: 'link', url: share.link, name: share.name || share.link });
  }
  return list;
}

// ═══ LƯU TRỮ ═══
// Instagram không trả snippet / unread_count / can_reply: truyền null để giữ giá trị đang có
async function upsertConversation(pageId, platform, conversation, ownerId) {
  const participants = conversation.participants?.data || [];
  const customer = participants.find((p) => String(p.id) !== String(ownerId)) || participants[0] || {};
  const isMessenger = platform === 'messenger';
  const pool = await getPool();
  const now = new Date();
  await pool.request()
    .input('id', sql.VarChar(128), String(conversation.id))
    .input('pageId', sql.VarChar(64), String(pageId))
    .input('platform', sql.VarChar(20), platform)
    .input('participantId', sql.VarChar(64), customer.id ? String(customer.id) : null)
    .input('participantName', sql.NVarChar(200), String(customer.name || customer.username || (isMessenger ? 'Khách hàng Messenger' : 'Khách hàng Instagram')).slice(0, 200))
    .input('participantUsername', sql.NVarChar(200), customer.username ? String(customer.username).slice(0, 200) : null)
    .input('snippet', sql.NVarChar(1000), isMessenger ? String(conversation.snippet || '').slice(0, 1000) : null)
    .input('unreadCount', sql.Int, isMessenger ? Number(conversation.unread_count) || 0 : null)
    .input('messageCount', sql.Int, isMessenger ? Number(conversation.message_count) || 0 : null)
    .input('canReply', sql.Bit, isMessenger ? conversation.can_reply !== false : null)
    .input('link', sql.NVarChar(500), conversation.link ? String(conversation.link).slice(0, 500) : null)
    .input('updatedTime', sql.DateTime2, toDate(conversation.updated_time))
    .input('now', sql.DateTime2, now)
    .query(`
      UPDATE dbo.MessengerConversations
      SET page_id=@pageId, platform=@platform, participant_id=@participantId, participant_name=@participantName,
          participant_username=COALESCE(@participantUsername, participant_username),
          snippet=COALESCE(@snippet, snippet), unread_count=COALESCE(@unreadCount, unread_count),
          message_count=COALESCE(@messageCount, message_count), can_reply=COALESCE(@canReply, can_reply),
          link=COALESCE(@link, link), updated_time=@updatedTime, last_synced_at=@now
      WHERE id=@id;
      IF @@ROWCOUNT = 0
        INSERT INTO dbo.MessengerConversations (id, page_id, platform, participant_id, participant_name, participant_username, snippet, unread_count, message_count, can_reply, link, updated_time, last_synced_at, created_at)
        VALUES (@id, @pageId, @platform, @participantId, @participantName, @participantUsername, COALESCE(@snippet, ''), COALESCE(@unreadCount, 0), COALESCE(@messageCount, 0), COALESCE(@canReply, 1), @link, @updatedTime, @now, @now);
    `);
}

async function upsertMessage(conversation, message, sentByUserId = null) {
  const pool = await getPool();
  const fromId = message.from?.id ? String(message.from.id) : null;
  // Tin của Page = người gửi không phải khách (dùng chung cho Messenger và Instagram)
  const isFromPage = conversation.participant_id
    ? fromId !== String(conversation.participant_id)
    : fromId === String(conversation.page_id);
  await pool.request()
    .input('id', sql.VarChar(256), String(message.id))
    .input('conversationId', sql.VarChar(128), conversation.id)
    .input('pageId', sql.VarChar(64), conversation.page_id)
    .input('fromId', sql.VarChar(64), fromId)
    .input('fromName', sql.NVarChar(200), (message.from?.name || message.from?.username) ? String(message.from.name || message.from.username).slice(0, 200) : null)
    .input('isFromPage', sql.Bit, isFromPage)
    .input('text', sql.NVarChar(sql.MAX), message.message || null)
    .input('attachments', sql.NVarChar(sql.MAX), JSON.stringify(normalizeAttachments(message)))
    .input('createdTime', sql.DateTime2, toDate(message.created_time) || new Date())
    .input('sentBy', sql.VarChar(64), sentByUserId)
    .input('now', sql.DateTime2, new Date())
    .query(`
      UPDATE dbo.MessengerMessages
      SET from_id=@fromId, from_name=@fromName, is_from_page=@isFromPage, message_text=@text,
          attachments_json=@attachments, created_time=@createdTime
      WHERE id=@id;
      IF @@ROWCOUNT = 0
        INSERT INTO dbo.MessengerMessages (id, conversation_id, page_id, from_id, from_name, is_from_page, message_text, attachments_json, created_time, sent_by_user_id, created_at)
        VALUES (@id, @conversationId, @pageId, @fromId, @fromName, @isFromPage, @text, @attachments, @createdTime, @sentBy, @now);
    `);
}

async function getConversationRow(conversationId) {
  await ensureMessengerSchema();
  const pool = await getPool();
  const result = await pool.request()
    .input('id', sql.VarChar(128), String(conversationId))
    .query('SELECT * FROM dbo.MessengerConversations WHERE id=@id');
  return result.recordset[0] || null;
}

function effectiveUnread(row) {
  const updated = toIso(row.updated_time);
  const readAt = toIso(row.read_at);
  return readAt && updated && updated <= readAt ? 0 : Number(row.unread_count) || 0;
}

function fallbackInboxLink(row) {
  return normalizePlatform(row.platform) === 'instagram'
    ? `https://business.facebook.com/latest/inbox/instagram?asset_id=${row.page_id}`
    : `https://business.facebook.com/latest/inbox/messenger?asset_id=${row.page_id}`;
}

function toPublicConversation(row, pageNames = new Map()) {
  const lastCustomerAt = toIso(row.last_customer_message_at);
  const platform = normalizePlatform(row.platform);
  return {
    id: row.id,
    pageId: row.page_id,
    platform,
    pageName: pageNames.get(String(row.page_id)) || null,
    participantId: row.participant_id,
    participantName: row.participant_name || (platform === 'instagram' ? 'Khách hàng Instagram' : 'Khách hàng Messenger'),
    participantUsername: row.participant_username || null,
    participantAvatar: row.participant_avatar || null,
    snippet: row.snippet || '',
    unreadCount: effectiveUnread(row),
    messageCount: Number(row.message_count) || 0,
    canReply: row.can_reply !== 0 && row.can_reply !== false,
    canSendImage: platform === 'messenger',
    link: row.link ? (row.link.startsWith('/') ? `https://www.facebook.com${row.link}` : row.link) : fallbackInboxLink(row),
    updatedTime: toIso(row.updated_time),
    lastCustomerMessageAt: lastCustomerAt,
    replyWindowOpen: lastCustomerAt ? Date.now() - new Date(lastCustomerAt).getTime() < REPLY_WINDOW_MS : null
  };
}

function toPublicMessage(row) {
  let attachments = [];
  try {
    attachments = JSON.parse(row.attachments_json || '[]');
  } catch {}
  return {
    id: row.id,
    fromId: row.from_id,
    fromName: row.from_name,
    isFromPage: row.is_from_page === 1 || row.is_from_page === true,
    text: row.message_text || '',
    attachments,
    createdTime: toIso(row.created_time),
    sentByUserId: row.sent_by_user_id || null
  };
}

// ═══ ĐỒNG BỘ TỪ FACEBOOK ═══
async function fetchMissingAvatars(pageId, token) {
  const pool = await getPool();
  const result = await pool.request()
    .input('pageId', sql.VarChar(64), String(pageId))
    .query('SELECT TOP 10 id, participant_id FROM dbo.MessengerConversations WHERE page_id=@pageId AND participant_avatar IS NULL AND participant_id IS NOT NULL ORDER BY updated_time DESC');
  const pending = result.recordset.filter((row) => !avatarAttempted.has(row.participant_id));
  await Promise.allSettled(pending.map(async (row) => {
    avatarAttempted.add(row.participant_id);
    const profile = await axios.get(`${GRAPH}/${row.participant_id}`, { params: { fields: 'profile_pic', access_token: token }, timeout: 8000 });
    if (isHttpUrl(profile.data?.profile_pic)) {
      await pool.request()
        .input('id', sql.VarChar(128), row.id)
        .input('avatar', sql.NVarChar(1000), profile.data.profile_pic.slice(0, 1000))
        .query('UPDATE dbo.MessengerConversations SET participant_avatar=@avatar WHERE id=@id');
    }
  }));
}

async function loadUpdatedTimes(pageId, platform) {
  const pool = await getPool();
  const result = await pool.request()
    .input('pageId', sql.VarChar(64), String(pageId))
    .input('platform', sql.VarChar(20), platform)
    .query('SELECT id, updated_time FROM dbo.MessengerConversations WHERE page_id=@pageId AND platform=@platform');
  return new Map(result.recordset.map((row) => [String(row.id), toIso(row.updated_time)]));
}

// Đồng bộ danh sách hội thoại của một nền tảng; trả về id các hội thoại có thay đổi để tải tin mới
async function syncPlatformConversations(pageId, platform, token, maxPages, ownerId) {
  const conversations = [];
  try {
    let url = `${GRAPH}/${pageId}/conversations`;
    let params = { platform, fields: PLATFORMS[platform].conversationFields, limit: 25, access_token: token };
    for (let page = 0; page < maxPages && url; page++) {
      const response = await axios.get(url, { params, timeout: 15000 });
      conversations.push(...(response.data.data || []));
      url = response.data.paging?.next || null;
      params = undefined; // link "next" đã chứa đủ tham số
    }
  } catch (error) {
    throw graphFailure(pageId, platform, error, 'sync');
  }
  const known = await loadUpdatedTimes(pageId, platform);
  const changed = [];
  for (const conversation of conversations) {
    const updated = toDate(conversation.updated_time)?.toISOString() || null;
    if (!known.has(String(conversation.id)) || known.get(String(conversation.id)) !== updated) changed.push(String(conversation.id));
    await upsertConversation(pageId, platform, conversation, ownerId);
  }
  setPageStatus(pageId, platform, 'linked');
  return { count: conversations.length, changed };
}

async function syncPageConversations(pageId, { force = false, maxPages = 1 } = {}) {
  const key = String(pageId);
  if (!force && (isBackedOff(key) || Date.now() - (lastConversationSync.get(key) || 0) < CONVERSATION_SYNC_THROTTLE_MS)) {
    return { pageId: key, skipped: true, count: 0, changed: [] };
  }
  return runOnce(`page:${key}`, async () => {
    lastConversationSync.set(key, Date.now());
    await ensureMessengerSchema();
    let token;
    try {
      token = await getPageToken(key);
    } catch (error) {
      throw graphFailure(key, 'messenger', error, 'sync');
    }

    const result = { pageId: key, count: 0, changed: [], errors: {} };
    try {
      const messenger = await syncPlatformConversations(key, 'messenger', token, maxPages, key);
      result.count += messenger.count;
      result.changed.push(...messenger.changed);
    } catch (error) {
      result.errors.messenger = error;
    }

    // Instagram Direct đi qua Fanpage đã liên kết; lỗi Instagram không chặn Messenger
    const instagram = await instagramService.getInstagramAccountForPage(key).catch(() => null);
    let instagramSynced = false;
    const instagramCoolingDown = !force && (instagramRetryAfter.get(key) || 0) > Date.now();
    if (instagram && !instagramCoolingDown && !['rate_limited', 'fb_unavailable'].includes(result.errors.messenger?.code)) {
      try {
        const direct = await syncPlatformConversations(key, 'instagram', token, maxPages, instagram.ig_id);
        result.count += direct.count;
        result.changed.push(...direct.changed);
        instagramSynced = true;
        instagramRetryAfter.delete(key);
      } catch (error) {
        result.errors.instagram = error;
        if (['ig_access_disabled', 'no_permission'].includes(error.code)) instagramRetryAfter.set(key, Date.now() + PERMISSION_RETRY_MS);
      }
    }

    if (result.errors.messenger && !instagramSynced) throw result.errors.messenger;
    if (!result.errors.messenger) backoff.delete(key);
    await fetchMissingAvatars(key, token).catch(() => {});
    return result;
  });
}

async function syncConversationMessages(conversationId, { force = false } = {}) {
  const conversation = await getConversationRow(conversationId);
  if (!conversation) throw new MessengerError('Không tìm thấy hội thoại.', 404, 'conversation_not_found');
  const platform = normalizePlatform(conversation.platform);
  if (!force && (isBackedOff(conversation.page_id) || Date.now() - (lastMessageSync.get(conversation.id) || 0) < MESSAGE_SYNC_THROTTLE_MS)) {
    return { skipped: true };
  }
  return runOnce(`conv:${conversation.id}`, async () => {
    lastMessageSync.set(conversation.id, Date.now());
    let messages;
    try {
      const token = await getPageToken(conversation.page_id);
      const response = await axios.get(`${GRAPH}/${conversation.id}/messages`, {
        params: { fields: PLATFORMS[platform].messageFields, limit: 25, access_token: token },
        timeout: 15000
      });
      messages = response.data.data || [];
    } catch (error) {
      throw graphFailure(conversation.page_id, platform, error, 'sync');
    }
    for (const message of messages) {
      if (message.id) await upsertMessage(conversation, message);
    }
    const pool = await getPool();
    await pool.request()
      .input('id', sql.VarChar(128), conversation.id)
      .query(`
        UPDATE dbo.MessengerConversations
        SET last_customer_message_at = (SELECT MAX(created_time) FROM dbo.MessengerMessages WHERE conversation_id=@id AND is_from_page=0)
        WHERE id=@id
      `);
    // Tin mới hơn mốc của hội thoại (vd. lấy trực tiếp khi danh sách hội thoại lỗi): cập nhật mốc, đoạn trích, chưa đọc
    if (platform === 'messenger') {
      const latest = (await listMessages(conversation.id, 1))[0];
      const known = toIso(conversation.updated_time);
      if (latest?.createdTime && (!known || latest.createdTime > known)) {
        await pool.request()
          .input('id', sql.VarChar(128), conversation.id)
          .input('updated', sql.DateTime2, new Date(latest.createdTime))
          .input('snippet', sql.NVarChar(1000), (latest.text || '[Tệp đính kèm]').slice(0, 1000))
          .input('unread', sql.Int, latest.isFromPage ? 0 : Math.max(1, Number(conversation.unread_count) || 0))
          .query('UPDATE dbo.MessengerConversations SET updated_time=@updated, snippet=@snippet, unread_count=@unread WHERE id=@id');
      }
    }
    // Instagram không có snippet / số tin chưa đọc: tự tính từ tin nhắn đã lưu
    if (platform === 'instagram') {
      const stored = await listMessages(conversation.id, 50);
      const last = stored[stored.length - 1];
      let unread = 0;
      for (let index = stored.length - 1; index >= 0 && !stored[index].isFromPage; index--) unread += 1;
      await pool.request()
        .input('id', sql.VarChar(128), conversation.id)
        .input('snippet', sql.NVarChar(1000), last ? (last.text || '[Tệp đính kèm]').slice(0, 1000) : '')
        .input('unread', sql.Int, unread)
        .input('count', sql.Int, stored.length)
        .query('UPDATE dbo.MessengerConversations SET snippet=@snippet, unread_count=@unread, message_count=@count WHERE id=@id');
    }
    return { count: messages.length };
  });
}

function onTokenExpired(hook) {
  tokenExpiredHooks.push(hook);
}

function clearTokenCache(pageId = null) {
  if (pageId) tokenCache.delete(String(pageId));
  else tokenCache.clear();
}


function onConversationSynced(hook) {
  syncHooks.push(hook);
}

// Đồng bộ tin của một hội thoại rồi chạy các hook (trả lời tự động...) bên ngoài khóa đồng bộ
async function syncConversationAndNotify(conversationId, options = {}) {
  const result = await syncConversationMessages(conversationId, options);
  for (const hook of syncHooks) {
    try {
      await hook(String(conversationId));
    } catch (error) {
      console.warn('[Messenger Hook]', error.message);
    }
  }
  return result;
}

// ═══ TRUY VẤN CHO GIAO DIỆN ═══
async function listConversations({ pageIds, pageNames, platform = 'all', search = '', unreadOnly = false, limit = 150 }) {
  if (!pageIds.length) return [];
  await ensureMessengerSchema();
  const pool = await getPool();
  const request = pool.request();
  pageIds.forEach((id, index) => request.input(`pg${index}`, sql.VarChar(64), String(id)));
  const filters = [`page_id IN (${pageIds.map((_, index) => `@pg${index}`).join(', ')})`];
  if (platform === 'messenger' || platform === 'instagram') {
    request.input('platform', sql.VarChar(20), platform);
    filters.push('platform = @platform');
  }
  const keyword = String(search || '').trim().slice(0, 100);
  if (keyword) {
    request.input('keyword', sql.NVarChar(120), `%${keyword}%`);
    filters.push('(participant_name LIKE @keyword OR participant_username LIKE @keyword OR snippet LIKE @keyword)');
  }
  const result = await request.query(`
    SELECT TOP ${Math.min(500, Math.max(1, limit))} *
    FROM dbo.MessengerConversations
    WHERE ${filters.join(' AND ')}
    ORDER BY updated_time DESC
  `);
  const conversations = result.recordset.map((row) => toPublicConversation(row, pageNames));
  return unreadOnly ? conversations.filter((conversation) => conversation.unreadCount > 0) : conversations;
}

async function listMessages(conversationId, limit = 200) {
  const pool = await getPool();
  const result = await pool.request()
    .input('id', sql.VarChar(128), String(conversationId))
    .query(`SELECT TOP ${limit} * FROM dbo.MessengerMessages WHERE conversation_id=@id ORDER BY created_time DESC`);
  return result.recordset.reverse().map(toPublicMessage);
}

async function getUnreadTotal(pageIds) {
  if (!pageIds.length) return 0;
  await ensureMessengerSchema();
  const pool = await getPool();
  const request = pool.request();
  pageIds.forEach((id, index) => request.input(`pg${index}`, sql.VarChar(64), String(id)));
  const result = await request.query(`
    SELECT unread_count, updated_time, read_at FROM dbo.MessengerConversations
    WHERE unread_count > 0 AND page_id IN (${pageIds.map((_, index) => `@pg${index}`).join(', ')})
  `);
  return result.recordset.reduce((sum, row) => sum + effectiveUnread(row), 0);
}

// Mở hội thoại: đánh dấu đã đọc trong tool và báo "đã xem" cho khách (bỏ qua nếu Facebook từ chối)
async function markConversationRead(conversation) {
  const pool = await getPool();
  await pool.request()
    .input('id', sql.VarChar(128), conversation.id)
    .input('now', sql.DateTime2, new Date())
    .query('UPDATE dbo.MessengerConversations SET read_at=@now WHERE id=@id');
  if (effectiveUnread(conversation) > 0 && conversation.participant_id) {
    try {
      const token = await getPageToken(conversation.page_id);
      await axios.post(`${GRAPH}/${conversation.page_id}/messages`, {
        recipient: { id: conversation.participant_id },
        sender_action: 'mark_seen'
      }, { params: { access_token: token }, timeout: 8000 });
    } catch {}
  }
}

// ═══ GỬI TIN ═══
async function sendMessage({ conversationId, text, image, userId, refresh = true, markRead = true }) {
  const conversation = await getConversationRow(conversationId);
  if (!conversation) throw new MessengerError('Không tìm thấy hội thoại.', 404, 'conversation_not_found');
  const platform = normalizePlatform(conversation.platform);
  if (!conversation.participant_id) throw new MessengerError('Không xác định được người nhận của hội thoại này.', 400, 'no_recipient');
  if (conversation.can_reply === 0 || conversation.can_reply === false) {
    throw new MessengerError('Facebook không cho phép Page trả lời hội thoại này.', 409, 'cannot_reply');
  }
  if (image && platform === 'instagram') {
    throw new MessengerError('Instagram chưa hỗ trợ gửi ảnh tải lên từ tool, hãy gửi tin nhắn chữ.', 400, 'image_not_supported');
  }
  const cleanText = typeof text === 'string' ? text.trim() : '';
  if (!cleanText && !image) throw new MessengerError('Tin nhắn không được để trống.', 400, 'empty_message');
  if (cleanText.length > MAX_TEXT_LENGTH) {
    throw new MessengerError(`Tin nhắn tối đa ${MAX_TEXT_LENGTH} ký tự.`, 400, 'text_too_long');
  }

  const token = await getPageToken(conversation.page_id).catch((error) => { throw graphFailure(conversation.page_id, platform, error, 'send'); });
  const endpoint = `${GRAPH}/${conversation.page_id}/messages`;
  const recipient = { id: conversation.participant_id };
  const sent = [];
  try {
    if (image) {
      const form = new FormData();
      form.append('recipient', JSON.stringify(recipient));
      form.append('messaging_type', 'RESPONSE');
      form.append('message', JSON.stringify({ attachment: { type: 'image', payload: { is_reusable: true } } }));
      form.append('filedata', new Blob([image.buffer], { type: image.mimetype }), image.originalname || 'image.jpg');
      const response = await axios.post(endpoint, form, { params: { access_token: token }, timeout: 60000 });
      sent.push({ id: response.data.message_id, attachments: { data: [] } });
    }
    if (cleanText) {
      // Instagram Messaging không dùng messaging_type
      const payload = platform === 'instagram'
        ? { recipient, message: { text: cleanText } }
        : { recipient, messaging_type: 'RESPONSE', message: { text: cleanText } };
      const response = await axios.post(endpoint, payload, { params: { access_token: token }, timeout: 20000 });
      sent.push({ id: response.data.message_id, message: cleanText });
    }
  } catch (error) {
    if (!sent.length) throw graphFailure(conversation.page_id, platform, error, 'send');
    console.warn('[Messenger Send] Gửi ảnh thành công nhưng gửi chữ thất bại:', error.response?.data?.error?.message || error.message);
  }

  // Lưu ngay vào CSDL để hiện tức thì
  const now = new Date();
  for (const item of sent) {
    if (!item.id) continue;
    await upsertMessage(conversation, {
      id: item.id,
      message: item.message || null,
      from: { id: platform === 'instagram' ? null : conversation.page_id },
      created_time: now.toISOString()
    }, String(userId));
  }
  const pool = await getPool();
  await pool.request()
    .input('id', sql.VarChar(128), conversation.id)
    .input('snippet', sql.NVarChar(1000), (cleanText || '[Hình ảnh]').slice(0, 1000))
    .input('now', sql.DateTime2, now)
    .input('readAt', sql.DateTime2, markRead ? now : null)
    .query('UPDATE dbo.MessengerConversations SET snippet=@snippet, updated_time=@now, read_at=COALESCE(@readAt, read_at) WHERE id=@id');
  // Đồng bộ lại để lấy link ảnh thật từ Facebook
  if (refresh) await syncConversationMessages(conversation.id, { force: true }).catch(() => {});
  return { sentCount: sent.length, messageIds: sent.map((item) => item.id).filter(Boolean) };
}

// ═══ WEBHOOK (ĐỒNG BỘ GẦN NHƯ TỨC THÌ KHI DEPLOY CÓ DOMAIN HTTPS) ═══
// appSecret: App Secret của Meta App người dùng đã thêm ở Kênh → Meta App của tôi
function verifyWebhookSignature(rawBody, signatureHeader, appSecret = process.env.FACEBOOK_APP_SECRET) {
  if (!appSecret || !rawBody || typeof signatureHeader !== 'string' || !signatureHeader.startsWith('sha256=')) return false;
  const expected = Buffer.from(`sha256=${crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')}`);
  const provided = Buffer.from(signatureHeader);
  return expected.length === provided.length && crypto.timingSafeEqual(expected, provided);
}

const webhookTimers = new Map();

// Sự kiện webhook chỉ dùng làm tín hiệu: gom trong 1,5 giây rồi đồng bộ lại từ Graph API
// Webhook Instagram gửi entry.id là ID tài khoản Instagram → igToPage đổi về Fanpage đã liên kết
function handleWebhookPayload(body, knownPageIds, igToPage = new Map()) {
  if (!['page', 'instagram'].includes(body?.object) || !Array.isArray(body.entry)) return 0;
  const isInstagram = body.object === 'instagram';
  let queued = 0;
  for (const entry of body.entry) {
    const entryId = String(entry.id || '');
    const pageId = isInstagram ? igToPage.get(entryId) : entryId;
    if (!pageId || !knownPageIds.has(pageId) || !Array.isArray(entry.messaging)) continue;
    const ownerId = isInstagram ? entryId : pageId;
    const customers = new Set();
    for (const event of entry.messaging) {
      const customerId = String(event.sender?.id) === ownerId ? event.recipient?.id : event.sender?.id;
      if (customerId) customers.add(String(customerId));
    }
    const pending = webhookTimers.get(pageId) || { timer: null, customers: new Set() };
    customers.forEach((id) => pending.customers.add(id));
    clearTimeout(pending.timer);
    pending.timer = setTimeout(() => {
      webhookTimers.delete(pageId);
      syncAfterWebhook(pageId, pending.customers).catch((error) => console.warn('[Messenger Webhook Sync]', error.message));
    }, 1500);
    webhookTimers.set(pageId, pending);
    queued += 1;
  }
  return queued;
}

async function syncAfterWebhook(pageId, customerIds) {
  const result = await syncPageConversations(pageId, { force: true });
  const ids = new Set(result.changed || []);
  if (customerIds.size) {
    const pool = await getPool();
    const request = pool.request().input('pageId', sql.VarChar(64), pageId);
    const customers = [...customerIds].slice(0, 20);
    customers.forEach((id, index) => request.input(`cu${index}`, sql.VarChar(64), id));
    const rows = await request.query(`SELECT id FROM dbo.MessengerConversations WHERE page_id=@pageId AND participant_id IN (${customers.map((_, index) => `@cu${index}`).join(', ')})`);
    rows.recordset.forEach((row) => ids.add(String(row.id)));
  }
  for (const id of ids) {
    await syncConversationAndNotify(id, { force: true }).catch(() => {});
  }
}

// ═══ TỰ ĐỘNG ĐỒNG BỘ ĐỊNH KỲ (mặc định 5 giây) ═══
async function getMessagingPageIds() {
  const pool = await getPool();
  const result = await pool.request().query('SELECT page_id, tasks_json FROM dbo.FacebookPages');
  const pageIds = new Set();
  for (const row of result.recordset) {
    let tasks = [];
    try { tasks = JSON.parse(row.tasks_json || '[]'); } catch {}
    if (tasks.includes('MESSAGING')) pageIds.add(String(row.page_id));
  }
  return [...pageIds];
}

let cycleRunning = false;
let lastInstagramRefresh = 0;
const webhookSubscriptionRetry = new Map(); // pageId:đuôi token -> thời điểm được thử lại (Infinity = đã đăng ký)
const WEBHOOK_SUBSCRIBE_RETRY_MS = 10 * 60 * 1000;

// Fanpage phải được đăng ký với app thì Meta mới gửi webhook tin nhắn (cần quyền pages_manage_metadata).
// Chỉ chạy khi đã cấu hình webhook (MESSENGER_VERIFY_TOKEN) — bản chạy thử trên máy không đụng tới cài đặt Fanpage.
// Ghi nhớ theo cả token Fanpage: token đổi (vd. đăng nhập lại bằng Meta App mới) thì đăng ký lại với app của token mới.
async function ensurePageWebhookSubscription(pageId) {
  const key = String(pageId);
  if (!process.env.MESSENGER_VERIFY_TOKEN) return false;
  const token = await getPageToken(key).catch(() => null);
  if (!token) return false;
  const retryKey = `${key}:${String(token).slice(-16)}`;
  if ((webhookSubscriptionRetry.get(retryKey) || 0) > Date.now()) return false;
  webhookSubscriptionRetry.set(retryKey, Date.now() + WEBHOOK_SUBSCRIBE_RETRY_MS);
  try {
    // Gộp với các trường app đã đăng ký sẵn (vd: feed của AI Bình luận) để không ghi đè lẫn nhau
    const fields = new Set(['messages', 'message_echoes']);
    try {
      const current = (await axios.get(`${GRAPH}/${key}/subscribed_apps`, { params: { access_token: token }, timeout: 15000 })).data.data || [];
      // Meta App của nick sở hữu Fanpage; nạp khi chạy để tránh vòng require
      const { getPageAppCredentials } = require('./FacebookTokenService');
      const appId = String((await getPageAppCredentials(key).catch(() => ({}))).appId || '');
      current
        .filter((item) => !appId || String(item.id) === appId)
        .forEach((item) => (item.subscribed_fields || []).forEach((field) => fields.add(field)));
    } catch (readError) {
      console.warn(`[Messenger Webhook] Không đọc được trường đã đăng ký của Fanpage ${key}:`, readError.response?.data?.error?.message || readError.message);
    }
    await axios.post(`${GRAPH}/${key}/subscribed_apps`, null, {
      params: { subscribed_fields: [...fields].join(','), access_token: token },
      timeout: 15000
    });
    webhookSubscriptionRetry.set(retryKey, Infinity);
    console.log(`[Messenger Webhook] Đã đăng ký nhận webhook tin nhắn cho Fanpage ${key}.`);
    return true;
  } catch (error) {
    console.warn(`[Messenger Webhook] Chưa đăng ký được webhook cho Fanpage ${key}:`, error.response?.data?.error?.message || error.message);
    return false;
  }
}

// Một vòng: làm mới danh sách hội thoại mọi Page → chỉ tải tin của hội thoại có thay đổi → chạy hook
async function runSyncCycle({ force = false } = {}) {
  if (cycleRunning) return;
  cycleRunning = true;
  try {
    const pageIds = await getMessagingPageIds();
    if (Date.now() - lastInstagramRefresh > INSTAGRAM_REFRESH_MS) {
      lastInstagramRefresh = Date.now();
      await instagramService.syncInstagramAccounts(pageIds, getPageToken).catch(() => {});
    }
    for (const pageId of pageIds) {
      await ensurePageWebhookSubscription(pageId).catch(() => {});
      let result;
      try {
        result = await syncPageConversations(pageId, { force });
      } catch (error) {
        result = { failed: error };
      }
      // Facebook lỗi tạm thời ở danh sách hội thoại: vẫn theo dõi trực tiếp các hội thoại đang hoạt động
      if (result.failed?.code === 'fb_unavailable' || (result.skipped && backoff.get(String(pageId))?.kind === 'fb_unavailable')) {
        await syncActiveConversationsDirectly(pageId).catch(() => {});
        continue;
      }
      if (result.failed) continue;
      for (const conversationId of result.changed || []) {
        await syncConversationAndNotify(conversationId, { force: true }).catch(() => {});
      }
    }
    autoSyncState.lastRunAt = new Date().toISOString();
  } finally {
    cycleRunning = false;
  }
}

// Đồng bộ thẳng tin nhắn của vài hội thoại có hoạt động trong 24 giờ (không cần danh sách hội thoại)
async function syncActiveConversationsDirectly(pageId) {
  const key = String(pageId);
  if (Date.now() - (lastDirectSync.get(key) || 0) < DIRECT_SYNC_INTERVAL_MS) return 0;
  lastDirectSync.set(key, Date.now());
  const pool = await getPool();
  const result = await pool.request()
    .input('pageId', sql.VarChar(64), key)
    .input('since', sql.DateTime2, new Date(Date.now() - REPLY_WINDOW_MS))
    .query(`SELECT TOP ${DIRECT_SYNC_LIMIT} id FROM dbo.MessengerConversations WHERE page_id=@pageId AND (updated_time >= @since OR last_customer_message_at >= @since) ORDER BY updated_time DESC`);
  for (const row of result.recordset) {
    await syncConversationAndNotify(row.id, { force: true }).catch(() => {});
  }
  return result.recordset.length;
}

function startMessengerAutoSync(intervalSeconds) {
  const seconds = Number(intervalSeconds);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    console.log('💬 [Messenger] Tự động đồng bộ đang tắt (MESSENGER_SYNC_INTERVAL_SECONDS=0).');
    return;
  }
  const interval = Math.max(3, seconds);
  autoSyncState.enabled = true;
  autoSyncState.intervalSeconds = interval;
  setTimeout(() => runSyncCycle().catch((error) => console.warn('[Messenger Auto Sync]', error.message)), 5000);
  setInterval(() => runSyncCycle().catch((error) => console.warn('[Messenger Auto Sync]', error.message)), interval * 1000);
  console.log(`💬 [Messenger] Tự động đồng bộ hộp thư Messenger + Instagram mỗi ${interval} giây.`);
}

function getAutoSyncInfo() {
  return { ...autoSyncState };
}

// Fanpage không còn tài khoản nào kết nối: xóa tin nhắn, hội thoại, cài đặt trả lời tự động và Instagram liên kết
// (đúng cam kết ở trang Xóa dữ liệu khi người dùng gỡ kết nối)
async function purgeDisconnectedPageData() {
  await ensureMessengerSchema();
  const pool = await getPool();
  const tables = ['MessengerMessages', 'MessengerConversations', 'MessengerAutoReplyLog', 'MessengerAutoReplySettings', 'InstagramAccounts'];
  const removed = {};
  for (const table of tables) {
    try {
      const result = await pool.request().query(`DELETE FROM dbo.${table} WHERE page_id NOT IN (SELECT page_id FROM dbo.FacebookPages)`);
      removed[table] = result.rowsAffected?.[0] ?? null;
    } catch (error) {
      removed[table] = `bỏ qua: ${error.message}`;
    }
  }
  tokenCache.clear();
  return removed;
}

module.exports = {
  ensurePageWebhookSubscription,
  purgeDisconnectedPageData,
  MAX_TEXT_LENGTH,
  MessengerError,
  ensureMessengerSchema,
  getAutoSyncInfo,
  getConversationRow,
  getPageStatus,
  getPageToken,
  getUnreadTotal,
  handleWebhookPayload,
  listConversations,
  listMessages,
  markConversationRead,
  clearTokenCache,
  onConversationSynced,
  onTokenExpired,
  runSyncCycle,
  sendMessage,
  startMessengerAutoSync,
  syncConversationAndNotify,
  syncConversationMessages,
  syncPageConversations,
  toPublicConversation,
  verifyWebhookSignature
};
