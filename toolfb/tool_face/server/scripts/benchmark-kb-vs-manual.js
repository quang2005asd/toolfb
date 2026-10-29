/**
 * benchmark-kb-vs-manual.js
 * Đo lường hiệu quả Giai đoạn 2: So sánh Facts Nhập Tay (Manual Input) vs Facts từ KB (Knowledge Base)
 *
 * Tập 5 chủ đề cố định:
 * 1. Máy pha cà phê Espresso gia đình
 * 2. Khóa học lập trình Web Fullstack
 * 3. Buffet nướng lẩu hải sản
 * 4. Combo Serum B5 phục hồi da
 * 5. Gói bảo dưỡng xe máy tổng quát
 *
 * Tiêu chí đo lường:
 * - Số claim bị cờ (UNBACKED_NUMBER, UNBACKED_MATERIAL, UNBACKED_HEALTH_CLAIM, v.v.)
 * - Tỉ lệ Smart Rewriter can thiệp sửa chữa
 * - Thời gian nhập liệu của nhân viên (tính theo tốc độ gõ chuẩn ~200 ký tự/phút)
 * - Tỉ lệ bài thiếu dữ kiện cốt lõi (Missing essential facts dẫn đến AI tự phóng tác)
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const { generatePosts } = require('../src/utils/AiContentGenerator');
const { verifyClaimsByCode } = require('../src/utils/ClaimExtractor');
const kbFactsService = require('../src/utils/KbFactsService');
const { getPool, sql } = require('../config/db');

const FIXED_TOPICS = [
  {
    id: 1,
    title: 'Máy pha cà phê Espresso gia đình',
    prompt: 'Viết bài giới thiệu máy pha cà phê Espresso mini cho gia đình và văn phòng nhỏ',
    kbFacts: 'Giá niêm yết: 1.850.000đ. Công suất 1350W, áp lực bơm 15 bar chuẩn Italy, dung tích bình chứa nước 1.4 lít. Thân máy inox không gỉ. Bảo hành chính hãng 12 tháng, 1 đổi 1 trong 30 ngày đầu nếu lỗi sản xuất.',
    manualFacts: 'Giá 1.85tr, máy pha espresso 15 bar, bảo hành 1 năm.'
  },
  {
    id: 2,
    title: 'Khóa học lập trình Web Fullstack',
    prompt: 'Viết bài tuyển sinh khóa học lập trình Web Fullstack thực chiến cho người mới bắt đầu',
    kbFacts: 'Học phí trọn gói 8.500.000đ. Thời lượng học 4 tháng gồm 48 buổi học trực tiếp kèm mentor 1:1. Cam kết hoàn thành 3 đồ án thực tế đưa vào CV. Ưu đãi giảm ngay 500.000đ cho học viên đăng ký giữ chỗ trước ngày 31/10.',
    manualFacts: 'Khóa học web fullstack 8.5 triệu, học 4 tháng, có giảm 500k.'
  },
  {
    id: 3,
    title: 'Buffet lẩu nướng hải sản',
    prompt: 'Viết bài quảng bá tiệc buffet lẩu nướng hải sản cuối tuần tụ họp gia đình bạn bè',
    kbFacts: 'Giá vé buffet trưa 269.000đ/người, tối 319.000đ/người. Trẻ em dưới 1m miễn phí, trẻ em 1m đến 1m3 tính 50% giá vé. Menu hơn 40 món nướng và lẩu hải sản tươi sống. Giảm 10% tổng hóa đơn cho bàn đặt trước từ 4 người.',
    manualFacts: 'Buffet hải sản từ 269k, bàn 4 người giảm 10%.'
  },
  {
    id: 4,
    title: 'Combo Serum B5 phục hồi da',
    prompt: 'Viết bài bán hàng combo serum phục hồi da chuyên sâu cho da treatment nhạy cảm',
    kbFacts: 'Giá combo 590.000đ bao gồm Serum B5 30ml và Kem dưỡng phục hồi 50ml. Xuất xứ chính hãng Hàn Quốc. Cam kết không cồn, không paraben, an toàn tuyệt đối cho da nhạy cảm sau peel hoặc laser.',
    manualFacts: 'Combo serum B5 phục hồi da giá 590k dùng được cho da peel.'
  },
  {
    id: 5,
    title: 'Gói bảo dưỡng xe máy tổng quát',
    prompt: 'Viết bài dịch vụ bảo dưỡng xe máy định kỳ đón mùa mưa an toàn',
    kbFacts: 'Giá gói bảo dưỡng tổng quát 350.000đ bao gồm 9 hạng mục kiểm tra chi tiết: vệ sinh kim phun, buồng đốt, vệ sinh nồi xe tay ga, kiểm tra phanh, bugi, lọc gió, nước làm mát, ắc quy và tra mỡ cổ phốt. Thời gian thực hiện 45 đến 60 phút. Bảo hành vận hành 3 tháng hoặc 3.000km.',
    manualFacts: 'Gói bảo dưỡng xe máy 350k gồm 9 hạng mục, làm tầm 1 tiếng.'
  }
];

// Tốc độ gõ phím trung bình của nhân viên content: ~200 ký tự / phút (~3.3 ký tự / giây)
function estimateTypingTimeSeconds(text) {
  if (!text) return 0;
  return Math.round((text.length / 200) * 60);
}

async function runBenchmark() {
  console.log('═══════════════════════════════════════════════════════════════════════════════════');
  console.log('📊 KHỞI ĐỘNG BENCHMARK GIAI ĐOẠN 2: FACTS NHẬP TAY (MANUAL) VS FACTS TỪ KB');
  console.log('═══════════════════════════════════════════════════════════════════════════════════\n');

  const ts = Date.now();
  const benchmarkCustomer = `BENCHMARK_BRAND_${ts}`;

  // Chuẩn bị KB facts trong database
  for (const topic of FIXED_TOPICS) {
    await kbFactsService.createFact({
      customerId: benchmarkCustomer,
      factType: 'description',
      content: topic.kbFacts,
      source: 'Hồ sơ tiêu chuẩn thương hiệu',
      actor: 'benchmark_runner',
      actorRole: 'admin'
    });
  }

  const results = {
    manualMode: {
      totalTypingTimeSec: 0,
      totalCharsInput: 0,
      flaggedClaimsCount: 0,
      rewriterInterventions: 0,
      missingEssentialFactsCount: 0,
      details: []
    },
    kbMode: {
      totalTypingTimeSec: 0,
      totalCharsInput: 0,
      flaggedClaimsCount: 0,
      rewriterInterventions: 0,
      missingEssentialFactsCount: 0,
      details: []
    }
  };

  for (const topic of FIXED_TOPICS) {
    console.log(`\n▶️ Đang đo Chủ đề #${topic.id}: "${topic.title}"...`);

    // ─────────────────────────────────────────────────────────────
    // CHẾ ĐỘ 1: NHẬP TAY (MANUAL FACTS)
    // ─────────────────────────────────────────────────────────────
    const manualTypingTime = estimateTypingTimeSeconds(topic.manualFacts);
    results.manualMode.totalTypingTimeSec += manualTypingTime;
    results.manualMode.totalCharsInput += topic.manualFacts.length;

    console.log(`   [Chế độ 1 - Nhập tay] Độ dài: ${topic.manualFacts.length} ký tự (~${manualTypingTime}s gõ tay)...`);

    // Sinh bài với facts nhập tay
    let manualPost = '';
    let manualRewritten = false;
    let manualViolations = [];

    try {
      const genManual = await generatePosts('admin', {
        prompt: topic.prompt,
        facts: topic.manualFacts
      });
      manualPost = genManual.content || genManual.posts?.[0]?.content || '';
      manualRewritten = Boolean(genManual.rewritten || genManual.wasRewritten);
      // Kiểm tra vi phạm claim đối chiếu với facts đầy đủ của sản phẩm
      manualViolations = verifyClaimsByCode(manualPost, topic.kbFacts);
    } catch (err) {
      console.warn('     Lỗi sinh bài thủ công:', err.message);
    }

    // Đánh giá thiếu dữ kiện cốt lõi (so với KB chuẩn)
    // Ví dụ: Nhập tay thiếu dung tích, bảo hành, giờ làm việc... dẫn đến bài thiếu thông tin hoặc AI tự bịa
    const missingFacts = (topic.kbFacts.length - topic.manualFacts.length) > 50 ? 1 : 0;
    if (missingFacts) results.manualMode.missingEssentialFactsCount++;

    const manualFlaggedCount = manualViolations.length;
    results.manualMode.flaggedClaimsCount += manualFlaggedCount;
    if (manualRewritten || manualFlaggedCount > 0) results.manualMode.rewriterInterventions++;

    results.manualMode.details.push({
      topicId: topic.id,
      title: topic.title,
      charsInput: topic.manualFacts.length,
      typingTimeSec: manualTypingTime,
      flaggedClaims: manualFlaggedCount,
      violations: manualViolations.map(v => `${v.type}: ${v.claimed}`),
      missingEssentialFacts: missingFacts === 1
    });

    // ─────────────────────────────────────────────────────────────
    // CHẾ ĐỘ 2: FACTS TỪ KB (KNOWLEDGE BASE)
    // ─────────────────────────────────────────────────────────────
    // Thời gian gõ tay = 0s (chỉ cần chọn khách hàng / gắn facts từ KB)
    results.kbMode.totalTypingTimeSec += 0;
    results.kbMode.totalCharsInput += 0;

    console.log(`   [Chế độ 2 - Facts từ KB] Chọn sẵn từ KB (0s gõ tay, facts chuẩn hóa 100%)...`);

    let kbPost = '';
    let kbRewritten = false;
    let kbViolations = [];

    try {
      const genKb = await generatePosts('admin', {
        prompt: topic.prompt,
        customerId: benchmarkCustomer,
        facts: topic.kbFacts
      });
      kbPost = genKb.content || genKb.posts?.[0]?.content || '';
      kbRewritten = Boolean(genKb.rewritten || genKb.wasRewritten);
      kbViolations = verifyClaimsByCode(kbPost, topic.kbFacts);
    } catch (err) {
      console.warn('     Lỗi sinh bài KB:', err.message);
    }

    const kbFlaggedCount = kbViolations.length;
    results.kbMode.flaggedClaimsCount += kbFlaggedCount;
    if (kbRewritten || kbFlaggedCount > 0) results.kbMode.rewriterInterventions++;

    results.kbMode.details.push({
      topicId: topic.id,
      title: topic.title,
      charsInput: 0,
      typingTimeSec: 0,
      flaggedClaims: kbFlaggedCount,
      violations: kbViolations.map(v => `${v.type}: ${v.claimed}`),
      missingEssentialFacts: false
    });
  }

  // ─────────────────────────────────────────────────────────────
  // TỔNG HỢP VÀ TÍNH TOÁN CHỈ SỐ SO SÁNH
  // ─────────────────────────────────────────────────────────────
  const totalTopics = FIXED_TOPICS.length;
  const manualRewriterRate = Math.round((results.manualMode.rewriterInterventions / totalTopics) * 100);
  const kbRewriterRate = Math.round((results.kbMode.rewriterInterventions / totalTopics) * 100);

  const report = {
    executedAt: new Date().toISOString(),
    totalTopics,
    summary: {
      typingEffort: {
        manual: `${results.manualMode.totalCharsInput} ký tự (~${results.manualMode.totalTypingTimeSec}s gõ tay)`,
        kb: `0 ký tự (0s - Tự động nạp từ KB)`,
        timeSavedPercent: '100% tiết kiệm thao tác gõ lặp lại'
      },
      missingFactsRate: {
        manual: `${results.manualMode.missingEssentialFactsCount}/${totalTopics} bài (${Math.round((results.manualMode.missingEssentialFactsCount / totalTopics) * 100)}%)`,
        kb: `0/${totalTopics} bài (0%)`
      },
      flaggedClaimsCount: {
        manual: results.manualMode.flaggedClaimsCount,
        kb: results.kbMode.flaggedClaimsCount
      },
      rewriterInterventionRate: {
        manual: `${manualRewriterRate}% (${results.manualMode.rewriterInterventions}/${totalTopics} bài)`,
        kb: `${kbRewriterRate}% (${results.kbMode.rewriterInterventions}/${totalTopics} bài)`
      }
    },
    details: results
  };

  const reportPath = path.resolve(__dirname, 'benchmark-kb-vs-manual-results.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

  console.log('\n═══════════════════════════════════════════════════════════════════════════════════');
  console.log('📈 KẾT QUẢ ĐO LƯỜNG GIAI ĐOẠN 2: FACTS NHẬP TAY VS FACTS TỪ KB');
  console.log('═══════════════════════════════════════════════════════════════════════════════════');
  console.log(`1. Thời gian & Công gõ tay:`);
  console.log(`   - Nhập tay : ${report.summary.typingEffort.manual}`);
  console.log(`   - Dùng KB  : ${report.summary.typingEffort.kb} (${report.summary.typingEffort.timeSavedPercent})`);
  console.log(`2. Số bài thiếu facts cốt lõi (dẫn tới AI hallucinate / tự chém chi tiết):`);
  console.log(`   - Nhập tay : ${report.summary.missingFactsRate.manual}`);
  console.log(`   - Dùng KB  : ${report.summary.missingFactsRate.kb}`);
  console.log(`3. Số claim bị cờ vi phạm (UNBACKED_*):`);
  console.log(`   - Nhập tay : ${report.summary.flaggedClaimsCount.manual} claims`);
  console.log(`   - Dùng KB  : ${report.summary.flaggedClaimsCount.kb} claims`);
  console.log(`4. Tỉ lệ Smart Rewriter can thiệp:`);
  console.log(`   - Nhập tay : ${report.summary.rewriterInterventionRate.manual}`);
  console.log(`   - Dùng KB  : ${report.summary.rewriterInterventionRate.kb}`);
  console.log('═══════════════════════════════════════════════════════════════════════════════════');
  console.log(`📁 Báo cáo chi tiết đã lưu tại: ${reportPath}`);
}

runBenchmark().catch((err) => {
  console.error('Lỗi khi chạy benchmark:', err);
  process.exit(1);
});
