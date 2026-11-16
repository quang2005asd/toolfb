/**
 * comment-ai.routes.js
 * API của module "AI Bình luận" (gắn vào app.js ở /api/comment-ai) và webhook Facebook (/api/webhooks/facebook).
 * Mọi API đều cần đăng nhập và phải chỉ rõ Fanpage (?pageId=... hoặc body.pageId) mà người dùng có quyền truy cập.
 * Quy ước phản hồi giống phần còn lại của dự án: { success, message, ...dữ liệu }.
 */
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const { requireAuth } = require('../../middlewares/auth');
const { getConnectedPages } = require('../../utils/FacebookPageConnections');
const { getSettings } = require('../../utils/SettingsService');
const core = require('../../utils/CommentAiCore');
const service = require('../../utils/CommentAiService');
const leads = require('../../utils/CommentAiLeadService');

const { PAGE, VAR_KEYS, errorText, exec, getPageSettings, savePageSettings } = core;

const router = express.Router();
const leadUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

function sendError(res, label, error) {
  const status = error.status || (error.response ? 502 : 500);
  const message = error.status ? error.message : errorText(error);
  if (status >= 500) console.error(`[CommentAI ${label}]`, message);
  return res.status(status).json({ success: false, message });
}

const handle = (label, fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (error) {
    sendError(res, label, error);
  }
};

const actor = (req) => ({ id: String(req.user.sub), name: req.user.name || 'Người dùng', role: req.user.role });

// Chặn truy cập Fanpage không thuộc quyền của người dùng (admin được xem mọi Fanpage đã kết nối)
async function pageGuard(req, res, next) {
  const pageId = String(req.query.pageId || req.body?.pageId || req.get('x-page-id') || '').trim();
  if (!/^\d+$/.test(pageId)) {
    return res.status(400).json({ success: false, message: 'Vui lòng chọn Fanpage.' });
  }
  try {
    let allowed;
    if (req.user.role === 'admin') {
      allowed = (await exec('SELECT TOP 1 page_id FROM dbo.FacebookPages WHERE page_id=@pageId', [PAGE(pageId)])).recordset.length > 0;
    } else {
      allowed = (await getConnectedPages(req.user.sub)).some((p) => String(p.id) === pageId);
    }
    if (!allowed) return res.status(403).json({ success: false, message: 'Bạn không có quyền với Fanpage này.' });
    req.pageId = pageId;
    return next();
  } catch (error) {
    return sendError(res, 'PageGuard', error);
  }
}

router.use(requireAuth, pageGuard);

// ═══ CẤU HÌNH AI CỦA FANPAGE ═══
router.get('/settings', handle('Settings', async (req, res) => {
  const s = await getPageSettings(req.pageId);
  const { leadRules, pollSince, ...settings } = s;
  res.json({ success: true, settings, defaults: { tone: core.DEFAULT_TONE } });
}));

router.get('/studio-tone', handle('Studio Tone', async (req, res) => {
  const settings = await getSettings();
  res.json({
    success: true,
    tone: String(settings.ai_system_prompt || 'Bạn là trợ lý sáng tạo nội dung chuyên nghiệp cho Fanpage Facebook. Giọng văn tự nhiên, lôi cuốn, chuẩn phong cách viral mạng xã hội.').trim()
  });
}));

router.put('/settings', handle('Settings Save', async (req, res) => {
  const b = req.body || {};
  const previous = await getPageSettings(req.pageId);
  const wasEnabled = previous.aiEnabled || previous.onlyTemplates;
  const canManageApproval = req.user.role === 'admin' || req.user.role === 'manager';
  const facebookSources = {
    ...(previous.facebookSources || {}),
    vars: { ...((previous.facebookSources || {}).vars || {}) }
  };
  if (b.vars && typeof b.vars === 'object') {
    for (const key of VAR_KEYS) {
      if (String(b.vars[key] || '').trim() !== String(previous.vars[key] || '').trim()) facebookSources.vars[key] = 'manual';
    }
  }
  if (b.shop !== undefined && String(b.shop || '').trim() !== String(previous.shop || '').trim()) {
    facebookSources.shop = 'manual';
  }
  const s = await savePageSettings(req.pageId, {
    aiEnabled: b.aiEnabled,
    requireApproval: canManageApproval ? b.requireApproval : undefined,
    onlyTemplates: b.onlyTemplates,
    tone: b.tone,
    shop: b.shop,
    vars: b.vars,
    facebookSources
  }, actor(req).name);
  let webhookNote = null;
  if ((s.aiEnabled || s.onlyTemplates) && !wasEnabled) {
    try {
      await service.subscribePage(req.pageId);
      webhookNote = 'Đã đăng ký webhook cho Fanpage.';
    } catch (error) {
      webhookNote = `Chưa đăng ký được webhook (${errorText(error)}). Tool vẫn quét bình luận mới mỗi 2 phút.`;
    }
  }
  const { leadRules, pollSince, ...settings } = s;
  res.json({ success: true, settings, message: webhookNote ? `Đã lưu. ${webhookNote}` : 'Đã lưu cấu hình AI.' });
}));

router.post('/settings/facebook-refresh', handle('Facebook Info Refresh', async (req, res) => {
  const result = await service.refreshFacebookPageInfo(req.pageId);
  const missing = ['sdt_shop'].filter((key) => !result.settings.vars[key]);
  res.json({
    success: true,
    settings: result.settings,
    availableFields: result.availableFields,
    warning: missing.length ? 'Chưa có SĐT, AI sẽ mời khách nhắn tin thay vì đưa số' : null,
    message: 'Đã lấy lại thông tin Facebook. Dữ liệu người dùng đã nhập không bị ghi đè.'
  });
}));

router.post('/subscribe', handle('Subscribe', async (req, res) => {
  await service.subscribePage(req.pageId);
  res.json({ success: true, message: 'Đã đăng ký webhook cho Fanpage.' });
}));

router.post('/scan', handle('Scan', async (req, res) => {
  const result = await service.pollPage(req.pageId);
  res.json({ success: true, count: result?.count || 0, skipped: Boolean(result?.skipped), reason: result?.reason || null });
}));

router.post('/preview', handle('Preview', async (req, res) => {
  const comment = String(req.body?.comment ?? '').trim();
  if (!comment) return res.status(400).json({ success: false, message: 'Hãy nhập bình luận mẫu.' });
  const result = await service.previewReply(req.pageId, comment, req.body);
  res.json({ success: true, ...result });
}));

// ═══ ĐỀ XUẤT CÁCH TRẢ LỜI (QUÉT 24 GIỜ) ═══
router.get('/suggestions', handle('Suggestions List', async (req, res) => {
  const data = await service.listSuggestions(req.pageId);
  res.json({ success: true, ...data });
}));

router.post('/suggestions/scan', handle('Suggestions Scan', async (req, res) => {
  const data = await service.runSuggestions(req.pageId);
  res.json({ success: true, ...data });
}));

router.put('/suggestions/:id', handle('Suggestions Update', async (req, res) => {
  const id = Number(req.params.id);
  const status = String(req.body?.trangThai || '').trim();
  if (!['moi', 'da_dung', 'bo_qua'].includes(status)) {
    return res.status(400).json({ success: false, message: 'Trạng thái không hợp lệ.' });
  }
  const result = await service.updateSuggestionStatus(req.pageId, id, status);
  res.json({ success: true, ...result });
}));

// ═══ MẪU TRẢ LỜI ═══
router.get('/templates', handle('Templates', async (req, res) => {
  res.json({ success: true, templates: await service.listTemplates(req.pageId) });
}));

router.post('/templates/suggest', handle('Templates Suggest', async (req, res) => {
  res.json({ success: true, ...(await service.suggestTemplates(req.pageId)) });
}));

router.post('/templates/generate', handle('Templates Generate', async (req, res) => {
  const rawCount = req.body?.count;
  const count = rawCount === undefined ? 5 : Number(rawCount);
  if (!Number.isInteger(count) || count < 1) {
    return res.status(400).json({ success: false, message: 'Số mẫu phải là số nguyên dương.' });
  }
  const drafts = await service.generateTemplateDrafts(req.pageId, {
    topic: String(req.body?.topic || '').trim().slice(0, 2000),
    postContent: String(req.body?.postContent || '').trim().slice(0, 8000),
    count: Math.min(count, 10)
  });
  res.json({ success: true, drafts });
}));

router.post('/templates', handle('Templates Create', async (req, res) => {
  const settings = await getPageSettings(req.pageId);
  const template = await service.createTemplate(req.pageId, actor(req), req.body || {}, settings);
  res.status(201).json({ success: true, template, message: template.status === 'pending' ? 'Đã gửi quản trị duyệt mẫu.' : 'Đã lưu mẫu.' });
}));

router.put('/templates/:id', handle('Templates Update', async (req, res) => {
  const settings = await getPageSettings(req.pageId);
  const template = await service.updateTemplate(req.pageId, actor(req), Number(req.params.id), req.body || {}, settings);
  res.json({ success: true, template, message: template.status === 'pending' ? 'Đã gửi quản trị duyệt lại mẫu.' : 'Đã lưu mẫu.' });
}));

function adminOnly(req, res) {
  if (req.user.role !== 'admin') {
    res.status(403).json({ success: false, message: 'Thao tác này chỉ dành cho admin.' });
    return false;
  }
  return true;
}

router.post('/templates/:id/approve', handle('Templates Approve', async (req, res) => {
  if (!adminOnly(req, res)) return;
  res.json({ success: true, template: await service.reviewTemplate(req.pageId, actor(req), Number(req.params.id), true), message: 'Đã duyệt mẫu.' });
}));

router.post('/templates/:id/reject', handle('Templates Reject', async (req, res) => {
  if (!adminOnly(req, res)) return;
  res.json({ success: true, template: await service.reviewTemplate(req.pageId, actor(req), Number(req.params.id), false, req.body?.reason), message: 'Đã từ chối mẫu.' });
}));

router.delete('/templates/:id', handle('Templates Delete', async (req, res) => {
  const settings = await getPageSettings(req.pageId);
  const user = actor(req);
  const current = await service.getTemplate(req.pageId, Number(req.params.id));
  if (!current) return res.status(404).json({ success: false, message: 'Không tìm thấy mẫu' });
  // Khi bật yêu cầu duyệt: chỉ admin hoặc chính người soạn được xóa
  if (settings.requireApproval && user.role !== 'admin' && current.createdBy !== user.name) {
    return res.status(403).json({ success: false, message: 'Chỉ admin hoặc người soạn mẫu được xóa.' });
  }
  await service.removeTemplate(req.pageId, user, Number(req.params.id));
  res.json({ success: true, message: 'Đã xóa mẫu.' });
}));

// ═══ KHÁCH HÀNG ═══
router.get('/customers', handle('Customers', async (req, res) => {
  res.json({ success: true, customers: await service.listCustomers(req.pageId, { q: String(req.query.q || '').trim(), tag: String(req.query.tag || '').trim(), limit: req.query.limit }) });
}));

router.get('/customers/:id', handle('Customer Detail', async (req, res) => {
  const customer = await service.getCustomer(req.pageId, Number(req.params.id));
  if (!customer) return res.status(404).json({ success: false, message: 'Không tìm thấy khách hàng' });
  res.json({ success: true, customer });
}));

router.put('/customers/:id', handle('Customer Update', async (req, res) => {
  res.json({ success: true, customer: await service.updateCustomer(req.pageId, actor(req), Number(req.params.id), req.body || {}), message: 'Đã lưu hồ sơ.' });
}));

router.delete('/customers/:id', handle('Customer Delete', async (req, res) => {
  if (!adminOnly(req, res)) return;
  res.json({ success: await service.deleteCustomer(req.pageId, Number(req.params.id)) });
}));

// ═══ BÀI TỪ NHÓM ═══
router.get('/leads', handle('Leads', async (req, res) => {
  res.json({ success: true, ...(await leads.listLeads(req.pageId, { category: req.query.category, status: req.query.status, q: String(req.query.q || '').trim(), limit: req.query.limit, offset: req.query.offset })) });
}));

router.post('/leads/import', leadUpload.single('file'), handle('Leads Import', async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'Vui lòng chọn file Excel hoặc CSV.' });
  const result = await leads.importLeads(req.pageId, req.file.buffer);
  res.json({ success: true, ...result, message: `Đã thêm ${result.added} bài, bỏ ${result.duplicates} bài trùng link, ${result.blank} dòng trống.` });
}));

router.post('/leads/bulk', handle('Leads Bulk', async (req, res) => {
  res.json({ success: true, updated: await leads.bulkStatus(req.pageId, actor(req), req.body?.ids, req.body?.status) });
}));

router.post('/leads/reclassify', handle('Leads Reclassify', async (req, res) => {
  const result = await leads.reclassify(req.pageId, req.body?.scope);
  res.json({ success: true, ...result, message: `Đã xét ${result.checked} bài, đổi ${result.changed}.` });
}));

router.post('/leads/ai-classify', handle('Leads AI Classify', async (req, res) => {
  const result = await leads.aiClassify(req.pageId);
  res.json({ success: true, ...result, message: `AI đã xét ${result.checked} bài, đổi ${result.changed}.` });
}));

router.get('/lead-rules', handle('Lead Rules', async (req, res) => {
  res.json({ success: true, rules: await leads.getRules(req.pageId), defaults: core.DEFAULT_LEAD_RULES });
}));

router.put('/lead-rules', handle('Lead Rules Save', async (req, res) => {
  res.json({ success: true, rules: await leads.saveRules(req.pageId, actor(req), req.body), message: 'Đã lưu quy tắc phân loại.' });
}));

router.put('/leads/:id', handle('Lead Update', async (req, res) => {
  res.json({ success: true, lead: await leads.updateLead(req.pageId, actor(req), Number(req.params.id), req.body || {}) });
}));

router.post('/leads/:id/reply', handle('Lead Reply', async (req, res) => {
  res.json({ success: true, ...(await leads.draftReply(req.pageId, Number(req.params.id), req.body?.templateId)) });
}));

router.delete('/leads/:id', handle('Lead Delete', async (req, res) => {
  if (!adminOnly(req, res)) return;
  res.json({ success: await leads.deleteLead(req.pageId, Number(req.params.id)) });
}));

// ═══ NHẬT KÝ + CHẨN ĐOÁN ═══
router.get('/logs', handle('Logs', async (req, res) => {
  res.json({ success: true, logs: await service.listLogs(req.pageId, { group: req.query.group === 'all' ? 'all' : 'activity', limit: req.query.limit }) });
}));

router.delete('/logs/:id', handle('Logs Delete', async (req, res) => {
  const action = String(req.body?.action || 'reply');
  if (action === 'hide_comment' && !['admin', 'manager'].includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Ẩn bình luận của khách trên Facebook chỉ dành cho admin hoặc manager.' });
  }
  res.json({ success: await service.deleteLog(req.pageId, Number(req.params.id), action, req.user.role) });
}));

router.post('/logs/delete-bulk', handle('Logs Bulk Delete', async (req, res) => {
  const ids = req.body?.ids;
  const action = String(req.body?.action || 'reply');
  if (!Array.isArray(ids) || !ids.length || ids.length > 100 || ids.some((id) => !Number.isInteger(Number(id)) || Number(id) < 1)) {
    return res.status(400).json({ success: false, message: 'Chọn từ 1 đến 100 dòng hoạt động để xóa.' });
  }
  if (action === 'hide_comment' && !['admin', 'manager'].includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Ẩn bình luận của khách trên Facebook chỉ dành cho admin hoặc manager.' });
  }
  const result = await service.deleteLogs(req.pageId, ids, action, req.user.role);
  res.status(result.failed.length ? 207 : 200).json({
    success: result.failed.length === 0,
    ...result,
    message: result.failed.length
      ? `Đã xóa ${result.deleted.length} dòng; ${result.failed.length} dòng còn giữ lại do lỗi Facebook.`
      : `Đã xóa ${result.deleted.length} dòng hoạt động.`
  });
}));

router.get('/diagnostics', handle('Diagnostics', async (req, res) => {
  const report = await service.buildDiagnostics(req.pageId, { full: req.query.full === '1', host: req.get('host') });
  res.json({ success: true, report });
}));

// ═══ WEBHOOK FACEBOOK (công khai, không cần đăng nhập) ═══
const webhookRouter = express.Router();

webhookRouter.get('/', (req, res) => {
  const expected = process.env.FB_VERIFY_TOKEN || process.env.MESSENGER_VERIFY_TOKEN;
  if (expected && req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === expected) {
    return res.status(200).send(req.query['hub.challenge']);
  }
  return res.sendStatus(403);
});

function signatureValid(req) {
  const secret = process.env.FACEBOOK_APP_SECRET;
  // Chưa có App Secret thì không xác thực được nguồn gửi → từ chối (tránh nhận sự kiện giả mạo)
  if (!secret) return false;
  const provided = String(req.get('x-hub-signature-256') || '');
  if (!req.rawBody || !provided) return false;
  const expected = `sha256=${crypto.createHmac('sha256', secret).update(req.rawBody).digest('hex')}`;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

webhookRouter.post('/', (req, res) => {
  if (!signatureValid(req)) return res.sendStatus(403);
  res.status(200).send('EVENT_RECEIVED'); // trả lời Facebook ngay, xử lý ở nền
  service.handleWebhookBody(req.body).catch((error) => console.error('[CommentAI Webhook]', errorText(error)));
});

module.exports = { commentAiRouter: router, facebookWebhookRouter: webhookRouter };
