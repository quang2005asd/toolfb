/**
 * FacebookTokenService.js
 * Tự động giữ token Facebook luôn sống:
 * - Đổi token ngắn hạn (1–2 giờ, ví dụ lấy từ Graph API Explorer) sang token dài hạn (~60 ngày) bằng App ID / App Secret.
 * - Token Fanpage lấy từ token dài hạn KHÔNG hết hạn; khi token Fanpage hỏng, tự lấy lại từ token tài khoản.
 * - Định kỳ kiểm tra hạn dùng token tài khoản và ghi lại để giao diện cảnh báo trước.
 * Lưu ý: Facebook không cho làm mới token đã hết hạn — khi đó chỉ có cách đăng nhập lại (1 chạm qua Facebook Login).
 */
const axios = require('axios');
const { sql, getPool } = require('../../config/db');
const { getSettings, saveMultipleSettings, saveSetting } = require('./SettingsService');
const {
  decryptToken,
  encryptToken,
  ensureSchema,
  saveFacebookUser,
  syncFacebookPages
} = require('./FacebookPageConnections');

const GRAPH = `https://graph.facebook.com/${process.env.FB_GRAPH_VERSION || 'v19.0'}`;
const RENEW_INTERVAL_MS = 30 * 60 * 1000;
const RENEW_THROTTLE_MS = 2 * 60 * 1000;
const LONG_LIVED_MIN_SECONDS = 7 * 24 * 60 * 60;
// Quyền cần cho đăng bài, đọc số liệu, hộp thư Messenger và Instagram
const DEFAULT_LOGIN_SCOPES = [
  'public_profile', 'pages_show_list', 'pages_read_engagement', 'pages_read_user_content', 'pages_manage_posts',
  'pages_manage_metadata', 'pages_manage_engagement', 'pages_messaging', 'business_management',
  'instagram_basic', 'instagram_manage_messages', 'instagram_manage_comments', 'instagram_content_publish'
].join(',');

// Quyền Fanpage mà các tính năng đăng bài / hộp thư / bình luận cần (Instagram & Business là tùy chọn)
const REQUIRED_PAGE_SCOPES = [
  'pages_show_list', 'pages_read_engagement', 'pages_manage_posts', 'pages_messaging',
  'pages_manage_metadata', 'pages_read_user_content', 'pages_manage_engagement'
];

class TokenError extends Error {
  constructor(message, status = 400, code = 'token_error', details = {}) {
    super(message);
    this.status = status;
    this.code = code;
    Object.assign(this, details);
  }
}

const lastRenewByAccount = new Map();
const lastRenewByPage = new Map();
const renewedHooks = [];
let schemaPromise = null;

async function ensureTokenSchema() {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      await ensureSchema();
      const pool = await getPool();
      await pool.request().query(`
        IF COL_LENGTH('dbo.ConnectedFbAccounts', 'token_type') IS NULL
          ALTER TABLE dbo.ConnectedFbAccounts ADD token_type varchar(20) NULL;
        IF COL_LENGTH('dbo.ConnectedFbAccounts', 'token_expires_at') IS NULL
          ALTER TABLE dbo.ConnectedFbAccounts ADD token_expires_at datetime2 NULL;
        IF COL_LENGTH('dbo.ConnectedFbAccounts', 'token_status') IS NULL
          ALTER TABLE dbo.ConnectedFbAccounts ADD token_status varchar(20) NULL;
        IF COL_LENGTH('dbo.ConnectedFbAccounts', 'token_checked_at') IS NULL
          ALTER TABLE dbo.ConnectedFbAccounts ADD token_checked_at datetime2 NULL;
        IF COL_LENGTH('dbo.ConnectedFbAccounts', 'token_error') IS NULL
          ALTER TABLE dbo.ConnectedFbAccounts ADD token_error nvarchar(500) NULL;
        IF COL_LENGTH('dbo.ConnectedFbAccounts', 'meta_app_id') IS NULL
          ALTER TABLE dbo.ConnectedFbAccounts ADD meta_app_id varchar(32) NULL;
      `);
    })().catch((error) => {
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

function graphMessage(error) {
  return error.response?.data?.error?.message || error.message;
}

// ═══ META APP RIÊNG CỦA TỪNG NGƯỜI DÙNG (APP ID / APP SECRET) ═══
// Tool không dùng app chung: mỗi tài khoản tool tự thêm một hoặc nhiều Meta App mà nick Facebook của họ là quản trị viên.
// Mỗi nick Facebook nhớ app đã cấp token (ConnectedFbAccounts.meta_app_id) để đổi / gia hạn token bằng đúng app đó.
const USER_APPS_PREFIX = 'fb_user_apps:';
const LEGACY_USER_APP_PREFIX = 'fb_user_app:';
const MAX_APPS_PER_USER = 10;

function storedApps(settings, appUserId) {
  if (!appUserId) return [];
  const current = settings[`${USER_APPS_PREFIX}${appUserId}`];
  if (current && Array.isArray(current.apps)) return current.apps;
  const legacy = settings[`${LEGACY_USER_APP_PREFIX}${appUserId}`];
  return legacy && typeof legacy === 'object' && legacy.appId && legacy.secret ? [legacy] : [];
}

function decryptApps(list) {
  return list
    .map((item) => {
      const appSecret = item && item.secret ? decryptToken(item.secret) : null;
      return appSecret ? { appId: String(item.appId), appSecret, label: item.label || '', savedAt: item.savedAt || null } : null;
    })
    .filter(Boolean);
}

async function listUserApps(appUserId) {
  const settings = await getSettings().catch(() => ({}));
  return decryptApps(storedApps(settings, appUserId));
}

function toCreds(app) {
  return app
    ? { appId: app.appId, appSecret: app.appSecret, label: app.label || '', configured: true, source: 'user' }
    : { appId: '', appSecret: '', label: '', configured: false, source: 'user' };
}

// appId: chọn đúng một app của người dùng; không truyền thì lấy app đầu tiên
async function getMetaAppCredentials(appUserId = null, { appId = null } = {}) {
  const apps = await listUserApps(appUserId);
  if (appId) return toCreds(apps.find((app) => app.appId === String(appId)));
  return toCreds(apps[0]);
}

// App đã cấp token cho một nick Facebook; app đó bị gỡ khỏi tool thì dùng app đầu tiên của người dùng
async function getAccountCredentials(row) {
  const apps = await listUserApps(row.app_user_id);
  return toCreds(apps.find((app) => app.appId === String(row.meta_app_id || '')) || apps[0]);
}

// App của nick sở hữu Fanpage (dùng để kiểm tra token Page / chẩn đoán)
async function getPageAppCredentials(pageId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('pageId', sql.VarChar(64), String(pageId))
    .query(`
      SELECT TOP 1 p.facebook_user_id AS app_user_id, a.meta_app_id
        FROM dbo.FacebookPages p
        LEFT JOIN dbo.ConnectedFbAccounts a ON a.app_user_id = p.facebook_user_id AND a.fb_user_id = p.fb_account_id
       WHERE p.page_id = @pageId
    `);
  const row = result.recordset[0];
  return row ? getAccountCredentials(row) : toCreds(null);
}

async function getUserMetaApps(appUserId) {
  const apps = await listUserApps(appUserId);
  return apps.map(({ appId, label, savedAt }) => ({ appId, label, savedAt }));
}

// Kiểm tra App Secret và việc app đã khai báo miền của tool (không thì Facebook chặn đăng nhập)
async function validateAppCredentials(appId, appSecret) {
  try {
    await axios.get(`${GRAPH}/oauth/access_token`, {
      params: { client_id: appId, client_secret: appSecret, grant_type: 'client_credentials' },
      timeout: 15000
    });
  } catch (error) {
    throw new TokenError(`Facebook từ chối App ID / App Secret: ${graphMessage(error)}`, 400, 'invalid_app_credentials');
  }
  const { facebookRedirectUri } = require('../middlewares/auth');
  try {
    // Gửi mã giả kèm URI chuyển hướng của tool: miền chưa khai báo thì Facebook trả lỗi 191 trước khi kiểm tra mã
    await axios.get(`${GRAPH}/oauth/access_token`, {
      params: { client_id: appId, client_secret: appSecret, redirect_uri: facebookRedirectUri(), code: 'tool-face-domain-check' },
      timeout: 15000
    });
  } catch (error) {
    if (error.response?.data?.error?.code === 191) {
      const domain = new URL(facebookRedirectUri()).hostname;
      throw new TokenError(`Meta App chưa khai báo miền ${domain}. Vào Cài đặt ứng dụng → Thông tin cơ bản → thêm ${domain} vào Miền ứng dụng, và thêm ${facebookRedirectUri()} vào URI chuyển hướng OAuth hợp lệ, rồi lưu lại.`, 400, 'domain_not_allowed');
    }
  }
}

// Thêm / cập nhật một Meta App của người dùng (cùng App ID thì cập nhật, bỏ trống khóa thì giữ khóa cũ)
async function saveUserMetaApp(appUserId, { appId, appSecret, label }) {
  const cleanId = String(appId || '').trim();
  const settings = await getSettings().catch(() => ({}));
  const list = storedApps(settings, appUserId);
  const existing = decryptApps(list).find((app) => app.appId === cleanId);
  const cleanSecret = String(appSecret || '').trim() || existing?.appSecret || '';
  if (!/^\d{5,20}$/.test(cleanId)) throw new TokenError('App ID chỉ gồm chữ số (xem tại Cài đặt ứng dụng → Thông tin cơ bản → ID ứng dụng).', 400, 'invalid_app_id');
  if (!cleanSecret) throw new TokenError('Vui lòng nhập Khóa bí mật của ứng dụng (App Secret).', 400, 'missing_app_secret');
  if (!existing && list.length >= MAX_APPS_PER_USER) throw new TokenError(`Mỗi tài khoản lưu tối đa ${MAX_APPS_PER_USER} Meta App.`, 400, 'too_many_apps');
  await validateAppCredentials(cleanId, cleanSecret);
  const entry = {
    appId: cleanId,
    secret: encryptToken(cleanSecret),
    label: String(label ?? existing?.label ?? '').trim().slice(0, 60),
    savedAt: new Date().toISOString()
  };
  const next = existing ? list.map((item) => (String(item.appId) === cleanId ? entry : item)) : [...list, entry];
  await saveSetting(`${USER_APPS_PREFIX}${appUserId}`, { apps: next });
  if (settings[`${LEGACY_USER_APP_PREFIX}${appUserId}`]) await saveSetting(`${LEGACY_USER_APP_PREFIX}${appUserId}`, '');
  return { appId: cleanId, label: entry.label };
}

async function removeUserMetaApp(appUserId, appId) {
  const settings = await getSettings().catch(() => ({}));
  const list = storedApps(settings, appUserId);
  const next = list.filter((item) => String(item.appId) !== String(appId));
  await saveSetting(`${USER_APPS_PREFIX}${appUserId}`, { apps: next });
  if (settings[`${LEGACY_USER_APP_PREFIX}${appUserId}`]) await saveSetting(`${LEGACY_USER_APP_PREFIX}${appUserId}`, '');
  return { removed: list.length - next.length };
}

// Mọi Meta App đã lưu trong tool: { appId, secret, appUserIds } (dùng cho Webhook và yêu cầu xóa dữ liệu của Meta)
async function allUserApps() {
  const settings = await getSettings().catch(() => ({}));
  const byApp = new Map();
  for (const key of Object.keys(settings)) {
    const prefix = key.startsWith(USER_APPS_PREFIX) ? USER_APPS_PREFIX : key.startsWith(LEGACY_USER_APP_PREFIX) ? LEGACY_USER_APP_PREFIX : null;
    if (!prefix) continue;
    const appUserId = key.slice(prefix.length);
    for (const app of decryptApps(storedApps(settings, appUserId))) {
      const entry = byApp.get(app.appId) || { appId: app.appId, secret: app.appSecret, appUserIds: new Set() };
      entry.appUserIds.add(String(appUserId));
      byApp.set(app.appId, entry);
    }
  }
  return [...byApp.values()];
}

// Webhook: tìm app đã ký sự kiện (verify(secret) → true/false); trả về app và những người dùng đang dùng app đó
async function matchWebhookApp(verify) {
  for (const app of await allUserApps()) {
    if (verify(app.secret)) return { appId: app.appId, appUserIds: [...app.appUserIds] };
  }
  return null;
}

async function saveAccountApp(appUserId, fbUserId, metaAppId) {
  if (!metaAppId) return;
  const pool = await getPool();
  await pool.request()
    .input('appUserId', sql.VarChar(64), String(appUserId))
    .input('fbUserId', sql.VarChar(64), String(fbUserId))
    .input('metaAppId', sql.VarChar(32), String(metaAppId))
    .query('UPDATE dbo.ConnectedFbAccounts SET meta_app_id=@metaAppId WHERE app_user_id=@appUserId AND fb_user_id=@fbUserId');
}

function loginScopes() {
  return process.env.FACEBOOK_LOGIN_SCOPES && process.env.FACEBOOK_LOGIN_SCOPES !== 'public_profile'
    ? process.env.FACEBOOK_LOGIN_SCOPES
    : DEFAULT_LOGIN_SCOPES;
}

// ═══ KIỂM TRA / ĐỔI TOKEN ═══
function classify(expiresAt) {
  if (expiresAt === 0) return 'never';
  if (!expiresAt) return 'unknown';
  return expiresAt - Math.floor(Date.now() / 1000) > LONG_LIVED_MIN_SECONDS ? 'long' : 'short';
}

// Trả về { valid, type, expiresAt (ISO | null), appId, error, errorCode }
async function inspectUserToken(token, creds) {
  let profile;
  try {
    const response = await axios.get(`${GRAPH}/me`, { params: { fields: 'id,name,picture.width(150).height(150)', access_token: token }, timeout: 15000 });
    profile = response.data;
  } catch (error) {
    const fb = error.response?.data?.error;
    return {
      valid: false,
      type: 'unknown',
      expiresAt: null,
      error: fb?.code === 190
        ? `Token đã hết hạn hoặc bị thu hồi (${fb.message})`
        : `Không kiểm tra được token: ${graphMessage(error)}`,
      errorCode: fb?.code || null,
      transient: !fb || [1, 2, 4, 17, 32, 613].includes(fb.code)
    };
  }
  // Hạn dùng: ưu tiên app token, nếu không có thì thử tự kiểm tra bằng chính token (khi bạn là dev của app)
  const debuggers = [];
  if (creds.configured) debuggers.push(`${creds.appId}|${creds.appSecret}`);
  debuggers.push(token);
  for (const debugToken of debuggers) {
    try {
      const response = await axios.get(`${GRAPH}/debug_token`, { params: { input_token: token, access_token: debugToken }, timeout: 15000 });
      const data = response.data?.data || {};
      const expiresAt = Number.isFinite(data.expires_at) ? data.expires_at : null;
      return {
        valid: data.is_valid !== false,
        type: classify(expiresAt),
        expiresAt: expiresAt ? new Date(expiresAt * 1000).toISOString() : null,
        neverExpires: expiresAt === 0,
        appId: data.app_id ? String(data.app_id) : null,
        profile
      };
    } catch {}
  }
  return { valid: true, type: 'unknown', expiresAt: null, appId: null, profile };
}

async function exchangeForLongLived(token, creds) {
  if (!creds.configured) throw new TokenError('Chưa cấu hình App ID / App Secret nên chưa đổi được sang token dài hạn.', 400, 'app_not_configured');
  try {
    const response = await axios.get(`${GRAPH}/oauth/access_token`, {
      params: { grant_type: 'fb_exchange_token', client_id: creds.appId, client_secret: creds.appSecret, fb_exchange_token: token },
      timeout: 15000
    });
    if (!response.data?.access_token) throw new Error('Facebook không trả về token mới.');
    return { accessToken: response.data.access_token, expiresIn: Number(response.data.expires_in) || null };
  } catch (error) {
    const message = graphMessage(error);
    if (/does not belong|Invalid application|validating application|client_id/i.test(message)) {
      throw new TokenError('Token được tạo từ một Meta App khác với App ID đã cấu hình. Trong Graph API Explorer hãy chọn đúng ứng dụng của bạn rồi tạo token mới.', 400, 'app_mismatch');
    }
    throw new TokenError(`Không đổi được sang token dài hạn: ${message}`, 400, 'exchange_failed');
  }
}

async function saveTokenMeta(appUserId, fbUserId, { status, type = null, expiresAt = null, error = null }) {
  await ensureTokenSchema();
  const pool = await getPool();
  await pool.request()
    .input('appUserId', sql.VarChar(64), String(appUserId))
    .input('fbUserId', sql.VarChar(64), String(fbUserId))
    .input('status', sql.VarChar(20), status)
    .input('type', sql.VarChar(20), type)
    .input('expiresAt', sql.DateTime2, expiresAt ? new Date(expiresAt) : null)
    .input('error', sql.NVarChar(500), error ? String(error).slice(0, 500) : null)
    .input('now', sql.DateTime2, new Date())
    .query(`
      UPDATE dbo.ConnectedFbAccounts
      SET token_status=@status, token_type=COALESCE(@type, token_type), token_expires_at=COALESCE(@expiresAt, token_expires_at),
          token_error=@error, token_checked_at=@now
      WHERE app_user_id=@appUserId AND fb_user_id=@fbUserId
    `);
}

async function markAccountPagesValidity(appUserId, fbUserId, isValid) {
  const pool = await getPool();
  await pool.request()
    .input('appUserId', sql.VarChar(64), String(appUserId))
    .input('fbUserId', sql.VarChar(64), String(fbUserId))
    .input('isValid', sql.Bit, isValid)
    .query('UPDATE dbo.FacebookPages SET is_valid=@isValid WHERE facebook_user_id=@appUserId AND fb_account_id=@fbUserId');
}

async function notifyRenewed(appUserId) {
  for (const hook of renewedHooks) {
    try {
      await hook(appUserId);
    } catch {}
  }
}

// Quyền đã cấp cho token người dùng; null khi không đọc được (vd. token của Page)
async function grantedPermissions(token) {
  try {
    const response = await axios.get(`${GRAPH}/me/permissions`, { params: { access_token: token, limit: 200 }, timeout: 15000 });
    const rows = response.data?.data || [];
    return {
      granted: rows.filter((row) => row.status === 'granted').map((row) => row.permission),
      declined: rows.filter((row) => row.status === 'declined').map((row) => row.permission)
    };
  } catch {
    return null;
  }
}

// ═══ KẾT NỐI TOKEN MỚI (dán token hoặc Facebook Login) ═══
// appId: Meta App vừa dùng để đăng nhập (OAuth). Dán token thì tool tự nhận app đã cấp token qua debug_token.
async function connectUserToken(appUserId, rawToken, { appId = null } = {}) {
  await ensureTokenSchema();
  const apps = await listUserApps(appUserId);
  const preferred = appId ? apps.find((app) => app.appId === String(appId)) : null;
  let creds = toCreds(preferred);
  const first = await inspectUserToken(rawToken, creds);
  if (!first.valid) throw new TokenError(first.error || 'Facebook Access Token không hợp lệ.', 400, 'invalid_token');
  // Token do app nào cấp: trùng một app của người dùng thì dùng app đó để đổi / gia hạn token
  const tokenAppId = first.appId || preferred?.appId || null;
  if (!preferred && tokenAppId) creds = toCreds(apps.find((app) => app.appId === tokenAppId));

  // Chưa có quyền xem Fanpage thì dừng trước khi đồng bộ (không xóa Fanpage đã lưu của nick này)
  const permissions = await grantedPermissions(rawToken);
  const missingScopes = permissions ? REQUIRED_PAGE_SCOPES.filter((scope) => !permissions.granted.includes(scope)) : [];
  if (permissions && missingScopes.includes('pages_show_list')) {
    throw new TokenError(
      'Facebook chưa cấp quyền quản lý Fanpage cho nick này (thiếu pages_show_list).',
      400,
      'no_permission',
      { missingScopes, fbName: first.profile?.name || null }
    );
  }

  let token = rawToken;
  let info = first;
  let exchangeError = null;
  if (creds.configured && first.type !== 'never' && first.type !== 'long') {
    try {
      const exchanged = await exchangeForLongLived(rawToken, creds);
      token = exchanged.accessToken;
      info = await inspectUserToken(token, creds);
      if (info.type === 'unknown' && exchanged.expiresIn) {
        info = { ...info, type: classify(Math.floor(Date.now() / 1000) + exchanged.expiresIn), expiresAt: new Date(Date.now() + exchanged.expiresIn * 1000).toISOString() };
      }
    } catch (error) {
      exchangeError = error.message;
    }
  }

  const profile = info.profile || first.profile;
  const fbAccount = { id: String(profile.id), name: profile.name, avatar: profile.picture?.data?.url || null };
  const expiresIn = info.expiresAt ? Math.max(0, Math.round((new Date(info.expiresAt) - Date.now()) / 1000)) : null;
  await saveFacebookUser({ id: appUserId, name: profile.name, picture: profile.picture }, token, expiresIn);
  const pages = await syncFacebookPages(appUserId, token, fbAccount);
  await saveTokenMeta(appUserId, fbAccount.id, { status: 'valid', type: info.type, expiresAt: info.expiresAt, error: exchangeError });
  await saveAccountApp(appUserId, fbAccount.id, tokenAppId);
  lastRenewByAccount.set(`${appUserId}:${fbAccount.id}`, Date.now());
  await notifyRenewed(appUserId);
  return {
    token,
    fbAccount,
    pages,
    missingScopes,
    tokenType: info.type,
    expiresAt: info.expiresAt,
    exchanged: token !== rawToken,
    exchangeError,
    metaAppId: tokenAppId,
    appConfigured: creds.configured
  };
}

// ═══ TỰ ĐỘNG LÀM MỚI ═══
async function listAccounts(appUserId = null) {
  await ensureTokenSchema();
  const pool = await getPool();
  const request = pool.request();
  let where = '';
  if (appUserId) {
    request.input('appUserId', sql.VarChar(64), String(appUserId));
    where = 'WHERE app_user_id=@appUserId';
  }
  const result = await request.query(`SELECT * FROM dbo.ConnectedFbAccounts ${where}`);
  return result.recordset;
}

async function countAccountPages(appUserId, fbUserId, onlyInvalid = false) {
  const pool = await getPool();
  const result = await pool.request()
    .input('appUserId', sql.VarChar(64), String(appUserId))
    .input('fbUserId', sql.VarChar(64), String(fbUserId))
    .query(`SELECT COUNT(*) AS total FROM dbo.FacebookPages WHERE facebook_user_id=@appUserId AND fb_account_id=@fbUserId${onlyInvalid ? ' AND is_valid=0' : ''}`);
  return Number(result.recordset[0]?.total) || 0;
}

// Kiểm tra token một nick; còn sống thì (nếu cần) đổi sang dài hạn và lấy lại token Fanpage
async function renewAccount(row, { force = false, refreshPages = false } = {}) {
  const key = `${row.app_user_id}:${row.fb_user_id}`;
  if (!force && Date.now() - (lastRenewByAccount.get(key) || 0) < RENEW_THROTTLE_MS) {
    return { fbUserId: row.fb_user_id, name: row.fb_name, skipped: true };
  }
  lastRenewByAccount.set(key, Date.now());

  const creds = await getAccountCredentials(row);
  const stored = decryptToken(row.access_token_encrypted);
  if (!stored) {
    await saveTokenMeta(row.app_user_id, row.fb_user_id, { status: 'invalid', error: 'Không giải mã được token đã lưu (SESSION_SECRET đã đổi).' });
    return { fbUserId: row.fb_user_id, name: row.fb_name, success: false, status: 'invalid', message: 'Không giải mã được token đã lưu.' };
  }

  let info = await inspectUserToken(stored, creds);
  if (!info.valid) {
    if (info.transient) return { fbUserId: row.fb_user_id, name: row.fb_name, success: false, status: 'unknown', message: info.error };
    await saveTokenMeta(row.app_user_id, row.fb_user_id, { status: 'expired', error: info.error });
    await markAccountPagesValidity(row.app_user_id, row.fb_user_id, false);
    return { fbUserId: row.fb_user_id, name: row.fb_name, success: false, status: 'expired', message: info.error };
  }

  let token = stored;
  let exchanged = false;
  let note = null;
  if (creds.configured && info.type !== 'never' && info.type !== 'long') {
    try {
      const result = await exchangeForLongLived(stored, creds);
      token = result.accessToken;
      exchanged = true;
      const next = await inspectUserToken(token, creds);
      info = next.valid ? next : info;
    } catch (error) {
      note = error.message;
    }
  }

  // Lấy lại token Fanpage khi vừa đổi token, khi có Fanpage hỏng, hoặc khi được yêu cầu
  const invalidPages = await countAccountPages(row.app_user_id, row.fb_user_id, true);
  if (exchanged || invalidPages > 0 || refreshPages) {
    const existing = await countAccountPages(row.app_user_id, row.fb_user_id);
    const check = await axios.get(`${GRAPH}/me/accounts`, { params: { fields: 'id', limit: 100, access_token: token }, timeout: 15000 })
      .catch((error) => ({ error }));
    // Không xóa danh sách Fanpage nếu Facebook tạm trả danh sách rỗng / lỗi
    if (!check.error && (check.data?.data?.length || existing === 0)) {
      await syncFacebookPages(row.app_user_id, token, { id: row.fb_user_id, name: row.fb_name, avatar: row.fb_avatar });
    } else if (exchanged) {
      const pool = await getPool();
      await pool.request()
        .input('appUserId', sql.VarChar(64), String(row.app_user_id))
        .input('fbUserId', sql.VarChar(64), String(row.fb_user_id))
        .input('token', sql.NVarChar(sql.MAX), encryptToken(token))
        .query('UPDATE dbo.ConnectedFbAccounts SET access_token_encrypted=@token WHERE app_user_id=@appUserId AND fb_user_id=@fbUserId');
    }
  }
  await saveTokenMeta(row.app_user_id, row.fb_user_id, { status: 'valid', type: info.type, expiresAt: info.expiresAt, error: note });
  await notifyRenewed(row.app_user_id);
  return {
    fbUserId: row.fb_user_id,
    name: row.fb_name,
    success: true,
    status: 'valid',
    tokenType: info.type,
    expiresAt: info.expiresAt,
    exchanged,
    pagesRefreshed: exchanged || invalidPages > 0 || refreshPages,
    // Số Fanpage đang lỗi vừa được lấy lại token (lần làm mới định kỳ không đổi gì thì bằng 0)
    repairedPages: invalidPages,
    message: note
  };
}

async function renewAll({ appUserId = null, force = false, refreshPages = false } = {}) {
  const accounts = await listAccounts(appUserId);
  const results = [];
  for (const row of accounts) {
    try {
      results.push(await renewAccount(row, { force, refreshPages }));
    } catch (error) {
      results.push({ fbUserId: row.fb_user_id, name: row.fb_name, success: false, status: 'unknown', message: graphMessage(error) });
    }
  }
  return results;
}

// Token một Fanpage bị lỗi → làm mới ngay các nick đang quản lý Page đó (tối đa 1 lần / 2 phút cho mỗi Page)
async function requestRenewForPage(pageId) {
  const key = String(pageId);
  if (Date.now() - (lastRenewByPage.get(key) || 0) < RENEW_THROTTLE_MS) return [];
  lastRenewByPage.set(key, Date.now());
  await ensureTokenSchema();
  const pool = await getPool();
  const pages = await pool.request()
    .input('pageId', sql.VarChar(64), String(pageId))
    .query('SELECT DISTINCT facebook_user_id, fb_account_id FROM dbo.FacebookPages WHERE page_id=@pageId AND fb_account_id IS NOT NULL');
  const results = [];
  for (const page of pages.recordset) {
    const rows = await listAccounts(page.facebook_user_id);
    const row = rows.find((item) => String(item.fb_user_id) === String(page.fb_account_id));
    if (row) results.push(await renewAccount(row, { force: true, refreshPages: true }).catch((error) => ({ success: false, message: error.message })));
  }
  return results;
}

async function getTokenStatus(appUserId) {
  const [accounts, apps] = await Promise.all([listAccounts(appUserId), listUserApps(appUserId)]);
  return {
    appConfigured: apps.length > 0,
    oauthAvailable: apps.length > 0 && Boolean(process.env.SESSION_SECRET),
    accounts: accounts.map((row) => ({
      id: String(row.fb_user_id),
      name: row.fb_name,
      avatar: row.fb_avatar || null,
      status: row.token_status || 'unknown',
      type: row.token_type || 'unknown',
      expiresAt: toIso(row.token_expires_at),
      checkedAt: toIso(row.token_checked_at),
      error: row.token_error || null,
      metaAppId: row.meta_app_id ? String(row.meta_app_id) : null
    }))
  };
}

function onTokensRenewed(hook) {
  renewedHooks.push(hook);
}

function startTokenAutoRenew() {
  const run = (reason) => renewAll()
    .then((results) => {
      const renewed = results.filter((item) => item.exchanged || item.repairedPages > 0).length;
      const expired = results.filter((item) => item.status === 'expired').length;
      if (renewed || expired) console.log(`🔑 [Token Auto Renew] (${reason}) Làm mới ${renewed} nick, ${expired} nick đã hết hạn cần đăng nhập lại.`);
    })
    .catch((error) => console.warn('[Token Auto Renew]', error.message));
  setTimeout(() => run('khởi động'), 20000);
  setInterval(() => run('định kỳ'), RENEW_INTERVAL_MS);
  console.log('🔑 [Token Auto Renew] Tự kiểm tra & làm mới token Facebook mỗi 30 phút.');
}

module.exports = {
  TokenError,
  allUserApps,
  connectUserToken,
  ensureTokenSchema,
  getAccountCredentials,
  getMetaAppCredentials,
  getPageAppCredentials,
  getTokenStatus,
  getUserMetaApps,
  inspectUserToken,
  listAccounts,
  listUserApps,
  loginScopes,
  matchWebhookApp,
  onTokensRenewed,
  renewAll,
  requestRenewForPage,
  removeUserMetaApp,
  saveUserMetaApp,
  startTokenAutoRenew
};
