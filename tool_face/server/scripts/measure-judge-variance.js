/**
 * measure-judge-variance.js
 * Đo độ lệch của bộ chấm (Judge Variance: Delta Judge) trên 10 bài viết độc lập.
 * - Chấm tuần tự, mỗi bài chấm 2 lần độc lập bằng Qwen 27B (temperature = 0.1).
 * - Điểm chất lượng chỉ tính trên 5 tiêu chí phân biệt được: Hook, Giá trị, Giọng văn, Nhịp & độ dài, CTA.
 * - Bỏ 2 tiêu chí Trung thực và Sạch sáo rỗng khỏi điểm chất lượng (theo chỉ đạo).
 * - Nếu lỗi sau retry: trả về null, loại khỏi trung bình và báo rõ số mẫu bị loại.
 * - Tính chênh lệch tuyệt đối trung bình giữa 2 lần chấm (|Run1 - Run2|).
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const { callAiChat } = require('../src/utils/AiClientService');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Chuẩn bị 10 bài viết độc lập (5 bài nhóm Facts từ file facts-5-new-results.json + 5 bài nhóm Free topics)
function prepare10Articles() {
  const articles = [];
  
  // 1. Lấy 5 bài nhóm Facts (C+ và B)
  const factsFile = path.resolve(__dirname, '../eval/facts-5-new-results.json');
  if (fs.existsSync(factsFile)) {
    const factsData = JSON.parse(fs.readFileSync(factsFile, 'utf8'));
    // Lấy xen kẽ C+ và B để đa dạng phong cách
    articles.push({
      id: 1,
      topicId: factsData[0].id,
      topic: factsData[0].topic,
      facts: factsData[0].facts,
      goal: 'Thu hút khách ghé quán cà phê trải nghiệm ưu đãi',
      condition: 'C+',
      content: factsData[0].conditionCPlus.content
    });
    articles.push({
      id: 2,
      topicId: factsData[1].id,
      topic: factsData[1].topic,
      facts: factsData[1].facts,
      goal: 'Giới thiệu máy lọc nước chính hãng gia đình',
      condition: 'B',
      content: factsData[1].conditionB.content
    });
    articles.push({
      id: 3,
      topicId: factsData[2].id,
      topic: factsData[2].topic,
      facts: factsData[2].facts,
      goal: 'Tuyển sinh khóa học Excel thực chiến văn phòng',
      condition: 'C+',
      content: factsData[2].conditionCPlus.content
    });
    articles.push({
      id: 4,
      topicId: factsData[3].id,
      topic: factsData[3].topic,
      facts: factsData[3].facts,
      goal: 'Tăng tương tác và giới thiệu chính sách mua sắm online',
      condition: 'B',
      content: factsData[3].conditionB.content
    });
    articles.push({
      id: 5,
      topicId: factsData[4].id,
      topic: factsData[4].topic,
      facts: factsData[4].facts,
      goal: 'Giới thiệu thông số căn hộ mẫu cho khách quan tâm',
      condition: 'C+',
      content: factsData[4].conditionCPlus.content
    });
  }

  // 2. Lấy 5 bài nhóm Tự do (từ file topics.json bài 1 đến 5)
  const topicsFile = path.resolve(__dirname, '../eval/topics.json');
  const allTopics = JSON.parse(fs.readFileSync(topicsFile, 'utf8'));
  
  // Văn bản thực tế mẫu từ các lần sinh trước
  const freeSamples = [
    {
      topicId: 1,
      topic: 'mẹo nấu cơm không bị nhão',
      goal: allTopics[0].goal,
      facts: allTopics[0].facts,
      condition: 'C',
      content: `Chồng mình từng phàn nàn nhẹ nhàng rằng bữa cơm chiều hạt nào cũng dính bết vào nhau.\n\nMình nhận ra trước đó mình đang vò gạo quá kỹ, tưởng vậy sẽ sạch nhưng thực ra lại làm tróc hết lớp cám bảo vệ.\n\nThay đổi nhỏ thôi, mình chỉ vo nhẹ nhàng 1-2 lần rồi để ráo hẳn trước khi cho vào nồi.\n\nTỉ lệ nước mình dùng là 1 phần gạo tương ứng 1.1 đến 1.2 phần nước, phù hợp với loại gạo thơm mới mua.\n\nSau khi nồi báo chín, mình không mở nắp ngay mà để yên 10 phút.\n\nBước cuối cùng là xới tơi cơm để hơi nước thoát ra, hạt cơm sẽ khô ráo và tách bạch hơn.\n\nMấy bữa nay cơm nhà ăn ngon miệng hẳn, không còn cảnh gắp lên là dính lại với nhau nữa.\n\nBạn thường có bí quyết gì để giữ cơm luôn tơi xốp không? Chia sẻ dưới bình luận nhé.`
    },
    {
      topicId: 2,
      topic: 'du lịch Đà Lạt 2 ngày',
      goal: allTopics[1].goal,
      facts: allTopics[1].facts,
      condition: 'B',
      content: `Sáng sớm ở Cầu Đất, gió lạnh luồn qua từng lớp áo khi bạn đứng chờ mặt trời ló rạng trên biển mây bồng bềnh.\n\nNếu chỉ có 48 giờ ở Đà Lạt, đừng cố đi quá nhiều nơi khiến chuyến đi thành cuộc chạy đua mệt mỏi.\n\nNgày đầu tiên, hãy dành buổi sáng săn mây Cầu Đất, chiều tìm một góc cà phê yên tĩnh ngắm hoàng hôn buông xuống thung lũng.\n\nSang ngày thứ hai, ghé chợ Đà Lạt mua chút quà mộc mạc rồi dành buổi chiều thong thả dạo quanh hồ Tuyền Lâm.\n\nLịch trình ngắn nhưng vừa vặn để bạn kịp hít căng lồng ngực không khí mát lành của phố núi.\n\nLần gần nhất bạn xách balo lên Đà Lạt là khi nào? Cùng chia sẻ khoảnh khắc đáng nhớ nhé.`
    },
    {
      topicId: 3,
      topic: 'nuôi mèo mới về nhà',
      goal: allTopics[2].goal,
      facts: allTopics[2].facts,
      condition: 'C',
      content: `Bé mèo con vừa bước ra khỏi lồng vận chuyển, co ro núp dưới gầm giường và mắt tròn xoe đầy cảnh giác.\n\nCảm giác muốn ôm ấp cưng nựng ngay lúc này là tự nhiên, nhưng lại dễ khiến bé bị hoảng sợ.\n\nTrong 24 đến 48 giờ đầu tiên, điều bé cần nhất là một không gian riêng yên tĩnh để tự làm quen với mùi hương mới.\n\nHãy chuẩn bị chậu cát vệ sinh ở góc khuất, kèm sẵn bát thức ăn và nước uống quen thuộc mà bé từng ăn trước đó.\n\nĐừng vồ vập bế ép, cứ để bé tự tò mò bước ra khi cảm thấy an toàn.\n\nBạn mất bao lâu để bé mèo đầu tiên chịu làm quen và dụi đầu vào tay bạn? Chia sẻ kinh nghiệm nhé.`
    },
    {
      topicId: 4,
      topic: 'học tiếng Anh giao tiếp cho người đi làm',
      goal: allTopics[3].goal,
      facts: allTopics[3].facts,
      condition: 'B',
      content: `Mở email của đối tác nước ngoài lúc 5 giờ chiều, bạn loay hoay mất nửa tiếng chỉ để tra từ và chỉnh từng câu cho đúng ngữ pháp.\n\nNỗi sợ nói sai ngữ pháp khiến nhiều người đi làm ngập ngừng không dám mở lời trong các cuộc họp.\n\nThực tế, giao tiếp công sở không cần những cấu trúc quá phức tạp.\n\nChỉ cần dành 15-20 phút mỗi ngày luyện phản xạ theo từng cụm từ thông dụng (chunks) gắn liền với công việc hàng ngày.\n\nThay vì học thuộc quy tắc ngữ pháp rời rạc, hãy tập nói trôi chảy các cụm chào hỏi, xác nhận lịch hẹn và báo cáo tiến độ.\n\nKhó khăn lớn nhất của bạn khi giao tiếp tiếng Anh tại nơi làm việc là gì? Hãy chia sẻ bên dưới nhé.`
    },
    {
      topicId: 5,
      topic: 'trồng rau ban công',
      goal: allTopics[4].goal,
      facts: allTopics[4].facts,
      condition: 'C',
      content: `Mỗi sáng bước ra ban công ngắm nhìn những mầm xanh mơn mởn đọng sương sớm là cảm giác thư thái khó tả giữa thành phố ngột ngạt.\n\nKhông cần sân vườn rộng, chỉ cần vài thùng xốp đục lỗ thoát nước là bạn đã có thể bắt đầu vườn rau tại nhà.\n\nHãy chọn những loại rau dễ sống như rau muống, xà lách hay hành lá để thấy thành quả nhanh chóng.\n\nĐất trồng nên trộn cùng trấu hun và xơ dừa để tơi xốp, giữ ẩm tốt mà không lo úng rễ.\n\nĐặt thùng ở nơi đón đủ nắng sáng và tưới nước nhẹ nhàng vào mỗi chiều mát.\n\nBạn đã từng thử tự tay hái rau sạch từ ban công nhà mình chưa? Cùng khoe góc xanh của bạn nhé.`
    }
  ];

  freeSamples.forEach((s, idx) => {
    articles.push({
      id: idx + 6,
      topicId: s.topicId,
      topic: s.topic,
      facts: s.facts,
      goal: s.goal,
      condition: s.condition,
      content: s.content
    });
  });

  return articles;
}

// Hàm chấm điểm bằng Qwen 27B (5 tiêu chí phân biệt được)
async function evaluateSinglePost(article, runIndex) {
  const userPrompt = `ĐÁNH GIÁ CHẤT LƯỢNG BÀI VIẾT FACEBOOK:
Chủ đề: "${article.topic}"
Mục tiêu bài viết: "${article.goal}"
Thông tin sự thật (facts): "${article.facts || 'Không có'}"

[NỘI DUNG BÀI VIẾT]:
${article.content}

HƯỚNG DẪN CHẤM ĐIỂM (Thang điểm 1 đến 5: 1: Rất kém, 2: Kém, 3: Đạt trung bình, 4: Tốt, 5: Xuất sắc):
Chấm 5 tiêu chí sau:
1. hook (1-5): Sức hút 3 dòng đầu, gợi tò mò/đồng cảm đời thực, không mở đầu bằng câu hỏi sáo rỗng.
2. gia_tri (1-5): Nội dung có ích, có thông tin thực tế, không lý thuyết suông.
3. giong_van (1-5): Tự nhiên, gần gũi, chân thành, phong cách mạng xã hội.
4. nhip_va_do_dai (1-5): Ngắt dòng thoáng (1-2 câu/đoạn), nhịp đọc lôi cuốn, độ dài phù hợp (100-160 từ).
5. cta (1-5): Kêu gọi hành động hoặc câu hỏi tương tác tự nhiên, thúc đẩy thảo luận hoặc chuyển đổi.

BẮT BUỘC TRẢ VỀ JSON HỢP LỆ DUY NHẤT THEO ĐỊNH DẠNG:
{"hook": 4, "gia_tri": 4, "giong_van": 4, "nhip_va_do_dai": 4, "cta": 4, "nhan_xet": "Nhận xét ngắn gọn 1-2 câu"}`;

  try {
    const res = await callAiChat({
      messages: [
        { role: 'system', content: 'Bạn là giám khảo chấm bài Facebook độc lập, khắt khe và công tâm. Chỉ trả về JSON hợp lệ.' },
        { role: 'user', content: userPrompt }
      ],
      model: 'qwen/qwen3.8-27b',
      temperature: 0.1,
      max_tokens: 500
    });

    const cleaned = res.content.replace(/```json/gi, '').replace(/```/g, '').trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Không parse được JSON từ phản hồi: ' + cleaned.slice(0, 100));

    const parsed = JSON.parse(match[0]);
    const hook = Number(parsed.hook);
    const gia_tri = Number(parsed.gia_tri);
    const giong_van = Number(parsed.giong_van);
    const nhip_va_do_dai = Number(parsed.nhip_va_do_dai);
    const cta = Number(parsed.cta);

    // Kiểm tra tính hợp lệ của các điểm số (1-5)
    if ([hook, gia_tri, giong_van, nhip_va_do_dai, cta].some((v) => isNaN(v) || v < 1 || v > 5)) {
      throw new Error('Điểm số ngoài khoảng 1-5: ' + JSON.stringify(parsed));
    }

    const scores = { hook, gia_tri, giong_van, nhip_va_do_dai, cta };
    const avgScore = Number(((hook + gia_tri + giong_van + nhip_va_do_dai + cta) / 5).toFixed(2));

    return {
      success: true,
      scores,
      avgScore,
      comment: parsed.nhan_xet || ''
    };
  } catch (err) {
    console.warn(`   ⚠️ Lỗi khi chấm bài ${article.id} (Run ${runIndex}): ${err.message}`);
    return {
      success: false,
      scores: null,
      avgScore: null,
      error: err.message
    };
  }
}

async function main() {
  console.log('========================================================================');
  console.log('⚖️ ĐO ĐỘ LỆCH BỘ CHẤM (JUDGE VARIANCE - Δ JUDGE) TRÊN 10 BÀI VIẾT');
  console.log('📌 Tiêu chí: Hook, Giá trị, Giọng văn, Nhịp & độ dài, CTA (5 tiêu chí)');
  console.log('📌 Mô hình chấm: qwen/qwen3.8-27b | Chế độ: Chạy tuần tự, giãn cách 2s');
  console.log('📌 Ngưỡng chấp nhận: Δ judge <= 0.20');
  console.log('========================================================================\n');

  const articles = prepare10Articles();
  console.log(`Đã chuẩn bị ${articles.length} bài viết (5 bài Facts + 5 bài Tự do).\n`);

  const results = [];
  let validPairsCount = 0;
  let totalDeltaSum = 0;
  let invalidCount = 0;

  for (let i = 0; i < articles.length; i++) {
    const art = articles[i];
    console.log(`[${i + 1}/10] Đang chấm bài ID ${art.id}: "${art.topic}" (Điều kiện ${art.condition})...`);

    // Lần chấm 1
    process.stdout.write(`   -> Chấm Lần 1... `);
    const run1 = await evaluateSinglePost(art, 1);
    if (run1.success) {
      console.log(`Điểm: ${run1.avgScore} [H:${run1.scores.hook}, G:${run1.scores.gia_tri}, V:${run1.scores.giong_van}, N:${run1.scores.nhip_va_do_dai}, C:${run1.scores.cta}]`);
    } else {
      console.log(`THẤT BẠI: ${run1.error}`);
    }

    await sleep(2000); // Giãn cách 2 giây tránh 429

    // Lần chấm 2
    process.stdout.write(`   -> Chấm Lần 2... `);
    const run2 = await evaluateSinglePost(art, 2);
    if (run2.success) {
      console.log(`Điểm: ${run2.avgScore} [H:${run2.scores.hook}, G:${run2.scores.gia_tri}, V:${run2.scores.giong_van}, N:${run2.scores.nhip_va_do_dai}, C:${run2.scores.cta}]`);
    } else {
      console.log(`THẤT BẠI: ${run2.error}`);
    }

    await sleep(2000); // Giãn cách 2 giây tránh 429

    let delta = null;
    let isValid = false;

    if (run1.success && run2.success) {
      delta = Number(Math.abs(run1.avgScore - run2.avgScore).toFixed(2));
      totalDeltaSum += delta;
      validPairsCount++;
      isValid = true;
      console.log(`   ==> Độ lệch |Run1 - Run2|: ${delta}\n`);
    } else {
      invalidCount++;
      console.log(`   ==> Mẫu lỗi, gán NULL và loại khỏi trung bình.\n`);
    }

    results.push({
      sampleIndex: i + 1,
      topicId: art.topicId,
      topic: art.topic,
      condition: art.condition,
      isValid,
      run1: run1.success ? { scores: run1.scores, avgScore: run1.avgScore, comment: run1.comment } : null,
      run2: run2.success ? { scores: run2.scores, avgScore: run2.avgScore, comment: run2.comment } : null,
      delta
    });
  }

  const avgDelta = validPairsCount > 0 ? Number((totalDeltaSum / validPairsCount).toFixed(3)) : null;

  console.log('========================================================================');
  console.log('📊 KẾT QUẢ ĐO ĐỘ LỆCH BỘ CHẤM (JUDGE VARIANCE SUMMARY)');
  console.log('========================================================================');
  console.log(`- Tổng số cặp bài thử nghiệm: ${articles.length}`);
  console.log(`- Số cặp bài hợp lệ (chấm thành công cả 2 lần): ${validPairsCount}/${articles.length}`);
  console.log(`- Số cặp bài bị loại (có lần chấm lỗi): ${invalidCount}/${articles.length}`);
  console.log(`- ĐỘ LỆCH TUYỆT ĐỐI TRUNG BÌNH (Δ judge): ${avgDelta !== null ? avgDelta : 'N/A'}`);
  console.log(`- Ngưỡng chuẩn: <= 0.20`);
  if (avgDelta !== null) {
    if (avgDelta <= 0.20) {
      console.log(`✅ ĐẠT YÊU CẦU: Bộ chấm đủ ổn định (Δ judge = ${avgDelta} <= 0.20). Ngưỡng 0.30 có ý nghĩa phân định!`);
    } else {
      console.log(`❌ KHÔNG ĐẠT: Bộ chấm quá nhiễu (Δ judge = ${avgDelta} > 0.20). Không thể dùng ngưỡng 0.30 để kết luận!`);
    }
  }

  // Ghi kết quả ra file
  const outFile = path.resolve(__dirname, '../eval/judge-variance-10.json');
  fs.writeFileSync(outFile, JSON.stringify({
    measuredAt: new Date().toISOString(),
    criteria: ['hook', 'gia_tri', 'giong_van', 'nhip_va_do_dai', 'cta'],
    judgeModel: 'qwen/qwen3.8-27b',
    totalSamples: articles.length,
    validSamples: validPairsCount,
    invalidSamples: invalidCount,
    avgDelta,
    threshold: 0.20,
    isAccepted: avgDelta !== null && avgDelta <= 0.20,
    results
  }, null, 2), 'utf8');

  console.log(`\n📁 Kết quả chi tiết đã lưu tại: ${outFile}`);
}

main().catch((err) => {
  console.error('Lỗi nghiêm trọng:', err);
  process.exit(1);
});
