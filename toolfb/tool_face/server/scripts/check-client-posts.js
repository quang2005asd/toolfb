require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { getPool } = require('../config/db');

async function check() {
  const pool = await getPool();
  const res = await pool.request().query(
    "SELECT id, page_id, SUBSTRING(content, 1, 40) as preview, status, scheduled_at, published_at, facebook_post_id, created_at, created_by_user_id " +
    "FROM Posts WHERE page_id IN ('1383891371465269', '1406154479236872') ORDER BY id ASC"
  );
  console.log('Posts count for client pages:', res.recordset.length);
  console.table(res.recordset);

  // Check how 519 was created
  const p519 = await pool.request().query("SELECT * FROM Posts WHERE id = 519");
  console.log('Post 519 full:', p519.recordset[0]);

  process.exit(0);
}
check().catch(e => { console.error(e); process.exit(1); });
