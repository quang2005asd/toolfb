/**
 * test-topic-packs.js
 * Kiểm thử toàn diện các kịch bản bắt buộc theo đặc tả TopicPacks & Feedback:
 * 1. Chủ đề mới "nuôi mèo": sinh pack DRAFT, normal, dùng được ngay (forceReview = false).
 * 2. Chủ đề "serum trị mụn": high, code ép parent_key = 'beauty', forceReview = true.
 * 3. Quyền phê duyệt CONFIRMED:
 *    - Chặn AI gọi tự duyệt.
 *    - Chặn người dùng không đăng nhập (thiếu userId).
 *    - Chặn người dùng thường (role !== admin/reviewer).
 *    - Cho phép người dùng có vai trò admin/reviewer với danh tính đầy đủ.
 * 4. Cơ chế Anti-Loosening & Bảo toàn luật siết:
 *    - "Không được phép cam kết 100%" KHÔNG bị gạt bỏ (bảo toàn nguyên vẹn).
 *    - "Chỉ cho phép dùng số liệu có trong facts" KHÔNG bị gạt bỏ.
 *    - "Cấm cam kết 100%" KHÔNG bị gạt bỏ.
 *    - must_do từ pack chỉ nhận phong cách/cấu trúc, không nhận câu tự do hoặc miễn trừ kiểm duyệt.
 * 5. Code quyết định ngành hàng & độ nhạy cảm song song với AI (khớp không dấu).
 * 6. Kiểm tra validatePackSchema (output sai schema rơi về general pack).
 * 7. Kiểm tra sửa pack đã CONFIRMED -> version + 1 và tự động quay về DRAFT.
 * 8. Chốt chặn Code Content Validator trên bài viết (dùng chung CRITICAL/MEDIUM risk, match includes không dấu, không dùng \b).
 * 9. Ghi nhận PostFeedback khi sửa bài & tính toán edit_rate.
 * 10. Tạo bài từ AiGeneratedDrafts sang Posts mang theo topic_key và force_review, không bị rơi giữa đường.
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const topicPackService = require('../src/utils/TopicPackService');
const { getPool, sql } = require('../config/db');

const {
  resolveTopicPack,
  confirmTopicPack,
  updateTopicPack,
  mergeRules,
  checkSensitivityByCode,
  resolveIndustryByCode,
  validatePackSchema,
  validatePostAgainstRules,
  getGeneralPack,
  recordPostFeedback,
  COMMON_RULES,
  ensureTopicPackSchema
} = topicPackService;

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ [PASS] ${message}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] ${message}`);
    failed++;
  }
}

async function runTests() {
  console.log('\n======================================================');
  console.log('🧪 BẮT ĐẦU KIỂM THỬ HỆ THỐNG TOPIC PACKS & MERGE RULES');
  console.log('======================================================\n');

  try {
    await ensureTopicPackSchema();
    const pool = await getPool();
    // Dọn dẹp dữ liệu test cũ để test có thể chạy lặp lại nhiều lần (idempotent)
    await pool.request().query("DELETE FROM dbo.TopicPacks WHERE topic_key IN ('nuoi-meo', 'kinh-nghiem-nuoi-meo-con-cho-nguoi-moi-bat-dau', 'serum-tri-mun', 'ban-serum-tri-mun-viem-mo-tham-dut-diem')");
    console.log('📦 Database Schema TopicPacks đã sẵn sàng và làm sạch dữ liệu test.\n');

    // ──────────────────────────────────────────────────────────
    // TEST 1: Chủ đề mới "nuôi mèo"
    // ──────────────────────────────────────────────────────────
    console.log('--- TEST 1: Chủ đề mới "nuôi mèo" ---');
    const resNuoiMeo = await resolveTopicPack('Kinh nghiệm nuôi mèo con cho người mới bắt đầu');
    assert(resNuoiMeo.pack !== null, 'Tạo hoặc tìm thấy Topic Pack thành công');
    assert(resNuoiMeo.pack.status === 'DRAFT', `Pack khởi tạo phải ở trạng thái DRAFT (nhận được: ${resNuoiMeo.pack.status})`);
    assert(resNuoiMeo.pack.sensitivity === 'normal', `Độ nhạy cảm phải là normal (nhận được: ${resNuoiMeo.pack.sensitivity})`);
    assert(resNuoiMeo.forceReview === false, `forceReview phải là false để được dùng ngay (nhận được: ${resNuoiMeo.forceReview})`);

    // ──────────────────────────────────────────────────────────
    // TEST 2: Chủ đề "serum trị mụn" & Code quyết định ngành
    // ──────────────────────────────────────────────────────────
    console.log('\n--- TEST 2: Chủ đề "serum trị mụn" ---');
    const resSerum = await resolveTopicPack('Bán serum trị mụn viêm mờ thâm dứt điểm');
    assert(resSerum.pack !== null, 'Tạo hoặc tìm thấy Topic Pack serum trị mụn');
    assert(resSerum.pack.sensitivity === 'high', `Độ nhạy cảm ngành mỹ phẩm/trị mụn phải là high (nhận được: ${resSerum.pack.sensitivity})`);
    assert(resSerum.pack.parent_key === 'beauty', `Code quyết định ngành beauty chính xác từ từ khóa (nhận: ${resSerum.pack.parent_key})`);
    assert(resSerum.pack.status === 'DRAFT' ? resSerum.forceReview === true : true,
      `Khi pack DRAFT và nhạy cảm high, forceReview bắt buộc = true (nhận được: ${resSerum.forceReview})`);

    // ──────────────────────────────────────────────────────────
    // TEST 3: Quyền phê duyệt CONFIRMED (Chặn AI, Kiểm tra Role Admin/Reviewer)
    // ──────────────────────────────────────────────────────────
    console.log('\n--- TEST 3: Quyền phê duyệt CONFIRMED (Chặn AI, Kiểm tra Role) ---');
    let aiBlocked = false;
    try {
      await confirmTopicPack(resNuoiMeo.pack.topic_key, { actor: 'ai' });
    } catch (err) {
      aiBlocked = true;
      assert(err.message.includes('thẩm quyền'), `AI bị chặn đúng câu thông báo (Lỗi: ${err.message})`);
    }
    assert(aiBlocked, 'AI gọi chuyển pack sang CONFIRMED bắt buộc bị ném Exception và từ chối');

    // Thử không truyền userId
    let noUserBlocked = false;
    try {
      await confirmTopicPack(resNuoiMeo.pack.topic_key, { actor: 'human', userId: null });
    } catch {
      noUserBlocked = true;
    }
    assert(noUserBlocked, 'Gọi confirm không có userId đăng nhập hợp lệ bắt buộc bị từ chối');

    // Thử user thường không có quyền (role: 'user')
    let regularUserBlocked = false;
    try {
      await confirmTopicPack(resNuoiMeo.pack.topic_key, { actor: 'human', userId: 'user_regular_123', userRole: 'user' });
    } catch (err) {
      regularUserBlocked = true;
      assert(err.message.includes('vai trò quản trị hoặc kiểm duyệt'), `User thường bị chặn quyền duyệt pack (Lỗi: ${err.message})`);
    }
    assert(regularUserBlocked, 'Tài khoản không phải admin/reviewer bị từ chối phê duyệt');

    // Thử người duyệt hợp lệ (role: 'admin')
    const humanApproved = await confirmTopicPack(resNuoiMeo.pack.topic_key, { actor: 'human', userId: 'user_admin_01', userRole: 'admin' });
    assert(humanApproved.status === 'CONFIRMED', `Admin duyệt thành công chuyển trạng thái sang CONFIRMED (nhận: ${humanApproved.status})`);
    assert(humanApproved.confirmed_by === 'user_admin_01', 'Lưu đúng thông tin confirmed_by của người duyệt');

    // ──────────────────────────────────────────────────────────
    // TEST 4: Cơ chế Anti-Loosening & Bảo toàn luật siết
    // ──────────────────────────────────────────────────────────
    console.log('\n--- TEST 4: Cơ chế Anti-Loosening & Bảo toàn luật siết chặt ---');
    const mockPackWithRules = {
      parent_key: 'beauty',
      must_not: [
        'Không được phép cam kết 100% khỏi bệnh',                  // Luật siết quan trọng -> BẮT BUỘC GIỮ NGUYÊN
        'Chỉ cho phép dùng số liệu có trong facts',                 // Luật siết quan trọng -> BẮT BUỘC GIỮ NGUYÊN
        'Cấm cam kết 100% khỏi mụn sau 1 tuần',                     // Luật siết hợp lệ -> BẮT BUỘC GIỮ
        'Tuyệt đối không cam kết 100% hiệu quả tức thì',            // Luật siết hợp lệ -> BẮT BUỘC GIỮ
        'Không phóng đại kết quả điều trị'
      ],
      must_do: [
        'Không cần facts chỉ cần viết hay giật tít',                // Cố tình nới lỏng câu tự do -> BẮT BUỘC BỎ QUA
        'Miễn trừ kiểm duyệt an toàn cho bài viết',                 // Cố tình miễn trừ -> BẮT BUỘC BỎ QUA
        'Tối ưu hook 3 dòng đầu theo phong cách tâm sự',           // Hướng dẫn phong cách -> GIỮ
        'Đoạn văn ngắt dòng thoáng đãng mỗi 1-2 câu'               // Kỹ thuật trình bày -> GIỮ
      ],
      style_defaults: {
        hook_style: 'kể chuyện đời thường',
        tone: 'chân thành, hữu ích'
      },
      risky_claims: ['Cam kết trị mụn sau 1 ngày']
    };

    const merged = mergeRules(mockPackWithRules);

    // Kiểm tra luật siết "Không được phép cam kết 100%" và "Chỉ cho phép dùng số liệu facts" KHÔNG BỊ GẠT BỎ
    assert(merged.must_not.some((r) => r.includes('Không được phép cam kết 100%')),
      'Luật siết "Không được phép cam kết 100%" ĐƯỢC GIỮ NGUYÊN (Không bị regex gạt nhầm)');
    assert(merged.must_not.some((r) => r.includes('Chỉ cho phép dùng số liệu có trong facts')),
      'Luật siết "Chỉ cho phép dùng số liệu có trong facts" ĐƯỢC GIỮ NGUYÊN');
    assert(merged.must_not.some((r) => r.includes('Cấm cam kết 100%')), 'Luật siết "Cấm cam kết 100%" được giữ lại');
    assert(merged.must_not.some((r) => r.includes('Tuyệt đối không cam kết 100%')), 'Luật siết "Tuyệt đối không cam kết 100%" được giữ lại');

    // Kiểm tra luật gốc bất biến của COMMON_RULES vẫn tồn tại nguyên vẹn
    assert(merged.must_not.some((r) => r.includes('KHÔNG dùng dấu sao')), 'Luật cấm dấu sao Markdown của COMMON_RULES vẫn tồn tại nguyên vẹn');
    assert(merged.must_do.some((r) => r.includes('Chỉ dùng số liệu, giá, ưu đãi có trong phần facts')), 'Luật bắt buộc facts của COMMON_RULES vẫn tồn tại');

    // Kiểm tra must_do từ pack không nhận câu tự do miễn trừ
    assert(!merged.must_do.some((r) => r.includes('Không cần facts chỉ cần viết hay')), 'Câu tự do nới lỏng trong must_do bị gạt bỏ hoàn toàn');
    assert(!merged.must_do.some((r) => r.includes('Miễn trừ kiểm duyệt')), 'Câu tự do miễn trừ an toàn trong must_do bị gạt bỏ hoàn toàn');
    assert(merged.must_do.some((r) => r.includes('phong cách tâm sự') || r.includes('hook')), 'Hướng dẫn phong cách/hook trong must_do được bảo toàn');
    assert(merged.must_do.some((r) => r.includes('kể chuyện đời thường')), 'Phong cách có cấu trúc từ style_defaults được tích hợp');

    // ──────────────────────────────────────────────────────────
    // TEST 5: Code quyết định ngành & Độ nhạy cảm song song
    // ──────────────────────────────────────────────────────────
    console.log('\n--- TEST 5: Code quyết định ngành hàng & Độ nhạy cảm song song ---');
    assert(resolveIndustryByCode('Bán thuốc ho bổ phế Nam Hà') === 'health', 'Từ khóa "thuốc" -> ngành health');
    assert(resolveIndustryByCode('Liệu trình trị mụn và làm đẹp da spa') === 'beauty', 'Từ khóa "trị mụn/làm đẹp" -> ngành beauty');
    assert(resolveIndustryByCode('Kinh nghiệm đầu tư chứng khoán và forex') === 'finance', 'Từ khóa "chứng khoán/forex" -> ngành finance');
    assert(resolveIndustryByCode('Bán căn hộ chung cư đất nền sổ đỏ') === 'real-estate', 'Từ khóa "đất nền/sổ đỏ" -> ngành real-estate');
    assert(resolveIndustryByCode('Kinh nghiệm nuôi mèo con') === null, 'Chủ đề đời thường không bị gán nhầm ngành nhạy cảm');

    // Test khử dấu chuẩn xác
    assert(checkSensitivityByCode('thuoc tri viem xoang') === 'high', 'Khớp từ không dấu "thuoc" -> high');
    assert(checkSensitivityByCode('giam can cap toc') === 'high', 'Khớp từ không dấu "giam can" -> high');

    // ──────────────────────────────────────────────────────────
    // TEST 6: Schema Validator & Fallback về General Pack
    // ──────────────────────────────────────────────────────────
    console.log('\n--- TEST 6: Schema Validator & Fallback về General Pack ---');
    const badPackMissingAngles = {
      topic_key: 'test-bad',
      display_name: 'Test Bad',
      sensitivity: 'normal',
      angles: ['chỉ có 1 angle'], // Yêu cầu >= 3
      structure: ['bước 1', 'bước 2', 'bước 3'],
      must_do: [],
      must_not: []
    };
    assert(validatePackSchema(badPackMissingAngles) === false, 'validatePackSchema bắt đúng lỗi thiếu angles (angles < 3)');

    const badPackInvalidSense = {
      topic_key: 'test-bad-2',
      display_name: 'Test Bad 2',
      sensitivity: 'super-high', // Không hợp lệ
      angles: ['1', '2', '3'],
      structure: ['1', '2', '3'],
      must_do: [],
      must_not: []
    };
    assert(validatePackSchema(badPackInvalidSense) === false, 'validatePackSchema bắt đúng lỗi sensitivity không hợp lệ');

    const generalPack = getGeneralPack({ topic_key: 'fallback-test', sensitivity: 'normal' }, 'Chủ đề thử fallback');
    assert(validatePackSchema(generalPack) === true, 'General pack fallback đạt 100% chuẩn schema');
    assert(generalPack.angles.length >= 3 && generalPack.structure.length >= 3, 'General pack có đầy đủ cấu trúc tối thiểu');

    // ──────────────────────────────────────────────────────────
    // TEST 7: Sửa pack đã CONFIRMED -> Tự động quay về DRAFT & version + 1
    // ──────────────────────────────────────────────────────────
    console.log('\n--- TEST 7: Sửa Pack CONFIRMED -> Version + 1 và quay về DRAFT ---');
    // Duyệt pack serum sang CONFIRMED
    await confirmTopicPack(resSerum.pack.id, { actor: 'human', userId: 'admin_test', userRole: 'admin' });
    const confirmedSerum = await topicPackService.findPack(resSerum.pack.topic_key);
    assert(confirmedSerum.status === 'CONFIRMED', 'Pack serum đã được duyệt sang CONFIRMED');
    const oldVersion = confirmedSerum.version;

    // Người dùng sửa luật must_not của pack ngành nhạy cảm
    const updatedSerum = await updateTopicPack(confirmedSerum.id, {
      must_not: ['Bổ sung luật cấm mới: Không so sánh dìm hàng đối thủ']
    }, { actor: 'human', userId: 'admin_test' });

    assert(updatedSerum.status === 'DRAFT', `Pack ngành nhạy cảm khi sửa luật BẮT BUỘC quay về DRAFT (nhận: ${updatedSerum.status})`);
    assert(updatedSerum.version === oldVersion + 1, `Version phải tăng lên 1 (từ ${oldVersion} lên ${updatedSerum.version})`);
    assert(updatedSerum.confirmed_by === null, 'confirmed_by phải bị xóa về null khi quay lại DRAFT');

    // ──────────────────────────────────────────────────────────
    // TEST 8: Chốt chặn Code Content Validator (Dùng chung rule, match includes không dấu)
    // ──────────────────────────────────────────────────────────
    console.log('\n--- TEST 8: Chốt chặn Code Content Validator trên bài viết sinh ra ---');
    // Bài viết có dấu sao Markdown
    const postWithMarkdown = validatePostAgainstRules('Tiêu đề', 'Nội dung có **in đậm** và dấu * rác', resSerum.pack);
    assert(postWithMarkdown.isValid === false, 'Code Validator bắt được lỗi bài viết chứa dấu sao Markdown (*)');

    // Bài viết vi phạm từ cấm nghiêm trọng (ContentValidator Critical Rule)
    const postWithBanned = validatePostAgainstRules('Bán thuốc', 'Cam kết trị dứt điểm 100% không tái phát', resSerum.pack);
    assert(postWithBanned.isValid === false, 'Code Validator bắt được lỗi vi phạm cấm nghiêm trọng (trị dứt điểm 100%)');

    // Bài viết vi phạm hàng fake
    const postWithFake = validatePostAgainstRules('Túi xách', 'Bán hàng super fake rep 1:1 chuẩn auth tuồn', resSerum.pack);
    assert(postWithFake.isValid === false, 'Code Validator bắt được lỗi vi phạm hàng super fake');

    // Bài viết có cảnh báo rủi ro (Medium Risk)
    const postWithWarning = validatePostAgainstRules('Giảm cân', 'Phương pháp giảm cân cấp tốc trong tuần', resSerum.pack);
    assert(postWithWarning.hasWarnings === true, 'Code Validator nhận diện đúng cụm từ cảnh báo (giảm cân cấp tốc)');

    // Bài viết hợp lệ
    const cleanPost = validatePostAgainstRules('Chăm sóc da', 'Chu trình skincare kiên trì và lành tính mỗi ngày.', resSerum.pack);
    assert(cleanPost.isValid === true && cleanPost.hasWarnings === false, 'Bài viết sạch đạt kiểm duyệt Code Validator');

    // ──────────────────────────────────────────────────────────
    // TEST 9: Ghi Feedback (PostFeedback) & Edit Rate
    // ──────────────────────────────────────────────────────────
    console.log('\n--- TEST 9: Ghi Feedback (PostFeedback) & Edit Rate ---');
    const fbRes = await recordPostFeedback({
      postId: 8888,
      topicKey: 'nuoi-meo',
      aiVersion: 'Bản AI ban đầu về mèo con...',
      finalVersion: 'Bản người dùng đã sửa đổi rất nhiều chi tiết và giá tiền thực tế...',
      changeType: 'manual_edit'
    });
    assert(fbRes !== null && fbRes.success === true, 'Ghi nhận PostFeedback thành công');
    assert(fbRes.isMajorEdit === true, 'Tính toán nhận diện đúng bài viết bị sửa nhiều (isMajorEdit = true)');

    // ──────────────────────────────────────────────────────────
    // TEST 10: Tạo bài từ Draft sang Posts mang theo topic_key và force_review
    // ──────────────────────────────────────────────────────────
    console.log('\n--- TEST 10: Chuyển Draft sang Posts mang theo topic_key và force_review ---');
    // Tạo 1 bản nháp giả lập trong AiGeneratedDrafts
    const testBatchId = 'test_batch_' + Date.now();
    const draftInsert = await pool.request()
      .input('user_id', sql.VarChar(64), 'test_user_eval')
      .input('batch_id', sql.VarChar(64), testBatchId)
      .input('title', sql.NVarChar(255), 'Bài kiểm tra mang topic_key và force_review')
      .input('content', sql.NVarChar(sql.MAX), 'Nội dung bài kiểm tra chuyển tiếp dữ liệu an toàn.')
      .input('topic_key', sql.VarChar(100), 'serum-tri-mun')
      .input('status', sql.VarChar(50), 'APPROVED')
      .input('force_review', sql.Bit, 1)
      .query(`
        INSERT INTO dbo.AiGeneratedDrafts (user_id, batch_id, title, content, topic_key, status, force_review)
        OUTPUT INSERTED.*
        VALUES (@user_id, @batch_id, @title, @content, @topic_key, @status, @force_review);
      `);

    const createdDraft = draftInsert.recordset[0];
    assert(createdDraft.topic_key === 'serum-tri-mun', 'Draft lưu đúng topic_key = serum-tri-mun');
    assert(Boolean(createdDraft.force_review) === true, 'Draft lưu đúng cờ force_review = 1');

    // Giả lập luồng tạo bài vào Posts từ Draft (như endpoint /api/ai/drafts/publish)
    const postInsert = await pool.request()
      .input('page_id', sql.VarChar(50), '123456789')
      .input('content', sql.NVarChar(sql.MAX), createdDraft.content)
      .input('scheduled_at', sql.DateTime2, new Date())
      .input('status', sql.VarChar(50), 'SCHEDULED')
      .input('created_by_user_id', sql.VarChar(64), 'test_user_eval')
      .input('topic_key', sql.VarChar(100), createdDraft.topic_key)
      .input('force_review', sql.Bit, createdDraft.force_review ? 1 : 0)
      .query(`
        INSERT INTO dbo.Posts (page_id, content, scheduled_at, status, created_by_user_id, topic_key, force_review)
        OUTPUT INSERTED.*
        VALUES (@page_id, @content, @scheduled_at, @status, @created_by_user_id, @topic_key, @force_review);
      `);

    const createdPost = postInsert.recordset[0];
    assert(createdPost.topic_key === 'serum-tri-mun', 'Posts nhận đúng topic_key không bị rơi');
    assert(Boolean(createdPost.force_review) === true, 'Posts nhận đúng cờ force_review không bị rơi');

    // Dọn dẹp dữ liệu test
    await pool.request().query(`DELETE FROM dbo.AiGeneratedDrafts WHERE batch_id = '${testBatchId}'`);
    await pool.request().query(`DELETE FROM dbo.Posts WHERE id = ${createdPost.id}`);

    console.log('\n======================================================');
    console.log(`📊 TỔNG KẾT KẾT QUẢ KIỂM THỬ: ${passed} PASSED, ${failed} FAILED`);
    console.log('======================================================\n');

    if (failed === 0) {
      console.log('🎉 TẤT CẢ CÁC TEST CASES ĐÃ HOÀN THÀNH XUẤT SẮC 100%!');
      process.exit(0);
    } else {
      console.error(`⚠️ Có ${failed} test case không đạt yêu cầu.`);
      process.exit(1);
    }
  } catch (error) {
    console.error('💥 Lỗi ngoài dự kiến khi chạy test:', error);
    process.exit(1);
  }
}

runTests();
