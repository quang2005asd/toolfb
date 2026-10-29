/**
 * test-sensitive-detection.js
 * Kiểm thử bộ lọc an toàn đa tầng (Từ khóa theo nhóm ngành OR AI Classifier)
 * trên 30 chủ đề nhạy cảm mới toanh (Yêu cầu: Tỉ lệ vào PENDING_REVIEW phải đạt 100%)
 * Kèm 5 chủ đề đời thường (Negative Controls) để kiểm chứng không bị over-blocking.
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const { evaluateContentSafetyAsync, POST_STATES } = require('../src/utils/PostStateMachine');

const OUT_FILE = path.resolve(__dirname, '../../eval/sensitive-30-test-results.json');

const SENSITIVE_30_TOPICS = [
  // ── NHÓM 1: Sức khỏe / Y tế / Thuốc / TPCN / Bệnh lý (6 chủ đề) ──
  {
    id: 1,
    group: 'SUC_KHOE_DUOC_PHAM',
    topic: 'thực đơn cho người tiểu đường type 2 ổn định đường huyết',
    sampleContent: 'Người bị tiểu đường cần chia nhỏ bữa ăn trong ngày, hạn chế tinh bột hấp thụ nhanh và tăng cường chất xơ từ rau củ để kiểm soát chỉ số đường huyết ổn định.'
  },
  {
    id: 2,
    group: 'SUC_KHOE_DUOC_PHAM',
    topic: 'thuốc nhỏ mắt chống khô mỏi cho dân văn phòng',
    sampleContent: 'Làm việc máy tính 8 tiếng khiến mắt cay xè. Hãy chọn các loại dung dịch nhỏ mắt không chứa chất bảo quản hoặc tham khảo ý kiến bác sĩ khi mắt bị đỏ kéo dài.'
  },
  {
    id: 3,
    group: 'SUC_KHOE_DUOC_PHAM',
    topic: 'viên uống trắng da mờ nám glutathione',
    sampleContent: 'Nhiều chị em truyền tai nhau viên uống bổ sung glutathione giúp mờ sạm nám và sáng da. Tuy nhiên cần kiểm tra nguồn gốc rõ ràng và không lạm dụng liều cao.'
  },
  {
    id: 4,
    group: 'SUC_KHOE_DUOC_PHAM',
    topic: 'mẹo giảm trào ngược dạ dày thực quản về đêm',
    sampleContent: 'Kê cao đầu giường 15-20cm, không ăn no sát giờ đi ngủ và kiêng đồ cay nóng để bảo vệ niêm mạc dạ dày khỏi acid trào ngược.'
  },
  {
    id: 5,
    group: 'SUC_KHOE_DUOC_PHAM',
    topic: 'bổ sung men vi sinh cho người rối loạn tiêu hóa',
    sampleContent: 'Men vi sinh chứa lợi khuẩn giúp cân bằng hệ vi sinh đường ruột sau đợt uống kháng sinh. Nên uống sau ăn 30 phút để đạt hiệu quả tốt nhất.'
  },
  {
    id: 6,
    group: 'SUC_KHOE_DUOC_PHAM',
    topic: 'bài tập vật lý trị liệu cho người thoát vị đĩa đệm',
    sampleContent: 'Động tác kéo giãn cột sống nhẹ nhàng giúp giảm áp lực chèn ép rễ thần kinh. Tuyệt đối không tập các động tác cúi gập mạnh khi chưa có chỉ định của chuyên gia.'
  },

  // ── NHÓM 2: Dinh dưỡng trẻ em / Trẻ sơ sinh / Mẹ và Bé (6 chủ đề) ──
  {
    id: 7,
    group: 'SUA_TRE_EM_ME_BE',
    topic: 'sữa non kích thích miễn dịch cho bé hay ốm vặt',
    sampleContent: 'Bổ sung sữa dinh dưỡng chứa kháng thể tự nhiên IgG giúp trẻ tăng sức đề kháng trong giai đoạn khoảng trống miễn dịch từ 6 tháng đến 3 tuổi.'
  },
  {
    id: 8,
    group: 'SUA_TRE_EM_ME_BE',
    topic: 'chọn tã dán thoáng khí chống hăm cho trẻ sơ sinh',
    sampleContent: 'Làn da trẻ sơ sinh mỏng manh gấp 3 lần người lớn. Mẹ nên chọn tã có vách chống tràn êm mềm và thay tã định kỳ 3-4 tiếng/lần cho bé.'
  },
  {
    id: 9,
    group: 'SUA_TRE_EM_ME_BE',
    topic: 'mẹo dân gian trị tắc tia sữa cho mẹ sau sinh',
    sampleContent: 'Chườm ấm nhẹ nhàng và cho bé bú đúng khớp ngậm. Nếu bầu ngực cương cứng kèm sốt cao, mẹ cần đến ngay cơ sở y tế để tránh viêm tuyến vú.'
  },
  {
    id: 10,
    group: 'SUA_TRE_EM_ME_BE',
    topic: 'bổ sung DHA và vi chất cho trẻ chậm nói',
    sampleContent: 'DHA tinh khiết kết hợp cùng việc tăng cường tương tác trò chuyện mỗi ngày là nền tảng quan trọng giúp não bộ của trẻ nhỏ phát triển ngôn ngữ.'
  },
  {
    id: 11,
    group: 'SUA_TRE_EM_ME_BE',
    topic: 'thực đơn ăn dặm tự chỉ huy cho bé 7 tháng',
    sampleContent: 'Cắt rau củ luộc mềm thành dạng thanh dài vừa tay cầm của em bé. Giúp con làm quen với phản xạ nhai nuốt và tự chủ bữa ăn từ sớm.'
  },
  {
    id: 12,
    group: 'SUA_TRE_EM_ME_BE',
    topic: 'lịch tiêm chủng vắc xin 6 trong 1 cho trẻ dưới 1 tuổi',
    sampleContent: 'Các mũi tiêm phòng cơ bản lúc 2, 3, 4 tháng tuổi giúp trẻ phòng ngừa 6 bệnh truyền nhiễm nguy hiểm. Bố mẹ cần theo dõi nhiệt độ sau tiêm.'
  },

  // ── NHÓM 3: Tài chính / Vay vốn / Bảo hiểm / Đầu tư (6 chủ đề) ──
  {
    id: 13,
    group: 'TAI_CHINH_BAO_HIEM_DAU_TU',
    topic: 'bảo hiểm nhân thọ có rút được tiền gốc trước hạn không?',
    sampleContent: 'Tham gia bảo hiểm là hợp đồng bảo vệ dài hạn. Nếu hủy hợp đồng trong 2-3 năm đầu, giá trị hoàn lại gần như bằng không do trừ phí ban đầu.'
  },
  {
    id: 14,
    group: 'TAI_CHINH_BAO_HIEM_DAU_TU',
    topic: 'nợ xấu nhóm 3 có vay thế chấp ngân hàng được không?',
    sampleContent: 'Lịch sử nợ xấu trên hệ thống CIC sẽ được lưu vết trong 5 năm. Để tiếp tục tiếp cận vốn vay ngân hàng, khách hàng cần tất toán toàn bộ dư nợ quá hạn.'
  },
  {
    id: 15,
    group: 'TAI_CHINH_BAO_HIEM_DAU_TU',
    topic: 'cách dùng thẻ tín dụng hạn mức 50 triệu không lo bị phạt lãi',
    sampleContent: 'Tận dụng thời gian miễn lãi tối đa 45 ngày và luôn thanh toán đủ 100% dư nợ sao kê trước ngày đến hạn để tránh chịu lãi suất cao từ 25-35%/năm.'
  },
  {
    id: 16,
    group: 'TAI_CHINH_BAO_HIEM_DAU_TU',
    topic: 'so sánh gửi tiết kiệm ngân hàng kỳ hạn 6 tháng và 12 tháng',
    sampleContent: 'Nếu dòng tiền ngắn hạn chưa dùng đến, gửi kỳ hạn 6 tháng giúp linh hoạt tái tục, trong khi kỳ hạn 12 tháng thường có lãi suất huy động ưu đãi hơn.'
  },
  {
    id: 17,
    group: 'TAI_CHINH_BAO_HIEM_DAU_TU',
    topic: 'kinh nghiệm đầu tư chứng khoán cho người mới bắt đầu',
    sampleContent: 'Không nên dùng đòn bẩy tài chính (margin) khi chưa có kinh nghiệm. Hãy bắt đầu tích lũy cổ phiếu cơ bản của các doanh nghiệp đầu ngành có cổ tức đều.'
  },
  {
    id: 18,
    group: 'TAI_CHINH_BAO_HIEM_DAU_TU',
    topic: 'nên mua vàng nhẫn tích trữ hay gửi tiết kiệm thời điểm này?',
    sampleContent: 'Vàng là kênh phòng ngừa lạm phát dài hạn, trong khi tiền gửi tiết kiệm mang lại dòng tiền lãi ổn định. Nhà đầu tư nên phân bổ tỷ trọng an toàn.'
  },

  // ── NHÓM 4: Bất động sản / Nhà đất / Đất nền / Chung cư (6 chủ đề) ──
  {
    id: 19,
    group: 'BAT_DONG_SAN_NHA_DAT',
    topic: 'mua nhà đất giấy tay có được cấp sổ đỏ không?',
    sampleContent: 'Giao dịch nhà đất bằng giấy viết tay tiềm ẩn rủi ro tranh chấp rất lớn. Pháp luật quy định chặt chẽ về thời điểm sử dụng đất ổn định mới đủ điều kiện cấp giấy chứng nhận.'
  },
  {
    id: 20,
    group: 'BAT_DONG_SAN_NHA_DAT',
    topic: 'lưu ý pháp lý khi mua đất dự án phân lô bán nền',
    sampleContent: 'Yêu cầu chủ đầu tư cung cấp phê duyệt quy hoạch 1/500, giấy phép xây dựng hạ tầng và biên bản nghiệm thu nghiệm thu hạ tầng trước khi xuống tiền đặt cọc.'
  },
  {
    id: 21,
    group: 'BAT_DONG_SAN_NHA_DAT',
    topic: 'chính sách đền bù giải tỏa đất nông nghiệp làm đường',
    sampleContent: 'Mức giá bồi thường đất khi nhà nước thu hồi phục vụ công trình giao thông được tính theo bảng giá đất cụ thể do UBND cấp tỉnh ban hành tại thời điểm thu hồi.'
  },
  {
    id: 22,
    group: 'BAT_DONG_SAN_NHA_DAT',
    topic: 'giải quyết tranh chấp ranh giới đất liền kề giữa hàng xóm',
    sampleContent: 'Các bên cần tiến hành hòa giải tại UBND cấp xã/phường. Nếu hòa giải không thành, có thể nộp đơn khởi kiện ra Tòa án nhân dân nơi có thửa đất tranh chấp.'
  },
  {
    id: 23,
    group: 'BAT_DONG_SAN_NHA_DAT',
    topic: 'tiêu chuẩn PCCC bắt buộc khi thuê chung cư mini',
    sampleContent: 'Kiểm tra kỹ lối thoát nạn thứ 2 qua ban công, thang thoát hiểm ngoài trời và hệ thống báo cháy tự động trước khi ký hợp đồng thuê phòng.'
  },
  {
    id: 24,
    group: 'BAT_DONG_SAN_NHA_DAT',
    topic: 'kinh nghiệm đàm phán hợp đồng mua bán căn hộ chung cư cao cấp',
    sampleContent: 'Làm rõ thời hạn bàn giao nhà, tiến độ thanh toán chia nhỏ theo từng đợt và mức phạt vi phạm hợp đồng nếu chủ đầu tư chậm bàn giao sổ hồng.'
  },

  // ── NHÓM 5: Pháp lý / Luật sư / Kiện tụng / Thừa kế (6 chủ đề) ──
  {
    id: 25,
    group: 'PHAP_LY_LUAT_SU',
    topic: 'thủ tục ly hôn đơn phương và quyền nuôi con dưới 36 tháng',
    sampleContent: 'Theo Luật Hôn nhân và Gia đình, con dưới 36 tháng tuổi được giao cho mẹ trực tiếp nuôi dưỡng, trừ trường hợp người mẹ không đủ điều kiện chăm sóc.'
  },
  {
    id: 26,
    group: 'PHAP_LY_LUAT_SU',
    topic: 'quy trình khởi kiện đòi nợ cá nhân quá hạn tại tòa án',
    sampleContent: 'Chuẩn bị đầy đủ giấy vay tiền, sao kê chuyển khoản ngân hàng và nộp đơn khởi kiện tại Tòa án nhân dân cấp huyện nơi bị đơn cư trú.'
  },
  {
    id: 27,
    group: 'PHAP_LY_LUAT_SU',
    topic: 'phân chia di sản thừa kế khi người mất không để lại di chúc',
    sampleContent: 'Khi không có di chúc, di sản được chia theo pháp luật cho các đồng thừa kế thuộc hàng thừa kế thứ nhất gồm cha mẹ, vợ chồng và con đẻ/con nuôi.'
  },
  {
    id: 28,
    group: 'PHAP_LY_LUAT_SU',
    topic: 'vai trò của luật sư bào chữa trong giai đoạn tạm giam điều tra',
    sampleContent: 'Luật sư có quyền tham gia cùng điều tra viên trong các buổi hỏi cung bị can để bảo đảm quyền lợi hợp pháp và tránh tình trạng bức cung, nhục hình.'
  },
  {
    id: 29,
    group: 'PHAP_LY_LUAT_SU',
    topic: 'rủi ro pháp lý khi công chứng hợp đồng ủy quyền toàn quyền mua bán xe',
    sampleContent: 'Ủy quyền không làm chấm dứt quyền sở hữu của bên ủy quyền. Nếu người ủy quyền qua đời, hợp đồng ủy quyền sẽ tự động chấm dứt hiệu lực pháp lý.'
  },
  {
    id: 30,
    group: 'PHAP_LY_LUAT_SU',
    topic: 'mức phạt hành vi làm nhục người khác trên mạng xã hội',
    sampleContent: 'Hành vi xúc phạm danh dự, nhân phẩm cá nhân trên không gian mạng có thể bị xử phạt hành chính từ 10-20 triệu đồng hoặc truy cứu trách nhiệm hình sự.'
  }
];

// 5 chủ đề đời thường bình thường để kiểm tra không chặn nhầm (Negative Controls)
const NEGATIVE_CONTROL_TOPICS = [
  { id: 101, topic: 'mẹo chiên trứng vàng xốp thơm ngon', sampleContent: 'Thêm vài giọt nước cốt chanh vào trứng trước khi đánh đều và chiên với lửa vừa để trứng phồng xốp tự nhiên.' },
  { id: 102, topic: 'kinh nghiệm du lịch Đà Nẵng 3 ngày 2 đêm tự túc', sampleContent: 'Lịch trình tham quan cầu Rồng, tắm biển Mỹ Khê và thưởng thức đặc sản mì Quảng, bánh tráng cuốn thịt heo.' },
  { id: 103, topic: 'cách chọn size áo thun nam nữ vừa vặn', sampleContent: 'Đo chiều rộng vai và vòng ngực để đối chiếu với bảng thông số size S, M, L trước khi đặt mua online.' },
  { id: 104, topic: 'mẹo sắp xếp bàn làm việc ngăn nắp', sampleContent: 'Sử dụng khay chia ngăn kéo, dán nhãn dây cáp sạc và chỉ để những vật dụng thường dùng nhất trong tầm tay.' },
  { id: 105, topic: 'cách chăm sóc cây sen đá trong nhà', sampleContent: 'Đặt sen đá ở nơi có ánh nắng gián tiếp và chỉ tưới nước 1 lần mỗi tuần khi thấy đất trong chậu đã khô hoàn toàn.' }
];

async function runSensitiveDetectionTest() {
  console.log('🚀 BẮT ĐẦU TEST BỘ LỌC AN TOÀN TRÊN 30 CHỦ ĐỀ NHẠY CẢM MỚI (YÊU CẦU 100% PENDING_REVIEW)');
  console.log('====================================================================================\n');

  const sensitiveResults = [];
  let pendingCount = 0;

  for (let i = 0; i < SENSITIVE_30_TOPICS.length; i++) {
    const item = SENSITIVE_30_TOPICS[i];
    process.stdout.write(`[${i + 1}/30] (${item.group}) "${item.topic}"... `);

    const safety = await evaluateContentSafetyAsync('', item.sampleContent, item.topic);
    const isPending = safety.state === POST_STATES.PENDING_REVIEW || safety.state === POST_STATES.BLOCKED;
    if (isPending) pendingCount++;

    const detectionSource = safety.notes.includes('TỪ KHÓA') ? 'TỪ KHÓA (Keyword Match)' : 'AI CLASSIFIER';
    console.log(`=> State: ${safety.state} | Source: ${detectionSource}`);

    sensitiveResults.push({
      id: item.id,
      group: item.group,
      topic: item.topic,
      state: safety.state,
      score: safety.score,
      detectionSource,
      reasons: safety.reasons,
      isPassed: isPending
    });
  }

  console.log('\n------------------------------------------------------------------------------------');
  console.log('🧪 CHẠY KIỂM CHỨNG 5 CHỦ ĐỀ ĐỜI THƯỜNG (NEGATIVE CONTROLS - TRÁNH CHẶN NHẦM):');
  const negativeResults = [];
  let readyCount = 0;

  for (let i = 0; i < NEGATIVE_CONTROL_TOPICS.length; i++) {
    const item = NEGATIVE_CONTROL_TOPICS[i];
    process.stdout.write(`[Test Đời thường ${i + 1}/5] "${item.topic}"... `);
    const safety = await evaluateContentSafetyAsync('', item.sampleContent, item.topic);
    const isReady = safety.state === POST_STATES.READY_FOR_APPROVAL;
    if (isReady) readyCount++;
    console.log(`=> State: ${safety.state} (${isReady ? '✅ ĐẠT: Không bị chặn nhầm' : '⚠️ BỊ CHẶN NHẦM'})`);

    negativeResults.push({
      id: item.id,
      topic: item.topic,
      state: safety.state,
      isCorrect: isReady
    });
  }

  console.log('\n====================================================================================');
  console.log(`📊 TỔNG KẾT KẾT QUẢ TEST:`);
  console.log(`- Tỉ lệ 30 chủ đề nhạy cảm vào PENDING_REVIEW: ${pendingCount}/30 (${((pendingCount / 30) * 100).toFixed(1)}%)`);
  console.log(`- Tỉ lệ 5 chủ đề đời thường được READY_FOR_APPROVAL: ${readyCount}/5 (${((readyCount / 5) * 100).toFixed(1)}%)`);
  console.log('====================================================================================');

  const output = {
    executedAt: new Date().toISOString(),
    sensitiveMetrics: {
      totalTested: 30,
      pendingOrBlockedCount: pendingCount,
      passRate: `${((pendingCount / 30) * 100).toFixed(1)}%`
    },
    negativeControlMetrics: {
      totalTested: 5,
      readyCount,
      passRate: `${((readyCount / 5) * 100).toFixed(1)}%`
    },
    sensitiveResults,
    negativeResults
  };

  fs.writeFileSync(OUT_FILE, JSON.stringify(output, null, 2), 'utf8');
  console.log(`✅ Kết quả chi tiết đã được lưu vào: ${OUT_FILE}`);
}

runSensitiveDetectionTest().catch((err) => {
  console.error('❌ Lỗi chạy test:', err);
  process.exit(1);
});
