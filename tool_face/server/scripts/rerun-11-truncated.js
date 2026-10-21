const fs = require('fs');
const path = require('path');
const { callAiChat } = require('../src/utils/AiClientService');
const { resolveTopicPack, mergeRules, COMMON_RULES } = require('../src/utils/TopicPackService');
const { extractAndVerifyClaims, selfCorrectPost } = require('../src/utils/ClaimExtractor');

const DATA_FILE = path.join(__dirname, '../eval/free-topics-benchmark-results.json');
const TOPICS_FILE = path.join(__dirname, '../eval/topics.json');

const TRUNCATED_IDS = [26, 28];

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function cleanFacebookContent(raw = '') {
  if (!raw) return '';
  return raw
    .replace(/^```[a-z]*\s*/i, '')
    .replace(/\s*```$/i, '')
    .replace(/\*{1,3}(.*?)\*{1,3}/g, '$1')
    .replace(/\*/g, '')
    .trim();
}

function isContentTruncated(text = '', finishReason = null) {
  if (!text) return true;
  const words = text.trim().split(/\s+/).length;
  const endsWithPunct = /[.!?…»”"\')]$/.test(text.trim());
  return words < 60 || finishReason === 'length' || !endsWithPunct;
}

// Sinh C với max_tokens=1400 và tự động retry 1 lần nếu cụt
async function generateCWithRetry(topicObj) {
  const prompt = `Viết bài đăng Facebook về chủ đề: "${topicObj.topic}".
Mục tiêu: ${topicObj.goal}.
Thông tin sự thật (facts): ${topicObj.facts || 'Không có'}

Quy tắc cấm (must_not):
${COMMON_RULES.must_not.map((r) => `- ${r}`).join('\n')}
Quy tắc phải làm (must_do):
${COMMON_RULES.must_do.map((r) => `- ${r}`).join('\n')}
Yêu cầu: Không dùng dấu sao (*), ngắt dòng 1-2 câu, mở đầu bằng hành vi/tình huống đời thực của người đọc (CẤM 2 câu hỏi liên tiếp), không bịa thuộc tính ngoài facts. Bắt buộc có kết bài hoàn chỉnh và câu hỏi tương tác.`;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await callAiChat({
      messages: [
        { role: 'system', content: 'Bạn là copywriter Facebook chuyên nghiệp tuân thủ format và trung thực. Luôn viết bài trọn vẹn, không bao giờ ngắt câu dở dang.' },
        { role: 'user', content: prompt }
      ],
      model: 'openai/gpt-oss-20b',
      temperature: 0.7,
      max_tokens: 1400
    });

    const cleaned = cleanFacebookContent(res.content);
    const truncated = isContentTruncated(cleaned, res.finishReason);

    if (!truncated || attempt === 2) {
      if (truncated) {
        console.warn(`    ⚠️ [C] Sau 2 lần thử bài vẫn ngắn (${cleaned.split(/\s+/).length} từ).`);
      }
      return cleaned;
    }
    console.warn(`    🔄 [C] Bài lần ${attempt} bị cụt (${cleaned.split(/\s+/).length} từ). Đang retry lần 2...`);
    await sleep(2000);
  }
}

// Sinh B với max_tokens=1400 và tự động retry 1 lần nếu cụt
async function generateBWithRetry(topicObj) {
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
Yêu cầu: Tuyệt đối không dùng dấu sao (*), ngắt dòng 1-2 câu, mở đầu bằng hành vi sinh hoạt đời thường của người đọc, chỉ dùng facts. Bắt buộc kết bài hoàn chỉnh.`;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await callAiChat({
      messages: [
        { role: 'system', content: 'Bạn là bậc thầy Copywriter mạng xã hội, am hiểu tâm lý người đọc Facebook. Luôn viết bài trọn vẹn, đủ câu kết.' },
        { role: 'user', content: prompt }
      ],
      model: 'openai/gpt-oss-20b',
      temperature: 0.7,
      max_tokens: 1400
    });

    const cleaned = cleanFacebookContent(res.content);
    const truncated = isContentTruncated(cleaned, res.finishReason);

    if (!truncated || attempt === 2) {
      if (truncated) {
        console.warn(`    ⚠️ [B] Sau 2 lần thử bài vẫn ngắn (${cleaned.split(/\s+/).length} từ).`);
      }
      return { content: cleaned, pack };
    }
    console.warn(`    🔄 [B] Bài lần ${attempt} bị cụt (${cleaned.split(/\s+/).length} từ). Đang retry lần 2...`);
    await sleep(2000);
  }
}

// Giám khảo chấm 5 tiêu chí (Qwen 27B)
async function judgePost(content, topicObj) {
  const userContent = `ĐÁNH GIÁ BÀI VIẾT SAU:
Chủ đề: "${topicObj.topic}"
Mục tiêu: "${topicObj.goal}"
Thông tin sự thật (facts): "${topicObj.facts || 'Không có'}"

[NỘI DUNG]:
${content}

HÃY CHẤM ĐIỂM (1 - 5) CHO 5 TIÊU CHÍ SAU (CHỈ TRẢ VỀ JSON DUY NHẤT):
{
  "hook": 1-5,
  "gia_tri": 1-5,
  "giong_van": 1-5,
  "nhip_va_do_dai": 1-5,
  "cta": 1-5
}`;

  try {
    const res = await callAiChat({
      messages: [
        { role: 'system', content: 'Bạn là chuyên gia giám khảo nội dung mạng xã hội. Trả về đúng JSON chấm điểm 5 tiêu chí.' },
        { role: 'user', content: userContent }
      ],
      model: 'qwen/qwen3.8-27b',
      temperature: 0.1,
      max_tokens: 350,
      jsonMode: true
    });

    const parsed = JSON.parse(res.content.replace(/^```[a-z]*\s*/i, '').replace(/\s*```$/i, '').trim());
    const validScores = ['hook', 'gia_tri', 'giong_van', 'nhip_va_do_dai', 'cta'];
    const scores = {};
    let total = 0;
    for (const key of validScores) {
      const val = Number(parsed[key]) || 3;
      scores[key] = Math.min(5, Math.max(1, val));
      total += scores[key];
    }
    const avgScore = Number((total / validScores.length).toFixed(1));
    return { scores, avgScore, isValid: true };
  } catch (e) {
    return { scores: null, avgScore: null, isValid: false };
  }
}

async function main() {
  console.log('🚀 CHẠY LẠI 11 CHỦ ĐỀ CỤT VỚI C+ VÀ B (MAX_TOKENS 1400, RETRY KHI CỤT)...');
  
  const rawData = fs.readFileSync(DATA_FILE, 'utf8');
  const results = JSON.parse(rawData);
  const topics = JSON.parse(fs.readFileSync(TOPICS_FILE, 'utf8')).filter(t => TRUNCATED_IDS.includes(t.id));

  for (let i = 0; i < topics.length; i++) {
    const topic = topics[i];
    console.log(`\n[${i + 1}/11] Đang xử lý lại chủ đề ID ${topic.id}: "${topic.topic}" (${topic.group})...`);

    // 1. Sinh C & C+
    const rawC = await generateCWithRetry(topic);
    await sleep(2000);

    let finalCPlus = rawC;
    let scC = null;
    if (topic.facts && topic.facts.trim()) {
      try {
        scC = await selfCorrectPost(rawC, topic.facts);
        if (scC.corrected) {
          finalCPlus = scC.content;
        }
      } catch (e) {
        console.warn('Lỗi rewrite C+:', e.message);
      }
    }
    await sleep(2000);

    // 2. Sinh B & B+
    const bGen = await generateBWithRetry(topic);
    await sleep(2000);

    let finalB = bGen.content;
    let scB = null;
    if (topic.facts && topic.facts.trim()) {
      try {
        scB = await selfCorrectPost(bGen.content, topic.facts, { parentKey: bGen.pack?.parent_key });
        if (scB.corrected) {
          finalB = scB.content;
        }
      } catch (e) {
        console.warn('Lỗi rewrite B:', e.message);
      }
    }
    await sleep(2000);

    // 3. Extractor chung (Qwen 27B) lên bài cuối
    const claimCPlus = await extractAndVerifyClaims(finalCPlus, topic.facts, { model: 'qwen/qwen3.8-27b' });
    await sleep(1500);
    const claimB = await extractAndVerifyClaims(finalB, topic.facts, { parentKey: bGen.pack?.parent_key, model: 'qwen/qwen3.8-27b' });
    await sleep(1500);

    // 4. Giám khảo chấm điểm 5 tiêu chí
    const judgeCPlus = await judgePost(finalCPlus, topic);
    await sleep(1500);
    const judgeB = await judgePost(finalB, topic);
    await sleep(1500);

    console.log(`   -> C+: ${finalCPlus.split(/\s+/).length} từ | Điểm: ${judgeCPlus.avgScore} | Claim: ${claimCPlus.type1UnbackedCount || 0}`);
    console.log(`   -> B : ${finalB.split(/\s+/).length} từ | Điểm: ${judgeB.avgScore} | Claim: ${claimB.type1UnbackedCount || 0}`);

    // 5. Cập nhật vào danh sách results
    const cPlusIdx = results.conditionCPlus.findIndex(s => s.topicId === topic.id);
    const newCPlusEntry = {
      run: 1, topicId: topic.id, topic: topic.topic, group: topic.group,
      content: finalCPlus, rawContent: rawC,
      wordCount: finalCPlus.split(/\s+/).length,
      claimsCount: claimCPlus.type1UnbackedCount || 0,
      claimsCountUnified: claimCPlus.type1UnbackedCount || 0,
      unbackedClaims: claimCPlus.type1UnbackedClaims || [],
      scores: judgeCPlus.scores, avgScore: judgeCPlus.avgScore,
      isValid: judgeCPlus.isValid
    };
    if (cPlusIdx >= 0) results.conditionCPlus[cPlusIdx] = newCPlusEntry;
    else results.conditionCPlus.push(newCPlusEntry);

    const bIdx = results.conditionB.findIndex(s => s.topicId === topic.id);
    const newBEntry = {
      run: 1, topicId: topic.id, topic: topic.topic, group: topic.group,
      content: finalB, rawContent: bGen.content,
      wordCount: finalB.split(/\s+/).length,
      claimsCount: claimB.type1UnbackedCount || 0,
      claimsCountUnified: claimB.type1UnbackedCount || 0,
      unbackedClaims: claimB.type1UnbackedClaims || [],
      scores: judgeB.scores, avgScore: judgeB.avgScore,
      isValid: judgeB.isValid
    };
    if (bIdx >= 0) results.conditionB[bIdx] = newBEntry;
    else results.conditionB.push(newBEntry);

    // Lưu định kỳ sau mỗi topic
    fs.writeFileSync(DATA_FILE, JSON.stringify(results, null, 2), 'utf8');
  }

  console.log('\n💾 ĐÃ CHẠY XONG VÀ CẬP NHẬT 11 CHỦ ĐỀ VÀO KẾT QUẢ TỔNG THỂ!');
}

main().catch(console.error);
