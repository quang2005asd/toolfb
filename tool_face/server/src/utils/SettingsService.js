const { sql, getPool } = require('../../config/db');

async function ensureSettingsTable() {
  const pool = await getPool();
  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'SystemSettings')
    BEGIN
      CREATE TABLE dbo.SystemSettings (
        setting_key VARCHAR(100) PRIMARY KEY,
        setting_value NVARCHAR(MAX),
        updated_at DATETIME2 DEFAULT SYSDATETIME()
      );
    END
  `);
}

async function getSettings() {
  await ensureSettingsTable();
  const pool = await getPool();
  const result = await pool.request().query('SELECT setting_key, setting_value FROM dbo.SystemSettings');
  const settings = {};
  for (const row of result.recordset) {
    try {
      settings[row.setting_key] = JSON.parse(row.setting_value);
    } catch {
      settings[row.setting_key] = row.setting_value;
    }
  }
  return settings;
}

async function saveSetting(key, value) {
  await ensureSettingsTable();
  const pool = await getPool();
  const serialized = typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');
  await pool.request()
    .input('key', sql.VarChar(100), key)
    .input('value', sql.NVarChar(sql.MAX), serialized)
    .query(`
      MERGE dbo.SystemSettings AS target
      USING (SELECT @key AS setting_key) AS source
      ON target.setting_key = source.setting_key
      WHEN MATCHED THEN
        UPDATE SET setting_value = @value, updated_at = SYSDATETIME()
      WHEN NOT MATCHED THEN
        INSERT (setting_key, setting_value, updated_at)
        VALUES (@key, @value, SYSDATETIME());
    `);
}

async function saveMultipleSettings(settingsObj) {
  for (const [key, value] of Object.entries(settingsObj)) {
    if (value !== undefined) {
      await saveSetting(key, value);
    }
  }
}

module.exports = {
  getSettings,
  saveSetting,
  saveMultipleSettings
};
