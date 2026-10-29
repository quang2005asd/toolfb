const crypto = require('crypto');
const { sql, getPool } = require('../config/db');

function computePostHash(post) {
  const content = (post.content || '').trim();
  const mediaType = (post.media_type || 'text').trim();
  let mediaLinks = '';
  try {
    if (post.media_links) {
      const parsed = JSON.parse(post.media_links);
      mediaLinks = Array.isArray(parsed) ? parsed.join(',') : String(parsed);
    }
  } catch {
    mediaLinks = String(post.media_links || '').trim();
  }
  const pageId = String(post.page_id || '').trim();
  const scheduledTime = post.scheduled_at ? new Date(post.scheduled_at).toISOString() : '';

  const raw = `${pageId}|${content}|${mediaType}|${mediaLinks}|${scheduledTime}`;
  return crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
}

async function run() {
  console.log('🚀 Bắt đầu nâng cấp cấu trúc Database...');
  const pool = await getPool();

  // 1. Thêm các cột vào bảng Posts nếu chưa có
  const columnsToAdd = [
    { name: 'content_hash', type: 'VARCHAR(64) NULL' },
    { name: 'approved_hash', type: 'VARCHAR(64) NULL' },
    { name: 'approved_by', type: 'VARCHAR(64) NULL' },
    { name: 'publishing_started_at', type: 'DATETIME2 NULL' },
    { name: 'published_at', type: 'DATETIME2 NULL' },
    { name: 'retry_count', type: 'INT NOT NULL DEFAULT 0' },
    { name: 'last_error', type: 'NVARCHAR(MAX) NULL' }
  ];

  for (const col of columnsToAdd) {
    const check = await pool.request().query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'Posts' AND COLUMN_NAME = '${col.name}'
    `);
    if (check.recordset.length === 0) {
      console.log(`➕ Đang thêm cột Posts.${col.name}...`);
      await pool.request().query(`ALTER TABLE Posts ADD ${col.name} ${col.type};`);
    } else {
      console.log(`ℹ️ Cột Posts.${col.name} đã tồn tại.`);
    }
  }

  // 2. Tạo bảng PostAuditLog nếu chưa có
  console.log('🛠️ Đang kiểm tra bảng PostAuditLog...');
  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'PostAuditLog')
    BEGIN
      CREATE TABLE PostAuditLog (
        id INT IDENTITY(1,1) PRIMARY KEY,
        post_id INT NOT NULL,
        actor VARCHAR(100) NOT NULL,
        from_state VARCHAR(50) NULL,
        to_state VARCHAR(50) NOT NULL,
        reason NVARCHAR(MAX) NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
      );
      CREATE INDEX IX_PostAuditLog_post_id ON PostAuditLog(post_id);
      CREATE INDEX IX_PostAuditLog_created_at ON PostAuditLog(created_at);
      PRINT '✅ Đã tạo bảng PostAuditLog và Index thành công';
    END
    ELSE
    BEGIN
      PRINT 'ℹ️ Bảng PostAuditLog đã tồn tại';
    END
  `);

  // 3. Backfill hash và published_at cho dữ liệu cũ
  console.log('📦 Đang tính toán và điền content_hash & approved_hash cho các bài hiện có...');
  const postsRes = await pool.request().query('SELECT id, page_id, content, media_type, media_links, scheduled_at, status, created_at FROM Posts');
  const posts = postsRes.recordset || [];
  console.log(`Tìm thấy ${posts.length} bài viết cần xử lý hash.`);

  for (const post of posts) {
    const hash = computePostHash(post);
    const isApproved = ['APPROVED', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'PUBLISH_RETRY_OR_FAILED'].includes(post.status);
    const approvedHash = isApproved ? hash : null;
    const publishedAt = post.status === 'PUBLISHED' ? post.created_at : null;

    await pool.request()
      .input('id', sql.Int, post.id)
      .input('hash', sql.VarChar(64), hash)
      .input('approvedHash', sql.VarChar(64), approvedHash)
      .input('publishedAt', sql.DateTime2, publishedAt)
      .query(`
        UPDATE Posts 
        SET content_hash = @hash,
            approved_hash = COALESCE(approved_hash, @approvedHash),
            published_at = COALESCE(published_at, @publishedAt)
        WHERE id = @id
      `);
  }

  console.log('✅ Hoàn thành cập nhật hash và published_at cho dữ liệu cũ!');
  process.exit(0);
}

run().catch((err) => {
  console.error('❌ Lỗi:', err);
  process.exit(1);
});
