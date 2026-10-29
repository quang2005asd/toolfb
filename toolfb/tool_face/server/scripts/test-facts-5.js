/**
 * test-facts-5.js
 * Kiểm tra chuyên sâu 5 chủ đề nhóm Facts (ID 21-25) cho Điều kiện C và Điều kiện B:
 * - Điều kiện C: Common Rules (không pack)
 * - Điều kiện B: Pack + Dynamic Structure + Self-Correction Pass
 * - Xuất nội dung 5 bài B mới kèm danh sách claim bị cờ trước/sau tự sửa.
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const { callAiChat } = require('../src/utils/AiClientService');
const topicPackService = require('../src/utils/TopicPackService');
const { cleanFacebookContent } = require('../src/utils/AiContentGenerator');
const { extractAndVerifyClaims, selfCorrectPost } = require('../src/utils/ClaimExtractor');
const { resolveTopicPack, mergeRules, COMMON_RULES } = topicPackService;

const TOPICS_FILE = path.resolve(__dirname, '../eval/topics.json');
const allTopics = JSON.parse(fs.readFileSync(TOPICS_FILE, 'utf8'));
const factTopics = allTopics.filter((t) => t.group === 'ban_hang_facts');

async function generateC(topicObj) {
  const prompt = `Viết bài đăng Facebook về chủ đề: "${topicObj.topic}".
Mục tiêu: ${topicObj.goal}.
[THÔNG TIN THỰC TẾ (FACTS)]: ${topicObj.facts.trim()}

Quy tắc bắt buộc (COMMON_RULES):
${COMMON_RULES.must_not.map((r) => `- ${r}`).join('\n')}

Quy tắc phải làm:
${COMMON_RULES.must_do.map((r) => `- ${r}`).join('\n')}

⚠️ DÒNG CỐ ĐỊNH BẮT BUỘC: Chỉ dùng số liệu, giá, ưu đãi có trong phần facts. Tên sản phẩm chỉ được mô tả bằng đúng các mục trong facts, tuyệt đối không thêm chất liệu, size, vị trí, khoảng cách, menu, công dụng nếu facts không nêu. Tuyệt đối cấm 2 câu hỏi liên tiếp ở hook mở đầu. Tuyệt đối không dùng dấu sao (*) Markdown. Cấm bịa quà tặng hoặc social proof.`;

  const { content } = await callAiChat({
    messages: [
      {
        role: 'system',
        content: `Bạn là copywriter Facebook chuyên nghiệp tuân thủ nghiêm ngặt quy tắc định dạng và an toàn.
Nguyên tắc: Mỗi đoạn chỉ dài 1-2 câu ngắn, tuyệt đối không dùng dấu sao Markdown (*), mở đầu bằng hình ảnh/tình huống đời thực (CẤM 2 câu hỏi liên tiếp), không hứa quà ngoài facts.`
      },
      { role: 'user', content: prompt }
    ],
    model: 'openai/gpt-oss-120b',
    temperature: 0.7,
    max_tokens: 1200
  });

  return cleanFacebookContent(content);
}

async function generateB(topicObj) {
  const resolved = await resolveTopicPack(topicObj.topic);
  const pack = resolved.pack;
  const mergedRules = mergeRules(pack, { hasFacts: true });

  const prompt = `Viết bài đăng Facebook về chủ đề: "${topicObj.topic}".
Mục tiêu: ${topicObj.goal}.
[THÔNG TIN THỰC TẾ (FACTS)]: ${topicObj.facts.trim()}

Áp dụng tiêu chuẩn Topic Pack:
- Góc nhìn đề xuất: ${(pack.angles || []).slice(0, 2).join(' / ')}
- Cấu trúc: Đi thẳng vào từng dữ kiện trong facts cung cấp. Bỏ qua hoàn toàn các bước suy diễn (pain point, tiện ích xung quanh, thực trạng, câu chuyện thương hiệu) nếu facts không nêu.
- Phong cách: ${pack.style_defaults?.hook_style || 'Hình ảnh đời thực cụ thể'}, tone ${pack.style_defaults?.tone || 'chân thành, hữu ích'}.

Quy tắc cấm (must_not):
${mergedRules.must_not.map((r) => `- ${r}`).join('\n')}

Quy tắc phải làm (must_do):
${mergedRules.must_do.map((r) => `- ${r}`).join('\n')}

⚠️ DÒNG CỐ ĐỊNH BẮT BUỘC: Chỉ dùng số liệu, giá, ưu đãi có trong phần facts. Tên sản phẩm chỉ được mô tả bằng đúng các mục trong facts. TUYỆT ĐỐI KHÔNG tự thêm chất liệu (cotton, da...), kích cỡ (size S, M, L), màu sắc, vị trí, khoảng cách (km), menu, công dụng nếu facts không có. Bài viết bắt buộc ngắn gọn (100 - 160 từ). Tuyệt đối không dùng dấu sao (*) Markdown. Tuyệt đối cấm 2 câu hỏi liên tiếp ở hook mở đầu.`;

  const { content } = await callAiChat({
    messages: [
      {
        role: 'system',
        content: `Bạn là bậc thầy Copywriter mạng xã hội, am hiểu sâu sắc hành vi người dùng điện thoại lướt Facebook Feed.
Nguyên tắc: Tối ưu 3 giây đầu bằng một hình ảnh cụ thể (CẤM 2 câu hỏi liên tiếp), mỗi đoạn chỉ 1-2 câu, tuyệt đối không dùng dấu sao Markdown (*), viết chân thành và hữu ích, chỉ dùng facts.`
      },
      { role: 'user', content: prompt }
    ],
    model: 'openai/gpt-oss-120b',
    temperature: 0.7,
    max_tokens: 1200
  });

  return {
    rawContent: cleanFacebookContent(content),
    pack
  };
}

async function judgePostSimple(postContent, topicObj) {
  const userContent = `ĐÁNH GIÁ BÀI VIẾT SAU:
Chủ đề: "${topicObj.topic}"
Mục tiêu: "${topicObj.goal}"
Thông tin sự thật đã cung cấp (facts): "${topicObj.facts || 'Không có'}"

[NỘI DUNG BÀI VIẾT]:
${postContent}

Hãy đối chiếu facts và chấm điểm từ 1 đến 5 cho: hook, gia_tri, giong_van, nhip_va_do_dai, cta, sach_sao_rong, trung_thuc.
Trả về JSON duy nhất: {"hook": 4, "gia_tri": 4, "giong_van": 4, "nhip_va_do_dai": 4, "cta": 4, "sach_sao_rong": 5, "trung_thuc": 5, "nhan_xet": "..."}`;

  try {
    const res = await callAiChat({
      messages: [
        { role: 'system', content: 'Bạn là giám khảo chấm bài Facebook độc lập và khắt khe.' },
        { role: 'user', content: userContent }
      ],
      model: 'qwen/qwen3.8-27b',
      temperature: 0.1,
      max_tokens: 500
    });
    const cleaned = res.content.replace(/```json/gi, '').replace(/```/g, '').trim();
    return JSON.parse(cleaned);
  } catch (e) {
    return { hook: 3, gia_tri: 3, giong_van: 3, nhip_va_do_dai: 3, cta: 3, sach_sao_rong: 3, trung_thuc: 3, nhan_xet: e.message };
  }
}

async function runTest() {
  console.log('\n=============================================================');
  console.log('🧪 KIỂM TRA CHUYÊN SÂU 5 BÀI FACTS: ĐIỀU KIỆN C vs C+ vs B');
  console.log('=============================================================\n');

  const report = [];

  for (let i = 0; i < factTopics.length; i++) {
    const topic = factTopics[i];
    console.log(`[${i + 1}/5] Đang xử lý: "${topic.topic}"...`);

    // 1. Điều kiện C
    const rawC = await generateC(topic);

    // 2. Điều kiện C+ (C qua Smart Rewriter)
    console.log(`   -> [C+] Áp dụng Smart Rewriter cho Điều kiện C...`);
    const cPlusRes = await selfCorrectPost(rawC, topic.facts);
    const finalCPlus = cPlusRes.content;
    const claimC = cPlusRes.initialVerify || { type1UnbackedCount: 0, type1UnbackedClaims: [] };
    const claimCPlus = cPlusRes.verifyResult || { type1UnbackedCount: 0, type1UnbackedClaims: [] };

    // 3. Điều kiện B (B qua Smart Rewriter)
    console.log(`   -> [B] Áp dụng Smart Rewriter cho Điều kiện B...`);
    const bGen = await generateB(topic);
    const bRes = await selfCorrectPost(bGen.rawContent, topic.facts, { parentKey: bGen.pack?.parent_key });
    const finalB = bRes.content;
    const claimB = bRes.verifyResult || { type1UnbackedCount: 0, type1UnbackedClaims: [] };

    // Chấm điểm chất lượng
    console.log(`   -> Chấm điểm độc lập cho C, C+, B...`);
    const judgeC = await judgePostSimple(rawC, topic);
    const judgeCPlus = await judgePostSimple(finalCPlus, topic);
    const judgeB = await judgePostSimple(finalB, topic);

    report.push({
      id: topic.id,
      topic: topic.topic,
      facts: topic.facts,
      conditionC: {
        content: rawC,
        claimsCount: claimC.type1UnbackedCount !== undefined ? claimC.type1UnbackedCount : claimC.unbackedClaimsCount,
        claims: claimC.type1UnbackedClaims || claimC.unbackedClaims,
        scores: judgeC,
        wordCount: rawC.split(/\s+/).length,
        charLength: rawC.length
      },
      conditionCPlus: {
        content: finalCPlus,
        corrected: cPlusRes.corrected,
        claimsCount: claimCPlus.type1UnbackedCount !== undefined ? claimCPlus.type1UnbackedCount : claimCPlus.unbackedClaimsCount,
        claims: claimCPlus.type1UnbackedClaims || claimCPlus.unbackedClaims,
        scores: judgeCPlus,
        wordCount: finalCPlus.split(/\s+/).length,
        charLength: finalCPlus.length
      },
      conditionB: {
        rawContent: bGen.rawContent,
        content: finalB,
        corrected: bRes.corrected,
        claimsFlaggedBefore: bRes.claimsFlaggedBefore || [],
        claimsCount: claimB.type1UnbackedCount !== undefined ? claimB.type1UnbackedCount : claimB.unbackedClaimsCount,
        claims: claimB.type1UnbackedClaims || claimB.unbackedClaims,
        scores: judgeB,
        wordCount: finalB.split(/\s+/).length,
        charLength: finalB.length
      }
    });

    console.log(`   -> C: ${claimC.type1UnbackedCount} claims | C+: ${claimCPlus.type1UnbackedCount} claims | B: ${claimB.type1UnbackedCount} claims`);
  }

  const outPath = path.resolve(__dirname, '../eval/facts-5-new-results.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`\n💾 Đã lưu kết quả 5 bài facts tại: ${outPath}`);
}

runTest().catch((err) => console.error('Lỗi khi chạy test 5 facts:', err));
