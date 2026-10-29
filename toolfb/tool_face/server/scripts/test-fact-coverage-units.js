/**
 * test-fact-coverage-units.js
 * Bộ Unit Test độc lập kiểm tra độ chính xác của hàm verifyFactCoverageByCode:
 * 1. Test Giá tiền: chấp nhận các biến thể (4.990.000đ, 4,990,000, 4.99tr, 4tr99); phát hiện khi cố tình xóa giá.
 * 2. Test Thời hạn: chấp nhận biến thể (24 tháng, 2 năm); phát hiện khi cố tình xóa thời hạn.
 * 3. Test Diện tích: chấp nhận biến thể (65m², 65m2, 65 mét vuông); phát hiện khi cố tình xóa diện tích.
 * 4. Test Tên sản phẩm/thương hiệu: Test Coffee, Máy lọc nước X, Căn hộ mẫu Y; phát hiện khi cố tình xóa tên.
 * 5. Test Số lượng / K-format: 299k, 299.000đ, mua 2 tặng 1; phát hiện khi xóa.
 */

const { verifyFactCoverageByCode } = require('../src/utils/ClaimExtractor');

let passedTests = 0;
let totalTests = 0;

function assert(condition, testName, details = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ [PASS] ${testName}`);
  } else {
    console.error(`  ❌ [FAIL] ${testName} - ${details}`);
  }
}

console.log('========================================================================');
console.log('🧪 BẮT ĐẦU CHẠY UNIT TEST CHO verifyFactCoverageByCode');
console.log('========================================================================\n');

// ═══ TEST SUITE 1: GIÁ TIỀN & BIẾN THỂ ═══
console.log('>>> TEST SUITE 1: GIÁ TIỀN & BIẾN THỂ (Máy lọc nước 4.990.000đ)');
const factsPrice = 'Giá niêm yết 4.990.000đ, bảo hành 24 tháng chính hãng';

// 1.1: Chuẩn 4.990.000đ
const t1_1 = verifyFactCoverageByCode('Máy lọc nước có giá niêm yết 4.990.000đ bảo hành 24 tháng', factsPrice);
assert(t1_1.isFullyCovered, 'Nhận diện giá chuẩn 4.990.000đ');

// 1.2: Biến thể 4,99 triệu
const t1_2 = verifyFactCoverageByCode('Sản phẩm chỉ với 4,99 triệu đồng, được bảo hành 24 tháng', factsPrice);
assert(t1_2.isFullyCovered, 'Nhận diện biến thể 4,99 triệu');

// 1.3: Biến thể 4tr99
const t1_3 = verifyFactCoverageByCode('Giá ưu đãi 4tr99, bảo hành 2 năm', factsPrice);
assert(t1_3.isFullyCovered, 'Nhận diện biến thể 4tr99 & bảo hành 2 năm');

// 1.4: Cố tình XÓA GIÁ
const t1_4 = verifyFactCoverageByCode('Máy lọc nước chính hãng bảo hành 24 tháng', factsPrice);
assert(!t1_4.isFullyCovered && t1_4.missingFacts.includes('Giá 4.990.000đ'), 'Bắt lỗi khi cố tình XÓA GIÁ', `Missing: ${t1_4.missingFacts.join(', ')}`);


// ═══ TEST SUITE 2: THỜI HẠN & BIẾN THỂ ═══
console.log('\n>>> TEST SUITE 2: THỜI HẠN & BIẾN THỂ (24 tháng, 7 ngày, 6 buổi)');
const factsTime = 'Khóa học 6 buổi thực hành, đổi trả trong vòng 7 ngày, bảo hành 24 tháng';

// 2.1: Chuẩn
const t2_1 = verifyFactCoverageByCode('Khóa gồm 6 buổi, cam kết đổi trả 7 ngày và bảo hành 24 tháng', factsTime);
assert(t2_1.isFullyCovered, 'Nhận diện đủ 6 buổi, 7 ngày, 24 tháng');

// 2.2: Biến thể chữ (sáu buổi, 1 tuần, 2 năm)
const t2_2 = verifyFactCoverageByCode('Lớp học trong sáu buổi, hỗ trợ đổi trả 1 tuần và bảo hành 2 năm', factsTime);
assert(t2_2.isFullyCovered, 'Nhận diện biến thể sáu buổi, 1 tuần, 2 năm');

// 2.3: Cố tình XÓA THỜI HẠN ĐỔI TRẢ 7 NGÀY
const t2_3 = verifyFactCoverageByCode('Khóa gồm 6 buổi thực hành bảo hành 24 tháng', factsTime);
assert(!t2_3.isFullyCovered && t2_3.missingFacts.includes('Đổi trả 7 ngày'), 'Bắt lỗi khi cố tình XÓA ĐỔI TRẢ 7 NGÀY');


// ═══ TEST SUITE 3: DIỆN TÍCH BẤT ĐỘNG SẢN & BIẾN THỂ ═══
console.log('\n>>> TEST SUITE 3: DIỆN TÍCH BẤT ĐỘNG SẢN (65m², 2PN, mở bán đợt 1)');
const factsRealEstate = 'Thiết kế 2 phòng ngủ (2PN), diện tích 65m², mở bán đợt 1, Căn hộ mẫu Y';

// 3.1: Chuẩn 65m²
const t3_1 = verifyFactCoverageByCode('Căn hộ mẫu Y diện tích 65m², thiết kế 2 phòng ngủ đang mở bán đợt 1', factsRealEstate);
assert(t3_1.isFullyCovered, 'Nhận diện diện tích 65m²');

// 3.2: Biến thể 65m2
const t3_2 = verifyFactCoverageByCode('Căn hộ Y có 2PN rộng 65m2 trong đợt bán thứ nhất', factsRealEstate);
assert(t3_2.isFullyCovered, 'Nhận diện biến thể 65m2 và 2PN');

// 3.3: Biến thể 65 mét vuông
const t3_3 = verifyFactCoverageByCode('Không gian 65 mét vuông của Căn hộ mẫu Y với hai phòng ngủ đợt 1', factsRealEstate);
assert(t3_3.isFullyCovered, 'Nhận diện biến thể 65 mét vuông');

// 3.4: Cố tình XÓA DIỆN TÍCH 65M² (Lỗi Bài 25 trước đây)
const t3_4 = verifyFactCoverageByCode('Căn hộ mẫu Y với thiết kế 2 phòng ngủ đang mở bán đợt 1', factsRealEstate);
assert(!t3_4.isFullyCovered && t3_4.missingFacts.includes('Diện tích 65m²'), 'Bắt lỗi khi cố tình XÓA DIỆN TÍCH 65m²');


// ═══ TEST SUITE 4: TÊN SẢN PHẨM & THƯƠNG HIỆU ĐẶC THÙ ═══
console.log('\n>>> TEST SUITE 4: TÊN SẢN PHẨM & THƯƠNG HIỆU (Căn hộ mẫu Y, Test Coffee, Máy lọc nước X)');

// 4.1: Cố tình XÓA TÊN CĂN HỘ MẪU Y
const t4_1 = verifyFactCoverageByCode('Dự án chung cư cao cấp 65m2 với thiết kế 2PN mở bán đợt 1', factsRealEstate);
assert(!t4_1.isFullyCovered && t4_1.missingFacts.includes('Tên sản phẩm: Căn hộ mẫu Y'), 'Bắt lỗi khi cố tình XÓA TÊN "Căn hộ mẫu Y"');

// 4.2: Cố tình XÓA TÊN "Test Coffee"
const factsCafe = 'Quán cà phê “Test Coffee” giảm 20% đến hết tuần';
const t4_2 = verifyFactCoverageByCode('Một góc quán cà phê quen thuộc đang giảm giá 20% đến cuối tuần', factsCafe);
assert(!t4_2.isFullyCovered && t4_2.missingFacts.includes('Thương hiệu Test Coffee'), 'Bắt lỗi khi cố tình XÓA TÊN "Test Coffee"');

// 4.3: Cố tình XÓA TÊN "Máy lọc nước X"
const factsWater = 'Máy lọc nước X chính hãng giá niêm yết 4.990.000đ';
const t4_3 = verifyFactCoverageByCode('Thiết bị lọc nước gia đình chính hãng có giá 4.990.000đ', factsWater);
assert(!t4_3.isFullyCovered && t4_3.missingFacts.includes('Tên sản phẩm: Máy lọc nước X'), 'Bắt lỗi khi cố tình XÓA TÊN "Máy lọc nước X"');


// ═══ TEST SUITE 5: KHUYẾN MÃI & CHÍNH SÁCH FREESHIP ═══
console.log('\n>>> TEST SUITE 5: KHUYẾN MÃI, CHÍNH SÁCH & ĐƠN TỐI THIỂU');
const factsPromo = 'Freeship cho đơn hàng từ 299k, áp dụng mua 2 tặng 1 vào mỗi thứ Tư';

// 5.1: Chuẩn
const t5_1 = verifyFactCoverageByCode('Miễn phí vận chuyển cho đơn từ 299k, mua 2 tặng 1 vào mỗi thứ Tư', factsPromo);
assert(t5_1.isFullyCovered, 'Nhận diện freeship từ 299k, mua 2 tặng 1 thứ 4');

// 5.2: Biến thể 299.000đ và thứ 4
const t5_2 = verifyFactCoverageByCode('Free ship khi mua từ 299.000đ, mua 2 tặng 1 thứ 4 hàng tuần', factsPromo);
assert(t5_2.isFullyCovered, 'Nhận diện 299.000đ và thứ 4');

// 5.3: Cố tình XÓA FREESHIP
const t5_3 = verifyFactCoverageByCode('Áp dụng đơn từ 299k, mua 2 tặng 1 thứ Tư', factsPromo);
assert(!t5_3.isFullyCovered && t5_3.missingFacts.includes('Freeship / Miễn phí vận chuyển'), 'Bắt lỗi khi cố tình XÓA FREESHIP');


// ═══ TEST SUITE 6: CHỐNG BÁO THIẾU OAN KHI DÙNG VĂN PHONG TỰ NHIÊN (8 CA) ═══
console.log('\n>>> TEST SUITE 6: CHỐNG BÁO THIẾU OAN TRÊN VĂN PHONG TỰ NHIÊN (8 CA)');

// 6.1: "bốn triệu chín"
const t6_1 = verifyFactCoverageByCode('Thiết bị Máy lọc nước X chỉ bốn triệu chín, bảo hành 24 tháng', factsWater);
assert(t6_1.isFullyCovered, '6.1: Nhận diện chữ "bốn triệu chín"');

// 6.2: "hai mươi phần trăm"
const t6_2 = verifyFactCoverageByCode('Test Coffee ưu đãi hai mươi phần trăm hết tuần này', factsCafe);
assert(t6_2.isFullyCovered, '6.2: Nhận diện chữ "hai mươi phần trăm"');

// 6.3: "thứ Tư hàng tuần"
const t6_3 = verifyFactCoverageByCode('Test Coffee giảm 20% và tặng thêm ly vào thứ Tư hàng tuần khi mua 2 tặng 1', factsCafe + ', áp dụng chương trình mua 2 tặng 1 vào mỗi thứ Tư');
assert(t6_3.isFullyCovered, '6.3: Nhận diện cụm "thứ Tư hàng tuần"');

// 6.4: "mỗi thứ 4"
const t6_4 = verifyFactCoverageByCode('Ghé Test Coffee giảm giá 20%, mua 2 tặng 1 vào mỗi thứ 4 nhé', factsCafe + ', áp dụng chương trình mua 2 tặng 1 vào mỗi thứ Tư');
assert(t6_4.isFullyCovered, '6.4: Nhận diện số "mỗi thứ 4" thay vì "thứ Tư"');

// 6.5: "mua hai tặng một"
const t6_5 = verifyFactCoverageByCode('Chương trình mua hai tặng một cực hời, miễn phí vận chuyển cho đơn từ 299k vào thứ Tư', factsPromo);
assert(t6_5.isFullyCovered, '6.5: Nhận diện chữ "mua hai tặng một"');

// 6.6: "một triệu hai"
const factsExcel = 'Khóa học gồm 6 buổi thực hành, học phí 1.200.000đ, cấp chứng nhận nội bộ sau khi hoàn thành bài test cuối khóa';
const t6_6 = verifyFactCoverageByCode('Học phí trọn gói chỉ một triệu hai cho 6 buổi, có bài test cấp chứng nhận', factsExcel);
assert(t6_6.isFullyCovered, '6.6: Nhận diện chữ "một triệu hai"');

// 6.7: "hai phòng ngủ" và "căn 2PN"
const t6_7 = verifyFactCoverageByCode('Căn hộ mẫu Y diện tích 65m2 với hai phòng ngủ tiện nghi mở bán đợt 1', factsRealEstate);
assert(t6_7.isFullyCovered, '6.7: Nhận diện cụm chữ "hai phòng ngủ"');

// 6.8: "sáu mươi lăm mét vuông" và "bảy ngày"
const factsCombo = 'Diện tích 65m², đổi trả trong vòng 7 ngày';
const t6_8 = verifyFactCoverageByCode('Căn hộ rộng sáu mươi lăm mét vuông, chính sách đổi trả trong bảy ngày', factsCombo);
assert(t6_8.isFullyCovered, '6.8: Nhận diện chữ "sáu mươi lăm mét vuông" và "bảy ngày"');


console.log('\n========================================================================');
console.log(`🏁 TỔNG KẾT UNIT TEST: ${passedTests}/${totalTests} TESTS PASSED (${(passedTests/totalTests*100).toFixed(0)}%)`);
console.log('========================================================================');

if (passedTests === totalTests) {
  console.log('🎉 TẤT CẢ UNIT TESTS ĐỀU ĐẠT! verifyFactCoverageByCode HOẠT ĐỘNG CHUẨN XÁC 100%.');
  process.exit(0);
} else {
  console.error('❌ CÓ UNIT TEST THẤT BẠI!');
  process.exit(1);
}
