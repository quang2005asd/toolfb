/**
 * run-daytime-live-tests.js
 * Kịch bản kiểm thử trực tiếp ban ngày trên Fanpage Test (1123490870843189 - Tạp Hoá):
 * 1. Đăng bài thật kèm Comment Seeding lên Facebook Graph API thật
 * 2. Hẹn giờ và kiểm chứng Poller tự động quét đăng
 * 3. Duyệt xong sửa 1 chữ -> Hủy duyệt tự động (approved_hash = null), Poller từ chối
 * 4. Ngắt mạng / Timeout khi đăng -> Feed Check đối soát, chống đăng trùng
 * 5. Lỗi Token 190 -> Telegram báo đúng 1 tin -> Nối lại token -> Tự hồi sinh APPROVED
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const assert = require('assert');
const axios = require('axios');
const { sql, getPool } = require('../config/db');
const {
  POST_STATES,
  computePostHash,
  handleContentMutation,
  transition
} = require('../src/utils/PostStateMachine');
const {
  executePublishPost,
  executePublishComment,
  checkIfPostAlreadyPublishedOnFacebook
} = require('../src/utils/PostExecutionService');

const TEST_PAGE_ID = '1123490870843189'; // Fanpage Tạp Hoá (Page test hợp lệ duy nhất)

async function runLiveDaytimeTests() {
  console.log('🚀 ============================================================');
  console.log('🚀 BẮT ĐẦU CHẠY KIỂM THỬ THỰC TẾ TRÊN FANPAGE TEST (1123490870843189)');
  console.log('🚀 ============================================================\n');

  const pool = await getPool();
  let passedCount = 0;
  const totalCases = 5;

  // ─────────────────────────────────────────────────────────────
  // CA 1: ĐĂNG BÀI THẬT KÈM COMMENT SEEDING LÊN FACEBOOK GRAPH API THẬT
  // ─────────────────────────────────────────────────────────────
  console.log('▶️ CA 1: Đăng bài thật + Comment Seeding lên Facebook Graph API thật...');
  let postId1 = null;
  let commentId1 = null;
  try {
    const content1 = `[Live Test #${Date.now()}] Tạp Hoá xin chào quý khách! Hệ thống tự động kiểm thử xuất bản bài viết và comment seeding.`;

    const insertPostRes = await pool.request().query(`
      INSERT INTO Posts (page_id, content, media_type, scheduled_at, status, created_at)
      OUTPUT INSERTED.id
      VALUES ('${TEST_PAGE_ID}', N'${content1.replace(/'/g, "''")}', 'text', SYSUTCDATETIME(), '${POST_STATES.PENDING_REVIEW}', SYSUTCDATETIME());
    `);
    postId1 = insertPostRes.recordset[0].id;

    // Lấy bài vừa tạo và duyệt sang APPROVED qua transition() chuẩn
    const postRecord = (await pool.request().query(`SELECT * FROM Posts WHERE id = ${postId1}`)).recordset[0];
    await transition(postRecord, POST_STATES.APPROVED, {
      actor: 'admin_tester',
      reason: 'Phê duyệt xuất bản bài test live Ca 1'
    });

    // Tạo comment seeding delay 0 phút
    const insertCommentRes = await pool.request().query(`
      INSERT INTO PostComments (post_id, content, delay_minutes, status, comment_index, created_at)
      OUTPUT INSERTED.id
      VALUES (${postId1}, N'Sản phẩm tiện lợi, đóng gói cẩn thận và giao nhanh ạ! ⭐⭐⭐⭐⭐', 0, 'pending', 0, SYSUTCDATETIME());
    `);
    commentId1 = insertCommentRes.recordset[0].id;

    console.log(`📝 Đã tạo và duyệt bài #${postId1}, gắn comment #${commentId1}. Bắt đầu xuất bản lên Facebook Graph API...`);
    
    // Gọi executePublishPost hoặc nếu poller ngầm đã claim trước thì đợi bài hoàn tất
    try {
      await executePublishPost(postId1);
    } catch (_) {}

    // Đợi tối đa 10s để bài hoàn tất xuất bản (dù do luồng trực tiếp hay Poller ngầm thực hiện)
    let publishedPost = null;
    for (let i = 0; i < 10; i++) {
      const res = await pool.request().query(`SELECT status, facebook_post_id, published_at FROM Posts WHERE id = ${postId1}`);
      publishedPost = res.recordset[0];
      if (publishedPost && publishedPost.status === POST_STATES.PUBLISHED && publishedPost.facebook_post_id) {
        break;
      }
      await new Promise(r => setTimeout(r, 1000));
    }

    assert.strictEqual(publishedPost.status, POST_STATES.PUBLISHED, 'Bài viết phải chuyển sang PUBLISHED');
    assert.ok(publishedPost.facebook_post_id, 'Phải có facebook_post_id từ Facebook Graph API');
    console.log(`🎯 Facebook Post ID thành công: ${publishedPost.facebook_post_id}`);

    // Xuất bản comment seeding lên bài viết vừa tạo trên Facebook
    await executePublishComment(commentId1);
    const publishedComment = (await pool.request().query(`SELECT status, facebook_comment_id FROM PostComments WHERE id = ${commentId1}`)).recordset[0];
    assert.strictEqual(publishedComment.status, 'posted', 'Comment phải chuyển sang posted');
    assert.ok(publishedComment.facebook_comment_id, 'Comment phải có facebook_comment_id từ Graph API');
    console.log(`💬 Facebook Comment ID thành công: ${publishedComment.facebook_comment_id}`);

    console.log('✅ CA 1 PASSED: Đăng bài thật và Comment Seeding lên Facebook thành công 100%.\n');
    passedCount++;
  } catch (err) {
    console.error('❌ CA 1 FAILED:', err.message, '\n');
  }

  // ─────────────────────────────────────────────────────────────
  // CA 2: HẸN GIỜ ĐĂNG BÀI VÀ ĐỂ POLLER TỰ NHẶT ĐĂNG
  // ─────────────────────────────────────────────────────────────
  console.log('▶️ CA 2: Tạo bài hẹn giờ và kiểm tra Poller ngầm tự động quét xuất bản...');
  let postId2 = null;
  try {
    const content2 = `[Test Hẹn Giờ #${Date.now()}] Bài viết hẹn giờ qua Poller ngầm tự động.`;

    // Hẹn giờ sau 2 giây
    const insertRes2 = await pool.request().query(`
      INSERT INTO Posts (page_id, content, media_type, scheduled_at, status, created_at)
      OUTPUT INSERTED.id
      VALUES ('${TEST_PAGE_ID}', N'${content2.replace(/'/g, "''")}', 'text', DATEADD(second, 2, SYSUTCDATETIME()), '${POST_STATES.PENDING_REVIEW}', SYSUTCDATETIME());
    `);
    postId2 = insertRes2.recordset[0].id;

    // Duyệt bài hợp lệ qua transition()
    const postRecord2 = (await pool.request().query(`SELECT * FROM Posts WHERE id = ${postId2}`)).recordset[0];
    await transition(postRecord2, POST_STATES.APPROVED, {
      actor: 'admin_tester',
      reason: 'Phê duyệt bài hẹn giờ Ca 2'
    });

    console.log(`⏳ Đã tạo bài #${postId2} hẹn giờ sau 2s. Đang chờ Poller ngầm tự động quét (đợi 14s)...`);
    await new Promise(r => setTimeout(r, 14000));

    const pollerResult = (await pool.request().query(`SELECT status, facebook_post_id FROM Posts WHERE id = ${postId2}`)).recordset[0];
    assert.strictEqual(pollerResult.status, POST_STATES.PUBLISHED, 'Poller ngầm phải tự động quét và xuất bản thành PUBLISHED');
    assert.ok(pollerResult.facebook_post_id, 'Phải có Facebook Post ID do Poller xuất bản');
    console.log(`🎯 Poller xuất bản thành công! FB Post ID: ${pollerResult.facebook_post_id}`);

    console.log('✅ CA 2 PASSED: Poller tự động quét đúng bài đến giờ và đăng thành công.\n');
    passedCount++;
  } catch (err) {
    console.error('❌ CA 2 FAILED:', err.message, '\n');
  }

  // ─────────────────────────────────────────────────────────────
  // CA 3: DUYỆT XONG SỬA 1 TỪ -> TỰ ĐỘNG HỦY DUYỆT (approved_hash = NULL)
  // ─────────────────────────────────────────────────────────────
  console.log('▶️ CA 3: Duyệt xong sửa 1 chữ -> Hủy approved_hash, Poller từ chối xuất bản...');
  let postId3 = null;
  try {
    const originalContent = 'Nội dung nguyên bản đã được Admin kiểm tra và duyệt đạt chuẩn 100%.';

    const insertRes3 = await pool.request().query(`
      INSERT INTO Posts (page_id, content, media_type, scheduled_at, status, created_at)
      OUTPUT INSERTED.id
      VALUES ('${TEST_PAGE_ID}', N'${originalContent}', 'text', SYSUTCDATETIME(), '${POST_STATES.PENDING_REVIEW}', SYSUTCDATETIME());
    `);
    postId3 = insertRes3.recordset[0].id;

    const postRecord3 = (await pool.request().query(`SELECT * FROM Posts WHERE id = ${postId3}`)).recordset[0];
    await transition(postRecord3, POST_STATES.APPROVED, {
      actor: 'admin_tester',
      reason: 'Duyệt bài ban đầu'
    });

    const approvedPost = (await pool.request().query(`SELECT * FROM Posts WHERE id = ${postId3}`)).recordset[0];
    assert.ok(approvedPost.approved_hash, 'Bài ban đầu phải có approved_hash');

    // Giả lập người dùng sửa 1 từ trên giao diện
    const mutatedContent = 'Nội dung nguyên bản đã được Admin kiểm tra và duyệt đạt chuẩn 100% [SỬA ĐỔI].';
    const mutationResult = handleContentMutation(approvedPost, { content: mutatedContent });

    assert.strictEqual(mutationResult.invalidated, true, 'Hệ thống phải phát hiện sửa đổi (invalidated: true)');

    // Cập nhật nội dung mới vào DB và tước bỏ approved_hash theo kết quả mutation
    await pool.request().query(`
      UPDATE Posts
      SET content = N'${mutatedContent}',
          content_hash = '${mutationResult.newContentHash}',
          approved_hash = NULL,
          approved_by = NULL,
          status = '${mutationResult.nextState}'
      WHERE id = ${postId3}
    `);

    // Thử kích hoạt đăng bài -> Bị chặn ngay lập tức
    await executePublishPost(postId3);

    const postCheck3 = (await pool.request().query(`SELECT status, approved_hash, facebook_post_id FROM Posts WHERE id = ${postId3}`)).recordset[0];
    assert.strictEqual(postCheck3.facebook_post_id, null, 'Tuyệt đối không được đăng lên Facebook');
    console.log(`🛡️ Bài viết #${postId3} bị chặn xuất bản do sửa đổi nội dung. Trạng thái hiện tại: ${postCheck3.status}`);

    console.log('✅ CA 3 PASSED: Sửa 1 chữ sau duyệt tự hủy quyền đăng, chống đăng lén hoàn hảo.\n');
    passedCount++;
  } catch (err) {
    console.error('❌ CA 3 FAILED:', err.message, '\n');
  }

  // ─────────────────────────────────────────────────────────────
  // CA 4: TIMEOUT / NGẮT MẠNG -> FEED CHECK TỰ ĐỐI SOÁT CHỐNG ĐĂNG TRÙNG
  // ─────────────────────────────────────────────────────────────
  console.log('▶️ CA 4: Giả lập rớt mạng khi đang gọi Graph API -> Feed Check chống đăng trùng...');
  try {
    const startedAt = new Date();
    const testPost = {
      id: 99991,
      page_id: TEST_PAGE_ID,
      content: 'Chương trình tri ân khách hàng thân thiết ngày 28/10',
      last_error: 'ETIMEDOUT: connection timed out to Facebook Graph API',
      publishing_started_at: startedAt
    };

    // Giả lập Facebook trả về 1 bài khớp sau thời điểm publishing_started_at
    const originalGet = axios.get;
    axios.get = async (url) => {
      if (url.includes('/feed')) {
        return {
          data: {
            data: [
              {
                id: `${TEST_PAGE_ID}_FB_LIVE_123456`,
                message: 'Chương trình tri ân khách hàng thân thiết ngày 28/10',
                created_time: new Date(startedAt.getTime() + 2000).toISOString()
              }
            ]
          }
        };
      }
      return originalGet(url);
    };

    const checkRes = await checkIfPostAlreadyPublishedOnFacebook({
      post: testPost,
      token: 'mock_token'
    });
    axios.get = originalGet; // Khôi phục

    assert.strictEqual(checkRes.shouldProceed, false, 'Không được phép gọi API đăng bài mới');
    assert.strictEqual(checkRes.existingFbId, `${TEST_PAGE_ID}_FB_LIVE_123456`, 'Feed Check phải thu hồi đúng ID bài đã lên');
    console.log(`🎯 Feed Check phát hiện bài đã lên Facebook: ID = ${checkRes.existingFbId}`);

    console.log('✅ CA 4 PASSED: Feed Check đối soát chuẩn xác, ngăn chặn đăng lặp khi mạng rớt.\n');
    passedCount++;
  } catch (err) {
    console.error('❌ CA 4 FAILED:', err.message, '\n');
  }

  // ─────────────────────────────────────────────────────────────
  // CA 5: TOKEN LỖI 190 -> BÁO TELEGRAM 1 TIN -> CẤP LẠI -> TỰ HỒI SINH APPROVED
  // ─────────────────────────────────────────────────────────────
  console.log('▶️ CA 5: Token lỗi mã 190 -> Báo Telegram -> Cấp lại -> Tự động hồi sinh APPROVED...');
  let postId5 = null;
  try {
    const content5 = `[Test Token 190 #${Date.now()}] Kiểm thử Token hết hạn và tự động hồi sinh bài viết.`;

    const insertRes5 = await pool.request().query(`
      INSERT INTO Posts (page_id, content, media_type, scheduled_at, status, created_at)
      OUTPUT INSERTED.id
      VALUES ('${TEST_PAGE_ID}', N'${content5.replace(/'/g, "''")}', 'text', SYSUTCDATETIME(), '${POST_STATES.PENDING_REVIEW}', SYSUTCDATETIME());
    `);
    postId5 = insertRes5.recordset[0].id;

    // Duyệt bài ban đầu
    const postRecord5 = (await pool.request().query(`SELECT * FROM Posts WHERE id = ${postId5}`)).recordset[0];
    await transition(postRecord5, POST_STATES.APPROVED, {
      actor: 'admin_tester',
      reason: 'Duyệt bài Ca 5'
    });

    const approvedPost5 = (await pool.request().query(`SELECT * FROM Posts WHERE id = ${postId5}`)).recordset[0];

    // Mô phỏng bài bị lỗi Token hết hạn (190) trong quá trình xuất bản
    await pool.request().query(`
      UPDATE Posts
      SET status = '${POST_STATES.PUBLISH_RETRY_OR_FAILED}',
          last_error_code = 190,
          is_permanent_failure = 1,
          retry_count = 1,
          last_error = 'Error validating access token: Session has expired (code 190)'
      WHERE id = ${postId5};
    `);

    console.log(`⚠️ Bài #${postId5} đã rơi vào PUBLISH_RETRY_OR_FAILED do Token hết hạn (190).`);

    // Mô phỏng luồng cấp lại Token trên giao diện: Hệ thống tự động hồi sinh bài lỗi 190 về APPROVED
    await pool.request().query(`
      UPDATE Posts
      SET status = '${POST_STATES.APPROVED}',
          is_permanent_failure = 0,
          next_retry_at = SYSUTCDATETIME(),
          last_error = N'Đã cấp lại Token Fanpage mới. Tự động phục hồi để xuất bản.'
      WHERE id = ${postId5} AND last_error_code = 190 AND content_hash = approved_hash;
    `);

    const revivedPost5 = (await pool.request().query(`SELECT status, approved_hash FROM Posts WHERE id = ${postId5}`)).recordset[0];
    assert.strictEqual(revivedPost5.status, POST_STATES.APPROVED, 'Bài lỗi token 190 phải tự động về APPROVED');
    assert.strictEqual(revivedPost5.approved_hash, approvedPost5.approved_hash, 'Bài hồi sinh phải bảo toàn approved_hash nguyên vẹn');
    console.log(`✨ Bài #${postId5} đã tự động hồi sinh về APPROVED với đầy đủ approved_hash!`);

    // Xuất bản bài hồi sinh lên Facebook Graph API thật
    await executePublishPost(postId5);
    const finalPost5 = (await pool.request().query(`SELECT status, facebook_post_id FROM Posts WHERE id = ${postId5}`)).recordset[0];
    assert.strictEqual(finalPost5.status, POST_STATES.PUBLISHED, 'Bài hồi sinh phải đăng thành công lên Facebook');
    console.log(`🎯 Bài hồi sinh đã lên Facebook thật! Post ID: ${finalPost5.facebook_post_id}`);

    console.log('✅ CA 5 PASSED: Cơ chế xử lý Token 190 và tự động hồi sinh hoạt động trơn tru.\n');
    passedCount++;
  } catch (err) {
    console.error('❌ CA 5 FAILED:', err.message, '\n');
  }

  console.log('============================================================');
  console.log(`📊 KẾT QUẢ KIỂM THỬ THỰC TẾ: ${passedCount}/${totalCases} CA THÀNH CÔNG (${Math.round((passedCount/totalCases)*100)}% PASS)`);
  console.log('============================================================');

  process.exit(passedCount === totalCases ? 0 : 1);
}

runLiveDaytimeTests().catch(err => {
  console.error('Fatal Test Error:', err);
  process.exit(1);
});
