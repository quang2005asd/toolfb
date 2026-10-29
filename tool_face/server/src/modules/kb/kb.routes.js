/**
 * API của phần KB-facts (AI Studio — Knowledge Base loại 3: facts khách / sản phẩm), gắn vào app.js ở /api/kb.
 * Phần riêng, tách khỏi hệ thống chung: app.js nạp module này trong try/catch — module thiếu hoặc lỗi
 * thì chỉ tắt /api/kb, máy chủ và các tính năng khác vẫn chạy.
 */
const express = require('express');
const { requireAuth } = require('../../middlewares/auth');
const kbFactsService = require('../../utils/KbFactsService');

const router = express.Router();

router.get('/customers', requireAuth, async (req, res) => {
  try {
    const customers = await kbFactsService.getKbCustomers(req.user.sub, req.user.role);
    return res.json({ success: true, customers });
  } catch (error) {
    console.error('[KB Customers Error]', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/assign-customer', requireAuth, async (req, res) => {
  try {
    const userRole = req.user?.role || 'user';
    if (!['admin', 'manager'].includes(userRole.toLowerCase())) {
      return res.status(403).json({ success: false, message: 'Chỉ quản trị viên mới có quyền gán quyền khách hàng.' });
    }
    const { user_id, customer_id, role = 'member' } = req.body || {};
    if (!user_id || !customer_id) {
      return res.status(400).json({ success: false, message: 'Vui lòng cung cấp user_id và customer_id.' });
    }
    const result = await kbFactsService.assignUserToCustomer(user_id, customer_id, role);
    return res.json({ success: true, ...result });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/facts', requireAuth, async (req, res) => {
  try {
    const { customer_id, status } = req.query;
    if (!customer_id) {
      return res.status(400).json({ success: false, message: 'Thiếu tham số customer_id.' });
    }
    const facts = await kbFactsService.getFactsByCustomer(customer_id, status || 'ALL', req.user.sub, req.user.role);
    return res.json({ success: true, facts });
  } catch (error) {
    console.error('[KB Facts Error]', error.message);
    const status = error.message.includes('Quyền truy cập bị từ chối') ? 403 : 500;
    return res.status(status).json({ success: false, message: error.message });
  }
});

router.post('/facts', requireAuth, async (req, res) => {
  try {
    const { customer_id, fact_type, content, source, expires_at } = req.body || {};
    const actorRole = req.user?.role || 'user';
    const fact = await kbFactsService.createFact({
      customerId: customer_id,
      factType: fact_type,
      content,
      source,
      expiresAt: expires_at,
      actor: req.user?.sub || 'user',
      actorRole
    });
    return res.json({ success: true, fact });
  } catch (error) {
    console.error('[KB Create Fact Error]', error.message);
    const status = error.message.includes('Quyền truy cập bị từ chối') ? 403 : 500;
    return res.status(status).json({ success: false, message: error.message });
  }
});

router.put('/facts/:id', requireAuth, async (req, res) => {
  try {
    const { fact_type, content, source, expires_at, expected_updated_at, expectedUpdatedAt } = req.body || {};
    const actorRole = req.user?.role || 'user';
    const fact = await kbFactsService.updateFact(req.params.id, {
      factType: fact_type,
      content,
      source,
      expiresAt: expires_at,
      actorId: req.user?.sub || 'user',
      actorRole,
      expectedUpdatedAt: expected_updated_at || expectedUpdatedAt || null
    });
    return res.json({ success: true, fact });
  } catch (error) {
    console.error('[KB Update Fact Error]', error.message);
    let status = 500;
    if (error.message.includes('409 Conflict') || error.message.includes('Xung đột đồng thời')) {
      status = 409;
    } else if (error.message.includes('Quyền truy cập bị từ chối')) {
      status = 403;
    } else if (error.message.includes('vượt quá 1000 ký tự') || error.message.includes('nguồn chứng thực')) {
      status = 400;
    }
    return res.status(status).json({ success: false, message: error.message });
  }
});

router.post('/facts/:id/confirm', requireAuth, async (req, res) => {
  try {
    const userRole = req.user?.role || 'user';
    const { expected_updated_at, expectedUpdatedAt } = req.body || {};
    const fact = await kbFactsService.confirmFact(req.params.id, {
      confirmedBy: req.user?.sub || 'reviewer',
      confirmedRole: userRole,
      expectedUpdatedAt: expected_updated_at || expectedUpdatedAt || null
    });
    return res.json({ success: true, fact });
  } catch (error) {
    console.error('[KB Confirm Fact Error]', error.message);
    let status = 500;
    if (error.message.includes('409 Conflict') || error.message.includes('Xung đột đồng thời')) {
      status = 409;
    } else if (error.message.includes('Chỉ kiểm duyệt viên') || error.message.includes('Quyền truy cập bị từ chối')) {
      status = 403;
    } else if (error.message.includes('Xung đột quyền lợi')) {
      status = 400;
    }
    return res.status(status).json({ success: false, message: error.message });
  }
});

router.get('/expired-published-alerts', requireAuth, async (req, res) => {
  try {
    const alerts = await kbFactsService.checkPublishedPostsWithExpiredFacts();
    return res.json({ success: true, count: alerts.length, alerts });
  } catch (error) {
    console.error('[KB Expired Published Alerts Error]', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/facts/:id/retire', requireAuth, async (req, res) => {
  try {
    const actorRole = req.user?.role || 'user';
    const fact = await kbFactsService.retireFact(req.params.id, req.user?.sub, actorRole);
    return res.json({ success: true, fact });
  } catch (error) {
    console.error('[KB Retire Fact Error]', error.message);
    const status = error.message.includes('Quyền truy cập bị từ chối') ? 403 : 500;
    return res.status(status).json({ success: false, message: error.message });
  }
});

router.delete('/facts/:id', requireAuth, async (req, res) => {
  try {
    const userRole = req.user?.role || 'user';
    const deleted = await kbFactsService.deleteFact(req.params.id, req.user?.sub, userRole);
    return res.json({ success: true, deleted });
  } catch (error) {
    console.error('[KB Delete Fact Error]', error.message);
    const status = (error.message.includes('Chỉ quản trị viên') || error.message.includes('Quyền truy cập bị từ chối')) ? 403 : 500;
    return res.status(status).json({ success: false, message: error.message });
  }
});

module.exports = { kbRouter: router, kbFactsService };
