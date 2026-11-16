const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

test('SQLite initializes the focused schema and supports admin login', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'comment-ai-sqlite-test-'));
  process.env.USE_SQLITE = 'true';
  process.env.APP_DATA_DIR = dataDir;
  process.env.NODE_ENV = 'test';
  process.env.ADMIN_PASSWORD = 'sqlite-test-password';
  process.env.SESSION_SECRET = 'sqlite-test-session-secret'.padEnd(40, 'x');

  let pool;
  try {
    const { getPool } = require('../config/db');
    pool = await getPool();
    await require('../src/utils/CommentAiSchema').ensureCommentAiSchema();

    const user = await require('../src/utils/AuthUserService').loginAppUser({
      identifier: 'admin',
      password: process.env.ADMIN_PASSWORD
    });
    assert.equal(user.username, 'admin');

    const result = await pool.request().query(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    );
    const tableNames = result.recordset.map((row) => row.name);
    assert.deepEqual(tableNames, [
      'AppUsers',
      'CommentAiCustomers',
      'CommentAiLeads',
      'CommentAiLogs',
      'CommentAiPageSettings',
      'CommentAiTemplates',
      'ConnectedFbAccounts',
      'FacebookPages',
      'FacebookUsers',
      'SystemSettings'
    ]);
  } finally {
    if (pool) {
      await new Promise((resolve, reject) => {
        pool.db.close((error) => (error ? reject(error) : resolve()));
      });
    }
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
