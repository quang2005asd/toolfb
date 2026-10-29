/**
 * TopicPackService.js
 * Quản lý Topic Packs, phân loại chủ đề nhạy cảm, gộp luật an toàn Meta,
 * và theo dõi PostFeedback theo đặc tả hệ thống.
 */

const { sql, getPool } = require('../../config/db');
const { callAiChat } = require('./AiClientService');
const { CRITICAL_RISK_KEYWORDS, MEDIUM_RISK_KEYWORDS } = require('./PostStateMachine');

// ═══ 1. COMMON RULES BẤT BIẾN (IMMUTABLE BASE RULES) ═══
const COMMON_RULES = {
  must_not: [
    'Tuyệt đối KHÔNG dùng dấu sao (*) hoặc cú pháp Markdown (**in đậm**, *in nghiêng*, ***chữ***) vì Facebook không hỗ trợ.',
    'TUYỆT ĐỐI KHÔNG vi phạm Tiêu chuẩn cộng đồng Facebook và Luật Quảng cáo VN (hàng giả, hàng nhái, thuốc cấm, cờ bạc, súng đạn, chất kích thích).',
    'KHÔNG cam kết hiệu quả 100%, không cam kết khỏi bệnh hoặc kết quả tức thì không có cơ sở khoa học.',
    'KHÔNG tự ý bịa đặt thông tin thực tế, tỷ số, kết quả, chi tiết sự kiện chưa kiểm chứng (chống hallucination).',
    'KHÔNG tự bịa giá bán, ưu đãi, thành phần nếu người dùng chưa cung cấp trong facts.',
    'TUYỆT ĐỐI KHÔNG tự bịa số liệu, phần trăm (%), khoảng cách (km), liều lượng (mg, ml) ngoài facts.',
    'TUYỆT ĐỐI KHÔNG sử dụng uy tín ngụy tạo ("nghiên cứu cho thấy", "khoa học chứng minh", "chuyên gia khuyên", "bác sĩ khuyến cáo") nếu facts không cung cấp nguồn.',
    'CẤM bịa đặt social proof không có trong facts ("được nhiều người yêu thích", "đánh giá cao", "bán chạy", "khách hàng khen ngợi", "hàng ngàn người tin dùng").',
    'CẤM tự ý hứa hẹn thứ không có trong facts (tặng checklist, ebook, voucher, tài liệu, tư vấn miễn phí). CTA chỉ mời comment chia sẻ ý kiến hoặc trao đổi kinh nghiệm.',
    'CẤM viết 2 câu hỏi liên tiếp ở phần mở đầu (hook). Phải mở đầu bằng một hình ảnh, khoảnh khắc hoặc tình huống cụ thể.',
    'CẤM các cụm từ sáo rỗng: "hạt hạnh phúc", "không lãng phí, tận hưởng từng khoảnh khắc", "hãy thử ngay hôm nay", "thời đại 4.0", "hãy cùng khám phá", "trong cuộc sống hiện đại".',
    'CẤM bịa công thức đầu tư sinh lời hoặc hứa hẹn làm giàu nhanh đối với các chủ đề tài chính / mồi lòng tham.'
  ],
  must_do: [
    'Tối ưu 3 dòng đầu (The Hook) bằng một hình ảnh, tình huống hoặc chi tiết đời thực cụ thể để dừng ngón tay người lướt Feed trên điện thoại.',
    'Trình bày ngắt dòng thoáng đãng, mỗi đoạn chỉ dài 1 - 2 câu ngắn.',
    'Lời kêu gọi hành động (CTA) ở cuối bài phải rõ ràng, tự nhiên và gắn liền hành vi cụ thể (inbox tư vấn, để lại bình luận để nhận hỗ trợ, ghé quán trải nghiệm); TUYỆT ĐỐI CẤM câu hỏi tu từ chung chung nhạt nhẽo ("Bạn đã sẵn sàng chưa?", "Bạn nghĩ sao?"), không hứa hẹn quà ngoài facts.',
    'Chỉ dùng số liệu, giá, ưu đãi có trong phần facts. Nếu facts thiếu thông tin cho một bước trong cấu trúc bài, BỎ QUA BƯỚC ĐÓ, tuyệt đối không được tự ý bịa thêm chi tiết để lấp đầy cấu trúc.',
    'Mẹo và kiến thức: chỉ viết những điều phổ biến, chuẩn xác và chắc chắn về khoa học/đời sống. Không chắc thì bỏ qua.'
  ],
  risky_claims: [
    'Cam kết 100%, trị dứt điểm, khỏi hẳn sau 1 đêm, hoàn tiền 200%',
    'Hàng rep 1:1, super fake, auth tuồn',
    'Bao lô đề, tài xỉu, kèo baccarat, kiếm tiền hoa hồng',
    'Được nhiều người đánh giá cao, bán chạy nhất thị trường, nhận ngay checklist/ebook'
  ]
};

// ═══ 2. NGÀNH NGHỀ & LUẬT VALIDATOR CHUYÊN BIỆT (INDUSTRY RULES) ═══
const INDUSTRY_RULES = {
  health: {
    parent_key: 'health',
    display_name: 'Sức khỏe & Y tế',
    sensitivity: 'high',
    must_not: [
      'Không dùng các từ: thuốc tiên, thần dược, trị dứt điểm 100%, chữa khỏi vĩnh viễn.',
      'Không đưa ra lời khuyên y khoa thay thế bác sĩ hoặc phác đồ điều trị chuyên môn.',
      'Không phóng đại hiệu quả phục hồi sức khỏe cấp tốc.',
      'TUYỆT ĐỐI CẤM đưa ra liều lượng sử dụng cụ thể (mg, mcg) ngoài facts.',
      'CẤM quảng cáo thuốc kê đơn (thuốc ngủ, thuốc an thần, kháng sinh). Mọi bài viết liên quan thuốc và sức khỏe nhạy cảm bắt buộc chuyển sang PENDING_REVIEW để chuyên gia phê duyệt.',
      'CẤM quảng cáo sản phẩm thay thế sữa mẹ cho trẻ nhỏ dưới 24 tháng tuổi; bắt buộc thông điệp bảo vệ sữa mẹ.'
    ],
    must_do: [
      'Khuyên độc giả tham khảo ý kiến chuyên gia y tế hoặc bác sĩ khi cần.',
      'Nêu rõ sản phẩm không phải là thuốc và không có tác dụng thay thế thuốc chữa bệnh nếu là TPCN.',
      'Với bài viết liên quan trẻ nhỏ, bắt buộc ghi rõ: Sữa mẹ là thức ăn tốt nhất cho sự phát triển toàn diện của trẻ sơ sinh và trẻ nhỏ.'
    ],
    facts_needed: ['Giấy phép công bố/quảng cáo', 'Thành phần hoạt chất chính', 'Nguồn gốc xuất xứ']
  },
  beauty: {
    parent_key: 'beauty',
    display_name: 'Làm đẹp & Mỹ phẩm',
    sensitivity: 'high',
    must_not: [
      'Không cam kết trắng da sau 3 ngày, lột xác thần tốc, xóa sạch nám 100%.',
      'Không quảng cáo kem trộn, hoạt chất cấm, hoặc so sánh dìm hàng sản phẩm khác.',
      'Không sử dụng hình ảnh mang tính phản cảm hoặc giật gân.'
    ],
    must_do: [
      'Nhấn mạnh chu trình chăm sóc da khoa học, an toàn, kiên trì.',
      'Tư vấn phù hợp theo từng loại da (da dầu, da khô, da nhạy cảm).'
    ],
    facts_needed: ['Loại da phù hợp', 'Thành phần nổi bật (B5, Niacinamide, Retinol...)', 'Cách sử dụng an toàn']
  },
  finance: {
    parent_key: 'finance',
    display_name: 'Tài chính & Đầu tư',
    sensitivity: 'high',
    must_not: [
      'Không cam kết lợi nhuận cố định x2, x3, bao lỗ, bao lời.',
      'Không lôi kéo chơi cờ bạc, tài xỉu, tiền ảo phi pháp, đa cấp biến tướng.',
      'Không hối thúc khách chuyển khoản gấp vào số tài khoản cá nhân không minh bạch.',
      'TUYỆT ĐỐI CẤM bịa công thức đầu tư hoặc cam kết kiếm tiền nhanh (ví dụ 50 triệu/tháng).'
    ],
    must_do: [
      'Cảnh báo rủi ro biến động thị trường tài chính hai chiều.',
      'Cung cấp thông tin minh bạch, tuân thủ quy định pháp luật tài chính VN.',
      'Chuyển hướng cứng (Hard Pivot) với các bẫy làm giàu nhanh: khẳng định không có phép thuật kiếm tiền cấp tốc, hướng vào nâng cao năng lực giải quyết vấn đề.'
    ],
    facts_needed: ['Đơn vị chủ quản', 'Chính sách biểu phí & lãi suất', 'Cảnh báo rủi ro']
  },
  'real-estate': {
    parent_key: 'real-estate',
    display_name: 'Bất động sản',
    sensitivity: 'high',
    must_not: [
      'Không thổi phồng quy hoạch ảo hoặc cam kết tăng giá vô căn cứ.',
      'Không giấu giếm tình trạng pháp lý của dự án.'
    ],
    must_do: [
      'Nêu rõ vị trí thực tế, diện tích, tiện ích và pháp lý (sổ đỏ/hợp đồng).',
      'Mời khách hàng đi xem thực tế trước khi đặt cọc.'
    ],
    facts_needed: ['Vị trí dự án/nhà đất', 'Giá bán/chính sách thanh toán', 'Tình trạng pháp lý']
  },
  travel: {
    parent_key: 'travel',
    display_name: 'Du lịch & Lịch trình',
    sensitivity: 'normal',
    must_not: [
      'Không viết đoạn văn mẫu nhắc lại nỗi sợ dạng "bạn lo lắng thời gian không đủ hay chưa biết đi đâu".',
      'Không tự ý bịa social proof ("được nhiều du khách yêu thích, đánh giá cao", "điểm đến hot nhất") nếu không có trong facts.',
      'Không hứa hẹn lịch trình ảo hoặc giá vé không có cơ sở.'
    ],
    must_do: [
      'Mở đầu bài (Hook) bằng một khung cảnh cụ thể: thời gian (giờ), nơi chốn, cảm giác giác quan chân thực.',
      'Triển khai lịch trình rõ ràng theo từng ngày (Ngày 1, Ngày 2...).',
      'Lời khuyên thực tế, súc tích, dễ áp dụng.'
    ],
    facts_needed: ['Địa điểm cụ thể', 'Thời gian/Số ngày (ví dụ 3N2Đ)', 'Chi phí/Phương tiện (nếu có)']
  },
  general: {
    parent_key: 'general',
    display_name: 'Chủ đề chung & Đời sống',
    sensitivity: 'normal',
    must_not: [],
    must_do: [],
    facts_needed: ['Tên sản phẩm/dịch vụ', 'Giá/Ưu đãi (nếu có)']
  }
};

// ═══ 3. TỪ KHÓA NHẠY CẢM & NGÀNH HÀNG BẰNG CODE (PARALLEL CODE CHECKER) ═══
function removeAccents(str = '') {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, (m) => (m === 'đ' ? 'd' : 'D'))
    .toLowerCase();
}

const INDUSTRY_KEYWORDS = {
  health: [
    'thuoc', 'tri benh', 'chua benh', 'benh vien', 'bac si', 'kham benh', 'duoc pham', 'thuc pham chuc nang',
    'khang sinh', 'xuong khop', 'tieu duong', 'ung thu', 'da day', 'than duoc', 'thuoc tien', 'y te', 'nha khoa',
    'kham suc khoe', 'phong kham', 'benh nhan', 'chua khoi'
  ],
  beauty: [
    'my pham', 'serum', 'kem tron', 'lam dep', 'spa', 'trang da', 'tri nam', 'tan nhang',
    'giam can', 'tang can', 'hut mo', 'tan mo', 'giam beo', 'detox giam can', 'nang nguc', 'cat mi',
    'tri mun', 'serum tri mun', 'viem da', 'tiem filler', 'tiem botox', 'skincare', 'cham soc da'
  ],
  finance: [
    'dau tu', 'tien ao', 'crypto', 'forex', 'lai suat', 'vay tien', 'vay nong', 'tin chap',
    'bao hiem', 'chung khoan', 'co phieu', 'stk', 'so tai khoan', 'chuyen coc', 'tai xiu', 'lo de',
    'kiem tien online', 'tai chinh'
  ],
  'real-estate': [
    'bat dong san', 'dat nen', 'nha dat', 'can ho chung cu', 'so do', 'phan lo ban nen', 'du an bds', 'mua nha'
  ],
  travel: [
    'du lich', 'lich trinh', 'da lat', 'phu quoc', 'sapa', 'da nang', 'nha trang', 'ha giang', 'tour du lich', 'check in da lat'
  ]
};

/**
 * Code chủ động quyết định ngành hàng nhạy cảm từ từ khóa (Keyword-based Industry Resolver).
 * Ngăn chặn tình trạng AI xếp nhầm vào 'general' làm mất luật ngành chặt chẽ.
 */
function resolveIndustryByCode(topicText = '') {
  if (!topicText || typeof topicText !== 'string') return null;
  const unaccented = removeAccents(topicText);
  for (const [indKey, kws] of Object.entries(INDUSTRY_KEYWORDS)) {
    for (const kw of kws) {
      if (unaccented.includes(kw)) {
        return indKey;
      }
    }
  }
  return null;
}

const SENSITIVE_KEYWORDS_BY_CODE = [
  ...INDUSTRY_KEYWORDS.health,
  ...INDUSTRY_KEYWORDS.beauty,
  ...INDUSTRY_KEYWORDS.finance,
  ...INDUSTRY_KEYWORDS['real-estate'],
  'luat su', 'tranh chap', 'kien tung', 'ly hon', 'tre so sinh', 'tre em', 'bim sua'
];

/**
 * Kiểm tra mức độ nhạy cảm của chủ đề bằng code song song
 */
function checkSensitivityByCode(topicText = '') {
  if (!topicText || typeof topicText !== 'string') return 'normal';
  const unaccented = removeAccents(topicText);
  for (const kw of SENSITIVE_KEYWORDS_BY_CODE) {
    if (unaccented.includes(kw)) {
      return 'high';
    }
  }
  return 'normal';
}

// ═══ 4. CƠ CHẾ GỘP LUẬT BẤT BIẾN (STRUCTURAL RULE ENGINE) ═══
/**
 * Gộp luật: COMMON_RULES (gốc bất biến) + INDUSTRY_RULES + PACK_RULES.
 * Thiết kế chặn tầng kiến trúc (không dùng regex lọc câu để tránh gạt nhầm luật siết):
 * 1. COMMON_RULES và INDUSTRY_RULES là gốc bất biến (immutable).
 * 2. Pack chỉ được phép đóng góp vào `must_not` và `risky_claims` (chỉ thêm, append-only, không có cơ chế xóa/ghi đè).
 *    Do nằm ở danh mục CẤM (`must_not`), mọi quy tắc do pack sinh ra (kể cả câu "Không được phép cam kết 100%"
 *    hay "Chỉ cho phép dùng số liệu facts") đều chỉ có tác dụng siết chặt, giữ nguyên 100%.
 * 3. `must_do` từ pack KHÔNG nhận câu tự do, chỉ lấy các trường phong cách có cấu trúc
 *    (hook_style, tone, cấu trúc, nhịp điệu bài viết).
 */
function mergeRules(pack = {}, options = {}) {
  const parentKey = pack.parent_key || 'general';
  const industry = INDUSTRY_RULES[parentKey] || INDUSTRY_RULES.general;

  // 1. Must Not: Base bất biến + luật ngành + Pack must_not (chỉ thêm, không xóa)
  const rawPackMustNot = Array.isArray(pack.must_not) ? pack.must_not : [];
  const cleanPackMustNot = rawPackMustNot
    .filter((r) => typeof r === 'string' && r.trim().length > 0)
    .map((r) => r.trim());

  const mergedMustNot = Array.from(new Set([
    ...COMMON_RULES.must_not,
    ...(industry.must_not || []),
    ...cleanPackMustNot
  ]));

  // 2. Must Do: Base bất biến + luật ngành + Phong cách có cấu trúc từ Pack
  // Pack không được đưa câu tự do vào must_do, chỉ trích xuất các tiêu chuẩn phong cách
  const structuredStyleMustDo = [];
  if (pack.style_defaults && typeof pack.style_defaults === 'object') {
    if (pack.style_defaults.hook_style) {
      structuredStyleMustDo.push(`Mở đầu bằng phong cách hook: ${pack.style_defaults.hook_style}.`);
    }
    if (pack.style_defaults.tone) {
      structuredStyleMustDo.push(`Giọng văn chủ đạo: ${pack.style_defaults.tone}.`);
    }
    if (pack.style_defaults.paragraph_length) {
      structuredStyleMustDo.push(`Độ dài đoạn: ${pack.style_defaults.paragraph_length}.`);
    }
  }

  // NGUYÊN TẮC CỐT TỬ: Nếu bài có facts cụ thể (options.hasFacts === true), TUYỆT ĐỐI KHÔNG ép cấu trúc 4-5 bước của Pack!
  // Thay vào đó, cấu trúc lấy trực tiếp từ các gạch đầu dòng trong facts để chống AI tự phóng tác.
  if (options && options.hasFacts) {
    structuredStyleMustDo.push('Cấu trúc bài viết: Đi thẳng vào từng dữ kiện trong facts được cung cấp. Bỏ qua hoàn toàn các bước suy diễn (pain point, thực trạng, tiện ích xung quanh, câu chuyện thương hiệu) nếu facts không nêu.');
    structuredStyleMustDo.push('Tên sản phẩm và dịch vụ chỉ được mô tả bằng đúng các mục trong facts. Tuyệt đối KHÔNG tự thêm chất liệu (cotton, da, gỗ...), kích cỡ (size S, M, L), màu sắc, vị trí, khoảng cách (km), menu, công dụng, thành phần.');
    structuredStyleMustDo.push('Khống chế độ dài tối đa tương ứng số fact: Với facts ngắn (dưới 5 ý), bài viết bắt buộc phải ngắn gọn (100 - 160 từ), không được kéo dài bài viết rồi độn thêm chi tiết.');
  } else if (pack.structure) {
    const structDesc = Array.isArray(pack.structure) ? pack.structure.join(' -> ') : String(pack.structure);
    structuredStyleMustDo.push(`Tuân thủ cấu trúc bài: ${structDesc}.`);
  }

  // Nếu pack có mảng must_do, chỉ nhận các mục hướng dẫn phong cách/kỹ thuật viết (hook, ngắt dòng, CTA, cấu trúc, tone)
  if (Array.isArray(pack.must_do)) {
    for (const item of pack.must_do) {
      if (typeof item === 'string' && item.trim()) {
        const trimmed = item.trim();
        const unacc = removeAccents(trimmed);
        if (
          unacc.includes('hook') ||
          unacc.includes('ngat dong') ||
          unacc.includes('doan van') ||
          unacc.includes('cta') ||
          unacc.includes('keu goi') ||
          unacc.includes('cau truc') ||
          unacc.includes('giong van') ||
          unacc.includes('tone')
        ) {
          structuredStyleMustDo.push(trimmed);
        }
      }
    }
  }

  const mergedMustDo = Array.from(new Set([
    ...COMMON_RULES.must_do,
    ...(industry.must_do || []),
    ...structuredStyleMustDo
  ]));

  // 3. Risky Claims: Base bất biến + Pack bổ sung
  const rawRisky = Array.isArray(pack.risky_claims) ? pack.risky_claims : [];
  const cleanRisky = rawRisky
    .filter((r) => typeof r === 'string' && r.trim().length > 0)
    .map((r) => r.trim());

  const mergedRisky = Array.from(new Set([
    ...COMMON_RULES.risky_claims,
    ...cleanRisky
  ]));

  // 4. Facts Needed
  const rawFacts = Array.isArray(pack.facts_needed) ? pack.facts_needed : [];
  const cleanFacts = rawFacts
    .filter((r) => typeof r === 'string' && r.trim().length > 0)
    .map((r) => r.trim());

  const mergedFacts = Array.from(new Set([
    ...(industry.facts_needed || []),
    ...cleanFacts
  ]));

  return {
    must_not: mergedMustNot,
    must_do: mergedMustDo,
    risky_claims: mergedRisky,
    facts_needed: mergedFacts
  };
}

/**
 * ═══ CHỐT CHẶN BẰNG CODE (CONTENT VALIDATOR ENGINE) ═══
 * Chạy trực tiếp bằng code trên bài viết AI sinh ra.
 * Dùng chung bộ quy tắc của ContentValidator (CRITICAL_RISK_KEYWORDS, MEDIUM_RISK_KEYWORDS),
 * match không dấu bằng .includes(), tuyệt đối KHÔNG dùng regex \b để tránh bẫy Unicode tiếng Việt.
 */
function validatePostAgainstRules(title = '', content = '', pack = {}, mergedRules = null, options = {}) {
  const rules = mergedRules || mergeRules(pack, options);
  const fullText = `${title}\n${content}`;
  const unaccented = removeAccents(fullText);
  const violations = [];
  const warnings = [];

  // 1. Kiểm tra dấu sao Markdown rác (Facebook không hỗ trợ)
  if (fullText.includes('*')) {
    violations.push('Bài viết chứa dấu sao Markdown (*)');
  }

  // 2. Chốt chặn Code: Cấm 2 câu hỏi liên tiếp ở The Hook (3 dòng đầu)
  const lines = content.split('\n').map((l) => l.trim()).filter(Boolean);
  const hookText = lines.slice(0, 3).join(' ');
  const questionCount = (hookText.match(/\?/g) || []).length;
  if (questionCount >= 2) {
    violations.push(`Mở đầu bài (Hook) chứa ${questionCount} câu hỏi liên tiếp vi phạm quy tắc mở đầu bằng hình ảnh/khoảnh khắc thực tế.`);
  }

  // 3. Chốt chặn Code: Quét uy tín ngụy tạo ở MỌI CHỦ ĐỀ nếu không có trong facts
  const unaccentedFacts = removeAccents(options.facts || '');
  const FAKE_AUTHORITY_PATTERNS = [
    'nghien cuu cho thay',
    'khoa hoc chung minh',
    'chuyen gia khuyen',
    'bac si khuyen cao',
    'vien nghien cuu',
    'chuyen gia hang dau'
  ];
  for (const pat of FAKE_AUTHORITY_PATTERNS) {
    if (unaccented.includes(pat) && !unaccentedFacts.includes(pat)) {
      const isNegated = unaccented.includes('chua co ' + pat) || unaccented.includes('khong co ' + pat);
      if (!isNegated) {
        violations.push(`Sử dụng uy tín ngụy tạo không có trong facts: "${pat}"`);
      }
    }
  }

  // 4. Chốt chặn Code: Quét liều lượng y khoa (mg, mcg) nếu liên quan thuốc/dược phẩm/sức khỏe
  const isHealthContext = unaccented.includes('thuoc') || unaccented.includes('duoc pham') || pack.parent_key === 'health';
  if (isHealthContext) {
    const mgMatch = fullText.match(/\b\d+(\.\d+)?\s*(mg|mcg)\b/i);
    if (mgMatch && !(options.facts || '').includes(mgMatch[0])) {
      violations.push(`Tự ý đưa liều lượng dược phẩm (${mgMatch[0]}) không có trong facts`);
    }
  }

  // 5. Toàn bộ từ khóa cấm nghiêm trọng (ContentValidator Critical Risk) - Match không dấu bằng includes
  for (const kw of CRITICAL_RISK_KEYWORDS) {
    if (unaccented.includes(kw)) {
      violations.push(`Vi phạm điều cấm nghiêm trọng (Meta Policy): "${kw}"`);
    }
  }

  // 6. Toàn bộ từ khóa rủi ro trung bình (Medium Risk) - Match không dấu bằng includes
  for (const kw of MEDIUM_RISK_KEYWORDS) {
    if (unaccented.includes(kw)) {
      warnings.push(`Chứa cụm từ nhạy cảm cần rà soát: "${kw}"`);
    }
  }

  // 7. Quét các risky_claims trong bảng luật của Pack
  const allRisky = rules.risky_claims || [];
  for (const claim of allRisky) {
    if (!claim || typeof claim !== 'string') continue;
    const unaccClaim = removeAccents(claim);
    if (unaccented.includes(unaccClaim)) {
      warnings.push(`Phát hiện tuyên bố rủi ro theo Topic Pack: "${claim}"`);
    }
  }

  return {
    isValid: violations.length === 0,
    hasWarnings: warnings.length > 0,
    violations,
    warnings,
    allIssues: [...violations, ...warnings]
  };
}

// ═══ 5. SCHEMA DATABASE TOPIC PACKS & POST FEEDBACK ═══
let schemaReady = null;

async function ensureTopicPackSchema() {
  if (!schemaReady) {
    schemaReady = getPool().then(async (pool) => {
      if (process.env.USE_SQLITE === 'true') {
        // ═══ CHẾ ĐỘ SQLITE (CHO VPS / LOCAL SQLITE) ═══
        await pool.request().query(`
          CREATE TABLE IF NOT EXISTS TopicPacks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            topic_key TEXT NOT NULL UNIQUE,
            display_name TEXT NOT NULL,
            parent_key TEXT,
            sensitivity TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'DRAFT',
            pack_json TEXT NOT NULL,
            generated_by TEXT NOT NULL,
            confirmed_by TEXT,
            confirmed_at TEXT,
            usage_count INTEGER NOT NULL DEFAULT 0,
            edit_rate REAL,
            version INTEGER NOT NULL DEFAULT 1,
            created_at TEXT DEFAULT (datetime('now', 'localtime'))
          );
        `);
        await pool.request().query(`
          CREATE TABLE IF NOT EXISTS PostFeedback (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            post_id INTEGER,
            topic_key TEXT NOT NULL,
            ai_version TEXT NOT NULL,
            final_version TEXT NOT NULL,
            change_type TEXT,
            created_at TEXT DEFAULT (datetime('now', 'localtime'))
          );
        `);
      } else {
        // ═══ CHẾ ĐỘ MICROSOFT SQL SERVER ═══
        // 1. Tạo bảng TopicPacks nếu chưa có
        await pool.request().query(`
          IF OBJECT_ID(N'dbo.TopicPacks', N'U') IS NULL
          BEGIN
            CREATE TABLE dbo.TopicPacks (
              id INT IDENTITY(1,1) PRIMARY KEY,
              topic_key VARCHAR(100) NOT NULL UNIQUE,
              display_name NVARCHAR(200) NOT NULL,
              parent_key VARCHAR(100) NULL,
              sensitivity VARCHAR(10) NOT NULL,
              status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
              pack_json NVARCHAR(MAX) NOT NULL,
              generated_by VARCHAR(20) NOT NULL,
              confirmed_by VARCHAR(64) NULL,
              confirmed_at DATETIME2 NULL,
              usage_count INT NOT NULL DEFAULT 0,
              edit_rate DECIMAL(5,2) NULL,
              version INT NOT NULL DEFAULT 1,
              created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
            );
            CREATE INDEX IX_TopicPacks_topic_key ON dbo.TopicPacks (topic_key);
            CREATE INDEX IX_TopicPacks_status ON dbo.TopicPacks (status);
          END;
        `);

        // 2. Tạo bảng PostFeedback nếu chưa có
        await pool.request().query(`
          IF OBJECT_ID(N'dbo.PostFeedback', N'U') IS NULL
          BEGIN
            CREATE TABLE dbo.PostFeedback (
              id INT IDENTITY(1,1) PRIMARY KEY,
              post_id INT NULL,
              topic_key VARCHAR(100) NOT NULL,
              ai_version NVARCHAR(MAX) NOT NULL,
              final_version NVARCHAR(MAX) NOT NULL,
              change_type VARCHAR(50) NULL,
              created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
            );
            CREATE INDEX IX_PostFeedback_topic ON dbo.PostFeedback (topic_key);
          END;
        `);

        // 3. Thêm cột topic_key và force_review vào Posts và AiGeneratedDrafts nếu chưa có
        await pool.request().query(`
          IF COL_LENGTH(N'dbo.Posts', N'topic_key') IS NULL
            ALTER TABLE dbo.Posts ADD topic_key VARCHAR(100) NULL;

          IF COL_LENGTH(N'dbo.Posts', N'force_review') IS NULL
            ALTER TABLE dbo.Posts ADD force_review BIT NOT NULL CONSTRAINT DF_Posts_force_review DEFAULT 0;

          IF COL_LENGTH(N'dbo.AiGeneratedDrafts', N'topic_key') IS NULL
            ALTER TABLE dbo.AiGeneratedDrafts ADD topic_key VARCHAR(100) NULL;

          IF COL_LENGTH(N'dbo.AiGeneratedDrafts', N'force_review') IS NULL
            ALTER TABLE dbo.AiGeneratedDrafts ADD force_review BIT NOT NULL CONSTRAINT DF_AiDrafts_force_review DEFAULT 0;
        `);
      }
    });
  }
  return schemaReady;
}

// ═══ 6. PACK GENERAL MẶC ĐỊNH ═══
function getGeneralPack(cls = {}, topicText = '') {
  const topicKey = cls.topic_key || 'general';
  const displayName = cls.display_name || topicText || 'Chủ đề chung';
  const sensitivity = cls.sensitivity || 'normal';

  return {
    topic_key: topicKey,
    display_name: displayName,
    parent_key: cls.parent_key || 'general',
    sensitivity,
    status: 'DRAFT',
    generated_by: 'system',
    version: 1,
    usage_count: 0,
    edit_rate: 0,
    audience_default: 'Khách hàng đại chúng quan tâm đến giải pháp chất lượng và uy tín',
    angles: [
      'Góc tiếp cận bán hàng trực tiếp: Đánh trúng nỗi đau và giới thiệu giải pháp',
      'Góc tiếp cận kể chuyện thực tế: Trải nghiệm khách hàng trước và sau khi sử dụng',
      'Góc tiếp cận phân tích lợi ích: 3 lý do vượt trội so với thị trường',
      'Góc tiếp cận tương tác: Đặt câu hỏi mở kéo thảo luận'
    ],
    structure: [
      'Hook 3 dòng đầu giữ chân người lướt Feed',
      'Thân bài: Nêu vấn đề, phân tích giải pháp và điểm khác biệt',
      'Bằng chứng/Ưu đãi giới hạn',
      'Call to action (CTA) rõ ràng'
    ],
    style_defaults: {
      length: [180, 350],
      emoji: 'moderate',
      tone: ['tự nhiên', 'thuyết phục', 'thân thiện']
    },
    must_do: COMMON_RULES.must_do,
    must_not: COMMON_RULES.must_not,
    risky_claims: COMMON_RULES.risky_claims,
    facts_needed: ['Tên sản phẩm/dịch vụ', 'Giá/Ưu đãi cụ thể', 'Thông tin liên hệ']
  };
}

// ═══ 7. PHÂN LOẠI CHỦ ĐỀ (CLASSIFY TOPIC) ═══
async function classifyTopic(topicText) {
  if (!topicText || typeof topicText !== 'string') {
    return { topic_key: 'general', parent_key: 'general', sensitivity: 'normal', display_name: 'Chủ đề chung' };
  }

  const codeSensitivity = checkSensitivityByCode(topicText);

  // Sinh slug ban đầu
  const slugFallback = removeAccents(topicText)
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 50) || 'general';

  try {
    const systemPrompt = `Bạn là chuyên gia phân loại nội dung mạng xã hội Facebook.
Đầu vào: chủ đề hoặc yêu cầu viết bài của người dùng.
Nhiệm vụ: Phân loại chủ đề và xác định độ nhạy cảm theo chính sách Meta.

QUY TẮC NHẠY CẢM:
- Chọn "high" nếu chủ đề liên quan sức khỏe, thuốc, bệnh, làm đẹp, mỹ phẩm, giảm cân, tài chính, đầu tư, tiền, bất động sản, pháp lý, trẻ em.
- Không chắc chắn thì BẮT BUỘC chọn "high".
- Chọn "normal" chỉ khi là chủ đề an toàn thông thường (thú cưng như nuôi mèo, công nghệ gia dụng, đời sống, du lịch...).

Trả về DUY NHẤT một chuỗi JSON hợp lệ:
{
  "topic_key": "slug-khong-dau-ngan-gon",
  "display_name": "Tên chủ đề tiếng Việt chuẩn",
  "parent_key": "health | beauty | finance | real-estate | general",
  "sensitivity": "normal" | "high"
}`;

    const { content: reply } = await callAiChat({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Phân loại chủ đề này: "${topicText}"` }
      ],
      temperature: 0.2,
      max_tokens: 300,
      jsonMode: true
    });

    let parsed = null;
    try {
      const match = reply.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
    } catch {
      parsed = null;
    }

    const codeIndustry = resolveIndustryByCode(topicText);
    const aiSensitivity = parsed?.sensitivity === 'high' ? 'high' : 'normal';
    // QUY TẮC: Nếu một trong hai (AI hoặc Code) nói high thì kết quả cuối cùng là high
    const finalSensitivity = (codeSensitivity === 'high' || aiSensitivity === 'high') ? 'high' : 'normal';
    // QUY TẮC: Code quyết định ngành nếu phát hiện từ khóa nhạy cảm, AI chỉ gợi ý khi code chưa xác định
    const finalParentKey = codeIndustry || parsed?.parent_key || 'general';

    return {
      topic_key: parsed?.topic_key ? String(parsed.topic_key).toLowerCase().replace(/[^a-z0-9-]/g, '') : slugFallback,
      display_name: parsed?.display_name || topicText.slice(0, 100),
      parent_key: finalParentKey,
      sensitivity: finalSensitivity
    };
  } catch (err) {
    console.warn('[TopicPackService] Lỗi khi gọi AI classifyTopic, dùng phân loại bằng Code:', err.message);
    const codeIndustry = resolveIndustryByCode(topicText);
    return {
      topic_key: slugFallback,
      display_name: topicText.slice(0, 100),
      parent_key: codeIndustry || 'general',
      sensitivity: codeSensitivity
    };
  }
}

// ═══ 8. TÌM PACK TRONG DATABASE (FIND PACK) ═══
async function findPack(packIdOrKey) {
  if (!packIdOrKey) return null;
  await ensureTopicPackSchema();
  const pool = await getPool();

  const isNumeric = (typeof packIdOrKey === 'number' || /^\d+$/.test(String(packIdOrKey).trim()));
  const queryCond = isNumeric ? 'id = @param' : 'topic_key = @param';

  const req = pool.request();
  if (isNumeric) {
    req.input('param', sql.Int, parseInt(packIdOrKey, 10));
  } else {
    req.input('param', sql.VarChar(100), String(packIdOrKey).toLowerCase().trim());
  }

  const result = await req.query(`
    SELECT * FROM dbo.TopicPacks
    WHERE ${queryCond} AND status != 'RETIRED'
    ORDER BY version DESC
  `);

  if (!result.recordset || result.recordset.length === 0) {
    return null;
  }

  const row = result.recordset[0];
  let packJson = {};
  try {
    packJson = JSON.parse(row.pack_json || '{}');
  } catch {
    packJson = {};
  }

  return {
    id: row.id,
    topic_key: row.topic_key,
    display_name: row.display_name,
    parent_key: row.parent_key,
    sensitivity: row.sensitivity,
    status: row.status,
    generated_by: row.generated_by,
    confirmed_by: row.confirmed_by,
    confirmed_at: row.confirmed_at,
    usage_count: row.usage_count || 0,
    edit_rate: row.edit_rate != null ? Number(row.edit_rate) : null,
    version: row.version || 1,
    created_at: row.created_at,
    ...packJson
  };
}

// ═══ 9. PROMPT & SINH DRAFT PACK (CREATE DRAFT PACK) ═══
function validatePackSchema(pack) {
  if (!pack || typeof pack !== 'object') return false;
  if (!pack.topic_key || typeof pack.topic_key !== 'string') return false;
  if (!pack.display_name || typeof pack.display_name !== 'string') return false;
  if (!['normal', 'high'].includes(pack.sensitivity)) return false;
  if (!Array.isArray(pack.angles) || pack.angles.length < 3) return false;
  if (!Array.isArray(pack.structure) || pack.structure.length < 3) return false;
  if (!Array.isArray(pack.must_do) || !Array.isArray(pack.must_not)) return false;
  return true;
}

async function createDraftPack(cls, topicText) {
  await ensureTopicPackSchema();
  const pool = await getPool();

  const promptSystem = `Bạn thiết kế "Topic Pack" cho một công cụ viết bài Facebook tiếng Việt.
Đầu vào: chủ đề do người dùng nhập.
Chỉ trả về JSON đúng schema, không giải thích.

Schema: {
  "topic_key": "slug-khong-dau",
  "display_name": "Tên chủ đề tiếng Việt",
  "parent_key": "health | beauty | finance | real-estate | general",
  "sensitivity": "normal" | "high",
  "audience_default": "Đối tượng khách hàng mục tiêu",
  "angles": ["4-6 góc tiếp cận nội dung khác nhau"],
  "structure": ["3-5 bước triển khai cấu trúc bài viết"],
  "style_defaults": {
    "length": [200, 380],
    "emoji": "moderate",
    "tone": ["tự nhiên", "thuyết phục"]
  },
  "must_do": ["quy tắc bắt buộc làm..."],
  "must_not": ["quy tắc tuyệt đối cấm..."],
  "risky_claims": ["các cam kết rủi ro bị quét chính sách..."],
  "facts_needed": ["các thông tin thật người dùng phải cung cấp..."]
}

Quy tắc:
- sensitivity = "high" nếu chủ đề liên quan sức khỏe, thuốc, làm đẹp/mỹ phẩm, giảm cân, tài chính, đầu tư, bất động sản, pháp lý, trẻ em. Không chắc thì chọn "high".
- must_not phải liệt kê các kiểu claim dễ vi phạm quảng cáo và chính sách Meta của chủ đề này (cam kết tuyệt đối, kết quả đảm bảo, so sánh phóng đại...).
- facts_needed: các thông tin thật người dùng phải cung cấp (giá, ưu đãi, thành phần, giấy phép...) vì bạn KHÔNG được tự bịa.
- Không nới lỏng bất kỳ quy tắc an toàn chung nào.`;

  let packData = null;

  // Thử lần 1 và retry 1 lần nếu sai schema
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const { content: rawReply } = await callAiChat({
        messages: [
          { role: 'system', content: promptSystem },
          { role: 'user', content: `Thiết kế Topic Pack cho chủ đề: "${topicText}". Phân loại gợi ý: ${JSON.stringify(cls)}` }
        ],
        temperature: 0.4,
        max_tokens: 1500,
        jsonMode: true
      });

      let jsonStr = rawReply.trim();
      const match = jsonStr.match(/\{[\s\S]*\}/);
      if (match) jsonStr = match[0];
      const parsed = JSON.parse(jsonStr);

      if (validatePackSchema(parsed)) {
        packData = parsed;
        break;
      } else {
        console.warn(`[TopicPackService] Pack sinh lần ${attempt} không đạt schema validation. Đang thử lại...`);
      }
    } catch (err) {
      console.warn(`[TopicPackService] Lỗi sinh pack lần ${attempt}:`, err.message);
    }
  }

  // Nếu vẫn lỗi -> Rơi về Pack General
  if (!packData) {
    console.warn('[TopicPackService] Không thể sinh pack bằng AI hợp lệ sau 2 lần, rơi về General Pack.');
    packData = getGeneralPack(cls, topicText);
  }

  // Đảm bảo mức độ nhạy cảm tối thiểu: nếu cls hoặc code là high thì pack BẮT BUỘC là high
  if (cls.sensitivity === 'high' || checkSensitivityByCode(topicText) === 'high') {
    packData.sensitivity = 'high';
  }

  const topicKey = String(packData.topic_key || cls.topic_key || 'general').toLowerCase().replace(/[^a-z0-9-]/g, '');
  const displayName = String(packData.display_name || cls.display_name || topicText).slice(0, 200);
  const parentKey = String(packData.parent_key || cls.parent_key || 'general').slice(0, 100);
  const sensitivity = packData.sensitivity === 'high' ? 'high' : 'normal';

  // Tách pack_json để lưu
  const jsonContentToStore = JSON.stringify({
    audience_default: packData.audience_default,
    angles: packData.angles,
    structure: packData.structure,
    style_defaults: packData.style_defaults,
    must_do: packData.must_do,
    must_not: packData.must_not,
    risky_claims: packData.risky_claims,
    facts_needed: packData.facts_needed
  });

  // Lưu vào database với status = 'DRAFT', generated_by = 'ai'
  try {
    const insertRes = await pool.request()
      .input('topic_key', sql.VarChar(100), topicKey)
      .input('display_name', sql.NVarChar(200), displayName)
      .input('parent_key', sql.VarChar(100), parentKey)
      .input('sensitivity', sql.VarChar(10), sensitivity)
      .input('status', sql.VarChar(20), 'DRAFT')
      .input('pack_json', sql.NVarChar(sql.MAX), jsonContentToStore)
      .input('generated_by', sql.VarChar(20), 'ai')
      .input('version', sql.Int, 1)
      .query(`
        INSERT INTO dbo.TopicPacks (
          topic_key, display_name, parent_key, sensitivity, status, pack_json, generated_by, version
        )
        OUTPUT INSERTED.*
        VALUES (
          @topic_key, @display_name, @parent_key, @sensitivity, @status, @pack_json, @generated_by, @version
        );
      `);

    const saved = insertRes.recordset[0];
    return {
      id: saved.id,
      topic_key: saved.topic_key,
      display_name: saved.display_name,
      parent_key: saved.parent_key,
      sensitivity: saved.sensitivity,
      status: saved.status,
      generated_by: saved.generated_by,
      version: saved.version,
      usage_count: saved.usage_count || 0,
      edit_rate: saved.edit_rate != null ? Number(saved.edit_rate) : null,
      created_at: saved.created_at,
      ...packData
    };
  } catch (dbErr) {
    // Nếu trùng topic_key do race condition, lấy bản ghi đang có
    console.warn('[TopicPackService] Lỗi insert pack, kiểm tra bản ghi có sẵn:', dbErr.message);
    const existing = await findPack(topicKey);
    if (existing) return existing;
    throw dbErr;
  }
}

// ═══ 10. LUỒNG RESOLVE TOPIC PACK CHÍNH ═══
async function resolveTopicPack(topicText) {
  // 1. Phân loại: AI + Code song song trả { topic_key, parent_key, sensitivity }
  const cls = await classifyTopic(topicText);

  // 2. Tìm pack: ưu tiên topic_key, rồi parent_key
  let pack = await findPack(cls.topic_key);
  if (!pack && cls.parent_key && cls.parent_key !== 'general') {
    pack = await findPack(cls.parent_key);
  }

  // 3. Chưa có thì sinh nháp
  if (!pack) {
    pack = await createDraftPack(cls, topicText);
  }

  // 4. Ngành nhạy cảm chưa xác nhận: ép review (PENDING_REVIEW)
  const forceReview = pack.sensitivity === 'high' && pack.status !== 'CONFIRMED';

  return {
    pack,
    forceReview,
    cls
  };
}

// ═══ 11. PHÊ DUYỆT & CẬP NHẬT TRẠNG THÁI PACK ═══

/**
 * Chuyển Pack từ DRAFT sang CONFIRMED.
 * QUY TẮC: Chỉ NGƯỜI (Human) được duyệt. AI không được phép tự chốt!
 */
async function confirmTopicPack(packIdOrKey, options = {}) {
  const { actor = 'human', userId = null, userRole = null } = options;

  // QUY TẮC: Chặn AI và bắt buộc phải có danh tính người dùng thực (req.user)
  if (actor === 'ai' || !userId) {
    throw new Error('Chỉ người dùng có thẩm quyền (human với danh tính đăng nhập) mới được phê duyệt Topic Pack sang CONFIRMED.');
  }

  // QUY TẮC: Bắt buộc người dùng có vai trò được duyệt (admin / reviewer / manager)
  const role = String(userRole || '').trim().toLowerCase();
  const allowedRoles = ['admin', 'reviewer', 'manager'];
  if (!allowedRoles.includes(role)) {
    throw new Error('Chỉ tài khoản có vai trò quản trị hoặc kiểm duyệt (admin / reviewer) mới được phê duyệt Topic Pack sang CONFIRMED.');
  }

  await ensureTopicPackSchema();
  const pool = await getPool();

  const isNumeric = Number.isInteger(Number(packIdOrKey));
  const queryCond = isNumeric ? 'id = @param' : 'topic_key = @param';

  const req = pool.request()
    .input('param', isNumeric ? sql.Int : sql.VarChar(100), packIdOrKey)
    .input('confirmed_by', sql.VarChar(64), String(userId))
    .input('status', sql.VarChar(20), 'CONFIRMED');

  const result = await req.query(`
    UPDATE dbo.TopicPacks
    SET status = @status, confirmed_by = @confirmed_by, confirmed_at = SYSUTCDATETIME()
    OUTPUT INSERTED.*
    WHERE ${queryCond};
  `);

  if (!result.recordset || result.recordset.length === 0) {
    throw new Error('Không tìm thấy Topic Pack cần phê duyệt.');
  }

  const row = result.recordset[0];
  let packJson = {};
  try { packJson = JSON.parse(row.pack_json || '{}'); } catch {}

  return {
    id: row.id,
    topic_key: row.topic_key,
    display_name: row.display_name,
    parent_key: row.parent_key,
    sensitivity: row.sensitivity,
    status: row.status,
    confirmed_by: row.confirmed_by,
    confirmed_at: row.confirmed_at,
    version: row.version,
    ...packJson
  };
}

/**
 * Cập nhật Pack: Người sửa must_not / validator_rules thì version + 1
 * và quay về DRAFT nếu là ngành nhạy cảm (sensitivity === 'high'), đồng thời xóa confirmed_by/confirmed_at.
 */
async function updateTopicPack(packIdOrKey, updates = {}, options = {}) {
  const { actor = 'human', userId = 'admin' } = options;
  await ensureTopicPackSchema();
  const pool = await getPool();

  const existing = await findPack(packIdOrKey);
  if (!existing) throw new Error('Topic Pack không tồn tại.');

  const isModifyingRules = updates.must_not !== undefined || updates.must_do !== undefined || updates.pack_json !== undefined;
  let nextVersion = existing.version || 1;
  let nextStatus = existing.status;

  if (isModifyingRules) {
    nextVersion += 1;
    if (existing.sensitivity === 'high') {
      nextStatus = 'DRAFT'; // Quay về DRAFT nếu là ngành nhạy cảm
    }
  }

  const isRevertingToDraft = nextStatus === 'DRAFT' && existing.status === 'CONFIRMED';
  const finalConfirmedBy = isRevertingToDraft ? null : existing.confirmed_by;
  const finalConfirmedAt = isRevertingToDraft ? null : existing.confirmed_at;

  const newDisplayName = updates.display_name !== undefined ? updates.display_name : existing.display_name;
  const newSensitivity = updates.sensitivity !== undefined ? updates.sensitivity : existing.sensitivity;

  const currentJson = {
    audience_default: updates.audience_default || existing.audience_default,
    angles: updates.angles || existing.angles,
    structure: updates.structure || existing.structure,
    style_defaults: updates.style_defaults || existing.style_defaults,
    must_do: updates.must_do || existing.must_do,
    must_not: updates.must_not || existing.must_not,
    risky_claims: updates.risky_claims || existing.risky_claims,
    facts_needed: updates.facts_needed || existing.facts_needed
  };

  const req = pool.request()
    .input('id', sql.Int, existing.id)
    .input('display_name', sql.NVarChar(200), newDisplayName)
    .input('sensitivity', sql.VarChar(10), newSensitivity)
    .input('status', sql.VarChar(20), nextStatus)
    .input('version', sql.Int, nextVersion)
    .input('confirmed_by', sql.VarChar(64), finalConfirmedBy)
    .input('confirmed_at', sql.DateTime2, finalConfirmedAt ? new Date(finalConfirmedAt) : null)
    .input('pack_json', sql.NVarChar(sql.MAX), JSON.stringify(currentJson));

  const result = await req.query(`
    UPDATE dbo.TopicPacks
    SET display_name = @display_name, sensitivity = @sensitivity,
        status = @status, version = @version,
        confirmed_by = @confirmed_by, confirmed_at = @confirmed_at,
        pack_json = @pack_json
    OUTPUT INSERTED.*
    WHERE id = @id;
  `);

  return {
    ...existing,
    display_name: newDisplayName,
    sensitivity: newSensitivity,
    status: nextStatus,
    version: nextVersion,
    confirmed_by: finalConfirmedBy,
    confirmed_at: finalConfirmedAt,
    ...currentJson
  };
}

// ═══ 12. GHI POST FEEDBACK & TÍNH TOÁN EDIT RATE ═══
async function recordPostFeedback({ postId = null, topicKey = 'general', aiVersion = '', finalVersion = '', changeType = 'manual_edit' }) {
  if (!aiVersion || !finalVersion) return null;
  await ensureTopicPackSchema();
  const pool = await getPool();

  // 1. Lưu bản ghi Feedback
  await pool.request()
    .input('post_id', sql.Int, postId)
    .input('topic_key', sql.VarChar(100), topicKey)
    .input('ai_version', sql.NVarChar(sql.MAX), aiVersion)
    .input('final_version', sql.NVarChar(sql.MAX), finalVersion)
    .input('change_type', sql.VarChar(50), changeType)
    .query(`
      INSERT INTO dbo.PostFeedback (post_id, topic_key, ai_version, final_version, change_type)
      VALUES (@post_id, @topic_key, @ai_version, @final_version, @change_type);
    `);

  // 2. Tính toán độ lệch giữa bản AI và bản người sửa (ký tự hoặc độ dài)
  const lenAi = aiVersion.trim().length;
  const lenFinal = finalVersion.trim().length;
  const diffLen = Math.abs(lenAi - lenFinal);
  const isMajorEdit = diffLen > 40 || (lenAi > 0 && (diffLen / lenAi) > 0.25);

  // 3. Cập nhật usage_count & tính lại edit_rate cho topic_key
  try {
    const feedbackRecords = await pool.request()
      .input('topic_key', sql.VarChar(100), topicKey)
      .query(`
        SELECT ai_version, final_version FROM dbo.PostFeedback
        WHERE topic_key = @topic_key
      `);

    const records = feedbackRecords.recordset || [];
    let heavyEdits = 0;
    for (const fb of records) {
      const a = (fb.ai_version || '').trim();
      const f = (fb.final_version || '').trim();
      const d = Math.abs(a.length - f.length);
      if (d > 40 || (a.length > 0 && (d / a.length) > 0.25) || a !== f) {
        heavyEdits++;
      }
    }

    const totalUsage = records.length;
    const computedEditRate = totalUsage > 0 ? Number(((heavyEdits / totalUsage) * 100).toFixed(2)) : 0;

    await pool.request()
      .input('topic_key', sql.VarChar(100), topicKey)
      .input('edit_rate', sql.Decimal(5, 2), computedEditRate)
      .query(`
        UPDATE dbo.TopicPacks
        SET usage_count = usage_count + 1,
            edit_rate = @edit_rate
        WHERE topic_key = @topic_key;
      `);
  } catch (calcErr) {
    console.warn('[TopicPackService] Lỗi cập nhật edit_rate:', calcErr.message);
  }

  return { success: true, isMajorEdit };
}

/**
 * Gợi ý chuyển sang CONFIRMED nếu usage_count >= 10 và edit_rate thấp (< 25%)
 */
async function checkPackConfirmationSuggestion(topicKey) {
  const pack = await findPack(topicKey);
  if (!pack) return null;
  if (pack.status === 'CONFIRMED') return null;

  const usageCount = pack.usage_count || 0;
  const editRate = pack.edit_rate != null ? Number(pack.edit_rate) : 0;

  if (usageCount >= 10 && editRate <= 25) {
    return {
      shouldConfirm: true,
      pack,
      message: `Topic Pack "${pack.display_name}" đã được sử dụng ${usageCount} lần với tỷ lệ sửa chỉ ${editRate}%. Đề xuất người quản trị xác nhận CONFIRMED.`
    };
  }

  return { shouldConfirm: false, pack };
}

module.exports = {
  COMMON_RULES,
  INDUSTRY_RULES,
  SENSITIVE_KEYWORDS_BY_CODE,
  INDUSTRY_KEYWORDS,
  checkSensitivityByCode,
  resolveIndustryByCode,
  mergeRules,
  validatePostAgainstRules,
  validatePackSchema,
  classifyTopic,
  findPack,
  createDraftPack,
  resolveTopicPack,
  confirmTopicPack,
  updateTopicPack,
  recordPostFeedback,
  checkPackConfirmationSuggestion,
  getGeneralPack,
  ensureTopicPackSchema
};
