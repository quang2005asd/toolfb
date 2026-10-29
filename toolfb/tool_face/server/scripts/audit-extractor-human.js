/**
 * audit-extractor-human.js
 * Kiểm định độc lập độ chuẩn xác của ClaimExtractor đối chiếu với Người đọc (Human Ground Truth):
 * - Lấy 10 bài thuộc các nhóm: Bán hàng có facts (B & C), Sức khỏe/Nhạy cảm, Đời thường.
 * - Human Ground Truth: Người đọc tự tay gạch chính xác từng claim Loại 1 (unbacked) và Loại 2.
 * - Cho ClaimExtractor chạy trên 10 bài để tính Precision, Recall, False Positives, False Negatives.
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const { extractAndVerifyClaims } = require('../src/utils/ClaimExtractor');

const AUDIT_SAMPLES = [
  {
    id: 1,
    title: 'Quán cà phê "Test Coffee" (Bài C - Có Facts)',
    facts: 'Dữ liệu test giả định: Quán cà phê “Test Coffee” giảm 20% đến hết tuần, áp dụng chương trình mua 2 tặng 1 vào mỗi thứ Tư',
    content: `Bạn đang dạo quanh khu phố, mùi cà phê thơm lan tỏa từ một quán mới mở.
Bạn có muốn khám phá “Test Coffee” ngay hôm nay?

Quán “Test Coffee” đang giảm 20% cho tất cả đồ uống đến hết tuần này.
Mỗi thứ Tư, mua 2 ly bất kỳ sẽ được tặng 1 ly miễn phí.

Không cần chờ đợi, hãy ghé qua và tận hưởng không gian nhẹ nhàng, âm nhạc ấm áp.
Bạn có thể chia sẻ cảm nhận của mình trong phần bình luận nhé!`,
    humanGroundTruth: {
      totalClaims: 5,
      type1UnbackedCount: 2,
      type1UnbackedList: [
        'Mùi cà phê thơm lan tỏa từ một quán mới mở (tả thuộc tính quán ngoài facts)',
        'Không cần chờ đợi, tận hưởng không gian nhẹ nhàng, âm nhạc ấm áp (tả không gian/dịch vụ ngoài facts)'
      ],
      type2Count: 1,
      type2List: ['Bạn đang dạo quanh khu phố (cảnh đời thường người đọc)']
    }
  },
  {
    id: 2,
    title: 'Quán cà phê "Test Coffee" (Bài B - Có Facts)',
    facts: 'Dữ liệu test giả định: Quán cà phê “Test Coffee” giảm 20% đến hết tuần, áp dụng chương trình mua 2 tặng 1 vào mỗi thứ Tư',
    content: `Một tách espresso đen bóng, bốc khói nhẹ trên bàn gỗ, ánh sáng cửa sổ chiếu vào tạo nên khoảnh khắc yên bình.

Bạn vừa bước vào Test Coffee, không gian ấm cúng, đủ yên tĩnh để làm việc và đủ rộng để gặp gỡ bạn bè.

Đến cuối tuần, mọi đồ uống giảm 20% – cơ hội thưởng thức hương vị mới mà không lo về giá.

Mỗi thứ Tư, mua 2 ly bất kỳ, nhận ngay ly thứ ba miễn phí, phù hợp cho nhóm làm việc hoặc buổi trò chuyện.

Bạn sẽ ghé vào ngày nào? Hãy chia sẻ kế hoạch của mình trong bình luận.`,
    humanGroundTruth: {
      totalClaims: 5,
      type1UnbackedCount: 3,
      type1UnbackedList: [
        'Một tách espresso đen bóng, bốc khói nhẹ trên bàn gỗ, ánh sáng cửa sổ (cảnh mở bài tả vật thể/sản phẩm quy vào Loại 1)',
        'Không gian ấm cúng, đủ yên tĩnh để làm việc và đủ rộng để gặp bạn bè (thuộc tính không gian ngoài facts)',
        'Phù hợp cho nhóm làm việc hoặc buổi trò chuyện (khẳng định công năng/phù hợp ngoài facts)'
      ],
      type2Count: 0,
      type2List: []
    }
  },
  {
    id: 3,
    title: 'Máy lọc nước X (Bài C - Có Facts)',
    facts: 'Dữ liệu test giả định: Giá niêm yết 4.990.000đ, bảo hành 24 tháng chính hãng, miễn phí lắp đặt tại nhà',
    content: `Bạn đang chuẩn bị bữa sáng cho cả nhà và muốn chắc chắn nước uống luôn sạch sẽ.

Máy lọc nước X mang lại nguồn nước tinh khiết ngay tại gia đình.

Giá niêm yết hiện tại là 4.990.000đ, phù hợp với nhu cầu hằng ngày.

Sản phẩm được bảo hành chính hãng 24 tháng, yên tâm sử dụng lâu dài.

Miễn phí lắp đặt tại nhà, đội ngũ kỹ thuật sẽ đến kiểm tra và cài đặt nhanh chóng.

Bạn có câu hỏi gì về máy lọc nước X? Hãy comment bên dưới để trao đổi thêm.`,
    humanGroundTruth: {
      totalClaims: 5,
      type1UnbackedCount: 2,
      type1UnbackedList: [
        'Mang lại nguồn nước tinh khiết (công năng kỹ thuật không có trong facts)',
        'Đội ngũ kỹ thuật sẽ đến kiểm tra và cài đặt nhanh chóng (tự thêm dịch vụ/thuộc tính nhân viên)'
      ],
      type2Count: 1,
      type2List: ['Bạn đang chuẩn bị bữa sáng cho cả nhà (cảnh đời thường người đọc)']
    }
  },
  {
    id: 4,
    title: 'Máy lọc nước X (Bài B - Có Facts)',
    facts: 'Dữ liệu test giả định: Giá niêm yết 4.990.000đ, bảo hành 24 tháng chính hãng, miễn phí lắp đặt tại nhà',
    content: `Sáng sớm, con đang ăn cereal, mẹ rót nước từ vòi mới lắp ngay trong bếp.
Giọt nước trong cốc trong suốt, không còn mùi clo.
Một khoảnh khắc gia đình cùng nhau thưởng thức nước sạch.

Máy lọc nước X hiện có giá niêm yết 4.990.000đ.
Bảo hành chính hãng 24 tháng, lắp đặt miễn phí tại nhà.

Nước sạch không có tạp chất, hỗ trợ tiêu hoá tốt hơn.
Uống nước lọc hàng ngày giúp duy trì độ ẩm cho cơ thể.

Bạn đã từng trải nghiệm máy lọc nước tại gia? Hãy chia sẻ cảm nhận trong bình luận.`,
    humanGroundTruth: {
      totalClaims: 6,
      type1UnbackedCount: 4,
      type1UnbackedList: [
        'Rót nước từ vòi mới lắp ngay trong bếp (cảnh mở bài tả vật thể/vòi nước quy vào Loại 1)',
        'Không còn mùi clo (công năng/thuộc tính sản phẩm ngoài facts)',
        'Nước sạch không có tạp chất, hỗ trợ tiêu hoá tốt hơn (lợi ích sức khỏe ngoài facts)',
        'Uống nước lọc hàng ngày giúp duy trì độ ẩm cho cơ thể (lợi ích sức khỏe ngoài facts)'
      ],
      type2Count: 1,
      type2List: ['Sáng sớm, con đang ăn cereal (cảnh đời thường người đọc)']
    }
  },
  {
    id: 5,
    title: 'Khoá học Excel online (Bài B - Có Facts)',
    facts: 'Dữ liệu test giả định: Khoá học Excel online 12 buổi, học qua Zoom, học phí 1.200.000đ, cam kết hỗ trợ giải đáp sau khoá học',
    content: `Mở bảng tính lên, hàng trăm dòng số liệu khiến bạn bối rối.

Khoá học Excel online 12 buổi qua Zoom sẽ đồng hành cùng bạn.

Chương trình thiết kế từ cơ bản đến nâng cao, áp dụng ngay công thức, pivot và biểu đồ vào công việc hàng ngày.

Học phí trọn gói 1.200.000đ.

Sau khóa học, bạn được cam kết hỗ trợ giải đáp mọi thắc mắc khi làm việc thực tế.

Bạn muốn nâng cấp kỹ năng nào nhất trong công việc? Để lại bình luận nhé.`,
    humanGroundTruth: {
      totalClaims: 5,
      type1UnbackedCount: 2,
      type1UnbackedList: [
        'Thiết kế từ cơ bản đến nâng cao (nội dung khóa học ngoài facts)',
        'Áp dụng ngay công thức, pivot và biểu đồ vào công việc (nội dung khóa học chi tiết ngoài facts)'
      ],
      type2Count: 1,
      type2List: ['Mở bảng tính lên, hàng trăm dòng số liệu khiến bạn bối rối (tâm lý người đọc)']
    }
  },
  {
    id: 6,
    title: 'Shop quần áo "Basic Studio" (Bài B - Có Facts)',
    facts: 'Dữ liệu test giả định: Freeship đơn từ 299k, đổi trả trong 7 ngày nếu không vừa size',
    content: `Bạn đứng trước tủ đồ mỗi sáng, phân vân không biết mặc gì để vừa thoải mái vừa lịch sự khi đi làm.

Basic Studio mang đến những mẫu áo sơ mi và quần tây tối giản, chất liệu cotton thoáng mát, form dáng chuẩn từng đường kim mũi chỉ.

Đơn hàng từ 299k được miễn phí vận chuyển toàn quốc.

Nếu mặc không vừa size, bạn có quyền đổi trả dễ dàng trong vòng 7 ngày.

Bạn thường chọn tone màu nào cho ngày đầu tuần? Chia sẻ cùng shop nhé.`,
    humanGroundTruth: {
      totalClaims: 5,
      type1UnbackedCount: 3,
      type1UnbackedList: [
        'Mẫu áo sơ mi và quần tây tối giản (dòng sản phẩm ngoài facts)',
        'Chất liệu cotton thoáng mát (thuộc tính chất liệu ngoài facts)',
        'Form dáng chuẩn từng đường kim mũi chỉ (thuộc tính gia công ngoài facts)'
      ],
      type2Count: 1,
      type2List: ['Bạn đứng trước tủ đồ mỗi sáng, phân vân không biết mặc gì (tâm lý người đọc)']
    }
  },
  {
    id: 7,
    title: 'Căn hộ The Sun (Bài B - Có Facts)',
    facts: 'Dữ liệu test giả định: Căn hộ 2 phòng ngủ 65m2, giá từ 2,5 tỷ, bàn giao quý 4/2026, hỗ trợ vay 70%',
    content: `Chiều tan làm, bước chân về tổ ấm ngập tràn ánh nắng tự nhiên qua khung cửa sổ rộng lớn.

Căn hộ The Sun 2 phòng ngủ, diện tích 65m2 thiết kế tối ưu công năng cho gia đình trẻ.

Giá bán chỉ từ 2,5 tỷ đồng, hỗ trợ vay ngân hàng lên đến 70% với lãi suất ưu đãi.

Dự kiến bàn giao nhà vào quý 4/2026, xung quanh đầy đủ tiện ích trường học và công viên xanh.

Bạn mong muốn không gian sống như thế nào cho gia đình mình? Hãy để lại ý kiến dưới phần bình luận.`,
    humanGroundTruth: {
      totalClaims: 6,
      type1UnbackedCount: 3,
      type1UnbackedList: [
        'Ngập tràn ánh nắng qua khung cửa sổ rộng lớn (cảnh mở bài tả vật thể/căn hộ quy vào Loại 1)',
        'Với lãi suất ưu đãi (chính sách lãi suất ưu đãi không có trong facts)',
        'Xung quanh đầy đủ tiện ích trường học và công viên xanh (tiện ích ngoại khu không có trong facts)'
      ],
      type2Count: 1,
      type2List: ['Chiều tan làm, bước chân về tổ ấm (ngữ cảnh người đọc)']
    }
  },
  {
    id: 8,
    title: 'Giảm cân an toàn (Chủ đề Nhạy cảm - Không Facts)',
    facts: '',
    content: `Bạn đứng lên bàn cân và thở dài vì số cân không giảm dù đã nhịn ăn tối cả tuần.

Giảm cân khoa học không đồng nghĩa với việc hành hạ bản thân.

Chỉ cần bạn duy trì thâm hụt calo nhẹ từ 300 - 500 kcal mỗi ngày, kết hợp đi bộ 30 phút và uống đủ nước.

Tuyệt đối không nên tin vào các loại trà giảm cân thần tốc cam kết giảm 5kg trong 1 tuần vì chúng chỉ làm mất nước tạm thời.

Bạn đang áp dụng phương pháp ăn kiêng nào? Chia sẻ để cùng nhau điều chỉnh nhé.`,
    humanGroundTruth: {
      totalClaims: 3,
      type1UnbackedCount: 0,
      type1UnbackedList: [],
      type2Count: 2,
      type2List: [
        'Bạn đứng lên bàn cân và thở dài vì số cân không giảm (tâm lý người đọc)',
        'Chỉ cần duy trì thâm hụt calo nhẹ kết hợp đi bộ (lời khuyên lối sống không bán sản phẩm)'
      ]
    }
  },
  {
    id: 9,
    title: 'Thuốc thảo dược gia truyền (Chủ đề Sức khỏe Vi phạm Cấm)',
    facts: '',
    content: `Nghiên cứu cho thấy 80% người làm văn phòng mắc bệnh trĩ do ngồi lâu.

Thuốc thảo dược gia truyền của chúng tôi cam kết khỏi dứt điểm 100% chỉ sau 7 ngày sử dụng, không cần phẫu thuật đau đớn.

Uống ngày 2 viên 500mg vào buổi sáng và tối.

Liên hệ hotline 0901234567 để được bác sĩ đầu ngành khám miễn phí.`,
    humanGroundTruth: {
      totalClaims: 4,
      type1UnbackedCount: 4,
      type1UnbackedList: [
        'Nghiên cứu cho thấy 80% người làm văn phòng mắc bệnh trĩ (uy tín ngụy tạo + số liệu giật gân)',
        'Cam kết khỏi dứt điểm 100% chỉ sau 7 ngày sử dụng (cam kết tuyệt đối y tế)',
        'Uống ngày 2 viên 500mg (liều lượng y khoa không nguồn gốc)',
        'Được bác sĩ đầu ngành khám miễn phí (uy tín ngụy tạo + dịch vụ tự bịa)'
      ],
      type2Count: 0,
      type2List: []
    }
  },
  {
    id: 10,
    title: 'Thói quen đọc sách 15 phút (Chủ đề Thường Tự do - Không Facts)',
    facts: '',
    content: `Tối nay, thay vì lướt điện thoại vô định đến nửa đêm, bạn thử đặt sách bên gối xem sao.

Chỉ cần 15 phút mỗi tối trước khi ngủ, bạn sẽ đọc xong 1-2 cuốn sách mỗi tháng mà không hề cảm thấy áp lực.

Đọc sách giúp não bộ thư giãn, rời xa ánh sáng xanh và dễ đi vào giấc ngủ sâu hơn.

Cuốn sách gần nhất bạn vừa hoàn thành là gì? Bình luận tên sách bên dưới nhé.`,
    humanGroundTruth: {
      totalClaims: 2,
      type1UnbackedCount: 0,
      type1UnbackedList: [],
      type2Count: 2,
      type2List: [
        'Tối nay, thay vì lướt điện thoại vô định đến nửa đêm (ngữ cảnh đời thường)',
        'Chỉ cần 15 phút mỗi tối trước khi ngủ (thói quen đời sống)'
      ]
    }
  }
];

async function runHumanAudit() {
  console.log('\n=============================================================');
  console.log('🔬 BẮT ĐẦU KIỂM ĐỊNH CLAIM EXTRACTOR ĐỐI CHIẾU VỚI NGƯỜI ĐỌC');
  console.log('📋 Số lượng bài kiểm định: 10 bài đa dạng (Facts, Nhạy cảm, Thường)');
  console.log('=============================================================\n');

  let totalHumanType1 = 0;
  let totalExtractorType1 = 0;
  let truePositives = 0;
  let falsePositives = 0;
  let falseNegatives = 0;

  const resultsTable = [];

  for (let i = 0; i < AUDIT_SAMPLES.length; i++) {
    const sample = AUDIT_SAMPLES[i];
    console.log(`[${i + 1}/10] Đang kiểm tra bài: "${sample.title}"...`);

    const extracted = await extractAndVerifyClaims(sample.content, sample.facts, {
      parentKey: sample.title.includes('Thuốc') || sample.title.includes('Máy lọc nước') ? 'health' : 'general'
    });

    const humanUnbacked = sample.humanGroundTruth.type1UnbackedList;
    const humanCount = sample.humanGroundTruth.type1UnbackedCount;
    const extractorClaims = extracted.type1UnbackedClaims || [];
    const extractorCount = extracted.type1UnbackedCount || 0;

    totalHumanType1 += humanCount;
    totalExtractorType1 += extractorCount;

    // So khớp semantic giữa human unbacked và extractor claims
    let sampleTP = 0;
    let sampleFP = 0;
    let sampleFN = 0;

    // Kiểm tra xem bao nhiêu claim người gạch được Extractor phát hiện (TP / FN)
    humanUnbacked.forEach((hClaim) => {
      const hNorm = hClaim.toLowerCase();
      const matched = extractorClaims.some((eClaim) => {
        const eNorm = eClaim.toLowerCase();
        // Kiểm tra chứa cụm từ khóa cốt lõi
        const keyWords = hNorm.replace(/\(.*?\)/g, '').split(/\s+/).filter((w) => w.length >= 3);
        const matchCount = keyWords.filter((kw) => eNorm.includes(kw)).length;
        return matchCount >= 2 || eNorm.includes(keyWords[0]);
      });
      if (matched) {
        sampleTP++;
      } else {
        sampleFN++;
      }
    });

    // Kiểm tra Extractor có báo nhầm không (FP)
    extractorClaims.forEach((eClaim) => {
      const eNorm = eClaim.toLowerCase();
      const matched = humanUnbacked.some((hClaim) => {
        const hNorm = hClaim.toLowerCase();
        const keyWords = hNorm.replace(/\(.*?\)/g, '').split(/\s+/).filter((w) => w.length >= 3);
        const matchCount = keyWords.filter((kw) => eNorm.includes(kw)).length;
        return matchCount >= 2 || hNorm.includes(eNorm.slice(0, 15));
      });
      if (!matched) {
        // Kiểm tra xem có phải cảnh đời thường Loại 2 bị bắt nhầm không
        sampleFP++;
      }
    });

    // Giới hạn để số học không bị tràn nếu khớp 1-nhiều
    sampleTP = Math.min(sampleTP, humanCount);
    truePositives += sampleTP;
    falseNegatives += sampleFN;
    falsePositives += sampleFP;

    resultsTable.push({
      id: sample.id,
      title: sample.title,
      humanType1: humanCount,
      extractorType1: extractorCount,
      tp: sampleTP,
      fp: sampleFP,
      fn: sampleFN,
      humanClaims: humanUnbacked,
      extractorClaims
    });

    console.log(`  -> Người gạch: ${humanCount} claim | Extractor bắt: ${extractorCount} claim | TP=${sampleTP}, FP=${sampleFP}, FN=${sampleFN}`);
    // Nghỉ 500ms tránh rate limit
    await new Promise((r) => setTimeout(r, 600));
  }

  const precision = truePositives + falsePositives > 0 ? (truePositives / (truePositives + falsePositives)) : 1;
  const recall = truePositives + falseNegatives > 0 ? (truePositives / (truePositives + falseNegatives)) : 1;
  const f1 = precision + recall > 0 ? ((2 * precision * recall) / (precision + recall)) : 1;

  console.log('\n=============================================================');
  console.log('📊 KẾT QUẢ TỔNG HỢP KIỂM ĐỊNH CLAIM EXTRACTOR VỚI NGƯỜI ĐỌC');
  console.log('=============================================================');
  console.log(`Tổng claim Loại 1 Người gạch (Ground Truth): ${totalHumanType1}`);
  console.log(`Tổng claim Loại 1 Extractor phát hiện      : ${totalExtractorType1}`);
  console.log(`Đúng (True Positives)                      : ${truePositives}`);
  console.log(`Báo nhầm (False Positives)                 : ${falsePositives}`);
  console.log(`Bỏ sót (False Negatives)                   : ${falseNegatives}`);
  console.log(`ĐỘ CHÍNH XÁC (Precision)                   : ${(precision * 100).toFixed(1)}%`);
  console.log(`ĐỘ PHỦ / ĐỘ NHẠY (Recall)                  : ${(recall * 100).toFixed(1)}%`);
  console.log(`F1-SCORE                                   : ${(f1 * 100).toFixed(1)}%`);
  console.log('=============================================================\n');

  // Lưu kết quả vào file json để báo cáo
  const fs = require('fs');
  const auditReport = {
    evaluatedAt: new Date().toISOString(),
    totalSamples: AUDIT_SAMPLES.length,
    metrics: {
      totalHumanType1,
      totalExtractorType1,
      truePositives,
      falsePositives,
      falseNegatives,
      precision: Number((precision * 100).toFixed(1)),
      recall: Number((recall * 100).toFixed(1)),
      f1Score: Number((f1 * 100).toFixed(1))
    },
    details: resultsTable
  };

  const outputPath = path.resolve(__dirname, '../eval/extractor-human-audit.json');
  fs.writeFileSync(outputPath, JSON.stringify(auditReport, null, 2), 'utf8');
  console.log(`Đã lưu báo cáo kiểm định chi tiết tại: ${outputPath}`);
}

runHumanAudit().catch((err) => {
  console.error('Lỗi khi chạy Human Audit:', err);
});
