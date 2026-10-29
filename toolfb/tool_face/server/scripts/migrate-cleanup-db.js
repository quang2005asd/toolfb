const { sql, getPool } = require('../config/db');

async function migrateAndClean() {
  const pool = await getPool();
  
  // 1. Dọn dẹp tất cả các dòng test còn sót lại
  const cleanRes = await pool.request().query(`
    DELETE FROM Posts 
    WHERE id IN (149, 151, 153) 
       OR page_id IN ('999999', '888888') 
       OR page_id LIKE 'SYSTEM_TEST_%';
  `);
  console.log('✅ Đã dọn dẹp các dòng test rác trong bảng Posts:', cleanRes.rowsAffected);

  // 2. Thêm cột is_permanent_failure vào Posts nếu chưa có
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='Posts' AND COLUMN_NAME='is_permanent_failure')
    ALTER TABLE Posts ADD is_permanent_failure BIT NOT NULL DEFAULT 0;
  `);
  console.log('✅ Đã kiểm tra/thêm cột Posts.is_permanent_failure');

  // 3. Thêm cột is_permanent_failure vào PostComments nếu chưa có
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='PostComments' AND COLUMN_NAME='is_permanent_failure')
    ALTER TABLE PostComments ADD is_permanent_failure BIT NOT NULL DEFAULT 0;
  `);
  console.log('✅ Đã kiểm tra/thêm cột PostComments.is_permanent_failure');

  process.exit(0);
}

migrateAndClean().catch(err => {
  console.error('Migration error:', err);
  process.exit(1);
});
