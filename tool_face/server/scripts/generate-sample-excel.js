const XLSX = require('xlsx');
const path = require('path');

const headers = [
  'STT',
  'Nền tảng (FB/TikTok)',
  'Fanpage / TikTok Channel (Tên | Page ID)',
  'Content',
  'Schedule',
  'Loại Media',
  'Media Link',
  'Media Thumb',
  'Seeding Comment 1',
  'Schedule Comment 1',
  'Media Comment 1',
  'Seeding Comment 2',
  'Schedule Comment 2',
  'Media Comment 2',
  'Seeding Comment 3',
  'Schedule Comment 3',
  'Media Comment 3',
  'Seeding Comment 4',
  'Schedule Comment 4',
  'Media Comment 4',
  'Seeding Comment 5',
  'Schedule Comment 5',
  'Media Comment 5'
];

const samplePosts = [
  {
    stt: 1,
    platform: 'Facebook',
    channel: 'Đài truyền hình ABC | 1383891371465269',
    content: 'Chào ngày mới tràn đầy năng lượng và nhiệt huyết! Chúc mọi người một ngày làm việc hiệu quả và gặt hái nhiều thành công 🌟 #morning #goodvibes #thanhcong',
    schedule: 'Đăng ngay',
    mediaType: 'text',
    mediaLink: '',
    mediaThumb: '',
    c1: 'Cảm ơn mọi người đã luôn đồng hành cùng kênh! Hãy để lại bình luận chào nhau nhé 👇',
    s1: 'now',
    c2: '', s2: ''
  },
  {
    stt: 2,
    platform: 'TikTok',
    channel: 'Kênh TikTok Triệu View | @kenhtiktok_official',
    content: '5 thói quen buổi sáng của những người thành công giúp bạn thay đổi tư duy và bứt phá sự nghiệp! 🚀🔥 #xuhuong #tiktok #thanhcong #kinhdoanh',
    schedule: '02/10/2026_09:00',
    mediaType: 'video',
    mediaLink: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    mediaThumb: '',
    c1: '', s1: '', c2: '', s2: ''
  },
  {
    stt: 3,
    platform: 'Cả hai',
    channel: 'Kênh Truyền Thông | 1383891371465269',
    content: 'Bản tin công nghệ 24h: Các xu hướng AI đang thay đổi hoàn toàn cách doanh nghiệp vận hành. Đăng đồng thời Reels Facebook & TikTok! ⚡ #technology #ai',
    schedule: '02/10/2026_11:30',
    mediaType: 'video',
    mediaLink: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
    mediaThumb: '',
    c1: 'Đón xem phóng sự chuyên sâu lúc 19h00 tối nay trên sóng truyền hình.',
    s1: '5',
    c2: '', s2: ''
  },
  {
    stt: 4,
    platform: 'Facebook',
    channel: 'Một Câu Chuyện | 1406154479236872',
    content: 'Đôi khi trong cuộc sống, chậm lại một nhịp không phải là tụt hậu, mà là để chuẩn bị cho một bước nhảy xa hơn. Hãy kiên trì với mục tiêu của chính mình 🌿 #quote #tamsu #cuocsong',
    schedule: '02/10/2026_14:15',
    mediaType: 'text',
    mediaLink: '',
    mediaThumb: '',
    c1: 'Một câu nói truyền cảm hứng cho buổi chiều làm việc mệt mỏi ❤️',
    s1: 'now',
    c2: '', s2: ''
  },
  {
    stt: 5,
    channel: 'Đài truyền hình ABC | 1383891371465269',
    content: 'Dự báo thời tiết cuối tuần: Không khí lạnh đầu mùa bắt đầu ảnh hưởng đến các tỉnh miền Bắc, trời se lạnh về đêm và sáng sớm. Mọi người chú ý giữ ấm khi ra đường nhé!',
    schedule: '02/10/2026_17:45',
    mediaType: 'image',
    mediaLink: 'https://images.unsplash.com/photo-1534274988757-a28bf1a57c17',
    mediaThumb: '',
    c1: 'Nhiệt độ thấp nhất dự kiến khoảng 19-21 độ C.',
    s1: '2',
    c2: 'Cập nhật tình hình thời tiết chi tiết tại website của Đài.',
    s2: '8'
  },
  {
    stt: 6,
    channel: 'Một Câu Chuyện | 1406154479236872',
    content: 'Câu chuyện về tách cà phê nguội và bài học về sự trân trọng những điều bình dị quanh ta. Đừng để khi mất đi rồi mới nhận ra giá trị thật sự.',
    schedule: '02/10/2026_20:30',
    mediaType: 'image',
    mediaLink: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93',
    mediaThumb: '',
    c1: 'Đọc câu chuyện này làm mình nhớ về những ngày tháng sinh viên nghèo mà vui...',
    s1: 'now',
    c2: 'Đồng quan điểm, cuộc sống hiện đại cuốn ta đi quá nhanh!',
    s2: '7'
  },
  {
    stt: 7,
    channel: 'Đài truyền hình ABC | 1383891371465269',
    content: 'Phỏng vấn chuyên gia kinh tế: Lựa chọn kênh đầu tư tài chính an toàn và sinh lời ổn định giai đoạn cuối năm dành cho người có vốn nhàn rỗi.',
    schedule: '03/10/2026_08:15',
    mediaType: 'text',
    mediaLink: '',
    mediaThumb: '',
    c1: 'Mọi thắc mắc của khán giả xin gửi về hộp thư toasoan@truyenhinh.vn để được giải đáp.',
    s1: '5',
    c2: '', s2: ''
  },
  {
    stt: 8,
    channel: 'Một Câu Chuyện | 1406154479236872',
    content: 'Bài học đắt giá: "Kỷ luật là cầu nối giữa mục tiêu và thành tựu". Khi bạn không có động lực, kỷ luật chính là thứ duy nhất giữ bạn ở lại đường đua.',
    schedule: '03/10/2026_10:00',
    mediaType: 'image',
    mediaLink: 'https://images.unsplash.com/photo-1517842645767-c639042777db',
    mediaThumb: '',
    c1: 'Rất đúng! Động lực chỉ giúp ta bắt đầu, kỷ luật mới đưa ta về đích.',
    s1: '4',
    c2: '', s2: ''
  },
  {
    stt: 9,
    channel: 'Đài truyền hình ABC | 1383891371465269',
    content: 'Góc tiêu dùng thông minh: Cảnh báo các chiêu trò lừa đảo mạo danh ngân hàng và sàn thương mại điện tử qua tin nhắn rác. Người dân cần hết sức cảnh giác!',
    schedule: '03/10/2026_11:45',
    mediaType: 'image',
    mediaLink: 'https://images.unsplash.com/photo-1563986768609-322da13575f3',
    mediaThumb: '',
    c1: 'Tuyệt đối không click vào các đường link lạ và không cung cấp mã OTP cho bất kỳ ai!',
    s1: 'now',
    c2: 'Chia sẻ bài viết này cho người thân và bạn bè cùng biết nhé!',
    s2: '15'
  },
  {
    stt: 10,
    channel: 'Một Câu Chuyện | 1406154479236872',
    content: 'Người thông minh không tranh cãi với người không cùng quan điểm. Tiết kiệm năng lượng cho bản thân mới là đỉnh cao của sự trưởng thành.',
    schedule: '03/10/2026_15:00',
    mediaType: 'text',
    mediaLink: '',
    mediaThumb: '',
    c1: 'Học cách im lặng và mỉm cười là bài học lớn nhất của người lớn.',
    s1: '3',
    c2: '', s2: ''
  },
  {
    stt: 11,
    channel: 'Đài truyền hình ABC | 1383891371465269',
    content: 'Nhịp sống đô thị: Những góc check-in mùa thu Hà Nội tuyệt đẹp đang thu hút đông đảo bạn trẻ và du khách quốc tế ghé thăm trong tuần qua.',
    schedule: '03/10/2026_17:30',
    mediaType: 'image',
    mediaLink: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5',
    mediaThumb: '',
    c1: 'Mùa thu luôn là mùa đẹp và lãng mạn nhất trong năm!',
    s1: '2',
    c2: 'Địa điểm trong ảnh là Phan Đình Phùng nhé cả nhà ơi.',
    s2: '6'
  },
  {
    stt: 12,
    channel: 'Một Câu Chuyện | 1406154479236872',
    content: 'Bạn của hiện tại là kết quả của những gì bạn làm trong 3 năm trước. Và tương lai của bạn sau 3 năm nữa phụ thuộc hoàn toàn vào những gì bạn bắt đầu từ ngày hôm nay.',
    schedule: '03/10/2026_21:00',
    mediaType: 'image',
    mediaLink: 'https://images.unsplash.com/photo-1455849318743-b2233052fcff',
    mediaThumb: '',
    c1: 'Bắt đầu ngay hôm nay, đừng đợi đến ngày mai nữa!',
    s1: 'now',
    c2: '', s2: ''
  },
  {
    stt: 13,
    channel: 'Đài truyền hình ABC | 1383891371465269',
    content: 'Bản tin sáng Chủ Nhật: Những tấm gương khởi nghiệp xanh tiêu biểu của thế hệ trẻ mang lại giá trị bền vững cho cộng đồng và môi trường.',
    schedule: '04/10/2026_08:30',
    mediaType: 'text',
    mediaLink: '',
    mediaThumb: '',
    c1: 'Chương trình được phát lại trên kênh YouTube chính thức của Đài.',
    s1: '5',
    c2: '', s2: ''
  },
  {
    stt: 14,
    channel: 'Một Câu Chuyện | 1406154479236872',
    content: 'Chủ nhật an yên: Dành thời gian nghỉ ngơi, nạp lại năng lượng bên những người thân yêu sau một tuần làm việc đầy căng thẳng và bận rộn ☕',
    schedule: '04/10/2026_10:15',
    mediaType: 'image',
    mediaLink: 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb',
    mediaThumb: '',
    c1: 'Chúc cả nhà một ngày Chủ Nhật thật nhiều niềm vui và ấm áp!',
    s1: 'now',
    c2: '', s2: ''
  },
  {
    stt: 15,
    channel: 'Đài truyền hình ABC | 1383891371465269',
    content: 'Cẩm nang sức khỏe gia đình: 4 nguyên tắc vàng giúp duy trì hệ tiêu hóa khỏe mạnh và tăng cường sức đề kháng mùa giao mùa từ các bác sĩ chuyên khoa.',
    schedule: '04/10/2026_14:00',
    mediaType: 'image',
    mediaLink: 'https://images.unsplash.com/photo-1498837167922-ddd27525d352',
    mediaThumb: '',
    c1: 'Lưu lại bài viết để áp dụng ngay cho thực đơn gia đình nhé!',
    s1: '3',
    c2: 'Khám phá thêm các video tư vấn sức khỏe dinh dưỡng tại link bio.',
    s2: '12'
  },
  {
    stt: 16,
    channel: 'Một Câu Chuyện | 1406154479236872',
    content: 'Sách là người thầy vĩ đại nhất: 3 cuốn sách thay đổi tư duy tài chính mà bất kỳ bạn trẻ nào cũng nên đọc ít nhất một lần trong đời.',
    schedule: '04/10/2026_16:45',
    mediaType: 'text',
    mediaLink: '',
    mediaThumb: '',
    c1: 'Top 3: Cha giàu cha nghèo, Tâm lý học về tiền, Người giàu có nhất thành Babylon.',
    s1: '2',
    c2: 'Bạn đã đọc cuốn nào trong 3 cuốn này chưa?',
    s2: '8'
  },
  {
    stt: 17,
    channel: 'Đài truyền hình ABC | 1383891371465269',
    content: 'Góc nhìn thể thao: Đội tuyển quốc gia bước vào giai đoạn tập huấn quan trọng chuẩn bị cho giải đấu lớn khu vực cuối năm nay.',
    schedule: '04/10/2026_19:30',
    mediaType: 'image',
    mediaLink: 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211',
    mediaThumb: '',
    c1: 'Cùng gửi lời chúc may mắn và thi đấu hết mình tới các chàng trai!',
    s1: 'now',
    c2: 'Dự đoán tỉ số trận giao hữu sắp tới nhận ngay phần quà hấp dẫn từ nhà đài.',
    s2: '10'
  },
  {
    stt: 18,
    channel: 'Một Câu Chuyện | 1406154479236872',
    content: 'Một nụ cười có thể sưởi ấm một ngày u tối, một lời động viên có thể cứu vãn một tâm hồn đang tuyệt vọng. Hãy tử tế với nhau khi còn có thể.',
    schedule: '04/10/2026_21:30',
    mediaType: 'image',
    mediaLink: 'https://images.unsplash.com/photo-1518495973542-4542c06a5843',
    mediaThumb: '',
    c1: 'Chúc mọi người ngủ ngon và có những giấc mơ thật đẹp 🌙',
    s1: '5',
    c2: '', s2: ''
  },
  {
    stt: 19,
    channel: 'Đài truyền hình ABC | 1383891371465269',
    content: 'Khởi đầu tuần mới: Tổng hợp các chính sách kinh tế mới có hiệu lực từ tháng này tác động trực tiếp tới người dân và doanh nghiệp.',
    schedule: '05/10/2026_07:30',
    mediaType: 'text',
    mediaLink: '',
    mediaThumb: '',
    c1: 'Chi tiết từng thông tư nghị định được cập nhật đầy đủ tại cổng thông tin điện tử.',
    s1: 'now',
    c2: '', s2: ''
  },
  {
    stt: 20,
    channel: 'Một Câu Chuyện | 1406154479236872',
    content: 'Chào tuần mới! Đặt mục tiêu rõ ràng, tập trung vào giải pháp thay vì than phiền khó khăn. Bạn có đủ khả năng để hoàn thành xuất sắc tuần này! 💪🔥',
    schedule: '05/10/2026_08:45',
    mediaType: 'image',
    mediaLink: 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173',
    mediaThumb: '',
    c1: 'Mục tiêu quan trọng nhất tuần này của bạn là gì? Chia sẻ cùng nhau nhé!',
    s1: '2',
    c2: 'Cố lên mọi người ơi, tuần này nhất định sẽ bùng nổ!',
    s2: '6'
  },
  {
    // ✅ VÍ DỤ ĐĂNG NHIỀU FANPAGE: 1 dòng → đăng lên 3 fanpage cùng lúc
    stt: 21,
    platform: 'Facebook',
    channel: 'Đài ABC | 1383891371465269, Kênh Chuyện | 1406154479236872, Brand Page | 9876543210',
    content: '🎉 Thông báo quan trọng! Chương trình ưu đãi đặc biệt dành cho tất cả khán giả và độc giả thân mến. Đừng bỏ lỡ cơ hội nhận quà giá trị từ chúng tôi! #khuyenmai #ưuđãi',
    schedule: '05/10/2026_12:00',
    mediaType: 'image',
    mediaLink: 'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da',
    mediaThumb: '',
    c1: 'Bình luận SĐT để được tư vấn và nhận quà trực tiếp từ fanpage!',
    s1: 'now',
    c2: '',
    s2: ''
  }
];

const rows = samplePosts.map((p) => [
  p.stt,
  p.platform || 'Facebook',
  p.channel,
  p.content,
  p.schedule,
  p.mediaType,
  p.mediaLink,
  p.mediaThumb,
  p.c1, p.s1, '',
  p.c2, p.s2, '',
  '', '', '',
  '', '', '',
  '', '', ''
]);

const workbook = XLSX.utils.book_new();
const worksheet = XLSX.utils.aoa_to_sheet([
  ['MẪU UPLOAD BÀI ĐĂNG TỰ ĐỘNG - HỖ TRỢ CẢ FACEBOOK VÀ TIKTOK (TOOL_FACE)'],
  ['HƯỚNG DẪN: Sheet bắt buộc tên là "MAIN SHEET". Cột Schedule: "Đăng ngay" hoặc "DD/MM/YYYY_HH:mm". Cột Nền tảng: "Facebook", "TikTok" hoặc "Cả hai". Cột Kênh: Điền "Tên | ID" Fanpage hoặc ID/@username TikTok. ĐĂNG NHIỀU FANPAGE: Trong cột Kênh, liệt kê nhiều Page ID cách nhau bằng dấu phẩy. Ví dụ: "Page A | 111, Page B | 222, Page C | 333" → hệ thống sẽ tự đăng lên cả 3 fanpage cùng lúc.'],
  headers,
  ...rows
]);

worksheet['!cols'] = [
  { wch: 6 },   // STT
  { wch: 20 },  // Nền tảng
  { wch: 38 },  // Fanpage / TikTok Channel
  { wch: 65 },  // Content
  { wch: 18 },  // Schedule
  { wch: 12 },  // Loại Media
  { wch: 45 },  // Media Link
  { wch: 15 },  // Media Thumb
  { wch: 45 },  // Seeding 1
  { wch: 18 },  // Schedule 1
  { wch: 15 },  // Media Comment 1
  { wch: 45 },  // Seeding 2
  { wch: 18 },  // Schedule 2
  { wch: 15 },  // Media Comment 2
  { wch: 30 }, { wch: 18 }, { wch: 15 },
  { wch: 30 }, { wch: 18 }, { wch: 15 },
  { wch: 30 }, { wch: 18 }, { wch: 15 }
];

XLSX.utils.book_append_sheet(workbook, worksheet, 'MAIN SHEET');
const targetPath = path.resolve(__dirname, '../../Mau_Upload_Bai_Dang.xlsx');
XLSX.writeFile(workbook, targetPath);
console.log(`Đã tạo thành công file với ${samplePosts.length} bài đăng mẫu tại:`, targetPath);
