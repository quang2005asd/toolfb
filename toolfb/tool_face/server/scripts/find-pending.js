require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { getPool } = require('../config/db');

async function findPending() {
  const pool = await getPool();
  const res = await pool.request().query("SELECT id, page_id, SUBSTRING(content, 1, 50) as content, created_at, scheduled_at FROM Posts WHERE status = 'pending'");
  console.log('Pending post:', res.recordset[0]);
  process.exit(0);
}

findPending().catch(e => { console.error(e); process.exit(1); });

