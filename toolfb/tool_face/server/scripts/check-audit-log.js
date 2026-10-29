require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { getPool } = require('../config/db');

async function checkPostAuditLog() {
  const pool = await getPool();
  const cols = await pool.request().query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'PostAuditLog'");
  console.log('Columns in PostAuditLog:', cols.recordset.map(c => c.COLUMN_NAME));

  const logs519 = await pool.request().query("SELECT * FROM PostAuditLog WHERE post_id = 519");
  console.log('PostAuditLog for #519 count:', logs519.recordset.length);
  console.table(logs519.recordset);
  process.exit(0);
}

checkPostAuditLog().catch(e => { console.error(e); process.exit(1); });

