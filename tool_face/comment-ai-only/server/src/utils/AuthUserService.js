const crypto = require('crypto');
const { sql, getPool } = require('../../config/db');

const ADMIN_USERNAME = 'admin';
const DEFAULT_ADMIN_PASSWORD = '1';
const USER_COLUMNS = 'id, username, email, display_name, role, status, created_by, last_login_at, created_at, updated_at';
let schemaPromise;

class AppUserError extends Error {
  constructor(message, status = 400, code = 'invalid_request') {
    super(message);
    this.status = status;
    this.code = code;
  }
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

function publicUser(row) {
  if (!row) return null;
  const role = row.role || 'user';
  const roleLabel = role === 'admin' ? 'Quản trị viên' : role === 'manager' ? 'Quản lý' : 'Thành viên';
  const permissions = role === 'admin'
    ? ['users.manage', 'posts.team', 'settings.system']
    : role === 'manager' ? ['users.manage', 'posts.team'] : [];
  return {
    id: String(row.id),
    username: row.username,
    email: row.email || null,
    name: row.display_name || row.username,
    role,
    roleLabel,
    level: role === 'admin' ? 100 : role === 'manager' ? 50 : 10,
    permissions,
    status: row.status || 'active'
  };
}

async function ensureSchema() {
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
        IF COL_LENGTH('dbo.AppUsers', 'email') IS NULL ALTER TABLE dbo.AppUsers ADD email nvarchar(255) NULL;
        IF COL_LENGTH('dbo.AppUsers', 'status') IS NULL ALTER TABLE dbo.AppUsers ADD status varchar(20) NOT NULL DEFAULT 'active';
        IF COL_LENGTH('dbo.AppUsers', 'created_by') IS NULL ALTER TABLE dbo.AppUsers ADD created_by int NULL;
        IF COL_LENGTH('dbo.AppUsers', 'last_login_at') IS NULL ALTER TABLE dbo.AppUsers ADD last_login_at datetime2 NULL;
      `);
      await seedAdmin(pool);
    })().catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
}

async function seedAdmin(pool) {
  const configuredPassword = process.env.ADMIN_PASSWORD;
  if (configuredPassword && configuredPassword.length < 8) {
    throw new Error('ADMIN_PASSWORD must contain at least 8 characters.');
  }
  const result = await pool.request()
    .input('username', sql.VarChar(64), ADMIN_USERNAME)
    .query('SELECT id, password_hash FROM dbo.AppUsers WHERE username=@username');
  const existing = result.recordset[0];

  if (existing) {
    if (configuredPassword && verifyPassword(DEFAULT_ADMIN_PASSWORD, existing.password_hash)) {
      await pool.request()
        .input('id', sql.Int, existing.id)
        .input('passwordHash', sql.NVarChar(255), hashPassword(configuredPassword))
        .query('UPDATE dbo.AppUsers SET password_hash=@passwordHash, updated_at=SYSUTCDATETIME() WHERE id=@id');
    } else if (!configuredPassword && process.env.NODE_ENV === 'production' && verifyPassword(DEFAULT_ADMIN_PASSWORD, existing.password_hash)) {
      console.warn('[Auth] Admin is still using the default password; set ADMIN_PASSWORD or change it before exposing the app.');
    }
    return;
  }
  if (!configuredPassword) {
    throw new Error('Set ADMIN_PASSWORD (at least 8 characters) to create the first admin account.');
  }
  await pool.request()
    .input('username', sql.VarChar(64), ADMIN_USERNAME)
    .input('passwordHash', sql.NVarChar(255), hashPassword(configuredPassword))
    .input('displayName', sql.NVarChar(120), 'Administrator')
    .query(`
      INSERT INTO dbo.AppUsers (username, password_hash, display_name, role, status, created_at, updated_at)
      VALUES (@username, @passwordHash, @displayName, 'admin', 'active', SYSUTCDATETIME(), SYSUTCDATETIME())
    `);
}

async function findById(id) {
  await ensureSchema();
  const pool = await getPool();
  const result = await pool.request()
    .input('id', sql.Int, Number(id))
    .query(`SELECT ${USER_COLUMNS} FROM dbo.AppUsers WHERE id=@id`);
  return result.recordset[0] || null;
}

async function findByIdentifier(identifier) {
  await ensureSchema();
  const pool = await getPool();
  const result = await pool.request()
    .input('identifier', sql.NVarChar(255), String(identifier || '').trim().toLowerCase())
    .query(`
      SELECT TOP 1 ${USER_COLUMNS}, password_hash
      FROM dbo.AppUsers
      WHERE username=@identifier OR email=@identifier
      ORDER BY CASE WHEN username=@identifier THEN 0 ELSE 1 END
    `);
  return result.recordset[0] || null;
}

async function loginAppUser({ identifier, password }) {
  if (!String(identifier || '').trim() || typeof password !== 'string' || !password) {
    throw new AppUserError('Vui lòng nhập tên đăng nhập và mật khẩu.', 400, 'missing_fields');
  }
  const user = await findByIdentifier(identifier);
  if (!user) throw new AppUserError('Tài khoản không tồn tại.', 404, 'account_not_found');
  if (user.status === 'locked') throw new AppUserError('Tài khoản đã bị khóa.', 403, 'account_locked');
  if (!verifyPassword(password, user.password_hash)) throw new AppUserError('Mật khẩu không chính xác.', 401, 'wrong_password');

  const pool = await getPool();
  await pool.request()
    .input('id', sql.Int, user.id)
    .query('UPDATE dbo.AppUsers SET last_login_at=SYSUTCDATETIME() WHERE id=@id');
  return publicUser(user);
}

async function getActiveSessionUser(id) {
  const user = await findById(id);
  return !user || user.status === 'locked' ? null : publicUser(user);
}

module.exports = { AppUserError, getActiveSessionUser, loginAppUser };
