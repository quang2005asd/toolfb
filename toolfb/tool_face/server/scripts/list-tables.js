require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { getPool } = require('../config/db');

async function listTables() {
  const pool = await getPool();
  const res = await pool.request().query("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE'");
  console.log('Tables in tool_face_db:', res.recordset.map(r => r.TABLE_NAME));
  process.exit(0);
}

listTables().catch(e => { console.error(e); process.exit(1); });

