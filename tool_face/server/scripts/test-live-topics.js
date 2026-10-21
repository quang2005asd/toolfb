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

// Dùng model 20B để không bị trần TPD 200k của 120B
const MODEL = 'openai/gpt-oss-20b';

async function generateA(topicObj) {
  const prompt = `Viết bài đăng Facebook về chủ đề: "${topicObj.topic}". Mục tiêu: ${topicObj.goal}. Thông tin: ${topicObj.facts || ''}`;
  const res = await callAiChat({
    messages: [
      { role: 'system', content: 'Bạn là chuyên gia content marketing Facebook.' },
      { role: 'user', content: prompt }
    ],
    model: MODEL,
    temperature: 0.7,
    max_tokens: 450
  });
  return cleanFacebookContent(res.content);
}

async function generateC(topicObj) {
  const prompt = `Viết bài đăng Facebook về chủ đề: "${topicObj.topic}".
Mục tiêu: ${topicObj.goal}.
Thông tin sự thật (facts): ${topicObj.facts || 'Không có'}

Quy tắc bắt buộc:
${COMMON_RULES.must_not.map((r) => `- ${r}`).join('\n')}
${COMMON_RULES.must_do.map((r) => `- ${r}`).join('\n')}
Yêu cầu: Không dùng dấu sao (*), ngắt dòng 1-2 câu, mở đầu bằng hành vi/tình huống đời thực của người đọc, không bịa thuộc tính ngoài facts.`;

  const res = await callAiChat({
    messages: [
      { role: 'system', content: 'Bạn là copywriter Facebook chuyên nghiệp tuân thủ format và trung thực.' },
      { role: 'user', content: prompt }
    ],
    model: MODEL,
    temperature: 0.7,
    max_tokens: 450
  });
  return cleanFacebookContent(res.content);
}

async function generateB(topicObj) {
  const resolved = await resolveTopicPack(topicObj.topic);
  const pack = resolved.pack;
  const mergedRules = mergeRules(pack, { hasFacts: Boolean(topicObj.facts) });

  const prompt = `Viết bài đăng Facebook về chủ đề: "${topicObj.topic}".
Mục tiêu: ${topicObj.goal}.
Thông tin sự thật (facts): ${topicObj.facts || 'Không có'}

Áp dụng tiêu chuẩn Topic Pack:
- Góc nhìn: ${(pack.angles || []).slice(0, 2).join(' / ')}
- Phong cách: ${pack.style_defaults?.hook_style || 'Hình ảnh đời thực cụ thể'}, tone ${pack.style_defaults?.tone || 'chân thành, hữu ích'}.
Quy tắc cấm (must_not):
${mergedRules.must_not.map((r) => `- ${r}`).join('\n')}
Quy tắc phải làm (must_do):
${mergedRules.must_do.map((r) => `- ${r}`).join('\n')}
Yêu cầu: Tuyệt đối không dùng dấu sao (*), ngắt dòng 1-2 câu, mở đầu bằng hành vi sinh hoạt đời thường của người đọc, chỉ dùng facts.`;

  const res = await callAiChat({
    messages: [
      { role: 'system', content: 'Bạn là bậc thầy Copywriter mạng xã hội, am hiểu tâm lý người đọc Facebook.' },
      { role: 'user', content: prompt }
    ],
    model: MODEL,
    temperature: 0.7,
    max_tokens: 450
  });
  return { content: cleanFacebookContent(res.content), pack };
}

async function judge(content, topicObj) {
  const userContent = `ĐÁNH GIÁ BÀI VIẾT SAU:
Chủ đề: "${topicObj.topic}"
Mục tiêu: "${topicObj.goal}"
Thông tin sự thật: "${topicObj.facts || 'Không có'}"

[NỘI DUNG]:
${content}

Chấm điểm 1 đến 5 cho 5 tiêu chí:
1. hook
2. gia_tri
3. giong_van
4. nhip_va_do_dai
5. cta

Trả về JSON duy nhất: {"hook": 4, "gia_tri": 4, "giong_van": 4, "nhip_va_do_dai": 4, "cta": 4, "nhan_xet": "..."}`;

  try {
    const res = await callAiChat({
      messages: [
        { role: 'system', content: 'Bạn là giám khảo chấm bài Facebook độc lập và khắt khe.' },
        { role: 'user', content: userContent }
      ],
      model: MODEL,
      temperature: 0.1,
      max_tokens: 350
    });
    const cleaned = res.content.replace(/```json/gi, '').replace(/```/g, '').trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match ? match[0] : cleaned);
    const scores = {
      hook: Number(parsed.hook) || 3,
      gia_tri: Number(parsed.gia_tri) || 3,
      giong_van: Number(parsed.giong_van) || 3,
      nhip_va_do_dai: Number(parsed.nhip_va_do_dai) || 3,
      cta: Number(parsed.cta) || 3
    };
    const avgScore = Number(((scores.hook + scores.gia_tri + scores.giong_van + scores.nhip_va_do_dai + scores.cta) / 5).toFixed(2));
    return { scores, avgScore, comment: parsed.nhan_xet || '' };
  } catch(e) {
    return { scores: { hook: 3, gia_tri: 3, giong_van: 3, nhip_va_do_dai: 3, cta: 3 }, avgScore: 3.0, comment: e.message };
  }
}

async function runTopicLive(topicId) {
  const topic = allTopics.find(t => t.id === topicId);
  console.log('========================================================================');
  console.log(`🌿 ĐANG CHẠY TEST TRỰC TIẾP CHỦ ĐỀ #${topic.id}: "${topic.topic.toUpperCase()}" (${topic.group})`);
  console.log(`🎯 Mục tiêu: ${topic.goal}`);
  console.log(`📌 Facts bắt buộc: ${topic.facts || 'Không có facts'}`);
  console.log('========================================================================\n');

  // 1. SINH A
  console.log('>>> [1/4] ĐANG SINH ĐIỀU KIỆN A (Prompt Cũ)...');
  const rawA = await generateA(topic);
  const claimA = await extractAndVerifyClaims(rawA, topic.facts, { model: MODEL });
  const judgeA = await judge(rawA, topic);
  console.log('\n--- [NỘI DUNG BẢN A] ---');
  console.log(rawA);
  console.log(`\n⚖️ KẾT QUẢ A: Claims bị bắt = ${claimA.type1UnbackedCount} | Điểm Judge = ${judgeA.avgScore}/5`);
  if (claimA.type1UnbackedClaims?.length) console.log('❌ Claims vi phạm:', claimA.type1UnbackedClaims);
  console.log('------------------------------------------------------------------------\n');

  // 2. SINH C
  console.log('>>> [2/4] ĐANG SINH ĐIỀU KIỆN C (Common Rules)...');
  const rawC = await generateC(topic);
  const claimC = await extractAndVerifyClaims(rawC, topic.facts, { model: MODEL });
  const judgeC = await judge(rawC, topic);
  console.log('\n--- [NỘI DUNG BẢN C] ---');
  console.log(rawC);
  console.log(`\n⚖️ KẾT QUẢ C: Claims bị bắt = ${claimC.type1UnbackedCount} | Điểm Judge = ${judgeC.avgScore}/5`);
  if (claimC.type1UnbackedClaims?.length) console.log('❌ Claims vi phạm:', claimC.type1UnbackedClaims);
  console.log('------------------------------------------------------------------------\n');

  // 3. SINH C+ (Smart Rewriter)
  console.log('>>> [3/4] ĐANG THẨM ĐỊNH VÀ REWRITE C+ (Smart Rewriter)...');
  let finalCPlus = rawC;
  if (topic.facts && topic.facts.trim()) {
    try {
      const scC = await selfCorrectPost(rawC, topic.facts);
      if (scC.corrected) finalCPlus = scC.content;
    } catch(e) {}
  }
  const claimCPlus = await extractAndVerifyClaims(finalCPlus, topic.facts, { model: MODEL });
  const judgeCPlus = await judge(finalCPlus, topic);
  console.log('\n--- [NỘI DUNG BẢN C+] ---');
  console.log(finalCPlus);
  console.log(`\n⚖️ KẾT QUẢ C+: Claims bị bắt = ${claimCPlus.type1UnbackedCount} | Điểm Judge = ${judgeCPlus.avgScore}/5`);
  console.log('------------------------------------------------------------------------\n');

  // 4. SINH B (Topic Pack + Smart Rewriter)
  console.log('>>> [4/4] ĐANG SINH ĐIỀU KIỆN B (Topic Pack + Smart Rewriter)...');
  const bGen = await generateB(topic);
  let finalB = bGen.content;
  if (topic.facts && topic.facts.trim()) {
    try {
      const scB = await selfCorrectPost(bGen.content, topic.facts, { parentKey: bGen.pack?.parent_key });
      if (scB.corrected) finalB = scB.content;
    } catch(e) {}
  }
  const claimB = await extractAndVerifyClaims(finalB, topic.facts, { model: MODEL });
  const judgeB = await judge(finalB, topic);
  console.log('\n--- [NỘI DUNG BẢN B] ---');
  console.log(finalB);
  console.log(`\n⚖️ KẾT QUẢ B: Claims bị bắt = ${claimB.type1UnbackedCount} | Điểm Judge = ${judgeB.avgScore}/5`);
  if (claimB.type1UnbackedClaims?.length) console.log('❌ Claims vi phạm B:', claimB.type1UnbackedClaims);
  console.log('------------------------------------------------------------------------\n');

  // BẢNG ĐỐI ĐẦU TỔNG HỢP
  console.log(`📊 TỔNG HỢP SO SÁNH BÀI #${topic.id}: "${topic.topic}"`);
  console.log(`- Điều kiện A : ${claimA.type1UnbackedCount} claims unbacked | Điểm: ${judgeA.avgScore}`);
  console.log(`- Điều kiện C : ${claimC.type1UnbackedCount} claims unbacked | Điểm: ${judgeC.avgScore}`);
  console.log(`- Điều kiện C+: ${claimCPlus.type1UnbackedCount} claims unbacked | Điểm: ${judgeCPlus.avgScore}`);
  console.log(`- Điều kiện B : ${claimB.type1UnbackedCount} claims unbacked | Điểm: ${judgeB.avgScore}`);
  console.log('========================================================================\n');
}

async function main() {
  await runTopicLive(5); // Bài 5: Trồng rau ban công
  await runTopicLive(6); // Bài 6: Chọn laptop cho sinh viên
}

main().catch(console.error);
