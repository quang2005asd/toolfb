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
  const [version, saltValue, ivValue, tagValue, ciphertextValue] = String(encrypted || '').split('.');
  if (version !== 'v1' || !saltValue || !ivValue || !tagValue || !ciphertextValue) {
    throw new Error('Stored Facebook token format is invalid.');
  }
  const salt = Buffer.from(saltValue, 'base64url');
  const iv = Buffer.from(ivValue, 'base64url');
  const tag = Buffer.from(tagValue, 'base64url');
  const ciphertext = Buffer.from(ciphertextValue, 'base64url');
  const decipher = crypto.createDecipheriv('aes-256-gcm', tokenKey(salt), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
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

async function syncFacebookPages(userId, accessToken) {
  await ensureSchema();
  const version = process.env.FB_GRAPH_VERSION || 'v19.0';
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
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    await new sql.Request(transaction)
      .input('userId', sql.VarChar(64), String(userId))
      .query('DELETE FROM dbo.FacebookPages WHERE facebook_user_id=@userId');

    for (const page of usablePages) {
      await new sql.Request(transaction)
        .input('userId', sql.VarChar(64), String(userId))
        .input('pageId', sql.VarChar(64), String(page.id))
        .input('pageName', sql.NVarChar(200), String(page.name || 'Facebook Page').slice(0, 200))
        .input('category', sql.NVarChar(200), page.category ? String(page.category).slice(0, 200) : null)
        .input('link', sql.NVarChar(500), page.link ? String(page.link).slice(0, 500) : null)
        .input('pageToken', sql.NVarChar(sql.MAX), encryptToken(page.access_token))
        .input('tasks', sql.NVarChar(sql.MAX), JSON.stringify(page.tasks || []))
        .query(`
          INSERT INTO dbo.FacebookPages (facebook_user_id,page_id,page_name,category,page_link,page_access_token_encrypted,tasks_json,updated_at)
          VALUES (@userId,@pageId,@pageName,@category,@link,@pageToken,@tasks,SYSUTCDATETIME());
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
    tasks: page.tasks || []
  }));
}

async function getConnectedPages(userId) {
  await ensureSchema();
  const pool = await getPool();
  const result = await pool.request()
    .input('userId', sql.VarChar(64), String(userId))
    .query('SELECT page_id,page_name,category,page_link,tasks_json FROM dbo.FacebookPages WHERE facebook_user_id=@userId ORDER BY page_name');
  return result.recordset.map((page) => ({
    id: page.page_id,
    name: page.page_name,
    category: page.category || 'Facebook Page',
    link: page.page_link,
    platform: 'facebook',
    connected: true,
    tasks: JSON.parse(page.tasks_json || '[]')
  }));
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
  encryptToken,
  ensureSchema,
  getConnectedPages,
  getStoredPageAccessToken,
  getStoredUserAccessToken,
  getStoredUserAvatar,
  saveFacebookUser,
  saveManualFacebookPage,
  saveUserAvatar,
  syncFacebookPages
};
