const { getPool, sql } = require('../config/db');

async function migrateAddRetryAndErrorCodeColumns() {
  const pool = await getPool();
  console.log('🔄 Đang kiểm tra và bổ sung cột cho bảng Posts...');

  const columnsToAdd = [
    { name: 'next_retry_at', type: 'datetime2 NULL' },
    { name: 'last_error_code', type: 'int NULL' },
    { name: 'last_error_subcode', type: 'int NULL' },
    { name: 'alerted_at', type: 'datetime2 NULL' }
  ];

  for (const col of columnsToAdd) {
    await pool.request().query(`
      IF NOT EXISTS (
        SELECT 1 FROM sys.columns 
        WHERE object_id = OBJECT_ID('dbo.Posts') 
          AND name = '${col.name}'
      )
      BEGIN
        ALTER TABLE dbo.Posts ADD ${col.name} ${col.type};
        PRINT 'Đã thêm cột ${col.name} vào Posts.';
      END
    `);
  }

  console.log('✅ Đã hoàn tất cập nhật schema bảng Posts.');
  process.exit(0);
}

migrateAddRetryAndErrorCodeColumns().catch(err => {
  console.error('Migration error:', err);
  process.exit(1);
});
