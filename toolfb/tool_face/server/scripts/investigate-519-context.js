require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { getPool, sql } = require('../config/db');

async function main() {
  const pool = await getPool();
  console.log('--- POSTS 515 TO 525 ---');
  const res = await pool.request().query(
    "SELECT id, page_id, SUBSTRING(content, 1, 50) as content, status, scheduled_at, created_at, created_by_user_id, facebook_post_id " +
    "FROM Posts WHERE id BETWEEN 515 AND 525 ORDER BY id ASC"
  );
  console.table(res.recordset);

  console.log('--- POST 519 COMPLETE RECORD ---');
  const p519 = await pool.request().query("SELECT * FROM Posts WHERE id = 519");
  console.log(JSON.stringify(p519.recordset[0], null, 2));

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

