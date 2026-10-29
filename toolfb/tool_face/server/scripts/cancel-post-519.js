require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { getPool, sql } = require('../config/db');
const { cancelFacebookScheduledPost } = require('../src/utils/FacebookScheduleService');

async function cancel519() {
  const pool = await getPool();
  const res = await pool.request().query('SELECT * FROM Posts WHERE id = 519');
  const post = res.recordset[0];
  if (post && post.facebook_post_id) {
    console.log(`Đang hủy bài #519 trên Facebook Cloud (fbId: ${post.facebook_post_id})...`);
    try {
      await cancelFacebookScheduledPost({ pageId: post.page_id, facebookPostId: post.facebook_post_id });
      console.log('✅ Đã hủy thành công bài #519 trên Facebook Cloud!');
    } catch (err) {
      console.warn('Cảnh báo khi hủy trên FB:', err.message);
    }
  }
  await pool.request().query("UPDATE Posts SET status = 'CANCELLED' WHERE id = 519");
  console.log('✅ Đã cập nhật status bài #519 trong DB thành CANCELLED.');
  process.exit(0);
}

cancel519().catch(err => {
  console.error('Lỗi:', err.message);
  process.exit(1);
});
