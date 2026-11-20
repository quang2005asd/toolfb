/**
 * FacebookLoginStatusService.js
 * Mức độ sẵn sàng của đăng nhập Facebook cho trang Kênh:
 *   setup   → chưa cấu hình Meta App hoặc App ID / App Secret sai — cần thiết lập theo hướng dẫn
 *   login   → Meta App ổn nhưng tài khoản tool chưa kết nối nick Facebook nào
 *   expired → đã có nick nhưng token đều hết hạn / bị thu hồi
 *   partial → đã kết nối nhưng token thiếu quyền cho một số tính năng
 *   ready   → đủ quyền cho mọi tính năng
 * Kết quả gọi Facebook được nhớ tạm (app 10 phút, mỗi nick 5 phút) để không tốn lượt gọi Graph API.
 */
const axios = require('axios');
const tokenService = require('./FacebookTokenService');
const { decryptToken } = require('./FacebookPageConnections');
const { clientOrigin, facebookRedirectUri } = require('../middlewares/auth');

const GRAPH = `https://graph.facebook.com/${process.env.FB_GRAPH_VERSION || 'v19.0'}`;
const APP_CACHE_MS = 10 * 60 * 1000;
const ACCOUNT_CACHE_MS = 5 * 60 * 1000;

// Quyền Facebook cần cho từng tính năng của tool. levels: mức quyền có xin tính năng này
// (nick kết nối bằng "Quyền tối giản" không bị báo thiếu quyền tin nhắn / bình luận)
const FEATURES = [
  { key: 'posting', label: 'Đăng bài & lên lịch lên Fanpage', scopes: ['pages_show_list', 'pages_manage_posts', 'pages_read_engagement'], levels: ['full', 'minimal'] },
  { key: 'insights', label: 'Báo cáo lượt xem, người xem', scopes: ['read_insights'], levels: ['full', 'minimal'] },
  { key: 'inbox', label: 'Hộp thư Messenger & trả lời tự động', scopes: ['pages_messaging', 'pages_manage_metadata'], levels: ['full'] },
  { key: 'instagram', label: 'Tin nhắn Instagram', scopes: ['instagram_basic', 'instagram_manage_messages'], levels: ['full'] },
  { key: 'comments', label: 'Bình luận mồi & AI Bình luận', scopes: ['pages_read_user_content', 'pages_manage_engagement'], levels: ['full'] },
  { key: 'business', label: 'Fanpage thuộc Meta Business', scopes: ['business_management'], optional: true, levels: ['full', 'minimal'] }
];

const appCache = new Map(); // khóa app -> { at, value }
const accountCache = new Map(); // key -> { at, value }

function graphError(error) {
  const fb = error.response?.data?.error;
  return fb ? { code: fb.code, message: fb.message } : { code: null, message: error.message };
}

async function inspectApp(creds, force) {
  const key = `${creds.appId}:${creds.appSecret.length}:${creds.appSecret.slice(-4)}`;
  const cached = appCache.get(key);
  if (!force && cached && Date.now() - cached.at < APP_CACHE_MS) return cached.value;

  const value = { credentialsValid: false, credentialsError: null, domainOk: null, domainMessage: null, roles: null, name: null };
  try {
    await axios.get(`${GRAPH}/oauth/access_token`, {
      params: { client_id: creds.appId, client_secret: creds.appSecret, grant_type: 'client_credentials' },
      timeout: 15000
    });
    value.credentialsValid = true;
  } catch (error) {
    value.credentialsError = graphError(error).message;
  }

  if (value.credentialsValid) {
    // Facebook kiểm tra miền của redirect_uri trước mã đăng nhập: gửi mã giả, miền chưa khai báo → lỗi 191
    try {
      await axios.get(`${GRAPH}/oauth/access_token`, {
        params: { client_id: creds.appId, client_secret: creds.appSecret, redirect_uri: facebookRedirectUri(), code: 'tool-face-domain-check' },
        timeout: 15000
      });
    } catch (error) {
      const fb = graphError(error);
      value.domainOk = fb.code !== 191;
      if (!value.domainOk) value.domainMessage = fb.message;
    }
    // Tên app trên Meta (vd. "Tool Social", "clone 2") — hiện cho người dùng biết đang đăng nhập qua app nào
    value.name = await tokenService.fetchAppName(creds.appId, creds.appSecret);
    try {
      const response = await axios.get(`${GRAPH}/${creds.appId}/roles`, {
        params: { access_token: `${creds.appId}|${creds.appSecret}`, limit: 200 },
        timeout: 15000
      });
      const roles = {};
      for (const row of response.data?.data || []) roles[row.role] = (roles[row.role] || 0) + 1;
      value.roles = roles;
    } catch {
      value.roles = null;
    }
  }

  appCache.set(key, { at: Date.now(), value });
  return value;
}

// Quyền nick đã cấp cho app: granted = đang có, declined = người dùng đã tắt trong hộp thoại Facebook.
// Quyền không nằm trong cả hai = Facebook chưa từng hỏi (app chưa có quyền đó lúc đăng nhập / cấu hình đăng nhập không gồm quyền đó).
async function readPermissions(token) {
  const response = await axios.get(`${GRAPH}/me/permissions`, { params: { access_token: token }, timeout: 15000 });
  const rows = response.data?.data || [];
  return {
    granted: rows.filter((item) => item.status === 'granted').map((item) => item.permission),
    declined: rows.filter((item) => item.status === 'declined').map((item) => item.permission)
  };
}

async function inspectAccount(row, creds, force) {
  const cacheKey = `${row.app_user_id}:${row.fb_user_id}:${String(row.access_token_encrypted || '').slice(-24)}`;
  const cached = accountCache.get(cacheKey);
  if (!force && cached && Date.now() - cached.at < ACCOUNT_CACHE_MS) return cached.value;

  const token = decryptToken(row.access_token_encrypted);
  let valid = !['expired', 'invalid'].includes(row.token_status);
  let scopes = null;
  let declined = null;
  let tokenAppId = null;
  let error = null;
  if (!token) {
    valid = false;
    error = 'Không giải mã được token đã lưu — hãy đăng nhập lại Facebook.';
  } else {
    if (creds.configured) {
      try {
        const response = await axios.get(`${GRAPH}/debug_token`, {
          params: { input_token: token, access_token: `${creds.appId}|${creds.appSecret}` },
          timeout: 15000
        });
        const data = response.data?.data || {};
        valid = data.is_valid !== false;
        scopes = Array.isArray(data.scopes) ? data.scopes : null;
        // App đã cấp token này (có thể khác app chung nếu nick kết nối qua Meta App riêng / app cũ)
        tokenAppId = data.app_id ? String(data.app_id) : null;
        if (!valid) error = data.error?.message || 'Token không còn hiệu lực.';
      } catch (err) {
        error = graphError(err).message;
      }
    }
    if (scopes === null && valid) {
      try {
        const permissions = await readPermissions(token);
        scopes = permissions.granted;
        declined = permissions.declined;
        error = null;
      } catch (err) {
        const fb = graphError(err);
        if (fb.code === 190) valid = false;
        error = error || fb.message;
      }
    }
    // Thiếu quyền: hỏi thêm Facebook quyền nào bị tắt, quyền nào chưa từng được hỏi — để chỉ đúng cách xử lý
    const wanted = FEATURES.flatMap((feature) => feature.scopes);
    if (valid && scopes && declined === null && wanted.some((scope) => !scopes.includes(scope))) {
      declined = await readPermissions(token).then((permissions) => permissions.declined).catch(() => null);
    }
  }

  const level = tokenService.normalizeLevel(row.login_level);
  const features = FEATURES.map((feature) => {
    const missing = scopes ? feature.scopes.filter((scope) => !scopes.includes(scope)) : [];
    // Tính năng không thuộc mức quyền đã chọn: không tính là thiếu (hiện "không xin")
    const notRequested = !feature.levels.includes(level);
    return {
      key: feature.key,
      label: feature.label,
      optional: Boolean(feature.optional) || notRequested,
      notRequested,
      ok: valid && scopes ? missing.length === 0 : null,
      missing,
      // null = không đọc được; [] = không quyền nào bị tắt (thiếu vì Facebook chưa từng hỏi)
      declined: declined === null ? null : missing.filter((scope) => declined.includes(scope))
    };
  });
  const value = {
    id: String(row.fb_user_id),
    name: row.fb_name,
    avatar: row.fb_avatar || null,
    level,
    valid,
    error,
    scopes,
    tokenAppId,
    features
  };
  accountCache.set(cacheKey, { at: Date.now(), value });
  return value;
}

async function getLoginStatus(appUserId, { force = false } = {}) {
  // App chung của tool (mặc định) + Meta App riêng người dùng tự thêm ở mục Nâng cao (có thể nhiều app)
  const [userApps, systemCreds] = await Promise.all([tokenService.listUserApps(appUserId), tokenService.getSystemApp()]);
  const system = systemCreds.configured
    ? {
        configured: true,
        appId: systemCreds.appId,
        // Configuration ID (Facebook Login for Business) có hay không — không trả giá trị cho người dùng thường
        loginForBusiness: Boolean(systemCreds.configFull || systemCreds.configMinimal),
        ...(await inspectApp(systemCreds, force))
      }
    : { configured: false, appId: null, loginForBusiness: false, credentialsValid: false, credentialsError: null, domainOk: null, domainMessage: null, roles: null };
  const apps = [];
  for (const userApp of userApps) {
    const appCreds = { appId: userApp.appId, appSecret: userApp.appSecret, configured: true };
    apps.push({ appId: userApp.appId, label: userApp.label || '', ...(await inspectApp(appCreds, force)) });
  }
  const systemUsable = system.configured && system.credentialsValid;
  const primaryOwn = apps.find((item) => item.credentialsValid) || apps[0] || null;
  const primary = systemUsable ? { ...system, label: system.name ? `App chung “${system.name}”` : 'App chung của tool' } : primaryOwn;
  const creds = systemUsable
    ? { appId: system.appId, configured: true }
    : primaryOwn ? { ...userApps.find((item) => item.appId === primaryOwn.appId), configured: true } : { appId: '', appSecret: '', configured: false };
  const origin = clientOrigin();
  let domain = origin;
  try { domain = new URL(origin).hostname; } catch {}

  const app = {
    configured: creds.configured,
    appId: creds.appId || null,
    label: primary?.label || '',
    source: systemUsable ? 'system' : 'user',
    redirectUri: facebookRedirectUri(),
    siteOrigin: origin,
    domain,
    credentialsValid: false,
    credentialsError: null,
    domainOk: null,
    domainMessage: null,
    roles: null
  };
  if (primary) Object.assign(app, { credentialsValid: primary.credentialsValid, credentialsError: primary.credentialsError, domainOk: primary.domainOk, domainMessage: primary.domainMessage, roles: primary.roles });

  const rows = await tokenService.listAccounts(appUserId);
  const accounts = [];
  for (const row of rows) accounts.push({ ...(await inspectAccount(row, await tokenService.getAccountCredentials(row), force)), metaAppId: row.meta_app_id ? String(row.meta_app_id) : null });

  let level = 'ready';
  if (!creds.configured || !app.credentialsValid) level = 'setup';
  else if (!accounts.length) level = 'login';
  else if (accounts.every((account) => !account.valid)) level = 'expired';
  else if (accounts.some((account) => account.valid && account.features.some((feature) => !feature.optional && feature.ok === false))) level = 'partial';

  return {
    level,
    app,
    apps,
    system,
    accounts,
    features: FEATURES,
    loginScopes: tokenService.loginScopes().split(',').map((item) => item.trim()).filter(Boolean),
    checkedAt: new Date().toISOString()
  };
}

module.exports = { FEATURES, getLoginStatus };
