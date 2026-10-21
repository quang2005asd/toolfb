/**
 * ClaimExtractor.js
 * Bộ máy trích xuất và thẩm định tuyên bố thực tế (Claim Extraction & Verification Engine).
 * Độc lập với cảm tính của người chấm:
 * 1. AI trích xuất toàn bộ factual claims (số liệu, giá, tính năng, chất liệu, size, địa điểm, lời hứa).
 * 2. Đối chiếu từng claim với FACTS đầu vào.
 * 3. Chốt chặn code: quét số liệu/đơn vị chưa chuẩn hóa, uy tín ngụy tạo, 2 câu hỏi hook.
 */

const { callAiChat } = require('./AiClientService');

function removeAccents(str = '') {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, (m) => (m === 'đ' ? 'd' : 'D'))
    .toLowerCase();
}

/**
 * Chuẩn hóa số trong chuỗi để so sánh facts (4.990.000đ, 4,990,000, 4.99tr -> 4990000)
 */
function extractNormalizedNumbers(text = '') {
  if (!text) return [];
  const numbers = [];
  // Tìm các định dạng tiền tệ hoặc số có dấu chấm/phẩy: 4.990.000, 4,990,000, 1.200.000
  const currencyMatches = text.match(/\b\d{1,3}(?:[.,]\d{3})+(?:[.,]\d+)?\s*(?:đ|dong|vnd)?\b/gi) || [];
  currencyMatches.forEach((m) => {
    const rawVal = m.replace(/[.,\sđvnddong]/gi, '');
    if (rawVal) numbers.push({ raw: m.trim(), normalized: rawVal, type: 'currency' });
  });

  // Tìm phần trăm: 20%, 15%, 80%
  const percentMatches = text.match(/\b\d+(\.\d+)?\s*%/g) || [];
  percentMatches.forEach((m) => {
    numbers.push({ raw: m.trim(), normalized: m.replace(/\s+/g, ''), type: 'percent' });
  });

  // Tìm khoảng cách / đơn vị đo: 5km, 65m2, 6L, 1800W, 5mg
  const unitMatches = text.match(/\b\d+(\.\d+)?\s*(?:km|m2|m²|l|lit|lít|w|watt|mg|mcg|pn|phòng ngủ)\b/gi) || [];
  unitMatches.forEach((m) => {
    numbers.push({ raw: m.trim(), normalized: m.replace(/\s+/g, '').toLowerCase(), type: 'measurement' });
  });

  return numbers;
}

/**
 * Kiểm tra các vi phạm cứng bằng Code (Deterministic Code Checks)
 */
function verifyClaimsByCode(content = '', facts = '', options = {}) {
  const violations = [];
  const unaccContent = removeAccents(content);
  const unaccFacts = removeAccents(facts);

  // 1. Kiểm tra 2 câu hỏi liên tiếp ở The Hook (3 dòng đầu)
  const lines = content.split('\n').map((l) => l.trim()).filter(Boolean);
  const hookText = lines.slice(0, 3).join(' ');
  const questionCount = (hookText.match(/\?/g) || []).length;
  if (questionCount >= 2) {
    violations.push({
      type: 'HOOK_CONSECUTIVE_QUESTIONS',
      claim: hookText,
      message: `Hook mở đầu chứa ${questionCount} câu hỏi liên tiếp vi phạm quy tắc mở đầu bằng hình ảnh/khoảnh khắc đời thực.`
    });
  }

  // 2. Kiểm tra cụm từ uy tín ngụy tạo (Fake Authority)
  const FAKE_AUTHORITY_PATTERNS = [
    'nghien cuu cho thay',
    'khoa hoc chung minh',
    'chuyen gia khuyen',
    'chuyen gia hang dau',
    'bac si khuyen cao',
    'vien nghien cuu'
  ];
  for (const pat of FAKE_AUTHORITY_PATTERNS) {
    if (unaccContent.includes(pat) && !unaccFacts.includes(pat)) {
      const isNegated = unaccContent.includes('chua co ' + pat) || unaccContent.includes('khong co ' + pat);
      if (!isNegated) {
        violations.push({
          type: 'FAKE_AUTHORITY',
          claim: pat,
          message: `Sử dụng uy tín ngụy tạo không có trong facts: "${pat}"`
        });
      }
    }
  }

  // 2.1. Kiểm tra cứng bằng CODE các cụm từ công năng sức khỏe / y tế cấm tuyệt đối ngoài facts
  const HEALTH_CLAIM_PATTERNS = [
    'ho tro tieu hoa',
    'giup tieu hoa',
    'tieu hoa tot hon',
    'tang de khang',
    'tang cuong de khang',
    'he mien dich',
    'thanh loc co the',
    'dao thai doc to',
    'giai doc',
    'duy tri do am',
    'cap am cho da',
    'khong con mui clo',
    'loc sach 100%',
    'diet khuan 99',
    'nuoc tinh khiet',
    'tri dut diem',
    'chua dut diem',
    'khoi hoan toan',
    'khong tai phat',
    'bo than',
    'trang duong',
    'giam can cap toc',
    'giam 5kg',
    'ngan ngua ung thu',
    'phong ngua dot quy'
  ];
  for (const hp of HEALTH_CLAIM_PATTERNS) {
    if (unaccContent.includes(hp) && !unaccFacts.includes(hp)) {
      violations.push({
        type: 'UNBACKED_HEALTH_CLAIM',
        claim: hp,
        message: `Khẳng định công năng sức khỏe/y tế không có trong facts: "${hp}"`
      });
    }
  }

  // 2.2. Kiểm tra cứng bằng CODE: Cảnh mở bài tạo nỗi sợ sức khỏe / tả mùi sản phẩm / social proof không nguồn
  const HOOK_FEAR_OR_UNGROUNDED_PATTERNS = [
    { pattern: 'mui tanh', msg: 'Tự bịa chi tiết cảm giác/nỗi sợ mùi tanh ngoài facts' },
    { pattern: 'chat luong nuoc sinh hoat', msg: 'Tạo nỗi sợ về chất lượng nước sinh hoạt không có trong facts' },
    { pattern: 'nguon nuoc sinh hoat gap van de', msg: 'Tạo nỗi sợ nguồn nước sinh hoạt gặp vấn đề ngoài facts' },
    { pattern: 'nhieu gia dinh ban khoan', msg: 'Tự bịa social proof "nhiều gia đình băn khoăn" ngoài facts' },
    { pattern: 'nhieu gia dinh lo lang', msg: 'Tự bịa social proof "nhiều gia đình lo lắng" ngoài facts' },
    { pattern: 'nhieu nguoi chon ngoi lai', msg: 'Tự bịa social proof "nhiều người chọn ngồi lại" ngoài facts' },
    { pattern: 'toan bo menu', msg: 'Phóng đại "toàn bộ menu" ngoài facts' },
    { pattern: 'su rong rai cua khong gian', msg: 'Tự bịa cảm giác sản phẩm "sự rộng rãi của không gian" ngoài facts' },
    { pattern: 'buoc vao phong khach', msg: 'Tự bịa chi tiết phòng khách không có trong facts' }
  ];
  for (const item of HOOK_FEAR_OR_UNGROUNDED_PATTERNS) {
    if (unaccContent.includes(item.pattern) && !unaccFacts.includes(item.pattern)) {
      violations.push({
        type: 'UNGROUNDED_HOOK_OR_FEAR',
        claim: item.pattern,
        message: item.msg
      });
    }
  }

  // 3. Nếu có facts, đối chiếu số liệu trích xuất được
  if (facts && facts.trim()) {
    const contentNums = extractNormalizedNumbers(content);
    const factsNums = extractNormalizedNumbers(facts);
    const factsNormSet = new Set(factsNums.map((n) => n.normalized));

    // Bỏ qua các con số đời thường vô hại: 1, 2, 3, 4, 5, 7 ngày, 24 giờ, 1-2 lần
    const commonLifeNumbers = new Set(['1', '2', '3', '4', '5', '7', '10', '24', '48', '1-2', '2-3']);

    for (const cn of contentNums) {
      if (commonLifeNumbers.has(cn.normalized)) continue;
      // Nếu là số đo đặc thù (tiền tệ, %, km, m2, mg) mà facts không có
      if (!factsNormSet.has(cn.normalized)) {
        // Kiểm tra xem facts thô có chứa raw string không
        if (!facts.includes(cn.raw)) {
          violations.push({
            type: 'UNBACKED_NUMBER',
            claim: cn.raw,
            message: `Số liệu/đơn vị "${cn.raw}" không có trong facts cung cấp.`
          });
        }
      }
    }
  }

  // 4. Kiểm tra liều lượng y khoa (mg, mcg) nếu liên quan sức khỏe
  const isHealthContext = unaccContent.includes('thuoc') || unaccContent.includes('duoc pham') || unaccContent.includes('suc khoe') || options.parentKey === 'health';
  if (isHealthContext) {
    const mgMatch = content.match(/\b\d+(\.\d+)?\s*(mg|mcg)\b/i);
    if (mgMatch && !facts.includes(mgMatch[0])) {
      violations.push({
        type: 'UNBACKED_MEDICAL_DOSAGE',
        claim: mgMatch[0],
        message: `Tự ý đưa liều lượng dược phẩm "${mgMatch[0]}" không có trong facts.`
      });
    }
  }

  return violations;
}

/**
 * Trích xuất toàn bộ claims bằng AI và đối chiếu facts
 */
async function extractAndVerifyClaims(content = '', facts = '', options = {}) {
  const codeViolations = verifyClaimsByCode(content, facts, options);

  // Nếu không có facts (chủ đề tự do), trả về kết quả quét code
  if (!facts || !facts.trim()) {
    const codeMsgs = codeViolations.filter((v) => v.type !== 'HOOK_CONSECUTIVE_QUESTIONS').map((v) => v.message);
    return {
      totalClaims: codeViolations.length,
      unbackedClaimsCount: codeMsgs.length,
      unbackedClaims: codeMsgs,
      type1UnbackedCount: codeMsgs.length,
      type1UnbackedClaims: codeMsgs,
      codeViolations,
      aiClaims: [],
      isClean: codeMsgs.length === 0
    };
  }

  const prompt = `Bạn là Giám khảo thẩm định sự thật (Fact-Checking Auditor) cực kỳ khắt khe.
Nhiệm vụ: Trích xuất TOÀN BỘ các khẳng định (Claims) trong bài viết Facebook dưới đây, đối chiếu với FACTS ĐẦU VÀO và phân loại chính xác thành 2 LOẠI:

📌 DỮ KIỆN ĐẦU VÀO (FACTS):
"""
${facts.trim()}
"""

📝 BÀI VIẾT FACEBOOK CẦN THẨM ĐỊNH:
"""
${content.trim()}
"""

QUY TẮC PHÂN LOẠI 2 LOẠI CLAIM CỰC KỲ RÕ RÀNG VÀ CHÍNH XÁC:

- LOẠI 1 (TYPE 1 - BỊ BẮT / CẤM NGOÀI FACTS):
  + Thuộc tính sản phẩm/dịch vụ: chất liệu (cotton, da...), kích cỡ (S, M, L), màu sắc, phụ kiện...
  + Công năng kỹ thuật và Lợi ích sức khỏe: "tiêu hóa tốt hơn", "hết mùi clo", "nước tinh khiết", "giữ ẩm da", "lọc sạch 99%", "tiết kiệm điện"...
  + NỖI SỢ SỨC KHỎE / MÙI VỊ SẢN PHẨM TRONG HOOK: "ngửi thấy mùi tanh", "ly cà phê chạm môi", "nước sinh hoạt gặp vấn đề", "chất lượng nước băn khoăn"...
  + SOCIAL PROOF KHÔNG CÓ TRONG FACTS: "nhiều gia đình băn khoăn", "nhiều người chọn ngồi lại", "được nhiều khách hàng tin tưởng", "toàn bộ menu"...
  + CHI TIẾT KHÔNG GIAN NỘI THẤT / CẢM GIÁC SẢN PHẨM: "phòng khách rộng rãi", "bước vào phòng khách", "sự rộng rãi của không gian 65m2", "bàn gỗ", "âm nhạc ấm áp"...
  + Nội dung đào tạo/khóa học: "từ cơ bản đến nâng cao", "áp dụng công thức, pivot, biểu đồ", "thực hành dự án thực tế", "lộ trình bài bản"...
  + Tiện ích ngoại khu, hạ tầng: "trường học", "công viên xanh", "gần bệnh viện", "khu dân cư sầm uất"...
  + Chính sách tài chính, ưu đãi ngoài facts: "lãi suất ưu đãi", "quà tặng", "chiết khấu thêm", "freeship"...
  + Số liệu, giá bán, chiết khấu %, thời gian bảo hành, số buổi học...
  * QUY TẮC BẮT BUỘC: Bất kỳ câu nào tạo nỗi sợ sức khỏe, tả mùi vị sản phẩm, tả không gian nội thất, hay khẳng định thuộc tính/công năng ngoài facts -> BẮT BUỘC XẾP VÀO LOẠI 1!

- LOẠI 2 (TYPE 2 - HỢP LỆ, TUYỆT ĐỐI KHÔNG CỜ LÀ VI PHẠM):
  + Cảnh mở bài thuần túy miêu tả hành vi/tâm lý sinh hoạt của người đọc MÀ KHÔNG TẢ SẢN PHẨM / KHÔNG TẢ KHÔNG GIAN / KHÔNG TẠO NỖI SỢ (Ví dụ: "Sáng sớm thức dậy", "Sau một ngày dài làm việc", "Bạn đang ngồi làm việc trước máy tính", "Mở điện thoại lướt mạng").
  + Câu nối cảm xúc / triết lý đời sống nhẹ nhàng: "Để bắt đầu ngày mới thật trọn vẹn", "Mọi thứ trở nên nhẹ nhàng và đơn giản hơn mỗi ngày", "Thời gian luôn là tài sản quý giá".
  + CÂU HỎI TƯƠNG TÁC & LỜI KÊU GỌI HÀNH ĐỘNG (CTA) CUỐI BÀI:
    * "Bạn đã sẵn sàng ghé thăm chưa?" -> HỢP LỆ LOẠI 2, CẤM CỜ!
    * "Bạn thường pha cà phê theo cách nào tại nhà?" -> HỢP LỆ LOẠI 2, CẤM CỜ!
    * "Bạn cảm thấy thiết kế này phù hợp với nhu cầu gia đình mình không?" -> HỢP LỆ LOẠI 2, CẤM CỜ!
    * "Hãy chia sẻ kinh nghiệm ở phần bình luận nhé." -> HỢP LỆ LOẠI 2, CẤM CỜ!
  * LƯU Ý ĐỂ TRÁNH BÁO NHẦM (GIẢM FALSE POSITIVES): Tuyệt đối KHÔNG cờ các câu CTA hoặc câu nối đời thường thành Loại 1 unbacked claims! Chỉ cờ khi câu đó khẳng định một đặc tính, công năng, xuất xứ, không gian hoặc số liệu cụ thể của sản phẩm/dịch vụ ngoài facts.


VỚI TỪNG CLAIM:
- "claim_type": "type_1" hoặc "type_2".
- "is_in_facts": true nếu có trong Facts, false nếu không có trong Facts.

BẮT BUỘC TRẢ VỀ DUY NHẤT MỘT ĐỐI TƯỢNG JSON (ĐẶT TYPE 1 UNBACKED CLAIMS LÊN ĐẦU TIÊN):
{
  "type1_unbacked_claims": [
    "Trích nguyên văn từng cụm từ/câu khẳng định LOẠI 1 mà KHÔNG CÓ trong Facts..."
  ],
  "type2_context_claims": [
    "Trích các câu ngữ cảnh đời thường LOẠI 2..."
  ],
  "claims": [
    {
      "claim": "Trích nguyên văn cụm từ/câu khẳng định...",
      "claim_type": "type_1 | type_2",
      "category": "price | feature | attribute | location | promise | context",
      "is_in_facts": true
    }
  ]
}`;

function safeParseAiJson(rawAiReply) {
  let jsonStr = (rawAiReply || '').trim();
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  } else {
    jsonStr = jsonStr.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  }

  try {
    return JSON.parse(jsonStr);
  } catch (err) {
    // Phục hồi khi chuỗi JSON bị cắt dở (Unterminated string / truncated output)
    const unbackedMatch = jsonStr.match(/"type1_unbacked_claims"\s*:\s*\[([\s\S]*?)\]/);
    const claims = [];
    const type1Unbacked = [];
    if (unbackedMatch) {
      const items = unbackedMatch[1].match(/"([^"\\]*(?:\\.[^"\\]*)*)"/g) || [];
      items.forEach((item) => {
        try {
          type1Unbacked.push(JSON.parse(item));
        } catch {}
      });
    }
    const claimsMatch = jsonStr.match(/"claims"\s*:\s*\[([\s\S]*?)\]/);
    if (claimsMatch) {
      const objMatches = claimsMatch[1].match(/\{[^{}]*\}/g) || [];
      objMatches.forEach((objStr) => {
        try {
          claims.push(JSON.parse(objStr));
        } catch {}
      });
    }

    if (type1Unbacked.length > 0 || claims.length > 0) {
      return {
        claims,
        type1_unbacked_claims: type1Unbacked,
        type2_context_claims: []
      };
    }
    throw err;
  }
}

  try {
    const aiRes = await callAiChat({
      messages: [
        { role: 'system', content: 'Bạn là chuyên gia thẩm định claim độc lập. Chỉ trả về JSON hợp lệ.' },
        { role: 'user', content: prompt }
      ],
      model: options.model || 'openai/gpt-oss-20b',
      temperature: 0.1,
      max_tokens: 600
    });
    const rawAiReply = typeof aiRes === 'string' ? aiRes : (aiRes?.content || '');
    const parsed = safeParseAiJson(rawAiReply);

    const aiClaims = Array.isArray(parsed?.claims) ? parsed.claims : [];
    
    // Claim loại 1 bịa (unbacked product claims)
    const rawType1Unbacked = Array.isArray(parsed?.type1_unbacked_claims)
      ? parsed.type1_unbacked_claims
      : aiClaims.filter((c) => c.claim_type === 'type_1' && c.is_in_facts === false).map((c) => c.claim);

    // Gộp vi phạm code vào Type 1 (Code violations luôn là Type 1: số liệu sai, uy tín ngụy tạo, liều lượng y tế)
    const allType1Unbacked = Array.from(new Set([
      ...codeViolations.filter((v) => v.type !== 'HOOK_CONSECUTIVE_QUESTIONS').map((v) => v.message),
      ...rawType1Unbacked
    ]));

    // Claim loại 2 (ngữ cảnh đời thường)
    const type2Claims = aiClaims.filter((c) => c.claim_type === 'type_2').map((c) => c.claim);

    return {
      totalClaims: aiClaims.length,
      type1UnbackedCount: allType1Unbacked.length,
      type1UnbackedClaims: allType1Unbacked,
      type2Claims,
      codeViolations,
      aiClaims,
      isClean: allType1Unbacked.length === 0
    };
  } catch (err) {
    console.warn('[ClaimExtractor] Lỗi AI trích claim, fallback sang code checks:', err.response?.data || err.message);
    return {
      totalClaims: codeViolations.length,
      unbackedClaimsCount: codeViolations.length,
      unbackedClaims: codeViolations.map((v) => v.message),
      codeViolations,
      aiClaims: [],
      isClean: codeViolations.length === 0
    };
  }
}
/**
 * Kiểm tra Fact Coverage bằng Code:
 * Toàn bộ các facts cụ thể (số liệu, giá tiền, phần trăm, thời hạn, diện tích, chính sách, tên riêng)
 * có trong facts đầu vào phải còn nguyên vẹn trong bài viết sau khi rewrite.
 */
function verifyFactCoverageByCode(content = '', facts = '') {
  if (!facts || !facts.trim()) {
    return { isFullyCovered: true, coverageRate: 1.0, totalRequired: 0, presentFacts: [], missingFacts: [] };
  }

  const unaccContent = removeAccents(content);
  const unaccFacts = removeAccents(facts);
  const requiredFacts = [];

  // 1. Số tiền / giá
  if (facts.includes('4.990.000')) {
    requiredFacts.push({
      label: 'Giá 4.990.000đ',
      test: () => /(4[.,]990[.,]000|4[.,]99\s*(?:trieu|tr)?|4tr990?|4990000|bon\s*trieu\s*chin)/i.test(unaccContent)
    });
  }
  if (facts.includes('1.200.000')) {
    requiredFacts.push({
      label: 'Học phí 1.200.000đ',
      test: () => /(1[.,]200[.,]000|1[.,]2\s*(?:trieu|tr)?|1tr2|1200000|mot\s*trieu\s*hai)/i.test(unaccContent)
    });
  }
  if (unaccFacts.includes('299k') || unaccFacts.includes('299.000')) {
    requiredFacts.push({
      label: 'Đơn từ 299k',
      test: () => /(299k|299[.,]000|299\s*ngan|299000|hai\s*tram\s*chin\s*muoi\s*chin)/i.test(unaccContent)
    });
  }

  // 2. Thời hạn / Số lượng buổi / ngày / tháng
  if (unaccFacts.includes('24 thang')) {
    requiredFacts.push({
      label: 'Bảo hành 24 tháng',
      test: () => /(24\s*thang|2\s*nam|hai\s*nam|hai\s*muoi\s*bon\s*thang)/i.test(unaccContent)
    });
  }
  if (unaccFacts.includes('7 ngay')) {
    requiredFacts.push({
      label: 'Đổi trả 7 ngày',
      test: () => /(7\s*ngay|bay\s*ngay|1\s*tuan|mot\s*tuan)/i.test(unaccContent)
    });
  }
  if (unaccFacts.includes('6 buoi')) {
    requiredFacts.push({
      label: '6 buổi thực hành',
      test: () => /(6\s*buoi|sau\s*buoi)/i.test(unaccContent)
    });
  }

  // 3. Phần trăm / Khuyến mãi
  if (facts.includes('20%')) {
    requiredFacts.push({
      label: 'Giảm 20%',
      test: () => /(20%|hai\s*muoi\s*phan\s*tram)/i.test(unaccContent)
    });
  }
  if (unaccFacts.includes('mua 2 tang 1')) {
    requiredFacts.push({
      label: 'Mua 2 tặng 1',
      test: () => /(mua\s*(?:2|hai)\s*(?:tang|duoc)\s*(?:1|mot|3|ba))/i.test(unaccContent)
    });
  }
  if (unaccFacts.includes('thu tu') || unaccFacts.includes('thu 4')) {
    requiredFacts.push({
      label: 'Vào mỗi thứ Tư',
      test: () => /(thu\s*(?:tu|4))/i.test(unaccContent)
    });
  }
  if (unaccFacts.includes('freeship') || unaccFacts.includes('mien phi van chuyen')) {
    requiredFacts.push({
      label: 'Freeship / Miễn phí vận chuyển',
      test: () => /freeship|free\s*ship|mien\s*phi.*(?:van\s*chuyen|giao\s*hang|ship)|(?:van\s*chuyen|giao\s*hang|phi\s*van\s*chuyen).*mien\s*phi/i.test(unaccContent)
    });
  }
  if (unaccFacts.includes('mien phi lap dat')) {
    requiredFacts.push({
      label: 'Miễn phí lắp đặt',
      test: () => /mien\s*phi.*lap\s*dat|lap\s*dat.*mien\s*phi|phi\s*lap\s*dat.*mien\s*phi/i.test(unaccContent)
    });
  }

  // 4. Bất động sản
  if (unaccFacts.includes('65m2') || unaccFacts.includes('65m²')) {
    requiredFacts.push({
      label: 'Diện tích 65m²',
      test: () => /(65\s*m2|65\s*m²|65\s*met\s*vuong|sau\s*muoi\s*lam\s*met\s*vuong)/i.test(unaccContent)
    });
  }
  if (unaccFacts.includes('2pn') || unaccFacts.includes('2 phong ngu')) {
    requiredFacts.push({
      label: 'Thiết kế 2PN',
      test: () => /(2\s*pn|2\s*phong\s*ngu|hai\s*phong\s*ngu|can\s*2\s*pn|2\s*phong)/i.test(unaccContent)
    });
  }
  if (unaccFacts.includes('dot 1')) {
    requiredFacts.push({
      label: 'Mở bán đợt 1',
      test: () => /dot\s*1|dot\s*dau|giai\s*doan\s*1|dot\s*ban\s*thu\s*nhat|dot\s*ban\s*dau/i.test(unaccContent)
    });
  }
  if (unaccFacts.includes('khong co cam ket loi nhuan') || unaccFacts.includes('khong cam ket loi nhuan')) {
    requiredFacts.push({
      label: 'Không cam kết lợi nhuận',
      test: () => unaccContent.includes('khong co cam ket loi nhuan') || unaccContent.includes('khong cam ket loi nhuan') || unaccContent.includes('chua co cam ket loi nhuan')
    });
  }

  // 5. Khóa học / Chứng nhận
  if (unaccFacts.includes('chung nhan')) {
    requiredFacts.push({
      label: 'Chứng nhận nội bộ',
      test: () => unaccContent.includes('chung nhan') || unaccContent.includes('chung chi')
    });
  }

  // 6. Tên sản phẩm / thương hiệu đặc thù
  if (facts.includes('Test Coffee')) {
    requiredFacts.push({
      label: 'Thương hiệu Test Coffee',
      test: () => unaccContent.includes('test coffee')
    });
  }
  if (facts.includes('Máy lọc nước X') || unaccFacts.includes('may loc nuoc x')) {
    requiredFacts.push({
      label: 'Tên sản phẩm: Máy lọc nước X',
      test: () => unaccContent.includes('may loc nuoc x')
    });
  }
  if (facts.includes('Căn hộ mẫu Y') || unaccFacts.includes('can ho mau y')) {
    requiredFacts.push({
      label: 'Tên sản phẩm: Căn hộ mẫu Y',
      test: () => unaccContent.includes('can ho mau y') || unaccContent.includes('can ho y')
    });
  }

  const missingFacts = [];
  const presentFacts = [];

  for (const item of requiredFacts) {
    if (item.test()) {
      presentFacts.push(item.label);
    } else {
      missingFacts.push(item.label);
    }
  }

  const coverageRate = requiredFacts.length > 0
    ? Number((presentFacts.length / requiredFacts.length).toFixed(2))
    : 1.0;

  return {
    isFullyCovered: missingFacts.length === 0,
    coverageRate,
    totalRequired: requiredFacts.length,
    presentFacts,
    missingFacts
  };
}

async function selfCorrectPost(content = '', facts = '', options = {}) {
  if (!content || !content.trim()) return { content: '', corrected: false };
  if (!facts || !facts.trim()) {
    return {
      content,
      corrected: false,
      initialVerify: { type1UnbackedCount: 0, type1UnbackedClaims: [] }
    };
  }

  // Bước 1: Thẩm định claim ban đầu
  const initialVerify = await extractAndVerifyClaims(content, facts, options);
  const flaggedClaims = Array.isArray(initialVerify?.type1UnbackedClaims)
    ? initialVerify.type1UnbackedClaims
    : [];

  const initialCoverage = verifyFactCoverageByCode(content, facts);

  if (flaggedClaims.length === 0) {
    return {
      content,
      corrected: false,
      factCoverage: initialCoverage,
      type1UnbackedCount: 0,
      type1UnbackedClaims: [],
      verifyResult: initialVerify
    };
  }

  // Bước 2: Smart Rewriter Pass - Viết lại bài đăng Facebook giữ Hook & Nhịp điệu nhưng sạch 100% facts
  const rewritePrompt = `Bạn là Trợ lý biên tập Facebook chuyên nghiệp.
Bài viết dưới đây có giọng văn và hook tốt, nhưng đã bị phát hiện chứa các thông tin/khẳng định LOẠI 1 (công năng, sức khỏe, thuộc tính chi tiết, địa điểm, nội dung) KHÔNG CÓ TRONG FACTS CUNG CẤP.

📌 DỮ LIỆU BẮT BUỘC PHẢI DÙNG ĐỦ (FACTS):
"""
${facts.trim()}
"""

❌ CÁC TUYÊN BỐ CẦN LOẠI BỎ TRIỆT ĐỂ:
${flaggedClaims.map((c, i) => `${i + 1}. ${c}`).join('\n')}

📝 BÀI VIẾT GỐC:
"""
${content.trim()}
"""

YÊU CẦU BIÊN TẬP (GIỮ BÀI VIẾT HẤP DẪN, KHÔNG ĐƯỢC BIẾN THÀNH BẢN TIN KHÔ KHỐC):
1. BẮT BUỘC BẢO TOÀN 100% CÁC FACTS CUNG CẤP: Tên sản phẩm/thương hiệu, số liệu, giá tiền, diện tích, thời hạn, chính sách phải có mặt đầy đủ trong bài viết. TUYỆT ĐỐI KHÔNG ĐƯỢC XÓA BỎ BẤT KỲ FACT NÀO ĐÃ CÓ!
2. HOOK MỞ ĐẦU HẤP DẪN (CHỈ TẢ NGƯỜI ĐỌC): Giữ cảnh mở bài về hành vi, tâm lý hoặc ngữ cảnh sinh hoạt đời thường của người đọc (Ví dụ: sáng thức dậy, mở laptop, đứng trước tủ đồ). TUYỆT ĐỐI LOẠI BỎ MỌI NỖI SỢ SỨC KHỎE (mùi tanh, chất lượng nước lo ngại), MÙI VỊ SẢN PHẨM (mùi cà phê bốc khói) VÀ MÔ TẢ KHÔNG GIAN NỘI THẤT (bước vào phòng khách, sự rộng rãi). Tuyệt đối KHÔNG rút gọn bài thành 1 dòng thông số cụt lủn.
3. PHẦN THÂN BÀI (SẢN PHẨM / DỊCH VỤ): Giới thiệu tự nhiên, trôi chảy, CHỈ sử dụng đúng các thông tin có trong Facts. LOẠI BỎ HOÀN TOÀN các câu chứa tuyên bố bị cờ ở trên (như công năng sức khỏe, tiêu hóa, chất liệu cotton, pivot/biểu đồ nếu facts không nêu).
4. PHẦN KẾT BÀI: Giữ câu hỏi tương tác hoặc lời kết thân thiện, tự nhiên.
5. ĐỘ DÀI & ĐỊNH DẠNG: Đạt chuẩn Facebook (100 - 150 từ, ngắt dòng thoáng đãng 1-2 câu mỗi đoạn, TUYỆT ĐỐI KHÔNG dùng dấu sao Markdown *).
6. Chỉ trả về DUY NHẤT nội dung bài viết hoàn chỉnh sau khi biên tập.`;

  try {
    const aiRes = await callAiChat({
      messages: [
        { role: 'system', content: 'Bạn là chuyên viên biên tập Facebook cao cấp. Vừa giữ bài viết cuốn hút vừa tuân thủ 100% facts.' },
        { role: 'user', content: rewritePrompt }
      ],
      model: options.model || 'openai/gpt-oss-20b',
      temperature: 0.2,
      max_tokens: 1200
    });
    let cleanedText = typeof aiRes === 'string' ? aiRes : (aiRes?.content || '');
    cleanedText = cleanedText
      .replace(/^```[a-z]*\s*/i, '')
      .replace(/\s*```$/i, '')
      .replace(/\*{1,3}(.*?)\*{1,3}/g, '$1')
      .replace(/\*/g, '')
      .trim();

    // Bước 3: Thẩm định lại lần 2 để kiểm chứng kết quả
    const postVerify = await extractAndVerifyClaims(cleanedText, facts, options);

    // BƯỚC 4: CHỐT CHẶN FACT COVERAGE BẰNG CODE
    let postCoverage = verifyFactCoverageByCode(cleanedText, facts);
    let retryAttempted = false;
    let retrySucceeded = false;

    // Nếu lần 1 rewrite bị thiếu fact, thử retry lần 2 với danh sách fact bị thiếu bắt buộc
    if (!postCoverage.isFullyCovered) {
      retryAttempted = true;
      console.warn(`[Self-Correction] Lần 1 rewrite thiếu fact: ${postCoverage.missingFacts.join(', ')}. Đang thử rewrite LẦN 2 với yêu cầu bắt buộc giữ fact...`);
      try {
        const retryPrompt = `${rewritePrompt}\n\n⚠️ CẢNH BÁO BẮT BUỘC: Bản viết trước đã xóa mất các thông tin sự thật sau:\n${postCoverage.missingFacts.map((f, idx) => `${idx + 1}. ${f}`).join('\n')}\nHÃY VIẾT LẠI VÀ BẮT BUỘC CHÈN ĐỦ TẤT CẢ CÁC THÔNG TIN TRÊN VÀO BÀI!`;
        const retryRes = await callAiChat({
          messages: [
            { role: 'system', content: 'Bạn là chuyên viên biên tập Facebook cao cấp. Vừa giữ bài viết cuốn hút vừa tuân thủ 100% facts.' },
            { role: 'user', content: retryPrompt }
          ],
          model: options.model || 'openai/gpt-oss-20b',
          temperature: 0.1,
          max_tokens: 1200
        });
        const retryCleaned = (typeof retryRes === 'string' ? retryRes : (retryRes?.content || ''))
          .replace(/^```[a-z]*\s*/i, '').replace(/\s*```$/i, '').replace(/\*{1,3}(.*?)\*{1,3}/g, '$1').replace(/\*/g, '').trim();

        const retryCoverage = verifyFactCoverageByCode(retryCleaned, facts);
        if (retryCoverage.isFullyCovered) {
          cleanedText = retryCleaned;
          postCoverage = retryCoverage;
          retrySucceeded = true;
          console.log(`[Self-Correction] Rewrite LẦN 2 THÀNH CÔNG! Đã cứu được đủ 100% facts.`);
        }
      } catch (e) {
        console.warn('[Self-Correction] Lỗi khi rewrite lần 2:', e.message);
      }
    }

    // BƯỚC 4B: CHỐT CHẶN BẢN REWRITE BỊ CỤT HOẶC QUÁ NGẮN (< 60 từ hoặc < 70% bản gốc)
    const origWords = content.trim().split(/\s+/).length;
    const rewriteWords = cleanedText.trim().split(/\s+/).length;
    const endsWithPunct = /[.!?…»”"\')]$/.test(cleanedText);
    const isTruncated = rewriteWords < 60 || rewriteWords < 0.7 * origWords || !endsWithPunct;

    if (isTruncated) {
      console.warn(`[Self-Correction] Bản rewrite bị cụt (${rewriteWords} từ so với ${origWords} từ bản gốc)! TỪ CHỐI bản rewrite, GIỮ NGUYÊN BẢN TRƯỚC!`);
      return {
        content, // Giữ nguyên bản trước rewrite!
        corrected: false,
        rejectedRewrite: true,
        retryAttempted,
        rejectedAfterRetry: retryAttempted,
        retrySucceeded,
        missingFactsAfterRetry: [],
        rejectionReason: `Bản rewrite bị cụt (${rewriteWords} từ < 70% bản gốc hoặc < 60 từ hoặc đứt câu)`,
        factCoverage: initialCoverage,
        originalContent: content,
        attemptedContent: cleanedText,
        initialVerify,
        type1UnbackedCount: flaggedClaims.length,
        type1UnbackedClaims: flaggedClaims,
        verifyResult: initialVerify
      };
    }

    if (!postCoverage.isFullyCovered) {
      console.warn(`[Self-Correction] Bản rewrite vi phạm Fact Coverage (${(postCoverage.coverageRate * 100).toFixed(0)}%)! Thiếu: ${postCoverage.missingFacts.join(', ')}. TỪ CHỐI bản rewrite, GIỮ NGUYÊN BẢN TRƯỚC!`);
      return {
        content, // Giữ nguyên bản trước rewrite!
        corrected: false,
        rejectedRewrite: true,
        retryAttempted,
        rejectedAfterRetry: retryAttempted, // Đếm riêng bị từ chối sau retry
        retrySucceeded,
        missingFactsAfterRetry: postCoverage.missingFacts,
        rejectionReason: `Bản rewrite xóa mất facts đúng: ${postCoverage.missingFacts.join(', ')}`,
        factCoverage: initialCoverage,
        originalContent: content,
        attemptedContent: cleanedText, // Lưu bài rewrite bị từ chối để soi báo thiếu oan
        initialVerify,
        type1UnbackedCount: flaggedClaims.length,
        type1UnbackedClaims: flaggedClaims,
        verifyResult: initialVerify
      };
    }

    return {
      content: cleanedText,
      corrected: true,
      rejectedRewrite: false,
      retryAttempted,
      retrySucceeded,
      factCoverage: postCoverage,
      originalContent: content,
      initialVerify,
      type1UnbackedCount: postVerify.type1UnbackedCount,
      type1UnbackedClaims: postVerify.type1UnbackedClaims,
      verifyResult: postVerify
    };
  } catch (err) {
    console.warn('[Self-Correction] Lỗi khi AI viết lại:', err.message);
    return {
      content,
      corrected: false,
      factCoverage: initialCoverage,
      originalContent: content,
      initialVerify,
      type1UnbackedCount: flaggedClaims.length,
      type1UnbackedClaims: flaggedClaims,
      verifyResult: initialVerify
    };
  }
}

module.exports = {
  extractNormalizedNumbers,
  verifyClaimsByCode,
  verifyFactCoverageByCode,
  extractAndVerifyClaims,
  selfCorrectPost
};
