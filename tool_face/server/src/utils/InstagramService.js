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

module.exports = {
  ensureInstagramSchema,
  getInstagramAccountForPage,
  listInstagramAccounts,
  syncInstagramAccount,
  syncInstagramAccounts
};
