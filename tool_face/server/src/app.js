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
const { getFacebookPageAccessToken } = require('./utils/FacebookPageAccessToken');
const {
  saveFacebookUser,
  syncFacebookPages,
  getStoredUserAccessToken,
  getStoredUserAvatar,
  saveUserAvatar,
  getConnectedPages,
  saveManualFacebookPage,
  disconnectFacebookPage
} = require('./utils/FacebookPageConnections');
const { getSettings, saveMultipleSettings } = require('./utils/SettingsService');
const aiConversationService = require('./utils/AiConversationService');
const channelGroupService = require('./utils/ChannelGroupService');
const {
  OAUTH_STATE_COOKIE,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  adminIds,
  authConfiguration,
  clearCookie,
  clientOrigin,
  facebookRedirectUri,
  loadSession,
  parseCookies,
  requireAuth,
  setCookie,
  signSession
} = require('./middlewares/auth');

const app = express();
const frontendOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:3000';
app.use(cors({ origin: frontendOrigin, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use('/api', loadSession);

const mediaDirectory = path.resolve(__dirname, '../uploads');
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

app.get('/api/auth/status', (_req, res) => {
  const config = authConfiguration();
  return res.json({
    success: true,
    configured: config.configured,
    missing: config.missing,
    adminConfigured: config.adminConfigured,
    adminCount: adminIds().size
  });
});

app.get('/api/auth/me', async (req, res) => {
  if (!req.user) return res.status(401).json({ authenticated: false });
  let avatar = req.user.avatar || null;
  if (!avatar && req.user.sub) {
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
      id: req.user.sub,
      name: req.user.name,
      role: req.user.role,
      avatar: avatar || null
    }
  });
});

app.get('/api/auth/facebook', (req, res) => {
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
  if (!stateMatches || typeof req.query.code !== 'string') {
    return res.redirect(`${clientOrigin()}/login?error=oauth_state_invalid`);
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
    await saveFacebookUser(profileResponse.data, userAccessToken, tokenExpiresIn);
    const connectedPages = await syncFacebookPages(profileResponse.data.id, userAccessToken);
    console.log(`[Facebook OAuth] Connected ${connectedPages.length} Page(s) for user ${profileResponse.data.id}.`);
    setCookie(req, res, SESSION_COOKIE, signSession(profileResponse.data), SESSION_TTL_SECONDS);
    return res.redirect(`${clientOrigin()}/dashboard`);
  } catch (error) {
    console.error('[Facebook OAuth Error]', error.response?.status || error.message);
    return res.redirect(`${clientOrigin()}/login?error=oauth_failed`);
  }
});

app.post('/api/auth/logout', (_req, res) => {
  clearCookie(_req, res, SESSION_COOKIE);
  clearCookie(_req, res, OAUTH_STATE_COOKIE);
  return res.json({ success: true });
});

app.post('/api/media', requireAuth, handleMediaUpload, (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'Vui lòng chọn ảnh hoặc video.' });
  return res.status(201).json({
    success: true,
    mediaLink: `local://${req.file.filename}`,
    mediaType: req.file.mimetype.startsWith('video/') ? 'video' : 'image',
    fileName: req.file.originalname,
    size: req.file.size
  });
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

  try {
    const response = await axios.post(`${baseUrl}/chat/completions`, {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: message }
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

    return res.json({
      success: true,
      settings: {
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
        enable_rgb_effects: settings.enable_rgb_effects !== false
      },
      account: {
        id: req.user.sub,
        name: req.user.name,
        role: req.user.role,
        avatar: req.user.avatar || null,
        hasAccessToken: Boolean(userToken),
        connectedPagesCount: pages.length
      },
      system: {
        metaAppId: process.env.FACEBOOK_APP_ID || '',
        nodeVersion: process.version,
        serverTime: new Date().toISOString(),
        dbStatus: 'connected',
        queueStatus: 'running'
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Lỗi tải thông tin cài đặt: ' + error.message });
  }
});

app.post('/api/settings', requireAuth, async (req, res) => {
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

    await saveMultipleSettings(updates);
    return res.json({ success: true, message: 'Đã lưu cấu hình thành công!' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Không thể lưu cài đặt: ' + error.message });
  }
});

app.post('/api/settings/test-ai', requireAuth, async (req, res) => {
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
    const userToken = await getStoredUserAccessToken(req.user.sub);
    let channels = [];
    if (userToken) {
      try {
        channels = await syncFacebookPages(req.user.sub, userToken);
      } catch (syncError) {
        console.warn('[Channels Sync Warning]', syncError.response?.data?.error?.message || syncError.message);
      }
    }
    // Fallback nếu sync rỗng hoặc chưa cấp pages_show_list
    if (!channels || channels.length === 0) {
      channels = await getConnectedPages(req.user.sub);
    }
    return res.json({ success: true, channels });
  } catch (error) {
    return sendApiError(res, 'Channels Error', error, 'Không thể tải danh sách Page.');
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
    const createdPostIds = [];

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
        createdPostIds.push(postId);
        console.log(`[POST /api/posts] Đã INSERT bài ${postId} cho page ${pageId}`);
      } catch (insertError) {
        await transaction.rollback();
        console.error(`[Create Post Error for page ${pageId}]`, insertError.message);
      }
    }

    if (createdPostIds.length === 0) {
      return res.status(500).json({ success: false, message: 'Không thể tạo bản ghi bài viết cho các Page đã chọn.' });
    }

    // Đưa vào BullMQ Queue — dùng timeout 5s để tránh treo nếu Redis có vấn đề
    console.log('[POST /api/posts] Bước 4: đưa vào BullMQ queue...');
    for (const postId of createdPostIds) {
      try {
        await Promise.race([
          addPostToQueue(postId, scheduledAt),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Queue timeout')), 5000))
        ]);
        console.log(`[POST /api/posts] Đã queue bài ${postId}`);
      } catch (queueError) {
        console.error(`[Post Queue Error postId ${postId}]`, queueError.message);
        // Không block response — bài vẫn đã được lưu vào DB
        // Worker sẽ không chạy nhưng admin có thể trigger lại
      }
    }

    const message = createdPostIds.length === 1
      ? 'Đã lưu bài và đưa vào lịch đăng.'
      : `Đã lưu và lên lịch bài đăng đồng thời cho ${createdPostIds.length} Fanpage.`;

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
    if (req.user.role !== 'admin') {
      filters.push('created_by_user_id = @ownerId');
      countRequest.input('ownerId', sql.VarChar(64), req.user.sub);
      postsRequest.input('ownerId', sql.VarChar(64), req.user.sub);
    }
    const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const count = await countRequest.query(`SELECT COUNT(*) AS total FROM Posts ${whereClause}`);
    const result = await postsRequest.input('offset', sql.Int, (page - 1) * limit).input('limit', sql.Int, limit).query(`SELECT * FROM Posts ${whereClause} ORDER BY id DESC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;`);
    return res.json({ success: true, posts: result.recordset, total: count.recordset[0].total, page, limit });
  } catch (error) {
    console.error('[Posts List Error]', error.message);
    return res.status(500).json({ success: false, message: 'Không thể tải danh sách bài đăng.' });
  }
});

app.get('/api/posts/stats', requireAuth, async (req, res) => {
  try {
    await ensurePostOwnershipSchema();
    const pool = await getPool();
    const request = pool.request();
    const where = req.user.role === 'admin' ? '' : 'WHERE created_by_user_id=@ownerId';
    if (req.user.role !== 'admin') request.input('ownerId', sql.VarChar(64), req.user.sub);
    const result = await request.query(`SELECT COUNT(*) AS total, SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) AS pending, SUM(CASE WHEN status='published' THEN 1 ELSE 0 END) AS published, SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed FROM Posts ${where};`);
    const stats = result.recordset[0];
    return res.json({ success: true, stats: { total: Number(stats.total || 0), pending: Number(stats.pending || 0), published: Number(stats.published || 0), failed: Number(stats.failed || 0) } });
  } catch (error) {
    console.error('[Posts Stats Error]', error.message);
    return res.status(500).json({ success: false, message: 'Không thể tải thống kê bài đăng.' });
  }
});

app.get('/api/reports/insights', requireAuth, async (req, res) => {
  let pageId = req.query.pageId ? String(req.query.pageId) : '';
  try {
    const pages = await getConnectedPages(req.user.sub);
    pageId = pageId || pages[0]?.id;
    if (!pageId) return res.status(409).json({ success: false, available: false, message: 'Tài khoản chưa có Fanpage đã kết nối.' });
    if (!pages.some((page) => String(page.id) === pageId)) return res.status(403).json({ success: false, available: false, message: 'Không có quyền xem Insights của Fanpage này.' });
  } catch (error) {
    return sendApiError(res, 'Insights Page Lookup Error', error, 'Không thể tải danh sách Fanpage.');
  }
  const daysValue = Number.parseInt(req.query.days, 10);
  const days = [7, 14, 30].includes(daysValue) ? daysValue : 14;
  const until = new Date();
  const since = new Date(until.getTime() - days * 86400000);
  try {
    const token = await getFacebookPageAccessToken(pageId);
    const version = process.env.FB_GRAPH_VERSION || 'v19.0';
    const names = (process.env.FB_INSIGHT_METRICS || 'page_post_engagements,page_views_total,page_media_view').split(',').map((value) => value.trim()).filter(Boolean);
    const result = await axios.get(`https://graph.facebook.com/${version}/${pageId}/insights`, {
      params: { metric: names.join(','), period: 'day', since: since.toISOString().slice(0, 10), until: until.toISOString().slice(0, 10), access_token: token },
      timeout: 15000
    });
    const metrics = (result.data.data || []).map((metric) => ({ name: metric.name, period: metric.period, values: (metric.values || []).map((item) => ({ endTime: item.end_time, value: item.value })) }));
    const available = metrics.some((metric) => metric.values.length > 0);
    return res.json({ success: true, available, days, metrics, message: available ? null : 'Facebook chưa trả datapoint Insights cho Page này trong khoảng thời gian đã chọn.' });
  } catch (error) {
    return sendApiError(res, 'Insights Error', error, 'Không tải được Facebook Insights.');
  }
});

// ═══ CHI TIẾT BÀI ĐĂNG (KÈM SEEDING COMMENTS) ═══
app.get('/api/posts/:postId', requireAuth, async (req, res) => {
  const postId = Number.parseInt(req.params.postId, 10);
  if (!Number.isSafeInteger(postId) || postId <= 0) return res.status(400).json({ success: false, message: 'ID bài đăng không hợp lệ.' });
  try {
    await ensurePostOwnershipSchema();
    const pool = await getPool();
    const postResult = await pool.request()
      .input('id', sql.Int, postId)
      .query('SELECT * FROM Posts WHERE id = @id');
    const post = postResult.recordset[0];
    if (!post) return res.status(404).json({ success: false, message: 'Không tìm thấy bài đăng.' });
    if (req.user.role !== 'admin' && post.created_by_user_id !== req.user.sub) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền xem bài đăng này.' });
    }

    const commentsResult = await pool.request()
      .input('postId', sql.Int, postId)
      .query('SELECT * FROM PostComments WHERE post_id = @postId ORDER BY comment_index ASC');

    return res.json({
      success: true,
      post: {
        ...post,
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
    const ownerFilter = req.user.role === 'admin' ? '' : ' AND created_by_user_id = @ownerId';
    if (req.user.role !== 'admin') request.input('ownerId', sql.VarChar(64), req.user.sub);

    const check = await request.query(`SELECT id, status FROM Posts WHERE id = @id ${ownerFilter}`);
    const post = check.recordset[0];
    if (!post) return res.status(404).json({ success: false, message: 'Không tìm thấy bài đăng hoặc không có quyền.' });
    if (post.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Chỉ có thể hủy lịch các bài đang ở trạng thái Chờ đăng (pending).' });
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
    const result = await pool.request().input('id', sql.Int, postId).query('SELECT id, page_id, status, facebook_post_id FROM Posts WHERE id = @id');
    const post = result.recordset[0];
    if (!post) return res.status(404).json({ success: false, message: 'Không tìm thấy bài đăng.' });
    if (!post.facebook_post_id) {
      return res.status(400).json({ success: false, message: 'Bài viết này chưa được xuất bản lên Facebook nên chưa có số liệu tương tác.' });
    }

    const token = await getFacebookPageAccessToken(post.page_id);
    const graphVersion = process.env.FB_GRAPH_VERSION || 'v19.0';
    const fbRes = await axios.get(`https://graph.facebook.com/${graphVersion}/${post.facebook_post_id}`, {
      params: {
        fields: 'shares,reactions.summary(total_count),comments.summary(total_count)',
        access_token: token
      },
      timeout: 10000
    });

    const data = fbRes.data || {};
    const analytics = {
      likes: data.reactions?.summary?.total_count ?? 0,
      comments: data.comments?.summary?.total_count ?? 0,
      shares: data.shares?.count ?? 0,
      fbPostId: post.facebook_post_id
    };

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
    const request = pool.request().input('id', sql.Int, postId).input('scheduledAt', sql.DateTime2, new Date());
    const ownerFilter = req.user.role === 'admin' ? '' : ' AND created_by_user_id=@ownerId';
    if (req.user.role !== 'admin') request.input('ownerId', sql.VarChar(64), req.user.sub);
    const result = await request.query(`UPDATE Posts SET scheduled_at=@scheduledAt,status='pending' OUTPUT INSERTED.id WHERE id=@id AND status IN ('pending','failed','cancelled')${ownerFilter};`);
    try {
      await Promise.race([
        addPostToQueue(postId, new Date()),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Queue timeout')), 5000))
      ]);
    } catch (queueErr) {
      console.error(`[Publish Now Queue Warning postId ${postId}]`, queueErr.message);
    }
    return res.status(202).json({ success: true, message: 'Đã đưa bài đăng vào hàng đợi.' });
  } catch (error) {
    console.error('[Publish Now Error]', error.message);
    return res.status(500).json({ success: false, message: error.message || 'Không thể đưa bài vào hàng đợi.' });
  }
});

app.delete('/api/posts/:postId', requireAuth, async (req, res) => {
  const postId = Number.parseInt(req.params.postId, 10);
  if (!Number.isSafeInteger(postId) || postId <= 0) return res.status(400).json({ success: false, message: 'ID bài đăng không hợp lệ.' });
  try {
    await ensurePostOwnershipSchema();
    const pool = await getPool();
    const result = await pool.request().input('id', sql.Int, postId).query('SELECT id,status,media_links,created_by_user_id FROM Posts WHERE id=@id');
    const post = result.recordset[0];
    if (!post) return res.status(404).json({ success: false, message: 'Không tìm thấy bài đăng.' });
    if (req.user.role !== 'admin' && post.created_by_user_id !== req.user.sub) return res.status(404).json({ success: false, message: 'Không tìm thấy bài đăng.' });
    if (!['pending', 'failed'].includes(post.status)) return res.status(409).json({ success: false, message: 'Chỉ xóa được bài chờ hoặc thất bại.' });
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
        try {
          await Promise.race([
            addPostToQueue(postId, post.scheduledAt),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Queue timeout')), 5000))
          ]);
          createdIds.push(postId);
        } catch (error) {
          console.error(`[Bulk Queue Warning postId ${postId}]`, error.message);
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

app.use((error, _req, res, _next) => {
  console.error('[Unhandled API Error]', error.message);
  return res.status(500).json({ success: false, message: 'Lỗi máy chủ.' });
});

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => console.log(`Server listening on ${PORT}`));
server.on('error', (error) => {
  console.error('[HTTP Server Error]', error.message);
  process.exitCode = 1;
});

module.exports = app;
