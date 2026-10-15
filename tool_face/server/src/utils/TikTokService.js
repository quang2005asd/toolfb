/**
 * TikTokService.js
 * Quản lý tài khoản TikTok liên kết thông qua Cookie / SessionID (Cách 2)
 */
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { sql, getPool } = require('../../config/db');

/**
 * Phân tích chuỗi cookie hoặc JSON cookie thành định dạng chuẩn
 */
function parseCookies(input) {
  if (!input) {
    throw new Error('Vui lòng nhập Cookie hoặc Session ID của tài khoản TikTok.');
  }

  const raw = String(input).trim();
  let cookiesArray = [];
  let sessionId = null;

  // Trường hợp 1: Nhập mảng JSON (từ extension Cookie-Editor hoặc J2TEAM Cookies)
  if ((raw.startsWith('[') && raw.endsWith(']')) || (raw.startsWith('{') && raw.endsWith('}'))) {
    try {
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of list) {
        if (!item.name || item.value === undefined) continue;
        const name = String(item.name).trim();
        const value = String(item.value).trim();
        if (name === 'sessionid' || name === 'sessionid_ss') {
          sessionId = value;
        }
        cookiesArray.push({
          name,
          value,
          domain: item.domain || '.tiktok.com',
          path: item.path || '/'
        });
      }
    } catch (_) {}
  }

  // Trường hợp 2: Chuỗi cookie key=value; key2=val2...
  if (cookiesArray.length === 0 && raw.includes('=')) {
    const pairs = raw.split(';');
    for (const pair of pairs) {
      const trimmed = pair.trim();
      if (!trimmed) continue;
      const idx = trimmed.indexOf('=');
      if (idx === -1) continue;
      const name = trimmed.substring(0, idx).trim();
      const value = trimmed.substring(idx + 1).trim();
      if (!name) continue;
      if (name === 'sessionid' || name === 'sessionid_ss') {
        sessionId = value;
      }
      cookiesArray.push({
        name,
        value,
        domain: '.tiktok.com',
        path: '/'
      });
    }
  }

  // Trường hợp 3: Người dùng chỉ nhập mỗi mã sessionid (chuỗi hex/alphanumeric)
  if (cookiesArray.length === 0 && raw.length >= 20 && !raw.includes(' ') && !raw.includes('\n')) {
    sessionId = raw;
    cookiesArray.push(
      { name: 'sessionid', value: raw, domain: '.tiktok.com', path: '/' },
      { name: 'sessionid_ss', value: raw, domain: '.tiktok.com', path: '/' }
    );
  }

  if (cookiesArray.length === 0) {
    throw new Error('Không thể phân tích Cookie. Vui lòng nhập chuỗi Cookie hợp lệ hoặc xuất từ tiện ích Cookie-Editor.');
  }

  // Chuỗi Cookie header dùng cho HTTP requests
  const cookieHeaderString = cookiesArray.map((c) => `${c.name}=${c.value}`).join('; ');

  return {
    cookiesArray,
    cookieHeaderString,
    sessionId: sessionId || (cookiesArray.find((c) => c.name.toLowerCase().includes('session'))?.value || null)
  };
}

/**
 * Kiểm tra tính hợp lệ của Cookie qua TikTok Web Passport API
 */
async function validateCookieWithApi(cookieHeaderString) {
  try {
    const res = await axios.get('https://www.tiktok.com/passport/web/account/info/', {
      headers: {
        'Cookie': cookieHeaderString,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Referer': 'https://www.tiktok.com/',
        'Accept': 'application/json, text/plain, */*'
      },
      timeout: 10000
    });

    const data = res.data?.data;
    if (data && (data.user_id || data.username || data.screen_name)) {
      return {
        valid: true,
        user: {
          user_id: data.user_id || '',
          username: data.username || data.screen_name || 'tiktok_user',
          nickname: data.screen_name || data.username || 'TikTok User',
          avatar_url: data.avatar_url || data.avatar_thumb || ''
        }
      };
    }
  } catch (err) {
    // Nếu API trả về 403/Cloudflare hoặc không phản hồi, ta không chặn mà cho phép thử tiếp
    console.warn('[TikTok API Check Warning]:', err.message);
  }

  return { valid: null };
}

/**
 * Thêm hoặc cập nhật tài khoản TikTok bằng Cookie
 */
async function addOrUpdateTikTokAccount({ userId, cookiesRaw, nicknameOverride }) {
  const { cookiesArray, cookieHeaderString, sessionId } = parseCookies(cookiesRaw);
  const check = await validateCookieWithApi(cookieHeaderString);

  let username = 'tiktok_creator';
  let nickname = nicknameOverride || 'Kênh TikTok';
  let avatarUrl = '';

  if (check.valid && check.user) {
    username = check.user.username;
    nickname = nicknameOverride || check.user.nickname || check.user.username;
    avatarUrl = check.user.avatar_url;
  } else if (nicknameOverride) {
    username = nicknameOverride.toLowerCase().replace(/[^a-z0-9_]/g, '');
    nickname = nicknameOverride;
  }

  const pool = await getPool();

  // Kiểm tra xem đã có tài khoản với sessionId hoặc username này chưa
  const existing = await pool.request()
    .input('userId', sql.VarChar(64), String(userId || ''))
    .input('username', sql.VarChar(150), username)
    .input('sessionId', sql.VarChar(255), sessionId || '')
    .query(`
      SELECT id FROM TikTokAccounts 
      WHERE (username = @username OR (session_id IS NOT NULL AND session_id != '' AND session_id = @sessionId))
        AND (@userId = '' OR user_id = @userId OR user_id IS NULL OR user_id = '')
    `);

  const cookiesJson = JSON.stringify(cookiesArray);
  const nowIso = new Date().toISOString();

  if (existing.recordset && existing.recordset.length > 0) {
    const existingId = existing.recordset[0].id;
    await pool.request()
      .input('id', sql.Int, existingId)
      .input('nickname', sql.NVarChar(200), nickname)
      .input('avatarUrl', sql.NVarChar(1000), avatarUrl)
      .input('sessionId', sql.VarChar(255), sessionId || '')
      .input('cookiesJson', sql.NText, cookiesJson)
      .input('status', sql.VarChar(50), 'active')
      .input('nowIso', sql.VarChar(50), nowIso)
      .query(`
        UPDATE TikTokAccounts 
        SET nickname = @nickname,
            avatar_url = CASE WHEN @avatarUrl != '' THEN @avatarUrl ELSE avatar_url END,
            session_id = @sessionId,
            cookies_json = @cookiesJson,
            status = @status,
            error_message = NULL,
            updated_at = @nowIso
        WHERE id = @id
      `);

    return {
      id: existingId,
      username,
      nickname,
      avatarUrl,
      updated: true,
      message: 'Đã cập nhật Cookie tài khoản TikTok thành công!'
    };
  }

  // Thêm mới
  const insertRes = await pool.request()
    .input('userId', sql.VarChar(64), String(userId || ''))
    .input('username', sql.VarChar(150), username)
    .input('nickname', sql.NVarChar(200), nickname)
    .input('avatarUrl', sql.NVarChar(1000), avatarUrl)
    .input('sessionId', sql.VarChar(255), sessionId || '')
    .input('cookiesJson', sql.NText, cookiesJson)
    .input('status', sql.VarChar(50), 'active')
    .input('nowIso', sql.VarChar(50), nowIso)
    .query(`
      INSERT INTO TikTokAccounts (user_id, username, nickname, avatar_url, session_id, cookies_json, status, created_at, updated_at)
      OUTPUT INSERTED.id
      VALUES (@userId, @username, @nickname, @avatarUrl, @sessionId, @cookiesJson, @status, @nowIso, @nowIso)
    `);

  const createdId = insertRes.recordset?.[0]?.id || null;

  return {
    id: createdId,
    username,
    nickname,
    avatarUrl,
    created: true,
    message: 'Đã liên kết tài khoản TikTok thành công!'
  };
}

/**
 * Lấy danh sách tài khoản TikTok (ẩn thông tin cookie nhạy cảm)
 */
async function listTikTokAccounts(userId) {
  const pool = await getPool();
  const request = pool.request();
  let query = `
    SELECT id, user_id, username, nickname, avatar_url, status, error_message, created_at, updated_at
    FROM TikTokAccounts
  `;
  if (userId) {
    query += ` WHERE user_id = @userId OR user_id IS NULL OR user_id = ''`;
    request.input('userId', sql.VarChar(64), String(userId));
  }
  query += ` ORDER BY id DESC`;
  const res = await request.query(query);

  return res.recordset || [];
}

/**
 * Lấy tài khoản TikTok theo ID (kèm cookies)
 */
async function getTikTokAccountById(id) {
  const pool = await getPool();
  const res = await pool.request()
    .input('id', sql.Int, id)
    .query('SELECT * FROM TikTokAccounts WHERE id = @id');

  return res.recordset?.[0] || null;
}

/**
 * Xóa tài khoản TikTok
 */
async function deleteTikTokAccount(id) {
  const pool = await getPool();
  await pool.request()
    .input('id', sql.Int, id)
    .query('DELETE FROM TikTokAccounts WHERE id = @id');
  return { success: true };
}

/**
 * Kiểm tra lại trạng thái sống của Cookie
 */
async function checkTikTokAccountHealth(id) {
  const account = await getTikTokAccountById(id);
  if (!account) throw new Error('Không tìm thấy tài khoản TikTok.');

  let cookiesArray = [];
  try {
    cookiesArray = JSON.parse(account.cookies_json);
  } catch (_) {
    cookiesArray = [];
  }

  const cookieHeader = cookiesArray.map((c) => `${c.name}=${c.value}`).join('; ');
  const check = await validateCookieWithApi(cookieHeader);

  const pool = await getPool();
  const nowIso = new Date().toISOString();

  if (check.valid) {
    await pool.request()
      .input('id', sql.Int, id)
      .input('status', sql.VarChar(50), 'active')
      .input('nowIso', sql.VarChar(50), nowIso)
      .query("UPDATE TikTokAccounts SET status = @status, error_message = NULL, updated_at = @nowIso WHERE id = @id");
    return { status: 'active', message: 'Cookie TikTok đang hoạt động tốt!' };
  } else if (check.valid === false) {
    await pool.request()
      .input('id', sql.Int, id)
      .input('status', sql.VarChar(50), 'expired')
      .input('error', sql.NVarChar(500), 'Cookie đã hết hạn')
      .input('nowIso', sql.VarChar(50), nowIso)
      .query("UPDATE TikTokAccounts SET status = @status, error_message = @error, updated_at = @nowIso WHERE id = @id");
    return { status: 'expired', message: 'Cookie TikTok đã hết hạn. Vui lòng cập nhật lại Cookie mới.' };
  }

  return { status: account.status, message: 'Đã kiểm tra, tài khoản sẵn sàng sử dụng.' };
}

/**
 * Tự động tạo bảng TikTokAccounts và bổ sung cột cần thiết vào Posts
 * Được gọi khi server khởi động để không cần chạy SQL thủ công
 */
async function ensureTikTokSchema() {
  const pool = await getPool();

  // Tạo bảng TikTokAccounts nếu chưa có
  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'TikTokAccounts')
    BEGIN
      CREATE TABLE TikTokAccounts (
        id            INT IDENTITY(1,1) PRIMARY KEY,
        user_id       VARCHAR(64)       NULL,
        username      VARCHAR(150)      NOT NULL,
        nickname      NVARCHAR(200)     NULL,
        avatar_url    NVARCHAR(1000)    NULL,
        session_id    VARCHAR(255)      NULL,
        cookies_json  NTEXT             NULL,
        status        VARCHAR(50)       NOT NULL DEFAULT 'active',
        error_message NVARCHAR(500)     NULL,
        created_at    VARCHAR(50)       NOT NULL,
        updated_at    VARCHAR(50)       NOT NULL
      )
    END
  `);

  // Thêm cột platform vào Posts nếu chưa có
  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1 FROM sys.columns
      WHERE object_id = OBJECT_ID('Posts') AND name = 'platform'
    )
    BEGIN
      ALTER TABLE Posts ADD platform VARCHAR(50) NOT NULL DEFAULT 'facebook'
    END
  `);

  // Thêm cột tiktok_account_id vào Posts nếu chưa có
  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1 FROM sys.columns
      WHERE object_id = OBJECT_ID('Posts') AND name = 'tiktok_account_id'
    )
    BEGIN
      ALTER TABLE Posts ADD tiktok_account_id VARCHAR(50) NULL
    END
  `);

  // Thêm cột created_by_user_id vào Posts nếu chưa có
  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1 FROM sys.columns
      WHERE object_id = OBJECT_ID('Posts') AND name = 'created_by_user_id'
    )
    BEGIN
      ALTER TABLE Posts ADD created_by_user_id VARCHAR(64) NULL
    END
  `);

  // Thêm cột published_at vào Posts nếu chưa có
  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1 FROM sys.columns
      WHERE object_id = OBJECT_ID('Posts') AND name = 'published_at'
    )
    BEGIN
      ALTER TABLE Posts ADD published_at DATETIME2 NULL
    END
  `);

  // Thêm cột error_message vào Posts nếu chưa có
  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1 FROM sys.columns
      WHERE object_id = OBJECT_ID('Posts') AND name = 'error_message'
    )
    BEGIN
      ALTER TABLE Posts ADD error_message NVARCHAR(MAX) NULL
    END
  `);

  // Thêm cột parent_comment_id vào PostComments nếu chưa có
  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1 FROM sys.columns
      WHERE object_id = OBJECT_ID('PostComments') AND name = 'parent_comment_id'
    )
    BEGIN
      ALTER TABLE PostComments ADD parent_comment_id INT NULL
    END
  `);

  // Thêm cột facebook_comment_id vào PostComments nếu chưa có
  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1 FROM sys.columns
      WHERE object_id = OBJECT_ID('PostComments') AND name = 'facebook_comment_id'
    )
    BEGIN
      ALTER TABLE PostComments ADD facebook_comment_id NVARCHAR(128) NULL
    END
  `);

  console.log('[TikTok] Schema TikTokAccounts và các cột Posts/PostComments đã sẵn sàng.');
}

module.exports = {
  parseCookies,
  validateCookieWithApi,
  addOrUpdateTikTokAccount,
  listTikTokAccounts,
  getTikTokAccountById,
  deleteTikTokAccount,
  checkTikTokAccountHealth,
  ensureTikTokSchema
};
