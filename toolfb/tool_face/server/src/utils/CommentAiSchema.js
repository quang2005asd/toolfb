/**
 * CommentAiSchema.js
 * Tự tạo các bảng của module "AI Bình luận" khi chạy (SQLite hoặc SQL Server).
 * Mỗi câu lệnh gửi riêng một lần để adapter xử lý đúng.
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
       ai_instruction nvarchar(max) NULL,
       vars_json nvarchar(max) NULL,
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
       post_context_available bit NULL,
       created_at datetime2 NULL
     );
     CREATE INDEX IX_CommentAiLogs_page_created ON dbo.CommentAiLogs(page_id, created_at DESC);
     CREATE UNIQUE INDEX UX_CommentAiLogs_comment ON dbo.CommentAiLogs(comment_id, kind) WHERE comment_id IS NOT NULL;
   END`,
  `IF COL_LENGTH(N'dbo.CommentAiLogs', N'post_context_available') IS NULL
     ALTER TABLE dbo.CommentAiLogs ADD post_context_available bit NULL;`,
  `IF COL_LENGTH(N'dbo.CommentAiTemplates', N'ai_instruction') IS NULL
     ALTER TABLE dbo.CommentAiTemplates ADD ai_instruction nvarchar(max) NULL;
   IF COL_LENGTH(N'dbo.CommentAiTemplates', N'vars_json') IS NULL
     ALTER TABLE dbo.CommentAiTemplates ADD vars_json nvarchar(max) NULL;`,
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
   END`,
  `IF OBJECT_ID(N'dbo.PageReplies', N'U') IS NULL
   BEGIN
     CREATE TABLE dbo.PageReplies (
       comment_id varchar(100) NOT NULL PRIMARY KEY,
       page_id varchar(64) NOT NULL,
       parent_id varchar(100) NOT NULL,
       created_at datetime2 NOT NULL DEFAULT SYSUTCDATETIME()
     );
     CREATE INDEX IX_PageReplies_page_parent ON dbo.PageReplies(page_id, parent_id);
   END`,
  `IF OBJECT_ID(N'dbo.CommentAiProcessedComments', N'U') IS NULL
   BEGIN
     CREATE TABLE dbo.CommentAiProcessedComments (
       page_id varchar(64) NOT NULL,
       comment_id varchar(100) NOT NULL,
       status varchar(20) NOT NULL,
       reason nvarchar(max) NULL,
       source varchar(20) NULL,
       name_source varchar(20) NULL,
       processed_at datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
       CONSTRAINT PK_CommentAiProcessedComments PRIMARY KEY (page_id, comment_id)
     );
   END
   IF COL_LENGTH(N'dbo.CommentAiProcessedComments', N'source') IS NULL
     ALTER TABLE dbo.CommentAiProcessedComments ADD source varchar(20) NULL;
   IF COL_LENGTH(N'dbo.CommentAiProcessedComments', N'name_source') IS NULL
     ALTER TABLE dbo.CommentAiProcessedComments ADD name_source varchar(20) NULL;`,
  `IF OBJECT_ID(N'dbo.CommentAiNameCache', N'U') IS NULL
   BEGIN
     CREATE TABLE dbo.CommentAiNameCache (
       page_id varchar(64) NOT NULL,
       comment_id varchar(100) NOT NULL,
       from_id varchar(100) NOT NULL,
       from_name nvarchar(255) NOT NULL,
       created_at datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
       CONSTRAINT PK_CommentAiNameCache PRIMARY KEY (page_id, comment_id)
     );
     CREATE INDEX IX_CommentAiNameCache_page_from ON dbo.CommentAiNameCache(page_id, from_id, created_at DESC);
   END`,
  `IF OBJECT_ID(N'dbo.CommentAiWebhookEvents', N'U') IS NULL
   BEGIN
     CREATE TABLE dbo.CommentAiWebhookEvents (
       id bigint IDENTITY(1,1) PRIMARY KEY,
       page_id varchar(64) NOT NULL,
       comment_id varchar(100) NULL,
       received_at datetime2 NOT NULL DEFAULT SYSUTCDATETIME()
     );
     CREATE INDEX IX_CommentAiWebhookEvents_page_received ON dbo.CommentAiWebhookEvents(page_id, received_at DESC);
   END`,
  `IF OBJECT_ID(N'dbo.CommentAiPostCache', N'U') IS NULL
   BEGIN
     CREATE TABLE dbo.CommentAiPostCache (
       page_id varchar(64) NOT NULL,
       post_id varchar(100) NOT NULL,
       message nvarchar(max) NOT NULL,
       fetched_at datetime2 NOT NULL,
       CONSTRAINT PK_CommentAiPostCache PRIMARY KEY (page_id, post_id)
     );
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
    ai_instruction TEXT,
    vars_json TEXT,
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
    post_context_available INTEGER,
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
  `CREATE TABLE IF NOT EXISTS PageReplies (
    comment_id TEXT PRIMARY KEY,
    page_id TEXT NOT NULL,
    parent_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS CommentAiProcessedComments (
    page_id TEXT NOT NULL,
    comment_id TEXT NOT NULL,
    status TEXT NOT NULL,
    reason TEXT,
    source TEXT,
    name_source TEXT,
    processed_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (page_id, comment_id)
  )`,
  `CREATE TABLE IF NOT EXISTS CommentAiNameCache (
    page_id TEXT NOT NULL,
    comment_id TEXT NOT NULL,
    from_id TEXT NOT NULL,
    from_name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (page_id, comment_id)
  )`,
  `CREATE TABLE IF NOT EXISTS CommentAiWebhookEvents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    page_id TEXT NOT NULL,
    comment_id TEXT,
    received_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS CommentAiPostCache (
    page_id TEXT NOT NULL,
    post_id TEXT NOT NULL,
    message TEXT NOT NULL,
    fetched_at TEXT NOT NULL,
    PRIMARY KEY (page_id, post_id)
  )`,
  'CREATE INDEX IF NOT EXISTS IX_CommentAiTemplates_page ON CommentAiTemplates(page_id)',
  'CREATE INDEX IF NOT EXISTS IX_CommentAiLogs_page_created ON CommentAiLogs(page_id, created_at DESC)',
  'CREATE UNIQUE INDEX IF NOT EXISTS UX_CommentAiLogs_comment ON CommentAiLogs(comment_id, kind) WHERE comment_id IS NOT NULL',
  'CREATE UNIQUE INDEX IF NOT EXISTS UX_CommentAiCustomers_page_user ON CommentAiCustomers(page_id, user_id)',
  'CREATE INDEX IF NOT EXISTS IX_CommentAiLeads_page_cat ON CommentAiLeads(page_id, category, status)',
  'CREATE UNIQUE INDEX IF NOT EXISTS UX_CommentAiLeads_page_url ON CommentAiLeads(page_id, post_url) WHERE post_url IS NOT NULL',
  'CREATE INDEX IF NOT EXISTS IX_PageReplies_page_parent ON PageReplies(page_id, parent_id)',
  'CREATE INDEX IF NOT EXISTS IX_CommentAiNameCache_page_from ON CommentAiNameCache(page_id, from_id, created_at DESC)',
  'CREATE INDEX IF NOT EXISTS IX_CommentAiWebhookEvents_page_received ON CommentAiWebhookEvents(page_id, received_at DESC)'
];

const useSqlite = () => process.env.USE_SQLITE === 'true' || process.env.DB_TYPE === 'sqlite';

async function ensureCommentAiSchema() {
  if (!schemaPromise) {
    schemaPromise = getPool().then(async (pool) => {
      for (const statement of (useSqlite() ? SQLITE_STATEMENTS : STATEMENTS)) {
        await pool.request().query(statement);
      }
      if (useSqlite()) {
        const logColumns = await pool.request().query("SELECT name FROM pragma_table_info('CommentAiLogs')");
        const existingLogColumns = new Set(logColumns.recordset.map((column) => column.name));
        if (!existingLogColumns.has('post_context_available')) {
          await pool.request().query('ALTER TABLE CommentAiLogs ADD COLUMN post_context_available INTEGER');
        }
        const templateColumns = await pool.request().query("SELECT name FROM pragma_table_info('CommentAiTemplates')");
        const existingTemplateColumns = new Set(templateColumns.recordset.map((column) => column.name));
        for (const column of ['ai_instruction', 'vars_json']) {
          if (!existingTemplateColumns.has(column)) {
            await pool.request().query(`ALTER TABLE CommentAiTemplates ADD COLUMN ${column} TEXT`);
          }
        }
        const processedColumns = await pool.request().query("SELECT name FROM pragma_table_info('CommentAiProcessedComments')");
        const existingColumns = new Set(processedColumns.recordset.map((column) => column.name));
        for (const column of ['source', 'name_source']) {
          if (!existingColumns.has(column)) {
            await pool.request().query(`ALTER TABLE CommentAiProcessedComments ADD COLUMN ${column} TEXT`);
          }
        }
      }
    }).catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
}

module.exports = { ensureCommentAiSchema };
