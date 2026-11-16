const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'comment-ai-safety-'));
process.env.USE_SQLITE = 'true';
process.env.APP_DATA_DIR = dataDir;
process.env.SESSION_SECRET = 'comment-ai-safety-test-secret-with-at-least-32-characters';
const service = require('../src/utils/CommentAiService');
const core = require('../src/utils/CommentAiCore');
const axios = require('axios');
const { encryptToken, ensureSchema } = require('../src/utils/FacebookPageConnections');
const { sql } = require('../config/db');

async function preparePageToken(pageId) {
  await ensureSchema();
  await core.exec(`
    INSERT INTO dbo.FacebookPages (facebook_user_id, page_id, page_name, page_access_token_encrypted, tasks_json, updated_at)
    VALUES (@userId, @pageId, @name, @token, @tasks, @now)
  `, [
    ['userId', sql.VarChar(64), 'test-user'],
    core.PAGE(pageId),
    ['name', sql.NVarChar(200), 'Test Page'],
    ['token', sql.NVarChar(sql.MAX), encryptToken('test-page-token')],
    ['tasks', sql.NVarChar(sql.MAX), '[]'],
    ['now', sql.DateTime2, new Date()]
  ]);
}

test('rejects contact details and placeholder phone-number sequences not present in approved sources', () => {
  const allowed = ['Liên hệ 0901234567, hello@shop.vn hoặc https://shop.vn; địa chỉ: 12 Nguyễn Trãi, Quận 1'];
  assert.equal(service.validateReplyFacts('Gọi 0000000000', allowed).valid, false);
  assert.equal(service.validateReplyFacts('Gọi 1111111111', allowed).valid, false);
  assert.equal(service.validateReplyFacts('Gọi 1234567890', allowed).valid, false);
  assert.equal(service.validateReplyFacts('Liên hệ 0900000000', allowed).valid, false);
  assert.equal(service.validateReplyFacts('Email fake@example.com', allowed).valid, false);
  assert.equal(service.validateReplyFacts('Xem tại https://fake.example', allowed).valid, false);
  assert.equal(service.validateReplyFacts('Địa chỉ: 1 Lê Lợi, Quận 3', allowed).valid, false);
});

test('allows phone, email, link, and address only when the exact facts exist in approved sources', () => {
  const source = 'Gọi 0907654321, email hello@shop.vn, website https://shop.vn, địa chỉ: 12 Nguyễn Trãi, Quận 1';
  const result = service.validateReplyFacts(source, [source]);
  assert.equal(result.valid, true);
  assert.deepEqual(result.violations, []);
});

test('a phone question with no Page phone is answered with a Messenger handoff', async () => {
  const originalCallAi = core.callAi;
  core.callAi = async () => JSON.stringify({
    sentiment: 'purchase',
    template_id: null,
    reply: 'Gọi shop 0000000000 hoặc 1234567890 nhé.'
  });
  try {
    const result = await service.generateReply(
      'Cho mình xin số điện thoại shop',
      { aiEnabled: true, vars: {}, shop: '' },
      [],
      'Khách'
    );
    assert.match(result.reply, /nhắn tin trực tiếp cho Page/);
    assert.doesNotMatch(result.reply, /0000000000|1234567890/);
  } finally {
    core.callAi = originalCallAi;
  }
});

test('an unsafe reply is regenerated once and replaced by a safe handoff if still unsafe', async () => {
  const originalCallAi = core.callAi;
  let calls = 0;
  core.callAi = async () => {
    calls += 1;
    return JSON.stringify({ sentiment: 'neutral', template_id: null, reply: 'Email fake@example.com hoặc gọi 0000000000' });
  };
  try {
    const result = await service.generateReply(
      'Xin chào shop',
      { aiEnabled: true, vars: {}, shop: '' },
      [],
      'Khách'
    );
    assert.equal(calls, 2);
    assert.match(result.reply, /nhắn tin trực tiếp cho Page/);
    assert.doesNotMatch(result.reply, /fake@example\.com|0000000000/);
  } finally {
    core.callAi = originalCallAi;
  }
});

test('blank phone variables never produce 0000000000 across 100 phone-request replies', async () => {
  const originalCallAi = core.callAi;
  core.callAi = async () => JSON.stringify({
    sentiment: 'purchase',
    template_id: null,
    reply: 'Số shop là 0000000000'
  });
  try {
    for (let i = 0; i < 100; i += 1) {
      const result = await service.generateReply(
        'SĐT shop?',
        { aiEnabled: true, vars: { sdt_shop: '' }, shop: '' },
        [],
        'Khách'
      );
      assert.doesNotMatch(result.reply, /0000000000/);
      assert.match(result.reply, /nhắn tin trực tiếp cho Page/);
    }
  } finally {
    core.callAi = originalCallAi;
  }
});

test('Facebook Page defaults fill blank values but do not replace values already entered', async () => {
  const pageId = 'safety-test-page';
  let settings = await service.syncFacebookPageDefaults(pageId, {
    name: 'Page Từ Facebook',
    category: 'Thời trang',
    phone: '0901234567',
    single_line_address: '12 Nguyễn Trãi, Quận 1',
    website: 'https://shop.vn',
    hours: { mon_1_open: '08:00', mon_1_close: '17:30', tue_1_open: '08:00', tue_1_close: '17:30' },
    about: 'Giới thiệu',
    description: 'Mô tả'
  });
  assert.equal(settings.vars.ten_page, 'Page Từ Facebook');
  assert.equal(settings.vars.sdt_shop, '0901234567');
  assert.equal(settings.vars.dia_chi_shop, '12 Nguyễn Trãi, Quận 1');
  assert.equal(settings.vars.gio_mo_cua, 'T2-T3: 8:00-17:30');
  assert.match(settings.shop, /Ngành: Thời trang/);
  assert.equal(settings.facebookSources.vars.sdt_shop, 'facebook');
  assert.equal(settings.facebookSources.shop, 'facebook');

  settings = await core.savePageSettings(pageId, {
    vars: { ...settings.vars, sdt_shop: '0912345678' },
    shop: 'Thông tin do người dùng tự nhập'
  }, 'Người dùng');
  const updated = await service.syncFacebookPageDefaults(pageId, {
    name: 'Tên mới từ Facebook',
    phone: '0987654321',
    single_line_address: 'Địa chỉ mới'
  });
  assert.equal(updated.vars.sdt_shop, '0912345678');
  assert.equal(updated.vars.ten_page, 'Page Từ Facebook');
  assert.equal(updated.shop, 'Thông tin do người dùng tự nhập');

  await core.savePageSettings(pageId, {
    vars: { ...updated.vars, sdt_shop: '' },
    shop: '',
    facebookSources: {
      ...updated.facebookSources,
      vars: { ...updated.facebookSources.vars, sdt_shop: 'manual' },
      shop: 'manual'
    }
  }, 'Người dùng');
  const clearedByUser = await service.syncFacebookPageDefaults(pageId, {
    phone: '0987654321',
    name: 'Tên mới'
  });
  assert.equal(clearedByUser.vars.sdt_shop, '');
  assert.equal(clearedByUser.shop, '');
});

test('deleting a reply removes only the Page reply and keeps the customer comment log until Graph succeeds', async () => {
  const pageId = 'delete-reply-page';
  await preparePageToken(pageId);
  const id = await service.addLog(pageId, {
    commentId: 'customer-comment-1',
    replyCommentId: 'page-reply-1',
    message: 'Bình luận khách',
    reply: 'Phản hồi Page',
    status: 'done'
  });
  await core.exec(`
    INSERT INTO dbo.CommentAiProcessedComments (page_id, comment_id, status, reason, source, processed_at)
    VALUES (@pageId, @commentId, 'done', NULL, 'poll', @now)
  `, [core.PAGE(pageId), ['commentId', sql.VarChar(100), 'customer-comment-1'], ['now', sql.DateTime2, new Date()]]);
  const originalDelete = axios.delete;
  let deletedUrl = '';
  axios.delete = async (url, config) => {
    deletedUrl = url;
    assert.equal(config.params.access_token, 'test-page-token');
    return { data: { success: true } };
  };
  try {
    assert.equal(await service.deleteLog(pageId, id, 'reply', 'member'), true);
    assert.match(deletedUrl, /page-reply-1$/);
    const remaining = await core.exec('SELECT id FROM dbo.CommentAiLogs WHERE id=@id', [['id', sql.Int, id]]);
    assert.equal(remaining.recordset.length, 0);
    const processed = await core.exec(`
      SELECT comment_id FROM dbo.CommentAiProcessedComments
       WHERE page_id=@pageId AND comment_id=@commentId
    `, [core.PAGE(pageId), ['commentId', sql.VarChar(100), 'customer-comment-1']]);
    assert.equal(processed.recordset.length, 1);
  } finally {
    axios.delete = originalDelete;
  }
});

test('already-missing Facebook reply counts as success, but a missing permission keeps the log', async () => {
  const pageId = 'delete-error-page';
  await preparePageToken(pageId);
  const missingId = await service.addLog(pageId, {
    commentId: 'customer-comment-2',
    replyCommentId: 'deleted-reply',
    status: 'done'
  });

  test('hiding a customer comment is restricted to admin and manager roles', async () => {
    const pageId = 'hide-permission-page';
    await preparePageToken(pageId);
    const id = await service.addLog(pageId, { commentId: 'customer-comment-hide', status: 'done' });
    await assert.rejects(service.deleteLog(pageId, id, 'hide_comment', 'member'), /admin hoặc manager/);
    const remaining = await core.exec('SELECT id FROM dbo.CommentAiLogs WHERE id=@id', [['id', sql.Int, id]]);
    assert.equal(remaining.recordset.length, 1);
  });

  test('manager can hide the customer comment with the Facebook is_hidden action', async () => {
    const pageId = 'hide-comment-page';
    await preparePageToken(pageId);
    const id = await service.addLog(pageId, { commentId: 'customer-comment-to-hide', status: 'done' });
    const originalPost = axios.post;
    axios.post = async (url, data) => {
      assert.match(url, /customer-comment-to-hide$/);
      assert.equal(data.is_hidden, true);
      assert.equal(data.access_token, 'test-page-token');
      return { data: { success: true } };
    };
    try {
      assert.equal(await service.deleteLog(pageId, id, 'hide_comment', 'manager'), true);
    } finally {
      axios.post = originalPost;
    }
  });

  test('bulk deletion processes all selected rows through the requested Facebook action', async () => {
    const pageId = 'bulk-delete-page';
    await preparePageToken(pageId);
    const ids = await Promise.all(['reply-bulk-1', 'reply-bulk-2'].map((replyCommentId, index) => service.addLog(pageId, {
      commentId: `customer-bulk-${index}`,
      replyCommentId,
      status: 'done'
    })));
    const originalDelete = axios.delete;
    axios.delete = async () => ({ data: { success: true } });
    try {
      const result = await service.deleteLogs(pageId, ids, 'reply', 'member');
      assert.deepEqual(result, { deleted: ids, failed: [] });
    } finally {
      axios.delete = originalDelete;
    }
  });
  const permissionId = await service.addLog(pageId, {
    commentId: 'customer-comment-3',
    replyCommentId: 'protected-reply',
    status: 'done'
  });
  const originalDelete = axios.delete;
  axios.delete = async (url) => {
    if (url.endsWith('deleted-reply')) {
      const error = new Error('Not found');
      error.response = { status: 400, data: { error: { code: 100, error_subcode: 33, message: 'Object does not exist.' } } };
      throw error;
    }
    const error = new Error('Permission denied');
    error.response = { status: 403, data: { error: { code: 200, message: 'Missing pages_manage_engagement' } } };
    throw error;
  };
  try {
    assert.equal(await service.deleteLog(pageId, missingId, 'reply', 'member'), true);
    await assert.rejects(service.deleteLog(pageId, permissionId, 'reply', 'member'), /pages_manage_engagement/);
    const remaining = await core.exec('SELECT id FROM dbo.CommentAiLogs WHERE id=@id', [['id', sql.Int, permissionId]]);
    assert.equal(remaining.recordset.length, 1);
  } finally {
    axios.delete = originalDelete;
  }
});

test.after(() => {
  try {
    fs.rmSync(dataDir, { recursive: true, force: true });
  } catch {}
});
