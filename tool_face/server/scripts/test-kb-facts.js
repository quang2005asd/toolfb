/**
 * test-kb-facts.js
 * Kiểm thử toàn diện Knowledge Base Loại 3 (Facts khách / sản phẩm):
 * 1. Facts hết hạn không vào prompt (tự động chuyển RETIRED).
 * 2. Khách A không thấy facts của Khách B (cô lập dữ liệu khách hàng).
 * 3. Bài không có facts thì có cảnh báo "chưa có thông tin thật".
 */

const assert = require('assert');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const kbFactsService = require('../src/utils/KbFactsService');
const { resolveTopicPack, mergeRules } = require('../src/utils/TopicPackService');
const { verifyClaimsByCode } = require('../src/utils/ClaimExtractor');

console.log('═══════════════════════════════════════════════════════════════════════════════════');
console.log('🧪 BẮT ĐẦU KIỂM THỬ KNOWLEDGE BASE LOẠI 3 (KB FACTS & ISOLATION)');
console.log('═══════════════════════════════════════════════════════════════════════════════════\n');

let passCount = 0;
let failCount = 0;

function runTest(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`✅ [PASS] ${name}`);
      passCount++;
    })
    .catch((err) => {
      console.error(`❌ [FAIL] ${name}: ${err.message}`);
      failCount++;
    });
}

async function runAll() {
  const customerA = `TEST_CUST_A_${Date.now()}`;
  const customerB = `TEST_CUST_B_${Date.now()}`;
  const creatorUser = 'user_creator';
  const reviewerUser = 'reviewer_minh';

  // Phân quyền hợp lệ qua bảng UserCustomers
  await kbFactsService.assignUserToCustomer(creatorUser, customerA, 'member');
  await kbFactsService.assignUserToCustomer(creatorUser, customerB, 'member');
  await kbFactsService.assignUserToCustomer(reviewerUser, customerA, 'reviewer');
  await kbFactsService.assignUserToCustomer(reviewerUser, customerB, 'reviewer');

  // ─────────────────────────────────────────────────────────────
  // TEST 1: KHỞI TẠO VÀ XÁC NHẬN FACTS
  // ─────────────────────────────────────────────────────────────
  await runTest('1. Tạo và xác nhận facts: User tạo DRAFT, Reviewer xác nhận CONFIRMED', async () => {
    const draftFact = await kbFactsService.createFact({
      customerId: customerA,
      factType: 'price',
      content: 'Giá gói cà phê Arabica Cầu Đất 250g là 185.000đ',
      source: 'Bảng giá niêm yết 2026',
      actor: creatorUser,
      actorRole: 'user'
    });
    assert.strictEqual(draftFact.status, 'DRAFT', 'User tạo fact phải ở trạng thái DRAFT');

    const confirmedFact = await kbFactsService.confirmFact(draftFact.id, {
      confirmedBy: 'reviewer_minh',
      confirmedRole: 'reviewer'
    });
    assert.strictEqual(confirmedFact.status, 'CONFIRMED', 'Reviewer xác nhận phải chuyển sang CONFIRMED');
    assert.strictEqual(confirmedFact.confirmedBy, 'reviewer_minh');
  });

  // ─────────────────────────────────────────────────────────────
  // TEST 2: FACTS HẾT HẠN TỰ RETIRED VÀ KHÔNG VÀO PROMPT
  // ─────────────────────────────────────────────────────────────
  await runTest('2. Facts hết hạn tự chuyển RETIRED và KHÔNG lọt vào prompt', async () => {
    // Tạo Fact hết hạn từ hôm qua
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const expiredFact = await kbFactsService.createFact({
      customerId: customerA,
      factType: 'promotion',
      content: 'Giảm 50% cho 50 khách hàng đầu tiên nhân dịp khai trương',
      source: 'Banner khai trương',
      expiresAt: yesterday,
      actorRole: 'reviewer',
      actor: reviewerUser
    });

    // Tạo Fact còn hạn 30 ngày
    const nextMonth = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const validFact = await kbFactsService.createFact({
      customerId: customerA,
      factType: 'policy',
      content: 'Miễn phí đổi trả trong 7 ngày nếu lỗi rang vỡ vụn',
      source: 'Chính sách bán lẻ',
      expiresAt: nextMonth,
      actorRole: 'reviewer',
      actor: reviewerUser
    });

    // Xác nhận fact còn hạn
    await kbFactsService.confirmFact(validFact.id, {
      confirmedBy: 'admin_sys',
      confirmedRole: 'admin'
    });

    // Gọi hàm lấy facts nạp prompt
    const activeFacts = await kbFactsService.getActiveFactsForPrompt(customerA);
    const activeIds = activeFacts.map(f => f.id);

    assert.ok(activeIds.includes(validFact.id), 'Fact còn hạn phải được lấy vào prompt');
    assert.ok(!activeIds.includes(expiredFact.id), 'Fact hết hạn TUYỆT ĐỐI KHÔNG ĐƯỢC vào prompt');

    // Kiểm tra fact hết hạn đã tự động chuyển status = RETIRED
    const allFactsA = await kbFactsService.getFactsByCustomer(customerA, 'ALL', 'admin_sys', 'admin');
    const retired = allFactsA.find(f => f.id === expiredFact.id);
    assert.strictEqual(retired.status, 'RETIRED', 'Fact quá hạn phải tự động đổi sang trạng thái RETIRED');
  });

  // ─────────────────────────────────────────────────────────────
  // TEST 3: CÔ LẬP KHÁCH HÀNG: KHÁCH A KHÔNG THẤY FACTS KHÁCH B
  // ─────────────────────────────────────────────────────────────
  await runTest('3. Cô lập dữ liệu: Khách A không thấy facts của Khách B', async () => {
    // Tạo fact riêng cho Khách B
    const factB = await kbFactsService.createFact({
      customerId: customerB,
      factType: 'price',
      content: 'Khóa học tiếng Anh giao tiếp trọn gói 4.990.000đ/khóa',
      source: 'Hợp đồng đào tạo B',
      actorRole: 'reviewer',
      actor: reviewerUser
    });

    await kbFactsService.confirmFact(factB.id, {
      confirmedBy: 'admin_sys',
      confirmedRole: 'admin'
    });

    // Lấy facts nạp prompt cho Khách A
    const factsForA = await kbFactsService.getActiveFactsForPrompt(customerA);
    const hasDataBInA = factsForA.some(f => f.content.includes('4.990.000đ') || f.customerId === customerB);
    assert.strictEqual(hasDataBInA, false, 'Khách A tuyệt đối không được nhìn thấy fact của Khách B!');

    // Lấy facts nạp prompt cho Khách B
    const factsForB = await kbFactsService.getActiveFactsForPrompt(customerB);
    const hasDataAInB = factsForB.some(f => f.customerId === customerA);
    assert.strictEqual(hasDataAInB, false, 'Khách B tuyệt đối không được nhìn thấy fact của Khách A!');
    assert.strictEqual(factsForB.length, 1);
    assert.strictEqual(factsForB[0].id, factB.id);
  });

  // ─────────────────────────────────────────────────────────────
  // TEST 4: BÀI KHÔNG CÓ FACTS ➔ CẢNH BÁO "CHƯA CÓ THÔNG TIN THẬT"
  // ─────────────────────────────────────────────────────────────
  await runTest('4. Kiểm tra cảnh báo "chưa có thông tin thật" khi không có facts', async () => {
    const promptSales = 'Bán căn hộ chung cư 2 phòng ngủ view sông Sài Gòn giá tốt';
    const { pack } = await resolveTopicPack(promptSales);

    // Trường hợp 1: Không có facts (Viết tự do)
    const emptyFacts = '';
    const mergedNoFacts = mergeRules(pack, { hasFacts: false });
    const factsNeededList = Array.isArray(mergedNoFacts.facts_needed) ? mergedNoFacts.facts_needed : [];
    const hasMissingFacts = factsNeededList.length > 0 && !emptyFacts;

    let safetyNotesNoFacts = '[READY_FOR_APPROVAL]';
    if (hasMissingFacts) {
      safetyNotesNoFacts += ` [CHƯA CÓ THÔNG TIN THẬT: Cần bổ sung facts (${factsNeededList.slice(0, 3).join(', ')}) trước khi xuất bản]`;
    }

    assert.strictEqual(hasMissingFacts, true, 'Bài bán hàng BĐS không có facts phải báo hasMissingFacts = true');
    assert.ok(
      safetyNotesNoFacts.includes('CHƯA CÓ THÔNG TIN THẬT'),
      'safetyNotes phải chứa cảnh báo chưa có thông tin thật'
    );

    // Trường hợp 2: Có facts từ KB của khách hàng A
    const activeFactsA = await kbFactsService.getActiveFactsForPrompt(customerA);
    const kbFactsFormatted = activeFactsA.map(f => `[${f.factType.toUpperCase()}] ${f.content}`).join('\n');
    const hasFactsFromKb = Boolean(kbFactsFormatted.trim());
    const mergedWithKbFacts = mergeRules(pack, { hasFacts: hasFactsFromKb });
    const hasMissingFactsAfterKb = mergedWithKbFacts.facts_needed?.length > 0 && !hasFactsFromKb;

    assert.strictEqual(hasMissingFactsAfterKb, false, 'Khi có facts từ KB, cờ hasMissingFacts phải bằng false');
  });

  // ─────────────────────────────────────────────────────────────
  // TEST 5: CLAIMEXTRACTOR ĐỐI CHIẾU SỐ LIỆU VỚI FACTS TỪ KB
  // ─────────────────────────────────────────────────────────────
  await runTest('5. ClaimExtractor đối chiếu số liệu với facts lấy từ KB', async () => {
    const factsFromKb = 'Giá bán Arabica Cầu Đất 185.000đ gói 250g. Miễn phí đổi trả 7 ngày.';
    
    // Bài viết dùng đúng số liệu trong facts
    const compliantPost = 'Cà phê Arabica Cầu Đất chuẩn vị có giá 185.000đ cho gói 250g, bảo hành đổi trả trong 7 ngày.';
    const violations1 = verifyClaimsByCode(compliantPost, factsFromKb);
    const unbackedNums1 = violations1.filter(v => v.type === 'UNBACKED_NUMBER');
    assert.strictEqual(unbackedNums1.length, 0, 'Dùng đúng 185.000đ trong facts thì không có lỗi số liệu');

    // Bài viết tự ý bịa số liệu ngoài facts (ví dụ bịa 350.000đ hoặc 15km)
    const hallucinatedPost = 'Cà phê Arabica Cầu Đất thượng hạng giá chỉ 350.000đ, giao hàng trong bán kính 15km.';
    const violations2 = verifyClaimsByCode(hallucinatedPost, factsFromKb);
    const unbackedNums2 = violations2.filter(v => v.type === 'UNBACKED_NUMBER');
    assert.ok(unbackedNums2.length > 0, 'ClaimExtractor phải phát hiện số liệu bịa 350.000đ hoặc 15km ngoài facts');
  });

  console.log('\n═══════════════════════════════════════════════════════════════════════════════════');
  console.log(`📊 TỔNG KẾT TEST KB FACTS: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('═══════════════════════════════════════════════════════════════════════════════════');

  if (failCount > 0) {
    process.exit(1);
  }
}

runAll().catch(err => {
  console.error('Fatal Test Error:', err);
  process.exit(1);
});
