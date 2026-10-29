/**
 * run-blind-review-10.js
 * Kịch bản Đánh giá Mù (Double-Blind Review) 10 bài viết qua Giám khảo AI độc lập (LLM Judge).
 * So sánh bài viết Tiêu chuẩn (Hệ thống tối ưu) vs Bài viết Văn mẫu Robot/Sơ khai.
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { callAiChat } = require('../src/utils/AiClientService');

const BENCHMARK_PAIRS = [
  {
    id: 1,
    topic: 'Bí quyết pha cà phê phin đậm đà không bị chua tại nhà',
    industry: 'Ẩm thực & F&B',
    baselineText: `**Bí Quyết Pha Cà Phê Phin Ngon Tuyệt Vời**

Bạn là một người yêu thích cà phê? Bạn có biết làm thế nào để có một ly cà phê đậm đà?
Trong cuộc sống hiện đại ngày nay, việc thưởng thức một ly cà phê mỗi sáng mang lại hạt hạnh phúc cho mọi người. 
Để pha cà phê phin ngon, bạn chỉ cần chọn mua cà phê chất lượng, đun nước sôi 100 độ và đổ vào phin. Hãy kiên nhẫn đợi từng giọt cà phê rơi xuống nhé.
Bạn nghĩ sao về cách pha này? Hãy cùng khám phá và thử ngay hôm nay nhé! #caphe #ngon`,
    optimizedText: `6 giờ sáng, tiếng nước sôi lách tách trong căn bếp nhỏ. 
Bí quyết để ly cà phê phin không bao giờ bị chua hay chát gắt nằm ở đúng 30 giây đầu tiên: dùng nước 92 độ tưới đều một lớp mỏng dưới đáy phin để bột cà phê nở phồng lên như một chiếc bánh xốp.
Đừng vội chế đầy nước ngay. Chờ bột cà phê ngấm đủ, tỏa mùi thơm hạt rang mộc rồi mới châm nước lần hai. Từng giọt chảy chậm rãi, sánh đặc và hậu vị ngọt êm nơi cuống họng.
Sáng nay bạn đã thưởng thức ly cà phê của mình chưa? Comment bên dưới gu cà phê sáng nay của bạn nhé!`
  },
  {
    id: 2,
    topic: 'Kinh nghiệm chống thấm dột góc tường ban công mùa mưa',
    industry: 'Đời sống & Nhà cửa',
    baselineText: `**Mẹo Chống Thấm Ban Công Cực Kỳ Hiệu Quả**

Mùa mưa đã đến rồi, bạn có lo lắng ngôi nhà của mình bị thấm dột không?
Góc ban công thường xuyên bị ẩm mốc là nỗi ám ảnh của nhiều gia đình trong thời đại 4.0. Đừng lo lắng, chúng tôi sẽ giúp bạn giải quyết triệt để.
Chỉ cần mua sơn chống thấm ngoài trời quét lên tường là xong ngay. Đảm bảo bảo vệ ngôi nhà bạn suốt mùa mưa bão.
Bạn đã sẵn sàng bảo vệ ngôi nhà mình chưa? Hãy like và share bài viết này nhé!`,
    optimizedText: `Cứ sau mỗi cơn mưa rào tháng 7, mảng tường sát góc ban công lại loang lổ vết ố vàng và mùi ẩm mốc bốc lên khó chịu.
Lỗi phổ biến nhất là nhiều người vội quét sơn chống thấm đè lên lớp sơn cũ mà quên cạo sạch phần vôi vữa đã mục. Nước mưa từ sàn thấm ngược chân tường lên, sơn đắt tiền mấy cũng phồng rộp sau vài tuần.
Cách xử lý triệt để: đục vát góc chân tường hình chữ V, quét một lớp hồ dầu xi măng dẻo trước, rồi mới dán lưới thủy tinh chống nứt và phủ lớp chống thấm chuyên dụng.
Góc ban công nhà bạn có đang bị thấm không? Chụp ảnh gửi dưới comment, mình chỉ cách xử lý vừa rẻ vừa bền nhé.`
  },
  {
    id: 3,
    topic: 'Mẹo tập cho bé ăn dặm hào hứng không nước mắt',
    industry: 'Mẹ & Bé',
    baselineText: `**Tuyệt Chiêu Giúp Bé Ăn Dặm Hạnh Phúc**

Bé nhà bạn có lười ăn không? Bạn có cảm thấy stress mỗi giờ ăn của con?
Trong hành trình nuôi con thời hiện đại, dinh dưỡng cho bé là điều vô cùng quan trọng. Hãy thử cho bé ăn dặm theo phương pháp tự chỉ huy để bé tự do khám phá thế giới ẩm thực. 
Bé sẽ tự bốc thức ăn và ăn rất ngoan. Hãy kiên trì và bé sẽ không còn khóc lóc nữa.
Các mẹ thấy phương pháp này thế nào? Cùng chia sẻ cảm nhận bên dưới nhé!`,
    optimizedText: `Chiếc ghế ăn dặm không nên là nơi diễn ra cuộc chiến giữa mẹ cầm bát cháo và con lắc đầu khóc thét.
Sai lầm lớn nhất ngày đầu là mẹ quá sốt ruột về lượng thức ăn con nuốt được, trong khi ở tuổi này, ăn dặm là một trò chơi giác quan: con muốn chạm tay vào miếng cà rốt mềm, ngửi mùi bông cải xanh và nếm vị ngòn ngọt tự nhiên.
Chỉ cần mẹ thả lỏng: để con tự bốc vài miếng mềm, bày lượng nhỏ xíu trên khay, và dứt khoát kết thúc bữa ăn sau 20 phút dù con chỉ mới nhấm nháp một mẩu nhỏ.
Bữa ăn dặm đầu đời của bé nhà bạn thế nào? Để lại bình luận cùng chia sẻ kinh nghiệm nuôi con nhàn tênh nhé.`
  },
  {
    id: 4,
    topic: 'Cách quản lý chi tiêu gia đình trẻ không áp lực cuối tháng',
    industry: 'Tài chính cá nhân',
    baselineText: `**Quản Lý Tài Chính Gia Đình Cực Kỳ Thông Minh**

Làm sao để không hết tiền vào cuối tháng? Đây là câu hỏi của rất nhiều gia đình trẻ hiện nay.
Trong thời đại số hóa, việc tiết kiệm tiền là chìa khóa mở ra cánh cửa tương lai. Hãy áp dụng quy tắc 6 chiếc lọ để quản lý tài chính hiệu quả.
Chia thu nhập thành các phần: chi tiêu thiết yếu, tiết kiệm, giáo dục... Chắc chắn bạn sẽ giàu có sau vài năm.
Bạn đã áp dụng quy tắc này chưa? Hãy thử ngay hôm nay nhé! #tietkiem #taichinh`,
    optimizedText: `Cứ đến ngày 25 hàng tháng, hai vợ chồng lại nhìn nhau thắc mắc: Rõ ràng cả tháng không mua món đồ hiệu nào, sao tài khoản ngân hàng vẫn về gần số 0?
Thủ phạm thực sự thường là những khoản chi không tên: ly trà sữa 55k đặt vội giờ trưa, phí ship đồ ăn lặt vặt, hay gói xem phim tự động gia hạn 180k mà cả tháng không bật một lần.
Thử đổi chiến thuật: ngay khi lương về ting ting, tự động chuyển thẳng 15% vào một tài khoản tiết kiệm không cài app trên điện thoại. Phần còn lại chia đều cho 4 tuần bằng tiền mặt hoặc ví chi tiêu riêng.
Tháng này gia đình bạn đã có mẹo giữ tiền nào ưng ý chưa? Nhắn tin trao đổi thêm cùng mình nhé.`
  },
  {
    id: 5,
    topic: 'Cách bảo dưỡng xe máy sau khi lội nước mưa ngập đường',
    industry: 'Kỹ thuật & Đời sống',
    baselineText: `**Những Điều Cần Làm Khi Xe Máy Bị Ngập Nước**

Mùa mưa ngập lụt khiến bạn lo lắng cho chiếc xe máy của mình?
Đừng hoảng sợ, việc xe chết máy trong nước là điều hoàn toàn bình thường trong cuộc sống đô thị hiện nay.
Bạn hãy mang xe ra tiệm sửa xe gần nhất để thợ kiểm tra và thay nhớt mới. Hãy chú ý vệ sinh xe sạch sẽ để xe luôn bền đẹp như mới.
Hãy lưu lại ngay để áp dụng khi cần nhé! Bạn nghĩ sao về mẹo này?`,
    optimizedText: `Dắt được chiếc xe máy thoát khỏi đoạn đường ngập đến nửa bánh xe, phản xạ đầu tiên của 90% người là bấm nút đề liên tục để nổ máy.
Đó là cách nhanh nhất biến chiếc xe thành đống sắt vụn: nước lọt vào buồng đốt gặp áp lực nén của pít-tông sẽ làm cong tay biên và vỡ lốc máy ngay lập tức.
Việc đầu tiên phải làm: tắt chìa khóa, dắt xe lên chỗ khô ráo, dựng chân chống giữa nghiêng xe về phía ống xả để nước thoát ra ngoài. Sau đó tháo bugi lau khô và thay ngay bình nhớt mới vì nhớt ngấm nước sẽ biến thành màu cà phê sữa mất hoàn toàn độ bôi trơn.
Xe bạn đã từng bị lội nước chưa? Lưu lại bài này để phòng khi trời mưa bão bất chợt nhé!`
  },
  {
    id: 6,
    topic: 'Mẹo sắp xếp bàn làm việc tối giản tăng tập trung',
    industry: 'Góc làm việc & Năng suất',
    baselineText: `**Bí Quyết Sắp Xếp Bàn Làm Việc Phong Cách Minimalist**

Bạn có cảm thấy mệt mỏi mỗi khi ngồi vào bàn làm việc? Bàn làm việc bừa bộn làm giảm năng suất của bạn.
Trong thời đại 4.0 bận rộn, một không gian làm việc tối giản sẽ mang lại nguồn cảm hứng tuyệt vời. 
Hãy dọn dẹp sạch sẽ các giấy tờ không cần thiết, mua thêm một chậu cây xanh phong thủy để bàn và giữ cho mọi thứ thật ngăn nắp.
Bạn đã sẵn sàng thay đổi góc làm việc của mình chưa? Hãy bình luận bên dưới nhé!`,
    optimizedText: `Mỗi buổi sáng ngồi vào bàn làm việc, ánh mắt bạn bị phân tâm bởi 3 sợi dây cáp sạc rối bời, chồng tài liệu từ tuần trước và vỏ ly cà phê rỗng.
Bộ não con người tiêu tốn năng lượng cho mọi vật thể nằm trong tầm nhìn ngoại vi. Bàn làm việc càng nhiều đồ vụn, khả năng tập trung sâu càng tụt dốc sau 15 phút.
Nguyên tắc 1 mét vuông: trên mặt bàn chỉ để đúng 3 thứ: màn hình, bàn phím và một cốc nước. Toàn bộ dây cáp giấu dưới máng đi dây, sổ tay và bút cất gọn trong hộc kéo bên tay phải.
Góc làm việc của bạn hiện tại trông thế nào? Thử chụp một tấm ảnh gửi dưới bình luận cùng giao lưu nhé!`
  },
  {
    id: 7,
    topic: 'Chăm sóc da khô nứt nẻ mùa đông tại nhà',
    industry: 'Làm đẹp & Skincare',
    baselineText: `**Cách Dưỡng Da Căng Mịn Suốt Mùa Đông Lạnh**

Mùa đông hanh khô khiến làn da bạn nứt nẻ và bong tróc? Bạn có cảm thấy thiếu tự tin không?
Làn da là tài sản quý giá của người phụ nữ trong xã hội hiện đại. Hãy chăm chỉ uống đủ 2 lít nước mỗi ngày và thoa kem dưỡng ẩm đều đặn sáng tối.
Chắc chắn làn da của bạn sẽ trắng sáng mịn màng sau vài ngày áp dụng.
Bạn đã có sản phẩm dưỡng ẩm yêu thích chưa? Hãy cùng thảo luận nhé! #duongda #lamdep`,
    optimizedText: `Mùa đông vừa gõ cửa là hai bên cánh mũi bắt đầu bong tróc, bôi kem chống nắng hay đánh cushion lên là mốc meo từng mảng.
Sai lầm phổ biến nhất là rửa mặt bằng nước quá nóng vì sợ lạnh: nước nóng rửa trôi toàn bộ màng lipid bảo vệ tự nhiên, khiến hơi ẩm dưới da bốc hơi nhanh gấp đôi.
Bí quyết cứu cánh: chỉ rửa mặt bằng nước ấm vừa phải, và thoa serum cấp ẩm HA hoặc B5 ngay khi da mặt còn đang ẩm ướt trong vòng 60 giây sau khi thấm khăn. Sau đó khóa ẩm ngay bằng một lớp kem dưỡng mỏng chứa Ceramide.
Mùa này da bạn thuộc tuýp khô hay hỗn hợp thiên dầu? Để lại bình luận mình gợi ý routine phù hợp nhé.`
  },
  {
    id: 8,
    topic: 'Cách phối đồ công sở nam trẻ trung không bị già',
    industry: 'Thời trang & Phong cách',
    baselineText: `**Tips Phối Đồ Công Sở Nam Cực Trẻ Trung**

Bạn đang tìm kiếm phong cách thời trang công sở vừa lịch sự vừa phong độ?
Trang phục công sở không chỉ thể hiện sự chuyên nghiệp mà còn khẳng định vị thế của phái mạnh trong công việc thời hiện đại.
Hãy phối áo sơ mi trắng với quần âu đen và đi giày tây cổ điển. Bộ trang phục này sẽ giúp bạn ghi điểm tuyệt đối trong mắt đồng nghiệp và sếp.
Bạn thích phong cách này chứ? Hãy thả tim và lưu lại ngay nhé!`,
    optimizedText: `Chiếc áo sơ mi trắng đóng thùng với quần âu đen bóng loáng và đôi giày tây mũi nhọn thường khiến các chàng trai trông già hơn tuổi thật đến cả chục năm.
Để vẫn giữ nét lịch lãm mà trông hiện đại, năng động: thử thay chiếc quần âu ly đứng bằng quần chinos màu be hoặc xám ghi, phối cùng áo polo dệt kim cộc tay có cổ đứng vừa vặn.
Phía dưới, thay giày tây cứng nhắc bằng một đôi sneaker da trắng tối giản phom gọn. Đơn giản, thoáng mát cả ngày ngồi máy lạnh mà vẫn chuẩn chỉnh khi gặp khách hàng.
Bạn thích gu công sở smart-casual thoải mái hay trang trọng cổ điển? Thả bình luận giao lưu phong cách nhé!`
  },
  {
    id: 9,
    topic: 'Cách làm bánh mì bơ tỏi giòn tan bằng nồi chiên không dầu',
    industry: 'Ẩm thực & Nấu nướng',
    baselineText: `**Bánh Mì Bơ Tỏi Nồi Chiên Không Dầu Siêu Ngon**

Bạn có thích ăn bánh mì bơ tỏi Hàn Quốc không? Món bánh thơm lừng này ai cũng mê.
Trong cuộc sống bận rộn, nồi chiên không dầu là trợ thủ đắc lực giúp bạn nấu những món ăn ngon lành cho cả gia đình.
Chỉ cần cắt bánh mì, phết bơ trộn tỏi và cho vào nồi chiên nướng ở nhiệt độ 180 độ trong 10 phút là xong. Món ăn này chắc chắn sẽ làm hài lòng mọi thành viên.
Bạn đã làm thử món này chưa? Hãy chia sẻ thành quả của bạn nhé!`,
    optimizedText: `Mùi bơ Pháp quyện với tỏi băm phi vàng thơm nức cả căn bếp ngay khi nồi chiên không dầu vừa đếm ngược những phút cuối.
Bí quyết để vỏ bánh giòn rụm mà ruột bên trong vẫn giữ độ mềm béo ngậy: dùng bơ lạt đun chảy trộn cùng tỏi băm nhuyễn, chút rau mùi tây xắt nhỏ và một thìa sữa đặc có đường để tạo vị ngọt dịu cân bằng.
Nướng ở 160 độ trong 6 phút đầu cho bơ thấm sâu vào ruột bánh, sau đó tăng lên 180 độ trong đúng 2 phút cuối để tạo lớp vỏ vàng giòn rụm không bị cháy xém.
Chiều nay làm thử một mẻ cho cả nhà ăn xế nhé, đảm bảo ra lò là hết veo trong nốt nhạc!`
  },
  {
    id: 10,
    topic: 'Phương pháp rèn luyện thói quen đọc sách 15 phút mỗi ngày',
    industry: 'Phát triển bản thân',
    baselineText: `**Cách Xây Dựng Thói Quen Đọc Sách Mỗi Ngày**

Đọc sách là một thói quen vô cùng tuyệt vời của những người thành công trên thế giới. Bạn có muốn rèn luyện thói quen này không?
Trong thời đại công nghệ số 4.0 phát triển vượt bậc, sách vẫn là kho tàng tri thức quý báu mang lại sự tiến bộ cho nhân loại.
Hãy đặt mục tiêu đọc sách 15 phút mỗi ngày trước khi đi ngủ. Kiên trì 21 ngày liên tục bạn sẽ thấy cuộc sống mình thay đổi hoàn toàn.
Bạn đang đọc cuốn sách nào? Cùng chia sẻ cảm nghĩ nhé! #docsach #tri_thuc`,
    optimizedText: `Cuốn sách bìa đẹp nằm trên đầu giường đã phủ một lớp bụi mỏng suốt hai tháng qua vì tối nào cầm lên đọc được 3 trang là bạn lại với tay lấy điện thoại lướt mạng xã hội.
Vấn đề không phải là bạn lười biếng, mà là bạn đặt mục tiêu quá lớn khiến não bộ sinh ra phản xạ trì hoãn.
Thử hạ tiêu chuẩn xuống mức không thể thất bại: cam kết đọc đúng 2 trang mỗi sáng ngay sau khi pha xong ly nước ấm. Chỉ 2 trang, tương đương 3 phút. Khi ngưỡng rào cản thấp như bước qua một viên gạch, bạn sẽ dễ dàng bắt đầu mà không có bất kỳ sự kháng cự tâm lý nào.
Cuốn sách bạn muốn hoàn thành nhất trong tháng này tên là gì? Comment tên sách bên dưới để cùng tạo động lực nhé!`
  }
];

async function runBlindReview() {
  console.log('═══════════════════════════════════════════════════════════════════════════════════');
  console.log('⚖️ KHỞI ĐỘNG ĐÁNH GIÁ MÙ 10 BÀI VIẾT (DOUBLE-BLIND REVIEW VS LLM JUDGE)');
  console.log('═══════════════════════════════════════════════════════════════════════════════════\n');

  const results = [];
  let optimizedWins = 0;
  let baselineWins = 0;
  let ties = 0;

  for (let i = 0; i < BENCHMARK_PAIRS.length; i++) {
    const pair = BENCHMARK_PAIRS[i];
    // Hoán đổi ngẫu nhiên vị trí giữa Sample 1 và Sample 2 để đảm bảo Blind
    const isSample1Optimized = Math.random() >= 0.5;
    const sample1 = isSample1Optimized ? pair.optimizedText : pair.baselineText;
    const sample2 = isSample1Optimized ? pair.baselineText : pair.optimizedText;

    console.log(`[${i + 1}/10] Đang chấm mù chủ đề: "${pair.topic.slice(0, 45)}..."`);

    const judgePrompt = `Bạn là Trưởng ban Biên tập Nội dung mạng xã hội kỳ cựu với 10 năm kinh nghiệm thẩm định nội dung Facebook/TikTok tại Việt Nam.
Nhiệm vụ của bạn là đánh giá MÙ (không biết danh tính tác giả) giữa 2 bài viết sau đây cho cùng một chủ đề: "${pair.topic}" (Ngành: ${pair.industry}).

=== BÀI VIẾT [SAMPLE 1] ===
${sample1}

=== BÀI VIẾT [SAMPLE 2] ===
${sample2}

Hãy chấm điểm theo thang điểm 1-10 cho từng tiêu chí sau:
1. The Hook (3 dòng đầu dừng ngón tay người lướt feed điện thoại, hình ảnh cụ thể đời thực, không dùng câu hỏi tu từ sáo rỗng nhạt nhẽo).
2. Tránh sáo rỗng / văn mẫu robot (Trừ điểm nặng nếu dùng: "trong thời đại 4.0", "hạt hạnh phúc", "hãy cùng khám phá", "bạn có biết...", văn phong như máy móc).
3. Độ chân thực & Tone giọng đời sống (Tự nhiên như chuyên gia hoặc người từng trải chia sẻ).
4. Lời kêu gọi hành động (CTA) cụ thể, văn minh, kích thích người đọc thảo luận thật.
5. Định dạng mạng xã hội sạch sẽ (Không dùng markdown * hoặc ** vì Facebook hiển thị thô xấu).

Trả về kết quả DUY NHẤT một chuỗi JSON hợp lệ theo format:
{
  "sample1Scores": { "hook": 8, "authenticity": 7, "tone": 8, "cta": 7, "cleanFormat": 9, "total": 39 },
  "sample2Scores": { "hook": 5, "authenticity": 4, "tone": 5, "cta": 5, "cleanFormat": 4, "total": 23 },
  "winner": "SAMPLE 1" hoặc "SAMPLE 2" hoặc "TIE",
  "reason": "Giải thích ngắn gọn 2-3 câu vì sao bài thắng vượt trội hơn bài thua."
}`;

    try {
      const t0 = Date.now();
      const response = await callAiChat({
        messages: [
          { role: 'system', content: 'Bạn là Giám khảo chấm thi nội dung công tâm, khắt khe và chuẩn xác.' },
          { role: 'user', content: judgePrompt }
        ],
        temperature: 0.2, // Nhiệt độ thấp để đánh giá khách quan
        jsonMode: true
      });
      const duration = Date.now() - t0;

      const raw = (response.content || '').trim();
      const match = raw.match(/\{[\s\S]*\}/);
      const verdict = JSON.parse(match ? match[0] : raw);

      const winningSample = verdict.winner?.toUpperCase();
      let winnerLabel = 'TIE';
      if (winningSample.includes('SAMPLE 1')) {
        winnerLabel = isSample1Optimized ? 'OPTIMIZED_SYSTEM' : 'BASELINE_ROBOT';
      } else if (winningSample.includes('SAMPLE 2')) {
        winnerLabel = isSample1Optimized ? 'BASELINE_ROBOT' : 'OPTIMIZED_SYSTEM';
      }

      if (winnerLabel === 'OPTIMIZED_SYSTEM') optimizedWins++;
      else if (winnerLabel === 'BASELINE_ROBOT') baselineWins++;
      else ties++;

      console.log(`   ➔ Kết quả: ${winnerLabel} CHIẾN THẮNG (${duration}ms)`);
      console.log(`   ➔ Lý do: ${verdict.reason}\n`);

      results.push({
        pairId: pair.id,
        topic: pair.topic,
        industry: pair.industry,
        blindAssignment: {
          sample1: isSample1Optimized ? 'OPTIMIZED' : 'BASELINE',
          sample2: isSample1Optimized ? 'BASELINE' : 'OPTIMIZED'
        },
        judgeScores: {
          sample1: verdict.sample1Scores,
          sample2: verdict.sample2Scores
        },
        judgeWinner: verdict.winner,
        actualWinner: winnerLabel,
        judgeReason: verdict.reason,
        durationMs: duration
      });

    } catch (err) {
      console.error(`   ❌ Lỗi khi chấm chủ đề ${pair.id}:`, err.message);
    }
  }

  const summary = {
    executedAt: new Date().toISOString(),
    totalPairs: BENCHMARK_PAIRS.length,
    optimizedWins,
    baselineWins,
    ties,
    winRate: `${((optimizedWins / BENCHMARK_PAIRS.length) * 100).toFixed(1)}%`,
    results
  };

  const outputPath = path.resolve(__dirname, '../../eval/blind-review-10.json');
  fs.writeFileSync(outputPath, JSON.stringify(summary, null, 2), 'utf8');

  console.log('═══════════════════════════════════════════════════════════════════════════════════');
  console.log('📊 TỔNG KẾT ĐÁNH GIÁ MÙ 10 BÀI VIẾT (BLIND REVIEW SUMMARY)');
  console.log('═══════════════════════════════════════════════════════════════════════════════════');
  console.log(`- Hệ thống tối ưu (Optimized System) thắng: ${optimizedWins}/${BENCHMARK_PAIRS.length} bài (${summary.winRate})`);
  console.log(`- Bài văn mẫu sơ khai (Baseline Robot) thắng: ${baselineWins}/${BENCHMARK_PAIRS.length} bài`);
  console.log(`- Hòa: ${ties}`);
  console.log(`- Báo cáo chi tiết đã lưu tại: ${outputPath}`);
  console.log('═══════════════════════════════════════════════════════════════════════════════════\n');
}

runBlindReview().catch(err => {
  console.error('Fatal Blind Review Error:', err);
  process.exit(1);
});
