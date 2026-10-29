require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { getPool } = require('../config/db');

async function stats() {
  const pool = await getPool();
  
  // 1. Số bài tạo từ mốc 2026-10-27T04:45:00Z
  const resSince = await pool.request().query(`
    SELECT status, COUNT(*) as cnt 
    FROM Posts 
    WHERE created_at >= '2026-10-27T04:45:00Z'
    GROUP BY status
  `);
  console.log('📊 Số bài tạo sau mốc 11:45 (27/10):', resSince.recordset);

  // 2. Toàn bộ bài đang kẹt PUBLISHING trong hệ thống
  const resPublishing = await pool.request().query(`
    SELECT id, page_id, publishing_started_at, status 
    FROM Posts 
    WHERE status = 'PUBLISHING'
  `);
  console.log('⚠️ Bài kẹt PUBLISHING:', resPublishing.recordset);

  // 3. Phân bổ toàn bộ trạng thái trong DB
  const resAll = await pool.request().query(`
    SELECT status, COUNT(*) as cnt 
    FROM Posts 
    GROUP BY status
  `);
  console.log('📈 Toàn bộ trạng thái DB hiện tại:', resAll.recordset);

  // 4. Số audit log ghi nhận từ mốc
  const resAudit = await pool.request().query(`
    SELECT to_state, COUNT(*) as cnt 
    FROM PostAuditLog 
    WHERE created_at >= '2026-10-27T04:45:00Z'
    GROUP BY to_state
  `);
  console.log('📝 Audit log ghi nhận sau mốc:', resAudit.recordset);

  process.exit(0);
}
stats().catch(err => {
  console.error('Lỗi thống kê:', err);
  process.exit(1);
});
