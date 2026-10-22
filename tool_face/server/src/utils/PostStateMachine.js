/**
 * PostStateMachine.js
 * Quản lý toàn bộ State Machine vòng đời bài viết Facebook (14 Trạng thái chuẩn mực)
 * 
 * VÒNG ĐỜI:
 * NEW -> GENERATING -> VALIDATING ->
 *   [Lỗi schema] -> GENERATION_FAILED
 *   [Đạt schema] -> SAFETY_CHECK ->
 *     [Rủi ro nghiêm trọng] -> BLOCKED
 *     [Cần kiểm tra] -> PENDING_REVIEW -> [Từ chối] -> REJECTED
 *                                       -> [Duyệt]   -> APPROVED
 *     [Đạt kiểm tra]  -> READY_FOR_APPROVAL -> [Từ chối] -> REJECTED
 *                                           -> [Duyệt]   -> APPROVED
 * APPROVED -> SCHEDULED -> PUBLISHING ->
 *   [Thành công API] -> PUBLISHED
 *   [Lỗi API]        -> PUBLISH_RETRY_OR_FAILED
 */

const crypto = require('crypto');
const { sql, getPool } = require('../../config/db');

const POST_STATES = {
  NEW: 'NEW',
  GENERATING: 'GENERATING',
  VALIDATING: 'VALIDATING',
  GENERATION_FAILED: 'GENERATION_FAILED',
  SAFETY_CHECK: 'SAFETY_CHECK',
  BLOCKED: 'BLOCKED',
  PENDING_REVIEW: 'PENDING_REVIEW',
  READY_FOR_APPROVAL: 'READY_FOR_APPROVAL',
  REJECTED: 'REJECTED',
  APPROVED: 'APPROVED',
  SCHEDULED: 'SCHEDULED',
  PUBLISHING: 'PUBLISHING',
  PUBLISHED: 'PUBLISHED',
  PUBLISH_RETRY_OR_FAILED: 'PUBLISH_RETRY_OR_FAILED'
};

const STATE_METADATA = {
  [POST_STATES.NEW]: {
    label: 'Khởi tạo mới',
    color: '#64748b',
    bg: '#f1f5f9',
    desc: 'Bài viết vừa được tạo, sẵn sàng để AI sinh nội dung hoặc soạn thảo thủ công.'
  },
  [POST_STATES.GENERATING]: {
    label: 'Đang tạo nội dung',
    color: '#2563eb',
    bg: '#eff6ff',
    desc: 'AI đang tiến hành phân tích prompt và sinh nội dung bài viết.'
  },
  [POST_STATES.VALIDATING]: {
    label: 'Kiểm tra Schema',
    color: '#0891b2',
    bg: '#ecfeff',
    desc: 'Hệ thống đang kiểm tra tính hợp lệ của cấu trúc dữ liệu JSON, ký tự và định dạng.'
  },
  [POST_STATES.GENERATION_FAILED]: {
    label: 'Lỗi tạo bài (Schema)',
    color: '#dc2626',
    bg: '#fef2f2',
    desc: 'AI trả về dữ liệu sai cấu trúc hoặc lỗi trong quá trình sinh nội dung.'
  },
  [POST_STATES.SAFETY_CHECK]: {
    label: 'Kiểm tra an toàn',
    color: '#d97706',
    bg: '#fffbeb',
    desc: 'Đang quét nội dung theo Tiêu chuẩn cộng đồng Facebook & Chính sách quảng cáo Việt Nam.'
  },
  [POST_STATES.BLOCKED]: {
    label: 'Bị chặn (Rủi ro vi phạm)',
    color: '#b91c1c',
    bg: '#fef2f2',
    desc: 'Nội dung có nguy cơ vi phạm nghiêm trọng chính sách Meta. Không được phép đi tiếp; chỉ được sửa và tạo bản mới.'
  },
  [POST_STATES.PENDING_REVIEW]: {
    label: 'Chờ kiểm duyệt',
    color: '#ea580c',
    bg: '#fff7ed',
    desc: 'Phát hiện từ khóa nhạy cảm hoặc nghi ngờ, chờ quản trị viên xem xét và duyệt thủ công.'
  },
  [POST_STATES.READY_FOR_APPROVAL]: {
    label: 'Đạt chuẩn - Chờ duyệt',
    color: '#0284c7',
    bg: '#f0f9ff',
    desc: 'Nội dung vượt qua kiểm tra an toàn, sẵn sàng để người có thẩm quyền phê duyệt.'
  },
  [POST_STATES.REJECTED]: {
    label: 'Bị từ chối',
    color: '#991b1b',
    bg: '#fef2f2',
    desc: 'Nội dung bị người kiểm duyệt từ chối. Cần chỉnh sửa để tạo bản mới.'
  },
  [POST_STATES.APPROVED]: {
    label: 'Đã phê duyệt',
    color: '#16a34a',
    bg: '#f0fdf4',
    desc: 'Nội dung đã được duyệt cho phiên bản cụ thể này. Sẵn sàng lên lịch hoặc xuất bản.'
  },
  [POST_STATES.SCHEDULED]: {
    label: 'Đã lên lịch hẹn',
    color: '#7c3aed',
    bg: '#f5f3ff',
    desc: 'Bài viết đã có thời gian đăng hợp lệ và nằm trong hàng đợi xuất bản tự động.'
  },
  [POST_STATES.PUBLISHING]: {
    label: 'Đang xuất bản lên FB',
    color: '#2563eb',
    bg: '#eff6ff',
    desc: 'Hệ thống đang gọi Facebook Graph API để đăng bài lên Fanpage đích.'
  },
  [POST_STATES.PUBLISHED]: {
    label: 'Đã đăng thành công',
    color: '#059669',
    bg: '#ecfdf5',
    desc: 'Đã nhận mã xác nhận Facebook Post ID hợp lệ từ Facebook API.'
  },
  [POST_STATES.PUBLISH_RETRY_OR_FAILED]: {
    label: 'Lỗi xuất bản / Chờ thử lại',
    color: '#e11d48',
    bg: '#fff1f2',
    desc: 'Gặp sự cố khi gọi Facebook API (token hết hạn, mạng, lỗi phân quyền). Có thể thử lại.'
  }
};

// Ma trận chuyển đổi trạng thái hợp lệ
const ALLOWED_TRANSITIONS = {
  [POST_STATES.NEW]: [POST_STATES.GENERATING, POST_STATES.VALIDATING, POST_STATES.SAFETY_CHECK, POST_STATES.APPROVED, POST_STATES.SCHEDULED],
  [POST_STATES.GENERATING]: [POST_STATES.VALIDATING, POST_STATES.GENERATION_FAILED],
  [POST_STATES.VALIDATING]: [POST_STATES.SAFETY_CHECK, POST_STATES.GENERATION_FAILED],
  [POST_STATES.GENERATION_FAILED]: [POST_STATES.NEW, POST_STATES.GENERATING],
  [POST_STATES.SAFETY_CHECK]: [POST_STATES.BLOCKED, POST_STATES.PENDING_REVIEW, POST_STATES.READY_FOR_APPROVAL],
  [POST_STATES.BLOCKED]: [POST_STATES.NEW], // Chỉ được sửa và tạo bản mới
  [POST_STATES.PENDING_REVIEW]: [POST_STATES.APPROVED, POST_STATES.SCHEDULED, POST_STATES.REJECTED, POST_STATES.NEW],
  [POST_STATES.READY_FOR_APPROVAL]: [POST_STATES.APPROVED, POST_STATES.SCHEDULED, POST_STATES.REJECTED, POST_STATES.NEW],
  [POST_STATES.REJECTED]: [POST_STATES.NEW], // Sửa tạo bản mới
  [POST_STATES.APPROVED]: [POST_STATES.SCHEDULED, POST_STATES.PUBLISHING, POST_STATES.NEW, POST_STATES.SAFETY_CHECK, POST_STATES.REJECTED],
  [POST_STATES.SCHEDULED]: [POST_STATES.PUBLISHING, POST_STATES.APPROVED, POST_STATES.NEW, POST_STATES.SAFETY_CHECK, POST_STATES.REJECTED],
  [POST_STATES.PUBLISHING]: [POST_STATES.PUBLISHED, POST_STATES.PUBLISH_RETRY_OR_FAILED, POST_STATES.SCHEDULED],
  [POST_STATES.PUBLISHED]: [], // Trạng thái kết thúc thành công
  [POST_STATES.PUBLISH_RETRY_OR_FAILED]: [POST_STATES.PUBLISHING, POST_STATES.SCHEDULED, POST_STATES.NEW, POST_STATES.REJECTED]
};

// ═══ CHUẨN HÓA TIẾNG VIỆT & BỎ DẤU ĐỂ MATCH TỪ KHÓA CHÍNH XÁC (KHÔNG DÙNG \b) ═══
function removeAccents(str = '') {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, (m) => (m === 'đ' ? 'd' : 'D'))
    .toLowerCase();
}

const CRITICAL_RISK_KEYWORDS = [
  'hang fake', 'super fake', 'rep 1:1', 'hang replica', 'nhai hang', 'gia cay', 'auth tuon',
  'tri dut diem 100%', 'khoi han sau 1 dem', 'cam ket chua khoi hoan toan', 'thuoc tien', 'than duoc', 'bao dam 100% khong tai phat',
  'ca do bong da', 'bao lo de', 'soi cau vip', 'tai xiu online', 'no hu doi thuong', 'keo baccarat', 'kiem tien hoa hong',
  'sung dan', 'dao kiem tu che', 'chat kich thich', 'thuoc la dien tu pod', 'bong cuoi'
];

const MEDIUM_RISK_KEYWORDS = [
  'cam ket 100%', 'chac chan 100%', 'tuyet doi khong', 'hoan tien 200%',
  'giam can cap toc', 'giam 10kg', 'tang kich thuoc', 'lot xac sau 3 ngay',
  'chuyen khoan dat coc truoc', 'stk', 'so tai khoan', 'chuyen coc gap'
];

// ═══ BỘ TỪ KHÓA PHÂN THEO 5 NHÓM NGÀNH NHẠY CẢM (QUÉT TOÀN DIỆN KHÔNG DẤU) ═══
const SENSITIVE_INDUSTRY_GROUPS = {
  SUC_KHOE_DUOC_PHAM: {
    name: 'Sức khỏe & Dược phẩm / TPCN',
    keywords: [
      'thuoc', 'an than', 'mat ngu', 'ngu ngon', 'chua benh', 'dieu tri', 'khang sinh', 'tpcn',
      'thuc pham chuc nang', 'thuc pham bao ve suc khoe', 'bo khop', 'glucosamine', 'chondroitin',
      'canxi', 'loang xuong', 'tieu duong', 'duong huyet', 'huyet ap', 'tim mach', 'suy than', 'benh than',
      'chuc nang than', 'viem gan', 'suy gan', 'men gan', 'gan nhiem mo',
      'viem xoang', 'da day', 'tieu hoa', 'men vi sinh', 'trao nguoc', 'bo nao', 'bo mat', 'nho mat',
      'tri mun', 'serum mun', 'kem trang da', 'tri nam', 'tan nhang', 'seo ro', 'giam can', 'giam beo',
      'tang can', 'rung toc', 'collagen', 'de khang', 'mien dich', 'thai doc', 'detox', 'benh vien',
      'phong kham', 'bac si', 'duoc si', 'don thuoc', 'toa thuoc', 'thoat vi dia dem'
    ]
  },
  SUA_TRE_EM_ME_BE: {
    name: 'Sữa dinh dưỡng & Mẹ và Bé',
    keywords: [
      'sua cong thuc', 'sua non', 'sua me', 'sua dinh duong', 'tre so sinh', 'tre nho', 'be so sinh',
      'em be', 'thai nhi', 'mang thai', 'me bau', 'cho con bu', 'binh sua', 'num ti', 'ta bim',
      'bieng an', 'suy dinh duong', 'coi xuong', 'cham noi', 'an dam', 'vac xin', 'tiem chung', 'tiem phong'
    ]
  },
  TAI_CHINH_BAO_HIEM_DAU_TU: {
    name: 'Tài chính, Ngân hàng & Bảo hiểm',
    keywords: [
      'vay tien', 'vay von', 'khoan vay', 'cho vay', 'vay nhanh', 'vay online', 'vay tin chap', 'vay the chap', 'vay tra gop',
      'tra gop', 'tin dung', 'the tin dung', 'dao han', 'no xau', 'cic', 'giai ngan', 'lai suat',
      'ky han', 'tiet kiem', 'gui tiet kiem', 'ngan hang', 'bao hiem', 'bao hiem nhan tho',
      'bao hiem y te', 'bao hiem suc khoe', 'phi bao hiem', 'chung khoan', 'co phieu', 'trai phieu',
      'quy dau tu', 'forex', 'tien ao', 'crypto', 'bitcoin', 'sinh loi', 'loi nhuan', 'kiem tien nhanh',
      'lam giau nhanh', 'da cap', '50 trieu'
    ]
  },
  BAT_DONG_SAN_NHA_DAT: {
    name: 'Bất động sản & Nhà đất',
    keywords: [
      'bat dong san', 'bds', 'nha dat', 'dat nen', 'mua dat', 'ban dat', 'tach thua', 'phan lo',
      'so do', 'so hong', 'vi bang', 'cong chung', 'quyen su dung dat', 'phap ly nha dat',
      'quy hoach dat', 'den bu', 'giai toa', 'can ho', 'chung cu', 'chung cu cu', 'nha pho',
      'biet thu', 'du an nha o', 'chu dau tu', 'dat coc mua nha', 'hop dong mua ban nha', 'pccc'
    ]
  },
  PHAP_LY_LUAT_SU: {
    name: 'Pháp lý & Luật sư',
    keywords: [
      'luat su', 'van phong luat', 'tu van luat', 'tranh chap', 'khoi kien', 'kien tung',
      'toa an', 'to cao', 'khieu nai', 'thua ke', 'di san', 'di chuc', 'phan chia tai san',
      'ly hon', 'quyen nuoi con', 'tam giam', 'khoi to', 'bao chua'
    ]
  }
};

// Gom toàn bộ từ khóa nhạy cảm thành 1 danh sách phẳng tiện tra cứu nhanh
const ALL_SENSITIVE_KEYWORDS = [];
for (const [groupKey, group] of Object.entries(SENSITIVE_INDUSTRY_GROUPS)) {
  for (const kw of group.keywords) {
    ALL_SENSITIVE_KEYWORDS.push({
      groupKey,
      groupName: group.name,
      keyword: kw
    });
  }
}

/**
 * Kiểm tra nhanh qua bộ từ khóa
 */
function scanSensitiveKeywords(text = '', topicContext = '') {
  const combined = `${removeAccents(text)} ${removeAccents(topicContext)}`;
  for (const item of ALL_SENSITIVE_KEYWORDS) {
    if (combined.includes(item.keyword)) {
      return {
        matched: true,
        groupKey: item.groupKey,
        groupName: item.groupName,
        keyword: item.keyword
      };
    }
  }
  return { matched: false };
}

/**
 * Phân loại ngành nhạy cảm bằng AI (Qwen 27B / GPT-OSS 20B)
 * Nguyên tắc an toàn: MẶC ĐỊNH CHỌN NHẠY CẢM KHI KHÔNG CHẮC HOẶC GẶP LỖI
 */
async function classifySensitiveIndustryWithAi(text = '', topicContext = '') {
  try {
    // Lazy require để tránh circular dependency
    const { callAiChat } = require('./AiClientService');
    const prompt = `Bạn là Chuyên gia Kiểm duyệt An toàn Nội dung Facebook.
Nhiệm vụ: Phân loại xem nội dung/chủ đề sau có thuộc bất kỳ ngành nào trong 5 NGÀNH NHẠY CẢM bắt buộc duyệt tay hay không:
1. Sức khỏe, y tế, bệnh tật, thuốc, thực phẩm chức năng, làm đẹp/giảm cân điều trị
2. Sữa trẻ em, trẻ sơ sinh, dinh dưỡng mẹ và bé, vắc xin
3. Tài chính, vay vốn, trả góp, tín dụng, ngân hàng, bảo hiểm, đầu tư chứng khoán/crypto
4. Bất động sản, mua bán đất nền, căn hộ, chung cư, pháp lý nhà đất, quy hoạch
5. Pháp lý, luật sư, tranh chấp, kiện tụng, thừa kế, ly hôn

[CHỦ ĐỀ]: "${topicContext}"
[NỘI DUNG]:
${text.slice(0, 1000)}

QUY TẮC CỰC KỲ QUAN TRỌNG:
- Nếu thuộc bất kỳ ngành nào ở trên: Trả về is_sensitive = true.
- NẾU KHÔNG CHẮC CHẮN HOẶC CÓ LIÊN QUAN RĂM RÁP ĐẾN SỨC KHỎE/TIỀN BẠC/NHÀ ĐẤT: BẮT BUỘC MẶC ĐỊNH CHỌN is_sensitive = true!
- Chỉ khi 100% là chủ đề đời thường vô hại (nấu ăn gia đình, du lịch tự túc, thời trang cơ bản, công nghệ văn phòng, mèo thú cưng...): mới trả về is_sensitive = false.

Trả về DUY NHẤT một JSON hợp lệ:
{
  "is_sensitive": true,
  "industry": "Tên ngành phát hiện (hoặc 'none')",
  "reason": "Giải thích ngắn gọn 1 câu"
}`;

    const res = await callAiChat({
      messages: [
        { role: 'system', content: 'Bạn là chuyên gia an toàn nội dung, chỉ trả về JSON hợp lệ.' },
        { role: 'user', content: prompt }
      ],
      model: 'qwen/qwen3.8-27b',
      temperature: 0.1,
      max_tokens: 250
    });

    const cleaned = res.content.replace(/```json/gi, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return {
      isSensitive: Boolean(parsed.is_sensitive),
      industry: parsed.industry || 'Chưa xác định',
      reason: parsed.reason || 'AI phân loại ngành nhạy cảm'
    };
  } catch (err) {
    // NGUYÊN TẮC AN TOÀN: Khi lỗi AI, mặc định bảo vệ bằng cách coi là nhạy cảm!
    console.warn('[PostStateMachine] AI Classifier gặp sự cố, mặc định kích hoạt PENDING_REVIEW để an toàn:', err.message);
    return {
      isSensitive: true,
      industry: 'Bảo vệ an toàn (AI Fallback)',
      reason: 'Hệ thống tự động kích hoạt kiểm duyệt an toàn do AI classifier gặp sự cố kết nối.'
    };
  }
}

/**
 * Chạy bộ lọc an toàn chính sách Meta Đồng bộ (Dựa trên bộ từ khóa mở rộng toàn diện)
 */
function evaluateContentSafety(title = '', content = '', topicContext = '') {
  const fullTextNFC = `${title}\n${content}`.normalize('NFC').trim();
  const fullTextUnaccented = removeAccents(fullTextNFC);
  const criticalViolations = [];
  const warningViolations = [];

  // 1. Quét rủi ro nghiêm trọng (Critical Risk -> BLOCKED)
  for (const kw of CRITICAL_RISK_KEYWORDS) {
    if (fullTextUnaccented.includes(kw)) {
      criticalViolations.push(`Phát hiện từ khóa cấm/vi phạm chính sách Meta: "${kw}"`);
    }
  }

  if (criticalViolations.length > 0) {
    return {
      state: POST_STATES.BLOCKED,
      score: 10,
      reasons: criticalViolations,
      notes: 'Bị chặn do vi phạm Tiêu chuẩn cộng đồng Facebook hoặc Luật Quảng cáo Việt Nam.'
    };
  }

  // 2. CHỐT CỨNG BẰNG CODE CHO NGÀNH NHẠY CẢM (Toàn bộ 5 nhóm ngành) -> LUÔN VÀO PENDING_REVIEW
  const kwMatch = scanSensitiveKeywords(fullTextNFC, topicContext);
  if (kwMatch.matched) {
    return {
      state: POST_STATES.PENDING_REVIEW,
      score: 70,
      reasons: [`[${kwMatch.groupName}] Khớp từ khóa ngành nhạy cảm: "${kwMatch.keyword}"`],
      notes: `[CHỐT CỨNG TỪ KHÓA] Thuộc ${kwMatch.groupName} - Luôn cần quản trị viên duyệt trước khi xuất bản.`
    };
  }

  // 3. Quét rủi ro trung bình (Medium Risk -> PENDING_REVIEW)
  for (const kw of MEDIUM_RISK_KEYWORDS) {
    if (fullTextUnaccented.includes(kw)) {
      warningViolations.push(`Chứa cụm từ nhạy cảm cần rà soát: "${kw}"`);
    }
  }

  if (content.length < 30) {
    warningViolations.push('Nội dung quá ngắn (dưới 30 ký tự), cần kiểm tra tính hoàn chỉnh.');
  }

  if (warningViolations.length > 0) {
    return {
      state: POST_STATES.PENDING_REVIEW,
      score: 60,
      reasons: warningViolations,
      notes: 'Cần quản trị viên kiểm tra và duyệt thủ công trước khi xuất bản.'
    };
  }

  // 4. Đạt an toàn 100% -> READY_FOR_APPROVAL
  return {
    state: POST_STATES.READY_FOR_APPROVAL,
    score: 98,
    reasons: ['Nội dung đạt Tiêu chuẩn cộng đồng Facebook và Chính sách quảng cáo.'],
    notes: 'Đã sẵn sàng để người quản trị phê duyệt xuất bản.'
  };
}

/**
 * Chạy bộ lọc an toàn BẤT ĐỒNG BỘ: HỢP BẰNG OR (Từ khóa OR AI Classifier)
 * Bảo đảm 100% các ngành nhạy cảm đều bị đưa vào PENDING_REVIEW
 */
async function evaluateContentSafetyAsync(title = '', content = '', topicContext = '') {
  const syncResult = evaluateContentSafety(title, content, topicContext);
  
  // Nếu đã bị BLOCKED hoặc đã dính từ khóa PENDING_REVIEW -> Trả về ngay lập tức
  if (syncResult.state === POST_STATES.BLOCKED || syncResult.state === POST_STATES.PENDING_REVIEW) {
    return syncResult;
  }

  // Nếu bộ từ khóa chưa bắt được -> Gọi AI Classifier phân loại ngữ nghĩa sâu (Logic OR)
  const aiCheck = await classifySensitiveIndustryWithAi(`${title}\n${content}`, topicContext);
  if (aiCheck.isSensitive) {
    return {
      state: POST_STATES.PENDING_REVIEW,
      score: 70,
      reasons: [`[AI Phân loại: ${aiCheck.industry}] ${aiCheck.reason}`],
      notes: `[CHỐT CHẶN AI] Phát hiện nội dung thuộc nhóm ngành nhạy cảm (${aiCheck.industry}) - Bắt buộc duyệt thủ công.`
    };
  }

  return syncResult;
}

/**
 * Kiểm tra xem có được phép chuyển từ currentState sang nextState hay không
 * QUY TẮC: Cùng trạng thái thì FALSE với PUBLISHING và PUBLISHED để tránh bắn duplicate
 */
function canTransition(currentState, nextState) {
  if (!currentState || !nextState) return false;
  if (currentState === nextState) {
    if (currentState === POST_STATES.PUBLISHING || currentState === POST_STATES.PUBLISHED) {
      return false;
    }
    return true;
  }
  const allowed = ALLOWED_TRANSITIONS[currentState] || [];
  return allowed.includes(nextState);
}

/**
 * Tính mã SHA256 canonical hash của bài viết
 * Hash bao gồm: Page ID, Tiêu đề, Nội dung, Media Type, Media Links, Thời gian hẹn giờ
 */
function computePostHash(post = {}) {
  const pageId = String(post.pageId || post.page_id || '').trim();
  const title = String(post.title || '').trim();
  const content = String(post.content || '').trim();
  const mediaType = String(post.mediaType || post.media_type || 'text').trim();
  let mediaLinks = '';
  try {
    const raw = post.mediaLinks || post.media_links;
    if (raw) {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      mediaLinks = Array.isArray(parsed) ? parsed.join(',') : String(parsed);
    }
  } catch {
    mediaLinks = String(post.mediaLinks || post.media_links || '').trim();
  }
  const scheduledTime = post.scheduledAt || post.scheduled_at
    ? new Date(post.scheduledAt || post.scheduled_at).toISOString()
    : '';

  const rawString = `${pageId}|${title}|${content}|${mediaType}|${mediaLinks}|${scheduledTime}`;
  return crypto.createHash('sha256').update(rawString, 'utf8').digest('hex');
}

/**
 * Thực hiện chuyển trạng thái (Transition) kèm kiểm tra bảng quyền và ghi PostAuditLog
 * @param {object} post Bản ghi bài viết hiện tại
 * @param {string} nextState Trạng thái đích muốn chuyển sang
 * @param {object} options { actor, reason, facebookPostId, approvedBy }
 */
async function transition(post, nextState, options = {}) {
  const { actor = 'system', reason = null, facebookPostId = null, approvedBy = null } = options;
  const currentState = post.status;

  // 1. Kiểm tra ma trận chuyển trạng thái
  if (!canTransition(currentState, nextState)) {
    throw new Error(`Chuyển trạng thái không hợp lệ: từ "${currentState}" sang "${nextState}".`);
  }

  // 2. Bảng phân quyền Actor
  if (actor === 'ai') {
    const allowedForAi = [
      POST_STATES.GENERATING,
      POST_STATES.VALIDATING,
      POST_STATES.GENERATION_FAILED,
      POST_STATES.SAFETY_CHECK,
      POST_STATES.READY_FOR_APPROVAL,
      POST_STATES.PENDING_REVIEW,
      POST_STATES.BLOCKED
    ];
    if (!allowedForAi.includes(nextState)) {
      throw new Error(`AI không có quyền chuyển bài sang trạng thái "${nextState}".`);
    }
  }

  // Trạng thái APPROVED bắt buộc phải do Người (Human) duyệt
  if (nextState === POST_STATES.APPROVED && actor === 'ai') {
    throw new Error('Chỉ người dùng có thẩm quyền mới được phê duyệt bài viết (APPROVED).');
  }

  // Trạng thái PUBLISHED bắt buộc phải có Facebook Post ID hợp lệ từ Graph API
  if (nextState === POST_STATES.PUBLISHED) {
    const fbId = facebookPostId || post.facebook_post_id;
    if (!fbId || typeof fbId !== 'string' || !fbId.trim()) {
      throw new Error('Không thể chuyển sang PUBLISHED khi chưa có Facebook Post ID từ Graph API.');
    }
  }

  const pool = await getPool();
  const newContentHash = computePostHash(post);

  // Nếu chuyển sang APPROVED: gắn approved_hash = content_hash và lưu approved_by
  let updateQuery = 'UPDATE Posts SET status = @nextState, content_hash = @contentHash';
  const request = pool.request()
    .input('id', sql.Int, post.id)
    .input('nextState', sql.VarChar(50), nextState)
    .input('contentHash', sql.VarChar(64), newContentHash);

  if (nextState === POST_STATES.APPROVED) {
    updateQuery += ', approved_hash = @contentHash, approved_by = @approvedBy';
    request.input('approvedBy', sql.VarChar(64), approvedBy || actor);
  }

  if (nextState === POST_STATES.PUBLISHING) {
    updateQuery += ', publishing_started_at = SYSUTCDATETIME()';
  }

  if (nextState === POST_STATES.PUBLISHED) {
    updateQuery += ', published_at = SYSUTCDATETIME()';
    if (facebookPostId) {
      updateQuery += ', facebook_post_id = @fbPostId';
      request.input('fbPostId', sql.NVarChar(200), facebookPostId);
    }
  }

  updateQuery += ' WHERE id = @id';
  await request.query(updateQuery);

  // Ghi nhật ký kiểm toán (PostAuditLog)
  try {
    await pool.request()
      .input('postId', sql.Int, post.id)
      .input('actor', sql.VarChar(100), actor)
      .input('fromState', sql.VarChar(50), currentState)
      .input('toState', sql.VarChar(50), nextState)
      .input('reason', sql.NVarChar, reason || `Chuyển trạng thái sang ${nextState}`)
      .query(`
        INSERT INTO PostAuditLog (post_id, actor, from_state, to_state, reason, created_at)
        VALUES (@postId, @actor, @fromState, @toState, @reason, SYSUTCDATETIME());
      `);
  } catch (auditErr) {
    console.warn(`[AuditLog Warning] Không thể ghi audit log bài #${post.id}:`, auditErr.message);
  }

  return { success: true, fromState: currentState, toState: nextState, approvedBy: approvedBy || actor };
}

/**
 * Quy tắc bắt buộc:
 * "Sửa nội dung ở bất kỳ trạng thái nào thì hủy duyệt.
 * Hash gồm cả title, content, media, Page, giờ đăng."
 */
function handleContentMutation(currentPost, newPostData) {
  const oldApprovedHash = currentPost.approved_hash;
  const newHash = computePostHash({ ...currentPost, ...newPostData });

  // Nếu bài đã có approved_hash mà hash mới bị thay đổi -> Hủy duyệt ngay lập tức!
  if (oldApprovedHash && oldApprovedHash !== newHash) {
    const safetyResult = evaluateContentSafety(
      newPostData.title !== undefined ? newPostData.title : currentPost.title,
      newPostData.content !== undefined ? newPostData.content : currentPost.content
    );

    return {
      invalidated: true,
      nextState: safetyResult.state,
      newContentHash: newHash,
      safetyNotes: `[HỦY DUYỆT DO THAY ĐỔI DỮ LIỆU ĐÃ DUYỆT] ${safetyResult.notes}`,
      reasons: safetyResult.reasons
    };
  }

  return { invalidated: false, nextState: currentPost.status, newContentHash: newHash };
}

module.exports = {
  POST_STATES,
  STATE_METADATA,
  ALLOWED_TRANSITIONS,
  canTransition,
  evaluateContentSafety,
  evaluateContentSafetyAsync,
  classifySensitiveIndustryWithAi,
  scanSensitiveKeywords,
  SENSITIVE_INDUSTRY_GROUPS,
  ALL_SENSITIVE_KEYWORDS,
  computePostHash,
  transition,
  handleContentMutation,
  removeAccents,
  CRITICAL_RISK_KEYWORDS,
  MEDIUM_RISK_KEYWORDS
};
