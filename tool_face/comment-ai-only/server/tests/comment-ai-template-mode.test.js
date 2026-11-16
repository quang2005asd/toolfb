const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'comment-ai-template-mode-'));
process.env.USE_SQLITE = 'true';
process.env.APP_DATA_DIR = dataDir;
const { generateReply } = require('../src/utils/CommentAiService');

test('AI-off mode matches keywords and fills template variables without calling AI', async () => {
  const result = await generateReply(
    'Shop ơi cho mình xin giá sản phẩm',
    {
      aiEnabled: false,
      vars: { sdt_shop: '0900000000' }
    },
    [
      { id: 1, name: 'Giá sản phẩm', keywords: 'giá, bao nhiêu', content: 'Chào {ten}, vui lòng gọi {sdt_shop}.', mode: 'guided' },
      { id: 2, name: 'Mẫu khác', keywords: 'địa chỉ', content: 'Địa chỉ: {dia_chi_shop}', mode: 'exact' }
    ],
    'An'
  );

  assert.equal(result.reply, 'Chào An, vui lòng gọi 0900000000.');
  assert.deepEqual(result.template, { id: 1, name: 'Giá sản phẩm' });
  assert.equal(result.skip, undefined);
});

test('AI-off mode uses an unkeyed template as a fallback', async () => {
  const result = await generateReply(
    'Xin chào shop',
    { aiEnabled: false, onlyTemplates: false, vars: {} },
    [{ id: 3, name: 'Mặc định', keywords: '', content: 'Shop xin chào bạn!', mode: 'guided' }]
  );

  assert.equal(result.reply, 'Shop xin chào bạn!');
  assert.deepEqual(result.template, { id: 3, name: 'Mặc định' });
});

test('AI-off mode with template-only enabled requires a keyword match', async () => {
  const result = await generateReply(
    'Xin chào shop',
    { aiEnabled: false, onlyTemplates: true, vars: {} },
    [{ id: 3, name: 'Mặc định', keywords: '', content: 'Shop xin chào bạn!', mode: 'guided' }]
  );

  assert.equal(result.skip, true);
  assert.equal(result.reason, 'Không có mẫu nào khớp từ khóa');
});

test('AI-off mode skips when no template matches or a template variable is unset', async () => {
  const unmatched = await generateReply(
    'Câu hỏi không liên quan',
    { aiEnabled: false, vars: {} },
    [{ id: 4, name: 'Giá', keywords: 'giá, bao nhiêu', content: 'Giá {sdt_shop}', mode: 'exact' }]
  );
  const missingVariable = await generateReply(
    'Giá bao nhiêu?',
    { aiEnabled: false, vars: {} },
    [{ id: 4, name: 'Giá', keywords: 'giá, bao nhiêu', content: 'Gọi {sdt_shop}', mode: 'exact' }]
  );

  assert.equal(unmatched.skip, true);
  assert.match(unmatched.reason, /Không có mẫu/);
  assert.equal(missingVariable.skip, true);
  assert.match(missingVariable.reason, /\{sdt_shop\}/);
});

test.after(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});
