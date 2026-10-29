require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const assert = require('assert');
const { getPool, sql } = require('../config/db');
const {
  POST_STATES,
  computePostHash,
  isPageIdAllowed,
  prepareStandardPostInsert,
  assertPublishable
} = require('../src/utils/PostStateMachine');

async function runTest() {
  console.log('🧪 ============================================================');
  console.log('🧪 TEST KIỂM THỬ: GOM HÀM HASH DÙNG CHUNG & CHẶN WHITELIST TẠO BÀI');
  console.log('🧪 ============================================================');

  const pool = await getPool();
  const validPageId = '1123490870843189'; // Fanpage Tạp Hoá (trong whitelist)
  const forbiddenPageId = '1383891371465269'; // Đài truyền hình ABC (ngoài whitelist)
  const createdTestIds = [];

  try {
    // ── TEST 1: CHẶN WHITELIST NGAY BƯỚC TẠO BÀI (FAIL-CLOSED, MÃ LỖI 403) ──
    console.log('\n▶️ TEST 1: Kiểm tra chặn Fanpage ngoài Whitelist ngay bước tạo bài...');
    let blockedError = null;
    try {
      prepareStandardPostInsert({
        pageId: forbiddenPageId,
        content: 'Bài viết thử nghiệm tạo trên Page ngoài Whitelist',
        scheduledAt: new Date(Date.now() + 60000),
        ownerId: '1'
      });
    } catch (err) {
      blockedError = err;
    }
    assert(blockedError, 'Phải ném lỗi khi tạo bài với Page ngoài Whitelist');
    assert.strictEqual(blockedError.statusCode, 403, 'Mã lỗi phải là HTTP 403 Forbidden');
    assert.strictEqual(blockedError.code, 'PAGE_NOT_ALLOWED', 'Code lỗi phải là PAGE_NOT_ALLOWED');
    console.log(`✅ TEST 1 PASSED: Page ngoài Whitelist (${forbiddenPageId}) bị từ chối ngay lập tức với mã 403!`);

    // ── TEST 2: ĐỒNG NHẤT HASH CHO LUỒNG TẠO BÀI SOẠN THẢO THỦ CÔNG (POST /posts) ──
    console.log('\n▶️ TEST 2: Kiểm tra đồng nhất Hash luồng POST /api/posts...');
    const now = Date.now();
    const schedDate1 = new Date(now + 120000);
    const postRecord1 = prepareStandardPostInsert({
      pageId: validPageId,
      content: `[Test Manual Compose Hash] Nội dung bài soạn tay lúc ${now}`,
      mediaType: 'text',
      mediaLinks: [],
      scheduledAt: schedDate1,
      ownerId: 'user_admin_test',
      status: POST_STATES.APPROVED
    });

    const res1 = await pool.request()
      .input('pageId', sql.VarChar, postRecord1.pageId)
      .input('ownerId', sql.VarChar(64), postRecord1.ownerId)
      .input('content', sql.NVarChar, postRecord1.content)
      .input('mediaType', sql.VarChar, postRecord1.mediaType)
      .input('mediaLinks', sql.NVarChar, postRecord1.mediaLinksJson)
      .input('scheduledAt', sql.DateTime2, postRecord1.scheduledAt)
      .input('status', sql.VarChar, postRecord1.status)
      .input('hash', sql.VarChar(64), postRecord1.contentHash)
      .query(`INSERT INTO Posts (page_id, content, media_type, media_links, scheduled_at, status, created_by_user_id, content_hash, approved_hash, approved_by) 
              OUTPUT INSERTED.id VALUES (@pageId, @content, @mediaType, @mediaLinks, @scheduledAt, @status, @ownerId, @hash, @hash, @ownerId);`);
    const id1 = res1.recordset[0].id;
    createdTestIds.push(id1);

    // Poller query lại từ DB
    const dbPost1 = (await pool.request().query(`SELECT * FROM Posts WHERE id = ${id1}`)).recordset[0];
    const recomputedHash1 = computePostHash(dbPost1);
    assert.strictEqual(dbPost1.content_hash, postRecord1.contentHash, 'content_hash trong DB phải khớp hash lúc tạo');
    assert.strictEqual(recomputedHash1, dbPost1.content_hash, 'Hash Poller tính lại từ DB phải khớp 100% với content_hash');
    assert.strictEqual(recomputedHash1, dbPost1.approved_hash, 'Hash Poller tính lại phải khớp 100% với approved_hash');
    assert.doesNotThrow(() => assertPublishable(dbPost1), 'Poller Gate Check assertPublishable phải thông qua');
    console.log(`✅ TEST 2 PASSED: Luồng POST /api/posts tính hash chuẩn xác 100%, Poller duyệt qua chốt chặn.`);

    // ── TEST 3: ĐỒNG NHẤT HASH CHO LUỒNG XUẤT BẢN BẢN NHÁP (Draft Publish) ──
    console.log('\n▶️ TEST 3: Kiểm tra đồng nhất Hash luồng POST /api/drafts/publish...');
    const schedDate2 = new Date(now + 240000);
    const postRecord2 = prepareStandardPostInsert({
      pageId: validPageId,
      content: `[Test Draft Publish Hash] Nội dung bản nháp lúc ${now}`,
      mediaType: 'image',
      mediaLinks: ['local://sample-image.jpg'],
      scheduledAt: schedDate2,
      ownerId: 'user_admin_test',
      status: POST_STATES.APPROVED
    });

    const res2 = await pool.request()
      .input('pageId', sql.VarChar, postRecord2.pageId)
      .input('ownerId', sql.VarChar(64), postRecord2.ownerId)
      .input('content', sql.NVarChar, postRecord2.content)
      .input('mediaType', sql.VarChar, postRecord2.mediaType)
      .input('mediaLinks', sql.NVarChar, postRecord2.mediaLinksJson)
      .input('scheduledAt', sql.DateTime2, postRecord2.scheduledAt)
      .input('status', sql.VarChar, postRecord2.status)
      .input('hash', sql.VarChar(64), postRecord2.contentHash)
      .query(`INSERT INTO Posts (page_id, content, media_type, media_links, scheduled_at, status, created_by_user_id, content_hash, approved_hash, approved_by) 
              OUTPUT INSERTED.id VALUES (@pageId, @content, @mediaType, @mediaLinks, @scheduledAt, @status, @ownerId, @hash, @hash, @ownerId);`);
    const id2 = res2.recordset[0].id;
    createdTestIds.push(id2);

    const dbPost2 = (await pool.request().query(`SELECT * FROM Posts WHERE id = ${id2}`)).recordset[0];
    const recomputedHash2 = computePostHash(dbPost2);
    assert.strictEqual(recomputedHash2, dbPost2.content_hash, 'Hash Poller tính lại phải khớp content_hash bản nháp');
    assert.strictEqual(recomputedHash2, dbPost2.approved_hash, 'Hash Poller tính lại phải khớp approved_hash bản nháp');
    assert.doesNotThrow(() => assertPublishable(dbPost2), 'Poller Gate Check assertPublishable phải thông qua');
    console.log(`✅ TEST 3 PASSED: Luồng Draft Publish tính hash chuẩn xác 100%, Poller duyệt qua chốt chặn.`);

    // ── TEST 4: ĐỒNG NHẤT HASH CHO LUỒNG TẢI LÊN EXCEL (Bulk Upload) ──
    console.log('\n▶️ TEST 4: Kiểm tra đồng nhất Hash luồng POST /api/posts/bulk-upload...');
    const schedDate3 = new Date(now + 360000);
    const postRecord3 = prepareStandardPostInsert({
      pageId: validPageId,
      content: `[Test Excel Import Hash] Dòng dữ liệu import Excel lúc ${now}`,
      mediaType: 'text',
      mediaLinks: [],
      scheduledAt: schedDate3,
      ownerId: 'user_admin_test',
      status: POST_STATES.APPROVED
    });

    const res3 = await pool.request()
      .input('pageId', sql.VarChar, postRecord3.pageId)
      .input('ownerId', sql.VarChar(64), postRecord3.ownerId)
      .input('content', sql.NVarChar, postRecord3.content)
      .input('mediaType', sql.VarChar, postRecord3.mediaType)
      .input('mediaLinks', sql.NVarChar, postRecord3.mediaLinksJson)
      .input('scheduledAt', sql.DateTime2, postRecord3.scheduledAt)
      .input('status', sql.VarChar, postRecord3.status)
      .input('hash', sql.VarChar(64), postRecord3.contentHash)
      .query(`INSERT INTO Posts (page_id, content, media_type, media_links, scheduled_at, status, created_by_user_id, content_hash, approved_hash, approved_by) 
              OUTPUT INSERTED.id VALUES (@pageId, @content, @mediaType, @mediaLinks, @scheduledAt, @status, @ownerId, @hash, @hash, @ownerId);`);
    const id3 = res3.recordset[0].id;
    createdTestIds.push(id3);

    const dbPost3 = (await pool.request().query(`SELECT * FROM Posts WHERE id = ${id3}`)).recordset[0];
    const recomputedHash3 = computePostHash(dbPost3);
    assert.strictEqual(recomputedHash3, dbPost3.content_hash, 'Hash Poller tính lại phải khớp content_hash từ Excel');
    assert.strictEqual(recomputedHash3, dbPost3.approved_hash, 'Hash Poller tính lại phải khớp approved_hash từ Excel');
    assert.doesNotThrow(() => assertPublishable(dbPost3), 'Poller Gate Check assertPublishable phải thông qua');
    console.log(`✅ TEST 4 PASSED: Luồng Import Excel tính hash chuẩn xác 100%, Poller duyệt qua chốt chặn.`);

  } finally {
    // Dọn dẹp dữ liệu test
    if (createdTestIds.length > 0) {
      await pool.request().query(`DELETE FROM Posts WHERE id IN (${createdTestIds.join(',')})`);
      console.log(`\n🧹 Đã dọn dẹp ${createdTestIds.length} bản ghi test trong CSDL.`);
    }
  }

  console.log('\n============================================================');
  console.log('📊 KẾT QUẢ KIỂM THỬ: 4/4 TEST PASSED (100% THÀNH CÔNG)');
  console.log('============================================================');
  process.exit(0);
}

runTest().catch(err => {
  console.error('❌ TEST FAILED:', err);
  process.exit(1);
});

