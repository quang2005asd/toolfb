const { getPool } = require('../config/db');

async function inspect() {
  const pool = await getPool();
  
  // 1. Kiểm tra bài có facebook_post_id thật chưa chốt PUBLISHED
  const resFb = await pool.request().query(`
    SELECT id, page_id, status, scheduled_at, facebook_post_id, last_error, is_permanent_failure
    FROM Posts
    WHERE facebook_post_id IS NOT NULL 
      AND facebook_post_id <> ''
      AND LEFT(facebook_post_id, 8) <> 'dry_run_'
      AND status NOT IN ('PUBLISHED', 'REJECTED', 'DRAFT')
  `);
  console.log('=== 1. BÀI CÒN FB_POST_ID CHƯA PUBLISHED ===');
  console.table(resFb.recordset);

  // 2. Kiểm tra tất cả bài đang ở các trạng thái chờ/retry/publishing
  const resPending = await pool.request().query(`
    SELECT id, page_id, status, scheduled_at, facebook_post_id, retry_count, is_permanent_failure, SUBSTRING(content, 1, 35) AS content_preview
    FROM Posts
    WHERE status IN ('APPROVED', 'SCHEDULED', 'PUBLISHING', 'PUBLISH_RETRY_OR_FAILED')
    ORDER BY id DESC
  `);
  console.log('=== 2. TẤT CẢ BÀI ĐANG CHỜ/RETRY/PUBLISHING TRÊN HỆ THỐNG ===');
  console.table(resPending.recordset);

  process.exit(0);
}

inspect().catch(err => {
  console.error(err);
  process.exit(1);
});
