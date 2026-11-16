/**
 * CommentAiSchema.js
 * Tự tạo các bảng của module "AI Bình luận" khi chạy (SQLite hoặc SQL Server), nên không cần sửa
 * config/sqliteAdapter.js hay scripts/init-db.sql. Mỗi câu lệnh gửi riêng một lần để adapter xử lý đúng.
 */
const { getPool } = require('../../config/db');

let schemaPromise = null;

const STATEMENTS = [
  `IF OBJECT_ID(N'dbo.CommentAiPageSettings', N'U') IS NULL
   BEGIN
     CREATE TABLE dbo.CommentAiPageSettings (
       page_id varchar(64) NOT NULL PRIMARY KEY,
       ai_enabled bit NOT NULL DEFAULT 0,
       require_approval bit NOT NULL DEFAULT 0,
       only_templates bit NOT NULL DEFAULT 0,
       tone nvarchar(max) NULL,
       shop_info nvarchar(max) NULL,
       vars_json nvarchar(max) NULL,
       lead_rules_json nvarchar(max) NULL,
       poll_since datetime2 NULL,
       updated_by nvarchar(120) NULL,
       updated_at datetime2 NULL
     );
   END`,
  `IF OBJECT_ID(N'dbo.CommentAiTemplates', N'U') IS NULL
   BEGIN
     CREATE TABLE dbo.CommentAiTemplates (
       id int IDENTITY(1,1) PRIMARY KEY,
       page_id varchar(64) NOT NULL,
       name nvarchar(120) NOT NULL,
       keywords nvarchar(500) NULL,
       content nvarchar(max) NOT NULL,
       mode varchar(10) NOT NULL DEFAULT 'guided',
       active bit NOT NULL DEFAULT 1,
       status varchar(10) NOT NULL DEFAULT 'approved',
       approved_by nvarchar(120) NULL,
       review_note nvarchar(300) NULL,
       created_by nvarchar(120) NULL,
       updated_by nvarchar(120) NULL,
       created_at datetime2 NULL,
       updated_at datetime2 NULL
     );
     CREATE INDEX IX_CommentAiTemplates_page ON dbo.CommentAiTemplates(page_id);
   END`,
  `IF OBJECT_ID(N'dbo.CommentAiLogs', N'U') IS NULL
   BEGIN
     CREATE TABLE dbo.CommentAiLogs (
       id int IDENTITY(1,1) PRIMARY KEY,
       page_id varchar(64) NOT NULL,
       kind varchar(30) NOT NULL,
       post_id varchar(100) NULL,
       comment_id varchar(100) NULL,
       actor_id varchar(100) NULL,
       actor_name nvarchar(255) NULL,
       message nvarchar(max) NULL,
       reply nvarchar(max) NULL,
       status varchar(20) NOT NULL DEFAULT 'done',
       error nvarchar(max) NULL,
       sentiment varchar(20) NULL,
       template_id int NULL,
       template_name nvarchar(120) NULL,
       created_at datetime2 NULL
     );
     CREATE INDEX IX_CommentAiLogs_page_created ON dbo.CommentAiLogs(page_id, created_at DESC);
     CREATE UNIQUE INDEX UX_CommentAiLogs_comment ON dbo.CommentAiLogs(comment_id, kind) WHERE comment_id IS NOT NULL;
   END`,
  `IF OBJECT_ID(N'dbo.CommentAiCustomers', N'U') IS NULL
   BEGIN
     CREATE TABLE dbo.CommentAiCustomers (
       id int IDENTITY(1,1) PRIMARY KEY,
       page_id varchar(64) NOT NULL,
       user_id varchar(100) NOT NULL,
       name nvarchar(255) NULL,
       phone varchar(30) NULL,
       address nvarchar(500) NULL,
       tags nvarchar(max) NULL,
       note nvarchar(max) NULL,
       comment_count int NOT NULL DEFAULT 0,
       last_sentiment varchar(20) NULL,
       last_comment_at datetime2 NULL,
       updated_by nvarchar(120) NULL,
       created_at datetime2 NULL,
       updated_at datetime2 NULL
     );
     CREATE UNIQUE INDEX UX_CommentAiCustomers_page_user ON dbo.CommentAiCustomers(page_id, user_id);
   END`,
  `IF OBJECT_ID(N'dbo.CommentAiLeads', N'U') IS NULL
   BEGIN
     CREATE TABLE dbo.CommentAiLeads (
       id int IDENTITY(1,1) PRIMARY KEY,
       page_id varchar(64) NOT NULL,
       group_id varchar(60) NULL,
       content nvarchar(max) NOT NULL,
       post_url varchar(500) NULL,
       profile_url varchar(500) NULL,
       posted_at datetime2 NULL,
       category varchar(10) NOT NULL DEFAULT 'unknown',
       manual bit NOT NULL DEFAULT 0,
       status varchar(12) NOT NULL DEFAULT 'new',
       assigned_to nvarchar(120) NULL,
       note nvarchar(max) NULL,
       updated_by nvarchar(120) NULL,
       created_at datetime2 NULL
     );
     CREATE INDEX IX_CommentAiLeads_page_cat ON dbo.CommentAiLeads(page_id, category, status);
     CREATE UNIQUE INDEX UX_CommentAiLeads_page_url ON dbo.CommentAiLeads(page_id, post_url) WHERE post_url IS NOT NULL;
   END`
];

// SQLite: tạo bảng trực tiếp tại đây (không cần sửa config/sqliteAdapter.js). Mỗi câu lệnh chạy riêng.
const SQLITE_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS CommentAiPageSettings (
    page_id TEXT PRIMARY KEY,
    ai_enabled INTEGER NOT NULL DEFAULT 0,
    require_approval INTEGER NOT NULL DEFAULT 0,
    only_templates INTEGER NOT NULL DEFAULT 0,
    tone TEXT,
    shop_info TEXT,
    vars_json TEXT,
    lead_rules_json TEXT,
    poll_since TEXT,
    updated_by TEXT,
    updated_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS CommentAiTemplates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    page_id TEXT NOT NULL,
    name TEXT NOT NULL,
    keywords TEXT,
    content TEXT NOT NULL,
    mode TEXT NOT NULL DEFAULT 'guided',
    active INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'approved',
    approved_by TEXT,
    review_note TEXT,
    created_by TEXT,
    updated_by TEXT,
    created_at TEXT,
    updated_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS CommentAiLogs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    page_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    post_id TEXT,
    comment_id TEXT,
    actor_id TEXT,
    actor_name TEXT,
    message TEXT,
    reply TEXT,
    status TEXT NOT NULL DEFAULT 'done',
    error TEXT,
    sentiment TEXT,
    template_id INTEGER,
    template_name TEXT,
    created_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS CommentAiCustomers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    page_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    name TEXT,
    phone TEXT,
    address TEXT,
    tags TEXT,
    note TEXT,
    comment_count INTEGER NOT NULL DEFAULT 0,
    last_sentiment TEXT,
    last_comment_at TEXT,
    updated_by TEXT,
    created_at TEXT,
    updated_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS CommentAiLeads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    page_id TEXT NOT NULL,
    group_id TEXT,
    content TEXT NOT NULL,
    post_url TEXT,
    profile_url TEXT,
    posted_at TEXT,
    category TEXT NOT NULL DEFAULT 'unknown',
    manual INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'new',
    assigned_to TEXT,
    note TEXT,
    updated_by TEXT,
    created_at TEXT
  )`,
  'CREATE INDEX IF NOT EXISTS IX_CommentAiTemplates_page ON CommentAiTemplates(page_id)',
  'CREATE INDEX IF NOT EXISTS IX_CommentAiLogs_page_created ON CommentAiLogs(page_id, created_at DESC)',
  'CREATE UNIQUE INDEX IF NOT EXISTS UX_CommentAiLogs_comment ON CommentAiLogs(comment_id, kind) WHERE comment_id IS NOT NULL',
  'CREATE UNIQUE INDEX IF NOT EXISTS UX_CommentAiCustomers_page_user ON CommentAiCustomers(page_id, user_id)',
  'CREATE INDEX IF NOT EXISTS IX_CommentAiLeads_page_cat ON CommentAiLeads(page_id, category, status)',
  'CREATE UNIQUE INDEX IF NOT EXISTS UX_CommentAiLeads_page_url ON CommentAiLeads(page_id, post_url) WHERE post_url IS NOT NULL'
];

const useSqlite = () => process.env.USE_SQLITE === 'true' || process.env.DB_TYPE === 'sqlite';

async function ensureCommentAiSchema() {
  if (!schemaPromise) {
    schemaPromise = getPool().then(async (pool) => {
      for (const statement of (useSqlite() ? SQLITE_STATEMENTS : STATEMENTS)) {
        await pool.request().query(statement);
      }
    }).catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
}

module.exports = { ensureCommentAiSchema };
