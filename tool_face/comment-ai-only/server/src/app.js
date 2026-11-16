require('dotenv').config();

const crypto = require('crypto');
const axios = require('axios');
const cors = require('cors');
const express = require('express');
const { AppUserError, loginAppUser } = require('./utils/AuthUserService');
const {
  SESSION_COOKIE,
  OAUTH_STATE_COOKIE,
  SESSION_TTL_SECONDS,
  clientOrigin,
  clearCookie,
  facebookRedirectUri,
  loadSession,
  parseCookies,
  requireAuth,
  setCookie,
  signSession
} = require('./middlewares/auth');
const {
  disconnectFacebookPage,
  getConnectedPages,
  saveManualFacebookPage,
  syncAllConnectedFbAccounts
} = require('./utils/FacebookPageConnections');
const facebookTokenService = require('./utils/FacebookTokenService');
const commentAiService = require('./utils/CommentAiService');
const { commentAiRouter, facebookWebhookRouter } = require('./modules/comment-ai/comment-ai.routes');

const app = express();
const port = Number.parseInt(process.env.PORT || '5000', 10);
const allowedOrigins = new Set((process.env.CLIENT_ORIGIN || 'http://localhost:3000')
  .split(',').map((origin) => origin.trim().replace(/\/$/, '')).filter(Boolean));

app.set('trust proxy', 1);
app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    const normalized = origin.replace(/\/$/, '');
    callback(null, allowedOrigins.has(normalized) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(normalized));
  },
  credentials: true
}));
app.use(express.json({
  limit: '2mb',
  verify(req, _res, buffer) {
    if (req.originalUrl.startsWith('/api/webhooks/')) req.rawBody = buffer;
  }
}));
app.use('/api', loadSession);

function clientUrl(pathname, query = {}) {
  const url = new URL(pathname, `${clientOrigin()}/`);
  for (const [key, value] of Object.entries(query)) {
    if (value) url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function sendAuthError(res, error) {
  if (error instanceof AppUserError) {
    return res.status(error.status).json({ success: false, code: error.code, message: error.message });
  }
  console.error('[Auth]', error.message);
  return res.status(500).json({ success: false, message: 'Không thể xử lý yêu cầu đăng nhập.' });
}

app.get('/api/health', (_req, res) => res.json({ success: true, service: 'comment-ai-only' }));

app.post('/api/auth/login', async (req, res) => {
  try {
    const user = await loginAppUser(req.body || {});
    setCookie(req, res, SESSION_COOKIE, signSession(user), SESSION_TTL_SECONDS);
    return res.json({ success: true, user });
  } catch (error) {
    return sendAuthError(res, error);
  }
});

app.get('/api/auth/me', requireAuth, (req, res) => res.json({ success: true, user: req.user }));
app.post('/api/auth/logout', (_req, res) => {
  clearCookie(_req, res, SESSION_COOKIE);
  return res.json({ success: true });
});

app.get('/api/auth/facebook', requireAuth, async (_req, res) => {
  const { appId, configured } = await facebookTokenService.getMetaAppCredentials();
  if (!configured) return res.redirect(clientUrl('/channels/', { error: 'app_not_configured' }));

  const state = crypto.randomBytes(24).toString('hex');
  setCookie(_req, res, OAUTH_STATE_COOKIE, state, 600);
  const authorizationUrl = new URL(`https://www.facebook.com/${process.env.FB_GRAPH_VERSION || 'v19.0'}/dialog/oauth`);
  authorizationUrl.searchParams.set('client_id', appId);
  authorizationUrl.searchParams.set('redirect_uri', facebookRedirectUri());
  authorizationUrl.searchParams.set('state', state);
  authorizationUrl.searchParams.set('response_type', 'code');
  authorizationUrl.searchParams.set('scope', facebookTokenService.loginScopes());
  return res.redirect(authorizationUrl.toString());
});

app.get('/api/auth/facebook/callback', async (req, res) => {
  const stateCookie = parseCookies(req.headers.cookie)[OAUTH_STATE_COOKIE];
  clearCookie(req, res, OAUTH_STATE_COOKIE);
  if (!req.user) return res.redirect(clientUrl('/login', { next: '/channels' }));
  if (!stateCookie || typeof req.query.state !== 'string' || stateCookie !== req.query.state) {
    return res.redirect(clientUrl('/channels/', { error: 'oauth_state_invalid' }));
  }
  if (req.query.error) return res.redirect(clientUrl('/channels/', { error: 'oauth_denied' }));

  try {
    const { appId, appSecret, configured } = await facebookTokenService.getMetaAppCredentials();
    if (!configured) return res.redirect(clientUrl('/channels/', { error: 'app_not_configured' }));
    const tokenResponse = await axios.get(`https://graph.facebook.com/${process.env.FB_GRAPH_VERSION || 'v19.0'}/oauth/access_token`, {
      params: {
        client_id: appId,
        client_secret: appSecret,
        redirect_uri: facebookRedirectUri(),
        code: req.query.code
      },
      timeout: 15000
    });
    const result = await facebookTokenService.connectUserToken(req.user.sub, tokenResponse.data.access_token);
    return res.redirect(clientUrl('/channels/', { connected: result.pages.length }));
  } catch (error) {
    console.error('[Facebook OAuth Callback]', error.response?.data?.error?.message || error.message);
    return res.redirect(clientUrl('/channels/', { error: 'oauth_failed' }));
  }
});

app.get('/api/channels', requireAuth, async (req, res) => {
  try {
    return res.json({ success: true, channels: await getConnectedPages(req.user.sub) });
  } catch (error) {
    console.error('[Facebook Pages]', error.message);
    return res.status(500).json({ success: false, message: 'Không tải được danh sách Fanpage.' });
  }
});

app.post('/api/channels/connect-facebook', requireAuth, async (req, res) => {
  const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
  if (!token) return res.status(400).json({ success: false, message: 'Vui lòng nhập Facebook User Access Token.' });
  try {
    const result = await facebookTokenService.connectUserToken(req.user.sub, token);
    return res.json({
      success: true,
      pages: result.pages,
      message: `Đã kết nối ${result.fbAccount.name} và đồng bộ ${result.pages.length} Fanpage.`
    });
  } catch (error) {
    const status = error.status || 502;
    return res.status(status).json({ success: false, message: error.message || 'Không thể kết nối Facebook.' });
  }
});

app.post('/api/channels/manual', requireAuth, async (req, res) => {
  const pageId = String(req.body?.pageId || '').trim();
  const pageToken = String(req.body?.pageToken || '').trim();
  if (!/^\d+$/.test(pageId) || !pageToken) {
    return res.status(400).json({ success: false, message: 'Vui lòng nhập Page ID hợp lệ và Page Access Token.' });
  }
  try {
    const page = await saveManualFacebookPage(req.user.sub, pageId, pageToken);
    return res.status(201).json({ success: true, page, message: `Đã kết nối Fanpage ${page.name}.` });
  } catch (error) {
    return res.status(error.status || 502).json({ success: false, message: error.message || 'Không thể thêm Fanpage.' });
  }
});

app.post('/api/channels/sync', requireAuth, async (req, res) => {
  try {
    const results = await syncAllConnectedFbAccounts(req.user.sub);
    return res.json({ success: true, results, channels: await getConnectedPages(req.user.sub) });
  } catch (error) {
    console.error('[Facebook Sync]', error.message);
    return res.status(500).json({ success: false, message: 'Không thể đồng bộ Fanpage.' });
  }
});

app.delete('/api/channels/:pageId', requireAuth, async (req, res) => {
  if (!/^\d+$/.test(req.params.pageId)) return res.status(400).json({ success: false, message: 'Page ID không hợp lệ.' });
  try {
    const ownedPages = await getConnectedPages(req.user.sub);
    if (!ownedPages.some((page) => String(page.id) === req.params.pageId)) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy Fanpage đã kết nối.' });
    }
    await disconnectFacebookPage(req.user.sub, req.params.pageId);
    return res.json({ success: true, message: 'Đã ngắt kết nối Fanpage.' });
  } catch (error) {
    console.error('[Facebook Disconnect]', error.message);
    return res.status(500).json({ success: false, message: 'Không thể ngắt kết nối Fanpage.' });
  }
});

app.use('/api/comment-ai', commentAiRouter);
app.use('/api/webhooks/facebook', facebookWebhookRouter);
app.use((error, _req, res, _next) => {
  console.error('[Unhandled API Error]', error.message);
  return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi xử lý yêu cầu.' });
});

const server = app.listen(port, () => {
  console.log(`[Comment AI] API running on port ${port}`);
  commentAiService.startPolling();
  facebookTokenService.startTokenAutoRenew();
});

function shutdown() {
  server.close(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
