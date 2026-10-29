const { sql, getPool } = require('../config/db');

async function migratePostStates() {
  console.log('🔄 Bắt đầu Migration Post States sang chữ hoa chuẩn 14 trạng thái...');
  const pool = await getPool();

  // 1. Kiểm tra độ dài cột Posts.status
  const colRes = await pool.request().query(`
    SELECT CHARACTER_MAXIMUM_LENGTH 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'Posts' AND COLUMN_NAME = 'status'
  `);

  const currentLength = colRes.recordset[0]?.CHARACTER_MAXIMUM_LENGTH;
  console.log(`ℹ️ Độ dài hiện tại của cột Posts.status: ${currentLength}`);

  if (currentLength && currentLength < 50) {
    console.log('🛠️ Đang nâng cấp Posts.status lên VARCHAR(50)...');
    // Drop constraint nếu có
    const defRes = await pool.request().query(`
      SELECT d.name 
      FROM sys.default_constraints d 
      JOIN sys.columns c ON d.parent_object_id = c.object_id AND d.parent_column_id = c.column_id 
      WHERE parent_object_id = OBJECT_ID('Posts') AND c.name = 'status'
    `);

    for (const row of defRes.recordset) {
      console.log(`- Xóa default constraint cũ: ${row.name}`);
      await pool.request().query(`ALTER TABLE Posts DROP CONSTRAINT ${row.name}`);
    }

    await pool.request().query('ALTER TABLE Posts ALTER COLUMN status VARCHAR(50) NOT NULL');
    await pool.request().query("ALTER TABLE Posts ADD CONSTRAINT DF_Posts_status DEFAULT 'NEW' FOR status");
    console.log('✅ Đã mở rộng Posts.status lên VARCHAR(50) NOT NULL DEFAULT \'NEW\'');
  }

  // 2. Chuyển đổi dữ liệu cũ trong bảng Posts
  console.log('📦 Đang cập nhật dữ liệu bảng Posts...');
  const updateRes = await pool.request().query(`
    UPDATE Posts SET status = 'PUBLISHED' WHERE status = 'published';
    UPDATE Posts SET status = 'PUBLISHING' WHERE status = 'publishing';
    UPDATE Posts SET status = 'PUBLISH_RETRY_OR_FAILED' WHERE status = 'failed';
    UPDATE Posts SET status = 'SCHEDULED' WHERE status = 'scheduled';
    UPDATE Posts SET status = 'NEW' WHERE status = 'pending';
    UPDATE Posts SET status = 'REJECTED' WHERE status = 'cancelled';
  `);
  console.log('✅ Đã đồng bộ dữ liệu Posts sang chữ hoa!');

  // 3. Kiểm tra phân bổ sau khi migrate
  const summaryRes = await pool.request().query(`
    SELECT status, COUNT(*) AS count
    FROM Posts
    GROUP BY status
  `);
  console.log('📊 Phân bổ trạng thái mới trong bảng Posts:');
  console.table(summaryRes.recordset);

  console.log('🎉 Migration hoàn tất!');
  process.exit(0);
}

migratePostStates().catch((err) => {
  console.error('❌ Lỗi khi chạy migration:', err);
  process.exit(1);
});
