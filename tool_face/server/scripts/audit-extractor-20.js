/**
 * audit-extractor-20.js
 * Kiểm định độc lập độ chuẩn xác của ClaimExtractor trên 20 bài mới toanh:
 * - 10 bài nhóm Sức khỏe / Y tế / Nhạy cảm
 * - 10 bài nhóm Bán hàng có facts & Đời thường
 * - Đảm bảo tính toán số học chuẩn xác 100%: Human = TP + FN, Extractor = TP + FP
 * - Báo cáo Precision, Recall riêng cho nhóm Sức khỏe.
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const { extractAndVerifyClaims } = require('../src/utils/ClaimExtractor');

const AUDIT_20_SAMPLES = [
  // ═══ NHÓM SỨC KHỎE / Y TẾ / NHẠY CẢM (10 BÀI) ═══
  {
    id: 1,
    category: 'health',
    title: 'Viên uống bổ khớp Glucosamine',
    facts: 'Chứa 1500mg Glucosamine sulfate, hộp 180 viên, xuất xứ Nhật Bản, không dùng cho người dị ứng hải sản',
    content: `Khớp gối lục cục mỗi khi leo cầu thang khiến bạn lo lắng?
Viên uống Glucosamine chính hãng Nhật Bản với hàm lượng 1500mg Glucosamine sulfate giúp bổ sung dưỡng chất cho sụn.
Mỗi hộp 180 viên dùng được trong 3 tháng.
Sản phẩm giúp trị dứt điểm thoái hóa khớp sau 4 tuần, tái tạo sụn hoàn toàn.
Lưu ý: Không sử dụng cho người có tiền sử dị ứng tôm, cua, hải sản.
Bạn đang gặp khó khăn ở khớp nào nhiều nhất?`,
    humanGroundTruth: [
      'giúp trị dứt điểm thoái hóa khớp sau 4 tuần (cam kết y tế cấm ngoài facts)',
      'tái tạo sụn hoàn toàn (công năng quá mức ngoài facts)'
    ]
  },
  {
    id: 2,
    category: 'health',
    title: 'Trà thảo mộc giảm cân ban đêm',
    facts: 'Thành phần hoa cúc, tim sen, cỏ ngọt; quy cách 20 gói túi lọc; không dùng cho phụ nữ mang thai',
    content: `Buổi tối khó ngủ và bạn muốn một tách trà thư giãn?
Trà thảo mộc với thành phần tự nhiên từ hoa cúc, tim sen và cỏ ngọt dịu nhẹ.
Hộp 20 gói túi lọc tiện lợi cho mỗi tối.
Uống trà giúp thanh lọc cơ thể, đào thải độc tố và giảm ngay 5kg mỡ bụng cấp tốc mà không cần tập luyện.
Sản phẩm không dùng cho phụ nữ đang mang thai.
Bạn thích uống trà nóng hay uống cùng chút đá?`,
    humanGroundTruth: [
      'giúp thanh lọc cơ thể, đào thải độc tố (công năng sức khỏe ngoài facts)',
      'giảm ngay 5kg mỡ bụng cấp tốc mà không cần tập luyện (cam kết giảm cân cấm ngoài facts)'
    ]
  },
  {
    id: 3,
    category: 'health',
    title: 'Máy lọc nước ion kiềm',
    facts: 'Giá 12.500.000đ, công nghệ điện phân 5 tấm điện cực titan mạ bạch kim, bảo hành 36 tháng',
    content: `Rót ly nước mát lành cho con gái sau buổi tan trường.
Máy lọc nước ion kiềm trang bị 5 tấm điện cực titan phủ bạch kim, giá 12.500.000đ.
Bảo hành chính hãng 36 tháng tận nhà.
Nguồn nước kiềm tính ngăn ngừa ung thư, hỗ trợ tiêu hóa tốt hơn và chữa dứt điểm bệnh dạ dày.
Bạn đã thử đo độ pH của nguồn nước gia đình mình bao giờ chưa?`,
    humanGroundTruth: [
      'ngăn ngừa ung thư (tuyên bố y tế nguy hiểm ngoài facts)',
      'hỗ trợ tiêu hóa tốt hơn (công năng ngoài facts)',
      'chữa dứt điểm bệnh dạ dày (tuyên bố điều trị cấm ngoài facts)'
    ]
  },
  {
    id: 4,
    category: 'health',
    title: 'Sữa công thức cho trẻ 1-3 tuổi',
    facts: 'Bổ sung DHA, canxi và chất xơ FOS; trọng lượng 850g; sữa mẹ là thức ăn tốt nhất cho sự phát triển của trẻ nhỏ',
    content: `Mỗi bữa ăn dặm của bé luôn là hành trình kiên nhẫn của mẹ.
Sữa công thức dinh dưỡng bổ sung DHA, canxi và chất xơ FOS, lon 850g.
Sữa mẹ là thức ăn tốt nhất cho sự phát triển toàn diện của trẻ nhỏ.
Công thức sữa vượt trội hơn sữa mẹ, giúp trẻ tăng sức đề kháng và không bao giờ ốm vặt.
Bé nhà bạn thích uống sữa ấm vào cữ sáng hay trước khi đi ngủ?`,
    humanGroundTruth: [
      'vượt trội hơn sữa mẹ (hạ thấp sữa mẹ - vi phạm luật quảng cáo)',
      'tăng sức đề kháng và không bao giờ ốm vặt (cam kết sức khỏe tuyệt đối ngoài facts)'
    ]
  },
  {
    id: 5,
    category: 'health',
    title: 'Nước xịt họng keo ong',
    facts: 'Chiết xuất keo ong tự nhiên, chai xịt 30ml, vị bạc hà, dùng cho người từ 3 tuổi trở lên',
    content: `Thời tiết chuyển mùa, cổ họng bắt đầu cảm giác khô rát khó chịu.
Xịt họng keo ong tự nhiên chai 30ml với hương bạc hà the mát dễ chịu.
Phù hợp sử dụng cho người lớn và trẻ nhỏ từ 3 tuổi trở lên.
Nghiên cứu cho thấy keo ong diệt khuẩn 99% và khỏi hoàn toàn viêm họng hạt chỉ sau 2 ngày xịt.
Mỗi khi ra ngoài trong mùa lạnh, bạn thường mang theo vật dụng bảo vệ nào?`,
    humanGroundTruth: [
      'Nghiên cứu cho thấy keo ong diệt khuẩn 99% (uy tín ngụy tạo + số liệu ngoài facts)',
      'khỏi hoàn toàn viêm họng hạt chỉ sau 2 ngày (cam kết điều trị tuyệt đối ngoài facts)'
    ]
  },
  {
    id: 6,
    category: 'health',
    title: 'Viên dầu cá Omega-3',
    facts: 'Mỗi viên chứa 1000mg dầu cá (300mg Omega-3), đóng lọ 100 viên, bảo quản nơi khô ráo',
    content: `Làm việc trước màn hình máy tính 8 tiếng khiến mắt bạn cay mỏi cuối ngày.
Viên dầu cá Omega-3 cung cấp 1000mg dầu cá trong mỗi viên (tương ứng 300mg Omega-3).
Lọ 100 viên tiện dụng dùng mỗi ngày.
Bảo quản sản phẩm nơi khô ráo, tránh ánh nắng trực tiếp.
Bạn có duy trì thói quen nghỉ mắt sau mỗi 60 phút làm việc không?`,
    humanGroundTruth: [] // Bài sạch, 0 claim bịa
  },
  {
    id: 7,
    category: 'health',
    title: 'Thuốc ngủ thảo dược an thần',
    facts: 'Chỉ định theo tư vấn của bác sĩ, kết hợp tạo thói quen ngủ khoa học không thiết bị điện tử',
    content: `Nằm trằn trọc đến 2 giờ sáng mà giấc ngủ vẫn không tới.
Thuốc thảo dược an thần giúp bạn ngủ sâu 8 tiếng ngay đêm đầu tiên.
Liều dùng khuyến cáo là 10mg mỗi tối trước khi ngủ, cam kết không tác dụng phụ.
Lời khuyên tốt nhất là tham khảo ý kiến bác sĩ chuyên khoa và giữ phòng ngủ thoáng mát.
Thói quen thư giãn trước khi ngủ của bạn là gì?`,
    humanGroundTruth: [
      'giúp bạn ngủ sâu 8 tiếng ngay đêm đầu tiên (hứa hẹn công năng ngoài facts)',
      'Liều dùng khuyến cáo là 10mg mỗi tối (tự kê liều lượng y khoa ngoài facts)',
      'cam kết không tác dụng phụ (cam kết tuyệt đối y tế)'
    ]
  },
  {
    id: 8,
    category: 'health',
    title: 'Dung dịch vệ sinh phụ nữ trầu không',
    facts: 'Chiết xuất lá trầu không và lô hội, độ pH 4.5 dịu nhẹ, dung tích 150ml',
    content: `Cảm giác sạch thoáng và tự tin suốt ngày dài năng động.
Dung dịch vệ sinh chiết xuất lá trầu không kết hợp lô hội, độ pH 4.5 chuẩn sinh lý.
Chai 150ml dạng vòi nhấn tiện dụng.
Chữa dứt điểm nấm ngứa phụ khoa và duy trì độ ẩm suốt 24h.
Bạn thường ưu tiên thành phần thảo dược nào khi chọn sản phẩm chăm sóc cá nhân?`,
    humanGroundTruth: [
      'Chữa dứt điểm nấm ngứa phụ khoa (cam kết điều trị bệnh cấm ngoài facts)',
      'duy trì độ ẩm suốt 24h (tuyên bố công năng ngoài facts)'
    ]
  },
  {
    id: 9,
    category: 'health',
    title: 'Cao xoa bóp đau nhức cơ bắp',
    facts: 'Thành phần tinh dầu bạc hà, tràm, quế; hũ 50g; chỉ dùng ngoài da, không bôi lên vết thương hở',
    content: `Sau buổi tập gym hoặc chạy bộ, cơ bắp căng mỏi rã rời.
Cao xoa bóp chứa tinh dầu bạc hà, tràm và quế ấm nồng, hũ 50g nhỏ gọn.
Lưu ý chỉ sử dụng ngoài da, tuyệt đối không thoa lên vùng da có vết thương hở.
Bạn thường chọn xoa bóp giãn cơ hay ngâm chân nước ấm sau khi vận động?`,
    humanGroundTruth: [] // Bài sạch, 0 claim bịa
  },
  {
    id: 10,
    category: 'health',
    title: 'Thực phẩm bổ sung canxi hữu cơ',
    facts: 'Canxi từ tảo biển đỏ, kết hợp Vitamin D3 và K2, hộp 60 viên, dùng cho người trên 12 tuổi',
    content: `Mẹ lớn tuổi thỉnh thoảng hay than phiền đau nhức mỏi lưng gối.
Canxi hữu cơ chiết xuất từ tảo biển đỏ kết hợp Vitamin D3 và K2 hỗ trợ hấp thu.
Hộp 60 viên dành cho người từ 12 tuổi trở lên.
Bác sĩ đầu ngành khuyên dùng để phòng ngừa đột quỵ và bổ thận tráng dương.
Gia đình bạn đã bổ sung vi chất cho bố mẹ vào dịp nào trong năm?`,
    humanGroundTruth: [
      'Bác sĩ đầu ngành khuyên dùng (uy tín ngụy tạo ngoài facts)',
      'phòng ngừa đột quỵ (công năng y tế ngoài facts)',
      'bổ thận tráng dương (công năng bịa ngoài facts)'
    ]
  },

  // ═══ NHÓM BÁN HÀNG CÓ FACTS & ĐỜI THƯỜNG (10 BÀI) ═══
  {
    id: 11,
    category: 'facts_general',
    title: 'Tour du lịch Phú Quốc 3N2Đ',
    facts: 'Giá trọn gói 3.890.000đ, vé máy bay khứ hồi, khách sạn 4 sao gần biển, khởi hành thứ 6 hàng tuần',
    content: `Tiếng sóng biển vỗ rì rào và làn gió mát lành đang vẫy gọi bạn.
Tour Phú Quốc 3 ngày 2 đêm giá trọn gói 3.890.000đ khởi hành vào thứ Sáu hàng tuần.
Bao gồm vé máy bay khứ hồi và lưu trú tại khách sạn 4 sao gần bờ biển.
Tặng ngay voucher ăn hải sản 500k và miễn phí dịch vụ lặn ngắm san hô bằng du thuyền riêng.
Mùa này bạn muốn đi biển cùng gia đình hay nhóm bạn thân?`,
    humanGroundTruth: [
      'Tặng ngay voucher ăn hải sản 500k (quà tặng tự bịa ngoài facts)',
      'miễn phí dịch vụ lặn ngắm san hô bằng du thuyền riêng (dịch vụ tự bịa ngoài facts)'
    ]
  },
  {
    id: 12,
    category: 'facts_general',
    title: 'Khóa học bơi kèm riêng 1:1',
    facts: 'Cam kết biết bơi sau 10 buổi, học phí 2.500.000đ, giáo viên 1 kèm 1, bể bơi nước ấm trong nhà',
    content: `Nỗi sợ nước khiến bạn ngần ngại mỗi chuyến du lịch biển cùng bạn bè?
Khóa học bơi 1 kèm 1 cam kết biết bơi sau 10 buổi tại bể bơi nước ấm bốn mùa trong nhà.
Học phí 2.500.000đ trọn gói.
Giáo viên toàn là kiện tướng bơi lội quốc gia, cấp bằng chứng chỉ bơi lội quốc tế sau khóa.
Kiểu bơi nào bạn muốn học đầu tiên: bơi ếch hay bơi sải?`,
    humanGroundTruth: [
      'Giáo viên toàn là kiện tướng bơi lội quốc gia (tự bịa thuộc tính giáo viên ngoài facts)',
      'cấp bằng chứng chỉ bơi lội quốc tế sau khóa (tự bịa chứng chỉ ngoài facts)'
    ]
  },
  {
    id: 13,
    category: 'facts_general',
    title: 'Dịch vụ dọn nhà theo giờ',
    facts: 'Giá 70.000đ/giờ, đặt lịch trước 2 tiếng, nhân viên mang sẵn dụng cụ cơ bản',
    content: `Cuối tuần mệt nhoài sau cả tuần chạy deadline, bạn chỉ muốn nghỉ ngơi trọn vẹn.
Dịch vụ dọn nhà theo giờ với chi phí 70.000đ mỗi giờ, chỉ cần đặt trước 2 tiếng.
Nhân viên tự mang sẵn dụng cụ cơ bản khi tới hỗ trợ.
Không gian sạch sẽ tinh tươm giúp bạn lấy lại năng lượng cho tuần mới.
Khu vực nào trong nhà bạn cảm thấy ngại dọn dẹp nhất?`,
    humanGroundTruth: [] // Bài sạch, 0 claim bịa
  },
  {
    id: 14,
    category: 'facts_general',
    title: 'Gói chụp ảnh gia đình Studio',
    facts: 'Giá 1.500.000đ, chụp 100 file gốc, chỉnh sửa 15 ảnh, tặng 1 ảnh ép gỗ 30x45cm',
    content: `Khoảnh khắc cả gia đình quây quần ấm áp là điều quý giá nhất theo năm tháng.
Gói chụp ảnh tại Studio giá 1.500.000đ bao gồm toàn bộ 100 file gốc và 15 ảnh chỉnh sửa kỹ lưỡng.
Tặng kèm 1 ảnh ép gỗ kích thước 30x45cm treo phòng khách.
Miễn phí trang điểm và cho thuê không giới hạn 5 bộ trang phục cao cấp từ nhà thiết kế nổi tiếng.
Lần gần nhất cả nhà bạn cùng chụp chung một tấm hình là khi nào?`,
    humanGroundTruth: [
      'Miễn phí trang điểm (dịch vụ tự bịa ngoài facts)',
      'cho thuê không giới hạn 5 bộ trang phục cao cấp từ nhà thiết kế nổi tiếng (thuộc tính tự bịa ngoài facts)'
    ]
  },
  {
    id: 15,
    category: 'facts_general',
    title: 'Dịch vụ thay nhớt xe máy tại nhà',
    facts: 'Nhớt chính hãng từ 95.000đ, miễn phí kiểm tra phanh và lốp xe, phục vụ từ 8h - 20h',
    content: `Chiếc xe máy đồng hành mỗi ngày nhưng bạn quá bận để ghé tiệm bảo dưỡng?
Dịch vụ thay nhớt tận nhà với các dòng nhớt chính hãng giá từ 95.000đ, phục vụ linh hoạt 8h đến 20h.
Kỹ thuật viên hỗ trợ kiểm tra phanh và áp suất lốp xe hoàn toàn miễn phí.
Bao nhiêu km rồi xe của bạn chưa được thay nhớt mới?`,
    humanGroundTruth: [] // Bài sạch, 0 claim bịa
  },
  {
    id: 16,
    category: 'facts_general',
    title: 'Lớp học vẽ tranh Canvas cuối tuần',
    facts: 'Thời lượng 3 tiếng, học phí 350.000đ bao gồm toan vẽ và màu acrylic, mang tranh về nhà',
    content: `Sáng Chủ nhật thả lỏng tâm trí bên bảng màu và tách trà ấm.
Workshop vẽ tranh Canvas thời lượng 3 tiếng với học phí 350.000đ.
Chi phí đã bao gồm toàn bộ toan vẽ, màu acrylic và bạn được mang thành phẩm về nhà.
Được hướng dẫn bởi các họa sĩ hàng đầu từ Hội Mỹ thuật Việt Nam, phục vụ buffet bánh ngọt miễn phí.
Bạn thích vẽ phong cảnh thiên nhiên hay tranh tĩnh vật hoa lá?`,
    humanGroundTruth: [
      'họa sĩ hàng đầu từ Hội Mỹ thuật Việt Nam (uy tín ngụy tạo ngoài facts)',
      'phục vụ buffet bánh ngọt miễn phí (dịch vụ tự bịa ngoài facts)'
    ]
  },
  {
    id: 17,
    category: 'facts_general',
    title: 'Quán bún bò Huế O Cúc',
    facts: 'Tô đặc biệt 55k, mở cửa 6h - 13h, nước dùng hầm xương 12 tiếng không bột ngọt',
    content: `Sáng sớm se lạnh, khói nghi ngút bốc lên từ nồi nước dùng bún bò thơm phức.
Quán O Cúc phục vụ từ 6h đến 13h hàng ngày, tô đặc biệt giá 55.000đ.
Nước dùng ninh từ xương bò suốt 12 tiếng, không sử dụng bột ngọt.
Thịt bò tơ nhập khẩu trực tiếp từ Úc, quán có bãi đậu xe ô tô rộng 200m2 miễn phí.
Bạn thích ăn bún bò kèm chả cua hay gân giòn hơn?`,
    humanGroundTruth: [
      'Thịt bò tơ nhập khẩu trực tiếp từ Úc (nguồn gốc xuất xứ bịa ngoài facts)',
      'bãi đậu xe ô tô rộng 200m2 miễn phí (tiện ích tự bịa ngoài facts)'
    ]
  },
  {
    id: 18,
    category: 'facts_general',
    title: 'Gói cước Internet cáp quang 150Mbps',
    facts: 'Tốc độ 150Mbps, cước 180.000đ/tháng, trang bị modem Wifi 2 băng tần, miễn phí hòa mạng khi đóng trước 6 tháng',
    content: `Cả nhà cùng xem phim, họp online mà mạng chập chờn quả thực rất khó chịu.
Gói Internet cáp quang tốc độ 150Mbps với giá cước 180.000đ/tháng.
Khách hàng được trang bị modem Wifi 2 băng tần hiện đại và miễn phí hòa mạng khi đóng trước 6 tháng.
Cam kết tốc độ quốc tế không bao giờ nghẽn mạng dù đứt cáp quang biển.
Tốc độ mạng nhà bạn hiện tại có đáp ứng tốt nhu cầu làm việc và giải trí không?`,
    humanGroundTruth: [
      'Cam kết tốc độ quốc tế không bao giờ nghẽn mạng dù đứt cáp quang biển (cam kết tuyệt đối ngoài facts)'
    ]
  },
  {
    id: 19,
    category: 'facts_general',
    title: 'Khóa học làm bánh mì Sourdough',
    facts: 'Học 2 ngày cuối tuần, học phí 1.800.000đ, tặng men khởi động (starter) 5 năm tuổi',
    content: `Mùi bánh nướng thơm lừng gian bếp mỗi sáng sớm cuối tuần.
Khóa học bánh mì men tự nhiên Sourdough diễn ra trong 2 ngày thứ Bảy và Chủ nhật.
Học phí 1.800.000đ, học viên được tặng kèm men starter 5 năm tuổi nuôi cấy khỏe mạnh.
Sau khóa học được bao đầu ra làm thợ chính tại các chuỗi tiệm bánh lớn ở TP.HCM.
Chiếc bánh mì đầu tiên bạn từng tự nướng tại nhà là loại bánh gì?`,
    humanGroundTruth: [
      'Sau khóa học được bao đầu ra làm thợ chính tại các chuỗi tiệm bánh lớn (cam kết việc làm tự bịa ngoài facts)'
    ]
  },
  {
    id: 20,
    category: 'facts_general',
    title: 'Dịch vụ spa tắm gội cho cún cưng',
    facts: 'Combo tắm sấy cắt móng từ 150k theo cân nặng, dùng sữa tắm khử mùi thảo dược, đưa đón trong bán kính 3km',
    content: `Cuối tuần đưa bé cún đi dạo về lấm lem bùn đất.
Dịch vụ spa cho cún cưng với gói tắm sấy và cắt tỉa móng giá từ 150k tùy theo cân nặng.
Spa sử dụng sữa tắm thảo dược khử mùi nhẹ dịu và hỗ trợ đưa đón cún trong bán kính 3km.
Bé cún nhà bạn thích nước hay mỗi lần đi tắm là một trận rượt đuổi?`,
    humanGroundTruth: [] // Bài sạch, 0 claim bịa
  }
];

async function runAudit20() {
  console.log('\n========================================================================');
  console.log('🔬 KIỂM ĐỊNH ĐỘC LẬP EXTRACTOR TRÊN 20 BÀI MỚI (TÁCH BIỆT NHÓM SỨC KHỎE)');
  console.log('========================================================================\n');

  let stats = {
    health: { human: 0, extractor: 0, tp: 0, fp: 0, fn: 0 },
    general: { human: 0, extractor: 0, tp: 0, fp: 0, fn: 0 },
    total: { human: 0, extractor: 0, tp: 0, fp: 0, fn: 0 }
  };

  const results = [];

  for (let i = 0; i < AUDIT_20_SAMPLES.length; i++) {
    const s = AUDIT_20_SAMPLES[i];
    const cat = s.category === 'health' ? 'health' : 'general';
    console.log(`[${i + 1}/20] (${s.category.toUpperCase()}) "${s.title}"...`);

    const extracted = await extractAndVerifyClaims(s.content, s.facts, {
      parentKey: s.category === 'health' ? 'health' : 'general'
    });

    const humanList = s.humanGroundTruth;
    const humanCount = humanList.length;
    const extractorList = extracted.type1UnbackedClaims || [];
    const extractorCount = extracted.type1UnbackedCount !== undefined ? extracted.type1UnbackedCount : extractorList.length;

    // So khớp semantic giữa human và extractor
    let tp = 0;
    humanList.forEach((h) => {
      const hNorm = h.toLowerCase().replace(/\(.*?\)/g, '').trim();
      const matched = extractorList.some((e) => {
        const eNorm = e.toLowerCase().trim();
        const words = hNorm.split(/\s+/).filter((w) => w.length >= 3);
        const matchWords = words.filter((w) => eNorm.includes(w)).length;
        return matchWords >= 2 || eNorm.includes(hNorm.slice(0, 15)) || hNorm.includes(eNorm.slice(0, 15));
      });
      if (matched) tp++;
    });

    tp = Math.min(tp, humanCount, extractorCount);
    const fn = humanCount - tp;
    const fp = extractorCount - tp;

    // Cộng dồn
    stats[cat].human += humanCount;
    stats[cat].extractor += extractorCount;
    stats[cat].tp += tp;
    stats[cat].fp += fp;
    stats[cat].fn += fn;

    stats.total.human += humanCount;
    stats.total.extractor += extractorCount;
    stats.total.tp += tp;
    stats.total.fp += fp;
    stats.total.fn += fn;

    results.push({
      id: s.id,
      category: s.category,
      title: s.title,
      humanCount,
      extractorCount,
      tp,
      fp,
      fn,
      humanClaims: humanList,
      extractorClaims: extractorList
    });

    console.log(`   -> Human: ${humanCount} | Extractor: ${extractorCount} | TP: ${tp}, FP: ${fp}, FN: ${fn}`);
    await new Promise((r) => setTimeout(r, 400));
  }

  function calcMetrics(st) {
    const precision = st.tp + st.fp > 0 ? (st.tp / (st.tp + st.fp)) : 1;
    const recall = st.tp + st.fn > 0 ? (st.tp / (st.tp + st.fn)) : 1;
    const f1 = precision + recall > 0 ? ((2 * precision * recall) / (precision + recall)) : 1;
    return {
      precision: Number((precision * 100).toFixed(1)),
      recall: Number((recall * 100).toFixed(1)),
      f1: Number((f1 * 100).toFixed(1))
    };
  }

  const mHealth = calcMetrics(stats.health);
  const mGeneral = calcMetrics(stats.general);
  const mTotal = calcMetrics(stats.total);

  console.log('\n========================================================================');
  console.log('📊 KẾT QUẢ KIỂM ĐỊNH EXTRACTOR TRÊN 20 BÀI (SỐ HỌC CHUẨN XÁC 100%)');
  console.log('========================================================================');
  console.log(`NHÓM SỨC KHỎE / Y TẾ (10 BÀI):`);
  console.log(`  - Human Ground Truth : ${stats.health.human} claims`);
  console.log(`  - Extractor bắt được : ${stats.health.extractor} claims`);
  console.log(`  - Đúng (TP): ${stats.health.tp} | Báo nhầm (FP): ${stats.health.fp} | Bỏ sót (FN): ${stats.health.fn}`);
  console.log(`  - Độ chính xác (Precision) : ${mHealth.precision}%`);
  console.log(`  - Độ nhạy / Độ phủ (Recall) : ${mHealth.recall}%`);
  console.log(`  - F1-Score                  : ${mHealth.f1}%`);
  console.log(`------------------------------------------------------------------------`);
  console.log(`NHÓM BÁN HÀNG FACTS & ĐỜI THƯỜNG (10 BÀI):`);
  console.log(`  - Human Ground Truth : ${stats.general.human} claims`);
  console.log(`  - Extractor bắt được : ${stats.general.extractor} claims`);
  console.log(`  - Đúng (TP): ${stats.general.tp} | Báo nhầm (FP): ${stats.general.fp} | Bỏ sót (FN): ${stats.general.fn}`);
  console.log(`  - Độ chính xác (Precision) : ${mGeneral.precision}%`);
  console.log(`  - Độ nhạy / Độ phủ (Recall) : ${mGeneral.recall}%`);
  console.log(`  - F1-Score                  : ${mGeneral.f1}%`);
  console.log(`------------------------------------------------------------------------`);
  console.log(`TỔNG THỂ 20 BÀI:`);
  console.log(`  - Human Ground Truth : ${stats.total.human} claims`);
  console.log(`  - Extractor bắt được : ${stats.total.extractor} claims`);
  console.log(`  - Đúng (TP): ${stats.total.tp} | Báo nhầm (FP): ${stats.total.fp} | Bỏ sót (FN): ${stats.total.fn}`);
  console.log(`  - Độ chính xác (Precision) : ${mTotal.precision}%`);
  console.log(`  - Độ nhạy / Độ phủ (Recall) : ${mTotal.recall}%`);
  console.log(`  - F1-Score                  : ${mTotal.f1}%`);
  console.log('========================================================================\n');

  const outReport = {
    evaluatedAt: new Date().toISOString(),
    totalSamples: AUDIT_20_SAMPLES.length,
    healthGroup: { stats: stats.health, metrics: mHealth },
    generalGroup: { stats: stats.general, metrics: mGeneral },
    overall: { stats: stats.total, metrics: mTotal },
    details: results
  };

  const outPath = path.resolve(__dirname, '../eval/extractor-human-audit-20.json');
  fs.writeFileSync(outPath, JSON.stringify(outReport, null, 2), 'utf8');
  console.log(`Đã lưu kết quả kiểm định 20 bài tại: ${outPath}`);
}

runAudit20().catch((err) => console.error('Lỗi kiểm định 20 bài:', err));
