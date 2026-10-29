const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const { callAiChat } = require('../src/utils/AiClientService');
const topicPackService = require('../src/utils/TopicPackService');
const { cleanFacebookContent } = require('../src/utils/AiContentGenerator');
const { extractAndVerifyClaims, selfCorrectPost } = require('../src/utils/ClaimExtractor');
const { resolveTopicPack, mergeRules, COMMON_RULES } = topicPackService;

const TOPICS_FILE = path.resolve(__dirname, '../eval/topics.json');
const FROZEN_PACKS_FILE = path.resolve(__dirname, '../eval/frozen-packs.json');
const OUT_FILE = path.resolve(__dirname, '../eval/free-topics-benchmark-results.json');
const OUT_FILE_ROOT = path.resolve(__dirname, '../../eval/free-topics-benchmark-results.json');

const allTopics = JSON.parse(fs.readFileSync(TOPICS_FILE, 'utf8'));
const freeTopics = allTopics.filter((t) => t.group !== 'ban_hang_facts');

let frozenPacks = {};
if (fs.existsSync(FROZEN_PACKS_FILE)) {
  try {
    frozenPacks = JSON.parse(fs.readFileSync(FROZEN_PACKS_FILE, 'utf8'));
  } catch (e) {}
}

const MODEL = 'openai/gpt-oss-20b';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
  let pack = frozenPacks[topicObj.topic] || frozenPacks[String(topicObj.id)];
  if (!pack) {
    const resolved = await resolveTopicPack(topicObj.topic);
    pack = resolved.pack;
  }
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

async function judgePost(content, topicObj) {
  const userContent = `ĐÁNH GIÁ BÀI VIẾT SAU:
Chủ đề: "${topicObj.topic}"
Mục tiêu: "${topicObj.goal}"
Thông tin sự thật: "${topicObj.facts || 'Không có'}"

[NỘI DUNG]:
${content}

Chấm điểm từ 1 đến 5 cho 5 tiêu chí:
1. hook
2. gia_tri
3. giong_van
4. nhip_va_do_dai
5. cta

Trả về JSON: {"hook": 4, "gia_tri": 4, "giong_van": 4, "nhip_va_do_dai": 4, "cta": 4, "nhan_xet": "..."}`;

  try {
    const res = await callAiChat({
      messages: [
        { role: 'system', content: 'Bạn là giám khảo chấm bài Facebook độc lập và khắt khe.' },
        { role: 'user', content: userContent }
      ],
      model: MODEL,
      temperature: 0.1,
      max_tokens: 300
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
    return { scores, avgScore, isValid: true, comment: parsed.nhan_xet || '' };
  } catch(e) {
    return { scores: { hook: 3, gia_tri: 3, giong_van: 3, nhip_va_do_dai: 3, cta: 3 }, avgScore: 3.0, isValid: false, comment: e.message };
  }
}

async function runTopic(topicId, run = 1) {
  const topic = freeTopics.find(t => t.id === topicId) || allTopics.find(t => t.id === topicId);
  if (!topic) throw new Error(`Không tìm thấy topicId: ${topicId}`);

  console.log(`\n========================================================================`);
  console.log(`🚀 BẮT ĐẦU CHẠY CHỦ ĐỀ #${topic.id}: "${topic.topic.toUpperCase()}" (Vòng ${run}) [${topic.group}]`);
  console.log(`🎯 Mục tiêu: ${topic.goal}`);
  console.log(`📌 Facts: ${topic.facts || 'Không có facts'}`);
  console.log(`========================================================================\n`);

  // 1. Sinh A
  console.log('[1/4] Đang sinh A...');
  const rawA = await generateA(topic);
  await sleep(2500);

  // 2. Sinh C
  console.log('[2/4] Đang sinh C...');
  const rawC = await generateC(topic);
  await sleep(2500);

  // 3. C+ qua Smart Rewriter
  console.log('[3/4] Đang qua Smart Rewriter C+...');
  let finalCPlus = rawC;
  let scC = null;
  if (topic.facts && topic.facts.trim()) {
    try {
      scC = await selfCorrectPost(rawC, topic.facts, { model: MODEL });
      if (scC.corrected) finalCPlus = scC.content;
    } catch(e) {
      console.warn('Lỗi rewrite C+:', e.message);
    }
  }
  await sleep(2500);

  // 4. Sinh B & B qua Smart Rewriter
  console.log('[4/4] Đang sinh B & qua Smart Rewriter B...');
  const bGen = await generateB(topic);
  await sleep(2500);
  let finalB = bGen.content;
  let scB = null;
  if (topic.facts && topic.facts.trim()) {
    try {
      scB = await selfCorrectPost(bGen.content, topic.facts, { parentKey: bGen.pack?.parent_key, model: MODEL });
      if (scB.corrected) finalB = scB.content;
    } catch(e) {
      console.warn('Lỗi rewrite B:', e.message);
    }
  }
  await sleep(2500);

  // Thẩm định Claim
  console.log('🔍 Đang thẩm định Claims...');
  const claimA = await extractAndVerifyClaims(rawA, topic.facts, { model: MODEL });
  await sleep(2000);
  const claimC = await extractAndVerifyClaims(rawC, topic.facts, { model: MODEL });
  await sleep(2000);
  const claimCPlus = await extractAndVerifyClaims(finalCPlus, topic.facts, { model: MODEL });
  await sleep(2000);
  const claimB = await extractAndVerifyClaims(finalB, topic.facts, { parentKey: bGen.pack?.parent_key, model: MODEL });
  await sleep(2000);

  // Chấm điểm Judge
  console.log('⚖️ Đang chấm điểm 5 tiêu chí...');
  const judgeA = await judgePost(rawA, topic);
  await sleep(2000);
  const judgeC = await judgePost(rawC, topic);
  await sleep(2000);
  const judgeCPlus = await judgePost(finalCPlus, topic);
  await sleep(2000);
  const judgeB = await judgePost(finalB, topic);

  // Đọc và cập nhật file kết quả
  let results = { evaluatedAt: new Date().toISOString(), conditionA: [], conditionC: [], conditionCPlus: [], conditionB: [] };
  if (fs.existsSync(OUT_FILE)) {
    try {
      results = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'));
    } catch(e) {}
  }

  // Loại bỏ bản ghi cũ của topicId & run nếu đã có
  results.conditionA = (results.conditionA || []).filter(r => !(r.topicId === topic.id && r.run === run));
  results.conditionC = (results.conditionC || []).filter(r => !(r.topicId === topic.id && r.run === run));
  results.conditionCPlus = (results.conditionCPlus || []).filter(r => !(r.topicId === topic.id && r.run === run));
  results.conditionB = (results.conditionB || []).filter(r => !(r.topicId === topic.id && r.run === run));

  results.conditionA.push({
    run, topicId: topic.id, topic: topic.topic, group: topic.group,
    content: rawA, wordCount: rawA.split(/\s+/).length,
    claimsCount: claimA.type1UnbackedCount || 0,
    unbackedClaims: claimA.type1UnbackedClaims || [],
    scores: judgeA.scores, avgScore: judgeA.avgScore, isValid: judgeA.isValid
  });

  results.conditionC.push({
    run, topicId: topic.id, topic: topic.topic, group: topic.group,
    content: rawC, wordCount: rawC.split(/\s+/).length,
    claimsCount: claimC.type1UnbackedCount || 0,
    unbackedClaims: claimC.type1UnbackedClaims || [],
    scores: judgeC.scores, avgScore: judgeC.avgScore, isValid: judgeC.isValid
  });

  results.conditionCPlus.push({
    run, topicId: topic.id, topic: topic.topic, group: topic.group,
    content: finalCPlus, rawContent: rawC, wasCorrected: Boolean(scC?.corrected),
    wordCount: finalCPlus.split(/\s+/).length,
    claimsCount: claimCPlus.type1UnbackedCount || 0,
    unbackedClaims: claimCPlus.type1UnbackedClaims || [],
    scores: judgeCPlus.scores, avgScore: judgeCPlus.avgScore, isValid: judgeCPlus.isValid
  });

  results.conditionB.push({
    run, topicId: topic.id, topic: topic.topic, group: topic.group,
    content: finalB, rawContent: bGen.content, wasCorrected: Boolean(scB?.corrected),
    wordCount: finalB.split(/\s+/).length,
    claimsCount: claimB.type1UnbackedCount || 0,
    unbackedClaims: claimB.type1UnbackedClaims || [],
    scores: judgeB.scores, avgScore: judgeB.avgScore, isValid: judgeB.isValid
  });

  fs.writeFileSync(OUT_FILE, JSON.stringify(results, null, 2), 'utf8');
  if (fs.existsSync(path.dirname(OUT_FILE_ROOT))) {
    fs.writeFileSync(OUT_FILE_ROOT, JSON.stringify(results, null, 2), 'utf8');
  }

  // IN KẾT QUẢ TỔNG HỢP CỦA CHỦ ĐỀ
  console.log(`\n========================================================================`);
  console.log(`🏁 HOÀN TẤT CHỦ ĐỀ #${topic.id}: "${topic.topic.toUpperCase()}" (Vòng ${run})`);
  console.log(`------------------------------------------------------------------------`);
  console.log(`| Điều kiện | Điểm Judge (1-5) | Claims Loại 1 bị bắt | Trạng thái Facts |`);
  console.log(`| A (Prompt cũ)       | ${judgeA.avgScore.toFixed(2)}             | ${String(claimA.type1UnbackedCount).padEnd(21)} | ${claimA.type1UnbackedCount === 0 ? 'SẠCH' : 'VI PHẠM'} |`);
  console.log(`| C (Common Rules)    | ${judgeC.avgScore.toFixed(2)}             | ${String(claimC.type1UnbackedCount).padEnd(21)} | ${claimC.type1UnbackedCount === 0 ? 'SẠCH' : 'VI PHẠM'} |`);
  console.log(`| C+ (Smart Rewriter) | ${judgeCPlus.avgScore.toFixed(2)}             | ${String(claimCPlus.type1UnbackedCount).padEnd(21)} | ${claimCPlus.type1UnbackedCount === 0 ? 'SẠCH' : 'VI PHẠM'} |`);
  console.log(`| B (Topic Pack + RW) | ${judgeB.avgScore.toFixed(2)}             | ${String(claimB.type1UnbackedCount).padEnd(21)} | ${claimB.type1UnbackedCount === 0 ? 'SẠCH' : 'VI PHẠM'} |`);
  console.log(`========================================================================\n`);

  return { topic, run, judgeA, judgeC, judgeCPlus, judgeB, claimA, claimC, claimCPlus, claimB, rawA, rawC, finalCPlus, finalB };
}

const args = process.argv.slice(2);
const topicIdArg = parseInt(args[0], 10) || 5;
const runArg = parseInt(args[1], 10) || 1;

runTopic(topicIdArg, runArg).catch(console.error);
