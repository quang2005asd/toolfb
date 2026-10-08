const crypto = require('crypto');
const { sql, getPool } = require('../../config/db');

let schemaPromise = null;

async function ensureAppUserSchema() {
  if (!schemaPromise) {
    schemaPromise = getPool().then((pool) => pool.request().query(`
      IF OBJECT_ID(N'dbo.AppUsers', N'U') IS NULL
      BEGIN
        CREATE TABLE dbo.AppUsers (
          id int IDENTITY(1,1) PRIMARY KEY,
          username varchar(64) NOT NULL UNIQUE,
          password_hash nvarchar(255) NOT NULL,
          display_name nvarchar(120) NOT NULL,
          role varchar(20) NOT NULL DEFAULT 'user',
          created_at datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
          updated_at datetime2 NOT NULL DEFAULT SYSUTCDATETIME()
        );
      END;

      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_AppUsers_username' AND object_id = OBJECT_ID(N'dbo.AppUsers'))
      BEGIN
        CREATE INDEX IX_AppUsers_username ON dbo.AppUsers(username);
      END;
    `)).catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false;
  const [salt, originalHash] = stored.split(':');
  if (!salt || !originalHash) return false;
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(originalHash));
}

async function registerAppUser({ username, password, displayName }) {
  await ensureAppUserSchema();
  const pool = await getPool();

  const cleanUsername = String(username || '').trim().toLowerCase();
  const cleanDisplayName = String(displayName || cleanUsername).trim();

  if (!cleanUsername || cleanUsername.length < 3) {
    throw new Error('Tên đăng nhập phải có ít nhất 3 ký tự.');
  }
  if (!password || password.length < 6) {
    throw new Error('Mật khẩu phải có ít nhất 6 ký tự.');
  }

  // Kiểm tra xem username đã tồn tại chưa
  const existing = await pool.request()
    .input('username', sql.VarChar(64), cleanUsername)
    .query('SELECT id FROM dbo.AppUsers WHERE username = @username');

  if (existing.recordset.length > 0) {
    throw new Error('Tên đăng nhập này đã được sử dụng.');
  }

  const passwordHash = hashPassword(password);

  const result = await pool.request()
    .input('username', sql.VarChar(64), cleanUsername)
    .input('passwordHash', sql.NVarChar(255), passwordHash)
    .input('displayName', sql.NVarChar(120), cleanDisplayName)
    .query(`
      INSERT INTO dbo.AppUsers (username, password_hash, display_name)
      OUTPUT INSERTED.id, INSERTED.username, INSERTED.display_name, INSERTED.role
      VALUES (@username, @passwordHash, @displayName);
    `);

  return result.recordset[0];
}

async function loginAppUser({ username, password }) {
  await ensureAppUserSchema();
  const pool = await getPool();

  const cleanUsername = String(username || '').trim().toLowerCase();
  if (!cleanUsername || !password) {
    throw new Error('Vui lòng nhập tên đăng nhập và mật khẩu.');
  }

  const result = await pool.request()
    .input('username', sql.VarChar(64), cleanUsername)
    .query('SELECT id, username, password_hash, display_name, role FROM dbo.AppUsers WHERE username = @username');

  const user = result.recordset[0];
  if (!user) {
    throw new Error('Tài khoản hoặc mật khẩu không chính xác.');
  }

  const isValid = verifyPassword(password, user.password_hash);
  if (!isValid) {
    throw new Error('Tài khoản hoặc mật khẩu không chính xác.');
  }

  return {
    id: user.id,
    username: user.username,
    display_name: user.display_name,
    role: user.role
  };
}

module.exports = {
  ensureAppUserSchema,
  registerAppUser,
  loginAppUser
};
