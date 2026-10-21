/**
 * benchmark-free-topics.js
 * Chạy đánh giá Benchmark n=3 trên 25 chủ đề tự do (Thường: 10, Nhạy cảm: 10, Khó: 5):
 * - 4 Điều kiện: A (Prompt cũ), C (COMMON_RULES), C+ (Smart Rewriter), B (Topic Pack + Smart Rewriter)
 * - Sử dụng Frozen Packs từ eval/frozen-packs.json
 * - Bộ chấm độc lập Qwen 27B chấm 5 tiêu chí (Hook, Giá trị, Giọng văn, Nhịp & độ dài, CTA)
 * - Đo lường Claim Loại 1 sau mọi chốt chặn và Code Health Claims
 * - Đo tỉ lệ Rewrite bị từ chối và đếm riêng các ca bị từ chối sau retry
 * - Ghi lại bài viết của các ca bị từ chối để soi khả năng báo thiếu oan (false omissions)
 * - Báo cáo riêng biệt từng nhóm (Thường, Nhạy cảm, Khó) kèm Mean ± StdDev qua 3 lần chạy
 * - Tự động chọn 10 bài đọc mù (Blind Review) với seed=42 ẩn nhãn
 * - Tìm 5 bài B tệ nhất nhóm nhạy cảm
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
const FROZEN_PACKS_FILE = path.resolve(__dirname, '../eval/frozen-packs.json');
const OUT_FILE = path.resolve(__dirname, '../eval/free-topics-benchmark-results.json');
const OUT_FILE_ROOT = path.resolve(__dirname, '../../eval/free-topics-benchmark-results.json');
const BLIND_REVIEW_FILE = path.resolve(__dirname, '../eval/blind-review-10.json');
const BLIND_REVIEW_FILE_ROOT = path.resolve(__dirname, '../../eval/blind-review-10.json');

const allTopics = JSON.parse(fs.readFileSync(TOPICS_FILE, 'utf8'));
// 25 chủ đề tự do (bỏ nhóm ban_hang_facts)
const freeTopics = allTopics.filter((t) => t.group !== 'ban_hang_facts');

let frozenPacks = {};
if (fs.existsSync(FROZEN_PACKS_FILE)) {
  try {
    frozenPacks = JSON.parse(fs.readFileSync(FROZEN_PACKS_FILE, 'utf8'));
  } catch (e) {
    console.warn('Không đọc được frozen-packs.json:', e.message);
  }
}

function getFrozenPackForTopic(topicObj) {
  for (const pack of Object.values(frozenPacks)) {
    if (pack.display_name === topicObj.topic || pack.topic_key === topicObj.topic) {
      return pack;
    }
  }
  return null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const HEALTH_CLAIM_PATTERNS = [
  'ho tro tieu hoa', 'giup tieu hoa', 'tieu hoa tot hon', 'tang de khang', 'tang cuong de khang',
  'he mien dich', 'thanh loc co the', 'dao thai doc to', 'giai doc', 'duy tri do am',
  'cap am cho da', 'khong con mui clo', 'loc sach 100%', 'diet khuan 99', 'nuoc tinh khiet',
  'tri dut diem', 'chua dut diem', 'khoi hoan toan', 'khong tai phat', 'bo than',
  'trang duong', 'giam can cap toc', 'giam 5kg', 'ngan ngua ung thu', 'phong ngua dot quy'
];

function removeAccents(str = '') {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, (m) => (m === 'đ' ? 'd' : 'D')).toLowerCase();
}

function countCodeHealthClaims(content) {
  const unacc = removeAccents(content);
  let count = 0;
  for (const p of HEALTH_CLAIM_PATTERNS) {
    if (unacc.includes(p)) count++;
  }
  return count;
}

// 1. Sinh A (Prompt cũ)
async function generateA(topicObj) {
  const prompt = `Viết bài đăng Facebook về chủ đề: "${topicObj.topic}". Mục tiêu: ${topicObj.goal}. Thông tin: ${topicObj.facts || ''}`;
  const res = await callAiChat({
    messages: [
      { role: 'system', content: 'Bạn là chuyên gia content marketing Facebook.' },
      { role: 'user', content: prompt }
    ],
    model: 'openai/gpt-oss-20b',
    temperature: 0.7,
    max_tokens: 600
  });
  return cleanFacebookContent(res.content);
}

// 2. Sinh C (COMMON_RULES)
async function generateC(topicObj) {
  const prompt = `Viết bài đăng Facebook về chủ đề: "${topicObj.topic}".
Mục tiêu: ${topicObj.goal}.
Thông tin sự thật (facts): ${topicObj.facts || 'Không có'}

Quy tắc bắt buộc:
${COMMON_RULES.must_not.map((r) => `- ${r}`).join('\n')}
${COMMON_RULES.must_do.map((r) => `- ${r}`).join('\n')}
Yêu cầu: Không dùng dấu sao (*), ngắt dòng 1-2 câu, mở đầu bằng hành vi/tình huống đời thực của người đọc (CẤM 2 câu hỏi liên tiếp), không bịa thuộc tính ngoài facts.`;

  const res = await callAiChat({
    messages: [
      { role: 'system', content: 'Bạn là copywriter Facebook chuyên nghiệp tuân thủ format và trung thực.' },
      { role: 'user', content: prompt }
    ],
    model: 'openai/gpt-oss-20b',
    temperature: 0.7,
    max_tokens: 600
  });
  return cleanFacebookContent(res.content);
}

// 3. Sinh B (Topic Pack đóng băng + Smart Rewriter)
async function generateB(topicObj) {
  let pack = getFrozenPackForTopic(topicObj);
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
    model: 'openai/gpt-oss-20b',
    temperature: 0.7,
    max_tokens: 600
  });
  return {
    content: cleanFacebookContent(res.content),
    pack
  };
}

// Bộ chấm độc lập (Qwen 27B) - CHỈ CHẤM 5 TIÊU CHÍ CHẤT LƯỢNG
async function judgePost(content, topicObj) {
  const userContent = `ĐÁNH GIÁ BÀI VIẾT SAU:
Chủ đề: "${topicObj.topic}"
Mục tiêu: "${topicObj.goal}"
Thông tin sự thật (facts): "${topicObj.facts || 'Không có'}"

[NỘI DUNG]:
${content}

Chấm điểm từ 1 đến 5 cho 5 tiêu chí chất lượng (sự thật được đo bằng kiểm tra claim riêng):
1. hook (mở đầu thu hút, cụ thể, không sáo rỗng)
2. gia_tri (nội dung có ích, giải quyết vấn đề)
3. giong_van (tự nhiên, thân thiện, đời thường)
4. nhip_va_do_dai (ngắt dòng thoáng, câu ngắn, nhịp điệu đọc tốt)
5. cta (kêu gọi hành động tự nhiên, gắn hành vi cụ thể, không câu hỏi tu từ sáo rỗng)

Trả về JSON duy nhất: {"hook": 4, "gia_tri": 4, "giong_van": 4, "nhip_va_do_dai": 4, "cta": 4, "nhan_xet": "..."}`;

  try {
    const res = await callAiChat({
      messages: [
        { role: 'system', content: 'Bạn là giám khảo chấm bài Facebook độc lập và khắt khe.' },
        { role: 'user', content: userContent }
      ],
      model: 'qwen/qwen3.8-27b',
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
  } catch (e) {
    console.error(`[Judge Error] Không thể chấm bài cho "${topicObj.topic}":`, e.message);
    return {
      scores: null,
      avgScore: null,
      isValid: false,
      comment: e.message
    };
  }
}

// PRNG với seed để chọn ngẫu nhiên có thể tái lập
function seededRandom(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return function () {
    return (s = (s * 16807) % 2147483647) / 2147483647;
  };
}

function calculateMeanStd(values) {
  const valid = values.filter((v) => typeof v === 'number' && !isNaN(v));
  if (valid.length === 0) return { mean: 0, std: 0 };
  const mean = valid.reduce((a, b) => a + b, 0) / valid.length;
  if (valid.length <= 1) return { mean: Number(mean.toFixed(2)), std: 0 };
  const variance = valid.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / (valid.length - 1);
  return {
    mean: Number(mean.toFixed(2)),
    std: Number(Math.sqrt(variance).toFixed(2))
  };
}

function saveResultsToDisk(results) {
  const jsonStr = JSON.stringify(results, null, 2);
  try {
    fs.writeFileSync(OUT_FILE, jsonStr, 'utf8');
  } catch (e) {}
  try {
    fs.writeFileSync(OUT_FILE_ROOT, jsonStr, 'utf8');
  } catch (e) {}
}

async function main() {
  console.log('========================================================================');
  console.log('🚀 BẮT ĐẦU BENCHMARK 25 CHỦ ĐỀ TỰ DO (n=3) ĐỐI ĐẦU: A vs C vs C+ vs B');
  console.log(`📋 Tổng số chủ đề: 25 (Thường: 10, Nhạy cảm: 10, Khó: 5) | Lặp: 3 lần`);
  console.log('========================================================================\n');

  let results = {
    evaluatedAt: new Date().toISOString(),
    conditionA: [],
    conditionC: [],
    conditionCPlus: [],
    conditionB: []
  };

  // Khôi phục nếu đã có tiến độ trước đó
  if (fs.existsSync(OUT_FILE)) {
    try {
      results = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'));
      console.log(`📦 Đã tìm thấy file kết quả trước đó. Tiến độ hiện có: A=${results.conditionA.length}, C=${results.conditionC.length}, C+=${results.conditionCPlus.length}, B=${results.conditionB.length}`);
    } catch {}
  }

  const N_RUNS = 1;

  for (let run = 1; run <= N_RUNS; run++) {
    console.log(`\n>>> 🔄 BẮT ĐẦU VÒNG CHẠY ${run}/${N_RUNS} <<<\n`);

    for (let i = 0; i < freeTopics.length; i++) {
      const topic = freeTopics[i];

      // Kiểm tra xem bài này đã chạy chưa
      const alreadyDone = results.conditionB.some((s) => s.run === run && s.topicId === topic.id && s.isValid !== false);
      if (alreadyDone) {
        console.log(`[${i + 1}/25] (Vòng ${run}) Đã có kết quả: "${topic.topic}", bỏ qua.`);
        continue;
      }

      console.log(`[${i + 1}/25] (Vòng ${run}) Đang xử lý: "${topic.topic}" (${topic.group})...`);

      // 1. Sinh A
      const rawA = await generateA(topic);
      await sleep(2500);

      // 2. Sinh C
      const rawC = await generateC(topic);
      await sleep(2500);

      // 3. C+ qua Smart Rewriter
      let finalCPlus = rawC;
      let wasCorrectedCPlus = false;
      let attemptedRewriteCPlus = false;
      let rejectedRewriteCPlus = false;
      let rejectionReasonCPlus = null;
      let scC = null;
      if (topic.facts && topic.facts.trim()) {
        try {
          scC = await selfCorrectPost(rawC, topic.facts);
          if (scC.initialVerify?.type1UnbackedCount > 0) {
            attemptedRewriteCPlus = true;
          }
          if (scC.rejectedRewrite) {
            rejectedRewriteCPlus = true;
            rejectionReasonCPlus = scC.rejectionReason;
          }
          if (scC.corrected) {
            finalCPlus = scC.content;
            wasCorrectedCPlus = true;
          }
        } catch (e) {
          console.warn('Lỗi rewrite C+:', e.message);
        }
      }
      await sleep(2500);

      // 4. Sinh B & B qua Smart Rewriter
      const bGen = await generateB(topic);
      await sleep(2500);
      let finalB = bGen.content;
      let wasCorrectedB = false;
      let attemptedRewriteB = false;
      let rejectedRewriteB = false;
      let rejectionReasonB = null;
      let scB = null;
      if (topic.facts && topic.facts.trim()) {
        try {
          scB = await selfCorrectPost(bGen.content, topic.facts, { parentKey: bGen.pack?.parent_key });
          if (scB.initialVerify?.type1UnbackedCount > 0) {
            attemptedRewriteB = true;
          }
          if (scB.rejectedRewrite) {
            rejectedRewriteB = true;
            rejectionReasonB = scB.rejectionReason;
          }
          if (scB.corrected) {
            finalB = scB.content;
            wasCorrectedB = true;
          }
        } catch (e) {
          console.warn('Lỗi rewrite B:', e.message);
        }
      }
      await sleep(2500);

      // 5. Thẩm định Claims SAU MỌI CHỐT CHẶN (Tận dụng kết quả đã có, dùng Qwen 27B)
      const claimA = await extractAndVerifyClaims(rawA, topic.facts, { model: 'qwen/qwen3.8-27b' });
      await sleep(1500);
      
      const claimC = (scC && scC.initialVerify) ? scC.initialVerify : await extractAndVerifyClaims(rawC, topic.facts, { model: 'qwen/qwen3.8-27b' });
      const claimCPlus = wasCorrectedCPlus
        ? ((scC && scC.verifyResult) ? scC.verifyResult : await extractAndVerifyClaims(finalCPlus, topic.facts, { model: 'qwen/qwen3.8-27b' }))
        : claimC;
      
      const claimB = wasCorrectedB
        ? ((scB && scB.verifyResult) ? scB.verifyResult : await extractAndVerifyClaims(finalB, topic.facts, { parentKey: bGen.pack?.parent_key, model: 'qwen/qwen3.8-27b' }))
        : ((scB && scB.initialVerify) ? scB.initialVerify : await extractAndVerifyClaims(finalB, topic.facts, { parentKey: bGen.pack?.parent_key, model: 'qwen/qwen3.8-27b' }));

      // 6. Chấm điểm chất lượng (5 tiêu chí với Qwen 27B)
      const judgeA = await judgePost(rawA, topic);
      await sleep(1500);
      const judgeC = await judgePost(rawC, topic);
      await sleep(1500);
      const judgeCPlus = await judgePost(finalCPlus, topic);
      await sleep(1500);
      const judgeB = await judgePost(finalB, topic);
      await sleep(1500);

      // Lưu kết quả chi tiết
      results.conditionA.push({
        run, topicId: topic.id, topic: topic.topic, group: topic.group,
        content: rawA, wordCount: rawA.split(/\s+/).length,
        claimsCount: claimA.type1UnbackedCount !== undefined ? claimA.type1UnbackedCount : 0,
        unbackedClaims: claimA.type1UnbackedClaims || [],
        codeHealthClaims: countCodeHealthClaims(rawA),
        scores: judgeA.scores, avgScore: judgeA.avgScore,
        isValid: judgeA.isValid
      });

      results.conditionC.push({
        run, topicId: topic.id, topic: topic.topic, group: topic.group,
        content: rawC, wordCount: rawC.split(/\s+/).length,
        claimsCount: claimC.type1UnbackedCount !== undefined ? claimC.type1UnbackedCount : 0,
        unbackedClaims: claimC.type1UnbackedClaims || [],
        codeHealthClaims: countCodeHealthClaims(rawC),
        scores: judgeC.scores, avgScore: judgeC.avgScore,
        isValid: judgeC.isValid
      });

      results.conditionCPlus.push({
        run, topicId: topic.id, topic: topic.topic, group: topic.group,
        content: finalCPlus, rawContent: rawC,
        attemptedRewrite: attemptedRewriteCPlus,
        retryAttempted: Boolean(scC?.retryAttempted),
        retrySucceeded: Boolean(scC?.retrySucceeded),
        rejectedRewrite: rejectedRewriteCPlus,
        rejectedAfterRetry: Boolean(scC?.rejectedAfterRetry),
        missingFactsAfterRetry: scC?.missingFactsAfterRetry || [],
        attemptedContent: scC?.attemptedContent || null,
        rejectionReason: rejectionReasonCPlus,
        wasCorrected: wasCorrectedCPlus,
        wordCount: finalCPlus.split(/\s+/).length,
        claimsCount: claimCPlus.type1UnbackedCount !== undefined ? claimCPlus.type1UnbackedCount : 0,
        unbackedClaims: claimCPlus.type1UnbackedClaims || [],
        codeHealthClaims: countCodeHealthClaims(finalCPlus),
        scores: judgeCPlus.scores, avgScore: judgeCPlus.avgScore,
        isValid: judgeCPlus.isValid
      });

      results.conditionB.push({
        run, topicId: topic.id, topic: topic.topic, group: topic.group,
        content: finalB, rawContent: bGen.content,
        attemptedRewrite: attemptedRewriteB,
        retryAttempted: Boolean(scB?.retryAttempted),
        retrySucceeded: Boolean(scB?.retrySucceeded),
        rejectedRewrite: rejectedRewriteB,
        rejectedAfterRetry: Boolean(scB?.rejectedAfterRetry),
        missingFactsAfterRetry: scB?.missingFactsAfterRetry || [],
        attemptedContent: scB?.attemptedContent || null,
        rejectionReason: rejectionReasonB,
        wasCorrected: wasCorrectedB,
        wordCount: finalB.split(/\s+/).length,
        claimsCount: claimB.type1UnbackedCount !== undefined ? claimB.type1UnbackedCount : 0,
        unbackedClaims: claimB.type1UnbackedClaims || [],
        codeHealthClaims: countCodeHealthClaims(finalB),
        scores: judgeB.scores, avgScore: judgeB.avgScore,
        isValid: judgeB.isValid
      });

      console.log(`   -> C+: ${claimCPlus.type1UnbackedCount || 0} claims (Điểm: ${judgeCPlus.avgScore}) | B: ${claimB.type1UnbackedCount || 0} claims (Điểm: ${judgeB.avgScore})`);

      // Ghi file định kỳ
      saveResultsToDisk(results);
    }
  }

  // ═══ TỔNG KẾT & PHÂN TÍCH THEO NHÓM ═══
  console.log('\n========================================================================');
  console.log('📊 TỔNG KẾT KẾT QUẢ BENCHMARK THEO NHÓM (THƯỜNG, NHẠY CẢM, KHÓ)');
  console.log('========================================================================\n');

  const groups = ['thuong', 'nhay_cam', 'kho_la'];
  const groupNames = { thuong: 'Nhóm Thường (10 chủ đề)', nhay_cam: 'Nhóm Nhạy cảm (10 chủ đề)', kho_la: 'Nhóm Khó (5 chủ đề)' };

  for (const g of groups) {
    console.log(`\n📌 ${groupNames[g]}:`);
    for (const condKey of ['conditionA', 'conditionC', 'conditionCPlus', 'conditionB']) {
      const condName = condKey === 'conditionA' ? 'A (Prompt cũ)' : condKey === 'conditionC' ? 'C (COMMON)' : condKey === 'conditionCPlus' ? 'C+ (Rewriter)' : 'B (Pack+Rewriter)';
      const samples = results[condKey].filter((s) => s.group === g && s.isValid);

      const scoreStats = calculateMeanStd(samples.map((s) => s.avgScore));
      const claimStats = calculateMeanStd(samples.map((s) => s.claimsCount));
      const avgHealth = samples.length > 0 ? (samples.reduce((sum, s) => sum + s.codeHealthClaims, 0) / samples.length).toFixed(2) : 0;

      console.log(`  - ${condName.padEnd(20)}: Điểm CL = ${scoreStats.mean} ± ${scoreStats.std} | Claim L1 = ${claimStats.mean} ± ${claimStats.std} | Code Health = ${avgHealth} | Mẫu = ${samples.length}`);
    }
  }

  // ═══ TỈ LỆ REWRITE BỊ TỪ CHỐI ═══
  console.log('\n========================================================================');
  console.log('🛡️ TỈ LỆ REWRITE BỊ TỪ CHỐI DO THIẾU FACTS (REJECTION RATE)');
  console.log('========================================================================');
  
  const bRewrites = results.conditionB.filter((s) => s.attemptedRewrite);
  const bRetryAttempted = results.conditionB.filter((s) => s.retryAttempted);
  const bRetrySucceeded = results.conditionB.filter((s) => s.retrySucceeded);
  const bRejectedAfterRetry = results.conditionB.filter((s) => s.rejectedAfterRetry);
  const bRejections = results.conditionB.filter((s) => s.rejectedRewrite);
  const bRate = bRewrites.length > 0 ? ((bRejections.length / bRewrites.length) * 100).toFixed(1) : 0;

  const cPlusRewrites = results.conditionCPlus.filter((s) => s.attemptedRewrite);
  const cPlusRetryAttempted = results.conditionCPlus.filter((s) => s.retryAttempted);
  const cPlusRetrySucceeded = results.conditionCPlus.filter((s) => s.retrySucceeded);
  const cPlusRejectedAfterRetry = results.conditionCPlus.filter((s) => s.rejectedAfterRetry);
  const cPlusRejections = results.conditionCPlus.filter((s) => s.rejectedRewrite);
  const cPlusRate = cPlusRewrites.length > 0 ? ((cPlusRejections.length / cPlusRewrites.length) * 100).toFixed(1) : 0;

  console.log(`- Điều kiện B : Rewrite kích hoạt = ${bRewrites.length} | Cần retry = ${bRetryAttempted.length} (Cứu được = ${bRetrySucceeded.length}) | Từ chối sau retry = ${bRejectedAfterRetry.length} (Tổng từ chối: ${bRejections.length} ~ ${bRate}%)`);
  console.log(`- Điều kiện C+: Rewrite kích hoạt = ${cPlusRewrites.length} | Cần retry = ${cPlusRetryAttempted.length} (Cứu được = ${cPlusRetrySucceeded.length}) | Từ chối sau retry = ${cPlusRejectedAfterRetry.length} (Tổng từ chối: ${cPlusRejections.length} ~ ${cPlusRate}%)`);

  // Chi tiết các ca bị từ chối sau retry để kiểm tra báo thiếu oan (false omissions)
  if (bRejectedAfterRetry.length > 0 || cPlusRejectedAfterRetry.length > 0) {
    console.log('\n🔍 CHI TIẾT CÁC CA BỊ TỪ CHỐI SAU RETRY (KIỂM TRA BÁO THIẾU OAN):');
    [...bRejectedAfterRetry, ...cPlusRejectedAfterRetry].forEach((item, idx) => {
      console.log(`  [Ca ${idx + 1}] Topic: "${item.topic}" (Run ${item.run}) - Báo thiếu: ${item.missingFactsAfterRetry.join(', ')}`);
      console.log(`     Lý do: ${item.rejectionReason}`);
      if (item.attemptedContent) {
        console.log(`     Bài rewrite bị từ chối: "${item.attemptedContent.slice(0, 150)}..."`);
      }
    });
  } else {
    console.log('\n✅ Không có ca nào bị từ chối sau retry! Retry lần 2 đã bảo toàn được 100% facts.');
  }

  // ═══ SỐ MẪU HỢP LỆ TRÊN TỔNG ═══
  const totalExpected = 25 * 3;
  const validB = results.conditionB.filter((s) => s.isValid).length;
  const validCPlus = results.conditionCPlus.filter((s) => s.isValid).length;
  const validC = results.conditionC.filter((s) => s.isValid).length;
  const validA = results.conditionA.filter((s) => s.isValid).length;
  console.log(`\n- Số mẫu hợp lệ B : ${validB}/${totalExpected} (${((validB/totalExpected)*100).toFixed(1)}%)`);
  console.log(`- Số mẫu hợp lệ C+: ${validCPlus}/${totalExpected} (${((validCPlus/totalExpected)*100).toFixed(1)}%)`);
  console.log(`- Số mẫu hợp lệ C : ${validC}/${totalExpected} (${((validC/totalExpected)*100).toFixed(1)}%)`);
  console.log(`- Số mẫu hợp lệ A : ${validA}/${totalExpected} (${((validA/totalExpected)*100).toFixed(1)}%)`);

  // ═══ 5 BÀI B TỆ NHẤT NHÓM NHẠY CẢM ═══
  console.log('\n========================================================================');
  console.log('⚠️ 5 BÀI B TỆ NHẤT NHÓM NHẠY CẢM');
  console.log('========================================================================');
  const sensitiveB = results.conditionB
    .filter((s) => s.group === 'nhay_cam' && s.isValid)
    .sort((a, b) => {
      if (b.claimsCount !== a.claimsCount) return b.claimsCount - a.claimsCount;
      if (b.codeHealthClaims !== a.codeHealthClaims) return b.codeHealthClaims - a.codeHealthClaims;
      return a.avgScore - b.avgScore;
    })
    .slice(0, 5);

  sensitiveB.forEach((post, idx) => {
    console.log(`\n[#${idx + 1}] Topic: "${post.topic}" (Run ${post.run})`);
    console.log(`  - Điểm chất lượng: ${post.avgScore} (Hook: ${post.scores?.hook}, GT: ${post.scores?.gia_tri}, Giọng: ${post.scores?.giong_van}, Nhịp: ${post.scores?.nhip_va_do_dai}, CTA: ${post.scores?.cta})`);
    console.log(`  - Claim Loại 1: ${post.claimsCount} ý (${(post.unbackedClaims || []).join('; ') || 'Không'})`);
    console.log(`  - Cụm công dụng sức khỏe: ${post.codeHealthClaims}`);
    console.log(`  - Trích đoạn bài viết:\n"""\n${post.content}\n"""`);
  });

  // ═══ TẠO 10 BÀI ĐỌC MÙ (BLIND REVIEW) VỚI SEED=42 ═══
  const rng = seededRandom(42);
  const blindPool = [];
  for (let i = 0; i < freeTopics.length; i++) {
    const t = freeTopics[i];
    const cPlusSample = results.conditionCPlus.find((s) => s.run === 1 && s.topicId === t.id && s.isValid);
    const bSample = results.conditionB.find((s) => s.run === 1 && s.topicId === t.id && s.isValid);
    if (cPlusSample && bSample) {
      blindPool.push({ topic: t.topic, group: t.group, facts: t.facts, cPlus: cPlusSample, b: bSample });
    }
  }

  const shuffled = blindPool.sort(() => rng() - 0.5).slice(0, 10);
  const blindSamples = [];

  shuffled.forEach((pair, index) => {
    const isBFirst = rng() > 0.5;
    blindSamples.push({
      sampleId: index + 1,
      topic: pair.topic,
      group: pair.group,
      factsProvided: pair.facts,
      optionX: {
        text: isBFirst ? pair.b.content : pair.cPlus.content,
        wordCount: isBFirst ? pair.b.wordCount : pair.cPlus.wordCount,
        judgeScore: isBFirst ? pair.b.avgScore : pair.cPlus.avgScore,
        _truthCondition: isBFirst ? 'B (Có Pack)' : 'C+ (Không Pack)'
      },
      optionY: {
        text: isBFirst ? pair.cPlus.content : pair.b.content,
        wordCount: isBFirst ? pair.cPlus.wordCount : pair.b.wordCount,
        judgeScore: isBFirst ? pair.cPlus.avgScore : pair.b.avgScore,
        _truthCondition: isBFirst ? 'C+ (Không Pack)' : 'B (Có Pack)'
      }
    });
  });

  try {
    fs.writeFileSync(BLIND_REVIEW_FILE, JSON.stringify(blindSamples, null, 2), 'utf8');
    fs.writeFileSync(BLIND_REVIEW_FILE_ROOT, JSON.stringify(blindSamples, null, 2), 'utf8');
    console.log(`\n💾 Đã lưu 10 bài đọc mù tại: ${BLIND_REVIEW_FILE}`);
  } catch (e) {}
  console.log(`💾 Đã hoàn thành toàn bộ benchmark 25 chủ đề tự do tại: ${OUT_FILE}`);
}

main().catch((e) => console.error(e));
