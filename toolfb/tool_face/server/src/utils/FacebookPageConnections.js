const crypto = require('crypto');
const axios = require('axios');
const { sql, getPool } = require('../../config/db');

let schemaPromise;

function tokenKey(salt) {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error('SESSION_SECRET must contain at least 32 characters.');
  return crypto.scryptSync(secret, salt, 32);
}

function encryptToken(token) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', tokenKey(salt), iv);
  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', salt, iv, tag, ciphertext].map((part) => Buffer.isBuffer(part) ? part.toString('base64url') : part).join('.');
}

function decryptToken(encrypted) {
  try {
    const [version, saltValue, ivValue, tagValue, ciphertextValue] = String(encrypted || '').split('.');
    if (version !== 'v1' || !saltValue || !ivValue || !tagValue || !ciphertextValue) {
      return null;
    }
    const salt = Buffer.from(saltValue, 'base64url');
    const iv = Buffer.from(ivValue, 'base64url');
    const tag = Buffer.from(tagValue, 'base64url');
    const ciphertext = Buffer.from(ciphertextValue, 'base64url');
    const decipher = crypto.createDecipheriv('aes-256-gcm', tokenKey(salt), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch (err) {
    return null;
  }
}

async function ensureSchema() {
  if (!schemaPromise) {
    schemaPromise = getPool().then((pool) => pool.request().query(`
      IF OBJECT_ID(N'dbo.FacebookUsers', N'U') IS NULL
      BEGIN
        CREATE TABLE dbo.FacebookUsers (
          facebook_user_id varchar(64) NOT NULL PRIMARY KEY,
          display_name nvarchar(120) NOT NULL,
          user_access_token_encrypted nvarchar(max) NOT NULL,
          avatar_url nvarchar(1000) NULL,
          token_expires_at datetime2 NULL,
          updated_at datetime2 NOT NULL CONSTRAINT DF_FacebookUsers_updated_at DEFAULT SYSUTCDATETIME()
        );
      END;
      IF COL_LENGTH('dbo.FacebookUsers', 'avatar_url') IS NULL
      BEGIN
        ALTER TABLE dbo.FacebookUsers ADD avatar_url nvarchar(1000) NULL;
      END;

      IF OBJECT_ID(N'dbo.ConnectedFbAccounts', N'U') IS NULL
      BEGIN
        CREATE TABLE dbo.ConnectedFbAccounts (
          app_user_id varchar(64) NOT NULL,
          fb_user_id varchar(64) NOT NULL,
          fb_name nvarchar(150) NOT NULL,
          fb_avatar nvarchar(1000) NULL,
          access_token_encrypted nvarchar(max) NOT NULL,
          updated_at datetime2 NOT NULL CONSTRAINT DF_ConnectedFbAccounts_updated_at DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_ConnectedFbAccounts PRIMARY KEY (app_user_id, fb_user_id)
        );
      END;

      IF OBJECT_ID(N'dbo.FacebookPages', N'U') IS NULL
      BEGIN
        CREATE TABLE dbo.FacebookPages (
          facebook_user_id varchar(64) NOT NULL,
          page_id varchar(64) NOT NULL,
          page_name nvarchar(200) NOT NULL,
          category nvarchar(200) NULL,
          page_link nvarchar(500) NULL,
          page_access_token_encrypted nvarchar(max) NOT NULL,
          tasks_json nvarchar(max) NULL,
          updated_at datetime2 NOT NULL CONSTRAINT DF_FacebookPages_updated_at DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_FacebookPages PRIMARY KEY (facebook_user_id, page_id)
        );
      END;

      IF COL_LENGTH('dbo.FacebookPages', 'fb_account_id') IS NULL
      BEGIN
        ALTER TABLE dbo.FacebookPages ADD fb_account_id varchar(64) NULL;
      END;
      IF COL_LENGTH('dbo.FacebookPages', 'fb_account_name') IS NULL
      BEGIN
        ALTER TABLE dbo.FacebookPages ADD fb_account_name nvarchar(150) NULL;
      END;
      IF COL_LENGTH('dbo.FacebookPages', 'fb_account_avatar') IS NULL
      BEGIN
        ALTER TABLE dbo.FacebookPages ADD fb_account_avatar nvarchar(1000) NULL;
      END;
      IF COL_LENGTH('dbo.FacebookPages', 'is_valid') IS NULL
      BEGIN
        ALTER TABLE dbo.FacebookPages ADD is_valid bit NULL;
      END;

      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_FacebookPages_page_id' AND object_id = OBJECT_ID(N'dbo.FacebookPages'))
      BEGIN
        CREATE INDEX IX_FacebookPages_page_id ON dbo.FacebookPages(page_id, updated_at DESC);
      END;
    `)).catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
}

async function saveFacebookUser(user, accessToken, expiresInSeconds) {
  await ensureSchema();
  const pool = await getPool();
  const expiresAt = Number.isFinite(expiresInSeconds) && expiresInSeconds > 0
    ? new Date(Date.now() + expiresInSeconds * 1000)
    : null;
  const encryptedToken = encryptToken(accessToken);
  const avatarUrl = user.picture?.data?.url || user.avatar || null;
  await pool.request()
    .input('userId', sql.VarChar(64), String(user.id))
    .input('name', sql.NVarChar(120), String(user.name || 'Facebook user').slice(0, 120))
    .input('token', sql.NVarChar(sql.MAX), encryptedToken)
    .input('avatar', sql.NVarChar(1000), avatarUrl)
    .input('expiresAt', sql.DateTime2, expiresAt)
    .query(`
      UPDATE dbo.FacebookUsers
      SET display_name=@name, user_access_token_encrypted=@token, avatar_url=COALESCE(@avatar, avatar_url), token_expires_at=@expiresAt, updated_at=SYSUTCDATETIME()
      WHERE facebook_user_id=@userId;
      IF @@ROWCOUNT=0
        INSERT INTO dbo.FacebookUsers (facebook_user_id, display_name, user_access_token_encrypted, avatar_url, token_expires_at)
        VALUES (@userId, @name, @token, @avatar, @expiresAt);
    `);
}

async function getStoredUserAvatar(userId) {
  await ensureSchema();
  const pool = await getPool();
  const result = await pool.request()
    .input('userId', sql.VarChar(64), String(userId))
    .query('SELECT avatar_url FROM dbo.FacebookUsers WHERE facebook_user_id=@userId');
  return result.recordset[0]?.avatar_url || null;
}

async function saveUserAvatar(userId, avatarUrl) {
  await ensureSchema();
  const pool = await getPool();
  await pool.request()
    .input('userId', sql.VarChar(64), String(userId))
    .input('avatar', sql.NVarChar(1000), avatarUrl)
    .query('UPDATE dbo.FacebookUsers SET avatar_url=@avatar WHERE facebook_user_id=@userId');
}

async function getStoredUserAccessToken(userId) {
  await ensureSchema();
  const pool = await getPool();
  const result = await pool.request()
    .input('userId', sql.VarChar(64), String(userId))
    .query('SELECT user_access_token_encrypted FROM dbo.FacebookUsers WHERE facebook_user_id=@userId');
  const encrypted = result.recordset[0]?.user_access_token_encrypted;
  return encrypted ? decryptToken(encrypted) : null;
}

async function syncFacebookPages(userId, accessToken, fbAccountInfo = null) {
  await ensureSchema();
  const version = process.env.FB_GRAPH_VERSION || 'v19.0';

  // Lấy thông tin tài khoản Facebook nếu chưa được truyền
  let fbUser = fbAccountInfo;
  if (!fbUser || !fbUser.id) {
    try {
      const meRes = await axios.get(`https://graph.facebook.com/${version}/me`, {
        params: { fields: 'id,name,picture.width(150).height(150)', access_token: accessToken },
        timeout: 15000
      });
      fbUser = {
        id: meRes.data.id,
        name: meRes.data.name || 'Facebook User',
        avatar: meRes.data.picture?.data?.url || null
      };
    } catch (err) {
      console.warn('[syncFacebookPages] Không lấy được thông tin /me:', err.message);
      fbUser = { id: 'unknown', name: 'Facebook User', avatar: null };
    }
  }

  const pool = await getPool();

  // Lưu thông tin Nick Facebook vào dbo.ConnectedFbAccounts
  if (fbUser.id && fbUser.id !== 'unknown') {
    try {
      const encryptedAccToken = encryptToken(accessToken);
      await pool.request()
        .input('appUserId', sql.VarChar(64), String(userId))
        .input('fbUserId', sql.VarChar(64), String(fbUser.id))
        .input('fbName', sql.NVarChar(150), String(fbUser.name || 'Facebook User').slice(0, 150))
        .input('fbAvatar', sql.NVarChar(1000), fbUser.avatar || null)
        .input('fbToken', sql.NVarChar(sql.MAX), encryptedAccToken)
        .query(`
          UPDATE dbo.ConnectedFbAccounts
          SET fb_name=@fbName, fb_avatar=@fbAvatar, access_token_encrypted=@fbToken, updated_at=SYSUTCDATETIME()
          WHERE app_user_id=@appUserId AND fb_user_id=@fbUserId;
          IF @@ROWCOUNT = 0
            INSERT INTO dbo.ConnectedFbAccounts (app_user_id, fb_user_id, fb_name, fb_avatar, access_token_encrypted, updated_at)
            VALUES (@appUserId, @fbUserId, @fbName, @fbAvatar, @fbToken, SYSUTCDATETIME());
        `);
    } catch (saveAccErr) {
      console.warn('[ConnectedFbAccounts] Lỗi lưu nick Facebook:', saveAccErr.message);
    }
  }

  // Tải danh sách Pages của Nick Facebook này
  let nextUrl = `https://graph.facebook.com/${version}/me/accounts`;
  let firstPage = true;
  const pages = [];

  while (nextUrl && pages.length < 1000) {
    const response = await axios.get(nextUrl, firstPage ? {
      params: { fields: 'id,name,category,link,access_token,tasks', limit: 100, access_token: accessToken },
      timeout: 20000
    } : { timeout: 20000 });
    firstPage = false;
    pages.push(...(response.data.data || []));
    nextUrl = response.data.paging?.next || null;
  }
  if (nextUrl) throw new Error('Too many Facebook Pages to synchronize in one request.');

  const usablePages = pages.filter((page) => page.id && page.access_token);
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    // Chỉ xóa các Page cũ của chính nick Facebook này, không xóa page của nick khác!
    if (fbUser.id && fbUser.id !== 'unknown') {
      await new sql.Request(transaction)
        .input('userId', sql.VarChar(64), String(userId))
        .input('fbAccountId', sql.VarChar(64), String(fbUser.id))
        .query('DELETE FROM dbo.FacebookPages WHERE facebook_user_id=@userId AND fb_account_id=@fbAccountId');
    }

    for (const page of usablePages) {
      await new sql.Request(transaction)
        .input('userId', sql.VarChar(64), String(userId))
        .input('pageId', sql.VarChar(64), String(page.id))
        .input('pageName', sql.NVarChar(200), String(page.name || 'Facebook Page').slice(0, 200))
        .input('category', sql.NVarChar(200), page.category ? String(page.category).slice(0, 200) : null)
        .input('link', sql.NVarChar(500), page.link ? String(page.link).slice(0, 500) : null)
        .input('pageToken', sql.NVarChar(sql.MAX), encryptToken(page.access_token))
        .input('tasks', sql.NVarChar(sql.MAX), JSON.stringify(page.tasks || []))
        .input('fbAccountId', sql.VarChar(64), fbUser.id !== 'unknown' ? String(fbUser.id) : null)
        .input('fbAccountName', sql.NVarChar(150), fbUser.name ? String(fbUser.name).slice(0, 150) : null)
        .input('fbAccountAvatar', sql.NVarChar(1000), fbUser.avatar || null)
        .query(`
          UPDATE dbo.FacebookPages
          SET page_name=@pageName, category=@category, page_link=@link,
              page_access_token_encrypted=@pageToken, tasks_json=@tasks,
              fb_account_id=@fbAccountId, fb_account_name=@fbAccountName, fb_account_avatar=@fbAccountAvatar,
              updated_at=SYSUTCDATETIME()
          WHERE facebook_user_id=@userId AND page_id=@pageId;
          IF @@ROWCOUNT = 0
            INSERT INTO dbo.FacebookPages (facebook_user_id,page_id,page_name,category,page_link,page_access_token_encrypted,tasks_json,fb_account_id,fb_account_name,fb_account_avatar,updated_at)
            VALUES (@userId,@pageId,@pageName,@category,@link,@pageToken,@tasks,@fbAccountId,@fbAccountName,@fbAccountAvatar,SYSUTCDATETIME());
        `);
    }
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }

  return usablePages.map((page) => ({
    id: String(page.id),
    name: page.name || 'Facebook Page',
    category: page.category || 'Facebook Page',
    link: page.link || null,
    platform: 'facebook',
    connected: true,
    tasks: page.tasks || [],
    fbAccountId: fbUser.id !== 'unknown' ? fbUser.id : null,
    fbAccountName: fbUser.name || null,
    fbAccountAvatar: fbUser.avatar || null
  }));
}

async function getConnectedPages(userId) {
  await ensureSchema();
  const pool = await getPool();
  const result = await pool.request()
    .input('userId', sql.VarChar(64), String(userId))
    .query(`
      SELECT page_id, page_name, category, page_link, tasks_json,
             fb_account_id, fb_account_name, fb_account_avatar, is_valid
      FROM dbo.FacebookPages
      WHERE facebook_user_id=@userId
      ORDER BY COALESCE(fb_account_name, N''), page_name
    `);
  return result.recordset.map((page) => ({
    id: page.page_id,
    name: page.page_name,
    category: page.category || 'Facebook Page',
    link: page.page_link,
    platform: 'facebook',
    connected: true,
    isValid: page.is_valid !== 0 && page.is_valid !== false,
    tasks: JSON.parse(page.tasks_json || '[]'),
    fbAccountId: page.fb_account_id || null,
    fbAccountName: page.fb_account_name || null,
    fbAccountAvatar: page.fb_account_avatar || null
  }));
}

async function getConnectedFbAccounts(userId) {
  await ensureSchema();
  const pool = await getPool();
  const result = await pool.request()
    .input('userId', sql.VarChar(64), String(userId))
    .query(`
      SELECT a.fb_user_id AS id, a.fb_name AS name, a.fb_avatar AS avatar, a.updated_at AS updatedAt,
             COUNT(p.page_id) AS pageCount
      FROM dbo.ConnectedFbAccounts a
      LEFT JOIN dbo.FacebookPages p ON p.facebook_user_id = a.app_user_id AND p.fb_account_id = a.fb_user_id
      WHERE a.app_user_id = @userId
      GROUP BY a.fb_user_id, a.fb_name, a.fb_avatar, a.updated_at
      ORDER BY a.fb_name ASC
    `);
  return result.recordset.map((r) => ({
    id: r.id,
    name: r.name,
    avatar: r.avatar,
    updatedAt: r.updatedAt,
    pageCount: Number(r.pageCount || 0)
  }));
}

async function disconnectFbAccount(userId, fbAccountId) {
  await ensureSchema();
  const pool = await getPool();
  await pool.request()
    .input('userId', sql.VarChar(64), String(userId))
    .input('fbAccountId', sql.VarChar(64), String(fbAccountId))
    .query(`
      DELETE FROM dbo.ConnectedFbAccounts WHERE app_user_id=@userId AND fb_user_id=@fbAccountId;
      DELETE FROM dbo.FacebookPages WHERE facebook_user_id=@userId AND fb_account_id=@fbAccountId;
    `);
  return true;
}

async function syncAllConnectedFbAccounts(userId) {
  await ensureSchema();
  const pool = await getPool();
  const accountsRes = await pool.request()
    .input('userId', sql.VarChar(64), String(userId))
    .query('SELECT fb_user_id, fb_name, fb_avatar, access_token_encrypted FROM dbo.ConnectedFbAccounts WHERE app_user_id=@userId');

  const results = [];
  for (const acc of accountsRes.recordset) {
    try {
      const token = decryptToken(acc.access_token_encrypted);
      const pages = await syncFacebookPages(userId, token, {
        id: acc.fb_user_id,
        name: acc.fb_name,
        avatar: acc.fb_avatar
      });
      results.push({ id: acc.fb_user_id, name: acc.fb_name, success: true, count: pages.length });
    } catch (err) {
      console.warn(`[syncAllConnectedFbAccounts] Lỗi đồng bộ nick ${acc.fb_name}:`, err.message);
      results.push({ id: acc.fb_user_id, name: acc.fb_name, success: false, error: err.message });
    }
  }
  return results;
}

async function getStoredPageAccessToken(pageId) {
  await ensureSchema();
  const pool = await getPool();
  const result = await pool.request()
    .input('pageId', sql.VarChar(64), String(pageId))
    .query('SELECT TOP 1 page_access_token_encrypted FROM dbo.FacebookPages WHERE page_id=@pageId ORDER BY updated_at DESC');
  const encrypted = result.recordset[0]?.page_access_token_encrypted;
  if (!encrypted) return null;
  try {
    return decryptToken(encrypted);
  } catch (decryptErr) {
    console.error(`[Token Decrypt Error] Không thể giải mã token cho Fanpage ${pageId}: ${decryptErr.message}`);
    throw new Error(`Token của Fanpage ${pageId} không giải mã được do SESSION_SECRET thay đổi. Vui lòng vào trang Kênh bấm 'Đồng bộ từ Facebook' hoặc cập nhật lại Page Token.`);
  }
}


async function saveManualFacebookPage(userId, pageId, pageToken) {
  await ensureSchema();
  const version = process.env.FB_GRAPH_VERSION || 'v19.0';
  const response = await axios.get(`https://graph.facebook.com/${version}/${pageId}`, {
    params: {
      fields: 'id,name,category,link',
      access_token: pageToken
    },
    timeout: 15000
  });
  const pageData = response.data;
  const pool = await getPool();
  await pool.request()
    .input('userId', sql.VarChar(64), String(userId))
    .input('pageId', sql.VarChar(64), String(pageData.id || pageId))
    .input('pageName', sql.NVarChar(200), String(pageData.name || 'Facebook Page').slice(0, 200))
    .input('category', sql.NVarChar(200), pageData.category ? String(pageData.category).slice(0, 200) : null)
    .input('link', sql.NVarChar(500), pageData.link ? String(pageData.link).slice(0, 500) : null)
    .input('pageToken', sql.NVarChar(sql.MAX), encryptToken(pageToken))
    .input('tasks', sql.NVarChar(sql.MAX), JSON.stringify(['MANAGE', 'CREATE_CONTENT']))
    .query(`
      UPDATE dbo.FacebookPages
      SET page_name=@pageName, category=@category, page_link=@link, page_access_token_encrypted=@pageToken, tasks_json=@tasks, updated_at=SYSUTCDATETIME()
      WHERE facebook_user_id=@userId AND page_id=@pageId;
      IF @@ROWCOUNT = 0
        INSERT INTO dbo.FacebookPages (facebook_user_id, page_id, page_name, category, page_link, page_access_token_encrypted, tasks_json, updated_at)
        VALUES (@userId, @pageId, @pageName, @category, @link, @pageToken, @tasks, SYSUTCDATETIME());
    `);
  return {
    id: String(pageData.id || pageId),
    name: pageData.name || 'Facebook Page',
    category: pageData.category || 'Facebook Page',
    link: pageData.link || null,
    platform: 'facebook',
    connected: true,
    tasks: ['MANAGE', 'CREATE_CONTENT']
  };
}

async function disconnectFacebookPage(userId, pageId) {
  await ensureSchema();
  const pool = await getPool();
  await pool.request()
    .input('userId', sql.VarChar(64), String(userId))
    .input('pageId', sql.VarChar(64), String(pageId))
    .query('DELETE FROM dbo.FacebookPages WHERE facebook_user_id=@userId AND page_id=@pageId');
  return true;
}

module.exports = {
  decryptToken,
  disconnectFacebookPage,
  disconnectFbAccount,
  encryptToken,
  ensureSchema,
  getConnectedFbAccounts,
  getConnectedPages,
  getStoredPageAccessToken,
  getStoredUserAccessToken,
  getStoredUserAvatar,
  saveFacebookUser,
  saveManualFacebookPage,
  saveUserAvatar,
  syncAllConnectedFbAccounts,
  syncFacebookPages
};
