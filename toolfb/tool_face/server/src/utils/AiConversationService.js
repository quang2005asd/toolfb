const crypto = require('crypto');
const { sql, getPool } = require('../../config/db');

let schemaPromise = null;

async function ensureSchema() {
  if (!schemaPromise) {
    schemaPromise = getPool().then(async (pool) => {
      await pool.request().query(`
        IF OBJECT_ID(N'dbo.AiConversations', N'U') IS NULL
        BEGIN
          CREATE TABLE dbo.AiConversations (
            id varchar(64) NOT NULL PRIMARY KEY,
            user_id varchar(64) NOT NULL,
            title nvarchar(255) NOT NULL,
            messages_json nvarchar(MAX) NOT NULL CONSTRAINT DF_AiConversations_messages DEFAULT '[]',
            created_at datetime2 NOT NULL CONSTRAINT DF_AiConversations_created DEFAULT SYSUTCDATETIME(),
            updated_at datetime2 NOT NULL CONSTRAINT DF_AiConversations_updated DEFAULT SYSUTCDATETIME()
          );
          CREATE INDEX IX_AiConversations_user_updated ON dbo.AiConversations (user_id, updated_at DESC);
        END;
      `);
    });
  }
  return schemaPromise;
}

function generateId() {
  return 'conv_' + Date.now().toString(36) + '_' + crypto.randomBytes(4).toString('hex');
}

async function listConversations(userId) {
  await ensureSchema();
  const pool = await getPool();
  const result = await pool.request()
    .input('user_id', sql.VarChar(64), String(userId))
    .query(`
      SELECT id, user_id, title, messages_json, created_at, updated_at
      FROM dbo.AiConversations
      WHERE user_id = @user_id
      ORDER BY updated_at DESC
    `);

  return result.recordset.map((row) => {
    let messages = [];
    try {
      messages = JSON.parse(row.messages_json || '[]');
    } catch {
      messages = [];
    }
    const lastMsg = messages[messages.length - 1];
    return {
      id: row.id,
      title: row.title,
      created_at: row.created_at,
      updated_at: row.updated_at,
      message_count: messages.length,
      last_preview: lastMsg ? String(lastMsg.content || lastMsg.text || '').slice(0, 80) : ''
    };
  });
}

async function getConversation(userId, conversationId) {
  await ensureSchema();
  const pool = await getPool();
  const result = await pool.request()
    .input('user_id', sql.VarChar(64), String(userId))
    .input('id', sql.VarChar(64), String(conversationId))
    .query(`
      SELECT id, user_id, title, messages_json, created_at, updated_at
      FROM dbo.AiConversations
      WHERE id = @id AND user_id = @user_id
    `);

  if (!result.recordset.length) return null;
  const row = result.recordset[0];
  let messages = [];
  try {
    messages = JSON.parse(row.messages_json || '[]');
  } catch {
    messages = [];
  }
  return {
    id: row.id,
    title: row.title,
    messages,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

async function saveConversation(userId, { id, title, messages }) {
  await ensureSchema();
  const pool = await getPool();
  const convId = id || generateId();
  const safeTitle = String(title || 'Cuộc trò chuyện mới').slice(0, 255);
  const messagesJson = JSON.stringify(Array.isArray(messages) ? messages : []);

  await pool.request()
    .input('id', sql.VarChar(64), convId)
    .input('user_id', sql.VarChar(64), String(userId))
    .input('title', sql.NVarChar(255), safeTitle)
    .input('messages_json', sql.NVarChar(sql.MAX), messagesJson)
    .query(`
      MERGE dbo.AiConversations AS target
      USING (SELECT @id AS id, @user_id AS user_id) AS source
      ON target.id = source.id AND target.user_id = source.user_id
      WHEN MATCHED THEN
        UPDATE SET
          title = @title,
          messages_json = @messages_json,
          updated_at = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN
        INSERT (id, user_id, title, messages_json, created_at, updated_at)
        VALUES (@id, @user_id, @title, @messages_json, SYSUTCDATETIME(), SYSUTCDATETIME());
    `);

  return { id: convId, title: safeTitle };
}

async function deleteConversation(userId, conversationId) {
  await ensureSchema();
  const pool = await getPool();
  const result = await pool.request()
    .input('user_id', sql.VarChar(64), String(userId))
    .input('id', sql.VarChar(64), String(conversationId))
    .query(`
      DELETE FROM dbo.AiConversations
      WHERE id = @id AND user_id = @user_id
    `);
  return result.rowsAffected[0] > 0;
}

async function renameConversation(userId, conversationId, title) {
  await ensureSchema();
  const pool = await getPool();
  const safeTitle = String(title || 'Cuộc trò chuyện').slice(0, 255);
  const result = await pool.request()
    .input('user_id', sql.VarChar(64), String(userId))
    .input('id', sql.VarChar(64), String(conversationId))
    .input('title', sql.NVarChar(255), safeTitle)
    .query(`
      UPDATE dbo.AiConversations
      SET title = @title, updated_at = SYSUTCDATETIME()
      WHERE id = @id AND user_id = @user_id
    `);
  return result.rowsAffected[0] > 0;
}

module.exports = {
  listConversations,
  getConversation,
  saveConversation,
  deleteConversation,
  renameConversation
};
