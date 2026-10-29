require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { getPool } = require('../config/db');
const { POST_STATES } = require('../src/utils/PostStateMachine');

async function checkStatuses() {
  const pool = await getPool();
  console.log('=== 1. TẤT CẢ CÁC TRẠNG THÁI HIỆN CÓ TRONG BẢNG POSTS ===');
  const res = await pool.request().query("SELECT status, COUNT(*) as count FROM Posts GROUP BY status");
  console.table(res.recordset);

  const valid14States = new Set(Object.values(POST_STATES));
  console.log('\n=== 2. ĐỐI SOÁT VỚI 14 TRẠNG THÁI CHUẨN CỦA POST_STATEMACHINE ===');
  let hasInvalid = false;
  for (const row of res.recordset) {
    const isValid = valid14States.has(row.status);
    console.log(`- Trạng thái "${row.status}": ${row.count} bài -> ${isValid ? '✅ HỢP LỆ (Thuộc 14 trạng thái)' : '❌ LẠ / BẤT THƯỜNG'}`);
    if (!isValid) hasInvalid = true;
  }
  if (!hasInvalid) {
    console.log('🎯 TOÀN BỘ 100% BÀI VIẾT TRONG CSDL ĐỀU THUỘC 14 TRẠNG THÁI CHUẨN!');
  }

  console.log('\n=== 3. KIỂM TRA BÀI #519 VÀ AUDIT LOGS ===');
  const p519 = await pool.request().query("SELECT id, page_id, status, approved_hash, error_message, updated_at FROM Posts WHERE id = 519");
  console.log('Post #519 record:', p519.recordset[0]);

  // Kiểm tra bảng audit log nếu có
  const checkAuditTable = await pool.request().query("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME IN ('PostAuditLogs', 'AuditLogs', 'PostStatusHistory')");
  console.log('Bảng Audit Log tồn tại:', checkAuditTable.recordset);

  process.exit(0);
}

checkStatuses().catch(e => { console.error(e); process.exit(1); });

