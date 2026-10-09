const crypto = require('crypto');
const { getActiveSessionUser } = require('../utils/AppUserService');
const { hasPermission } = require('../utils/Roles');

const SESSION_COOKIE = 'tool_face_session';
const OAUTH_STATE_COOKIE = 'tool_face_oauth_state';
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

function parseCookies(header = '') {
  return header.split(';').reduce((cookies, part) => {
    const separator = part.indexOf('=');
    if (separator < 0) return cookies;
    const key = part.slice(0, separator).trim();
    try {
      cookies[key] = decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      cookies[key] = '';
    }
    return cookies;
  }, {});
}

function appendCookie(res, cookie) {
  const current = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', current ? [...[].concat(current), cookie] : cookie);
}

function cookieOptions(req, maxAge) {
  const forwardedProtocol = req.get('x-forwarded-proto');
  const secure = process.env.COOKIE_SECURE === 'true'
    || (process.env.COOKIE_SECURE !== 'false' && (req.secure || forwardedProtocol === 'https'));
  return `Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
}

function setCookie(req, res, name, value, maxAge) {
  appendCookie(res, `${name}=${encodeURIComponent(value)}; ${cookieOptions(req, maxAge)}`);
}

function clearCookie(req, res, name) {
  setCookie(req, res, name, '', 0);
}

function getSessionSecret() {
  const secret = process.env.SESSION_SECRET;
  return typeof secret === 'string' && secret.length >= 32 ? secret : null;
}

function authConfiguration() {
  const missing = [];
  if (!process.env.FACEBOOK_APP_ID) missing.push('FACEBOOK_APP_ID');
  if (!process.env.FACEBOOK_APP_SECRET) missing.push('FACEBOOK_APP_SECRET');
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) missing.push('SESSION_SECRET (tối thiểu 32 ký tự)');
  if (process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_ID === process.env.FACEBOOK_PAGE_ID) {
    missing.push('FACEBOOK_APP_ID phải là Meta App ID, không phải FACEBOOK_PAGE_ID');
  }
  return { configured: missing.length === 0, missing };
}

function facebookRedirectUri() {
  return process.env.FACEBOOK_REDIRECT_URI || 'http://localhost:5000/api/auth/facebook/callback';
}

function clientOrigin() {
  return (process.env.CLIENT_ORIGIN || 'http://localhost:3000').replace(/\/$/, '');
}

function signSession(user) {
  const secret = getSessionSecret();
  if (!secret) throw new Error('SESSION_SECRET must contain at least 32 characters.');

  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    sub: String(user.id),
    name: String(user.name || user.username || 'User').slice(0, 120),
    iat: now,
    exp: now + SESSION_TTL_SECONDS
  })).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function verifySession(token) {
  const secret = getSessionSecret();
  if (!secret || typeof token !== 'string') return null;
  const separator = token.lastIndexOf('.');
  if (separator <= 0) return null;

  const payload = token.slice(0, separator);
  const providedSignature = Buffer.from(token.slice(separator + 1));
  const expectedSignature = Buffer.from(crypto.createHmac('sha256', secret).update(payload).digest('base64url'));
  if (providedSignature.length !== expectedSignature.length || !crypto.timingSafeEqual(providedSignature, expectedSignature)) return null;

  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!session.sub || !session.exp || session.exp <= Math.floor(Date.now() / 1000)) return null;
    return session;
  } catch {
    return null;
  }
}

// Đối chiếu phiên với CSDL mỗi request: role mới / khóa / xóa tài khoản có hiệu lực ngay lập tức
async function loadSession(req, _res, next) {
  const cookies = parseCookies(req.headers.cookie);
  let session = verifySession(cookies[SESSION_COOKIE]);
  if (!session && req.headers.authorization) {
    const authHeader = req.headers.authorization;
    if (authHeader.startsWith('Bearer ')) {
      session = verifySession(authHeader.slice(7).trim());
    }
  }

  req.user = null;
  if (session) {
    try {
      const account = await getActiveSessionUser(session.sub);
      if (account) {
        req.user = {
          sub: account.id,
          username: account.username,
          email: account.email,
          name: account.name,
          role: account.role,
          roleLabel: account.roleLabel,
          level: account.level,
          permissions: account.permissions,
          account,
          iat: session.iat,
          exp: session.exp
        };
      }
    } catch (error) {
      console.error('[Session Lookup Error]', error.message);
    }
  }
  next();
}

function originIsAllowed(req) {
  const origin = req.get('origin');
  if (!origin) return true;
  const cleanOrigin = origin.replace(/\/$/, '');
  if (cleanOrigin === clientOrigin()) return true;
  // Cho phép mọi origin localhost khi chạy ứng dụng Desktop hoặc Dev
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(cleanOrigin)) {
    return true;
  }
  return false;
}

function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.' });
  }
  if (!originIsAllowed(req)) {
    return res.status(403).json({ success: false, message: 'Origin không được phép.' });
  }
  next();
}

function requirePermission(permission) {
  return (req, res, next) => requireAuth(req, res, () => {
    if (!hasPermission(req.user.role, permission)) {
      return res.status(403).json({ success: false, message: 'Tài khoản của bạn không có quyền thực hiện thao tác này.' });
    }
    next();
  });
}

module.exports = {
  SESSION_COOKIE,
  OAUTH_STATE_COOKIE,
  SESSION_TTL_SECONDS,
  appendCookie,
  authConfiguration,
  clearCookie,
  clientOrigin,
  facebookRedirectUri,
  loadSession,
  parseCookies,
  requireAuth,
  requirePermission,
  setCookie,
  signSession,
  verifySession
};
