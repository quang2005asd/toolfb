/**
 * InstagramService.js
 * Tài khoản Instagram Business / Creator được liên kết với các Fanpage đã kết nối.
 * Instagram dùng chung Page Access Token của Fanpage (quyền instagram_basic, instagram_manage_messages).
 */
const axios = require('axios');
const { sql, getPool } = require('../../config/db');
const { getFacebookPageAccessToken } = require('./FacebookPageAccessToken');

const GRAPH = `https://graph.facebook.com/${process.env.FB_GRAPH_VERSION || 'v19.0'}`;
const ACCOUNT_FIELDS = 'instagram_business_account{id,username,name,profile_picture_url,followers_count,follows_count,media_count}';
const CACHE_MS = 30 * 1000;

const accountCache = new Map(); // pageId -> { account, expiresAt }
let schemaPromise = null;

async function ensureInstagramSchema() {
  if (!schemaPromise) {
    schemaPromise = getPool().then((pool) => pool.request().query(`
      IF OBJECT_ID(N'dbo.InstagramAccounts', N'U') IS NULL
      BEGIN
        CREATE TABLE dbo.InstagramAccounts (
          ig_id varchar(64) NOT NULL PRIMARY KEY,
          page_id varchar(64) NOT NULL,
          username nvarchar(200) NULL,
          name nvarchar(200) NULL,
          profile_picture_url nvarchar(1000) NULL,
          followers_count int NULL,
          follows_count int NULL,
          media_count int NULL,
          updated_at datetime2 NOT NULL DEFAULT SYSUTCDATETIME()
        );
        CREATE INDEX IX_InstagramAccounts_page ON dbo.InstagramAccounts(page_id);
      END;
    `)).catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
}

function toPublicAccount(row) {
  return {
    id: row.ig_id,
    pageId: row.page_id,
    username: row.username,
    name: row.name || row.username,
    profilePictureUrl: /^https?:\/\//i.test(row.profile_picture_url || '') ? row.profile_picture_url : null,
    followersCount: row.followers_count ?? null,
    followsCount: row.follows_count ?? null,
    mediaCount: row.media_count ?? null,
    profileUrl: row.username ? `https://www.instagram.com/${encodeURIComponent(row.username)}/` : null,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at
  };
}

// Lấy (hoặc gỡ) tài khoản Instagram liên kết với một Fanpage từ Graph API rồi lưu CSDL
async function syncInstagramAccount(pageId, tokenProvider = getFacebookPageAccessToken) {
  await ensureInstagramSchema();
  const key = String(pageId);
  const token = await tokenProvider(key);
  const response = await axios.get(`${GRAPH}/${key}`, { params: { fields: ACCOUNT_FIELDS, access_token: token }, timeout: 15000 });
  const account = response.data?.instagram_business_account || null;
  const pool = await getPool();
  accountCache.delete(key);
  if (!account?.id) {
    await pool.request().input('pageId', sql.VarChar(64), key).query('DELETE FROM dbo.InstagramAccounts WHERE page_id=@pageId');
    return null;
  }
  await pool.request()
    .input('igId', sql.VarChar(64), String(account.id))
    .input('pageId', sql.VarChar(64), key)
    .query('DELETE FROM dbo.InstagramAccounts WHERE page_id=@pageId AND ig_id<>@igId');
  await pool.request()
    .input('igId', sql.VarChar(64), String(account.id))
    .input('pageId', sql.VarChar(64), key)
    .input('username', sql.NVarChar(200), account.username || null)
    .input('name', sql.NVarChar(200), account.name || null)
    .input('picture', sql.NVarChar(1000), account.profile_picture_url ? String(account.profile_picture_url).slice(0, 1000) : null)
    .input('followers', sql.Int, Number.isFinite(account.followers_count) ? account.followers_count : null)
    .input('follows', sql.Int, Number.isFinite(account.follows_count) ? account.follows_count : null)
    .input('media', sql.Int, Number.isFinite(account.media_count) ? account.media_count : null)
    .input('now', sql.DateTime2, new Date())
    .query(`
      UPDATE dbo.InstagramAccounts
      SET page_id=@pageId, username=@username, name=@name, profile_picture_url=@picture,
          followers_count=@followers, follows_count=@follows, media_count=@media, updated_at=@now
      WHERE ig_id=@igId;
      IF @@ROWCOUNT = 0
        INSERT INTO dbo.InstagramAccounts (ig_id, page_id, username, name, profile_picture_url, followers_count, follows_count, media_count, updated_at)
        VALUES (@igId, @pageId, @username, @name, @picture, @followers, @follows, @media, @now);
    `);
  return toPublicAccount({
    ig_id: String(account.id),
    page_id: key,
    username: account.username,
    name: account.name,
    profile_picture_url: account.profile_picture_url,
    followers_count: account.followers_count,
    follows_count: account.follows_count,
    media_count: account.media_count,
    updated_at: new Date()
  });
}

async function syncInstagramAccounts(pageIds, tokenProvider) {
  return Promise.all(pageIds.map(async (pageId) => {
    try {
      const account = await syncInstagramAccount(pageId, tokenProvider);
      return { pageId: String(pageId), success: true, account };
    } catch (error) {
      return { pageId: String(pageId), success: false, message: error.response?.data?.error?.message || error.message };
    }
  }));
}

async function listInstagramAccounts(pageIds) {
  if (!pageIds.length) return [];
  await ensureInstagramSchema();
  const pool = await getPool();
  const request = pool.request();
  pageIds.forEach((id, index) => request.input(`pg${index}`, sql.VarChar(64), String(id)));
  const result = await request.query(`SELECT * FROM dbo.InstagramAccounts WHERE page_id IN (${pageIds.map((_, index) => `@pg${index}`).join(', ')}) ORDER BY username`);
  return result.recordset.map(toPublicAccount);
}

async function getInstagramAccountForPage(pageId) {
  const key = String(pageId);
  const cached = accountCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.account;
  await ensureInstagramSchema();
  const pool = await getPool();
  const result = await pool.request()
    .input('pageId', sql.VarChar(64), key)
    .query('SELECT TOP 1 * FROM dbo.InstagramAccounts WHERE page_id=@pageId');
  const account = result.recordset[0] || null;
  accountCache.set(key, { account, expiresAt: Date.now() + CACHE_MS });
  return account;
}

// ═══ CHẨN ĐOÁN ĐỌC TIN NHẮN INSTAGRAM ═══
const REQUIRED_SCOPES = ['instagram_basic', 'instagram_manage_messages', 'pages_manage_metadata', 'pages_messaging'];
const ACCESS_HINT = 'Instagram: Cài đặt → Tin nhắn và lượt phản hồi tin → Công cụ đã kết nối → bật "Cho phép truy cập tin nhắn".';
const STANDARD_ACCESS_HINT = [
  'Quyền đã đủ nhưng Meta không trả về hội thoại nào: app Meta chưa được duyệt (Standard Access) chỉ thấy tin của người có vai trò trong app / Fanpage, tin của người lạ bị ẩn.',
  '• Để thử: thêm người nhắn làm Tester (developers.facebook.com → Vai trò trong ứng dụng) và liên kết Instagram của họ với Facebook đó, hoặc nhắn từ tài khoản của admin app.',
  '• Để nhận tin mọi khách: xác minh doanh nghiệp + App Review xin Advanced Access cho instagram_manage_messages.',
  `• Kiểm tra ${ACCESS_HINT}`
].join('\n');

function graphError(error) {
  const fb = error.response?.data?.error;
  return fb ? { code: fb.code, message: fb.message } : { code: null, message: error.message };
}

// Kiểm tra từng bước cần có để tool đọc được Instagram Direct; mỗi bước: ok | warn | error
async function diagnoseMessaging(pageId, tokenProvider = getFacebookPageAccessToken) {
  const key = String(pageId);
  const checks = [];
  const add = (id, status, label, detail = null) => checks.push({ id, status, label, detail });
  const result = (extra = {}) => ({ pageId: key, checks, ok: checks.every((check) => check.status === 'ok'), ...extra });

  let token;
  try {
    token = await tokenProvider(key);
  } catch (error) {
    add('token', 'error', 'Token Fanpage', `Không lấy được token: ${graphError(error).message}. Hãy kết nối lại Facebook ở tab Facebook.`);
    return result();
  }

  try {
    const { data } = await axios.get(`${GRAPH}/debug_token`, { params: { input_token: token, access_token: token }, timeout: 15000 });
    const info = data.data || {};
    const scopes = info.scopes || [];
    const missing = REQUIRED_SCOPES.filter((scope) => !scopes.includes(scope));
    add('token', info.is_valid === false ? 'error' : 'ok', 'Token Fanpage còn hiệu lực',
      info.is_valid === false ? 'Token đã hết hạn — kết nối lại Facebook ở tab Facebook.' : null);
    add('scopes', missing.length ? 'error' : 'ok', 'Đủ quyền đọc / gửi tin nhắn Instagram',
      missing.length ? `Thiếu quyền: ${missing.join(', ')}. Đăng nhập lại Facebook và tích đủ các quyền này.` : REQUIRED_SCOPES.join(', '));
  } catch (error) {
    add('token', 'error', 'Token Fanpage còn hiệu lực', graphError(error).message);
    return result();
  }

  const pool = await getPool();
  const pageRow = (await pool.request().input('pageId', sql.VarChar(64), key)
    .query('SELECT TOP 1 tasks_json FROM dbo.FacebookPages WHERE page_id=@pageId')).recordset[0];
  let tasks = [];
  try { tasks = JSON.parse(pageRow?.tasks_json || '[]'); } catch {}
  add('task', tasks.includes('MESSAGING') ? 'ok' : 'error', 'Nick Facebook có quyền nhắn tin trên Fanpage',
    tasks.includes('MESSAGING') ? null : 'Nick Facebook đã kết nối chưa có quyền MESSAGING trên Fanpage này (cần vai trò Quản trị viên hoặc có quyền Tin nhắn).');

  let igAccount = null;
  try {
    const { data } = await axios.get(`${GRAPH}/${key}`, { params: { fields: 'instagram_business_account{id,username}', access_token: token }, timeout: 15000 });
    igAccount = data.instagram_business_account || null;
    add('linked', igAccount ? 'ok' : 'error', 'Fanpage đã liên kết Instagram chuyên nghiệp',
      igAccount ? `@${igAccount.username}` : 'Chưa liên kết: chuyển Instagram sang tài khoản chuyên nghiệp rồi liên kết với Fanpage trong Meta Business Suite.');
  } catch (error) {
    add('linked', 'error', 'Fanpage đã liên kết Instagram chuyên nghiệp', graphError(error).message);
  }
  if (!igAccount) return result();

  let conversationCount = null;
  try {
    const { data } = await axios.get(`${GRAPH}/${key}/conversations`, {
      params: { platform: 'instagram', fields: 'id', limit: 25, access_token: token },
      timeout: 15000
    });
    conversationCount = (data.data || []).length;
    add('read', 'ok', 'Đọc được hộp thư Instagram qua API', null);
  } catch (error) {
    const fb = graphError(error);
    const accessDisabled = [3, 10, 100, 200, 230].includes(fb.code);
    add('read', 'error', 'Đọc được hộp thư Instagram qua API', accessDisabled ? `${ACCESS_HINT} (Facebook báo: ${fb.message})` : fb.message);
    return result({ instagram: igAccount });
  }

  add('visible', conversationCount > 0 ? 'ok' : 'warn', 'Meta trả về hội thoại Instagram',
    conversationCount > 0 ? `${conversationCount}${conversationCount >= 25 ? '+' : ''} hội thoại.` : STANDARD_ACCESS_HINT);
  return result({ instagram: igAccount, conversationCount });
}

module.exports = {
  diagnoseMessaging,
  ensureInstagramSchema,
  getInstagramAccountForPage,
  listInstagramAccounts,
  syncInstagramAccount,
  syncInstagramAccounts
};
