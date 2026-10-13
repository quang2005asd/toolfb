/**
 * CommentAiCore.js
 * Hàm dùng chung cho module "AI Bình luận": truy vấn DB, gọi AI, biến trong mẫu, cài đặt theo từng Fanpage.
 * Chỉ dùng cú pháp SQL chạy được cả trên SQL Server lẫn SQLite adapter của dự án.
 */
const axios = require('axios');
const { sql, getPool } = require('../../config/db');
const { getAiConfig } = require('./AiContentGenerator');
const { ensureCommentAiSchema } = require('./CommentAiSchema');

const DEFAULT_TONE = 'Thân thiện, lịch sự, ngắn gọn (tối đa 2 câu). Gọi khách là bạn hoặc anh/chị.';

// ═══ TRUY VẤN ═══
// params: mảng [tên, kiểu, giá trị]
async function exec(text, params = []) {
  await ensureCommentAiSchema();
  const pool = await getPool();
  const request = pool.request();
  for (const [name, type, value] of params) request.input(name, type, value);
  return request.query(text);
}

const MAXT = () => sql.NVarChar(sql.MAX);
const PAGE = (value) => ['pageId', sql.VarChar(64), String(value)];

function isDuplicateError(error) {
  const text = `${error?.code || ''} ${error?.number || ''} ${error?.message || ''}`;
  return /UNIQUE|2601|2627|SQLITE_CONSTRAINT/i.test(text);
}

function parseJson(text, fallback) {
  try { return text ? JSON.parse(text) : fallback; } catch { return fallback; }
}

// Đọc JSON do AI trả về (có thể bọc trong ```json ... ```)
function parseAiJson(raw) {
  let text = String(raw || '').trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) text = fenced[1].trim();
  try { return JSON.parse(text); } catch { /* thử cắt cặp ngoặc */ }
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(text.slice(start, end + 1)); } catch { /* bỏ qua */ }
  }
  return null;
}

// ═══ TIỆN ÍCH CHỮ ═══
const normVi = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
const trunc = (t, n) => String(t ?? '').replace(/\s+/g, ' ').slice(0, n);
// Dùng kèm `LIKE @x ESCAPE '\'` để tìm đúng ký tự %, _, [ do người dùng gõ
const escapeLike = (t) => String(t).replace(/[\\%_\[]/g, (c) => `\\${c}`);

// Che token/khóa trong thông báo lỗi trước khi lưu hoặc trả về
function maskSecrets(text) {
  let out = String(text ?? '');
  for (const secret of [process.env.FACEBOOK_APP_SECRET, process.env.AI_API_KEY, process.env.FB_VERIFY_TOKEN]) {
    if (secret && String(secret).length >= 6) out = out.split(String(secret)).join('***');
  }
  return out.replace(/EAA[A-Za-z0-9_-]{10,}/g, '***').replace(/access_token=[^&\s"]+/g, 'access_token=***');
}

function errorText(error) {
  const fb = error?.response?.data?.error?.message;
  const ai = error?.response?.data?.error?.message || error?.response?.data?.message;
  return maskSecrets(trunc(fb || ai || error?.message || 'Lỗi không xác định', 400));
}

// ═══ BIẾN TRONG MẪU ═══
// {ten} = tên người bình luận; các biến còn lại nhập ở màn hình "Cấu hình AI" của từng Fanpage.
const VAR_KEYS = ['ten_page', 'sdt_shop', 'dia_chi_shop', 'website', 'gio_mo_cua'];
const ALLOWED_VARS = ['ten', ...VAR_KEYS];
const cleanVars = (v) => Object.fromEntries(VAR_KEYS.map((k) => [k, String((v && v[k]) ?? '').trim().slice(0, 200)]));

const fillTemplate = (content, name, vars = {}) =>
  String(content || '').replace(/\{(\w+)\}/g, (match, key) => {
    const k = key.toLowerCase();
    if (k === 'ten') return name || 'bạn';
    return vars[k] ? vars[k] : match; // chưa nhập thì giữ nguyên để phát hiện
  });
const unresolvedVars = (text) => [...new Set(String(text || '').match(/\{\w+\}/g) || [])];

// ═══ QUY TẮC PHÂN LOẠI BÀI TỪ NHÓM (lấy từ công thức của file Excel mẫu) ═══
const DEFAULT_LEAD_RULES = {
  seller: ['tuyển dụng', 'tuyển nhân viên', 'tuyển sale', 'tuyển ldpt', 'tuyển gấp', 'bên em là', 'bên e là', 'bên mình là', 'mình là .* bên', 'bên em chuyên', 'bên e chuyên', 'bên mình chuyên', 'chuyên cung cấp', 'chuyên sản xuất', 'chuyên thiết kế', 'chuyên in', 'chuyên dịch vụ', 'nhận in', 'nhận làm', 'nhận thiết kế', 'nhận gia công', 'dịch vụ in', 'dịch vụ thiết kế', 'dịch vụ quảng cáo', 'công ty .*chuyên', 'cty .*chuyên', 'xưởng in', 'xưởng sản xuất', 'xưởng gia công', 'bên em cung cấp', 'bên em phân phối', 'hàng đã về', 'hàng có sẵn', 'máy vừa về'],
  buyer: ['cần tìm', 'mình cần', 'em cần', 'bên mình cần', 'cần gấp', 'cần mua', 'cần in', 'cần set', 'cần sản xuất', 'cần đặt', 'tìm xưởng', 'tìm nơi', 'tìm bên', 'tìm đơn vị', 'bên nào nhận', 'bạn nào nhận', 'ai nhận', 'bác nào nhận', 'anh chị nào nhận', 'mn nhận', 'muốn kiếm người làm', 'kiếm người làm', 'xin báo giá', 'báo giá giúp', 'nhờ báo giá', 'cho mình xin báo giá', 'cần job', 'cần việc', 'tìm việc', 'xin việc', 'ai có job']
};

function normalizeRules(saved) {
  if (!saved || typeof saved !== 'object') return DEFAULT_LEAD_RULES;
  return {
    seller: Array.isArray(saved.seller) ? saved.seller : DEFAULT_LEAD_RULES.seller,
    buyer: Array.isArray(saved.buyer) ? saved.buyer : DEFAULT_LEAD_RULES.buyer
  };
}

// ═══ CÀI ĐẶT THEO TỪNG FANPAGE ═══
function mapSettings(pageId, row) {
  return {
    pageId: String(pageId),
    // Mặc định TẮT: kết nối Page xong vẫn không tự trả lời cho tới khi người dùng chủ động bật
    aiEnabled: Boolean(row?.ai_enabled),
    requireApproval: Boolean(row?.require_approval),
    onlyTemplates: Boolean(row?.only_templates),
    tone: row?.tone ?? DEFAULT_TONE,
    shop: row?.shop_info || '',
    vars: cleanVars(parseJson(row?.vars_json, {})),
    leadRules: normalizeRules(parseJson(row?.lead_rules_json, null)),
    pollSince: row?.poll_since || null
  };
}

async function getPageSettings(pageId) {
  const result = await exec('SELECT * FROM dbo.CommentAiPageSettings WHERE page_id = @pageId', [PAGE(pageId)]);
  return mapSettings(pageId, result.recordset[0]);
}

async function savePageSettings(pageId, patch, by) {
  const current = await getPageSettings(pageId);
  const next = {
    aiEnabled: patch.aiEnabled === undefined ? current.aiEnabled : Boolean(patch.aiEnabled),
    requireApproval: patch.requireApproval === undefined ? current.requireApproval : Boolean(patch.requireApproval),
    onlyTemplates: patch.onlyTemplates === undefined ? current.onlyTemplates : Boolean(patch.onlyTemplates),
    tone: patch.tone === undefined ? current.tone : String(patch.tone).slice(0, 2000),
    shop: patch.shop === undefined ? current.shop : String(patch.shop).slice(0, 3000),
    vars: patch.vars === undefined ? current.vars : cleanVars(patch.vars),
    leadRules: patch.leadRules === undefined ? current.leadRules : patch.leadRules
  };
  const now = new Date();
  await exec(`
    UPDATE dbo.CommentAiPageSettings
       SET ai_enabled=@ai, require_approval=@ra, only_templates=@ot, tone=@tone, shop_info=@shop,
           vars_json=@vars, lead_rules_json=@rules, updated_by=@by, updated_at=@now
     WHERE page_id=@pageId;
    IF @@ROWCOUNT = 0
      INSERT INTO dbo.CommentAiPageSettings (page_id, ai_enabled, require_approval, only_templates, tone, shop_info, vars_json, lead_rules_json, updated_by, updated_at)
      VALUES (@pageId, @ai, @ra, @ot, @tone, @shop, @vars, @rules, @by, @now)
  `, [
    PAGE(pageId),
    ['ai', sql.Bit, next.aiEnabled],
    ['ra', sql.Bit, next.requireApproval],
    ['ot', sql.Bit, next.onlyTemplates],
    ['tone', MAXT(), next.tone],
    ['shop', MAXT(), next.shop],
    ['vars', MAXT(), JSON.stringify(next.vars)],
    ['rules', MAXT(), JSON.stringify(next.leadRules)],
    ['by', sql.NVarChar(120), String(by || '')],
    ['now', sql.DateTime2, now]
  ]);
  // Vừa bật AI: chỉ trả lời bình luận từ thời điểm này, không trả lời ngược các bình luận cũ
  if (next.aiEnabled && !current.aiEnabled) {
    await exec('UPDATE dbo.CommentAiPageSettings SET poll_since=@now WHERE page_id=@pageId', [PAGE(pageId), ['now', sql.DateTime2, now]]);
  }
  return getPageSettings(pageId);
}

// ═══ GỌI AI (dùng cấu hình AI chung ở màn hình Cài đặt) ═══
async function callAi(messages, { json = false, maxTokens = 500, temperature = 0.5, timeout = 30000 } = {}) {
  const { apiKey, model, baseUrl } = await getAiConfig();
  if (!apiKey) throw new Error('AI chưa được cấu hình. Hãy vào Cài đặt để thêm AI API Key.');
  const body = { model, messages, temperature, max_tokens: maxTokens };
  const headers = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
  let response;
  try {
    response = await axios.post(`${baseUrl}/chat/completions`, json ? { ...body, response_format: { type: 'json_object' } } : body, { headers, timeout });
  } catch (error) {
    // Một số nhà cung cấp không hỗ trợ response_format: thử lại không có
    if (json && error.response?.status === 400) {
      response = await axios.post(`${baseUrl}/chat/completions`, body, { headers, timeout });
    } else {
      throw error;
    }
  }
  const text = response.data?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('AI không trả về nội dung');
  return text;
}

module.exports = {
  ALLOWED_VARS,
  DEFAULT_LEAD_RULES,
  DEFAULT_TONE,
  MAXT,
  PAGE,
  VAR_KEYS,
  callAi,
  cleanVars,
  errorText,
  escapeLike,
  exec,
  fillTemplate,
  getPageSettings,
  isDuplicateError,
  mapSettings,
  maskSecrets,
  normVi,
  normalizeRules,
  parseAiJson,
  parseJson,
  savePageSettings,
  trunc,
  unresolvedVars
};
