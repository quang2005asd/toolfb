const { getPool, sql } = require('../config/db');
const { computePostHash, POST_STATES } = require('../src/utils/PostStateMachine');

async function main() {
  const [,, command, ...args] = process.argv;
  const pool = await getPool();

  if (command === 'setup-ca-1') {
    const pageId = args[0] || '1123490870843189';
    const content = `Thử nghiệm xuất bản tự động 🎯
- Dòng 1: Xuống dòng chuẩn xác
- Dòng 2: Link kiểm tra https://google.com
Chúc một ngày làm việc hiệu quả! 🚀🔥`;
    const hash = computePostHash({ pageId, content });
    
    // Tạo bài viết APPROVED hẹn giờ sau đúng 2 phút
    const insertRes = await pool.request().query(`
      INSERT INTO Posts (
        page_id, content, media_type, scheduled_at, status, 
        content_hash, approved_hash, approved_by
      )
      OUTPUT INSERTED.id
      VALUES (
        '${pageId}', N'${content.replace(/'/g, "''")}', 'text', 
        DATEADD(minute, 2, SYSUTCDATETIME()), '${POST_STATES.APPROVED}',
        '${hash}', '${hash}', 'admin_tester'
      );
    `);
    const postId = insertRes.recordset[0].id;

    // Ghi Audit Log NEW -> APPROVED
    await pool.request().query(`
      INSERT INTO PostAuditLog (post_id, actor, from_state, to_state, reason, created_at)
      VALUES 
        (${postId}, 'admin_tester', 'NEW', 'NEW', 'Khởi tạo bài viết Ca 1', SYSUTCDATETIME()),
        (${postId}, 'admin_tester', 'NEW', 'APPROVED', 'Phê duyệt hợp lệ cho Ca 1', SYSUTCDATETIME());
    `);

    // Tạo 1 comment seeding hẹn sau 1 phút
    const commentRes = await pool.request().query(`
      INSERT INTO PostComments (
        post_id, comment_index, content, delay_minutes, status, created_at
      )
      OUTPUT INSERTED.id
      VALUES (
        ${postId}, 1, N'💬 Comment seeding tự động sau 1 phút thử nghiệm!', 1, 'pending', SYSUTCDATETIME()
      );
    `);
    const commentId = commentRes.recordset[0].id;

    console.log(`
✅ [CA 1 ĐÃ SẴN SÀNG - HAPPY PATH]
- ID Bài viết: #${postId}
- Fanpage ID: ${pageId}
- Nội dung: Đầy đủ xuống dòng, emoji (🎯 🚀 🔥) và link (https://google.com).
- Hẹn giờ đăng: Sau đúng 2 phút nữa (${new Date(Date.now() + 120000).toLocaleTimeString('vi-VN')}).
- Trạng thái: APPROVED (Đã duyệt hợp lệ, sẵn sàng để Poller xuất bản).
- Comment Seeding ID: #${commentId} (hẹn xuất bản sau published_at + 1 phút).

👉 HÀNH ĐỘNG TIẾP THEO:
1. Mở màn hình console của Server để quan sát Poller nhặt bài sau 2 phút:
   🚀 [StandaloneScheduler] Đang xuất bản bài #${postId}...
2. Sau khi bài lên, mở Fanpage trên Facebook để kiểm tra bài viết trực quan.
3. Chờ thêm 1 phút để kiểm tra comment seeding tự động xuất hiện dưới bài viết.
4. Chạy lệnh đối soát tự động:
   node ./scripts/page-test-helper.js verify-post ${postId}
`);
    process.exit(0);
  }

  if (command === 'setup-case-2-1') {
    const pageId = args[0] || '1123490870843189';
    const content = args[1] || 'Ca 2.1: Thử nghiệm rớt mạng trước khi tới Facebook - đối soát 1 bài duy nhất';
    const hash = computePostHash({ pageId, content });

    const insertRes = await pool.request().query(`
      INSERT INTO Posts (
        page_id, content, media_type, scheduled_at, status, 
        facebook_post_id, is_permanent_failure, retry_count, 
        next_retry_at, content_hash, approved_hash, approved_by
      )
      OUTPUT INSERTED.id
      VALUES (
        '${pageId}', N'${content.replace(/'/g, "''")}', 'text', SYSUTCDATETIME(), '${POST_STATES.APPROVED}',
        NULL, 0, 0,
        NULL, '${hash}', '${hash}', 'admin_tester'
      );
    `);
    const postId = insertRes.recordset[0].id;
    console.log(`
✅ [CASE 2.1 SẴN SÀNG] Đã khởi tạo bài viết #${postId}:
- Page ID: ${pageId}
- Trạng thái: APPROVED (đến giờ đăng ngay)
- Hash: Hợp lệ
`);
    process.exit(0);
  }

  if (command === 'setup-case-2-2') {
    const pageId = args[0] || '1123490870843189';
    const content = args[1] || `Thử nghiệm đối soát Feed Check sau Timeout 🎯
- Dòng 1: Xuống dòng chuẩn xác
- Dòng 2: Link kiểm tra https://google.com
Chúc một ngày làm việc hiệu quả! 🚀🔥`;
    if (!pageId) {
      console.error('Usage: node ./scripts/page-test-helper.js setup-case-2-2 <pageId> [content]');
      process.exit(1);
    }
    const hash = computePostHash({ pageId, content });
    
    // Tạo hoặc cập nhật bài viết ở trạng thái kẹt lỗi Timeout, mốc publishing_started_at lùi 15 phút
    // next_retry_at tạm hoãn 15 phút để bạn kịp đăng tay lên Facebook mà không lo Poller nhặt sớm
    const insertRes = await pool.request().query(`
      INSERT INTO Posts (
        page_id, content, media_type, scheduled_at, status, 
        facebook_post_id, is_permanent_failure, retry_count, 
        next_retry_at, last_error, last_error_code, last_error_subcode,
        publishing_started_at, content_hash, approved_hash, approved_by
      )
      OUTPUT INSERTED.id
      VALUES (
        '${pageId}', N'${content.replace(/'/g, "''")}', 'text', SYSUTCDATETIME(), '${POST_STATES.PUBLISH_RETRY_OR_FAILED}',
        NULL, 0, 1,
        DATEADD(minute, 15, SYSUTCDATETIME()), 'ETIMEDOUT: connect timeout to Facebook Graph API', NULL, NULL,
        DATEADD(minute, -15, SYSUTCDATETIME()), '${hash}', '${hash}', 'admin_tester'
      );
    `);
    const postId = insertRes.recordset[0].id;
    console.log(`
✅ [CASE 2.2 SẴN SÀNG] Đã khởi tạo bài viết #${postId} cho kịch bản đối soát Feed Check:
- Page ID: ${pageId}
- Trạng thái: ${POST_STATES.PUBLISH_RETRY_OR_FAILED} (retry_count = 1, is_permanent_failure = 0)
- Lỗi trước đó: ETIMEDOUT (Timeout giả lập)
- publishing_started_at: 15 phút trước (Mọi bài đăng tay lên Facebook từ lúc này trở đi sẽ được coi là hợp lệ)
- Hash: Khớp chuẩn (${hash.slice(0, 16)}...)

📋 CHUỖI NỘI DUNG CHÍNH XÁC ĐỂ COPY ĐĂNG TAY:
------------------------------------------------------------
${content}
------------------------------------------------------------

👉 HÀNH ĐỘNG TIẾP THEO:
1. Mở Facebook, vào Fanpage ${pageId} đăng BẰNG TAY đúng đoạn văn bản trên.
2. Sau khi đăng tay xong trên Facebook, chạy lệnh kích hoạt để Poller nhặt bài và đối soát:
   node ./scripts/page-test-helper.js trigger-case-2-2 ${postId}
3. Quan sát màn hình Server: Feed Check sẽ phát hiện bài bạn vừa đăng tay, chốt status = PUBLISHED, nhận ID thật của bài đó và KHÔNG đăng thêm bài mới!
4. Đối soát DB:
   node ./scripts/page-test-helper.js verify-post ${postId}
`);
    process.exit(0);
  }

  if (command === 'post-manual-fb') {
    const postId = args[0] || 196;
    const axios = require('axios');
    const { getFacebookPageAccessToken } = require('../src/utils/FacebookPageAccessToken');

    const postRes = await pool.request().query(`SELECT * FROM Posts WHERE id = ${postId};`);
    const post = postRes.recordset[0];
    if (!post) {
      console.error(`Không tìm thấy bài #${postId}`);
      process.exit(1);
    }

    const token = await getFacebookPageAccessToken(post.page_id);
    console.log(`\n📤 [GIẢ LẬP ĐĂNG TAY] Đang đăng bài #${postId} trực tiếp lên Facebook...`);
    console.log(`Nội dung:\n---\n${post.content}\n---`);

    const res = await axios.post(
      `https://graph.facebook.com/v19.0/${post.page_id}/feed`,
      { message: post.content },
      { headers: { Authorization: `Bearer ${token}` }, timeout: 20000 }
    );

    const manualFbId = res.data.id;
    console.log(`\n✅ [FACEBOOK POSTED] Bài đã xuất hiện trên Facebook với ID thật: ${manualFbId}`);
    console.log(`Bây giờ bạn hoặc hệ thống có thể chạy lệnh trigger:`);
    console.log(`  node ./scripts/page-test-helper.js trigger-case-2-2 ${postId}`);
    process.exit(0);
  }

  if (command === 'setup-case-2-3') {
    const pageId = args[0] || '1123490870843189';
    const hash = computePostHash({ pageId, content: '' });

    const insertRes = await pool.request().query(`
      INSERT INTO Posts (
        page_id, content, media_type, media_links, scheduled_at, status, 
        facebook_post_id, is_permanent_failure, retry_count, 
        next_retry_at, last_error, last_error_code, last_error_subcode,
        publishing_started_at, alerted_at, content_hash, approved_hash, approved_by
      )
      OUTPUT INSERTED.id
      VALUES (
        '${pageId}', '', 'image', 'https://picsum.photos/800/600', SYSUTCDATETIME(), '${POST_STATES.PUBLISH_RETRY_OR_FAILED}',
        NULL, 0, 1,
        DATEADD(second, -5, SYSUTCDATETIME()), 'ETIMEDOUT: connect timeout to Facebook Graph API', NULL, NULL,
        DATEADD(minute, -15, SYSUTCDATETIME()), NULL, '${hash}', '${hash}', 'admin_tester'
      );
    `);
    const postId = insertRes.recordset[0].id;
    console.log(`
✅ [CASE 2.3 SẴN SÀNG] Đã khởi tạo bài viết #${postId} (Ảnh không caption, dính timeout cần can thiệp thủ công):
- Page ID: ${pageId}
- media_type: image, content: (rỗng)
- Trạng thái ban đầu: ${POST_STATES.PUBLISH_RETRY_OR_FAILED} (retry_count = 1, is_permanent_failure = 0)
- Lỗi trước đó: ETIMEDOUT (Timeout)
- publishing_started_at: 15 phút trước
- next_retry_at: Quá hạn -> Poller sẽ nhặt ngay trong vòng 10 giây!

👉 KỲ VỌNG:
1. Feed check phát hiện caption rỗng -> Báo lỗi [CẦN CAN THIỆP THỦ CÔNG].
2. Hệ thống chuyển is_permanent_failure = 1, dừng retry vĩnh viễn (không đăng mù quáng lên FB).
3. Telegram nhận ĐÚNG 1 TIN NHẮN CẢNH BÁO.
4. Chạy lệnh đối soát:
   node ./scripts/page-test-helper.js verify-post ${postId}
`);
    process.exit(0);
  }

  if (command === 'setup-case-8') {
    const pageId = args[0] || '1123490870843189';
    const content = args[1] || 'Ca 8: Thử nghiệm giải cứu tự động bài viết bị kẹt PUBLISHING > 10 phút';
    const hash = computePostHash({ pageId, content });

    const insertRes = await pool.request().query(`
      INSERT INTO Posts (
        page_id, content, media_type, scheduled_at, status, 
        facebook_post_id, is_permanent_failure, retry_count, 
        next_retry_at, publishing_started_at, content_hash, approved_hash, approved_by
      )
      OUTPUT INSERTED.id
      VALUES (
        '${pageId}', N'${content.replace(/'/g, "''")}', 'text', DATEADD(minute, -20, SYSUTCDATETIME()), '${POST_STATES.PUBLISHING}',
        NULL, 0, 0,
        NULL, DATEADD(minute, -15, SYSUTCDATETIME()), '${hash}', '${hash}', 'admin_tester'
      );
    `);
    const postId = insertRes.recordset[0].id;

    await pool.request()
      .input('postId', sql.Int, postId)
      .input('actor', sql.VarChar(100), 'system_publisher')
      .input('fromState', sql.VarChar(50), POST_STATES.APPROVED)
      .input('toState', sql.VarChar(50), POST_STATES.PUBLISHING)
      .input('reason', sql.NVarChar, 'Bắt đầu xuất bản (Giả lập crash/stuck 15 phút trước)')
      .query(`INSERT INTO PostAuditLog (post_id, actor, from_state, to_state, reason, created_at) VALUES (@postId, @actor, @fromState, @toState, @reason, DATEADD(minute, -15, SYSUTCDATETIME()));`);

    console.log(`
✅ [CASE 8 SẴN SÀNG] Đã khởi tạo bài viết #${postId} ở trạng thái PUBLISHING bị kẹt 15 phút:
- Page ID: ${pageId}
- Trạng thái: PUBLISHING
- publishing_started_at: 15 phút trước
- Kỳ vọng: recoverStuckPublishingPosts sẽ giải cứu bài về PUBLISH_RETRY_OR_FAILED, sau đó Poller retry xuất bản an toàn lên FB!
`);
    process.exit(0);
  }

  if (command === 'setup-case-7') {
    const pageId = args[0] || '1123490870843189';
    const content = args[1] || 'Ca 7: Kiểm thử Token hết hạn 190 và tự động hồi sinh sau khi cập nhật token';
    const hash = computePostHash({ pageId, content });

    const insertRes = await pool.request().query(`
      INSERT INTO Posts (
        page_id, content, media_type, scheduled_at, status, 
        facebook_post_id, is_permanent_failure, retry_count, 
        next_retry_at, publishing_started_at, content_hash, approved_hash, approved_by
      )
      OUTPUT INSERTED.id
      VALUES (
        '${pageId}', N'${content.replace(/'/g, "''")}', 'text', DATEADD(minute, -5, SYSUTCDATETIME()), '${POST_STATES.APPROVED}',
        NULL, 0, 0,
        NULL, NULL, '${hash}', '${hash}', 'admin_tester'
      );
    `);
    const postId = insertRes.recordset[0].id;
    console.log(`
✅ [CASE 7 SẴN SÀNG] Đã khởi tạo bài viết #${postId} ở trạng thái APPROVED:
- Page ID: ${pageId}
- Nội dung: ${content}
- Bước tiếp theo:
  1. Bật giả lập token hỏng: node ./scripts/page-test-helper.js block-token-190
  2. Quan sát Poller thử đăng -> Lỗi 190 -> Chuyển is_permanent_failure = 1 -> Dừng retry -> Gửi Telegram
  3. Giả lập kết nối lại token qua Web UI: node ./scripts/page-test-helper.js revive-token-190 ${pageId}
  4. Bài viết tự động phục hồi về APPROVED và được đăng thành công!
`);
    process.exit(0);
  }

  if (command === 'block-token-190') {
    const fs = require('fs');
    const path = require('path');
    const flagPath = path.resolve(__dirname, '../temp_token_190.flag');
    fs.writeFileSync(flagPath, 'BLOCKED_TOKEN_190', 'utf8');
    console.log('🛑 [TOKEN 190 BLOCKED] Đã bật cờ giả lập lỗi Token 190 (temp_token_190.flag). Mọi lượt đăng tiếp theo sẽ nhận mã lỗi 190 OAuthException.');
    process.exit(0);
  }

  if (command === 'unblock-token-190') {
    const fs = require('fs');
    const path = require('path');
    const flagPath = path.resolve(__dirname, '../temp_token_190.flag');
    if (fs.existsSync(flagPath)) {
      fs.unlinkSync(flagPath);
      console.log('🟢 [TOKEN 190 UNBLOCKED] Đã xóa cờ giả lập lỗi Token 190.');
    }
    process.exit(0);
  }

  if (command === 'revive-token-190') {
    const pageId = args[0] || '1123490870843189';
    const fs = require('fs');
    const path = require('path');
    const flagPath = path.resolve(__dirname, '../temp_token_190.flag');
    if (fs.existsSync(flagPath)) {
      fs.unlinkSync(flagPath);
      console.log('🟢 [TOKEN UNBLOCKED] Đã tháo cờ lỗi token 190.');
    }

    const result = await pool.request()
      .input('pageId', sql.VarChar(100), pageId)
      .query(`
        UPDATE Posts 
        SET status = 'APPROVED',
            is_permanent_failure = 0,
            retry_count = 0,
            last_error = NULL,
            last_error_code = NULL,
            last_error_subcode = NULL,
            next_retry_at = NULL,
            alerted_at = NULL
        WHERE page_id = @pageId
          AND (last_error_code = 190 OR (is_permanent_failure = 1 AND (last_error LIKE '%token%' OR last_error LIKE '%190%')))
          AND content_hash IS NOT NULL
          AND approved_hash IS NOT NULL
          AND content_hash = approved_hash;
      `);

    console.log(`\n✨ [REVIVED] Đã giả lập kết nối lại Token thành công cho Fanpage ${pageId}! Số bài viết được hồi sinh về APPROVED: ${result.rowsAffected[0]}`);
    process.exit(0);
  }

  if (command === 'trigger-case-2-2') {
    const postId = args[0];
    if (!postId) {
      console.error('Usage: node ./scripts/page-test-helper.js trigger-case-2-2 <postId>');
      process.exit(1);
    }
    await pool.request().query(`
      UPDATE Posts 
      SET next_retry_at = DATEADD(second, -10, SYSUTCDATETIME()) 
      WHERE id = ${postId};
    `);
    console.log(`\n🚀 [TRIGGER SUCCESS] Đã bật cờ retry cho bài #${postId}. Poller sẽ tự động quét và đối soát Feed Check trong vòng 10 giây!`);
    process.exit(0);
  }

  if (command === 'block-fb' || command === 'block-network') {
    const fs = require('fs');
    const path = require('path');
    const flagPath = path.resolve(__dirname, '../temp_network_block.flag');
    fs.writeFileSync(flagPath, 'BLOCKED', 'utf8');
    console.log('🛑 [NETWORK BLOCKED] Đã bật cờ ngắt kết nối mạng tới Facebook Graph API (temp_network_block.flag).');
    process.exit(0);
  }

  if (command === 'unblock-fb' || command === 'unblock-network') {
    const fs = require('fs');
    const path = require('path');
    const flagPath = path.resolve(__dirname, '../temp_network_block.flag');
    if (fs.existsSync(flagPath)) {
      fs.unlinkSync(flagPath);
    }
    console.log('✅ [NETWORK RESTORED] Đã gỡ bỏ cờ ngắt kết nối, mạng tới Facebook Graph API hoạt động bình thường.');
    process.exit(0);
  }

  if (command === 'setup-retry-5') {
    const pageId = args[0];
    const content = args[1] || 'Bài test chạm ngưỡng 5 lần Retry dừng tự động';
    if (!pageId) {
      console.error('Usage: node ./scripts/page-test-helper.js setup-retry-5 <pageId> [content]');
      process.exit(1);
    }
    const hash = computePostHash({ pageId, content });
    
    // Tạo bài viết đang ở lần retry thứ 4 để lần tiếp theo chạm mốc 5
    const insertRes = await pool.request().query(`
      INSERT INTO Posts (
        page_id, content, media_type, scheduled_at, status, 
        facebook_post_id, is_permanent_failure, retry_count, 
        next_retry_at, last_error, last_error_code, last_error_subcode,
        alerted_at, content_hash, approved_hash, approved_by
      )
      OUTPUT INSERTED.id
      VALUES (
        '${pageId}', N'${content.replace(/'/g, "''")}', 'text', SYSUTCDATETIME(), '${POST_STATES.PUBLISH_RETRY_OR_FAILED}',
        NULL, 0, 4,
        DATEADD(second, -10, SYSUTCDATETIME()), 'ECONNRESET: simulated connection reset', NULL, NULL,
        NULL, '${hash}', '${hash}', 'admin_tester'
      );
    `);
    const postId = insertRes.recordset[0].id;
    console.log(`
✅ [RETRY 5 SẴN SÀNG] Đã khởi tạo bài viết #${postId}:
- Page ID: ${pageId}
- retry_count = 4 (lần xuất bản tiếp theo sẽ là lần 5)
- next_retry_at: Quá hạn (sẵn sàng để Poller nhặt ngay)
- alerted_at: NULL (chưa gửi cảnh báo)

👉 Khi Poller quét hoặc xuất bản bài này và thất bại:
- Hệ thống sẽ tăng retry_count lên 5.
- Cập nhật alerted_at = SYSUTCDATETIME().
- Gửi đúng 1 tin Telegram: "🚨 [CẦN CAN THIỆP THỦ CÔNG] Bài viết #${postId} đã thử lại 5 lần...".
- Các lần quét sau tuyệt đối không spam tin nhắn.
`);
    process.exit(0);
  }

  if (command === 'setup-concurrent') {
    const pageId = args[0];
    const content1 = args[1] || 'Bài test Concurrency Slot 1 #A';
    const content2 = args[2] || 'Bài test Concurrency Slot 2 #B';
    if (!pageId) {
      console.error('Usage: node ./scripts/page-test-helper.js setup-concurrent <pageId> [content1] [content2]');
      process.exit(1);
    }
    const hash1 = computePostHash({ pageId, content: content1 });
    const hash2 = computePostHash({ pageId, content: content2 });

    const res1 = await pool.request().query(`
      INSERT INTO Posts (page_id, content, media_type, scheduled_at, status, content_hash, approved_hash, approved_by)
      OUTPUT INSERTED.id
      VALUES ('${pageId}', N'${content1.replace(/'/g, "''")}', 'text', SYSUTCDATETIME(), '${POST_STATES.APPROVED}', '${hash1}', '${hash1}', 'admin_tester');
    `);
    const res2 = await pool.request().query(`
      INSERT INTO Posts (page_id, content, media_type, scheduled_at, status, content_hash, approved_hash, approved_by)
      OUTPUT INSERTED.id
      VALUES ('${pageId}', N'${content2.replace(/'/g, "''")}', 'text', SYSUTCDATETIME(), '${POST_STATES.APPROVED}', '${hash2}', '${hash2}', 'admin_tester');
    `);

    console.log(`
✅ [CONCURRENCY PAIR SẴN SÀNG] Đã tạo 2 bài viết cùng mốc thời gian:
- Bài #1: ID #${res1.recordset[0].id} ("${content1}")
- Bài #2: ID #${res2.recordset[0].id} ("${content2}")
- Cả 2 bài đều APPROVED và hẹn giờ ngay lúc này.
👉 Poller sẽ xử lý song song thông qua pLimit(2), không bài nào bị bỏ rơi hay xung đột claim.
`);
    process.exit(0);
  }

  if (command === 'verify-post') {
    const postId = args[0];
    if (!postId) {
      console.error('Usage: node ./scripts/page-test-helper.js verify-post <postId>');
      process.exit(1);
    }
    const check = await pool.request().query(`
      SELECT id, page_id, content, status, facebook_post_id, scheduled_at, published_at, 
             retry_count, is_permanent_failure, last_error_code, last_error, 
             next_retry_at, alerted_at, content_hash, approved_hash
      FROM Posts WHERE id = ${postId};
    `);
    if (check.recordset.length === 0) {
      console.log(`❌ Không tìm thấy bài viết #${postId}`);
      process.exit(1);
    }
    const post = check.recordset[0];
    console.log('\n📊 THÔNG TIN BÀI VIẾT #' + postId + ':');
    console.table([post]);

    const audit = await pool.request().query(`
      SELECT id, from_state, to_state, actor, reason, created_at
      FROM PostAuditLog WHERE post_id = ${postId} ORDER BY id ASC;
    `);
    console.log('📜 NHẬT KÝ CHUYỂN TRẠNG THÁI (PostAuditLog):');
    console.table(audit.recordset);

    const comments = await pool.request().query(`
      SELECT id, status, content, delay_minutes, created_at
      FROM PostComments WHERE post_id = ${postId};
    `);
    if (comments.recordset.length > 0) {
      console.log('💬 COMMENT SEEDING LIÊN QUAN:');
      console.table(comments.recordset);
    }
    process.exit(0);
  }

  if (command === 'run-ca-8') {
    const pageId = args[0] || '1123490870843189';
    const { assertPublishable } = require('../src/utils/PostExecutionService');
    const originalContent = 'Nội dung gốc đã được kiểm duyệt nghiêm ngặt bởi Admin';
    const originalHash = computePostHash({ pageId, content: originalContent });

    // 1. Tạo bài APPROVED
    const insertRes = await pool.request().query(`
      INSERT INTO Posts (page_id, content, media_type, scheduled_at, status, content_hash, approved_hash, approved_by)
      OUTPUT INSERTED.id
      VALUES ('${pageId}', N'${originalContent}', 'text', DATEADD(second, -5, SYSUTCDATETIME()), '${POST_STATES.APPROVED}', '${originalHash}', '${originalHash}', 'admin_tester');
    `);
    const postId = insertRes.recordset[0].id;
    console.log(`\n1️⃣ Đã tạo bài APPROVED #${postId} với hash: ${originalHash.slice(0, 16)}...`);

    // 2. Kẻ xấu sửa lén trong DB: sửa nội dung nhưng không cập nhật approved_hash
    const tamperedContent = originalContent + ' [CHÈN LINK ĐỘC HẠI]';
    const tamperedHash = computePostHash({ pageId, content: tamperedContent });
    await pool.request().query(`
      UPDATE Posts SET content = N'${tamperedContent}', content_hash = '${tamperedHash}' WHERE id = ${postId};
    `);
    console.log(`2️⃣ Đã giả lập sửa lén nội dung trong DB -> content_hash (${tamperedHash.slice(0, 16)}...) != approved_hash`);

    // 3. Kiểm tra Poller SQL query
    const pollerQuery = await pool.request().query(`
      SELECT id FROM Posts 
      WHERE id = ${postId}
        AND status IN ('${POST_STATES.APPROVED}', 'scheduled')
        AND scheduled_at <= SYSUTCDATETIME()
        AND content_hash IS NOT NULL
        AND approved_hash IS NOT NULL
        AND content_hash = approved_hash;
    `);
    const pollerIgnored = pollerQuery.recordset.length === 0;

    // 4. Kiểm tra assertPublishable
    const postInDb = (await pool.request().query(`SELECT * FROM Posts WHERE id = ${postId};`)).recordset[0];
    let assertBlocked = false;
    let blockedReason = '';
    try {
      assertPublishable(postInDb);
    } catch (e) {
      assertBlocked = true;
      blockedReason = e.message;
    }

    console.log(`3️⃣ Poller quét database: ${pollerIgnored ? '✅ ĐÃ BỎ QUA BÀI VIẾT (Không nhặt lên xuất bản)' : '❌ LỖI: Poller vẫn nhặt bài'}`);
    console.log(`4️⃣ Lớp phòng thủ assertPublishable: ${assertBlocked ? '✅ ĐÃ CHẶN XUẤT BẢN THÀNH CÔNG (' + blockedReason + ')' : '❌ LỖI: Không chặn'}`);

    if (pollerIgnored && assertBlocked) {
      console.log(`\n🎉 [CA 8 THÀNH CÔNG 100%] Bài viết #${postId} bị can thiệp trái phép không thể xuất bản lên Facebook!`);
    } else {
      console.log(`\n❌ [CA 8 THẤT BẠI]`);
    }
    process.exit(0);
  }

  if (command === 'run-ca-9') {
    const { evaluateContentSafety } = require('../src/utils/PostStateMachine');
    const content = 'Sản phẩm serum trị mụn cam kết 100% hiệu quả sau 7 ngày sử dụng!';
    console.log(`\n1️⃣ Nội dung kiểm tra: "${content}"`);
    const safety = evaluateContentSafety('', content);

    console.log(`2️⃣ Kết quả phân loại bảo mật:`);
    console.log(`- Trạng thái phân loại: ${safety.state}`);
    console.log(`- Lý do: ${safety.reasons.join('; ')}`);

    const isPendingReview = safety.state === POST_STATES.PENDING_REVIEW;
    const isNotBlocked = safety.state !== POST_STATES.BLOCKED;

    if (isPendingReview && isNotBlocked) {
      console.log(`\n🎉 [CA 9 THÀNH CÔNG 100%] Cụm từ "cam kết 100% hiệu quả" được đưa vào PENDING_REVIEW để người duyệt, KHÔNG BỊ CHẶN OAN (BLOCKED)!`);
    } else {
      console.log(`\n❌ [CA 9 THẤT BẠI] Bài bị gán sai trạng thái: ${safety.state}`);
    }
    process.exit(0);
  }

  console.log(`
🛠️ PAGE TEST HELPER TOOL
Cách dùng:
  node ./scripts/page-test-helper.js setup-ca-1 [pageId]
  node ./scripts/page-test-helper.js setup-case-2-2 <pageId> [content]
  node ./scripts/page-test-helper.js setup-retry-5 <pageId> [content]
  node ./scripts/page-test-helper.js setup-concurrent <pageId> [content1] [content2]
  node ./scripts/page-test-helper.js run-ca-8 [pageId]
  node ./scripts/page-test-helper.js run-ca-9
  node ./scripts/page-test-helper.js verify-post <postId>
`);
  process.exit(0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
