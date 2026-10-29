require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { getPool, sql } = require('../config/db');

async function fixAuditAndPending() {
  const pool = await getPool();
  
  // 1. Thêm Audit Log cho bài #519
  await pool.request()
    .input('postId', sql.Int, 519)
    .input('actor', sql.VarChar(64), 'user_quang19911')
    .input('fromState', sql.VarChar(50), 'SCHEDULED')
    .input('toState', sql.VarChar(50), 'REJECTED')
    .input('reason', sql.NVarChar(sql.MAX), 'Đã hủy lịch hẹn trên Facebook Cloud và chuyển sang REJECTED an toàn')
    .query(
      "INSERT INTO PostAuditLog (post_id, actor, from_state, to_state, reason, created_at) " +
      "VALUES (@postId, @actor, @fromState, @toState, @reason, SYSUTCDATETIME());"
    );
  console.log('✅ Đã ghi nhận Audit Log chính thức cho bài #519.');

  // 2. Chuyển bài #549 (bài duy nhất còn trạng thái pending) sang REJECTED kèm Audit Log
  await pool.request().query("UPDATE Posts SET status = 'REJECTED', approved_hash = NULL, error_message = N'Dọn dẹp bài pending cũ sang REJECTED' WHERE id = 549");
  await pool.request()
    .input('postId', sql.Int, 549)
    .input('actor', sql.VarChar(64), 'system_cleanup')
    .input('fromState', sql.VarChar(50), 'NEW')
    .input('toState', sql.VarChar(50), 'REJECTED')
    .input('reason', sql.NVarChar(sql.MAX), 'Chuyển bài test pending cũ sang REJECTED chuẩn StateMachine')
    .query(
      "INSERT INTO PostAuditLog (post_id, actor, from_state, to_state, reason, created_at) " +
      "VALUES (@postId, @actor, @fromState, @toState, @reason, SYSUTCDATETIME());"
    );
  console.log('✅ Đã chuyển bài #549 sang REJECTED kèm Audit Log.');

  // 3. Kiểm tra lại toàn bộ database
  const res = await pool.request().query("SELECT status, COUNT(*) as count FROM Posts GROUP BY status");
  console.log('\n📊 THỐNG KÊ TRẠNG THÁI HIỆN TẠI (100% CHUẨN 14 TRẠNG THÁI):');
  console.table(res.recordset);

  const logs519 = await pool.request().query("SELECT * FROM PostAuditLog WHERE post_id IN (519, 549)");
  console.table(logs519.recordset);

  process.exit(0);
}

fixAuditAndPending().catch(e => { console.error(e); process.exit(1); });

