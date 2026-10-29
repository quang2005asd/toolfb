const { sql, getPool } = require('../../config/db');

let tablePromise;

async function ensureChannelGroupsTable() {
  if (!tablePromise) {
    tablePromise = getPool().then((pool) => pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ChannelGroups')
      BEGIN
        CREATE TABLE dbo.ChannelGroups (
          id INT IDENTITY(1,1) PRIMARY KEY,
          user_id VARCHAR(64) NOT NULL,
          name NVARCHAR(100) NOT NULL,
          color VARCHAR(30) NULL CONSTRAINT DF_ChannelGroups_color DEFAULT '#00f2fe',
          page_ids NVARCHAR(MAX) NOT NULL,
          created_at DATETIME2 NOT NULL CONSTRAINT DF_ChannelGroups_created DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2 NOT NULL CONSTRAINT DF_ChannelGroups_updated DEFAULT SYSUTCDATETIME()
        );
      END;
      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ChannelGroups_user' AND object_id = OBJECT_ID('dbo.ChannelGroups'))
      BEGIN
        CREATE INDEX IX_ChannelGroups_user ON dbo.ChannelGroups(user_id, updated_at DESC);
      END;
    `)).catch((err) => {
      tablePromise = null;
      throw err;
    });
  }
  return tablePromise;
}

async function getGroups(userId) {
  await ensureChannelGroupsTable();
  const pool = await getPool();
  const result = await pool.request()
    .input('userId', sql.VarChar(64), String(userId))
    .query('SELECT id, user_id, name, color, page_ids, created_at, updated_at FROM dbo.ChannelGroups WHERE user_id = @userId ORDER BY updated_at DESC');

  return result.recordset.map((row) => {
    let pageIds = [];
    try {
      pageIds = JSON.parse(row.page_ids);
    } catch {
      pageIds = String(row.page_ids || '').split(',').map((s) => s.trim()).filter(Boolean);
    }
    return {
      id: row.id,
      name: row.name,
      color: row.color || '#00f2fe',
      pageIds: Array.isArray(pageIds) ? pageIds : [],
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  });
}

async function createGroup(userId, { name, color = '#00f2fe', pageIds = [] }) {
  await ensureChannelGroupsTable();
  const pool = await getPool();
  const serialized = JSON.stringify(Array.isArray(pageIds) ? pageIds : []);
  const cleanName = String(name || '').trim().slice(0, 100);

  const result = await pool.request()
    .input('userId', sql.VarChar(64), String(userId))
    .input('name', sql.NVarChar(100), cleanName)
    .input('color', sql.VarChar(30), String(color || '#00f2fe').slice(0, 30))
    .input('pageIds', sql.NVarChar(sql.MAX), serialized)
    .query(`
      INSERT INTO dbo.ChannelGroups (user_id, name, color, page_ids, created_at, updated_at)
      OUTPUT INSERTED.id, INSERTED.name, INSERTED.color, INSERTED.page_ids, INSERTED.created_at, INSERTED.updated_at
      VALUES (@userId, @name, @color, @pageIds, SYSUTCDATETIME(), SYSUTCDATETIME());
    `);

  const row = result.recordset[0];
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    pageIds: JSON.parse(row.page_ids),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function updateGroup(userId, id, { name, color, pageIds }) {
  await ensureChannelGroupsTable();
  const pool = await getPool();
  const serialized = JSON.stringify(Array.isArray(pageIds) ? pageIds : []);
  const cleanName = String(name || '').trim().slice(0, 100);

  const result = await pool.request()
    .input('id', sql.Int, parseInt(id, 10))
    .input('userId', sql.VarChar(64), String(userId))
    .input('name', sql.NVarChar(100), cleanName)
    .input('color', sql.VarChar(30), String(color || '#00f2fe').slice(0, 30))
    .input('pageIds', sql.NVarChar(sql.MAX), serialized)
    .query(`
      UPDATE dbo.ChannelGroups
      SET name = @name, color = @color, page_ids = @pageIds, updated_at = SYSUTCDATETIME()
      OUTPUT INSERTED.id, INSERTED.name, INSERTED.color, INSERTED.page_ids, INSERTED.created_at, INSERTED.updated_at
      WHERE id = @id AND user_id = @userId;
    `);

  if (result.recordset.length === 0) return null;
  const row = result.recordset[0];
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    pageIds: JSON.parse(row.page_ids),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function deleteGroup(userId, id) {
  await ensureChannelGroupsTable();
  const pool = await getPool();
  const result = await pool.request()
    .input('id', sql.Int, parseInt(id, 10))
    .input('userId', sql.VarChar(64), String(userId))
    .query('DELETE FROM dbo.ChannelGroups WHERE id = @id AND user_id = @userId');

  return result.rowsAffected[0] > 0;
}

module.exports = {
  getGroups,
  createGroup,
  updateGroup,
  deleteGroup
};
