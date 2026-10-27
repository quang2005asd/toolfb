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

// Quyền Facebook cần cho từng tính năng của tool
const FEATURES = [
  { key: 'posting', label: 'Đăng bài & lên lịch lên Fanpage', scopes: ['pages_show_list', 'pages_manage_posts', 'pages_read_engagement'] },
  { key: 'inbox', label: 'Hộp thư Messenger & trả lời tự động', scopes: ['pages_messaging', 'pages_manage_metadata'] },
  { key: 'instagram', label: 'Tin nhắn Instagram', scopes: ['instagram_basic', 'instagram_manage_messages'] },
  { key: 'comments', label: 'Bình luận mồi & AI Bình luận', scopes: ['pages_read_user_content', 'pages_manage_engagement'] },
  { key: 'business', label: 'Fanpage thuộc Meta Business', scopes: ['business_management'], optional: true }
];

let appCache = null; // { key, at, value }
const accountCache = new Map(); // key -> { at, value }

function graphError(error) {
  const fb = error.response?.data?.error;
  return fb ? { code: fb.code, message: fb.message } : { code: null, message: error.message };
}

async function inspectApp(creds, force) {
  const key = `${creds.appId}:${creds.appSecret.length}:${creds.appSecret.slice(-4)}`;
  if (!force && appCache && appCache.key === key && Date.now() - appCache.at < APP_CACHE_MS) return appCache.value;

  const value = { credentialsValid: false, credentialsError: null, domainOk: null, domainMessage: null, roles: null };
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

  appCache = { key, at: Date.now(), value };
  return value;
}

async function inspectAccount(row, creds, force) {
  const cacheKey = `${row.app_user_id}:${row.fb_user_id}:${String(row.access_token_encrypted || '').slice(-24)}`;
  const cached = accountCache.get(cacheKey);
  if (!force && cached && Date.now() - cached.at < ACCOUNT_CACHE_MS) return cached.value;

  const token = decryptToken(row.access_token_encrypted);
  let valid = !['expired', 'invalid'].includes(row.token_status);
  let scopes = null;
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
        if (!valid) error = data.error?.message || 'Token không còn hiệu lực.';
      } catch (err) {
        error = graphError(err).message;
      }
    }
    if (scopes === null && valid) {
      try {
        const response = await axios.get(`${GRAPH}/me/permissions`, { params: { access_token: token }, timeout: 15000 });
        scopes = (response.data?.data || []).filter((item) => item.status === 'granted').map((item) => item.permission);
        error = null;
      } catch (err) {
        const fb = graphError(err);
        if (fb.code === 190) valid = false;
        error = error || fb.message;
      }
    }
  }

  const features = FEATURES.map((feature) => {
    const missing = scopes ? feature.scopes.filter((scope) => !scopes.includes(scope)) : [];
    return { key: feature.key, label: feature.label, optional: Boolean(feature.optional), ok: valid && scopes ? missing.length === 0 : null, missing };
  });
  const value = {
    id: String(row.fb_user_id),
    name: row.fb_name,
    avatar: row.fb_avatar || null,
    valid,
    error,
    scopes,
    features
  };
  accountCache.set(cacheKey, { at: Date.now(), value });
  return value;
}

async function getLoginStatus(appUserId, { force = false } = {}) {
  const creds = await tokenService.getMetaAppCredentials(appUserId);
  const systemCreds = creds.source === 'user' ? await tokenService.getMetaAppCredentials() : creds;
  const origin = clientOrigin();
  let domain = origin;
  try { domain = new URL(origin).hostname; } catch {}

  const app = {
    configured: creds.configured,
    appId: creds.appId || null,
    // 'user': Meta App riêng của người dùng · 'system': app chung của tool
    source: creds.source,
    sharedAppConfigured: systemCreds.configured,
    redirectUri: facebookRedirectUri(),
    siteOrigin: origin,
    domain,
    credentialsValid: false,
    credentialsError: null,
    domainOk: null,
    domainMessage: null,
    roles: null
  };
  if (creds.configured) Object.assign(app, await inspectApp(creds, force));

  const rows = await tokenService.listAccounts(appUserId);
  const accounts = [];
  for (const row of rows) accounts.push(await inspectAccount(row, creds, force));

  let level = 'ready';
  if (!creds.configured || !app.credentialsValid) level = 'setup';
  else if (!accounts.length) level = 'login';
  else if (accounts.every((account) => !account.valid)) level = 'expired';
  else if (accounts.some((account) => account.valid && account.features.some((feature) => !feature.optional && feature.ok === false))) level = 'partial';

  return {
    level,
    app,
    accounts,
    features: FEATURES,
    loginScopes: tokenService.loginScopes().split(',').map((item) => item.trim()).filter(Boolean),
    checkedAt: new Date().toISOString()
  };
}

module.exports = { FEATURES, getLoginStatus };
