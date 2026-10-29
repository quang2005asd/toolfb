/**
 * test-content-validator.js
 * Kiểm thử toàn diện bộ xác thực ContentValidator theo từng cặp Dương / Âm (Positive / Negative)
 * cho mọi Rule Nền tảng và Ngành nghề.
 * Đặc biệt kiểm soát: bài mẹo ăn uống KHÔNG được bị bắt buộc câu miễn trừ TPCN nhầm.
 */

const assert = require('assert');
const { validateContent } = require('../src/utils/ContentValidator');

console.log('═══════════════════════════════════════════════════════════════════════════════════');
console.log('🧪 BẮT ĐẦU KIỂM THỬ DƯƠNG / ÂM (POSITIVE / NEGATIVE) CHO CONTENTVALIDATOR');
console.log('═══════════════════════════════════════════════════════════════════════════════════\n');

let passCount = 0;
let failCount = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`✅ [PASS] ${name}`);
    passCount++;
  } catch (err) {
    console.error(`❌ [FAIL] ${name}: ${err.message}`);
    failCount++;
  }
}

// ─────────────────────────────────────────────────────────────
// 1. NHÓM RULE FORMAT FACEBOOK (MARKDOWN ASTERISKS)
// ─────────────────────────────────────────────────────────────
runTest('(-) Rule Markdown: Bắt lỗi bài viết có dấu sao **in đậm** hoặc *in nghiêng*', () => {
  const result = validateContent({
    title: 'Bí quyết chăm sóc da',
    content: 'Hôm nay mình chia sẻ **3 bước** dưỡng da cực kỳ đơn giản...',
    platform: 'facebook',
    industryKey: 'beauty'
  });
  assert.strictEqual(result.isValid, false, 'Có markdown asterisks phải trả về isValid = false');
  const errCodes = result.errors.map(e => e.code);
  assert.ok(errCodes.includes('MARKDOWN_ASTERISKS_FORBIDDEN'), 'Phải có mã lỗi MARKDOWN_ASTERISKS_FORBIDDEN');
});

runTest('(+) Rule Markdown: Cho phép bài viết ngắt dòng bằng gạch đầu dòng và text sạch', () => {
  const result = validateContent({
    title: 'Bí quyết chăm sóc da',
    content: 'Hôm nay mình chia sẻ 3 bước dưỡng da cực kỳ đơn giản:\n- Bước 1: Rửa mặt nước ấm\n- Bước 2: Cấp ẩm\n- Bước 3: Kem dưỡng',
    platform: 'facebook',
    industryKey: 'beauty'
  });
  const errCodes = result.errors.map(e => e.code);
  assert.ok(!errCodes.includes('MARKDOWN_ASTERISKS_FORBIDDEN'), 'Text sạch không được báo lỗi markdown');
});

// ─────────────────────────────────────────────────────────────
// 2. NHÓM RULE ĐỘ DÀI & HASHTAGS
// ─────────────────────────────────────────────────────────────
runTest('(-) Rule Platform: Cảnh báo bài viết spam quá 5 hashtags trên Facebook', () => {
  const result = validateContent({
    title: 'Du lịch Đà Lạt',
    content: 'Check-in quán cà phê mới toanh. #dalat #dulich #checkin #travel #coffee #food #vietnam',
    platform: 'facebook',
    industryKey: 'general'
  });
  const warnCodes = result.warnings.map(w => w.code);
  assert.ok(warnCodes.includes('PLATFORM_TOO_MANY_HASHTAGS'), 'Phải cảnh báo quá nhiều hashtag');
});

runTest('(+) Rule Platform: Hợp lệ với 3 hashtags vừa phải trên Facebook', () => {
  const result = validateContent({
    title: 'Du lịch Đà Lạt',
    content: 'Check-in góc nhỏ bình yên giữa lòng Đà Lạt sớm mai. #dalat #dulich #checkin',
    platform: 'facebook',
    industryKey: 'general'
  });
  const warnCodes = result.warnings.map(w => w.code);
  assert.ok(!warnCodes.includes('PLATFORM_TOO_MANY_HASHTAGS'), '3 hashtags không được cảnh báo thừa');
});

// ─────────────────────────────────────────────────────────────
// 3. NHÓM SỨC KHỎE: CAM KẾT CẤM (FORBIDDEN CLAIMS)
// ─────────────────────────────────────────────────────────────
runTest('(-) Rule Sức khỏe (Claims): Chặn cam kết "trị dứt điểm" hoặc "chữa khỏi vĩnh viễn"', () => {
  const result = validateContent({
    title: 'Phương pháp gia truyền',
    content: 'Bài thuốc đông y cam kết trị dứt điểm chứng mất ngủ và chữa khỏi vĩnh viễn sau 1 liệu trình.',
    platform: 'facebook',
    industryKey: 'health'
  });
  assert.strictEqual(result.isValid, false);
  const errCodes = result.errors.map(e => e.code);
  assert.ok(errCodes.includes('FORBIDDEN_INDUSTRY_CLAIM'), 'Phải chặn cam kết cấm trị dứt điểm');
});

runTest('(+) Rule Sức khỏe (Claims): Hợp lệ với chia sẻ cải thiện sức khỏe tự nhiên', () => {
  const result = validateContent({
    title: 'Thói quen ngủ ngon tự nhiên',
    content: 'Ngâm chân nước ấm với gừng trước khi ngủ giúp thư giãn cơ bắp, hỗ trợ giấc ngủ sâu hơn sau một ngày làm việc mệt mỏi.',
    platform: 'facebook',
    industryKey: 'health'
  });
  const errCodes = result.errors.map(e => e.code);
  assert.ok(!errCodes.includes('FORBIDDEN_INDUSTRY_CLAIM'), 'Không được chặn nội dung hỗ trợ tự nhiên lành mạnh');
});

// ─────────────────────────────────────────────────────────────
// 4. NHÓM SỨC KHỎE: MIỄN TRỪ TRÁCH NHIỆM TPCN VS MẸO ĂN UỐNG (TRỌNG TÂM)
// ─────────────────────────────────────────────────────────────
runTest('(+) [TRỌNG TÂM] Mẹo ăn uống đời thường KHÔNG ĐƯỢC bị bắt buộc câu miễn trừ TPCN nhầm (Canh sườn bổ sung vitamin/canxi)', () => {
  const result = validateContent({
    title: 'Bí quyết nấu canh sườn bí đao ngọt thanh',
    content: 'Vào ngày hè oi bức, một bát canh sườn hầm bí đao không chỉ giúp giải nhiệt mà còn bổ sung vitamin và canxi tự nhiên cho bữa cơm gia đình. Chúc cả nhà ngon miệng!',
    platform: 'facebook',
    industryKey: 'health'
  });
  // Bài mẹo ăn uống phải HỢP LỆ, không được có lỗi MISSING_REQUIRED_DISCLAIMER
  const errCodes = result.errors.map(e => e.code);
  assert.ok(!errCodes.includes('MISSING_REQUIRED_DISCLAIMER'), 'Mẹo nấu ăn đời thường tuyệt đối không được ép câu miễn trừ TPCN!');
  assert.strictEqual(result.isValid, true, 'Bài mẹo ăn uống phải đạt isValid = true');
});

runTest('(+) [TRỌNG TÂM] Mẹo ăn uống đời thường KHÔNG ĐƯỢC bị bắt câu miễn trừ nhầm (Salad cá hồi giàu omega)', () => {
  const result = validateContent({
    title: 'Công thức salad cá hồi quả bơ',
    content: 'Món salad cá hồi sốt mè rang vừa thơm ngậy vừa giàu axit béo omega và khoáng chất tốt cho tim mạch của cả nhà.',
    platform: 'facebook',
    industryKey: 'health'
  });
  const errCodes = result.errors.map(e => e.code);
  assert.ok(!errCodes.includes('MISSING_REQUIRED_DISCLAIMER'), 'Món ăn giàu omega không được ép câu miễn trừ TPCN!');
  assert.strictEqual(result.isValid, true);
});

runTest('(-) Rule Sức khỏe (TPCN Thật): Bắt lỗi thiếu câu miễn trừ trách nhiệm khi quảng cáo Thực phẩm chức năng / Viên uống', () => {
  const result = validateContent({
    title: 'Giới thiệu sản phẩm mới',
    content: 'Viên uống thực phẩm chức năng bổ sung collagen thủy phân hộp 60 viên giúp da săn chắc, đàn hồi tốt.',
    platform: 'facebook',
    industryKey: 'health'
  });
  assert.strictEqual(result.isValid, false, 'Viên uống TPCN thiếu miễn trừ phải invalid');
  const errCodes = result.errors.map(e => e.code);
  assert.ok(errCodes.includes('MISSING_REQUIRED_DISCLAIMER'), 'Phải bắt lỗi thiếu câu miễn trừ TPCN theo Luật Dược');
});

runTest('(+) Rule Sức khỏe (TPCN Thật): Hợp lệ khi sản phẩm TPCN có đủ câu miễn trừ theo Luật', () => {
  const result = validateContent({
    title: 'Giới thiệu sản phẩm mới',
    content: 'Viên uống thực phẩm chức năng bổ sung collagen thủy phân hộp 60 viên. Lưu ý: Sản phẩm này không phải là thuốc và không có tác dụng thay thế thuốc chữa bệnh.',
    platform: 'facebook',
    industryKey: 'health'
  });
  const errCodes = result.errors.map(e => e.code);
  assert.ok(!errCodes.includes('MISSING_REQUIRED_DISCLAIMER'), 'Khi đã có câu miễn trừ thì không được báo lỗi');
});

// ─────────────────────────────────────────────────────────────
// 5. NHÓM MẸ VÀ BÉ: SỮA CÔNG THỨC VS ĂN DẶM TỰ NHIÊN
// ─────────────────────────────────────────────────────────────
runTest('(+) Mẹ và Bé (Ăn dặm tự nhiên): KHÔNG ĐƯỢC ép thông điệp bảo vệ sữa mẹ nhầm', () => {
  const result = validateContent({
    title: 'Thực đơn ăn dặm cho bé 8 tháng',
    content: 'Cách nấu cháo cá hồi bí đỏ thơm ngậy cho bé tập nhai, bé ăn thun thút không cần ép.',
    platform: 'facebook',
    industryKey: 'mom_and_baby'
  });
  const errCodes = result.errors.map(e => e.code);
  assert.ok(!errCodes.includes('MISSING_REQUIRED_DISCLAIMER'), 'Bài cháo ăn dặm không được ép thông điệp sữa mẹ');
  assert.strictEqual(result.isValid, true);
});

runTest('(-) Mẹ và Bé (Sữa công thức): Bắt lỗi thiếu thông điệp bảo vệ sữa mẹ theo Nghị định 100', () => {
  const result = validateContent({
    title: 'Dòng sữa công thức mới cho bé',
    content: 'Sữa công thức dinh dưỡng cao cấp cho trẻ dưới 1 tuổi giúp tiêu hóa mát lành và tăng cân đều.',
    platform: 'facebook',
    industryKey: 'mom_and_baby'
  });
  assert.strictEqual(result.isValid, false);
  const errCodes = result.errors.map(e => e.code);
  assert.ok(errCodes.includes('MISSING_REQUIRED_DISCLAIMER'), 'Bắt buộc có thông điệp bảo vệ sữa mẹ theo Nghị định 100');
});

runTest('(+) Mẹ và Bé (Sữa công thức): Hợp lệ khi có đầy đủ thông điệp bảo vệ sữa mẹ', () => {
  const result = validateContent({
    title: 'Dòng sữa dinh dưỡng cho trẻ nhỏ',
    content: 'Sữa dinh dưỡng công thức hỗ trợ tiêu hóa. Khuyến cáo: Sữa mẹ là thức ăn tốt nhất cho sự phát triển của trẻ sơ sinh và trẻ nhỏ.',
    platform: 'facebook',
    industryKey: 'mom_and_baby'
  });
  const errCodes = result.errors.map(e => e.code);
  assert.ok(!errCodes.includes('MISSING_REQUIRED_DISCLAIMER'), 'Đã có thông điệp sữa mẹ thì phải hợp lệ');
});

// ─────────────────────────────────────────────────────────────
// 6. NHÓM TÀI CHÍNH: ĐỜI THƯỜNG VS ĐẦU TƯ RỦI RO
// ─────────────────────────────────────────────────────────────
runTest('(+) Tài chính (Đời thường): Kể chuyện tiết kiệm mua sách KHÔNG ĐƯỢC ép cảnh báo rủi ro chứng khoán', () => {
  const result = validateContent({
    title: 'Chiếc heo đất tuổi thơ',
    content: 'Hai vợ chồng cùng nuôi một chú heo đất tiết kiệm tiền mua sách và đồ chơi đầu năm học mới cho con.',
    platform: 'facebook',
    industryKey: 'finance'
  });
  const errCodes = result.errors.map(e => e.code);
  assert.ok(!errCodes.includes('RECOMMENDED_DISCLAIMER_MISSING'), 'Tiết kiệm heo đất không được đòi hỏi cảnh báo rủi ro!');
  assert.strictEqual(result.isValid, true);
});

runTest('(-) Tài chính (Đầu tư rủi ro): Chặn hứa hẹn bao lời cố định hoặc nhân đôi tài sản', () => {
  const result = validateContent({
    title: 'Kênh đầu tư sinh lời',
    content: 'Tham gia quỹ đầu tư cam kết lợi nhuận cố định nhân đôi tài sản sau 1 tháng không có rủi ro.',
    platform: 'facebook',
    industryKey: 'finance'
  });
  assert.strictEqual(result.isValid, false);
  const errCodes = result.errors.map(e => e.code);
  assert.ok(errCodes.includes('FORBIDDEN_INDUSTRY_CLAIM'), 'Phải chặn cam kết lợi nhuận cố định');
});

// ─────────────────────────────────────────────────────────────
// 7. NHÓM BẤT ĐỘNG SẢN: MINH BẠCH PHÁP LÝ VS CAM KẾT ẢO
// ─────────────────────────────────────────────────────────────
runTest('(-) Bất động sản: Chặn cam kết sinh lời x2 và quy hoạch ảo', () => {
  const result = validateContent({
    title: 'Mở bán đất nền',
    content: 'Dự án đất nền ven đô cam kết sinh lời x2 sau 6 tháng, sổ đỏ trao tay sau 1 ngày.',
    platform: 'facebook',
    industryKey: 'real_estate'
  });
  assert.strictEqual(result.isValid, false);
  const errCodes = result.errors.map(e => e.code);
  assert.ok(errCodes.includes('FORBIDDEN_INDUSTRY_CLAIM'), 'Phải chặn cam kết sinh lời x2');
});

runTest('(+) Bất động sản: Hợp lệ với thông tin minh bạch pháp lý', () => {
  const result = validateContent({
    title: 'Bán căn hộ chung cư 2 phòng ngủ',
    content: 'Căn hộ tầng trung view thoáng, tình trạng pháp lý sổ hồng sẵn sàng sang tên. Mời quý khách liên hệ xem nhà thực tế.',
    platform: 'facebook',
    industryKey: 'real_estate'
  });
  assert.strictEqual(result.isValid, true);
  assert.strictEqual(result.errors.length, 0);
});

console.log('\n═══════════════════════════════════════════════════════════════════════════════════');
console.log(`📊 TỔNG KẾT BỘ TEST DƯƠNG / ÂM: ${passCount} PASSED, ${failCount} FAILED`);
console.log('═══════════════════════════════════════════════════════════════════════════════════');

if (failCount > 0) {
  process.exit(1);
}
