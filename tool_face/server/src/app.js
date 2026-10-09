require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
// Reloaded config with new Business App credentials: 1397216959190868
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const XLSX = require('xlsx');
const { sql, getPool } = require('../config/db');
const { parseBulkExcel } = require('./modules/excel-parser/excelService');
const { addPostToQueue, removePostFromQueue } = require('../queues/post.queue');
const standaloneScheduler = require('./utils/StandaloneScheduler');
const { getFacebookPageAccessToken } = require('./utils/FacebookPageAccessToken');
const {
  canScheduleOnFacebook,
  schedulePostOnFacebook,
  cancelFacebookScheduledPost
} = require('./utils/FacebookScheduleService');
const {
  saveFacebookUser,
  syncFacebookPages,
  getStoredUserAccessToken,
  getStoredUserAvatar,
  saveUserAvatar,
  getConnectedPages,
  saveManualFacebookPage,
  disconnectFacebookPage,
  getConnectedFbAccounts,
  disconnectFbAccount,
  syncAllConnectedFbAccounts
} = require('./utils/FacebookPageConnections');
const { getSettings, saveMultipleSettings } = require('./utils/SettingsService');
const telegramAlertService = require('./utils/TelegramAlertService');
const tokenHealthCheckService = require('./utils/TokenHealthCheckService');
const aiConversationService = require('./utils/AiConversationService');
const channelGroupService = require('./utils/ChannelGroupService');
const {
  AppUserError,
  accountExists,
  changeOwnPassword,
  createUserByActor,
  deleteUserByActor,
  ensureAppUserSchema,
  getUserDisplayMap,
  listUsersForActor,
  loginAppUser,
  registerAppUser,
  resetUserPasswordByActor,
  updateOwnProfile,
  updateUserByActor
} = require('./utils/AppUserService');
const { PERMISSIONS, assignableRoles, hasPermission, isTopRole, publicRoles, rolesAtOrAbove, rolesBelow } = require('./utils/Roles');
const aiContentGenerator = require('./utils/AiContentGenerator');
const aiImageService = require('./utils/AiImageService');
const webSearchService = require('./utils/WebSearchService');
const {
  OAUTH_STATE_COOKIE,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  authConfiguration,
  clearCookie,
  clientOrigin,
  facebookRedirectUri,
  loadSession,
  parseCookies,
  requireAuth,
  requirePermission,
  setCookie,
  signSession
} = require('./middlewares/auth');

const app = express();
const frontendOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:3000';
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const clean = origin.replace(/\/$/, '');
    if (clean === frontendOrigin || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(clean)) {
      return callback(null, true);
    }
    return callback(null, true);
  },
  credentials: true
}));
app.use(express.json({ limit: '2mb' }));
app.use('/api', loadSession);

const mediaDirectory = process.env.APP_DATA_DIR
  ? path.join(process.env.APP_DATA_DIR, 'uploads')
  : path.resolve(__dirname, '../uploads');
fs.mkdirSync(mediaDirectory, { recursive: true });
const memoryUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const mediaUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, mediaDirectory),
    filename: (_req, file, callback) => callback(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`)
  }),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    if (!file.mimetype.startsWith('image/') && !file.mimetype.startsWith('video/')) {
      return callback(new Error('Chỉ hỗ trợ tệp hình ảnh hoặc video.'));
    }
    return callback(null, true);
  }
});

function handleMediaUpload(req, res, next) {
  mediaUpload.single('file')(req, res, (error) => {
    if (!error) return next();
    const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    return res.status(status).json({
      success: false,
      message: error.code === 'LIMIT_FILE_SIZE' ? 'Tệp vượt quá giới hạn 100 MB.' : error.message
    });
  });
}

function sendApiError(res, label, error, fallback) {
  const message = error.response?.data?.error?.message || error.message || fallback;
  console.error(`[${label}]`, message);
  return res.status(error.response ? 502 : 500).json({ success: false, message: fallback });
}

function localMediaFilename(link) {
  if (typeof link !== 'string' || !link.startsWith('local://')) return null;
  const fileName = link.slice('local://'.length);
  return path.basename(fileName) === fileName && /^[a-f0-9-]+\.[a-z0-9]+$/i.test(fileName) ? fileName : null;
}

let postOwnershipSchema;
async function ensurePostOwnershipSchema() {
  if (!postOwnershipSchema) {
    postOwnershipSchema = getPool().then((pool) => pool.request().query(`
      IF COL_LENGTH('dbo.Posts', 'created_by_user_id') IS NULL
        ALTER TABLE dbo.Posts ADD created_by_user_id varchar(64) NULL;
      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_Posts_created_by_user_id' AND object_id=OBJECT_ID('dbo.Posts'))
        CREATE INDEX IX_Posts_created_by_user_id ON dbo.Posts(created_by_user_id, scheduled_at DESC);
    `)).catch((error) => {
      postOwnershipSchema = null;
      throw error;
    });
  }
  await postOwnershipSchema;
}

async function userOwnsPage(userId, pageId) {
  const pages = await getConnectedPages(userId);
  return pages.some((page) => String(page.id) === String(pageId));
}

function sendAppUserError(res, label, error) {
  if (error instanceof AppUserError) {
    return res.status(error.status).json({ success: false, code: error.code, message: error.message });
  }
  console.error(`[${label}]`, error.message);
  return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi xử lý tài khoản.' });
}

// Phạm vi bài đăng theo role: bài của chính mình + bài của tài khoản cấp thấp hơn.
// Role cao nhất (Admin) xem được cả bài không gắn tài khoản, trừ bài của Admin khác.
function applyPostScope(req, request, column = 'created_by_user_id') {
  request.input('scopeUserId', sql.VarChar(64), String(req.user.sub));
  if (!hasPermission(req.user.role, PERMISSIONS.POSTS_TEAM)) {
    return `${column} = @scopeUserId`;
  }
  if (isTopRole(req.user.role)) {
    const peerRoles = rolesAtOrAbove(req.user.role).map((role) => `'${role}'`).join(', ');
    return `(${column} = @scopeUserId OR ${column} IS NULL OR ${column} NOT IN (SELECT CAST(id AS varchar(64)) FROM AppUsers WHERE role IN (${peerRoles})))`;
  }
  const lowerRoles = rolesBelow(req.user.role).map((role) => `'${role}'`).join(', ');
  if (!lowerRoles) return `${column} = @scopeUserId`;
  return `(${column} = @scopeUserId OR ${column} IN (SELECT CAST(id AS varchar(64)) FROM AppUsers WHERE role IN (${lowerRoles})))`;
}

app.get('/api/auth/status', (_req, res) => {
  const config = authConfiguration();
  return res.json({
    success: true,
    configured: config.configured,
    missing: config.missing
  });
});

// Kiểm tra tài khoản (tên đăng nhập hoặc Gmail) đã tồn tại chưa — dùng cho form đăng nhập / đăng ký
app.get('/api/auth/check-account', async (req, res) => {
  const identifier = typeof req.query.identifier === 'string' ? req.query.identifier.trim() : '';
  if (!identifier) return res.status(400).json({ success: false, message: 'Thiếu tên đăng nhập hoặc Gmail.' });
  try {
    return res.json({ success: true, exists: await accountExists(identifier) });
  } catch (error) {
    return sendAppUserError(res, 'Check Account Error', error);
  }
});

app.get('/api/auth/me', async (req, res) => {
  if (!req.user) return res.status(401).json({ authenticated: false });
  let avatar = null;
  if (req.user.sub) {
    try {
      avatar = await getStoredUserAvatar(req.user.sub);
      if (!avatar) {
        const token = await getStoredUserAccessToken(req.user.sub);
        if (token) {
          const graphVersion = process.env.FB_GRAPH_VERSION || 'v19.0';
          const fbRes = await axios.get(`https://graph.facebook.com/${graphVersion}/me`, {
            params: { fields: 'picture.width(150).height(150)', access_token: token },
            timeout: 5000
          });
          avatar = fbRes.data.picture?.data?.url || null;
          if (avatar) {
            await saveUserAvatar(req.user.sub, avatar);
          }
        }
      }
    } catch (avatarError) {
      console.warn('[Avatar Fetch Warning]', avatarError.message);
    }
  }
  return res.json({
    authenticated: true,
    user: {
      ...req.user.account,
      avatar: avatar || null,
      assignableRoles: assignableRoles(req.user.role)
    }
  });
});

// Facebook OAuth chỉ dùng để liên kết Facebook / Fanpage vào tài khoản đang đăng nhập
app.get('/api/auth/facebook', (req, res) => {
  if (!req.user) {
    return res.redirect(302, `${clientOrigin()}/login?error=session_required`);
  }
  const config = authConfiguration();
  if (!config.configured) {
    return res.status(503).json({ success: false, message: 'Facebook login chưa cấu hình đầy đủ.', missing: config.missing });
  }

  const state = crypto.randomBytes(32).toString('base64url');
  setCookie(req, res, OAUTH_STATE_COOKIE, state, 10 * 60);
  const graphVersion = process.env.FB_GRAPH_VERSION || 'v19.0';
  const authorizationUrl = new URL(`https://www.facebook.com/${graphVersion}/dialog/oauth`);
  authorizationUrl.searchParams.set('client_id', process.env.FACEBOOK_APP_ID);
  authorizationUrl.searchParams.set('redirect_uri', facebookRedirectUri());
  authorizationUrl.searchParams.set('response_type', 'code');
  authorizationUrl.searchParams.set('scope', process.env.FACEBOOK_LOGIN_SCOPES || 'public_profile');
  authorizationUrl.searchParams.set('state', state);
  return res.redirect(302, authorizationUrl.toString());
});

app.get('/api/auth/facebook/callback', async (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  const requestState = typeof req.query.state === 'string' ? Buffer.from(req.query.state) : Buffer.alloc(0);
  const cookieState = cookies[OAUTH_STATE_COOKIE] ? Buffer.from(cookies[OAUTH_STATE_COOKIE]) : Buffer.alloc(0);
  const stateMatches = requestState.length > 0
    && requestState.length === cookieState.length
    && crypto.timingSafeEqual(requestState, cookieState);
  clearCookie(req, res, OAUTH_STATE_COOKIE);
  if (!req.user) {
    return res.redirect(`${clientOrigin()}/login?error=session_required`);
  }
  if (!stateMatches || typeof req.query.code !== 'string') {
    return res.redirect(`${clientOrigin()}/channels?error=oauth_state_invalid`);
  }

  try {
    const graphVersion = process.env.FB_GRAPH_VERSION || 'v19.0';
    const shortTokenResponse = await axios.get(`https://graph.facebook.com/${graphVersion}/oauth/access_token`, {
      params: {
        client_id: process.env.FACEBOOK_APP_ID,
        client_secret: process.env.FACEBOOK_APP_SECRET,
        redirect_uri: facebookRedirectUri(),
        code: req.query.code
      },
      timeout: 15000
    });
    let userAccessToken = shortTokenResponse.data.access_token;
    let tokenExpiresIn = shortTokenResponse.data.expires_in;
    try {
      const longTokenResponse = await axios.get(`https://graph.facebook.com/${graphVersion}/oauth/access_token`, {
        params: {
          grant_type: 'fb_exchange_token',
          client_id: process.env.FACEBOOK_APP_ID,
          client_secret: process.env.FACEBOOK_APP_SECRET,
          fb_exchange_token: userAccessToken
        },
        timeout: 15000
      });
      userAccessToken = longTokenResponse.data.access_token || userAccessToken;
      tokenExpiresIn = longTokenResponse.data.expires_in || tokenExpiresIn;
    } catch (exchangeError) {
      console.warn('[Facebook OAuth] Could not exchange to a long-lived token; using the short-lived token for this session.');
    }
    const profileResponse = await axios.get(`https://graph.facebook.com/${graphVersion}/me`, {
      params: { fields: 'id,name,picture.width(150).height(150)', access_token: userAccessToken },
      timeout: 15000
    });
    const fbData = profileResponse.data;
    await saveFacebookUser({ id: req.user.sub, name: fbData.name, picture: fbData.picture }, userAccessToken, tokenExpiresIn);
    const connectedPages = await syncFacebookPages(req.user.sub, userAccessToken, {
      id: fbData.id,
      name: fbData.name,
      avatar: fbData.picture?.data?.url || null
    });
    console.log(`[Facebook OAuth] Connected ${connectedPages.length} Page(s) for account ${req.user.username} (FB: ${fbData.id}).`);
    return res.redirect(`${clientOrigin()}/channels?connected=${connectedPages.length}`);
  } catch (error) {
    console.error('[Facebook OAuth Error]', error.response?.status || error.message);
    return res.redirect(`${clientOrigin()}/channels?error=oauth_failed`);
  }
});

// Đăng ký: tài khoản mới luôn là Thành viên; đăng ký xong người dùng tự đăng nhập
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password, confirmPassword } = req.body || {};
    const user = await registerAppUser({ username, email, password, confirmPassword });
    return res.status(201).json({
      success: true,
      user: { username: user.username, email: user.email },
      message: 'Đăng ký tài khoản thành công! Hãy đăng nhập để bắt đầu.'
    });
  } catch (error) {
    return sendAppUserError(res, 'Register Error', error);
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { identifier, username, password } = req.body || {};
    const user = await loginAppUser({ identifier: identifier || username, password });
    setCookie(req, res, SESSION_COOKIE, signSession(user), SESSION_TTL_SECONDS);
    return res.json({
      success: true,
      user: { ...user, avatar: null, assignableRoles: assignableRoles(user.role) },
      message: `Đăng nhập thành công! Xin chào ${user.name}.`
    });
  } catch (error) {
    return sendAppUserError(res, 'Login Error', error);
  }
});

app.post('/api/auth/logout', (_req, res) => {
  clearCookie(_req, res, SESSION_COOKIE);
  clearCookie(_req, res, OAUTH_STATE_COOKIE);
  return res.json({ success: true });
});

// ═══ HỒ SƠ CÁ NHÂN ═══
app.patch('/api/profile', requireAuth, async (req, res) => {
  try {
    const { displayName, email } = req.body || {};
    const user = await updateOwnProfile(req.user.sub, { displayName, email });
    return res.json({ success: true, user, message: 'Đã cập nhật thông tin cá nhân.' });
  } catch (error) {
    return sendAppUserError(res, 'Update Profile Error', error);
  }
});

app.post('/api/profile/password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body || {};
    await changeOwnPassword(req.user.sub, { currentPassword, newPassword, confirmPassword });
    return res.json({ success: true, message: 'Đã đổi mật khẩu thành công.' });
  } catch (error) {
    return sendAppUserError(res, 'Change Password Error', error);
  }
});

// ═══ PHÂN QUYỀN & QUẢN LÝ THÀNH VIÊN (Admin quản lý Quản lý + Thành viên, Quản lý quản lý Thành viên) ═══
app.get('/api/roles', requireAuth, (req, res) => {
  return res.json({ success: true, roles: publicRoles(), assignable: assignableRoles(req.user.role) });
});

app.get('/api/users', requirePermission(PERMISSIONS.USERS_MANAGE), async (req, res) => {
  try {
    const users = await listUsersForActor(req.user);
    return res.json({ success: true, users, assignable: assignableRoles(req.user.role) });
  } catch (error) {
    return sendAppUserError(res, 'List Users Error', error);
  }
});

app.post('/api/users', requirePermission(PERMISSIONS.USERS_MANAGE), async (req, res) => {
  try {
    const { username, email, displayName, password, confirmPassword, role } = req.body || {};
    const user = await createUserByActor(req.user, { username, email, displayName, password, confirmPassword, role });
    return res.status(201).json({ success: true, user, message: `Đã tạo tài khoản "${user.username}".` });
  } catch (error) {
    return sendAppUserError(res, 'Create User Error', error);
  }
});

app.patch('/api/users/:id', requirePermission(PERMISSIONS.USERS_MANAGE), async (req, res) => {
  try {
    const { displayName, email, role, status } = req.body || {};
    const user = await updateUserByActor(req.user, req.params.id, { displayName, email, role, status });
    return res.json({ success: true, user, message: `Đã cập nhật tài khoản "${user.username}".` });
  } catch (error) {
    return sendAppUserError(res, 'Update User Error', error);
  }
});

app.post('/api/users/:id/reset-password', requirePermission(PERMISSIONS.USERS_MANAGE), async (req, res) => {
  try {
    const { password, confirmPassword } = req.body || {};
    await resetUserPasswordByActor(req.user, req.params.id, { password, confirmPassword });
    return res.json({ success: true, message: 'Đã đặt lại mật khẩu.' });
  } catch (error) {
    return sendAppUserError(res, 'Reset Password Error', error);
  }
});

app.delete('/api/users/:id', requirePermission(PERMISSIONS.USERS_MANAGE), async (req, res) => {
  try {
    const user = await deleteUserByActor(req.user, req.params.id);
    return res.json({ success: true, message: `Đã xóa tài khoản "${user.username}".` });
  } catch (error) {
    return sendAppUserError(res, 'Delete User Error', error);
  }
});

const legacyMediaDir = path.resolve(__dirname, '../uploads');
if (legacyMediaDir !== mediaDirectory && fs.existsSync(legacyMediaDir)) {
  app.use('/uploads', express.static(legacyMediaDir));
}
app.use('/uploads', express.static(mediaDirectory));

app.post('/api/media', requireAuth, handleMediaUpload, (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'Vui lòng chọn ảnh hoặc video.' });
  return res.status(201).json({
    success: true,
    mediaLink: `local://${req.file.filename}`,
    previewUrl: `/api/media/${req.file.filename}`,
    fileName: req.file.originalname,
    size: req.file.size
  });
});

app.get('/api/media/:filename', (req, res) => {
  const fileName = path.basename(req.params.filename);
  let filePath = path.resolve(mediaDirectory, fileName);
  if (!fs.existsSync(filePath)) {
    const legacyPath = path.resolve(__dirname, '../uploads', fileName);
    if (fs.existsSync(legacyPath)) filePath = legacyPath;
  }
  if (fs.existsSync(filePath)) {
    return res.sendFile(filePath);
  }
  return res.status(404).json({ success: false, message: 'Tệp tin media không tồn tại.' });
});

app.get('/api/ai/status', requireAuth, async (_req, res) => {
  const settings = await getSettings().catch(() => ({}));
  const effectiveKey = settings.ai_api_key || process.env.AI_API_KEY;
  let effectiveModel = settings.ai_model || process.env.AI_MODEL || 'gpt-4o-mini';
  if (effectiveKey?.startsWith('gsk_') && (effectiveModel === 'llama-3.3-70b-versatile' || effectiveModel === 'gpt-4o-mini')) {
    effectiveModel = 'openai/gpt-oss-120b';
  }
  return res.json({
    success: true,
    configured: Boolean(effectiveKey),
    model: effectiveModel
  });
});

app.get('/api/ai/conversations', requireAuth, async (req, res) => {
  try {
    const conversations = await aiConversationService.listConversations(req.user.sub);
    return res.json({ success: true, conversations });
  } catch (err) {
    console.error('[AI Conversations List Error]', err);
    return res.status(500).json({ success: false, message: 'Không thể tải danh sách cuộc trò chuyện.' });
  }
});

app.get('/api/ai/conversations/:id', requireAuth, async (req, res) => {
  try {
    const conversation = await aiConversationService.getConversation(req.user.sub, req.params.id);
    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Cuộc trò chuyện không tồn tại.' });
    }
    return res.json({ success: true, conversation });
  } catch (err) {
    console.error('[AI Conversation Detail Error]', err);
    return res.status(500).json({ success: false, message: 'Không thể tải chi tiết cuộc trò chuyện.' });
  }
});

app.post('/api/ai/conversations', requireAuth, async (req, res) => {
  try {
    const title = typeof req.body.title === 'string' && req.body.title.trim()
      ? req.body.title.trim()
      : 'Cuộc trò chuyện mới';
    const conversation = await aiConversationService.saveConversation(req.user.sub, {
      title,
      messages: []
    });
    return res.json({ success: true, conversation });
  } catch (err) {
    console.error('[AI Conversation Create Error]', err);
    return res.status(500).json({ success: false, message: 'Không thể tạo cuộc trò chuyện mới.' });
  }
});

app.patch('/api/ai/conversations/:id', requireAuth, async (req, res) => {
  try {
    const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
    if (!title) return res.status(400).json({ success: false, message: 'Tiêu đề không được để trống.' });
    const ok = await aiConversationService.renameConversation(req.user.sub, req.params.id, title);
    if (!ok) return res.status(404).json({ success: false, message: 'Không tìm thấy cuộc trò chuyện để đổi tên.' });
    return res.json({ success: true, message: 'Đã đổi tên thành công.' });
  } catch (err) {
    console.error('[AI Conversation Rename Error]', err);
    return res.status(500).json({ success: false, message: 'Không thể đổi tên cuộc trò chuyện.' });
  }
});

app.delete('/api/ai/conversations/:id', requireAuth, async (req, res) => {
  try {
    const ok = await aiConversationService.deleteConversation(req.user.sub, req.params.id);
    if (!ok) return res.status(404).json({ success: false, message: 'Không tìm thấy cuộc trò chuyện để xoá.' });
    return res.json({ success: true, message: 'Đã xoá cuộc trò chuyện thành công.' });
  } catch (err) {
    console.error('[AI Conversation Delete Error]', err);
    return res.status(500).json({ success: false, message: 'Không thể xoá cuộc trò chuyện.' });
  }
});

app.post('/api/ai/chat', requireAuth, async (req, res) => {
  const message = typeof req.body.message === 'string' ? req.body.message.trim() : '';
  const conversationId = typeof req.body.conversation_id === 'string' && req.body.conversation_id.trim()
    ? req.body.conversation_id.trim()
    : null;
  const settings = await getSettings().catch(() => ({}));
  let apiKey = settings.ai_api_key || process.env.AI_API_KEY;
  let model = settings.ai_model || process.env.AI_MODEL || 'gpt-4o-mini';
  let baseUrl = (settings.ai_base_url || process.env.AI_API_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const systemPrompt = settings.ai_system_prompt || 'Bạn là trợ lý AI chuyên nghiệp hỗ trợ viết bài đăng Facebook.';

  if (apiKey?.startsWith('gsk_')) {
    if (baseUrl.includes('api.openai.com')) {
      baseUrl = 'https://api.groq.com/openai/v1';
    }
    if (model === 'llama-3.3-70b-versatile' || model === 'gpt-4o-mini') {
      model = 'openai/gpt-oss-120b';
    }
  }

  if (!message) return res.status(400).json({ success: false, message: 'Tin nhắn không được để trống.' });
  if (!apiKey) return res.status(503).json({ success: false, message: 'AI chưa được cấu hình. Hãy vào Cài đặt để thêm AI API Key.' });

  // Load existing conversation if id provided
  let conv = null;
  if (conversationId) {
    conv = await aiConversationService.getConversation(req.user.sub, conversationId).catch(() => null);
  }

  // Build history from either DB conversation or request body
  let history = [];
  if (conv && Array.isArray(conv.messages) && conv.messages.length > 0) {
    history = conv.messages
      .filter((item) => ['user', 'assistant'].includes(item.role) && typeof (item.content || item.text) === 'string')
      .slice(-12)
      .map((item) => ({ role: item.role, content: (item.content || item.text).slice(0, 4000) }));
  } else if (Array.isArray(req.body.history)) {
    history = req.body.history
      .filter((item) => ['user', 'assistant'].includes(item.role) && typeof (item.content || item.text) === 'string')
      .slice(-12)
      .map((item) => ({ role: item.role, content: (item.content || item.text).slice(0, 4000) }));
  }

  // Live Web Search & Anti-Hallucination Guardrail
  const enableWebSearch = req.body.enableWebSearch !== false;
  const eventDetails = typeof req.body.eventDetails === 'string' ? req.body.eventDetails.trim() : '';

  let newsContext = '';
  if (eventDetails) {
    newsContext = `\n\n📌 THÔNG TIN SỰ KIỆN DO NGƯỜI DÙNG CUNG CẤP:\n${eventDetails}\n(BẮT BUỘC BÁM SÁT THÔNG TIN NÀY)\n`;
  } else if (enableWebSearch && webSearchService.shouldSearchNews(message)) {
    try {
      newsContext = await webSearchService.getNewsContext(message, 5);
      if (newsContext) {
        console.log('[WebSearchService] Đã tra cứu tin tức thời sự nạp vào AI prompt thành công.');
      }
    } catch (searchErr) {
      console.warn('[WebSearchService Warning]', searchErr.message);
    }
  }

  const antiHallucinationRules = `\n\nQUY TẮC BẮT BUỘC KHI VIẾT VỀ NHÂN VẬT / SỰ KIỆN THẬT / TIN TỨC:
1. TUYỆT ĐỐI KHÔNG tự bịa đặt các chi tiết sai thực tế (như tỷ số, bàn thắng, sự việc chưa từng xảy ra).
2. Nếu có thông tin báo chí hoặc sự kiện người dùng cung cấp ở dưới, BẮT BUỘC phải dựa theo các dữ kiện đó để viết.
3. Nếu không có dữ kiện cụ thể, hãy tập trung vào chiều sâu cảm xúc, tri ân và hành trình thay vì bịa tình tiết giả định.`;
  const finalSystemPrompt = `${systemPrompt}${antiHallucinationRules}`;
  const userMessageToSend = newsContext ? `${message}\n${newsContext}` : message;

  try {
    const response = await axios.post(`${baseUrl}/chat/completions`, {
      model,
      messages: [
        { role: 'system', content: finalSystemPrompt },
        ...history,
        { role: 'user', content: userMessageToSend }
      ],
      temperature: 0.7
    }, { headers: { Authorization: `Bearer ${apiKey}` }, timeout: 60000 });
    const reply = response.data.choices?.[0]?.message?.content;
    if (!reply) throw new Error('AI provider returned an empty response.');

    // Save both messages into conversation history in DB
    const existingMessages = conv?.messages || [];
    const updatedMessages = [
      ...existingMessages,
      { role: 'user', content: message, createdAt: new Date().toISOString() },
      { role: 'assistant', content: reply, createdAt: new Date().toISOString() }
    ];
    const defaultTitle = message.length > 36 ? message.slice(0, 36) + '...' : message;
    const title = conv?.title || req.body.title || defaultTitle;
    const saved = await aiConversationService.saveConversation(req.user.sub, {
      id: conv?.id || conversationId || undefined,
      title,
      messages: updatedMessages
    });

    return res.json({
      success: true,
      reply,
      conversation_id: saved.id,
      conversation_title: saved.title
    });
  } catch (error) {
    const errMsg = error.response?.data?.error?.message || error.message;
    console.error('[AI Chat Error]', error.response?.status, errMsg);
    return res.status(502).json({
      success: false,
      message: errMsg || 'Không thể nhận phản hồi từ AI provider. Kiểm tra AI API Key hoặc endpoint trong Cài đặt.'
    });
  }
});

// ═══ AI CONTENT GENERATOR API ═══
app.post('/api/ai/generate-posts', requireAuth, async (req, res) => {
  try {
    const { prompt, tone, includeHashtags, includeEmoji } = req.body;
    const result = await aiContentGenerator.generatePosts(req.user.sub, {
      prompt,
      tone: tone || '',
      includeHashtags: includeHashtags !== false,
      includeEmoji: includeEmoji !== false
    });
    return res.json({ success: true, ...result });
  } catch (error) {
    console.error('[AI Generate Posts Error]', error.message);
    const status = error.response?.status === 429 ? 429 : 500;
    return res.status(status).json({ success: false, message: error.message });
  }
});

app.post('/api/ai/generate-seeding-comments', requireAuth, async (req, res) => {
  try {
    const { postContent, count = 3, tone } = req.body || {};
    if (!postContent || !postContent.trim()) {
      return res.status(400).json({ success: false, message: 'Vui lòng cung cấp nội dung bài viết.' });
    }
    const comments = await aiContentGenerator.generateSeedingComments({
      postContent: postContent.trim(),
      count: Number(count) || 3,
      tone: tone || 'tự nhiên, thân thiện'
    });
    return res.json({ success: true, comments });
  } catch (error) {
    console.error('[AI Generate Seeding Error]', error.message);
    const status = error.response?.status === 429 ? 429 : 500;
    return res.status(status).json({ success: false, message: error.message });
  }
});

app.get('/api/ai/drafts', requireAuth, async (req, res) => {
  try {
    const status = req.query.status || 'draft';
    const batchId = req.query.batch_id;
    let drafts;
    if (batchId) {
      drafts = await aiContentGenerator.getDraftsByBatch(req.user.sub, batchId);
    } else {
      drafts = await aiContentGenerator.getDrafts(req.user.sub, status);
    }
    return res.json({ success: true, drafts });
  } catch (error) {
    console.error('[AI Drafts Error]', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/ai/drafts/:id/regenerate', requireAuth, async (req, res) => {
  try {
    const draft = await aiContentGenerator.regenerateDraft(req.user.sub, parseInt(req.params.id, 10));
    return res.json({ success: true, draft });
  } catch (error) {
    console.error('[AI Regenerate Error]', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.put('/api/ai/drafts/:id', requireAuth, async (req, res) => {
  try {
    const draft = await aiContentGenerator.updateDraft(req.user.sub, parseInt(req.params.id, 10), req.body);
    return res.json({ success: true, draft });
  } catch (error) {
    console.error('[AI Update Draft Error]', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.delete('/api/ai/drafts/:id', requireAuth, async (req, res) => {
  try {
    const deleted = await aiContentGenerator.deleteDraft(req.user.sub, parseInt(req.params.id, 10));
    return res.json({ success: true, deleted });
  } catch (error) {
    console.error('[AI Delete Draft Error]', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ═══ AI IMAGE GENERATOR API ═══
app.post('/api/ai/generate-image', requireAuth, async (req, res) => {
  try {
    let { prompt, title, topic, content, style = 'photorealistic', ratio = '1:1' } = req.body || {};
    if (!prompt || !prompt.trim()) {
      prompt = await aiImageService.generateVisualPrompt({ title, topic, content, style });
    }
    const result = await aiImageService.generateImage({ prompt, style, ratio });
    return res.json({ success: true, ...result });
  } catch (error) {
    console.error('[AI Generate Image Error]', error.message);
    return res.status(500).json({ success: false, message: error.message || 'Không thể tạo ảnh AI.' });
  }
});

app.post('/api/ai/batch-generate-images', requireAuth, async (req, res) => {
  try {
    const { drafts = [], style = 'photorealistic', ratio = '1:1' } = req.body || {};
    if (!Array.isArray(drafts) || drafts.length === 0) {
      return res.status(400).json({ success: false, message: 'Danh sách bài đăng trống.' });
    }

    const results = [];
    for (const draft of drafts) {
      try {
        const visualPrompt = await aiImageService.generateVisualPrompt({
          title: draft.title,
          topic: draft.topic,
          content: draft.content,
          style
        });
        const img = await aiImageService.generateImage({
          prompt: visualPrompt,
          style,
          ratio
        });
        results.push({
          draftId: draft.id || draft.draftId,
          success: true,
          ...img
        });
      } catch (itemErr) {
        results.push({
          draftId: draft.id || draft.draftId,
          success: false,
          message: itemErr.message
        });
      }
    }

    return res.json({
      success: true,
      results,
      count: results.filter(r => r.success).length,
      message: `Đã tạo thành công ${results.filter(r => r.success).length}/${drafts.length} ảnh minh họa AI.`
    });
  } catch (error) {
    console.error('[Batch AI Generate Images Error]', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/ai/drafts/publish', requireAuth, async (req, res) => {
  try {
    const { drafts: draftItems } = req.body;
    if (!Array.isArray(draftItems) || draftItems.length === 0) {
      return res.status(400).json({ success: false, message: 'Danh sách bài đăng trống.' });
    }

    const pool = await getPool();
    const results = [];

    for (const item of draftItems) {
      const { draftId, content, pageIds, scheduledAt, hashtags, mediaType, mediaLinks } = item;
      if (!content?.trim() || !Array.isArray(pageIds) || pageIds.length === 0) {
        results.push({ draftId, success: false, message: 'Thiếu nội dung hoặc Fanpage.' });
        continue;
      }

      // Append hashtags to content
      let finalContent = content.trim();
      if (Array.isArray(hashtags) && hashtags.length > 0) {
        finalContent += '\n\n' + hashtags.join(' ');
      }

      const finalMediaType = ['image', 'video', 'reel', 'story'].includes(mediaType) ? mediaType : 'text';
      const finalMediaLinks = Array.isArray(mediaLinks) ? mediaLinks.filter(Boolean) : [];

      const targetPageIds = [...new Set(pageIds.map(id => String(id).trim()))].filter(id => /^\d+$/.test(id));
      const schedule = scheduledAt ? new Date(scheduledAt) : new Date();
      const isFbScheduledCandidate = canScheduleOnFacebook({ mediaType: finalMediaType, scheduledAt: schedule });

      const createdPostIds = [];
      let fbScheduledCount = 0;
      for (const pageId of targetPageIds) {
        try {
          const result = await pool.request()
            .input('pageId_' + pageId, sql.VarChar, pageId)
            .input('ownerId_' + pageId, sql.VarChar(64), req.user.sub)
            .input('content_' + pageId, sql.NVarChar, finalContent)
            .input('mediaType_' + pageId, sql.VarChar, finalMediaType)
            .input('mediaLinks_' + pageId, sql.NVarChar, JSON.stringify(finalMediaLinks))
            .input('scheduledAt_' + pageId, sql.DateTime2, schedule)
            .input('status_' + pageId, sql.VarChar, 'pending')
            .query(`INSERT INTO Posts (page_id, content, media_type, media_links, scheduled_at, status, created_by_user_id) OUTPUT INSERTED.id VALUES (@pageId_${pageId}, @content_${pageId}, @mediaType_${pageId}, @mediaLinks_${pageId}, @scheduledAt_${pageId}, @status_${pageId}, @ownerId_${pageId});`);
          const postId = result.recordset[0].id;
          createdPostIds.push(postId);

          if (isFbScheduledCandidate) {
            try {
              console.log(`[Publish Draft] Hẹn giờ bài ${postId} trực tiếp qua Facebook Cloud API cho page ${pageId}...`);
              const fbPostId = await schedulePostOnFacebook({
                pageId,
                content: finalContent,
                mediaType: finalMediaType,
                mediaLinks: finalMediaLinks,
                scheduledAt: schedule
              });
              await pool.request()
                .input('id', sql.Int, postId)
                .input('fbId', sql.NVarChar, fbPostId)
                .query("UPDATE Posts SET facebook_post_id = @fbId, status = 'scheduled' WHERE id = @id");
              fbScheduledCount++;
              console.log(`[Publish Draft] Đã hẹn giờ trực tiếp lên Facebook thành công! ID: ${fbPostId}`);
            } catch (fbErr) {
              console.warn(`[Publish Draft] Hẹn giờ Facebook Cloud thất bại cho bài ${postId}, dùng BullMQ fallback:`, fbErr.response?.data?.error?.message || fbErr.message);
            }
          }

          await standaloneScheduler.schedulePost(postId, schedule);
        } catch (err) {
          console.error(`[Publish Draft] Failed for page ${pageId}:`, err.message);
        }
      }

      // Mark draft as scheduled and save media
      if (draftId) {
        await aiContentGenerator.updateDraft(req.user.sub, draftId, {
          status: 'scheduled',
          scheduled_at: schedule,
          media_type: finalMediaType,
          media_links: finalMediaLinks
        });
      }

      results.push({
        draftId,
        success: true,
        postIds: createdPostIds,
        isFbCloud: fbScheduledCount > 0,
        fbScheduledCount
      });
    }

    const totalCloud = results.filter(r => r.isFbCloud).length;
    let summaryMsg = `Đã xử lý thành công ${results.filter(r => r.success).length} bài nháp.`;
    if (totalCloud > 0) {
      summaryMsg += ` Trong đó có ${totalCloud} bài đã đồng bộ trực tiếp lên lịch Facebook Meta (tắt app vẫn tự động đăng đúng giờ)!`;
    }

    return res.json({ success: true, results, message: summaryMsg });
  } catch (error) {
    console.error('[AI Publish Drafts Error]', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ═══ SETTINGS API ═══
app.get('/api/settings', requireAuth, async (req, res) => {
  try {
    const settings = await getSettings();
    const userToken = await getStoredUserAccessToken(req.user.sub);
    const pages = await getConnectedPages(req.user.sub);
    const effectiveApiKey = settings.ai_api_key || process.env.AI_API_KEY || '';
    const maskedApiKey = effectiveApiKey && effectiveApiKey.length > 8
      ? `${effectiveApiKey.slice(0, 7)}••••••••${effectiveApiKey.slice(-4)}`
      : (effectiveApiKey ? '••••••••' : '');
    const canManageSystem = hasPermission(req.user.role, PERMISSIONS.SETTINGS_SYSTEM);

    const publicSettings = {
      ai_provider: settings.ai_provider || 'openai',
      ai_model: settings.ai_model || process.env.AI_MODEL || 'gpt-4o-mini',
      ai_api_key_masked: maskedApiKey,
      ai_has_key: Boolean(effectiveApiKey),
      ai_base_url: settings.ai_base_url || process.env.AI_API_BASE_URL || 'https://api.openai.com/v1',
      ai_system_prompt: settings.ai_system_prompt || 'Bạn là trợ lý sáng tạo nội dung chuyên nghiệp cho Fanpage Facebook. Giọng văn tự nhiên, lôi cuốn, chuẩn phong cách viral mạng xã hội.',
      post_interval_minutes: Number(settings.post_interval_minutes) || 15,
      default_hashtags: settings.default_hashtags || '#facebook #marketing #viral #contentcreator',
      default_signature: settings.default_signature || '📌 Hãy bấm Theo dõi Fanpage để không bỏ lỡ những bài viết thú vị tiếp theo!',
      auto_retry_count: Number(settings.auto_retry_count) || 2,
      enable_rgb_effects: settings.enable_rgb_effects !== false,
      telegram_bot_token_masked: (settings.telegram_bot_token || process.env.TELEGRAM_BOT_TOKEN || '') ? '••••••••' + (settings.telegram_bot_token || process.env.TELEGRAM_BOT_TOKEN || '').slice(-5) : '',
      telegram_has_token: Boolean(settings.telegram_bot_token || process.env.TELEGRAM_BOT_TOKEN),
      telegram_chat_id: settings.telegram_chat_id || process.env.TELEGRAM_CHAT_ID || '',
      telegram_alert_enabled: settings.telegram_alert_enabled !== false && settings.telegram_alert_enabled !== 'false',
      telegram_alert_on_expired: settings.telegram_alert_on_expired !== false && settings.telegram_alert_on_expired !== 'false',
      telegram_alert_on_failed: settings.telegram_alert_on_failed !== false && settings.telegram_alert_on_failed !== 'false'
    };
    // Tài khoản không có quyền cấu hình hệ thống không được thấy thông tin bí mật (dù đã che bớt)
    if (!canManageSystem) {
      delete publicSettings.ai_api_key_masked;
      delete publicSettings.telegram_bot_token_masked;
      delete publicSettings.telegram_chat_id;
    }

    return res.json({
      success: true,
      canManageSystem,
      settings: publicSettings,
      account: {
        ...req.user.account,
        hasAccessToken: Boolean(userToken),
        connectedPagesCount: pages.length
      },
      system: {
        metaAppId: canManageSystem ? (process.env.FACEBOOK_APP_ID || '') : '',
        nodeVersion: process.version,
        serverTime: new Date().toISOString(),
        database: process.env.USE_SQLITE === 'true' || process.env.DB_TYPE === 'sqlite' ? 'SQLite' : 'SQL Server',
        dbStatus: 'connected',
        queueStatus: 'running'
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Lỗi tải thông tin cài đặt: ' + error.message });
  }
});

app.post('/api/settings', requirePermission(PERMISSIONS.SETTINGS_SYSTEM), async (req, res) => {
  try {
    const payload = req.body || {};
    const updates = {};
    if (payload.ai_provider !== undefined) updates.ai_provider = String(payload.ai_provider).trim();
    if (payload.ai_model !== undefined) updates.ai_model = String(payload.ai_model).trim();
    if (payload.ai_api_key !== undefined && payload.ai_api_key.trim()) {
      updates.ai_api_key = String(payload.ai_api_key).trim();
    }
    if (payload.ai_base_url !== undefined) updates.ai_base_url = String(payload.ai_base_url).trim();
    if (payload.ai_system_prompt !== undefined) updates.ai_system_prompt = String(payload.ai_system_prompt).trim();
    if (payload.post_interval_minutes !== undefined) updates.post_interval_minutes = Math.max(1, parseInt(payload.post_interval_minutes, 10) || 15);
    if (payload.default_hashtags !== undefined) updates.default_hashtags = String(payload.default_hashtags).trim();
    if (payload.default_signature !== undefined) updates.default_signature = String(payload.default_signature).trim();
    if (payload.auto_retry_count !== undefined) updates.auto_retry_count = Math.max(0, Math.min(5, parseInt(payload.auto_retry_count, 10) || 2));
    if (payload.enable_rgb_effects !== undefined) updates.enable_rgb_effects = Boolean(payload.enable_rgb_effects);

    // Telegram Bot Settings (Module 2)
    if (payload.telegram_bot_token !== undefined && payload.telegram_bot_token.trim()) {
      updates.telegram_bot_token = String(payload.telegram_bot_token).trim();
    }
    if (payload.telegram_chat_id !== undefined) updates.telegram_chat_id = String(payload.telegram_chat_id).trim();
    if (payload.telegram_alert_enabled !== undefined) updates.telegram_alert_enabled = Boolean(payload.telegram_alert_enabled);
    if (payload.telegram_alert_on_expired !== undefined) updates.telegram_alert_on_expired = Boolean(payload.telegram_alert_on_expired);
    if (payload.telegram_alert_on_failed !== undefined) updates.telegram_alert_on_failed = Boolean(payload.telegram_alert_on_failed);

    await saveMultipleSettings(updates);
    return res.json({ success: true, message: 'Đã lưu cấu hình thành công!' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Không thể lưu cài đặt: ' + error.message });
  }
});

app.post('/api/settings/telegram/test', requirePermission(PERMISSIONS.SETTINGS_SYSTEM), async (req, res) => {
  try {
    const { botToken, chatId } = req.body || {};
    const result = await telegramAlertService.testConnection(botToken, chatId);
    if (result.success) {
      return res.json({ success: true, message: 'Đã gửi tin nhắn kiểm tra thành công tới Telegram của bạn!' });
    }
    return res.status(400).json({ success: false, message: result.message || 'Không thể gửi tin nhắn kiểm tra Telegram.' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Lỗi gửi tin nhắn Telegram: ' + error.message });
  }
});

app.all('/api/channels/health-check', requirePermission(PERMISSIONS.SETTINGS_SYSTEM), async (req, res) => {
  try {
    const result = await tokenHealthCheckService.runHealthCheck('manual_api');
    return res.json({
      success: result.success !== false,
      summary: result.summary,
      channels: result.summary?.pages || [],
      message: result.message || 'Đã kiểm tra sức khỏe Token hoàn tất.'
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Lỗi kiểm tra sức khỏe Token: ' + error.message });
  }
});

app.post('/api/settings/test-ai', requirePermission(PERMISSIONS.SETTINGS_SYSTEM), async (req, res) => {
  try {
    const settings = await getSettings().catch(() => ({}));
    const apiKey = req.body.apiKey?.trim() || settings.ai_api_key || process.env.AI_API_KEY;
    const model = req.body.model?.trim() || settings.ai_model || process.env.AI_MODEL || 'gpt-4o-mini';
    const baseUrl = (req.body.baseUrl?.trim() || settings.ai_base_url || process.env.AI_API_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');

    if (!apiKey) {
      return res.status(400).json({ success: false, message: 'Chưa có API Key để kiểm tra. Hãy nhập API Key trước khi thử nghiệm.' });
    }

    const testRes = await axios.post(`${baseUrl}/chat/completions`, {
      model,
      messages: [{ role: 'user', content: 'Hãy chào ngắn gọn 1 câu và xác nhận AI đã kết nối thành công với công cụ Auto Post Facebook.' }],
      max_tokens: 60
    }, {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout: 15000
    });

    const reply = testRes.data.choices?.[0]?.message?.content || 'Kết nối thành công!';
    return res.json({ success: true, message: 'Kiểm tra AI thành công!', reply });
  } catch (error) {
    return res.status(502).json({
      success: false,
      message: 'Kiểm tra AI thất bại: ' + (error.response?.data?.error?.message || error.message)
    });
  }
});

app.get('/api/channels', requireAuth, async (req, res) => {
  try {
    const channels = await getConnectedPages(req.user.sub);
    const accounts = await getConnectedFbAccounts(req.user.sub);
    return res.json({ success: true, channels, accounts });
  } catch (error) {
    return sendApiError(res, 'Channels Error', error, 'Không thể tải danh sách Page.');
  }
});

app.post('/api/channels/sync', requireAuth, async (req, res) => {
  try {
    const results = await syncAllConnectedFbAccounts(req.user.sub);
    const channels = await getConnectedPages(req.user.sub);
    const accounts = await getConnectedFbAccounts(req.user.sub);
    return res.json({
      success: true,
      channels,
      accounts,
      results,
      message: 'Đã hoàn tất đồng bộ tất cả Fanpage từ các tài khoản Facebook!'
    });
  } catch (error) {
    return sendApiError(res, 'Channels Sync Error', error, 'Không thể đồng bộ Fanpage.');
  }
});

app.get('/api/channels/accounts', requireAuth, async (req, res) => {
  try {
    const accounts = await getConnectedFbAccounts(req.user.sub);
    return res.json({ success: true, accounts });
  } catch (error) {
    return sendApiError(res, 'Accounts Error', error, 'Không thể tải danh sách tài khoản Facebook.');
  }
});

app.delete('/api/channels/accounts/:fbAccountId', requireAuth, async (req, res) => {
  try {
    await disconnectFbAccount(req.user.sub, req.params.fbAccountId);
    return res.json({ success: true, message: 'Đã xóa tài khoản Facebook và toàn bộ Fanpage trực thuộc.' });
  } catch (error) {
    return sendApiError(res, 'Delete Account Error', error, 'Không thể xóa tài khoản Facebook.');
  }
});

app.get('/api/channels/check-tokens', requireAuth, async (req, res) => {
  try {
    const channels = await getConnectedPages(req.user.sub);
    const graphVersion = process.env.FB_GRAPH_VERSION || 'v19.0';
    const appId = process.env.FACEBOOK_APP_ID;
    const appSecret = process.env.FACEBOOK_APP_SECRET;
    const appToken = appId && appSecret ? `${appId}|${appSecret}` : null;

    const tokenStatusList = await Promise.all(
      channels.map(async (channel) => {
        try {
          const token = await getFacebookPageAccessToken(channel.id);
          // Test quyền truy cập Page
          const pageCheck = await axios.get(`https://graph.facebook.com/${graphVersion}/${channel.id}`, {
            params: { fields: 'id,name', access_token: token },
            timeout: 8000
          });

          let expiresAt = null;
          let isValid = true;
          let details = 'Token hợp lệ và hoạt động bình thường';

          // Nếu có appToken, gọi debug_token để xem chi tiết hạn dùng
          if (appToken) {
            try {
              const debugRes = await axios.get(`https://graph.facebook.com/${graphVersion}/debug_token`, {
                params: { input_token: token, access_token: appToken },
                timeout: 8000
              });
              const debugData = debugRes.data?.data || {};
              isValid = debugData.is_valid !== false;
              if (debugData.expires_at) {
                expiresAt = debugData.expires_at === 0 ? 'Vĩnh viễn (Never)' : new Date(debugData.expires_at * 1000).toLocaleString('vi-VN');
              }
            } catch {}
          }

          return {
            pageId: channel.id,
            name: channel.name,
            status: isValid ? 'active' : 'invalid',
            isValid,
            expiresAt: expiresAt || 'Vĩnh viễn (Page Token)',
            details
          };
        } catch (err) {
          const fbError = err.response?.data?.error;
          const isExpired = fbError?.code === 190 || err.response?.status === 401;
          return {
            pageId: channel.id,
            name: channel.name,
            status: isExpired ? 'expired' : 'error',
            isValid: false,
            expiresAt: 'Đã hết hạn',
            details: fbError?.message || err.message || 'Không thể xác thực quyền quản trị Page'
          };
        }
      })
    );

    return res.json({ success: true, channels: tokenStatusList });
  } catch (error) {
    return sendApiError(res, 'Check Tokens Error', error, 'Không thể kiểm tra hạn token.');
  }
});

app.post('/api/channels/manual', requireAuth, async (req, res) => {
  const pageId = String(req.body.pageId || '').trim();
  const pageToken = String(req.body.pageToken || '').trim();
  if (!pageId || !pageToken) {
    return res.status(400).json({ success: false, message: 'Vui lòng nhập Page ID và Page Access Token.' });
  }
  try {
    const channel = await saveManualFacebookPage(req.user.sub, pageId, pageToken);
    return res.status(201).json({ success: true, message: `Đã kết nối Fanpage: ${channel.name}`, channel });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: 'Không thể kết nối Page. Kiểm tra lại Page ID hoặc Page Access Token.',
      detail: error.response?.data?.error?.message || error.message
    });
  }
});

app.post('/api/channels/connect-facebook', requireAuth, async (req, res) => {
  const token = typeof req.body.token === 'string' ? req.body.token.trim() : '';
  if (!token) {
    return res.status(400).json({ success: false, message: 'Vui lòng cung cấp Facebook Access Token.' });
  }

  try {
    const graphVersion = process.env.FB_GRAPH_VERSION || 'v19.0';
    // 1. Kiểm tra Token và lấy thông tin tài khoản Facebook
    const profileResponse = await axios.get(`https://graph.facebook.com/${graphVersion}/me`, {
      params: { fields: 'id,name,picture.width(150).height(150)', access_token: token },
      timeout: 15000
    });

    const fbData = profileResponse.data;
    if (!fbData || !fbData.id) {
      return res.status(400).json({ success: false, message: 'Facebook Access Token không hợp lệ.' });
    }

    const fbAccountInfo = {
      id: fbData.id,
      name: fbData.name,
      avatar: fbData.picture?.data?.url || null
    };

    // 2. Lưu User Facebook Token gắn với tài khoản của user hiện tại
    await saveFacebookUser({
      id: req.user.sub,
      name: fbData.name,
      picture: fbData.picture
    }, token, 60 * 24 * 60 * 60);

    // 3. Đồng bộ tất cả các Fanpage thuộc quyền quản lý của Token này vào tài khoản của user (req.user.sub)
    let connectedPages = [];
    try {
      connectedPages = await syncFacebookPages(req.user.sub, token, fbAccountInfo);
      console.log(`[Connect Facebook] Đã kết nối ${connectedPages.length} Fanpage cho tài khoản ${req.user.name} (FB: ${fbData.name})`);
    } catch (pageErr) {
      console.warn('[Connect Facebook Sync Warning]', pageErr.message);
    }

    // Nếu là Page token đơn lẻ
    if (connectedPages.length === 0) {
      try {
        const pageCheck = await axios.get(`https://graph.facebook.com/${graphVersion}/${fbData.id}`, {
          params: { fields: 'id,name,category', access_token: token },
          timeout: 10000
        });
        if (pageCheck.data?.category) {
          const manualPage = await saveManualFacebookPage(req.user.sub, fbData.id, token);
          connectedPages.push(manualPage);
        }
      } catch {}
    }

    return res.json({
      success: true,
      fbUser: fbAccountInfo,
      count: connectedPages.length,
      pages: connectedPages,
      message: `Kết nối thành công tài khoản Facebook "${fbData.name}"! Đã đồng bộ ${connectedPages.length} Fanpage.`
    });
  } catch (error) {
    const errMsg = error.response?.data?.error?.message || error.message || 'Không thể xác thực Facebook Token.';
    return res.status(400).json({ success: false, message: errMsg });
  }
});

app.delete('/api/channels/:pageId', requireAuth, async (req, res) => {
  try {
    await disconnectFacebookPage(req.user.sub, req.params.pageId);
    return res.json({ success: true, message: 'Đã hủy kết nối Fanpage.' });
  } catch (error) {
    return sendApiError(res, 'Disconnect Error', error, 'Không thể hủy kết nối Page.');
  }
});

// ═══ CHANNEL GROUPS (GOM NHÓM FANPAGE) ═══
app.get('/api/channel-groups', requireAuth, async (req, res) => {
  try {
    const groups = await channelGroupService.getGroups(req.user.sub);
    return res.json({ success: true, groups });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Lỗi tải danh sách nhóm kênh: ' + error.message });
  }
});

app.post('/api/channel-groups', requireAuth, async (req, res) => {
  try {
    const { name, color, pageIds } = req.body || {};
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Tên nhóm kênh không được để trống.' });
    }
    const group = await channelGroupService.createGroup(req.user.sub, { name, color, pageIds });
    return res.status(201).json({ success: true, message: 'Đã tạo nhóm kênh thành công!', group });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Lỗi tạo nhóm kênh: ' + error.message });
  }
});

app.put('/api/channel-groups/:id', requireAuth, async (req, res) => {
  try {
    const { name, color, pageIds } = req.body || {};
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Tên nhóm kênh không được để trống.' });
    }
    const group = await channelGroupService.updateGroup(req.user.sub, req.params.id, { name, color, pageIds });
    if (!group) return res.status(404).json({ success: false, message: 'Không tìm thấy nhóm kênh.' });
    return res.json({ success: true, message: 'Đã cập nhật nhóm kênh!', group });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Lỗi cập nhật nhóm kênh: ' + error.message });
  }
});

app.delete('/api/channel-groups/:id', requireAuth, async (req, res) => {
  try {
    const ok = await channelGroupService.deleteGroup(req.user.sub, req.params.id);
    if (!ok) return res.status(404).json({ success: false, message: 'Không tìm thấy nhóm kênh để xóa.' });
    return res.json({ success: true, message: 'Đã xóa nhóm kênh thành công!' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Lỗi xóa nhóm kênh: ' + error.message });
  }
});

app.get('/api/posts/template', (_req, res) => {
  const headers = ['STT', 'Fanpage Channel (Tên | Page ID)', 'Content', 'Schedule', 'Loại Media', 'Media Link', 'Media Thumb'];
  for (let index = 1; index <= 5; index++) headers.push(`Seeding Comment ${index}`, `Schedule Comment ${index}`, `Media Comment ${index}`);

  const sampleRow1 = [
    1,
    'Fanpage của bạn | 1383891371465269',
    'Chào ngày mới tràn đầy năng lượng! Chúc cả nhà một ngày làm việc hiệu quả và nhiều may mắn 🌟 #morning #kinhdoanh',
    'Đăng ngay',
    'text',
    '',
    '',
    'Cảm ơn mọi người đã theo dõi page! Hãy để lại bình luận bên dưới nhé 👇',
    'now',
    ''
  ];
  const sampleRow2 = [
    2,
    'Fanpage của bạn | 1383891371465269',
    'Chia sẻ bí quyết tăng tương tác Fanpage tự nhiên cực kỳ hiệu quả mà không cần tốn nhiều chi phí quảng cáo.',
    '05/10/2026_09:00',
    'image',
    'https://images.unsplash.com/photo-1460925895917-afdab827c52f',
    '',
    'Nhắn tin cho Page để nhận trọn bộ tài liệu hướng dẫn miễn phí nhé!',
    '5',
    ''
  ];

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet([
    ['MẪU UPLOAD BÀI ĐĂNG TỰ ĐỘNG - TOOL_FACE'],
    ['Schedule: "Đăng ngay", "DD/MM/YYYY_HH:mm" (ví dụ: 05/10/2026_09:00). Cột Fanpage có thể điền Tên | ID hoặc chỉ ID số.'],
    headers,
    sampleRow1,
    sampleRow2
  ]);
  worksheet['!cols'] = headers.map((header) => ({ wch: Math.max(16, Math.min(38, header.length + 3)) }));
  XLSX.utils.book_append_sheet(workbook, worksheet, 'MAIN SHEET');
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="Mau_Upload_Bai_Dang_ToolFB.xlsx"');
  return res.send(buffer);
});

app.post('/api/posts', requireAuth, async (req, res) => {
  console.log('[POST /api/posts] Nhận request từ user:', req.user?.sub);
  const content = typeof req.body.content === 'string' ? req.body.content.trim() : '';
  const rawPageIds = Array.isArray(req.body.pageIds) && req.body.pageIds.length > 0
    ? req.body.pageIds
    : [req.body.pageId || process.env.FACEBOOK_PAGE_ID || ''];
  const targetPageIds = [...new Set(rawPageIds.map((id) => String(id || '').trim()))].filter((id) => /^\d+$/.test(id));

  const mediaType = String(req.body.mediaType || 'text').toLowerCase();
  const mediaLinks = Array.isArray(req.body.mediaLinks) ? req.body.mediaLinks : [];
  const scheduledAt = new Date(req.body.scheduledAt || Date.now());

  if (!content) return res.status(400).json({ success: false, message: 'Nội dung bài đăng không được để trống.' });
  if (targetPageIds.length === 0) return res.status(400).json({ success: false, message: 'Vui lòng chọn ít nhất một Fanpage hợp lệ.' });
  if (!['text', 'image', 'video', 'reel', 'story'].includes(mediaType)) return res.status(400).json({ success: false, message: 'Loại bài đăng phải là text, image, video, reel hoặc story.' });
  if (mediaType === 'reel' && mediaLinks.length === 0) return res.status(400).json({ success: false, message: 'Bài đăng Reels bắt buộc phải đính kèm video.' });
  if (mediaType !== 'text' && (mediaLinks.length === 0 || mediaLinks.some((link) => {
    if (localMediaFilename(link)) return false;
    try { return new URL(link).protocol !== 'https:'; } catch { return true; }
  }))) return res.status(400).json({ success: false, message: 'Media cần URL HTTPS công khai hoặc media đã tải lên.' });
  if (Number.isNaN(scheduledAt.getTime())) return res.status(400).json({ success: false, message: 'Thời gian đăng không hợp lệ.' });

  const comments = Array.isArray(req.body.comments) ? req.body.comments.slice(0, 5) : [];
  try {
    console.log('[POST /api/posts] Bước 1: ensurePostOwnershipSchema...');
    await ensurePostOwnershipSchema();

    console.log('[POST /api/posts] Bước 2: kiểm tra quyền sở hữu page...');
    const authorizedPageIds = [];
    for (const pageId of targetPageIds) {
      if (await userOwnsPage(req.user.sub, pageId)) {
        authorizedPageIds.push(pageId);
      }
    }
    if (authorizedPageIds.length === 0) {
      return res.status(403).json({ success: false, message: 'Các Fanpage đã chọn chưa được kết nối với tài khoản Facebook của bạn.' });
    }

    console.log('[POST /api/posts] Bước 3: INSERT vào DB cho', authorizedPageIds.length, 'page...');
    const pool = await getPool();
    const createdPosts = [];

    for (const pageId of authorizedPageIds) {
      const transaction = new sql.Transaction(pool);
      await transaction.begin();
      let postId;
      try {
        const result = await new sql.Request(transaction)
          .input('pageId', sql.VarChar, pageId)
          .input('ownerId', sql.VarChar(64), req.user.sub)
          .input('content', sql.NVarChar, content)
          .input('mediaType', sql.VarChar, mediaType)
          .input('mediaLinks', sql.NVarChar, JSON.stringify(mediaLinks))
          .input('scheduledAt', sql.DateTime2, scheduledAt)
          .input('status', sql.VarChar, 'pending')
          .query('INSERT INTO Posts (page_id, content, media_type, media_links, scheduled_at, status, created_by_user_id) OUTPUT INSERTED.id VALUES (@pageId, @content, @mediaType, @mediaLinks, @scheduledAt, @status, @ownerId);');
        postId = result.recordset[0].id;
        for (const [index, comment] of comments.entries()) {
          if (typeof comment.content !== 'string' || !comment.content.trim()) continue;
          await new sql.Request(transaction)
            .input('postId', sql.Int, postId)
            .input('commentIndex', sql.Int, index + 1)
            .input('content', sql.NVarChar, comment.content.trim())
            .input('delayMinutes', sql.Int, Math.max(0, Number.parseInt(comment.delayMinutes, 10) || 0))
            .input('mediaUrl', sql.VarChar, comment.mediaUrl || null)
            .query("INSERT INTO PostComments (post_id, comment_index, content, delay_minutes, media_url, status) VALUES (@postId, @commentIndex, @content, @delayMinutes, @mediaUrl, 'pending');");
        }
        await transaction.commit();
        createdPosts.push({ postId, pageId });
        console.log(`[POST /api/posts] Đã INSERT bài ${postId} cho page ${pageId}`);
      } catch (insertError) {
        await transaction.rollback();
        console.error(`[Create Post Error for page ${pageId}]`, insertError.message);
      }
    }

    if (createdPosts.length === 0) {
      return res.status(500).json({ success: false, message: 'Không thể tạo bản ghi bài viết cho các Page đã chọn.' });
    }

    const createdPostIds = createdPosts.map((p) => p.postId);
    const isFbScheduledCandidate = canScheduleOnFacebook({ mediaType, scheduledAt });

    // Bước 4: Lên lịch trực tiếp trên Facebook (nếu đủ điều kiện) và đưa vào BullMQ Queue
    console.log('[POST /api/posts] Bước 4: xử lý lên lịch đăng bài...');
    for (const { postId, pageId } of createdPosts) {
      if (isFbScheduledCandidate) {
        try {
          console.log(`[POST /api/posts] Hẹn giờ bài ${postId} trực tiếp qua Facebook Cloud API cho page ${pageId}...`);
          const fbPostId = await schedulePostOnFacebook({
            pageId,
            content,
            mediaType,
            mediaLinks,
            scheduledAt
          });
          await pool.request()
            .input('id', sql.Int, postId)
            .input('fbId', sql.NVarChar, fbPostId)
            .query("UPDATE Posts SET facebook_post_id = @fbId, status = 'scheduled' WHERE id = @id");
          console.log(`[POST /api/posts] Đã hẹn giờ trực tiếp lên Facebook thành công! ID: ${fbPostId}`);
        } catch (fbErr) {
          console.warn(`[POST /api/posts] Hẹn giờ Facebook Cloud thất bại cho bài ${postId}, dùng BullMQ fallback:`, fbErr.response?.data?.error?.message || fbErr.message);
        }
      }

      try {
        await standaloneScheduler.schedulePost(postId, scheduledAt);
        console.log(`[POST /api/posts] Đã lên lịch bài ${postId}`);
      } catch (queueError) {
        console.error(`[Post Schedule Error postId ${postId}]`, queueError.message);
      }
    }

    const isNow = !isFbScheduledCandidate && Math.abs(scheduledAt.getTime() - Date.now()) < 5 * 60 * 1000;
    const message = isNow
      ? `⚡ Đã gửi yêu cầu đăng ngay lập tức cho ${createdPostIds.length} Fanpage!`
      : (createdPostIds.length === 1
          ? (isFbScheduledCandidate ? 'Đã lên lịch đăng trực tiếp trên Facebook (tự động đăng đúng giờ kể cả khi tắt máy).' : 'Đã lưu bài và đưa vào lịch đăng.')
          : `Đã lưu và lên lịch bài đăng đồng thời cho ${createdPostIds.length} Fanpage.`);

    console.log('[POST /api/posts] Thành công! postIds:', createdPostIds);
    return res.status(202).json({
      success: true,
      postId: createdPostIds[0],
      postIds: createdPostIds,
      count: createdPostIds.length,
      status: 'pending',
      scheduledAt,
      message
    });
  } catch (error) {
    console.error('[Create Post Error]', error.message, error.stack);
    return res.status(500).json({ success: false, message: 'Không thể tạo lịch đăng bài.' });
  }
});

app.get('/api/posts', requireAuth, async (req, res) => {
  try {
    await ensurePostOwnershipSchema();
    const pool = await getPool();
    // Tự động đồng bộ trạng thái 'published' cho các bài đã lên lịch trực tiếp trên Facebook khi đã qua thời gian đăng
    await pool.request().query("UPDATE Posts SET status = 'published', published_at = COALESCE(published_at, scheduled_at, SYSUTCDATETIME()), updated_at = SYSUTCDATETIME() WHERE status IN ('pending', 'scheduled') AND facebook_post_id IS NOT NULL AND scheduled_at <= SYSUTCDATETIME();").catch(() => {});

    const pageValue = Number.parseInt(req.query.page, 10);
    const limitValue = Number.parseInt(req.query.limit, 10);
    const page = Number.isInteger(pageValue) && pageValue > 0 ? pageValue : 1;
    const limit = Number.isInteger(limitValue) && limitValue > 0 ? Math.min(limitValue, 100) : 10;
    const status = String(req.query.status || 'all');
    const pageId = String(req.query.pageId || 'all');
    const filters = [];
    const countRequest = pool.request();
    const postsRequest = pool.request();
    if (status !== 'all') {
      filters.push('status = @status');
      countRequest.input('status', sql.VarChar, status);
      postsRequest.input('status', sql.VarChar, status);
    }
    if (pageId !== 'all') {
      filters.push('page_id = @pageId');
      countRequest.input('pageId', sql.VarChar, pageId);
      postsRequest.input('pageId', sql.VarChar, pageId);
    }
    filters.push(applyPostScope(req, countRequest));
    applyPostScope(req, postsRequest);
    const whereClause = `WHERE ${filters.join(' AND ')}`;
    const count = await countRequest.query(`SELECT COUNT(*) AS total FROM Posts ${whereClause}`);
    const result = await postsRequest.input('offset', sql.Int, (page - 1) * limit).input('limit', sql.Int, limit).query(`SELECT * FROM Posts ${whereClause} ORDER BY id DESC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;`);

    // Quản lý / Admin xem bài của cả đội nên cần biết người tạo từng bài
    let posts = result.recordset || [];
    let authors = null;
    if (hasPermission(req.user.role, PERMISSIONS.POSTS_TEAM)) {
      authors = await getUserDisplayMap(posts.map((post) => post.created_by_user_id));
    }
    posts = posts.map((post) => {
      let primaryMediaLink = null;
      if (post.media_links) {
        try {
          const parsed = JSON.parse(post.media_links);
          primaryMediaLink = Array.isArray(parsed) ? parsed[0] : parsed;
        } catch {
          primaryMediaLink = typeof post.media_links === 'string' ? post.media_links.split(',')[0].trim() : null;
        }
      }
      const author = authors ? authors.get(String(post.created_by_user_id)) : null;
      return {
        ...post,
        media_link: post.media_link || post.media_thumb || primaryMediaLink || null,
        author_name: author?.name || null,
        author_username: author?.username || null,
        author_role_label: author?.roleLabel || null,
        is_own: String(post.created_by_user_id) === String(req.user.sub)
      };
    });
    return res.json({ success: true, posts, total: count.recordset[0].total, page, limit });
  } catch (error) {
    console.error('[Posts List Error]', error.message);
    return res.status(500).json({ success: false, message: 'Không thể tải danh sách bài đăng.' });
  }
});

app.get('/api/posts/stats', requireAuth, async (req, res) => {
  try {
    await ensurePostOwnershipSchema();
    const pool = await getPool();
    // Tự động đồng bộ trạng thái 'published' cho các bài đã lên lịch trực tiếp trên Facebook
    await pool.request().query("UPDATE Posts SET status = 'published', published_at = COALESCE(published_at, scheduled_at, SYSUTCDATETIME()), updated_at = SYSUTCDATETIME() WHERE status IN ('pending', 'scheduled') AND facebook_post_id IS NOT NULL AND scheduled_at <= SYSUTCDATETIME();").catch(() => {});

    const request = pool.request();
    const where = `WHERE ${applyPostScope(req, request)}`;
    const result = await request.query(`SELECT COUNT(*) AS total, SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) AS pending, SUM(CASE WHEN status='published' THEN 1 ELSE 0 END) AS published, SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed FROM Posts ${where};`);
    const stats = result.recordset[0];
    return res.json({ success: true, stats: { total: Number(stats.total || 0), pending: Number(stats.pending || 0), published: Number(stats.published || 0), failed: Number(stats.failed || 0) } });
  } catch (error) {
    console.error('[Posts Stats Error]', error.message);
    return res.status(500).json({ success: false, message: 'Không thể tải thống kê bài đăng.' });
  }
});

app.get('/api/reports/insights', requireAuth, async (req, res) => {
  let requestedPageId = req.query.pageId ? String(req.query.pageId) : '';
  let pages = [];
  try {
    pages = await getConnectedPages(req.user.sub);
    if (!pages || pages.length === 0) {
      return res.json({
        success: true,
        available: false,
        days: 14,
        pages: [],
        summary: { totalViews: 0, totalEngagements: 0, totalReactions: 0, totalComments: 0, totalShares: 0, totalPosts: 0, avgEngagementPerPost: 0 },
        chartData: [],
        metrics: [],
        topPosts: [],
        message: 'Tài khoản chưa có Fanpage nào được kết nối.'
      });
    }
  } catch (error) {
    return sendApiError(res, 'Insights Page Lookup Error', error, 'Không thể tải danh sách Fanpage.');
  }

  const daysValue = Number.parseInt(req.query.days, 10);
  const days = [7, 14, 30].includes(daysValue) ? daysValue : 14;
  const until = new Date();
  const since = new Date(until.getTime() - days * 86400000);

  // Chọn danh sách Page cần tổng hợp: 1 page cụ thể hoặc tất cả page
  let targetPages = [];
  if (requestedPageId && requestedPageId !== 'all') {
    const found = pages.find((p) => String(p.id) === requestedPageId);
    if (!found) return res.status(403).json({ success: false, message: 'Không có quyền truy cập Fanpage này.' });
    targetPages = [found];
  } else if (requestedPageId === 'all') {
    targetPages = pages;
  } else {
    targetPages = [pages[0]];
  }

  // Khởi tạo timeline map theo từng ngày trong khoảng [since, until]
  const dailyMap = {};
  for (let d = new Date(since); d <= until; d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    const dayLabel = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
    dailyMap[key] = {
      date: dayLabel,
      fullDate: key,
      endTime: d.toISOString(),
      views: 0,
      engagements: 0,
      reactions: 0,
      comments: 0,
      shares: 0,
      postsCount: 0
    };
  }

  let totalReactions = 0;
  let totalComments = 0;
  let totalShares = 0;
  let totalEngagements = 0;
  let totalViews = 0;
  let totalPosts = 0;
  const allPostsList = [];
  const expiredPagesList = [];

  const version = process.env.FB_GRAPH_VERSION || 'v19.0';
  const pool = await getPool();

  for (const p of targetPages) {
    let fbPosts = [];
    let pageToken = '';
    try {
      pageToken = await getFacebookPageAccessToken(p.id);

      // 1. Thử lấy Lượt hiển thị bài viết Page-level thực tế (page_media_view) từ Facebook
      try {
        const pageInsResult = await axios.get(`https://graph.facebook.com/${version}/${p.id}/insights`, {
          params: {
            metric: 'page_media_view',
            period: 'day',
            since: Math.floor(since.getTime() / 1000),
            until: Math.floor(until.getTime() / 1000),
            access_token: pageToken
          },
          timeout: 2500
        });
        const pData = pageInsResult.data?.data || [];
        const impMetric = pData.find(m => m.name === 'page_media_view');
        if (impMetric && Array.isArray(impMetric.values)) {
          for (const v of impMetric.values) {
            const dateKey = (v.end_time || '').slice(0, 10);
            const valNum = Number(v.value) || 0;
            if (dailyMap[dateKey]) {
              dailyMap[dateKey].views += valNum;
            }
            totalViews += valNum;
          }
        }
      } catch (_) {
        // Page level insights có thể không khả dụng nếu Page dưới 100 followers
      }

      // 2. Lấy danh sách bài viết thực tế cùng reactions, comments, shares từ Facebook
      const fbResult = await axios.get(`https://graph.facebook.com/${version}/${p.id}/posts`, {
        params: {
          fields: 'id,message,created_time,shares,permalink_url,full_picture,reactions.summary(true),comments.summary(true)',
          since: Math.floor(since.getTime() / 1000),
          until: Math.floor(until.getTime() / 1000),
          limit: 30,
          access_token: pageToken
        },
        timeout: 4000
      });
      if (Array.isArray(fbResult.data?.data)) {
        fbPosts = fbResult.data.data;
      }
    } catch (fbErr) {
      const fbErrorObj = fbErr.response?.data?.error;
      const errCode = fbErrorObj?.code;
      const errMsg = fbErrorObj?.message || fbErr.message;
      if (errCode === 190) {
        expiredPagesList.push(p.name);
        try {
          await pool.request()
            .input('pageId', sql.VarChar(64), String(p.id))
            .query('UPDATE dbo.FacebookPages SET is_valid = 0 WHERE page_id = @pageId');
        } catch (_) {}
      }
      console.warn(`[Insights Warning] Lỗi đọc Facebook cho Page ${p.id}:`, errMsg);
    }

    // 3. Lấy thêm bài viết đã đăng lưu trong local database
    let dbPosts = [];
    try {
      const dbRes = await pool.request()
        .input('pageId', sql.VarChar(64), String(p.id))
        .input('sinceDate', sql.DateTime2, since)
        .query(`SELECT id, page_id, content, media_links, media_thumb, media_type, created_at, updated_at, facebook_post_id FROM Posts WHERE page_id = @pageId AND status = 'published' AND (created_at >= @sinceDate OR updated_at >= @sinceDate)`);
      dbPosts = dbRes.recordset || [];
    } catch (dbErr) {
      console.warn('[Insights DB lookup]', dbErr.message);
    }

    // Gộp và chuẩn hóa bài viết
    const processedPostIds = new Set();

    // Duyệt nhanh từng bài viết từ Facebook trong bộ nhớ (siêu tốc, không làm nghẽn mạng)
    for (const item of fbPosts) {
      processedPostIds.add(item.id);
      const reactions = Number(item.reactions?.summary?.total_count) || 0;
      const comments = Number(item.comments?.summary?.total_count) || 0;
      const shares = Number(item.shares?.count) || 0;
      const engagements = reactions + comments + shares;

      const postTime = new Date(item.created_time);
      const dateKey = postTime.toISOString().slice(0, 10);

      totalReactions += reactions;
      totalComments += comments;
      totalShares += shares;
      totalEngagements += engagements;
      totalPosts += 1;

      if (dailyMap[dateKey]) {
        dailyMap[dateKey].reactions += reactions;
        dailyMap[dateKey].comments += comments;
        dailyMap[dateKey].shares += shares;
        dailyMap[dateKey].engagements += engagements;
        dailyMap[dateKey].postsCount += 1;
      }

      allPostsList.push({
        id: item.id,
        pageId: p.id,
        pageName: p.name,
        message: item.message || 'Bài đăng không có văn bản',
        created_time: item.created_time,
        permalink_url: item.permalink_url || `https://facebook.com/${item.id}`,
        full_picture: item.full_picture || null,
        reactions,
        comments,
        shares,
        engagements,
        views: 0
      });
    }

    // Duyệt các bài từ DB chưa có trong fbPosts
    for (const post of dbPosts) {
      if (post.facebook_post_id && processedPostIds.has(post.facebook_post_id)) continue;
      totalPosts += 1;
      const postTime = new Date(post.created_at || post.updated_at || since);
      const dateKey = postTime.toISOString().slice(0, 10);

      if (dailyMap[dateKey]) {
        dailyMap[dateKey].postsCount += 1;
      }

      let picture = post.media_thumb || null;
      if (!picture && post.media_links) {
        try {
          const links = JSON.parse(post.media_links);
          if (Array.isArray(links) && links.length > 0) picture = links[0];
        } catch (_) {}
      }

      allPostsList.push({
        id: post.facebook_post_id || `local-${post.id}`,
        pageId: p.id,
        pageName: p.name,
        message: post.content || 'Bài đăng tự động',
        created_time: postTime.toISOString(),
        permalink_url: post.facebook_post_id ? `https://facebook.com/${post.facebook_post_id}` : null,
        full_picture: picture,
        reactions: 0,
        comments: 0,
        shares: 0,
        engagements: 0,
        views: 0
      });
    }
  }

  // Sắp xếp top bài viết tương tác cao nhất
  allPostsList.sort((a, b) => b.engagements - a.engagements || b.views - a.views);

  // Lấy lượt xem thật cho Top 5 bài viết chạy song song (Promise.allSettled) với timeout ngắn (1.2s)
  const topFive = allPostsList.slice(0, 5);
  await Promise.allSettled(
    topFive.map(async (post) => {
      try {
        const token = await getFacebookPageAccessToken(post.pageId).catch(() => null);
        if (!token) return;
        const insRes = await axios.get(`https://graph.facebook.com/${version}/${post.id}/insights`, {
          params: { metric: 'post_media_view', access_token: token },
          timeout: 1200
        });
        const mData = insRes.data?.data || [];
        const m = mData.find((x) => x.name === 'post_media_view');
        if (m && Array.isArray(m.values) && m.values.length > 0) {
          post.views = Number(m.values[0].value) || 0;
        }
      } catch (_) {}
    })
  );

  // Cập nhật lại totalViews nếu có từ posts
  if (totalViews === 0) {
    totalViews = allPostsList.reduce((sum, item) => sum + (item.views || 0), 0);
  }
  const topPosts = allPostsList.slice(0, 10);

  const chartData = Object.values(dailyMap);
  const avgEngagementPerPost = totalPosts > 0 ? Math.round((totalEngagements / totalPosts) * 10) / 10 : 0;

  const metrics = [
    {
      name: 'page_post_engagements',
      period: 'day',
      values: chartData.map((d) => ({ endTime: d.endTime, value: d.engagements }))
    },
    {
      name: 'post_views',
      period: 'day',
      values: chartData.map((d) => ({ endTime: d.endTime, value: d.views }))
    }
  ];

  return res.json({
    success: true,
    available: true,
    days,
    selectedPageId: requestedPageId || (targetPages[0]?.id || 'all'),
    pages: pages.map((p) => ({ id: p.id, name: p.name })),
    tokenExpired: expiredPagesList.length > 0,
    expiredPages: expiredPagesList,
    tokenErrorMessage: expiredPagesList.length > 0
      ? `Token của Fanpage (${expiredPagesList.join(', ')}) đã hết hạn từ Facebook. Vui lòng vào "Quản lý kênh" để cập nhật Token mới để Facebook đồng bộ số liệu chuẩn nhất.`
      : null,
    summary: {
      totalViews,
      totalEngagements,
      totalReactions,
      totalComments,
      totalShares,
      totalPosts,
      avgEngagementPerPost
    },
    chartData,
    metrics,
    topPosts,
    message: null
  });
});

// ═══ CHI TIẾT BÀI ĐĂNG (KÈM SEEDING COMMENTS) ═══
app.get('/api/posts/:postId', requireAuth, async (req, res) => {
  const postId = Number.parseInt(req.params.postId, 10);
  if (!Number.isSafeInteger(postId) || postId <= 0) return res.status(400).json({ success: false, message: 'ID bài đăng không hợp lệ.' });
  try {
    await ensurePostOwnershipSchema();
    const pool = await getPool();
    const postRequest = pool.request().input('id', sql.Int, postId);
    const postResult = await postRequest.query(`SELECT * FROM Posts WHERE id = @id AND ${applyPostScope(req, postRequest)}`);
    const post = postResult.recordset[0];
    if (!post) return res.status(404).json({ success: false, message: 'Không tìm thấy bài đăng hoặc bạn không có quyền xem.' });

    const commentsResult = await pool.request()
      .input('postId', sql.Int, postId)
      .query('SELECT * FROM PostComments WHERE post_id = @postId ORDER BY comment_index ASC');

    let primaryMediaLink = null;
    if (post.media_links) {
      try {
        const parsed = JSON.parse(post.media_links);
        primaryMediaLink = Array.isArray(parsed) ? parsed[0] : parsed;
      } catch {
        primaryMediaLink = typeof post.media_links === 'string' ? post.media_links.split(',')[0].trim() : null;
      }
    }

    return res.json({
      success: true,
      post: {
        ...post,
        media_link: post.media_link || post.media_thumb || primaryMediaLink || null,
        comments: commentsResult.recordset
      }
    });
  } catch (error) {
    console.error('[Get Post Detail Error]', error.message);
    return res.status(500).json({ success: false, message: 'Không thể tải chi tiết bài đăng.' });
  }
});

// ═══ HỦY LỊCH BÀI ĐĂNG (CANCEL SCHEDULED POST) ═══
app.put('/api/posts/:postId/cancel', requireAuth, async (req, res) => {
  const postId = Number.parseInt(req.params.postId, 10);
  if (!Number.isSafeInteger(postId) || postId <= 0) return res.status(400).json({ success: false, message: 'ID bài đăng không hợp lệ.' });
  try {
    await ensurePostOwnershipSchema();
    const pool = await getPool();
    const request = pool.request().input('id', sql.Int, postId);
    const check = await request.query(`SELECT id, page_id, status, facebook_post_id FROM Posts WHERE id = @id AND ${applyPostScope(req, request)}`);
    const post = check.recordset[0];
    if (!post) return res.status(404).json({ success: false, message: 'Không tìm thấy bài đăng hoặc không có quyền.' });
    if (post.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Chỉ có thể hủy lịch các bài đang ở trạng thái Chờ đăng (pending).' });
    }

    if (post.facebook_post_id) {
      await cancelFacebookScheduledPost({ pageId: post.page_id, facebookPostId: post.facebook_post_id });
    }

    await pool.request().input('id', sql.Int, postId).query("UPDATE Posts SET status = 'cancelled' WHERE id = @id");
    await removePostFromQueue(postId).catch(() => {});

    return res.json({ success: true, message: 'Đã hủy lịch đăng bài thành công.' });
  } catch (error) {
    console.error('[Cancel Post Error]', error.message);
    return res.status(500).json({ success: false, message: 'Không thể hủy lịch bài đăng: ' + error.message });
  }
});

// ═══ THỐNG KÊ TƯƠNG TÁC THỜI GIAN THỰC TỪ FACEBOOK GRAPH API (ANALYTICS) ═══
app.get('/api/posts/:postId/analytics', requireAuth, async (req, res) => {
  const postId = Number.parseInt(req.params.postId, 10);
  if (!Number.isSafeInteger(postId) || postId <= 0) return res.status(400).json({ success: false, message: 'ID bài đăng không hợp lệ.' });
  try {
    await ensurePostOwnershipSchema();
    const pool = await getPool();
    const request = pool.request().input('id', sql.Int, postId);
    const result = await request.query(`SELECT id, page_id, status, facebook_post_id FROM Posts WHERE id = @id AND ${applyPostScope(req, request)}`);
    const post = result.recordset[0];
    if (!post) return res.status(404).json({ success: false, message: 'Không tìm thấy bài đăng hoặc bạn không có quyền xem.' });
    if (!post.facebook_post_id) {
      return res.status(400).json({ success: false, message: 'Bài viết này chưa được xuất bản lên Facebook nên chưa có số liệu tương tác.' });
    }

    const token = await getFacebookPageAccessToken(post.page_id);
    const graphVersion = process.env.FB_GRAPH_VERSION || 'v19.0';
    let analytics = {
      likes: 0,
      comments: 0,
      shares: 0,
      views: 0,
      fbPostId: post.facebook_post_id
    };

    try {
      // 1. Thử lấy dạng Feed Post thông thường
      const fbRes = await axios.get(`https://graph.facebook.com/${graphVersion}/${post.facebook_post_id}`, {
        params: {
          fields: 'shares,reactions.summary(total_count),comments.summary(total_count)',
          access_token: token
        },
        timeout: 10000
      });

      const data = fbRes.data || {};
      analytics.likes = data.reactions?.summary?.total_count ?? 0;
      analytics.comments = data.comments?.summary?.total_count ?? 0;
      analytics.shares = data.shares?.count ?? 0;
    } catch (feedErr) {
      // 2. Nếu là Video Object (Facebook trả về lỗi nonexisting field shares hoặc reactions)
      try {
        const videoRes = await axios.get(`https://graph.facebook.com/${graphVersion}/${post.facebook_post_id}`, {
          params: {
            fields: 'id,likes.summary(true),comments.summary(true),views',
            access_token: token
          },
          timeout: 10000
        });
        const vData = videoRes.data || {};
        analytics.likes = vData.likes?.summary?.total_count ?? 0;
        analytics.comments = vData.comments?.summary?.total_count ?? 0;
        analytics.views = vData.views ?? 0;
        analytics.shares = 0;
      } catch (videoErr) {
        const errMsg = videoErr.response?.data?.error?.message || feedErr.response?.data?.error?.message || feedErr.message;
        console.warn('[Post Analytics Warning]', errMsg);
        return res.status(502).json({ success: false, message: errMsg });
      }
    }

    return res.json({ success: true, analytics });
  } catch (error) {
    const errMsg = error.response?.data?.error?.message || error.message || 'Không thể lấy dữ liệu tương tác từ Facebook.';
    console.warn('[Post Analytics Warning]', errMsg);
    return res.status(502).json({ success: false, message: errMsg });
  }
});

app.get('/api/posts/:postId/publish-now', (_req, res) => res.status(405).json({ success: false, message: 'Dùng POST để đưa bài vào hàng đợi.' }));
app.post('/api/posts/:postId/publish-now', requireAuth, async (req, res) => {
  const postId = Number.parseInt(req.params.postId, 10);
  if (!Number.isSafeInteger(postId) || postId <= 0) return res.status(400).json({ success: false, message: 'ID bài đăng không hợp lệ.' });
  try {
    await ensurePostOwnershipSchema();
    const pool = await getPool();

    // Kiểm tra quyền trước khi đụng tới lịch hẹn trên Facebook
    const checkRequest = pool.request().input('id', sql.Int, postId);
    const check = await checkRequest.query(`SELECT id, page_id, facebook_post_id FROM Posts WHERE id = @id AND ${applyPostScope(req, checkRequest)}`);
    const existingPost = check.recordset[0];
    if (!existingPost) return res.status(404).json({ success: false, message: 'Không tìm thấy bài đăng hoặc bạn không có quyền.' });
    if (existingPost.facebook_post_id) {
      await cancelFacebookScheduledPost({ pageId: existingPost.page_id, facebookPostId: existingPost.facebook_post_id });
    }

    const request = pool.request().input('id', sql.Int, postId).input('scheduledAt', sql.DateTime2, new Date());
    const result = await request.query(`UPDATE Posts SET scheduled_at=@scheduledAt,status='pending',facebook_post_id=NULL OUTPUT INSERTED.id WHERE id=@id AND status IN ('pending','scheduled','failed','cancelled');`);
    if (result.recordset.length === 0) {
      return res.status(400).json({ success: false, message: 'Bài viết không ở trạng thái có thể đăng ngay.' });
    }
    try {
      await standaloneScheduler.schedulePost(postId, new Date());
    } catch (queueErr) {
      console.error(`[Publish Now Schedule Warning postId ${postId}]`, queueErr.message);
    }
    return res.status(202).json({ success: true, message: 'Đã đưa bài đăng vào hàng đợi để xuất bản ngay.' });
  } catch (error) {
    console.error('[Publish Now Error]', error.message);
    return res.status(500).json({ success: false, message: error.message || 'Không thể đưa bài vào hàng đợi.' });
  }
});

app.post('/api/posts/:postId/comments/instant', requireAuth, async (req, res) => {
  const postId = Number.parseInt(req.params.postId, 10);
  const content = typeof req.body.content === 'string' ? req.body.content.trim() : '';
  if (!Number.isSafeInteger(postId) || postId <= 0) return res.status(400).json({ success: false, message: 'ID bài đăng không hợp lệ.' });
  if (!content) return res.status(400).json({ success: false, message: 'Nội dung bình luận seeding không được để trống.' });

  try {
    const pool = await getPool();
    const postRequest = pool.request().input('id', sql.Int, postId);
    const postRes = await postRequest.query(`SELECT facebook_post_id, page_id, created_by_user_id FROM Posts WHERE id = @id AND ${applyPostScope(req, postRequest)}`);
    const post = postRes.recordset[0];
    if (!post) return res.status(404).json({ success: false, message: 'Không tìm thấy bài viết hoặc bạn không có quyền comment.' });
    if (!post.facebook_post_id) {
      return res.status(400).json({ success: false, message: 'Bài viết chưa được xuất bản lên Facebook.' });
    }

    const pageAccessToken = await getFacebookPageAccessToken(post.page_id);
    const graphVersion = process.env.FB_GRAPH_VERSION || 'v19.0';
    const fbRes = await axios.post(`https://graph.facebook.com/${graphVersion}/${post.facebook_post_id}/comments`, {
      message: content,
      access_token: pageAccessToken
    });

    await pool.request()
      .input('postId', sql.Int, postId)
      .input('content', sql.NVarChar, content)
      .input('delayMinutes', sql.Int, 0)
      .query("INSERT INTO PostComments (post_id, comment_index, content, delay_minutes, status) VALUES (@postId, 99, @content, @delayMinutes, 'posted');");

    return res.json({ success: true, message: 'Đã gửi comment seeding lên Facebook thành công!', fbCommentId: fbRes.data?.id });
  } catch (error) {
    const errMsg = error.response?.data?.error?.message || error.message;
    console.error('[Instant Comment Error]', errMsg);
    return res.status(500).json({ success: false, message: errMsg });
  }
});

app.delete('/api/posts/:postId', requireAuth, async (req, res) => {
  const postId = Number.parseInt(req.params.postId, 10);
  if (!Number.isSafeInteger(postId) || postId <= 0) return res.status(400).json({ success: false, message: 'ID bài đăng không hợp lệ.' });
  try {
    await ensurePostOwnershipSchema();
    const pool = await getPool();
    const request = pool.request().input('id', sql.Int, postId);
    const result = await request.query(`SELECT id,page_id,status,facebook_post_id,media_links,created_by_user_id FROM Posts WHERE id=@id AND ${applyPostScope(req, request)}`);
    const post = result.recordset[0];
    if (!post) return res.status(404).json({ success: false, message: 'Không tìm thấy bài đăng.' });
    if (!['pending', 'failed'].includes(post.status)) return res.status(409).json({ success: false, message: 'Chỉ xóa được bài chờ hoặc thất bại.' });
    if (post.facebook_post_id && post.status === 'pending') {
      await cancelFacebookScheduledPost({ pageId: post.page_id, facebookPostId: post.facebook_post_id });
    }
    await removePostFromQueue(postId);
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      await new sql.Request(transaction).input('id', sql.Int, postId).query('DELETE FROM PostComments WHERE post_id=@id; DELETE FROM Posts WHERE id=@id;');
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
    try {
      const mediaLinks = JSON.parse(post.media_links || '[]');
      for (const link of Array.isArray(mediaLinks) ? mediaLinks : [mediaLinks]) {
        const name = localMediaFilename(link);
        if (name) await fs.promises.unlink(path.resolve(mediaDirectory, name)).catch(() => {});
      }
    } catch {}
    return res.json({ success: true, message: 'Đã xóa bài đăng.' });
  } catch (error) {
    console.error('[Delete Post Error]', error.message);
    return res.status(500).json({ success: false, message: 'Không thể xóa bài đăng.' });
  }
});

app.post('/api/posts/bulk-preview', requireAuth, memoryUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'Vui lòng upload file Excel để xem trước.' });
    await ensurePostOwnershipSchema();
    const posts = parseBulkExcel(req.file.buffer);
    const connectedPages = await getConnectedPages(req.user.sub);
    const connectedMap = new Map(connectedPages.map((p) => [String(p.id), p.name]));
    const defaultPage = connectedPages[0];

    const previewList = posts.map((post) => {
      const pageId = String(post.pageId || req.body.defaultPageId || defaultPage?.id || '');
      const isPageConnected = connectedMap.has(pageId);
      const pageName = isPageConnected ? connectedMap.get(pageId) : (post.pageId ? `Page ${post.pageId} (Chưa kết nối)` : 'Chưa gán Page');

      let error = null;
      if (!isPageConnected) {
        error = 'Fanpage này chưa được kết nối với hệ thống.';
      } else if (!post.content || post.content.trim().length === 0) {
        error = 'Nội dung bài viết không được để trống.';
      } else if (!post.scheduledAt || Number.isNaN(new Date(post.scheduledAt).getTime())) {
        error = 'Thời gian đăng không hợp lệ.';
      }

      return {
        rowIndex: post.rowIndex,
        pageId,
        pageName,
        isPageConnected,
        content: post.content,
        scheduledAt: post.scheduledAt,
        mediaType: post.mediaType,
        mediaLinks: post.mediaLinks,
        commentsCount: post.comments.length,
        comments: post.comments,
        valid: !error,
        error
      };
    });

    const validCount = previewList.filter((p) => p.valid).length;
    return res.json({
      success: true,
      total: previewList.length,
      validCount,
      invalidCount: previewList.length - validCount,
      posts: previewList
    });
  } catch (error) {
    console.error('[Bulk Preview Error]', error.message);
    return res.status(400).json({ success: false, message: error.message });
  }
});

app.post('/api/posts/bulk-upload', requireAuth, memoryUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'Vui lòng upload file Excel.' });
    await ensurePostOwnershipSchema();
    const posts = parseBulkExcel(req.file.buffer);
    const pool = await getPool();
    const connectedPages = await getConnectedPages(req.user.sub);
    const connectedPageIds = new Set(connectedPages.map((page) => String(page.id)));
    const defaultPageId = req.body.defaultPageId || connectedPages[0]?.id;
    const createdIds = [];
    const errors = [];
    for (const post of posts) {
      const transaction = new sql.Transaction(pool);
      try {
        await transaction.begin();
        const pageId = String(post.pageId || defaultPageId || '');
        if (!connectedPageIds.has(pageId)) throw new Error('Page trong dòng Excel chưa được kết nối với Facebook account này.');
        const inserted = await new sql.Request(transaction)
          .input('pageId', sql.VarChar, pageId)
          .input('ownerId', sql.VarChar(64), req.user.sub)
          .input('content', sql.NVarChar, post.content)
          .input('mediaType', sql.VarChar, post.mediaType)
          .input('mediaLinks', sql.NVarChar, JSON.stringify(post.mediaLinks))
          .input('mediaThumb', sql.VarChar, post.mediaThumb)
          .input('scheduledAt', sql.DateTime2, post.scheduledAt)
          .input('status', sql.VarChar, 'pending')
          .query('INSERT INTO Posts (page_id,content,media_type,media_links,media_thumb,scheduled_at,status,created_by_user_id) OUTPUT INSERTED.id VALUES (@pageId,@content,@mediaType,@mediaLinks,@mediaThumb,@scheduledAt,@status,@ownerId);');
        const postId = inserted.recordset[0].id;
        for (const comment of post.comments) {
          await new sql.Request(transaction)
            .input('postId', sql.Int, postId)
            .input('commentIndex', sql.Int, comment.commentIndex)
            .input('content', sql.NVarChar, comment.content)
            .input('delay', sql.Int, comment.delayMinutes)
            .input('mediaUrl', sql.VarChar, comment.mediaUrl)
            .query("INSERT INTO PostComments (post_id,comment_index,content,delay_minutes,media_url,status) VALUES (@postId,@commentIndex,@content,@delay,@mediaUrl,'pending');");
        }
        await transaction.commit();
        if (canScheduleOnFacebook({ mediaType: post.mediaType, scheduledAt: post.scheduledAt })) {
          try {
            const fbPostId = await schedulePostOnFacebook({
              pageId,
              content: post.content,
              mediaType: post.mediaType,
              mediaLinks: post.mediaLinks,
              scheduledAt: post.scheduledAt
            });
            await pool.request()
              .input('id', sql.Int, postId)
              .input('fbId', sql.NVarChar, fbPostId)
              .query('UPDATE Posts SET facebook_post_id = @fbId WHERE id = @id');
          } catch (fbErr) {
            console.warn(`[Bulk FB Schedule Warning postId ${postId}]`, fbErr.response?.data?.error?.message || fbErr.message);
          }
        }
        try {
          await standaloneScheduler.schedulePost(postId, post.scheduledAt);
          createdIds.push(postId);
        } catch (error) {
          console.error(`[Bulk Schedule Warning postId ${postId}]`, error.message);
          createdIds.push(postId); // Vẫn đã lưu vào DB
        }
      } catch (error) {
        await transaction.rollback().catch(() => {});
        errors.push({ row: post.rowIndex, message: error.message });
      }
    }
    return res.json({ success: errors.length === 0, data: createdIds, errors, message: `Đã xếp lịch thành công ${createdIds.length}/${posts.length} bài đăng.` });
  } catch (error) {
    console.error('[Bulk Upload Error]', error.message);
    return res.status(400).json({ success: false, message: error.message });
  }
});

// ═══ HEALTH CHECK ENDPOINT (DÙNG ĐỂ CHỐNG NGỦ ĐÔNG TRÊN RENDER / UPTIMEROBOT) ═══
app.get('/api/health', (_req, res) => {
  return res.json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

// ═══ SERVE STATIC FRONTEND TỪ CLIENT/OUT (DÀNH CHO CHẾ ĐỘ DESKTOP / PRODUCTION) ═══
const clientOutDir = process.env.CLIENT_OUT_DIR || path.resolve(__dirname, '../../client/out');
if (fs.existsSync(clientOutDir)) {
  app.use(express.static(clientOutDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    const cleanPath = req.path.replace(/\/+$/, '');
    const directFile = path.join(clientOutDir, req.path);
    if (fs.existsSync(directFile) && fs.existsSync(directFile) && fs.statSync(directFile).isFile()) {
      return res.sendFile(directFile);
    }
    const indexInFolder = path.join(clientOutDir, cleanPath, 'index.html');
    if (fs.existsSync(indexInFolder)) {
      return res.sendFile(indexInFolder);
    }
    return res.sendFile(path.join(clientOutDir, 'index.html'));
  });
}

app.use((error, _req, res, _next) => {
  console.error('[Unhandled API Error]', error.message);
  return res.status(500).json({ success: false, message: 'Lỗi máy chủ.' });
});

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`Server listening on ${PORT}`);
  // Khởi tạo bảng tài khoản và tạo sẵn tài khoản Admin mặc định
  ensureAppUserSchema().catch((error) => console.error('[AppUsers Init Error]', error.message));
  // Khởi động tiến trình tự động giám sát sức khỏe Token định kỳ (Module 2)
  tokenHealthCheckService.startScheduler(6);

  // Khởi động bộ đếm giờ độc lập cho bài đăng & comment seeding (hoạt động kể cả không có Redis)
  standaloneScheduler.startStandaloneScheduler(10000);

  // Tùy chọn gộp Worker chạy chung một tiến trình (Dành cho Render / Cloud Free không tốn thêm $7/tháng)
  if (process.env.RUN_WORKER_IN_PROCESS === 'true') {
    console.log('⚡ [In-Process Worker] Tự động kích hoạt Post Worker chạy chung trong Backend...');
    try {
      require('../queues/post.worker');
    } catch (workerErr) {
      console.warn('[In-Process Worker Error]', workerErr.message);
    }
  }
});
server.on('error', (error) => {
  console.error('[HTTP Server Error]', error.message);
  process.exitCode = 1;
});

module.exports = app;
