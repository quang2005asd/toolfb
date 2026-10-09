const crypto = require('crypto');
const { sql, getPool } = require('../../config/db');
const {
  DEFAULT_ROLE,
  assignableRoles,
  canManageRole,
  getRole,
  isValidRole,
  roleLevel
} = require('./Roles');

const DEFAULT_ADMIN = { username: 'admin', password: '1', displayName: 'Administrator' };
const ACCOUNT_STATUSES = ['active', 'locked'];
const USER_COLUMNS = 'id, username, email, display_name, role, status, created_by, last_login_at, created_at, updated_at';
const MAX_SQL_INT = 2147483647;

class AppUserError extends Error {
  constructor(message, status = 400, code = 'invalid_request') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

let schemaPromise = null;

async function ensureAppUserSchema() {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const pool = await getPool();
      await pool.request().query(`
        IF OBJECT_ID(N'dbo.AppUsers', N'U') IS NULL
        BEGIN
          CREATE TABLE dbo.AppUsers (
            id int IDENTITY(1,1) PRIMARY KEY,
            username varchar(64) NOT NULL UNIQUE,
            email nvarchar(255) NULL,
            password_hash nvarchar(255) NOT NULL,
            display_name nvarchar(120) NOT NULL,
            role varchar(20) NOT NULL DEFAULT 'user',
            status varchar(20) NOT NULL DEFAULT 'active',
            created_by int NULL,
            last_login_at datetime2 NULL,
            created_at datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
            updated_at datetime2 NOT NULL DEFAULT SYSUTCDATETIME()
          );
        END;

        IF COL_LENGTH('dbo.AppUsers', 'email') IS NULL
          ALTER TABLE dbo.AppUsers ADD email nvarchar(255) NULL;
        IF COL_LENGTH('dbo.AppUsers', 'status') IS NULL
          ALTER TABLE dbo.AppUsers ADD status varchar(20) NOT NULL CONSTRAINT DF_AppUsers_status DEFAULT 'active';
        IF COL_LENGTH('dbo.AppUsers', 'created_by') IS NULL
          ALTER TABLE dbo.AppUsers ADD created_by int NULL;
        IF COL_LENGTH('dbo.AppUsers', 'last_login_at') IS NULL
          ALTER TABLE dbo.AppUsers ADD last_login_at datetime2 NULL;

        IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_AppUsers_username' AND object_id = OBJECT_ID(N'dbo.AppUsers'))
          CREATE INDEX IX_AppUsers_username ON dbo.AppUsers(username);
        IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_AppUsers_email' AND object_id = OBJECT_ID(N'dbo.AppUsers'))
          CREATE UNIQUE INDEX UX_AppUsers_email ON dbo.AppUsers(email) WHERE email IS NOT NULL;
      `);
      await seedDefaultAdmin(pool);
    })().catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
}

// Tạo sẵn tài khoản Admin mặc định (admin | 1) nếu chưa tồn tại
async function seedDefaultAdmin(pool) {
  const existing = await pool.request()
    .input('username', sql.VarChar(64), DEFAULT_ADMIN.username)
    .query('SELECT id FROM dbo.AppUsers WHERE username = @username');
  if (existing.recordset.length > 0) return;

  const now = new Date();
  await pool.request()
    .input('username', sql.VarChar(64), DEFAULT_ADMIN.username)
    .input('passwordHash', sql.NVarChar(255), hashPassword(DEFAULT_ADMIN.password))
    .input('displayName', sql.NVarChar(120), DEFAULT_ADMIN.displayName)
    .input('role', sql.VarChar(20), 'admin')
    .input('now', sql.DateTime2, now)
    .query(`
      INSERT INTO dbo.AppUsers (username, password_hash, display_name, role, status, created_at, updated_at)
      VALUES (@username, @passwordHash, @displayName, @role, 'active', @now, @now);
    `);
  console.log(`[AppUsers] Đã tạo tài khoản Admin mặc định "${DEFAULT_ADMIN.username}".`);
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (typeof stored !== 'string' || typeof password !== 'string') return false;
  const [salt, originalHash] = stored.split(':');
  if (!salt || !originalHash) return false;
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  if (hash.length !== originalHash.length) return false;
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(originalHash));
}

// ═══ CHUẨN HÓA & KIỂM TRA DỮ LIỆU ĐẦU VÀO ═══
function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function validateUsername(username) {
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
    throw new AppUserError('Tên đăng nhập dài 3–32 ký tự, chỉ gồm chữ thường không dấu, số và các ký tự . _ -', 400, 'invalid_username');
  }
}

function validateEmail(email) {
  if (!email || email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    throw new AppUserError('Gmail / Email không hợp lệ.', 400, 'invalid_email');
  }
}

function validateNewPassword(password, confirmPassword) {
  if (typeof password !== 'string' || password.length < 6) {
    throw new AppUserError('Mật khẩu phải có ít nhất 6 ký tự.', 400, 'weak_password');
  }
  if (password.length > 128) {
    throw new AppUserError('Mật khẩu tối đa 128 ký tự.', 400, 'weak_password');
  }
  if (confirmPassword !== undefined && password !== confirmPassword) {
    throw new AppUserError('Mật khẩu xác nhận không khớp.', 400, 'password_mismatch');
  }
}

function normalizeDisplayName(value, fallback) {
  const name = String(value || '').trim().slice(0, 120);
  return name || fallback;
}

function parseUserId(value) {
  const text = String(value ?? '').trim();
  if (!/^\d+$/.test(text)) return null;
  const id = Number(text);
  return id > 0 && id <= MAX_SQL_INT ? id : null;
}

// SQLite lưu datetime('now','localtime') dạng "YYYY-MM-DD HH:MM:SS" theo giờ máy chủ → đổi sang ISO
function toIsoDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  const text = String(value);
  const date = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(text) ? new Date(text.replace(' ', 'T')) : new Date(text);
  return Number.isNaN(date.getTime()) ? text : date.toISOString();
}

function toPublicUser(row) {
  if (!row) return null;
  const role = getRole(row.role);
  return {
    id: String(row.id),
    username: row.username,
    email: row.email || null,
    name: row.display_name,
    role: role.key,
    roleLabel: role.label,
    level: role.level,
    permissions: role.permissions,
    status: row.status || 'active',
    createdBy: row.created_by ? String(row.created_by) : null,
    lastLoginAt: toIsoDate(row.last_login_at),
    createdAt: toIsoDate(row.created_at)
  };
}

// ═══ TRUY VẤN ═══
async function findUserById(id, { withPassword = false } = {}) {
  const userId = parseUserId(id);
  if (!userId) return null;
  await ensureAppUserSchema();
  const pool = await getPool();
  const result = await pool.request()
    .input('id', sql.Int, userId)
    .query(`SELECT ${USER_COLUMNS}${withPassword ? ', password_hash' : ''} FROM dbo.AppUsers WHERE id = @id`);
  return result.recordset[0] || null;
}

async function findUserByIdentifier(identifier, { withPassword = false } = {}) {
  const value = String(identifier || '').trim().toLowerCase();
  if (!value) return null;
  await ensureAppUserSchema();
  const pool = await getPool();
  const result = await pool.request()
    .input('identifier', sql.NVarChar(255), value)
    .query(`
      SELECT TOP 1 ${USER_COLUMNS}${withPassword ? ', password_hash' : ''}
      FROM dbo.AppUsers
      WHERE username = @identifier OR email = @identifier
      ORDER BY CASE WHEN username = @identifier THEN 0 ELSE 1 END
    `);
  return result.recordset[0] || null;
}

async function accountExists(identifier) {
  return Boolean(await findUserByIdentifier(identifier));
}

async function assertUsernameAvailable(username) {
  await ensureAppUserSchema();
  const pool = await getPool();
  const result = await pool.request()
    .input('username', sql.VarChar(64), username)
    .query('SELECT id FROM dbo.AppUsers WHERE username = @username');
  if (result.recordset.length > 0) {
    throw new AppUserError('Tên đăng nhập này đã được sử dụng.', 409, 'username_taken');
  }
}

async function assertEmailAvailable(email, exceptUserId = null) {
  await ensureAppUserSchema();
  const pool = await getPool();
  const result = await pool.request()
    .input('email', sql.NVarChar(255), email)
    .query('SELECT id FROM dbo.AppUsers WHERE email = @email');
  if (result.recordset.some((row) => String(row.id) !== String(exceptUserId))) {
    throw new AppUserError('Gmail / Email này đã được đăng ký cho tài khoản khác.', 409, 'email_taken');
  }
}

async function insertUser({ username, email, password, displayName, role, createdBy = null }) {
  const pool = await getPool();
  const now = new Date();
  const result = await pool.request()
    .input('username', sql.VarChar(64), username)
    .input('email', sql.NVarChar(255), email)
    .input('passwordHash', sql.NVarChar(255), hashPassword(password))
    .input('displayName', sql.NVarChar(120), displayName)
    .input('role', sql.VarChar(20), role)
    .input('createdBy', sql.Int, createdBy)
    .input('now', sql.DateTime2, now)
    .query(`
      INSERT INTO dbo.AppUsers (username, email, password_hash, display_name, role, status, created_by, created_at, updated_at)
      OUTPUT INSERTED.id
      VALUES (@username, @email, @passwordHash, @displayName, @role, 'active', @createdBy, @now, @now);
    `);
  return findUserById(result.recordset[0].id);
}

// ═══ ĐĂNG KÝ / ĐĂNG NHẬP ═══
async function registerAppUser({ username, email, password, confirmPassword }) {
  await ensureAppUserSchema();
  const cleanUsername = normalizeUsername(username);
  const cleanEmail = normalizeEmail(email);

  validateUsername(cleanUsername);
  validateEmail(cleanEmail);
  validateNewPassword(password, confirmPassword);
  await assertUsernameAvailable(cleanUsername);
  await assertEmailAvailable(cleanEmail);

  // Tài khoản tự đăng ký luôn bắt đầu ở role thấp nhất
  return toPublicUser(await insertUser({
    username: cleanUsername,
    email: cleanEmail,
    password,
    displayName: cleanUsername,
    role: DEFAULT_ROLE
  }));
}

async function loginAppUser({ identifier, password }) {
  const cleanIdentifier = String(identifier || '').trim().toLowerCase();
  if (!cleanIdentifier || !password) {
    throw new AppUserError('Vui lòng nhập tên đăng nhập và mật khẩu.', 400, 'missing_fields');
  }

  const user = await findUserByIdentifier(cleanIdentifier, { withPassword: true });
  if (!user) {
    throw new AppUserError('Tài khoản không tồn tại. Hãy kiểm tra lại hoặc đăng ký tài khoản mới.', 404, 'account_not_found');
  }
  if (user.status === 'locked') {
    throw new AppUserError('Tài khoản đã bị khóa. Vui lòng liên hệ Quản lý hoặc Quản trị viên.', 403, 'account_locked');
  }
  if (!verifyPassword(password, user.password_hash)) {
    throw new AppUserError('Mật khẩu không chính xác.', 401, 'wrong_password');
  }

  const pool = await getPool();
  const now = new Date();
  await pool.request()
    .input('id', sql.Int, user.id)
    .input('now', sql.DateTime2, now)
    .query('UPDATE dbo.AppUsers SET last_login_at = @now WHERE id = @id');
  user.last_login_at = now;
  return toPublicUser(user);
}

// Dùng cho middleware: chỉ trả về tài khoản còn tồn tại và đang hoạt động
async function getActiveSessionUser(id) {
  const user = await findUserById(id);
  if (!user || user.status === 'locked') return null;
  return toPublicUser(user);
}

// ═══ QUẢN LÝ TÀI KHOẢN THEO CẤP BẬC ═══
async function listUsersForActor(actor) {
  await ensureAppUserSchema();
  const pool = await getPool();
  const result = await pool.request().query(`SELECT ${USER_COLUMNS} FROM dbo.AppUsers ORDER BY id ASC`);
  const actorLevel = roleLevel(actor.role);

  // Thấy được tài khoản cùng cấp hoặc thấp hơn, nhưng chỉ thao tác được trên cấp thấp hơn
  return result.recordset
    .filter((row) => roleLevel(row.role) <= actorLevel)
    .map((row) => {
      const isSelf = String(row.id) === String(actor.sub);
      return {
        ...toPublicUser(row),
        isSelf,
        manageable: !isSelf && canManageRole(actor.role, row.role)
      };
    });
}

async function getManageableTarget(actor, targetId) {
  const target = await findUserById(targetId);
  if (!target) {
    throw new AppUserError('Không tìm thấy tài khoản.', 404, 'account_not_found');
  }
  if (String(target.id) === String(actor.sub)) {
    throw new AppUserError('Không thể tự thay đổi vai trò, trạng thái hay xóa chính mình. Hãy dùng trang Hồ sơ để cập nhật thông tin cá nhân.', 403, 'self_forbidden');
  }
  if (!canManageRole(actor.role, target.role)) {
    throw new AppUserError('Bạn chỉ có thể quản lý tài khoản có cấp thấp hơn mình.', 403, 'insufficient_level');
  }
  return target;
}

function assertAssignableRole(actor, role) {
  if (!isValidRole(role) || !assignableRoles(actor.role).includes(role)) {
    throw new AppUserError('Bạn không có quyền gán vai trò này.', 403, 'role_forbidden');
  }
}

async function createUserByActor(actor, { username, email, displayName, password, confirmPassword, role }) {
  await ensureAppUserSchema();
  const cleanUsername = normalizeUsername(username);
  const cleanEmail = normalizeEmail(email);
  const targetRole = role || DEFAULT_ROLE;

  assertAssignableRole(actor, targetRole);
  validateUsername(cleanUsername);
  validateEmail(cleanEmail);
  validateNewPassword(password, confirmPassword);
  await assertUsernameAvailable(cleanUsername);
  await assertEmailAvailable(cleanEmail);

  return toPublicUser(await insertUser({
    username: cleanUsername,
    email: cleanEmail,
    password,
    displayName: normalizeDisplayName(displayName, cleanUsername),
    role: targetRole,
    createdBy: parseUserId(actor.sub)
  }));
}

async function updateUserByActor(actor, targetId, { displayName, email, role, status }) {
  const target = await getManageableTarget(actor, targetId);

  const nextDisplayName = displayName === undefined ? target.display_name : normalizeDisplayName(displayName, target.username);
  let nextEmail = target.email;
  if (email !== undefined) {
    nextEmail = normalizeEmail(email);
    validateEmail(nextEmail);
    await assertEmailAvailable(nextEmail, target.id);
  }
  let nextRole = target.role;
  if (role !== undefined && role !== target.role) {
    assertAssignableRole(actor, role);
    nextRole = role;
  }
  let nextStatus = target.status || 'active';
  if (status !== undefined) {
    if (!ACCOUNT_STATUSES.includes(status)) {
      throw new AppUserError('Trạng thái tài khoản không hợp lệ.', 400, 'invalid_status');
    }
    nextStatus = status;
  }

  const pool = await getPool();
  await pool.request()
    .input('id', sql.Int, target.id)
    .input('displayName', sql.NVarChar(120), nextDisplayName)
    .input('email', sql.NVarChar(255), nextEmail)
    .input('role', sql.VarChar(20), nextRole)
    .input('status', sql.VarChar(20), nextStatus)
    .input('now', sql.DateTime2, new Date())
    .query(`
      UPDATE dbo.AppUsers
      SET display_name = @displayName, email = @email, role = @role, status = @status, updated_at = @now
      WHERE id = @id
    `);
  return toPublicUser(await findUserById(target.id));
}

async function resetUserPasswordByActor(actor, targetId, { password, confirmPassword }) {
  const target = await getManageableTarget(actor, targetId);
  validateNewPassword(password, confirmPassword);
  const pool = await getPool();
  await pool.request()
    .input('id', sql.Int, target.id)
    .input('passwordHash', sql.NVarChar(255), hashPassword(password))
    .input('now', sql.DateTime2, new Date())
    .query('UPDATE dbo.AppUsers SET password_hash = @passwordHash, updated_at = @now WHERE id = @id');
}

async function deleteUserByActor(actor, targetId) {
  const target = await getManageableTarget(actor, targetId);
  const pool = await getPool();
  await pool.request()
    .input('id', sql.Int, target.id)
    .query('DELETE FROM dbo.AppUsers WHERE id = @id');
  return toPublicUser(target);
}

// ═══ HỒ SƠ CÁ NHÂN ═══
async function updateOwnProfile(userId, { displayName, email }) {
  const user = await findUserById(userId);
  if (!user) throw new AppUserError('Không tìm thấy tài khoản.', 404, 'account_not_found');

  let nextEmail = user.email;
  if (email !== undefined) {
    nextEmail = normalizeEmail(email);
    validateEmail(nextEmail);
    await assertEmailAvailable(nextEmail, user.id);
  }
  const pool = await getPool();
  await pool.request()
    .input('id', sql.Int, user.id)
    .input('displayName', sql.NVarChar(120), displayName === undefined ? user.display_name : normalizeDisplayName(displayName, user.username))
    .input('email', sql.NVarChar(255), nextEmail)
    .input('now', sql.DateTime2, new Date())
    .query('UPDATE dbo.AppUsers SET display_name = @displayName, email = @email, updated_at = @now WHERE id = @id');
  return toPublicUser(await findUserById(user.id));
}

async function changeOwnPassword(userId, { currentPassword, newPassword, confirmPassword }) {
  const user = await findUserById(userId, { withPassword: true });
  if (!user) throw new AppUserError('Không tìm thấy tài khoản.', 404, 'account_not_found');
  if (!verifyPassword(currentPassword, user.password_hash)) {
    throw new AppUserError('Mật khẩu hiện tại không chính xác.', 400, 'wrong_password');
  }
  validateNewPassword(newPassword, confirmPassword);
  const pool = await getPool();
  await pool.request()
    .input('id', sql.Int, user.id)
    .input('passwordHash', sql.NVarChar(255), hashPassword(newPassword))
    .input('now', sql.DateTime2, new Date())
    .query('UPDATE dbo.AppUsers SET password_hash = @passwordHash, updated_at = @now WHERE id = @id');
}

// Map id → { username, name } để hiển thị người tạo bài đăng
async function getUserDisplayMap(ids) {
  const userIds = [...new Set((ids || []).map(parseUserId).filter(Boolean))].slice(0, 200);
  if (userIds.length === 0) return new Map();
  await ensureAppUserSchema();
  const pool = await getPool();
  const request = pool.request();
  userIds.forEach((id, index) => request.input(`uid${index}`, sql.Int, id));
  const placeholders = userIds.map((_, index) => `@uid${index}`).join(', ');
  const result = await request.query(`SELECT id, username, display_name, role FROM dbo.AppUsers WHERE id IN (${placeholders})`);
  return new Map(result.recordset.map((row) => [String(row.id), {
    username: row.username,
    name: row.display_name,
    role: getRole(row.role).key,
    roleLabel: getRole(row.role).label
  }]));
}

module.exports = {
  AppUserError,
  accountExists,
  changeOwnPassword,
  createUserByActor,
  deleteUserByActor,
  ensureAppUserSchema,
  getActiveSessionUser,
  getUserDisplayMap,
  listUsersForActor,
  loginAppUser,
  registerAppUser,
  resetUserPasswordByActor,
  updateOwnProfile,
  updateUserByActor
};
