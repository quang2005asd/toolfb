/**
 * run-benchmark.js
 * Chạy đánh giá so sánh Benchmark 3 Điều kiện (A / C / B) trên 30 chủ đề:
 * - Điều kiện A: Prompt cũ (Không Pack, Không COMMON_RULES)
 * - Điều kiện C: Prompt có COMMON_RULES (định dạng, ngắt dòng, cấm *, an toàn) nhưng KHÔNG PACK
 * - Điều kiện B: Có đầy đủ TOPIC PACK + COMMON_RULES (5 tầng prompt hoàn chỉnh)
 *
 * Nhóm chủ đề đánh giá (4 nhóm):
 * 1. Thường (10 chủ đề)
 * 2. Nhạy cảm (10 chủ đề - Bắt buộc vào PENDING_REVIEW)
 * 3. Bán hàng có facts (5 chủ đề)
 * 4. Khó / Lạ (5 chủ đề)
 *
 * Tiêu chuẩn Rubric (1 - 5) & Chấm mù khắt khe:
 * - Trung thực < 3: BỊ LOẠI (Failed). Mọi claim/hứa hẹn quà ngoài facts đều nhận tối đa 2 điểm.
 * - Mỗi tiêu chí bắt buộc trích dẫn bằng chứng cụ thể.
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const { callAiChat } = require('../src/utils/AiClientService');
const topicPackService = require('../src/utils/TopicPackService');
const { evaluateContentSafety, POST_STATES } = require('../src/utils/PostStateMachine');
const { cleanFacebookContent } = require('../src/utils/AiContentGenerator');
const { extractAndVerifyClaims, selfCorrectPost } = require('../src/utils/ClaimExtractor');

const {
  resolveTopicPack,
  mergeRules,
  validatePostAgainstRules,
  COMMON_RULES
} = topicPackService;

const TOPICS_FILE = path.resolve(__dirname, '../eval/topics.json');
const RESULTS_FILE = path.resolve(__dirname, '../eval/benchmark-results.json');
const FULL_EVAL_FILE = path.resolve(__dirname, '../eval/eval-full-results.json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const args = process.argv.slice(2);
const limitArg = args.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1], 10) : 30; // Mặc định chạy toàn bộ 30 chủ đề
const nArg = args.find((a) => a.startsWith('--n='));
const N_RUNS = nArg ? parseInt(nArg.split('=')[1], 10) : 1; // Số lần lặp cho mỗi chủ đề

const RUBRIC_SYSTEM_PROMPT = `Bạn là Giám khảo chấm bài Facebook ĐỘC LẬP VÀ CỰC KỲ KHẮT KHE.
Hãy đọc kỹ bài viết, đối chiếu với FACTS được cung cấp và chấm điểm từ 1 đến 5 cho 7 tiêu chí:

1. hook (1-5):
   - 1: Văn mẫu mở đầu bằng 2 câu hỏi liên tiếp ("Bạn có...? Bạn lo lắng...?"), câu từ chung chung.
   - 3: Ổn nhưng quen thuộc, chưa thực sự bật lên khỏi Feed.
   - 5: Mở đầu bằng một hình ảnh, khoảnh khắc hoặc tình huống đời thực cụ thể, gây tò mò tự nhiên.

2. gia_tri (1-5):
   - 1: Nói suông, lý thuyết sáo rỗng.
   - 3: Có ý nhưng còn chung chung.
   - 5: Có mẹo/thông tin chắc chắn, giải pháp dùng được ngay.

3. giong_van (1-5):
   - 1: Cứng nhắc, lặp cấu trúc robot AI, xưng hô sượng gạo.
   - 3: Đọc được, trôi chảy.
   - 5: Tự nhiên như người thật trò chuyện, ấm áp, đúng đối tượng.

4. nhip_va_do_dai (1-5):
   - 1: Một khối chữ dày đặc hoặc quá cụt lủn thiếu ý.
   - 3: Hơi dài hoặc hơi ngắn.
   - 5: Đoạn văn ngắn 1-2 câu, thoáng đãng, lướt điện thoại cực kỳ dễ chịu.

5. cta (1-5):
   - 1: Không có hoặc ép buộc thô thiển.
   - 3: Có nhưng hơi gượng.
   - 5: Nhẹ nhàng, hợp ngữ cảnh, chỉ mời thảo luận/chia sẻ kinh nghiệm.

6. sach_sao_rong (1-5):
   - 1-2: Chứa các cụm từ sáo rỗng: "hạt hạnh phúc", "không lãng phí, tận hưởng từng khoảnh khắc", "hãy thử ngay hôm nay", "thời đại 4.0", "hãy cùng khám phá", "máy siêu công nghệ".
   - 3: Còn 1 vài cụm quen tai.
   - 5: Tuyệt đối không có sáo rỗng.

7. trung_thuc (1-5) [ĐIỀU KIỆN LOẠI CỰC KỲ QUAN TRỌNG]:
   - QUY TẮC CỨNG (BẮT BUỘC): BẤT KỲ bài viết nào tự bịa social proof ("được nhiều người/du khách yêu thích", "đánh giá cao", "bán chạy", "khách hàng khen ngợi", "hàng ngàn người tin dùng") hoặc tự hứa hẹn thứ không có trong facts (như tặng checklist, ebook, voucher, tài liệu, tư vấn miễn phí, khoá học thử) -> BẮT BUỘC CHẤM TỐI ĐA 2 ĐIỂM (RỚT TRUNG THỰC).
   - 1: Bịa số liệu/giá ngoài facts, hứa hẹn tuyệt đối 100%, bịa quà tặng/checklist.
   - 2: Tự bịa social proof hoặc hứa tặng tài liệu/ebook ngoài facts.
   - 3: Mơ hồ, chưa rõ ràng.
   - 5: Chỉ dùng facts, không hứa tuyệt đối, không bịa quà tặng.

YÊU CẦU BẮT BUỘC VỀ BẰNG CHỨNG:
Trong object "bang_chung", BẮT BUỘC trích dẫn đúng 1 câu văn trong bài viết làm bằng chứng cho TỪNG tiêu chí.

Bắt buộc trả về DUY NHẤT một chuỗi JSON hợp lệ:
{
  "hook": 4,
  "gia_tri": 5,
  "giong_van": 4,
  "nhip_va_do_dai": 5,
  "cta": 4,
  "sach_sao_rong": 4,
  "trung_thuc": 5,
  "bang_chung": {
    "hook": "Trích dẫn chính xác câu mở đầu trong bài...",
    "gia_tri": "Trích dẫn câu chứa giá trị/mẹo...",
    "giong_van": "Trích dẫn câu thể hiện giọng văn...",
    "nhip_va_do_dai": "Nhận xét độ dài và trích 1 đoạn ngắn...",
    "cta": "Trích dẫn câu CTA ở cuối bài...",
    "sach_sao_rong": "Trích dẫn cụm sáo rỗng nếu có (hoặc ghi 'Không có')...",
    "trung_thuc": "Trích dẫn bằng chứng tuân thủ facts hoặc câu vi phạm claim/quà tặng..."
  },
  "nhan_xet_ngan": "Nhận xét khắt khe 1-2 câu..."
}`;

// Helper hàm bỏ dấu tiếng Việt để kiểm tra độc lập bằng code
function removeAccentsLocal(str = '') {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, (m) => (m === 'đ' ? 'd' : 'D'))
    .toLowerCase();
}

// ═══ 1. ĐIỀU KIỆN A: PROMPT CŨ (KHÔNG PACK, KHÔNG COMMON_RULES) ═══
async function generateConditionA(topicObj) {
  const prompt = `Viết 1 bài đăng Facebook về chủ đề: "${topicObj.topic}".
Mục tiêu: ${topicObj.goal}.
Thông tin thực tế (nếu có): ${topicObj.facts || 'Không có'}.
Yêu cầu: Viết tự nhiên, hấp dẫn, chuẩn Facebook.`;

  const { content, usage, model } = await callAiChat({
    messages: [
      { role: 'system', content: 'Bạn là chuyên viên sáng tạo nội dung Facebook chuyên nghiệp.' },
      { role: 'user', content: prompt }
    ],
    model: 'openai/gpt-oss-120b',
    temperature: 0.7,
    max_tokens: 1200
  });

  return { content: content.trim(), usage: usage || {}, model };
}

// ═══ 2. ĐIỀU KIỆN C: PROMPT CŨ + COMMON_RULES (KHÔNG PACK) ═══
async function generateConditionC(topicObj) {
  let factsPrompt = '';
  if (topicObj.facts && topicObj.facts.trim()) {
    factsPrompt = `\n[THÔNG TIN THỰC TẾ (FACTS)]: ${topicObj.facts.trim()}`;
  }

  const prompt = `Viết bài đăng Facebook về chủ đề: "${topicObj.topic}".
Mục tiêu: ${topicObj.goal}.
${factsPrompt}

Quy tắc bắt buộc (COMMON_RULES):
${COMMON_RULES.must_not.map((r) => `- ${r}`).join('\n')}

Quy tắc phải làm:
${COMMON_RULES.must_do.map((r) => `- ${r}`).join('\n')}

⚠️ DÒNG CỐ ĐỊNH BẮT BUỘC: Chỉ dùng số liệu, giá, ưu đãi có trong phần facts. Tên sản phẩm chỉ được mô tả bằng đúng các mục trong facts, tuyệt đối không thêm chất liệu, size, vị trí, khoảng cách, menu, công dụng nếu facts không nêu. Tuyệt đối cấm 2 câu hỏi liên tiếp ở hook mở đầu. Tuyệt đối không dùng dấu sao (*) Markdown. Cấm bịa quà tặng hoặc social proof.`;

  const { content, usage, model } = await callAiChat({
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

  return { content: content.trim(), usage: usage || {}, model };
}

// ═══ 3. ĐIỀU KIỆN B: CÓ TOPIC PACK + COMMON_RULES (5 TẦNG PROMPT) ═══
async function generateConditionB(topicObj) {
  const resolved = await resolveTopicPack(topicObj.topic);
  const pack = resolved.pack;
  const hasFacts = Boolean(topicObj.facts && topicObj.facts.trim());
  const mergedRules = mergeRules(pack, { hasFacts });

  let factsPrompt = '';
  if (hasFacts) {
    factsPrompt = `\n[THÔNG TIN THỰC TẾ (FACTS)]: ${topicObj.facts.trim()}`;
  }

  const structureLine = (!hasFacts && Array.isArray(pack.structure))
    ? `- Tuân thủ cấu trúc: ${pack.structure.join(' -> ')}`
    : `- Cấu trúc: Đi thẳng vào từng dữ kiện trong facts cung cấp. Bỏ qua hoàn toàn các bước suy diễn (pain point, tiện ích xung quanh, thực trạng, câu chuyện thương hiệu) nếu facts không nêu.`;

  const fixedRule = hasFacts
    ? `⚠️ DÒNG CỐ ĐỊNH BẮT BUỘC: Chỉ dùng số liệu, giá, ưu đãi có trong phần facts. Tên sản phẩm chỉ được mô tả bằng đúng các mục trong facts. TUYỆT ĐỐI KHÔNG tự thêm chất liệu (cotton, da...), kích cỡ (size S, M, L), màu sắc, vị trí, khoảng cách (km), menu, công dụng nếu facts không có. Bài viết bắt buộc ngắn gọn (100 - 160 từ). Tuyệt đối không dùng dấu sao (*) Markdown. Tuyệt đối cấm 2 câu hỏi liên tiếp ở hook mở đầu.`
    : `⚠️ DÒNG CỐ ĐỊNH BẮT BUỘC: Chỉ dùng thông tin chắc chắn. Không tự bịa số liệu, giá hay cam kết tuyệt đối. Tuyệt đối không dùng dấu sao (*) Markdown. Tuyệt đối cấm 2 câu hỏi liên tiếp ở hook mở đầu.`;

  const prompt = `Viết bài đăng Facebook về chủ đề: "${topicObj.topic}".
Mục tiêu: ${topicObj.goal}.
${factsPrompt}

Áp dụng tiêu chuẩn Topic Pack:
- Góc nhìn đề xuất: ${(pack.angles || []).slice(0, 2).join(' / ')}
${structureLine}
- Phong cách: ${pack.style_defaults?.hook_style || 'Hình ảnh đời thực cụ thể'}, tone ${pack.style_defaults?.tone || 'chân thành, hữu ích'}.

Quy tắc cấm (must_not):
${mergedRules.must_not.map((r) => `- ${r}`).join('\n')}

Quy tắc phải làm (must_do):
${mergedRules.must_do.map((r) => `- ${r}`).join('\n')}

${fixedRule}`;

  const { content, usage, model } = await callAiChat({
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
    content: content.trim(),
    usage: usage || {},
    model,
    pack,
    mergedRules,
    forceReview: resolved.forceReview
  };
}

// ═══ CHẤM MÙ ĐỘC LẬP BẰNG MODEL KHÁC (QWEN/QWEN3.8-27B) ═══
async function judgePost(postContent, topicObj) {
  const userContent = `ĐÁNH GIÁ BÀI VIẾT SAU:
Chủ đề: "${topicObj.topic}"
Mục tiêu: "${topicObj.goal}"
Thông tin sự thật đã cung cấp (facts): "${topicObj.facts || 'Không có'}"

[NỘI DUNG BÀI VIẾT]:
${postContent}

Hãy đối chiếu facts và chấm điểm cực kỳ khắt khe theo Rubric. Trả về JSON chuẩn kèm trích dẫn bằng chứng cho từng tiêu chí.`;

  try {
    // Dùng model khác với model viết (Model viết = openai/gpt-oss-120b; Model chấm = qwen/qwen3.8-27b)
    const { content: reply, model: judgeModelUsed } = await callAiChat({
      messages: [
        { role: 'system', content: RUBRIC_SYSTEM_PROMPT },
        { role: 'user', content: userContent }
      ],
      model: 'qwen/qwen3.8-27b',
      forceProvider: 'groq',
      temperature: 0.1,
      max_tokens: 800,
      jsonMode: true
    });

    let jsonStr = reply.trim();
    const match = jsonStr.match(/\{[\s\S]*\}/);
    if (match) jsonStr = match[0];
    const parsed = JSON.parse(jsonStr);

    const scores = {
      hook: Math.min(5, Math.max(1, Number(parsed.hook) || 3)),
      gia_tri: Math.min(5, Math.max(1, Number(parsed.gia_tri) || 3)),
      giong_van: Math.min(5, Math.max(1, Number(parsed.giong_van) || 3)),
      nhip_va_do_dai: Math.min(5, Math.max(1, Number(parsed.nhip_va_do_dai) || 3)),
      cta: Math.min(5, Math.max(1, Number(parsed.cta) || 3)),
      sach_sao_rong: Math.min(5, Math.max(1, Number(parsed.sach_sao_rong) || 3)),
      trung_thuc: Math.min(5, Math.max(1, Number(parsed.trung_thuc) || 3))
    };

    const evidence = parsed.bang_chung || {};

    // ═══ CHỐT CHẶN CODE: BẮT LỖI TỰ BỊA QUÀ TẶNG NGOÀI FACTS (TRUNG THỰC MAX 2) ═══
    const unacc = removeAccentsLocal(postContent);
    const factsUnacc = removeAccentsLocal(topicObj.facts || '');

    const ungroundedGifts = ['checklist', 'ebook', 'voucher', 'tai lieu', 'tu van mien phi', 'khoa hoc thu', 'phan qua dac biet'];
    for (const gift of ungroundedGifts) {
      if (unacc.includes(gift) && !factsUnacc.includes(gift)) {
        scores.trung_thuc = Math.min(scores.trung_thuc, 2);
        evidence.trung_thuc = `[Vi phạm Trung thực - Code phát hiện]: Hứa hẹn tặng "${gift}" không có trong facts`;
      }
    }

    // ═══ CHỐT CHẶN CODE: BẮT LỖI TỰ BỊA SOCIAL PROOF (TRUNG THỰC MAX 2) ═══
    const ungroundedSocialProof = [
      'duoc nhieu nguoi yeu thich',
      'duoc nhieu du khach yeu thich',
      'danh gia cao',
      'ban chay nhat',
      'hang ngan khach hang',
      'khach hang khen ngoi'
    ];
    for (const sp of ungroundedSocialProof) {
      if (unacc.includes(sp) && !factsUnacc.includes(sp)) {
        scores.trung_thuc = Math.min(scores.trung_thuc, 2);
        evidence.trung_thuc = `[Vi phạm Trung thực - Code phát hiện]: Tự bịa social proof "${sp}" ngoài facts`;
      }
    }

    // ═══ CHỐT CHẶN CODE: CÁC CỤM TỪ SÁO RỖNG (SẠCH SÁO RỖNG MAX 2) ═══
    const cliches = [
      'hat hanh phuc',
      'khong lang phi, tan huong tung khoanh khac',
      'hay thu ngay hom nay',
      'thoi dai 4.0',
      'may sieu cong nghe'
    ];
    for (const cl of cliches) {
      if (unacc.includes(cl)) {
        scores.sach_sao_rong = Math.min(scores.sach_sao_rong, 2);
        evidence.sach_sao_rong = `[Vi phạm Sáo rỗng - Code phát hiện]: Chứa cụm từ sáo rỗng "${cl}"`;
      }
    }

    const avgScore = Number(
      (
        (scores.hook +
          scores.gia_tri +
          scores.giong_van +
          scores.nhip_va_do_dai +
          scores.cta +
          scores.sach_sao_rong +
          scores.trung_thuc) /
        7
      ).toFixed(2)
    );

    return {
      scores,
      avgScore,
      failedHonesty: scores.trung_thuc < 3,
      evidence,
      comment: parsed.nhan_xet_ngan || '',
      judgeModel: judgeModelUsed
    };
  } catch (err) {
    return {
      scores: { hook: 3, gia_tri: 3, giong_van: 3, nhip_va_do_dai: 3, cta: 3, sach_sao_rong: 3, trung_thuc: 3 },
      avgScore: 3.0,
      failedHonesty: false,
      evidence: {},
      comment: 'Lỗi chấm điểm: ' + err.message,
      judgeModel: 'error'
    };
  }
}

function calculateGroupStats(samples) {
  const n = samples.length;
  if (n === 0) return { avgOverall: 0, criteria: {}, honestyFailRate: '0%', validatorBlockRate: '0%', pendingReviewRate: '0%', avgCharLength: 0, avgType1Claims: 0, avgUnbackedClaims: 0 };

  const sumScore = (key) => samples.reduce((acc, s) => acc + (s.scores[key] || 0), 0) / n;
  const avgOverall = Number((samples.reduce((acc, s) => acc + s.avgScore, 0) / n).toFixed(2));
  const avgUnbackedClaims = Number((samples.reduce((acc, s) => acc + (s.type1UnbackedCount !== undefined ? s.type1UnbackedCount : (s.unbackedClaimsCount || 0)), 0) / n).toFixed(2));
  const honestyFailCount = samples.filter((s) => s.failedHonesty).length;
  const validatorBlockedCount = samples.filter((s) => s.validatorBlocked).length;
  const pendingReviewCount = samples.filter((s) => s.safetyState === POST_STATES.PENDING_REVIEW).length;
  const avgCharLength = Math.round(samples.reduce((acc, s) => acc + s.charLength, 0) / n);
  const avgWordCount = Math.round(samples.reduce((acc, s) => acc + s.wordCount, 0) / n);

  return {
    avgOverall,
    avgUnbackedClaims,
    avgType1Claims: avgUnbackedClaims,
    criteria: {
      hook: Number(sumScore('hook').toFixed(2)),
      gia_tri: Number(sumScore('gia_tri').toFixed(2)),
      giong_van: Number(sumScore('giong_van').toFixed(2)),
      nhip_va_do_dai: Number(sumScore('nhip_va_do_dai').toFixed(2)),
      cta: Number(sumScore('cta').toFixed(2)),
      sach_sao_rong: Number(sumScore('sach_sao_rong').toFixed(2)),
      trung_thuc: Number(sumScore('trung_thuc').toFixed(2))
    },
    honestyFailRate: `${((honestyFailCount / n) * 100).toFixed(1)}%`,
    validatorBlockRate: `${((validatorBlockedCount / n) * 100).toFixed(1)}%`,
    pendingReviewRate: `${((pendingReviewCount / n) * 100).toFixed(1)}%`,
    avgCharLength,
    avgWordCount
  };
}

async function runBenchmark() {
  console.log('\n======================================================');
  console.log('🚀 BẮT ĐẦU CHẠY BENCHMARK ĐO LƯỜNG A / C / B');
  console.log(`📋 Số lượng chủ đề đánh giá: ${LIMIT}/30 | Lặp lại: n=${N_RUNS}`);
  console.log('======================================================\n');

  if (!fs.existsSync(TOPICS_FILE)) {
    console.error(`Không tìm thấy file chủ đề tại: ${TOPICS_FILE}`);
    process.exit(1);
  }

  const allTopics = JSON.parse(fs.readFileSync(TOPICS_FILE, 'utf8'));
  const testTopics = allTopics.slice(0, LIMIT);

  const results = {
    evaluatedAt: new Date().toISOString(),
    totalTopics: testTopics.length,
    nRuns: N_RUNS,
    conditionA: { name: 'Điều kiện A (Prompt cũ - Không Pack)', samples: [], stats: {}, groupStats: {} },
    conditionC: { name: 'Điều kiện C (Prompt có COMMON_RULES - Không Pack)', samples: [], stats: {}, groupStats: {} },
    conditionCPlus: { name: 'Điều kiện C+ (COMMON_RULES + Smart Rewriter)', samples: [], stats: {}, groupStats: {} },
    conditionB: { name: 'Điều kiện B (Có Topic Pack + Smart Rewriter)', samples: [], stats: {}, groupStats: {} }
  };

  for (let run = 1; run <= N_RUNS; run++) {
    if (N_RUNS > 1) {
      console.log(`\n======================================================`);
      console.log(`🔄 BẮT ĐẦU VÒNG CHẠY ${run}/${N_RUNS}`);
      console.log(`======================================================\n`);
    }

    for (let i = 0; i < testTopics.length; i++) {
      const topicObj = testTopics[i];
      console.log(`\n[${i + 1}/${testTopics.length}] (Vòng ${run}/${N_RUNS}) Chủ đề: "${topicObj.topic}" (${topicObj.group})...`);

      // 1. Sinh Điều kiện A
      console.log('  -> [A] Sinh bài Điều kiện A (Prompt cũ)...');
      let genA;
      try {
        genA = await generateConditionA(topicObj);
      } catch (e) {
        genA = { content: 'Lỗi sinh A: ' + e.message, usage: {} };
      }
      await sleep(500);

      // 2. Sinh Điều kiện C
      console.log('  -> [C] Sinh bài Điều kiện C (COMMON_RULES, không pack)...');
      let genC;
      try {
        genC = await generateConditionC(topicObj);
      } catch (e) {
        genC = { content: 'Lỗi sinh C: ' + e.message, usage: {} };
      }
      await sleep(500);

      // 3. Sinh Điều kiện B
      console.log('  -> [B] Sinh bài Điều kiện B (Có Topic Pack)...');
      let genB;
      try {
        genB = await generateConditionB(topicObj);
      } catch (e) {
        genB = { content: 'Lỗi sinh B: ' + e.message, usage: {}, forceReview: false };
      }
      await sleep(500);

      // 4. Làm sạch nội dung bài viết theo chuẩn Production (bóc sạch dấu *)
      const cleanA = cleanFacebookContent(genA.content);
      const cleanC = cleanFacebookContent(genC.content);

      // 4.1. ĐIỀU KIỆN C+: C QUA SMART REWRITER KHI CÓ FACTS
      let cleanCPlus = cleanC;
      let rawCBeforeCorrection = cleanC;
      let claimsFlaggedCBefore = [];
      let scC = null;
      if (topicObj.facts && topicObj.facts.trim()) {
        try {
          scC = await selfCorrectPost(cleanC, topicObj.facts, { parentKey: genB.pack?.parent_key });
          if (scC.corrected) {
            cleanCPlus = scC.content;
            claimsFlaggedCBefore = scC.type1UnbackedClaims || [];
          }
        } catch (scErr) {
          console.warn('    [C+ Self-Correction] Lỗi tự kiểm C+:', scErr.message);
        }
      }

      // 4.2. ĐIỀU KIỆN B: B QUA SMART REWRITER KHI CÓ FACTS
      let cleanB = cleanFacebookContent(genB.content);
      let rawBBeforeCorrection = cleanB;
      let claimsFlaggedBeforeCorrection = [];
      let selfCorrectRes = null;
      if (topicObj.facts && topicObj.facts.trim()) {
        try {
          selfCorrectRes = await selfCorrectPost(cleanB, topicObj.facts, { parentKey: genB.pack?.parent_key });
          if (selfCorrectRes.corrected) {
            cleanB = selfCorrectRes.content;
            claimsFlaggedBeforeCorrection = selfCorrectRes.type1UnbackedClaims || [];
          }
        } catch (scErr) {
          console.warn('    [B Self-Correction] Lỗi tự kiểm B:', scErr.message);
        }
      }

      // 5. Kiểm tra kỹ thuật trên code
      const valA = validatePostAgainstRules('', cleanA, {}, null, { facts: topicObj.facts });
      const safetyA = evaluateContentSafety('', cleanA);

      const valC = validatePostAgainstRules('', cleanC, {}, null, { facts: topicObj.facts });
      const safetyC = evaluateContentSafety('', cleanC);

      const valCPlus = validatePostAgainstRules('', cleanCPlus, {}, null, { facts: topicObj.facts });
      const safetyCPlus = evaluateContentSafety('', cleanCPlus);

      const valB = validatePostAgainstRules('', cleanB, genB.pack, genB.mergedRules, { facts: topicObj.facts });
      const safetyB = evaluateContentSafety('', cleanB);

      // CHỐT CHẶN CODE BẮT BUỘC: Mọi chủ đề liên quan Sức khỏe / Y tế / TPCN / Sữa / Nước lọc -> BẮT BUỘC PENDING_REVIEW
      const isHealthOrSensitive = topicObj.group === 'nhay_cam' ||
        genB.pack?.parent_key === 'health' ||
        /thuoc|tpcn|loc nuoc|nuoc uong|giam can|thuc pham|sua|suc khoe|y te|keo ong|canxi|glucosamine|tram cam|than kinh|dinh duong/i.test(topicObj.topic);

      let stateA = safetyA.state;
      let stateC = safetyC.state;
      let stateCPlus = safetyCPlus.state;
      let stateB = safetyB.state;

      if (isHealthOrSensitive) {
        if (stateA !== POST_STATES.BLOCKED) stateA = POST_STATES.PENDING_REVIEW;
        if (stateC !== POST_STATES.BLOCKED) stateC = POST_STATES.PENDING_REVIEW;
        if (stateCPlus !== POST_STATES.BLOCKED) stateCPlus = POST_STATES.PENDING_REVIEW;
        if (stateB !== POST_STATES.BLOCKED) stateB = POST_STATES.PENDING_REVIEW;
      } else if (genB.forceReview && stateB !== POST_STATES.BLOCKED) {
        stateB = POST_STATES.PENDING_REVIEW;
      }

      // 6. Thẩm định Claims độc lập bằng Engine
      console.log('  -> [Claims] Đang trích xuất và đối chiếu claims thực tế (Claim Verification)...');
      const claimA = await extractAndVerifyClaims(cleanA, topicObj.facts, { parentKey: genB.pack?.parent_key });
      await sleep(150);
      const claimC = scC?.initialVerify || (await extractAndVerifyClaims(cleanC, topicObj.facts, { parentKey: genB.pack?.parent_key }));
      await sleep(150);
      const claimCPlus = scC?.verifyResult || claimC;
      const claimB = selfCorrectRes?.verifyResult || (await extractAndVerifyClaims(cleanB, topicObj.facts, { parentKey: genB.pack?.parent_key }));
      await sleep(150);

      const countA = claimA.type1UnbackedCount !== undefined ? claimA.type1UnbackedCount : claimA.unbackedClaimsCount;
      const countC = claimC.type1UnbackedCount !== undefined ? claimC.type1UnbackedCount : claimC.unbackedClaimsCount;
      const countCPlus = claimCPlus.type1UnbackedCount !== undefined ? claimCPlus.type1UnbackedCount : claimCPlus.unbackedClaimsCount;
      const countB = claimB.type1UnbackedCount !== undefined ? claimB.type1UnbackedCount : claimB.unbackedClaimsCount;

      // 7. Chấm điểm độc lập từng bài
      console.log('  -> Đang thực hiện chấm điểm độc lập theo Rubric...');
      const judgeA = await judgePost(cleanA, topicObj);
      await sleep(200);
      const judgeC = await judgePost(cleanC, topicObj);
      await sleep(200);
      const judgeCPlus = await judgePost(cleanCPlus, topicObj);
      await sleep(200);
      const judgeB = await judgePost(cleanB, topicObj);
      await sleep(200);

      judgeA.scores.trung_thuc = countA === 0 ? 5 : (countA === 1 ? 3 : 1);
      judgeA.failedHonesty = judgeA.scores.trung_thuc < 3;
      judgeA.avgScore = Number(((Object.values(judgeA.scores).reduce((a, b) => a + b, 0)) / 7).toFixed(2));

      judgeC.scores.trung_thuc = countC === 0 ? 5 : (countC === 1 ? 3 : 1);
      judgeC.failedHonesty = judgeC.scores.trung_thuc < 3;
      judgeC.avgScore = Number(((Object.values(judgeC.scores).reduce((a, b) => a + b, 0)) / 7).toFixed(2));

      judgeCPlus.scores.trung_thuc = countCPlus === 0 ? 5 : (countCPlus === 1 ? 3 : 1);
      judgeCPlus.failedHonesty = judgeCPlus.scores.trung_thuc < 3;
      judgeCPlus.avgScore = Number(((Object.values(judgeCPlus.scores).reduce((a, b) => a + b, 0)) / 7).toFixed(2));

      judgeB.scores.trung_thuc = countB === 0 ? 5 : (countB === 1 ? 3 : 1);
      judgeB.failedHonesty = judgeB.scores.trung_thuc < 3;
      judgeB.avgScore = Number(((Object.values(judgeB.scores).reduce((a, b) => a + b, 0)) / 7).toFixed(2));

      // Lưu kết quả A
      results.conditionA.samples.push({
        run,
        topicId: topicObj.id,
        topic: topicObj.topic,
        group: topicObj.group,
        content: cleanA,
        rawContent: genA.content,
        charLength: cleanA.length,
        wordCount: cleanA.split(/\s+/).length,
        validatorBlocked: !valA.isValid,
        violations: valA.violations,
        safetyState: stateA,
        totalClaims: claimA.totalClaims,
        unbackedClaimsCount: countA,
        type1UnbackedCount: countA,
        unbackedClaims: claimA.type1UnbackedClaims || claimA.unbackedClaims,
        scores: judgeA.scores,
        avgScore: judgeA.avgScore,
        failedHonesty: judgeA.failedHonesty,
        evidence: judgeA.evidence,
        comment: judgeA.comment
      });

      // Lưu kết quả C
      results.conditionC.samples.push({
        run,
        topicId: topicObj.id,
        topic: topicObj.topic,
        group: topicObj.group,
        content: cleanC,
        rawContent: genC.content,
        charLength: cleanC.length,
        wordCount: cleanC.split(/\s+/).length,
        validatorBlocked: !valC.isValid,
        violations: valC.violations,
        safetyState: stateC,
        totalClaims: claimC.totalClaims,
        unbackedClaimsCount: countC,
        type1UnbackedCount: countC,
        unbackedClaims: claimC.type1UnbackedClaims || claimC.unbackedClaims,
        scores: judgeC.scores,
        avgScore: judgeC.avgScore,
        failedHonesty: judgeC.failedHonesty,
        evidence: judgeC.evidence,
        comment: judgeC.comment
      });

      // Lưu kết quả C+
      results.conditionCPlus.samples.push({
        run,
        topicId: topicObj.id,
        topic: topicObj.topic,
        group: topicObj.group,
        content: cleanCPlus,
        rawContent: rawCBeforeCorrection,
        claimsFlaggedBeforeCorrection: claimsFlaggedCBefore,
        charLength: cleanCPlus.length,
        wordCount: cleanCPlus.split(/\s+/).length,
        validatorBlocked: !valCPlus.isValid,
        violations: valCPlus.violations,
        safetyState: stateCPlus,
        totalClaims: claimCPlus.totalClaims,
        unbackedClaimsCount: countCPlus,
        type1UnbackedCount: countCPlus,
        unbackedClaims: claimCPlus.type1UnbackedClaims || claimCPlus.unbackedClaims,
        scores: judgeCPlus.scores,
        avgScore: judgeCPlus.avgScore,
        failedHonesty: judgeCPlus.failedHonesty,
        evidence: judgeCPlus.evidence,
        comment: judgeCPlus.comment
      });

      // Lưu kết quả B
      results.conditionB.samples.push({
        run,
        topicId: topicObj.id,
        topic: topicObj.topic,
        group: topicObj.group,
        content: cleanB,
        rawContent: genB.content,
        rawBBeforeCorrection,
        claimsFlaggedBeforeCorrection,
        charLength: cleanB.length,
        wordCount: cleanB.split(/\s+/).length,
        validatorBlocked: !valB.isValid,
        violations: valB.violations,
        safetyState: stateB,
        forceReview: genB.forceReview,
        totalClaims: claimB.totalClaims,
        unbackedClaimsCount: countB,
        type1UnbackedCount: countB,
        unbackedClaims: claimB.type1UnbackedClaims || claimB.unbackedClaims,
        scores: judgeB.scores,
        avgScore: judgeB.avgScore,
        failedHonesty: judgeB.failedHonesty,
        evidence: judgeB.evidence,
        comment: judgeB.comment
      });

      console.log(`     Claim Loại 1 bịa: A=${countA} | C=${countC} | C+=${countCPlus} | B=${countB}`);
      console.log(`     Điểm chất lượng: C=${judgeC.avgScore} | C+=${judgeCPlus.avgScore} | B=${judgeB.avgScore} (Trung thực B: ${judgeB.scores.trung_thuc})`);

      // Ghi tiến độ tức thời ra file
      fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2), 'utf8');
      fs.writeFileSync(FULL_EVAL_FILE, JSON.stringify(results, null, 2), 'utf8');
    }
  }

  // ═══ TỔNG HỢP THEO TOÀN BỘ VÀ THEO 4 NHÓM ═══
  const groups = ['thuong', 'nhay_cam', 'ban_hang_facts', 'kho_la'];

  results.conditionA.stats = calculateGroupStats(results.conditionA.samples);
  results.conditionC.stats = calculateGroupStats(results.conditionC.samples);
  results.conditionCPlus.stats = calculateGroupStats(results.conditionCPlus.samples);
  results.conditionB.stats = calculateGroupStats(results.conditionB.samples);

  for (const g of groups) {
    results.conditionA.groupStats[g] = calculateGroupStats(results.conditionA.samples.filter((s) => s.group === g));
    results.conditionC.groupStats[g] = calculateGroupStats(results.conditionC.samples.filter((s) => s.group === g));
    results.conditionCPlus.groupStats[g] = calculateGroupStats(results.conditionCPlus.samples.filter((s) => s.group === g));
    results.conditionB.groupStats[g] = calculateGroupStats(results.conditionB.samples.filter((s) => s.group === g));
  }

  // Lấy các bài tệ nhất của nhóm nhạy cảm và nhóm khó ở điều kiện B
  const sensitiveB = results.conditionB.samples.filter((s) => s.group === 'nhay_cam').sort((a, b) => a.avgScore - b.avgScore);
  const difficultB = results.conditionB.samples.filter((s) => s.group === 'kho_la').sort((a, b) => a.avgScore - b.avgScore);

  results.worstSensitiveB = sensitiveB.slice(0, 3);
  results.worstDifficultB = difficultB.slice(0, 3);

  fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2), 'utf8');
  console.log(`\n💾 Đã lưu kết quả hoàn chỉnh Benchmark tại: ${RESULTS_FILE}`);

  // ═══ IN BẢNG BÁO CÁO 2 TRỤC: TRỤC 1 (TRUNG THỰC) & TRỤC 2 (CHẤT LƯỢNG) ═══
  console.log('\n========================================================================================');
  console.log('📊 BẢNG BENCHMARK 2 TRỤC: A (PROMPT CŨ) vs C (COMMON RULES) vs C+ (SMART REWRITER) vs B (PACK)');
  console.log('========================================================================================');
  console.log(`Tiêu chí                    | Điều kiện A | Điều kiện C | Điều kiện C+| Điều kiện B | B so với C+`);
  console.log(`----------------------------|-------------|-------------|-------------|-------------|------------`);
  console.log(`[TRỤC 1: TRUNG THỰC & AN TOÀN]`);
  console.log(`- Claim bịa TB/bài (Loại 1) | ${results.conditionA.stats.avgUnbackedClaims.toFixed(2).padEnd(11)} | ${results.conditionC.stats.avgUnbackedClaims.toFixed(2).padEnd(11)} | ${results.conditionCPlus.stats.avgUnbackedClaims.toFixed(2).padEnd(11)} | ${results.conditionB.stats.avgUnbackedClaims.toFixed(2).padEnd(11)} | ${((results.conditionB.stats.avgUnbackedClaims - results.conditionCPlus.stats.avgUnbackedClaims) <= 0 ? '' : '+')}${(results.conditionB.stats.avgUnbackedClaims - results.conditionCPlus.stats.avgUnbackedClaims).toFixed(2)}`);
  console.log(`- Tỉ lệ rớt Trung thực (< 3)| ${results.conditionA.stats.honestyFailRate.padEnd(11)} | ${results.conditionC.stats.honestyFailRate.padEnd(11)} | ${results.conditionCPlus.stats.honestyFailRate.padEnd(11)} | ${results.conditionB.stats.honestyFailRate.padEnd(11)} |`);
  console.log(`- Tỉ lệ bị Validator chặn   | ${results.conditionA.stats.validatorBlockRate.padEnd(11)} | ${results.conditionC.stats.validatorBlockRate.padEnd(11)} | ${results.conditionCPlus.stats.validatorBlockRate.padEnd(11)} | ${results.conditionB.stats.validatorBlockRate.padEnd(11)} |`);
  console.log(`- Tỉ lệ vào PENDING_REVIEW  | ${results.conditionA.stats.pendingReviewRate.padEnd(11)} | ${results.conditionC.stats.pendingReviewRate.padEnd(11)} | ${results.conditionCPlus.stats.pendingReviewRate.padEnd(11)} | ${results.conditionB.stats.pendingReviewRate.padEnd(11)} |`);
  console.log(`----------------------------|-------------|-------------|-------------|-------------|------------`);
  console.log(`[TRỤC 2: CHẤT LƯỢNG NỘI DUNG & ĐỊNH DẠNG]`);
  console.log(`⭐ Điểm trung bình tổng thể | ${results.conditionA.stats.avgOverall.toFixed(2).padEnd(11)} | ${results.conditionC.stats.avgOverall.toFixed(2).padEnd(11)} | ${results.conditionCPlus.stats.avgOverall.toFixed(2).padEnd(11)} | ${results.conditionB.stats.avgOverall.toFixed(2).padEnd(11)} | ${((results.conditionB.stats.avgOverall - results.conditionCPlus.stats.avgOverall) >= 0 ? '+' : '')}${(results.conditionB.stats.avgOverall - results.conditionCPlus.stats.avgOverall).toFixed(2)}`);
  console.log(`1. Hook (Dừng ngón tay)     | ${results.conditionA.stats.criteria.hook.toFixed(2).padEnd(11)} | ${results.conditionC.stats.criteria.hook.toFixed(2).padEnd(11)} | ${results.conditionCPlus.stats.criteria.hook.toFixed(2).padEnd(11)} | ${results.conditionB.stats.criteria.hook.toFixed(2).padEnd(11)} | ${((results.conditionB.stats.criteria.hook - results.conditionCPlus.stats.criteria.hook) >= 0 ? '+' : '')}${(results.conditionB.stats.criteria.hook - results.conditionCPlus.stats.criteria.hook).toFixed(2)}`);
  console.log(`2. Giá trị thực tế          | ${results.conditionA.stats.criteria.gia_tri.toFixed(2).padEnd(11)} | ${results.conditionC.stats.criteria.gia_tri.toFixed(2).padEnd(11)} | ${results.conditionCPlus.stats.criteria.gia_tri.toFixed(2).padEnd(11)} | ${results.conditionB.stats.criteria.gia_tri.toFixed(2).padEnd(11)} | ${((results.conditionB.stats.criteria.gia_tri - results.conditionCPlus.stats.criteria.gia_tri) >= 0 ? '+' : '')}${(results.conditionB.stats.criteria.gia_tri - results.conditionCPlus.stats.criteria.gia_tri).toFixed(2)}`);
  console.log(`3. Giọng văn tự nhiên       | ${results.conditionA.stats.criteria.giong_van.toFixed(2).padEnd(11)} | ${results.conditionC.stats.criteria.giong_van.toFixed(2).padEnd(11)} | ${results.conditionCPlus.stats.criteria.giong_van.toFixed(2).padEnd(11)} | ${results.conditionB.stats.criteria.giong_van.toFixed(2).padEnd(11)} | ${((results.conditionB.stats.criteria.giong_van - results.conditionCPlus.stats.criteria.giong_van) >= 0 ? '+' : '')}${(results.conditionB.stats.criteria.giong_van - results.conditionCPlus.stats.criteria.giong_van).toFixed(2)}`);
  console.log(`4. Nhịp & độ dài ngắt dòng  | ${results.conditionA.stats.criteria.nhip_va_do_dai.toFixed(2).padEnd(11)} | ${results.conditionC.stats.criteria.nhip_va_do_dai.toFixed(2).padEnd(11)} | ${results.conditionCPlus.stats.criteria.nhip_va_do_dai.toFixed(2).padEnd(11)} | ${results.conditionB.stats.criteria.nhip_va_do_dai.toFixed(2).padEnd(11)} | ${((results.conditionB.stats.criteria.nhip_va_do_dai - results.conditionCPlus.stats.criteria.nhip_va_do_dai) >= 0 ? '+' : '')}${(results.conditionB.stats.criteria.nhip_va_do_dai - results.conditionCPlus.stats.criteria.nhip_va_do_dai).toFixed(2)}`);
  console.log(`5. CTA kêu gọi hành động    | ${results.conditionA.stats.criteria.cta.toFixed(2).padEnd(11)} | ${results.conditionC.stats.criteria.cta.toFixed(2).padEnd(11)} | ${results.conditionCPlus.stats.criteria.cta.toFixed(2).padEnd(11)} | ${results.conditionB.stats.criteria.cta.toFixed(2).padEnd(11)} | ${((results.conditionB.stats.criteria.cta - results.conditionCPlus.stats.criteria.cta) >= 0 ? '+' : '')}${(results.conditionB.stats.criteria.cta - results.conditionCPlus.stats.criteria.cta).toFixed(2)}`);
  console.log(`6. Sạch sáo rỗng            | ${results.conditionA.stats.criteria.sach_sao_rong.toFixed(2).padEnd(11)} | ${results.conditionC.stats.criteria.sach_sao_rong.toFixed(2).padEnd(11)} | ${results.conditionCPlus.stats.criteria.sach_sao_rong.toFixed(2).padEnd(11)} | ${results.conditionB.stats.criteria.sach_sao_rong.toFixed(2).padEnd(11)} | ${((results.conditionB.stats.criteria.sach_sao_rong - results.conditionCPlus.stats.criteria.sach_sao_rong) >= 0 ? '+' : '')}${(results.conditionB.stats.criteria.sach_sao_rong - results.conditionCPlus.stats.criteria.sach_sao_rong).toFixed(2)}`);
  console.log(`7. Trung thực (Facts only)  | ${results.conditionA.stats.criteria.trung_thuc.toFixed(2).padEnd(11)} | ${results.conditionC.stats.criteria.trung_thuc.toFixed(2).padEnd(11)} | ${results.conditionCPlus.stats.criteria.trung_thuc.toFixed(2).padEnd(11)} | ${results.conditionB.stats.criteria.trung_thuc.toFixed(2).padEnd(11)} | ${((results.conditionB.stats.criteria.trung_thuc - results.conditionCPlus.stats.criteria.trung_thuc) >= 0 ? '+' : '')}${(results.conditionB.stats.criteria.trung_thuc - results.conditionCPlus.stats.criteria.trung_thuc).toFixed(2)}`);
  console.log(`----------------------------|-------------|-------------|-------------|-------------|------------`);
  console.log(`Độ dài trung bình (ký tự)   | ${String(results.conditionA.stats.avgCharLength).padEnd(11)} | ${String(results.conditionC.stats.avgCharLength).padEnd(11)} | ${String(results.conditionCPlus.stats.avgCharLength).padEnd(11)} | ${String(results.conditionB.stats.avgCharLength).padEnd(11)} |`);
  console.log(`Số từ trung bình (từ)       | ${String(results.conditionA.stats.avgWordCount).padEnd(11)} | ${String(results.conditionC.stats.avgWordCount).padEnd(11)} | ${String(results.conditionCPlus.stats.avgWordCount).padEnd(11)} | ${String(results.conditionB.stats.avgWordCount).padEnd(11)} |`);
  console.log('========================================================================================\n');

  console.log('📂 BÁO CÁO SỐ CLAIM LOẠI 1 TRUNG BÌNH THEO 4 NHÓM CHỦ ĐỀ:');
  console.log('---------------------------------------------------------------------------------------------------------------------');
  console.log('Nhóm chủ đề                | A (Prompt cũ)| C (CommonRules)| C+ (SmartRewriter)| B (Pack+SmartRewriter)| Tiêu chí B <= C+');
  console.log('---------------------------------------------------------------------------------------------------------------------');
  for (const g of groups) {
    const sA = results.conditionA.groupStats[g] || {};
    const sC = results.conditionC.groupStats[g] || {};
    const sCPlus = results.conditionCPlus.groupStats[g] || {};
    const sB = results.conditionB.groupStats[g] || {};
    const cA = (sA.avgUnbackedClaims || 0).toFixed(2);
    const cC = (sC.avgUnbackedClaims || 0).toFixed(2);
    const cCPlus = (sCPlus.avgUnbackedClaims || 0).toFixed(2);
    const cB = (sB.avgUnbackedClaims || 0).toFixed(2);
    const diff = ((sB.avgUnbackedClaims || 0) - (sCPlus.avgUnbackedClaims || 0)).toFixed(2);
    const isPass = (sB.avgUnbackedClaims || 0) <= (sCPlus.avgUnbackedClaims || 0);
    console.log(`${g.padEnd(26)} | ${cA.padEnd(13)} | ${cC.padEnd(15)} | ${cCPlus.padEnd(18)} | ${cB.padEnd(23)} | ${isPass ? '✅ ĐẠT (B <= C+)' : '❌ CHƯA ĐẠT'} (${diff >= 0 ? '+' : ''}${diff})`);
  }
  console.log('---------------------------------------------------------------------------------------------------------------------\n');

  console.log('📂 CHI TIẾT ĐIỂM & TỈ LỆ THEO 4 NHÓM CHỦ ĐỀ:');
  for (const g of groups) {
    const sA = results.conditionA.groupStats[g] || {};
    const sC = results.conditionC.groupStats[g] || {};
    const sCPlus = results.conditionCPlus.groupStats[g] || {};
    const sB = results.conditionB.groupStats[g] || {};
    console.log(`- Nhóm [${g.toUpperCase()}]:`);
    console.log(`   + Điều kiện A : Điểm TB = ${sA.avgOverall || 0} | Claim Loại 1 = ${sA.avgUnbackedClaims || 0} | Rớt Trung thực = ${sA.honestyFailRate || '0%'}`);
    console.log(`   + Điều kiện C : Điểm TB = ${sC.avgOverall || 0} | Claim Loại 1 = ${sC.avgUnbackedClaims || 0} | Rớt Trung thực = ${sC.honestyFailRate || '0%'}`);
    console.log(`   + Điều kiện C+: Điểm TB = ${sCPlus.avgOverall || 0} | Claim Loại 1 = ${sCPlus.avgUnbackedClaims || 0} | Rớt Trung thực = ${sCPlus.honestyFailRate || '0%'}`);
    console.log(`   + Điều kiện B : Điểm TB = ${sB.avgOverall || 0} | Claim Loại 1 = ${sB.avgUnbackedClaims || 0} | Rớt Trung thực = ${sB.honestyFailRate || '0%'} | PENDING_REVIEW = ${sB.pendingReviewRate || '0%'}`);
  }

  // ═══ TỰ ĐỌC 10 BÀI MẪU KIỂM TRA BỘ CHẤM (CẢ BÀI ĐIỂM CAO & THẤP) ═══
  console.log('\n========================================================================');
  console.log('🔍 TỰ ĐỌC 10 BÀI MẪU KIỂM TRA BỘ CHẤM (GỒM BÀI CAO ĐIỂM VÀ BÀI THẤP ĐIỂM)');
  console.log('========================================================================');
  const allBSamples = [...results.conditionB.samples];
  const sortedB = allBSamples.sort((a, b) => b.avgScore - a.avgScore);
  const topAudit = sortedB.slice(0, 5); // 5 bài điểm cao nhất
  const bottomAudit = sortedB.slice(-5); // 5 bài điểm thấp nhất
  const auditSampleList = [...topAudit, ...bottomAudit];

  auditSampleList.forEach((sample, idx) => {
    console.log(`\n[KIỂM TRA BÀI #${idx + 1}] Chủ đề: "${sample.topic}" (${sample.group}) | Điểm TB: ${sample.avgScore} | Rớt Trung thực: ${sample.failedHonesty ? 'CÓ' : 'KHÔNG'}`);
    console.log(`  Điểm: Hook=${sample.scores.hook}, Giá trị=${sample.scores.gia_tri}, Giọng=${sample.scores.giong_van}, Nhịp=${sample.scores.nhip_va_do_dai}, CTA=${sample.scores.cta}, Sáo rỗng=${sample.scores.sach_sao_rong}, Trung thực=${sample.scores.trung_thuc}`);
    console.log(`  Bằng chứng trích dẫn:`);
    for (const [k, v] of Object.entries(sample.evidence || {})) {
      console.log(`    - ${k}: "${v}"`);
    }
    console.log(`  Nhận xét: "${sample.comment}"`);
    console.log(`  Trích 150 ký tự đầu: "${sample.content.slice(0, 150).replace(/\n/g, ' ')}..."`);
  });

  // ═══ TOP 3 BÀI TỆ NHẤT NHÓM NHẠY CẢM VÀ NHÓM KHÓ Ở ĐIỀU KIỆN B ═══
  console.log('\n========================================================================');
  console.log('🚨 TOP 3 BÀI TỆ NHẤT NHÓM NHẠY CẢM (ĐIỀU KIỆN B - CÓ TOPIC PACK)');
  console.log('========================================================================');
  results.worstSensitiveB.forEach((post, i) => {
    console.log(`\n[BÀI NHẠY CẢM TỆ #${i + 1}] "${post.topic}" (ID: ${post.topicId}) | Điểm TB: ${post.avgScore} | PENDING_REVIEW: ${post.safetyState === 'PENDING_REVIEW' ? 'ĐẠT' : 'KHÔNG'}`);
    console.log(`Điểm chi tiết: Hook: ${post.scores.hook} | Giá trị: ${post.scores.gia_tri} | Giọng: ${post.scores.giong_van} | Nhịp: ${post.scores.nhip_va_do_dai} | CTA: ${post.scores.cta} | Sáo rỗng: ${post.scores.sach_sao_rong} | Trung thực: ${post.scores.trung_thuc}`);
    console.log(`Lý do / Bằng chứng:`);
    for (const [k, v] of Object.entries(post.evidence || {})) {
      console.log(`  - ${k}: "${v}"`);
    }
    console.log(`Nội dung bài viết:\n---\n${post.content}\n---`);
  });

  console.log('\n========================================================================');
  console.log('🚨 TOP 3 BÀI TỆ NHẤT NHÓM KHÓ / LẠ (ĐIỀU KIỆN B - CÓ TOPIC PACK)');
  console.log('========================================================================');
  results.worstDifficultB.forEach((post, i) => {
    console.log(`\n[BÀI KHÓ/LẠ TỆ #${i + 1}] "${post.topic}" (ID: ${post.topicId}) | Điểm TB: ${post.avgScore} | PENDING_REVIEW: ${post.safetyState === 'PENDING_REVIEW' ? 'ĐẠT' : 'KHÔNG'}`);
    console.log(`Điểm chi tiết: Hook: ${post.scores.hook} | Giá trị: ${post.scores.gia_tri} | Giọng: ${post.scores.giong_van} | Nhịp: ${post.scores.nhip_va_do_dai} | CTA: ${post.scores.cta} | Sáo rỗng: ${post.scores.sach_sao_rong} | Trung thực: ${post.scores.trung_thuc}`);
    console.log(`Lý do / Bằng chứng:`);
    for (const [k, v] of Object.entries(post.evidence || {})) {
      console.log(`  - ${k}: "${v}"`);
    }
    console.log(`Nội dung bài viết:\n---\n${post.content}\n---`);
  });
}

runBenchmark().catch((err) => {
  console.error('Lỗi chạy benchmark:', err);
});
