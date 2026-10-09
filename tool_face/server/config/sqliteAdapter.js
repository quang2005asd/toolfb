/**
 * sqliteAdapter.js
 * Cung cấp adapter tương thích 100% với mssql (pool.request().input().query())
 * Giúp ứng dụng chạy không cần cài đặt SQL Server hay cấu hình kết nối.
 */

const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

// Đường dẫn file SQLite: ưu tiên APP_DATA_DIR (nếu đóng gói Electron), nếu không thì server/data
const defaultDataDir = path.resolve(__dirname, '../data');
const dataDir = process.env.APP_DATA_DIR || defaultDataDir;

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbFilePath = path.join(dataDir, 'tool_face.sqlite');

let dbInstance = null;
let initPromise = null;

// Fake SQL Types tương thích với cú pháp của thư viện `mssql`
const sqlTypes = {
  VarChar: (len) => ({ type: 'VarChar', len }),
  NVarChar: (len) => ({ type: 'NVarChar', len }),
  Int: { type: 'Int' },
  BigInt: { type: 'BigInt' },
  DateTime2: { type: 'DateTime2' },
  DateTime: { type: 'DateTime' },
  Date: { type: 'Date' },
  Bit: { type: 'Bit' },
  Float: { type: 'Float' },
  Text: { type: 'Text' },
  NText: { type: 'NText' },
  MAX: 'MAX'
};

// Đảm bảo sqlTypes.VarChar, sqlTypes.NVarChar vừa là hàm vừa dùng trực tiếp được
['VarChar', 'NVarChar', 'Text', 'NText'].forEach((type) => {
  sqlTypes[type] = function (len) {
    return { type, len };
  };
  sqlTypes[type].type = type;
});

const SCHEMA_DDL = `
CREATE TABLE IF NOT EXISTS Posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page_id TEXT NOT NULL,
  content TEXT NOT NULL,
  media_type TEXT NOT NULL DEFAULT 'text',
  media_links TEXT,
  media_thumb TEXT,
  scheduled_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  facebook_post_id TEXT,
  created_by_user_id INTEGER,
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  updated_at TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS PostComments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  comment_index INTEGER NOT NULL DEFAULT 1,
  content TEXT NOT NULL,
  delay_minutes INTEGER NOT NULL DEFAULT 0,
  media_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (post_id) REFERENCES Posts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS FacebookUsers (
  facebook_user_id TEXT PRIMARY KEY,
  display_name TEXT,
  user_access_token_encrypted TEXT,
  avatar_url TEXT,
  token_expires_at TEXT,
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  updated_at TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS ConnectedFbAccounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  app_user_id TEXT,
  fb_user_id TEXT,
  fb_name TEXT,
  fb_avatar TEXT,
  access_token_encrypted TEXT,
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  updated_at TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS FacebookPages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  facebook_user_id TEXT,
  page_id TEXT,
  page_name TEXT,
  name TEXT,
  category TEXT,
  page_link TEXT,
  page_access_token_encrypted TEXT,
  tasks_json TEXT,
  fb_account_id TEXT,
  fb_account_name TEXT,
  fb_account_avatar TEXT,
  is_valid INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  updated_at TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS SystemSettings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT,
  updated_at TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS ChannelGroups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  name TEXT NOT NULL,
  color TEXT,
  page_ids TEXT,
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  updated_at TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS AppUsers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  email TEXT,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  status TEXT NOT NULL DEFAULT 'active',
  created_by INTEGER,
  last_login_at TEXT,
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  updated_at TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS AiConversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  messages_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  updated_at TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS AiGeneratedDrafts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  batch_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  hashtags TEXT NOT NULL DEFAULT '[]',
  suggested_time TEXT NOT NULL DEFAULT '',
  topic TEXT NOT NULL DEFAULT '',
  tone TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  selected_page_ids TEXT NOT NULL DEFAULT '[]',
  scheduled_at TEXT,
  original_prompt TEXT NOT NULL DEFAULT '',
  media_type TEXT NOT NULL DEFAULT 'text',
  media_links TEXT NOT NULL DEFAULT '[]',
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  updated_at TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS IX_Posts_status_scheduled ON Posts(status, scheduled_at DESC);
CREATE INDEX IF NOT EXISTS IX_PostComments_post_id ON PostComments(post_id);
CREATE INDEX IF NOT EXISTS IX_FacebookPages_page_id ON FacebookPages(page_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS IX_AppUsers_username ON AppUsers(username);
CREATE INDEX IF NOT EXISTS IX_AiConversations_user_updated ON AiConversations(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS IX_AiDrafts_user_batch ON AiGeneratedDrafts(user_id, batch_id);
CREATE INDEX IF NOT EXISTS IX_AiDrafts_user_status ON AiGeneratedDrafts(user_id, status);
`;

// Bổ sung cột mới cho các CSDL đã được tạo từ phiên bản cũ (CREATE TABLE IF NOT EXISTS không tự thêm cột)
const COLUMN_MIGRATIONS = {
  AppUsers: {
    email: 'TEXT',
    status: "TEXT NOT NULL DEFAULT 'active'",
    created_by: 'INTEGER',
    last_login_at: 'TEXT'
  }
};

const POST_MIGRATION_DDL = `
CREATE UNIQUE INDEX IF NOT EXISTS UX_AppUsers_email ON AppUsers(email) WHERE email IS NOT NULL;
`;

function runSqlite(db, method, statement, params = []) {
  return new Promise((resolve, reject) => {
    db[method](statement, params, (err, result) => (err ? reject(err) : resolve(result)));
  });
}

async function migrateColumns(db) {
  for (const [table, columns] of Object.entries(COLUMN_MIGRATIONS)) {
    const existing = new Set((await runSqlite(db, 'all', `PRAGMA table_info(${table})`)).map((column) => column.name));
    for (const [column, definition] of Object.entries(columns)) {
      if (!existing.has(column)) {
        try {
          await runSqlite(db, 'run', `ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
          console.log(`[SQLite Migration] Đã thêm cột ${table}.${column}`);
        } catch (err) {
          // Server và worker dùng chung file CSDL nên tiến trình kia có thể đã thêm cột trước
          if (!/duplicate column name/i.test(err.message)) throw err;
        }
      }
    }
  }
  await new Promise((resolve, reject) => db.exec(POST_MIGRATION_DDL, (err) => (err ? reject(err) : resolve())));
}

function getSqliteDb() {
  if (!dbInstance) {
    dbInstance = new sqlite3.Database(dbFilePath);
    // Chờ thay vì báo lỗi SQLITE_BUSY khi server và worker cùng ghi vào file
    dbInstance.configure('busyTimeout', 5000);
  }
  return dbInstance;
}

function initSqliteDatabase() {
  if (!initPromise) {
    initPromise = new Promise((resolve, reject) => {
      const db = getSqliteDb();
      db.exec(SCHEMA_DDL, (err) => {
        if (err) {
          console.error('[SQLite] Lỗi khởi tạo bảng ban đầu:', err);
          return reject(err);
        }
        console.log(`[SQLite] Đã kết nối và khởi tạo CSDL thành công tại: ${dbFilePath}`);

        migrateColumns(db).then(() => resolve(db), (migrationErr) => {
          console.error('[SQLite] Lỗi migration cột:', migrationErr);
          reject(migrationErr);
        });

        // Tự động chuyển đổi các bản ghi cũ nếu có scheduled_at dạng epoch float sang chuẩn ISO 8601
        db.all("SELECT id, scheduled_at FROM Posts WHERE scheduled_at LIKE '%.0'", (migErr, rows) => {
          if (!migErr && rows && rows.length > 0) {
            for (const r of rows) {
              const num = Number(r.scheduled_at);
              if (!Number.isNaN(num) && num > 0) {
                db.run("UPDATE Posts SET scheduled_at = ? WHERE id = ?", [new Date(num).toISOString(), r.id]);
              }
            }
            console.log(`[SQLite Migration] Đã chuẩn hóa ${rows.length} bài viết sang định dạng ngày giờ chuẩn ISO.`);
          }
        });
      });
    });
  }
  return initPromise;
}

/**
 * Hàm biên dịch câu lệnh T-SQL sang cú pháp tương thích SQLite
 */
function translateQuery(originalQuery) {
  let q = originalQuery.trim().replace(/;+\s*$/, '');

  // 1. Kiểm tra nếu là câu lệnh kiểm tra schema T-SQL (IF OBJECT_ID, sys.tables, COL_LENGTH, sys.indexes)
  const isSchemaCheck =
    /IF\s+(NOT\s+)?EXISTS\s*\(\s*SELECT\s+.*FROM\s+sys\./i.test(q) ||
    /IF\s+OBJECT_ID/i.test(q) ||
    /IF\s+COL_LENGTH/i.test(q) ||
    /COL_LENGTH\s*\(/i.test(q);

  if (isSchemaCheck) {
    return { isNoOp: true };
  }

  // 2. Chuyển đổi lệnh MERGE SystemSettings
  if (/MERGE\s+(dbo\.)?SystemSettings/i.test(q)) {
    return {
      sql: `INSERT INTO SystemSettings (setting_key, setting_value, updated_at)
            VALUES (@key, @value, datetime('now', 'localtime'))
            ON CONFLICT(setting_key) DO UPDATE SET
              setting_value = excluded.setting_value,
              updated_at = datetime('now', 'localtime');`
    };
  }

  // Chuyển đổi lệnh MERGE AiConversations
  if (/MERGE\s+(dbo\.)?AiConversations/i.test(q)) {
    return {
      sql: `INSERT INTO AiConversations (id, user_id, title, messages_json, created_at, updated_at)
            VALUES (@id, @user_id, @title, @messages_json, datetime('now', 'localtime'), datetime('now', 'localtime'))
            ON CONFLICT(id) DO UPDATE SET
              title = excluded.title,
              messages_json = excluded.messages_json,
              updated_at = datetime('now', 'localtime');`
    };
  }

  // 3. Xử lý mẫu UPSERT: UPDATE ... WHERE ...; IF @@ROWCOUNT = 0 INSERT INTO ...
  const rowCountMatch = q.match(/([\s\S]+?);\s*IF\s+@@ROWCOUNT\s*=\s*0\s+([\s\S]+)/i);
  if (rowCountMatch) {
    const updateT = translateQuery(rowCountMatch[1]);
    const insertT = translateQuery(rowCountMatch[2]);
    return {
      isUpsertRowCount: true,
      updateSql: updateT.sql,
      insertSql: insertT.sql
    };
  }

  // 4. Xoá tiền tố schema dbo.
  q = q.replace(/\bdbo\./gi, '');

  // 5. Chuyển hàm ngày giờ T-SQL
  // Nếu là so sánh bất đẳng thức cột (<, <=, >, >=) SYSUTCDATETIME() -> dùng strftime('%s') để so sánh mốc giây tuyệt đối
  q = q.replace(/([a-zA-Z0-9_.]+)\s*(<=|<|>=|>)\s*(?:SYSUTCDATETIME|GETDATE|SYSDATETIME)\s*\(\s*\)/gi, "(strftime('%s', $1) $2 strftime('%s', 'now'))");
  q = q.replace(/\b(GETDATE|SYSDATETIME|SYSUTCDATETIME)\s*\(\s*\)/gi, "datetime('now', 'localtime')");

  // 6. Chuyển đổi DATEDIFF(second, col, SYSUTCDATETIME()) sang cú pháp tính giây trong SQLite
  q = q.replace(/DATEDIFF\s*\(\s*second\s*,\s*([^,]+)\s*,\s*(?:SYSUTCDATETIME|GETDATE|SYSDATETIME)\s*\(\s*\)\s*\)/gi, "(strftime('%s', 'now') - strftime('%s', $1))");
  q = q.replace(/DATEDIFF\s*\(\s*second\s*,\s*([^,]+)\s*,\s*([^)]+)\)/gi, "(strftime('%s', $2) - strftime('%s', $1))");

  // 7. Chuyển đổi chuỗi N'...' thành '...'
  q = q.replace(/\bN'([^']*)'/g, "'$1'");

  // 8. Chuyển đổi SELECT TOP N
  const topMatch = q.match(/SELECT\s+TOP\s+(\d+)\s+/i);
  let limitCount = null;
  if (topMatch) {
    limitCount = topMatch[1];
    q = q.replace(/SELECT\s+TOP\s+\d+\s+/i, 'SELECT ');
  }

  // 9. Chuyển đổi OUTPUT INSERTED.<cols> sang RETURNING <cols>
  // Case A: INSERT INTO ... OUTPUT INSERTED.id VALUES (...)
  const insertOutputMatch = q.match(/INSERT\s+INTO\s+([^(]+)\s*\(([^)]+)\)\s+OUTPUT\s+([\s\S]+?)\s+VALUES\s*\(([\s\S]+)\)/i);
  if (insertOutputMatch) {
    const table = insertOutputMatch[1].trim();
    const cols = insertOutputMatch[2].trim();
    const retCols = insertOutputMatch[3].replace(/INSERTED\./gi, '').trim();
    const vals = insertOutputMatch[4].trim().replace(/;+\s*$/, '');
    q = `INSERT INTO ${table} (${cols}) VALUES (${vals}) RETURNING ${retCols}`;
  } else {
    // Case B: UPDATE ... OUTPUT INSERTED.id WHERE ...
    const updateOutputMatch = q.match(/UPDATE\s+([\s\S]+?)\s+SET\s+([\s\S]+?)\s+OUTPUT\s+([\s\S]+?)\s+WHERE\s+([\s\S]+)/i);
    if (updateOutputMatch) {
      const table = updateOutputMatch[1].trim();
      const setClause = updateOutputMatch[2].trim();
      const retCols = updateOutputMatch[3].replace(/INSERTED\./gi, '').trim();
      const whereClause = updateOutputMatch[4].trim().replace(/;+\s*$/, '');
      q = `UPDATE ${table} SET ${setClause} WHERE ${whereClause} RETURNING ${retCols}`;
    }
  }

  // Nếu có SELECT TOP N thì gắn thêm LIMIT N vào cuối (nếu chưa có LIMIT)
  if (limitCount && !/LIMIT\s+\d+/i.test(q)) {
    q = `${q} LIMIT ${limitCount}`;
  }

  // 10. Chuyển đổi phân trang SQL Server (OFFSET x ROWS FETCH NEXT y ROWS ONLY) sang SQLite (LIMIT y OFFSET x)
  const paginationMatch = q.match(/OFFSET\s+(@?\w+)\s+ROWS\s+FETCH\s+NEXT\s+(@?\w+)\s+ROWS\s+ONLY/i);
  if (paginationMatch) {
    const offsetVal = paginationMatch[1];
    const limitVal = paginationMatch[2];
    q = q.replace(/OFFSET\s+@?\w+\s+ROWS\s+FETCH\s+NEXT\s+@?\w+\s+ROWS\s+ONLY/i, `LIMIT ${limitVal} OFFSET ${offsetVal}`);
  }

  return { sql: q };
}

/**
 * Class Transaction giả lập tương thích mssql
 */
class SqliteTransaction {
  constructor(poolOrConnection) {
    this.pool = poolOrConnection;
    this.db = poolOrConnection?.db || getSqliteDb();
  }

  async begin() {
    return new Promise((resolve, reject) => {
      this.db.run('BEGIN TRANSACTION', (err) => {
        if (err && !err.message.includes('cannot start a transaction within a transaction')) {
          return reject(err);
        }
        resolve();
      });
    });
  }

  async commit() {
    return new Promise((resolve, reject) => {
      this.db.run('COMMIT', (err) => {
        if (err && !err.message.includes('cannot commit - no transaction is active')) {
          return reject(err);
        }
        resolve();
      });
    });
  }

  async rollback() {
    return new Promise((resolve, reject) => {
      this.db.run('ROLLBACK', (err) => {
        if (err && !err.message.includes('cannot rollback - no transaction is active')) {
          return reject(err);
        }
        resolve();
      });
    });
  }
}

function filterParamsForSql(sqlStr, allParams) {
  const filtered = {};
  for (const key of Object.keys(allParams)) {
    const escapedKey = key.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, '\\$1');
    if (new RegExp(escapedKey + '\\b', 'i').test(sqlStr)) {
      filtered[key] = allParams[key];
    }
  }
  return filtered;
}

/**
 * Class giả lập Request của mssql
 */
class SqliteRequest {
  constructor(connectionOrTransaction) {
    if (connectionOrTransaction && connectionOrTransaction.db) {
      this.db = connectionOrTransaction.db;
    } else {
      this.db = getSqliteDb();
    }
    this.parameters = {};
  }

  input(name, type, value) {
    // Nếu gọi theo dạng input(name, value)
    let actualValue = value;
    if (arguments.length === 2) {
      actualValue = type;
    }

    if (actualValue === undefined) {
      actualValue = null;
    } else if (typeof actualValue === 'boolean') {
      actualValue = actualValue ? 1 : 0;
    } else if (actualValue instanceof Date) {
      actualValue = actualValue.toISOString();
    }

    const cleanName = name.startsWith('@') ? name.slice(1) : name;
    this.parameters[`@${cleanName}`] = actualValue;
    return this;
  }

  async query(command) {
    const translated = translateQuery(command);

    if (translated.isNoOp) {
      return { recordset: [], rowsAffected: [0] };
    }

    // Xử lý mẫu UPSERT: UPDATE trước, nếu 0 rows affected thì INSERT
    if (translated.isUpsertRowCount) {
      const updateSql = translated.updateSql;
      const insertSql = translated.insertSql;
      const updateParams = filterParamsForSql(updateSql, this.parameters);
      const insertParams = filterParamsForSql(insertSql, this.parameters);

      return new Promise((resolve, reject) => {
        const self = this;
        this.db.run(updateSql, updateParams, function (updateErr) {
          if (updateErr) {
            console.error('[SQLite Upsert Update Error]:', updateErr.message, '\nSQL:', updateSql);
            return reject(updateErr);
          }
          if (this.changes > 0) {
            return resolve({ recordset: [], rowsAffected: [this.changes] });
          }
          // Chạy tiếp phần INSERT nếu chưa có bản ghi nào
          self.db.run(insertSql, insertParams, function (insertErr) {
            if (insertErr) {
              console.error('[SQLite Upsert Insert Error]:', insertErr.message, '\nSQL:', insertSql);
              return reject(insertErr);
            }
            return resolve({ recordset: [], rowsAffected: [this.changes || 1] });
          });
        });
      });
    }

    const sqlStr = translated.sql;
    const isSelectOrReturning = /^\s*SELECT\b/i.test(sqlStr) || /\bRETURNING\b/i.test(sqlStr);
    const execParams = filterParamsForSql(sqlStr, this.parameters);

    return new Promise((resolve, reject) => {
      if (isSelectOrReturning) {
        this.db.all(sqlStr, execParams, (err, rows) => {
          if (err) {
            console.error('[SQLite Query Error]:', err.message, '\nSQL:', sqlStr);
            return reject(err);
          }
          const recordset = rows || [];
          for (const row of recordset) {
            if (row && typeof row === 'object') {
              if (row.scheduled_at && typeof row.scheduled_at === 'string' && /^\d+(\.\d+)?$/.test(row.scheduled_at)) {
                const d = new Date(Number(row.scheduled_at));
                if (!Number.isNaN(d.getTime())) row.scheduled_at = d.toISOString();
              }
              if (row.created_at && typeof row.created_at === 'string' && /^\d+(\.\d+)?$/.test(row.created_at)) {
                const d = new Date(Number(row.created_at));
                if (!Number.isNaN(d.getTime())) row.created_at = d.toISOString();
              }
            }
          }
          resolve({
            recordset,
            rowsAffected: [recordset.length]
          });
        });
      } else {
        this.db.run(sqlStr, execParams, function (err) {
          if (err) {
            console.error('[SQLite Exec Error]:', err.message, '\nSQL:', sqlStr);
            return reject(err);
          }
          resolve({
            recordset: [],
            rowsAffected: [this.changes || 0]
          });
        });
      }
    });
  }
}

class SqlitePool {
  constructor(db) {
    this.db = db;
  }

  request() {
    return new SqliteRequest(this);
  }
}

async function getSqlitePool() {
  const db = await initSqliteDatabase();
  return new SqlitePool(db);
}

sqlTypes.Transaction = SqliteTransaction;
sqlTypes.Request = SqliteRequest;

module.exports = {
  sql: sqlTypes,
  getPool: getSqlitePool,
  initSqliteDatabase
};
