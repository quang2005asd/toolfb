require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { getPool } = require('../config/db');

async function linkAdmin() {
  const pool = await getPool();
  const existing = await pool.request().query("SELECT * FROM FacebookPages WHERE facebook_user_id = '2' AND page_id = '1123490870843189'");
  if (existing.recordset.length === 0) {
    await pool.request().query(
      "INSERT INTO FacebookPages (facebook_user_id, page_id, page_name, category, page_link, page_access_token_encrypted, tasks_json, updated_at, fb_account_id, fb_account_name, fb_account_avatar, is_valid) " +
      "SELECT '2', page_id, page_name, category, page_link, page_access_token_encrypted, tasks_json, SYSUTCDATETIME(), fb_account_id, fb_account_name, fb_account_avatar, is_valid " +
      "FROM FacebookPages WHERE facebook_user_id = '1' AND page_id = '1123490870843189'"
    );
    console.log('✅ Connected Fanpage 1123490870843189 to admin user (facebook_user_id = 2)');
  } else {
    console.log('Fanpage already connected for user 2');
  }
  process.exit(0);
}
linkAdmin().catch(e => { console.error(e); process.exit(1); });
