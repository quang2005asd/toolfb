/**
 * benchmark-independent-80.js
 * BỘ BENCHMARK ĐỘC LẬP 80 CHỦ ĐỀ:
 * 1. Tập A: 40 chủ đề Nhạy Cảm mới toanh, KHÔNG dùng từ khóa có trong danh sách
 *    -> Đo riêng tỉ lệ AI Classifier bắt khi TỪ KHÓA TRƯỢT (Thước đo an toàn thực tế).
 * 2. Tập B: 40 chủ đề Đời Thường chứa từ bẫy / biên giới nhạy cảm (Negative Controls)
 *    -> Đo tỉ lệ Chặn nhầm (Over-blocking rate).
 * 3. Giám sát tỉ lệ Fallback AI (chống nghẽn hàng chờ âm thầm).
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const {
  evaluateContentSafety,
  evaluateContentSafetyAsync,
  scanSensitiveKeywords,
  getAiClassifierMetrics,
  resetAiClassifierMetrics,
  POST_STATES
} = require('../src/utils/PostStateMachine');

const OUT_FILE = path.resolve(__dirname, '../../eval/independent-80-benchmark-results.json');

// ── TẬP A: 40 CHỦ ĐỀ NHẠY CẢM MỚI (CỐ Ý TRÁNH DÙNG TỪ KHÓA TRONG DANH SÁCH) ──
const SENSITIVE_40_INDEPENDENT = [
  // Nhóm Sức khỏe / Y khoa (8 chủ đề)
  { id: 'S1', group: 'Sức khỏe', topic: 'mẹo kiểm soát chỉ số HbA1c tại nhà an toàn' },
  { id: 'S2', group: 'Sức khỏe', topic: 'cách hạ men ALT và AST trong máu bằng thảo mộc' },
  { id: 'S3', group: 'Sức khỏe', topic: 'phương pháp phục hồi chức năng vận động cho người tai biến' },
  { id: 'S4', group: 'Sức khỏe', topic: 'chế độ ăn làm sạch mỡ nội tạng và hạ triglyceride' },
  { id: 'S5', group: 'Sức khỏe', topic: 'mẹo giảm triệu chứng trào ngược axit dạ dày về khuya' },
  { id: 'S6', group: 'Sức khỏe', topic: 'bài tập thở tăng dung tích phổi cho người hậu covid' },
  { id: 'S7', group: 'Sức khỏe', topic: 'cách làm dịu cơn đau dây thần kinh tọa tại giường' },
  { id: 'S8', group: 'Sức khỏe', topic: 'chăm sóc vết mổ hở chống nhiễm trùng huyết' },

  // Nhóm Mẹ & Bé / Dinh dưỡng (8 chủ đề)
  { id: 'S9', group: 'Mẹ & Bé', topic: 'chữa tắc tia sữa và cương sữa cục bộ cho sản phụ' },
  { id: 'S10', group: 'Mẹ & Bé', topic: 'kinh nghiệm chọn trường mầm non có camera giám sát' },
  { id: 'S11', group: 'Mẹ & Bé', topic: 'phương pháp rèn con tự ngủ xuyên đêm không quấy khóc' },
  { id: 'S12', group: 'Mẹ & Bé', topic: 'bổ sung kẽm và vi chất kích thích vị giác cho bé lười nuốt' },
  { id: 'S13', group: 'Mẹ & Bé', topic: 'cách hạ sốt co giật ở trẻ em an toàn trong khi đợi cấp cứu' },
  { id: 'S14', group: 'Mẹ & Bé', topic: 'xử lý hiện tượng vàng da sinh lý kéo dài ở trẻ một tháng tuổi' },
  { id: 'S15', group: 'Mẹ & Bé', topic: 'kinh nghiệm chăm sóc tầng sinh môn mau lành sau sinh thường' },
  { id: 'S16', group: 'Mẹ & Bé', topic: 'thực đơn dinh dưỡng vàng cho 3 tháng đầu thai kỳ' },

  // Nhóm Tài chính / Vay / Đầu tư (8 chủ đề)
  { id: 'S17', group: 'Tài chính', topic: 'tích lũy tài sản đều đặn qua chứng chỉ quỹ mở' },
  { id: 'S18', group: 'Tài chính', topic: 'kinh nghiệm xử lý khi bị kẻ xấu lấy cắp CCCD rút tiền' },
  { id: 'S19', group: 'Tài chính', topic: 'cách tăng hạn mức chi tiêu mà không bị hạ điểm tín nhiệm' },
  { id: 'S20', group: 'Tài chính', topic: 'phương pháp quản lý dòng tiền khi thu nhập giảm sút 50%' },
  { id: 'S21', group: 'Tài chính', topic: 'tối ưu hóa lợi tức khi gửi dòng tiền ngắn hạn' },
  { id: 'S22', group: 'Tài chính', topic: 'kinh nghiệm tích lũy vàng nhẫn trơn bảo toàn giá trị đồng tiền' },
  { id: 'S23', group: 'Tài chính', topic: 'chiến lược phân bổ 6 chiếc hũ tài chính cá nhân tự do' },
  { id: 'S24', group: 'Tài chính', topic: 'những rủi ro tiềm ẩn khi tham gia hội nhóm ủy thác đầu tư' },

  // Nhóm Bất động sản / Nhà đất (8 chủ đề)
  { id: 'S25', group: 'Bất động sản', topic: 'kinh nghiệm mua nhà chưa có trích lục bản đồ địa chính' },
  { id: 'S26', group: 'Bất động sản', topic: 'đất xen kẹt trong khu dân cư có chuyển mục đích được không' },
  { id: 'S27', group: 'Bất động sản', topic: 'thủ tục xin cấp phép xây dựng nhà ở riêng lẻ đô thị' },
  { id: 'S28', group: 'Bất động sản', topic: 'kinh nghiệm kiểm tra hệ thống thoát hiểm khi thuê phòng studio' },
  { id: 'S29', group: 'Bất động sản', topic: 'cách kiểm tra nhà có bị kê biên thi hành án hay không' },
  { id: 'S30', group: 'Bất động sản', topic: 'quy trình chuyển đổi đất trồng cây lâu năm sang đất ở' },
  { id: 'S31', group: 'Bất động sản', topic: 'kinh nghiệm thương lượng phí bảo trì 2% khi nhận bàn giao nhà' },
  { id: 'S32', group: 'Bất động sản', topic: 'kinh nghiệm đo đạc lại ranh giới mốc lộ giới giao thông' },

  // Nhóm Pháp lý / Quyền lợi (8 chủ đề)
  { id: 'S33', group: 'Pháp lý', topic: 'phân chia quyền thừa kế tài sản của cha mẹ để lại cho các con' },
  { id: 'S34', group: 'Pháp lý', topic: 'quyền yêu cầu cấp dưỡng và thăm nom con sau khi ly thân' },
  { id: 'S35', group: 'Pháp lý', topic: 'hành vi bôi nhọ danh dự và phát tán hình ảnh riêng tư trên mạng' },
  { id: 'S36', group: 'Pháp lý', topic: 'thủ tục khiếu nại bồi thường khi doanh nghiệp chậm trả lương' },
  { id: 'S37', group: 'Pháp lý', topic: 'quy trình hòa giải tranh chấp lối đi chung tại cơ sở phường xã' },
  { id: 'S38', group: 'Pháp lý', topic: 'rủi ro khi cho mượn tài khoản ngân hàng nhận tiền lạ' },
  { id: 'S39', group: 'Pháp lý', topic: 'thời hiệu đòi lại tài sản cho mượn không có giấy tờ viết tay' },
  { id: 'S40', group: 'Pháp lý', topic: 'quy định về việc bảo vệ quyền tác giả đối với video sáng tạo' }
];

// ── TẬP B: 40 CHỦ ĐỀ ĐỜI THƯỜNG CÓ TỪ BẪY (NEGATIVE CONTROLS - TRÁNH OVER-BLOCKING) ──
const EVERYDAY_40_NEGATIVE = [
  // Chứa từ dễ nhầm sang Sức khỏe (10 bài)
  { id: 'N1', group: 'Đời thường', topic: 'cách dùng than hoạt tính khử mùi hôi tủ lạnh cực nhạy' },
  { id: 'N2', group: 'Đời thường', topic: 'tận dụng vỏ trứng bón canxi tự nhiên cho vườn rau sân thượng' },
  { id: 'N3', group: 'Đời thường', topic: 'cách làm trà gừng ấm bụng thơm cay giải cảm lạnh ngày mưa' },
  { id: 'N4', group: 'Đời thường', topic: 'kinh nghiệm chọn mua máy lọc không khí bù ẩm phòng ngủ' },
  { id: 'N5', group: 'Đời thường', topic: 'công thức detox tâm trí bằng 30 phút đi dạo công viên' },
  { id: 'N6', group: 'Đời thường', topic: 'mẹo giữ hoa hồng cắm bình tươi lâu cả tuần không rụng cánh' },
  { id: 'N7', group: 'Đời thường', topic: 'cách phục hồi đôi giày da bị ẩm mốc sau mùa nồm' },
  { id: 'N8', group: 'Đời thường', topic: 'mẹo làm sạch vết dầu mỡ bám trên bếp ga siêu tốc' },
  { id: 'N9', group: 'Đời thường', topic: 'cách ủ phân hữu cơ từ rác nhà bếp không bốc mùi' },
  { id: 'N10', group: 'Đời thường', topic: 'mẹo ngâm chanh đào mật ong trị ho cho cả gia đình mùa đông' },

  // Chứa từ dễ nhầm sang Mẹ & Bé (8 bài)
  { id: 'N11', group: 'Đời thường', topic: 'cách bảo quản bình giữ nhiệt inox không bị bám cặn mùi' },
  { id: 'N12', group: 'Đời thường', topic: 'mẹo làm món bánh flan mềm mịn không bị rỗ mặt' },
  { id: 'N13', group: 'Đời thường', topic: 'kinh nghiệm chọn mua balo chống gù lưng cho học sinh tiểu học' },
  { id: 'N14', group: 'Đời thường', topic: 'cách chọn đồ chơi lego kích thích tư duy sáng tạo' },
  { id: 'N15', group: 'Đời thường', topic: 'công thức nấu cháo sườn sánh mịn thơm lừng bữa sáng' },
  { id: 'N16', group: 'Đời thường', topic: 'kinh nghiệm may rèm cửa cản sáng cho phòng ngủ trẻ em' },
  { id: 'N17', group: 'Đời thường', topic: 'mẹo làm sạch bình hoa thủy tinh bám cặn vôi lâu ngày' },
  { id: 'N18', group: 'Đời thường', topic: 'cách làm kem chuối nước cốt dừa mát lạnh tuổi thơ' },

  // Chứa từ dễ nhầm sang Tài chính / Vay (8 bài)
  { id: 'N19', group: 'Đời thường', topic: 'thủ tục mượn sách thư viện tổng hợp miễn phí cho sinh viên' },
  { id: 'N20', group: 'Đời thường', topic: 'nghệ thuật giao tiếp: khi lắng nghe cũng tạo ra lãi suất cảm xúc' },
  { id: 'N21', group: 'Đời thường', topic: 'kinh nghiệm săn vé máy bay 0 đồng đi du lịch tự túc' },
  { id: 'N22', group: 'Đời thường', topic: 'cách sắp xếp chi tiêu gia đình nhỏ 2 vợ chồng trẻ tiết kiệm' },
  { id: 'N23', group: 'Đời thường', topic: 'mẹo mua sắm thông minh: đợi 48 giờ trước khi chốt đơn' },
  { id: 'N24', group: 'Đời thường', topic: 'kinh nghiệm đổi ngoại tệ du lịch Thái Lan phí rẻ nhất' },
  { id: 'N25', group: 'Đời thường', topic: 'cách tích điểm thẻ siêu thị để đổi quà gia dụng cuối năm' },
  { id: 'N26', group: 'Đời thường', topic: 'câu chuyện về chiếc heo đất nuôi ước mơ mua laptop mới' },

  // Chứa từ dễ nhầm sang Bất động sản / Nhà cửa (8 bài)
  { id: 'N27', group: 'Đời thường', topic: 'ý tưởng decor phòng trọ 15m2 phong cách wabi sabi tối giản' },
  { id: 'N28', group: 'Đời thường', topic: 'cách bố trí cây xanh phong thủy mang tài lộc vào phòng khách' },
  { id: 'N29', group: 'Đời thường', topic: 'mẹo chống thấm dột góc ban công mùa mưa bão' },
  { id: 'N30', group: 'Đời thường', topic: 'kinh nghiệm tự sơn sửa lại bức tường cũ phòng ngủ đón Tết' },
  { id: 'N31', group: 'Đời thường', topic: 'cách lắp đặt hệ thống đèn led dây trang trí bàn làm việc' },
  { id: 'N32', group: 'Đời thường', topic: 'mẹo sắp xếp tủ quần áo 4 mùa gọn gàng không bị nhăn' },
  { id: 'N33', group: 'Đời thường', topic: 'cách tự làm xà phòng thơm từ sáp ong và tinh dầu sả chanh' },
  { id: 'N34', group: 'Đời thường', topic: 'kinh nghiệm chọn mua máy hút bụi giường nệm diệt khuẩn' },

  // Đời thường công nghệ, thời trang, sinh thái (6 bài)
  { id: 'N35', group: 'Đời thường', topic: 'chiếc váy hoa xinh vintage dạo biển Phú Quốc chiều hoàng hôn' },
  { id: 'N36', group: 'Đời thường', topic: 'bộ sưu tập ve sầu cicada mùa hè cho bé khám phá tự nhiên' },
  { id: 'N37', group: 'Đời thường', topic: 'hướng dẫn tạo phím tắt Excel tăng gấp 3 tốc độ nhập liệu' },
  { id: 'N38', group: 'Đời thường', topic: 'cách vệ sinh bàn phím cơ không làm hỏng switch' },
  { id: 'N39', group: 'Đời thường', topic: 'kinh nghiệm phối đồ công sở lịch sự năng động cho nam' },
  { id: 'N40', group: 'Đời thường', topic: 'bí quyết nấu nước lèo phở bò trong vắt chuẩn vị Hà Nội' }
];

async function runBenchmark() {
  console.log('═══════════════════════════════════════════════════════════════════════════════════');
  console.log('🚀 KHỞI ĐỘNG BENCHMARK ĐỘC LẬP 80 CHỦ ĐỀ (ĐO ĐỘ PHỦ THỰC & CHỐNG CHẶN NHẦM)');
  console.log('═══════════════════════════════════════════════════════════════════════════════════\n');

  resetAiClassifierMetrics();

  // ── PHẦN 1: CHẠY TẬP A (40 CHỦ ĐỀ NHẠY CẢM MỚI) ──
  console.log('📌 PHẦN 1: KIỂM THỬ 40 CHỦ ĐỀ NHẠY CẢM ĐỘC LẬP (ĐO AI KHI TỪ KHÓA TRƯỢT)');
  console.log('───────────────────────────────────────────────────────────────────────────────────');

  const sensitiveResults = [];
  let kwMatchCount = 0;
  let aiCaughtCount = 0;
  let missedCount = 0;

  for (let i = 0; i < SENSITIVE_40_INDEPENDENT.length; i++) {
    const item = SENSITIVE_40_INDEPENDENT[i];
    process.stdout.write(`[${i + 1}/40] (${item.group}) "${item.topic.slice(0, 45)}..." `);

    // Kiểm tra tầng từ khóa đơn thuần trước
    const kwCheck = scanSensitiveKeywords(item.topic, item.topic);
    
    // Chạy tầng bảo vệ đầy đủ (Từ khóa OR AI Classifier)
    const t0 = Date.now();
    const fullResult = await evaluateContentSafetyAsync(item.topic, item.topic, item.topic);
    const duration = Date.now() - t0;

    const isPendingOrBlocked = fullResult.state === POST_STATES.PENDING_REVIEW || fullResult.state === POST_STATES.BLOCKED;
    let source = 'MISSED';

    if (kwCheck.matched) {
      kwMatchCount++;
      source = `TỪ KHÓA (${kwCheck.keyword})`;
    } else if (isPendingOrBlocked) {
      aiCaughtCount++;
      source = 'AI CLASSIFIER (Gánh tải khi từ khóa trượt!)';
    } else {
      missedCount++;
    }

    console.log(`=> ${fullResult.state} [${isPendingOrBlocked ? '✅ BẮT ĐƯỢC' : '❌ LỌT'}] | Nguồn: ${source} (${duration}ms)`);

    sensitiveResults.push({
      ...item,
      state: fullResult.state,
      isProtected: isPendingOrBlocked,
      kwMatched: kwCheck.matched,
      matchedKeyword: kwCheck.keyword || null,
      source,
      score: fullResult.score,
      reasons: fullResult.reasons,
      durationMs: duration
    });
  }

  // ── PHẦN 2: CHẠY TẬP B (40 CHỦ ĐỀ ĐỜI THƯỜNG CÓ TỪ BẪY) ──
  console.log('\n📌 PHẦN 2: KIỂM THỬ 40 CHỦ ĐỀ ĐỜI THƯỜNG BẪY TỪ (ĐO TỶ LỆ CHẶN NHẦM OVER-BLOCKING)');
  console.log('───────────────────────────────────────────────────────────────────────────────────');

  const negativeResults = [];
  let overBlockedCount = 0;
  let cleanPassedCount = 0;

  for (let i = 0; i < EVERYDAY_40_NEGATIVE.length; i++) {
    const item = EVERYDAY_40_NEGATIVE[i];
    process.stdout.write(`[${i + 1}/40] (Đời thường) "${item.topic.slice(0, 45)}..." `);

    const t0 = Date.now();
    const fullResult = await evaluateContentSafetyAsync(item.topic, item.topic, item.topic);
    const duration = Date.now() - t0;

    const isReady = fullResult.state === POST_STATES.READY_FOR_APPROVAL;
    if (isReady) {
      cleanPassedCount++;
      console.log(`=> READY_FOR_APPROVAL (✅ ĐẠT: Không bị chặn nhầm, ${duration}ms)`);
    } else {
      overBlockedCount++;
      console.log(`=> ${fullResult.state} (⚠️ BỊ CHẶN NHẦM: ${fullResult.reasons?.[0] || 'Chặn'}, ${duration}ms)`);
    }

    negativeResults.push({
      ...item,
      state: fullResult.state,
      isCleanPassed: isReady,
      score: fullResult.score,
      reasons: fullResult.reasons,
      durationMs: duration
    });
  }

  // ── PHẦN 3: TỔNG HỢP CHỈ SỐ METRICS ──
  const metrics = getAiClassifierMetrics();
  const kwMissCount = SENSITIVE_40_INDEPENDENT.length - kwMatchCount;
  const aiRescueRate = kwMissCount > 0 ? ((aiCaughtCount / kwMissCount) * 100).toFixed(1) + '%' : '100.0%';
  const totalProtectedRate = (((kwMatchCount + aiCaughtCount) / SENSITIVE_40_INDEPENDENT.length) * 100).toFixed(1) + '%';
  const overBlockingRate = ((overBlockedCount / EVERYDAY_40_NEGATIVE.length) * 100).toFixed(1) + '%';
  const cleanPassRate = ((cleanPassedCount / EVERYDAY_40_NEGATIVE.length) * 100).toFixed(1) + '%';

  console.log('\n═══════════════════════════════════════════════════════════════════════════════════');
  console.log('📊 BÁO CÁO KẾT QUẢ BENCHMARK ĐỘC LẬP 80 CHỦ ĐỀ');
  console.log('═══════════════════════════════════════════════════════════════════════════════════');
  console.log(`1. TẬP NHẠY CẢM ĐỘC LẬP (40 chủ đề mới):`);
  console.log(`   - Số ca bị Từ khóa bắt ngay:             ${kwMatchCount}/40 (${((kwMatchCount / 40) * 100).toFixed(1)}%)`);
  console.log(`   - Số ca TỪ KHÓA TRƯỢT:                   ${kwMissCount}/40 (${((kwMissCount / 40) * 100).toFixed(1)}%)`);
  console.log(`   - Số ca AI Classifier GÁNH THÀNH CÔNG:   ${aiCaughtCount}/${kwMissCount} (Tỉ lệ cứu nguy: ${aiRescueRate})`);
  console.log(`   - Số ca BỊ LỌT HOÀN TOÀN:                ${missedCount}/40`);
  console.log(`   ➔ ĐỘ AN TOÀN TỔNG THỂ (Overall Recall):  ${totalProtectedRate}`);
  console.log('');
  console.log(`2. TẬP ĐỜI THƯỜNG CÓ TỪ BẪY (40 chủ đề Negative Controls):`);
  console.log(`   - Số ca vào đúng READY_FOR_APPROVAL:     ${cleanPassedCount}/40 (Tỉ lệ sạch: ${cleanPassRate})`);
  console.log(`   - Số ca BỊ CHẶN NHẦM (Over-blocking):    ${overBlockedCount}/40 (Tỉ lệ chặn nhầm: ${overBlockingRate})`);
  console.log('');
  console.log(`3. GIÁM SÁT SỨC KHỎE KẾT NỐI AI:`);
  console.log(`   - Tổng số lượt gọi AI Classifier:        ${metrics.totalCalls}`);
  console.log(`   - Số lượt Fallback khi lỗi API:          ${metrics.fallbackErrorCount} (Tỉ lệ: ${metrics.fallbackRate})`);
  console.log('═══════════════════════════════════════════════════════════════════════════════════');

  const reportPayload = {
    executedAt: new Date().toISOString(),
    summary: {
      sensitiveTested: SENSITIVE_40_INDEPENDENT.length,
      keywordMatches: kwMatchCount,
      keywordMisses: kwMissCount,
      aiRescues: aiCaughtCount,
      totalProtected: kwMatchCount + aiCaughtCount,
      protectionRate: totalProtectedRate,
      aiRescueRate,
      negativeTested: EVERYDAY_40_NEGATIVE.length,
      cleanPassed: cleanPassedCount,
      overBlocked: overBlockedCount,
      cleanPassRate,
      overBlockingRate,
      aiMetrics: metrics
    },
    sensitiveResults,
    negativeResults
  };

  fs.writeFileSync(OUT_FILE, JSON.stringify(reportPayload, null, 2), 'utf8');
  console.log(`\n✅ Báo cáo chi tiết đã lưu vào: ${OUT_FILE}`);
}

runBenchmark().catch((err) => {
  console.error('❌ Lỗi chạy benchmark:', err);
  process.exit(1);
});
