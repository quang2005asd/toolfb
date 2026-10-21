/**
 * test-facts-5-with-guardrails.js
 * Đo lại 5 bài nhóm Facts có áp dụng chốt chặn Fact Coverage bằng code:
 * 1. Mọi facts (số, giá, thời hạn, tên) phải còn nguyên vẹn sau rewrite.
 * 2. Thiếu fact thì TỪ CHỐI rewrite và GIỮ NGUYÊN bản trước.
 * 3. Điểm chất lượng chỉ tính trên 5 tiêu chí: Hook, Giá trị, Giọng văn, Nhịp & độ dài, CTA.
 * 4. Báo cáo bảng 5 bài gồm: Tỉ lệ fact còn lại (%), độ dài từ, số claim bịa, và hành động rewrite.
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const { callAiChat } = require('../src/utils/AiClientService');
const { extractAndVerifyClaims, selfCorrectPost, verifyFactCoverageByCode } = require('../src/utils/ClaimExtractor');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const DATA_FILE = path.resolve(__dirname, '../eval/facts-5-new-results.json');
const rawData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));

// Hàm chấm điểm 5 tiêu chí chất lượng bằng Qwen 27B
async function judge5Criteria(content, topic, facts, goal) {
  const prompt = `ĐÁNH GIÁ BÀI VIẾT FACEBOOK:
Chủ đề: "${topic}"
Mục tiêu: "${goal}"
Thông tin sự thật (facts): "${facts}"

[NỘI DUNG]:
${content}

Chấm điểm từ 1 đến 5 cho:
1. hook (1-5): Sức hút mở đầu, gắn liền tình huống/nhu cầu người đọc.
2. gia_tri (1-5): Tính hữu ích, thông tin cụ thể, truyền tải đúng facts.
3. giong_van (1-5): Tự nhiên, gần gũi, không máy móc.
4. nhip_va_do_dai (1-5): Ngắt dòng thoáng (1-2 câu/đoạn), độ dài phù hợp.
5. cta (1-5): Kêu gọi hành động hoặc câu hỏi tương tác tự nhiên, rõ ràng.

Trả về JSON duy nhất: {"hook": 4, "gia_tri": 4, "giong_van": 4, "nhip_va_do_dai": 4, "cta": 4, "nhan_xet": "..."}`;

  try {
    const res = await callAiChat({
      messages: [
        { role: 'system', content: 'Bạn là giám khảo chấm bài Facebook độc lập, khắt khe và công tâm. Chỉ trả về JSON hợp lệ.' },
        { role: 'user', content: prompt }
      ],
      model: 'qwen/qwen3.8-27b',
      temperature: 0.1,
      max_tokens: 500
    });

    const cleaned = res.content.replace(/```json/gi, '').replace(/```/g, '').trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Không parse được JSON');
    const parsed = JSON.parse(match[0]);

    const hook = Number(parsed.hook) || 3;
    const gia_tri = Number(parsed.gia_tri) || 3;
    const giong_van = Number(parsed.giong_van) || 3;
    const nhip_va_do_dai = Number(parsed.nhip_va_do_dai) || 3;
    const cta = Number(parsed.cta) || 3;

    const avg5 = Number(((hook + gia_tri + giong_van + nhip_va_do_dai + cta) / 5).toFixed(2));
    return {
      scores: { hook, gia_tri, giong_van, nhip_va_do_dai, cta },
      avg5,
      comment: parsed.nhan_xet || ''
    };
  } catch (err) {
    console.warn('   Lỗi judge5Criteria:', err.message);
    return null;
  }
}

async function run() {
  console.log('========================================================================');
  console.log('🛡️ ĐO LẠI 5 BÀI FACTS VỚI CHỐT CHẶN FACT COVERAGE & ĐIỂM 5 TIÊU CHÍ');
  console.log('========================================================================\n');

  const report = [];

  for (let i = 0; i < rawData.length; i++) {
    const item = rawData[i];
    console.log(`[${i + 1}/5] Xử lý bài ID ${item.id}: "${item.topic}"...`);

    // 1. Phân tích bản C (gốc)
    const rawC = item.conditionC.content;
    const covC = verifyFactCoverageByCode(rawC, item.facts);
    const claimC = await extractAndVerifyClaims(rawC, item.facts);
    await sleep(1500);

    // 2. Chạy C qua Smart Rewriter có chốt Fact Coverage
    console.log(`   -> Chạy C qua Smart Rewriter có chốt Fact Coverage...`);
    const scC = await selfCorrectPost(rawC, item.facts);
    const finalCPlus = scC.content;
    const covCPlus = verifyFactCoverageByCode(finalCPlus, item.facts);
    const claimCPlus = await extractAndVerifyClaims(finalCPlus, item.facts);
    await sleep(1500);

    // 3. Phân tích bản B raw và chạy B qua Smart Rewriter có chốt Fact Coverage
    const rawB = item.conditionB.rawContent;
    const covBRaw = verifyFactCoverageByCode(rawB, item.facts);
    console.log(`   -> Chạy B raw qua Smart Rewriter có chốt Fact Coverage...`);
    const scB = await selfCorrectPost(rawB, item.facts);
    const finalB = scB.content;
    const covBFinal = verifyFactCoverageByCode(finalB, item.facts);
    const claimBFinal = await extractAndVerifyClaims(finalB, item.facts);
    await sleep(1500);

    // 4. Chấm điểm 5 tiêu chí cho finalCPlus và finalB
    console.log(`   -> Chấm điểm 5 tiêu chí cho C+ và B final...`);
    const judgeCPlus = await judge5Criteria(finalCPlus, item.topic, item.facts, 'Bán hàng / giới thiệu sản phẩm');
    await sleep(1500);
    const judgeB = await judge5Criteria(finalB, item.topic, item.facts, 'Bán hàng / giới thiệu sản phẩm');
    await sleep(1500);

    report.push({
      id: item.id,
      topic: item.topic,
      facts: item.facts,
      conditionC: {
        wordCount: rawC.split(/\s+/).length,
        factCoverage: covC.coverageRate,
        missingFacts: covC.missingFacts,
        claimsCount: claimC.type1UnbackedCount
      },
      conditionCPlus: {
        content: finalCPlus,
        wordCount: finalCPlus.split(/\s+/).length,
        wasCorrected: scC.corrected,
        rejectedRewrite: scC.rejectedRewrite || false,
        rejectionReason: scC.rejectionReason || null,
        factCoverage: covCPlus.coverageRate,
        missingFacts: covCPlus.missingFacts,
        claimsCount: claimCPlus.type1UnbackedCount,
        scores: judgeCPlus?.scores,
        avg5: judgeCPlus?.avg5
      },
      conditionB: {
        rawContent: rawB,
        rawWordCount: rawB.split(/\s+/).length,
        rawFactCoverage: covBRaw.coverageRate,
        content: finalB,
        wordCount: finalB.split(/\s+/).length,
        wasCorrected: scB.corrected,
        rejectedRewrite: scB.rejectedRewrite || false,
        rejectionReason: scB.rejectionReason || null,
        factCoverage: covBFinal.coverageRate,
        missingFacts: covBFinal.missingFacts,
        claimsCount: claimBFinal.type1UnbackedCount,
        scores: judgeB?.scores,
        avg5: judgeB?.avg5
      }
    });

    console.log(`   ✓ Hoàn tất bài ${item.id}:`);
    console.log(`     C+: Fact Cov = ${(covCPlus.coverageRate * 100).toFixed(0)}% | Claims = ${claimCPlus.type1UnbackedCount} | Điểm 5 = ${judgeCPlus?.avg5} | Rewriter: ${scC.rejectedRewrite ? 'TỪ CHỐI (Thiếu fact)' : (scC.corrected ? 'Chấp nhận sửa' : 'Giữ nguyên')}`);
    console.log(`     B:  Fact Cov = ${(covBFinal.coverageRate * 100).toFixed(0)}% | Claims = ${claimBFinal.type1UnbackedCount} | Điểm 5 = ${judgeB?.avg5} | Rewriter: ${scB.rejectedRewrite ? 'TỪ CHỐI (Thiếu fact)' : (scB.corrected ? 'Chấp nhận sửa' : 'Giữ nguyên')}\n`);
  }

  // Lưu kết quả
  const outFile = path.resolve(__dirname, '../eval/facts-5-with-coverage-results.json');
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2), 'utf8');
  console.log(`✅ Kết quả đã lưu tại: ${outFile}`);
}

run().catch((e) => {
  console.error('Lỗi nghiêm trọng:', e);
  process.exit(1);
});
