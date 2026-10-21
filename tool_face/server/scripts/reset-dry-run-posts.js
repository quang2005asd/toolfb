const { getPool } = require('../config/db');

async function cleanupDryRunPosts() {
  const pool = await getPool();
  
  // 1. Reset sạch các PostComments liên quan đến bài có ID dry_run_
  const commentReset = await pool.request().query(`
    UPDATE PostComments 
    SET status = 'pending',
        retry_count = 0,
        is_permanent_failure = 0,
        next_retry_at = NULL
    WHERE post_id IN (
      SELECT id FROM Posts WHERE LEFT(facebook_post_id, 8) = 'dry_run_'
    );
  `);
  console.log(`🧹 Đã reset ${commentReset.rowsAffected[0]} comment seeding của bài dry_run_.`);

  // 2. Đưa các bài có ID giả dry_run_ về trạng thái NEW, xóa sạch dấu duyệt, published_at và hash
  const postReset = await pool.request().query(`
    UPDATE Posts 
    SET status = 'NEW',
        facebook_post_id = NULL,
        published_at = NULL,
        approved_hash = NULL,
        approved_by = NULL,
        last_error = NULL,
        last_error_code = NULL,
        last_error_subcode = NULL,
        is_permanent_failure = 0,
        retry_count = 0,
        next_retry_at = NULL,
        alerted_at = NULL
    WHERE LEFT(facebook_post_id, 8) = 'dry_run_';
  `);
  console.log(`✅ Đã reset ${postReset.rowsAffected[0]} bài có ID dry_run_ về NEW (xóa sạch dấu duyệt & hash).`);
  process.exit(0);
}

cleanupDryRunPosts().catch(err => {
  console.error('Error cleaning dry_run posts:', err);
  process.exit(1);
});
