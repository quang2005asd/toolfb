require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { getPool, sql } = require('../config/db');
const axios = require('axios');
const { getFacebookPageAccessToken } = require('../src/utils/FacebookPageAccessToken');

async function investigate() {
  const pool = await getPool();
  console.log('=== 1. CHECK .ENV CONFIG ===');
  console.log('ENABLE_FB_NATIVE_SCHEDULE:', process.env.ENABLE_FB_NATIVE_SCHEDULE);
  console.log('ALLOWED_PAGE_IDS:', process.env.ALLOWED_PAGE_IDS);
  console.log('APP_ENV:', process.env.APP_ENV);
  console.log('MAX_SCHEDULE_DELAY_MINUTES:', process.env.MAX_SCHEDULE_DELAY_MINUTES);

  console.log('\n=== 2. DETAILS OF POST #519 ===');
  const p519 = await pool.request().query('SELECT * FROM Posts WHERE id = 519');
  console.log(JSON.stringify(p519.recordset[0], null, 2));

  console.log('\n=== 3. ALL POSTS FOR PAGES 1383891371465269 AND 1406154479236872 ===');
  const clientPosts = await pool.request().query(
    "SELECT id, page_id, SUBSTRING(content, 1, 40) as preview, status, scheduled_at, published_at, facebook_post_id, created_at, approved_hash " +
    "FROM Posts WHERE page_id IN ('1383891371465269', '1406154479236872') ORDER BY id ASC"
  );
  console.table(clientPosts.recordset);

  console.log('\n=== 4. CHECK GRAPH API FOR POST #519 (fbId: 1383891371465269_122116258779489187) ===');
  try {
    const pageToken = await getFacebookPageAccessToken('1383891371465269');
    const fbRes = await axios.get('https://graph.facebook.com/v19.0/1383891371465269_122116258779489187', {
      params: { access_token: pageToken, fields: 'id,message,is_published,scheduled_publish_time' }
    });
    console.log('⚠️ CẢNH BÁO: BÀI VẪN TỒN TẠI TRÊN FACEBOOK:', fbRes.data);
  } catch (err) {
    console.log('✅ XÁC NHẬN TỪ GRAPH API: Bài KHÔNG TỒN TẠI / ĐÃ BỊ XÓA trên FB.');
    console.log('Mã lỗi trả về từ Facebook:', err.response?.data?.error?.message || err.message);
    console.log('Error Code:', err.response?.data?.error?.code, 'Subcode:', err.response?.data?.error?.error_subcode);
  }

  console.log('\n=== 5. CHECK ALL SCHEDULED POSTS ON FACEBOOK CLOUD FOR BOTH PAGES ===');
  for (const pid of ['1383891371465269', '1406154479236872']) {
    try {
      const pageToken = await getFacebookPageAccessToken(pid);
      const scheduledRes = await axios.get(`https://graph.facebook.com/v19.0/${pid}/scheduled_posts`, {
        params: { access_token: pageToken, fields: 'id,message,scheduled_publish_time' }
      });
      console.log(`Page ${pid} scheduled_posts count on Facebook Cloud:`, scheduledRes.data.data.length);
      if (scheduledRes.data.data.length > 0) {
        console.table(scheduledRes.data.data);
      }
    } catch (err) {
      console.log(`Page ${pid} scheduled_posts query error:`, err.response?.data?.error?.message || err.message);
    }
  }

  console.log('\n=== 6. LIST ALL 9 PUBLISHED POSTS CREATED AFTER BASELINE (2026-10-28T01:45:00Z) ===');
  const pubPosts = await pool.request().input('b', sql.DateTime2, new Date('2026-10-28T01:45:00Z')).query(
    "SELECT id, page_id, SUBSTRING(content, 1, 40) as preview, status, scheduled_at, published_at, facebook_post_id, created_at " +
    "FROM Posts WHERE created_at >= @b AND status = 'PUBLISHED' ORDER BY id ASC"
  );
  console.table(pubPosts.recordset);

  process.exit(0);
}

investigate().catch(e => {
  console.error(e);
  process.exit(1);
});
