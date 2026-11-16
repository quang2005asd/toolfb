const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'comment-ai-template-mode-'));
process.env.USE_SQLITE = 'true';
process.env.APP_DATA_DIR = dataDir;
const { generateReply, previewReply, validateGuidedFacts, listSuggestions, runSuggestions } = require('../src/utils/CommentAiService');
const core = require('../src/utils/CommentAiCore');

test('Tiêu chí 1: Mẫu exact có từ khóa "giá": bình luận "giá bao nhiêu" -> reply trùng từng ký tự với mẫu (đã điền biến), không gọi AI', async () => {
  const result = await generateReply(
    'giá bao nhiêu',
    {
      aiEnabled: true,
      vars: { sdt_shop: '0987654321', ten_page: 'Shop Quần Áo' }
    },
    [
      { id: 10, name: 'Báo giá', keywords: 'giá, bao nhiêu', content: 'Dạ giá áo là 199k ạ, liên hệ {sdt_shop}', mode: 'exact' }
    ],
    'Tuấn'
  );

  assert.equal(result.reply, 'Dạ giá áo là 199k ạ, liên hệ 0987654321');
  assert.deepEqual(result.template, { id: 10, name: 'Báo giá' });
  assert.equal(result.skip, undefined);
});

test('Tiêu chí 2: Có 1 mẫu không từ khóa: bình luận không khớp vẫn đi nhánh AI, không bị mẫu đó chặn', async () => {
  // Khi không có từ khóa khớp, mẫu không từ khóa không được chọn ngẫu nhiên
  const result = await generateReply(
    'Sản phẩm này chất liệu gì vậy shop?',
    {
      aiEnabled: false, // tắt AI để xem có bị mẫu không từ khóa chặn không
      onlyTemplates: false,
      vars: {}
    },
    [
      { id: 99, name: 'Mẫu chung không từ khóa', keywords: '', content: 'Nội dung chung', mode: 'exact' }
    ],
    'Khách'
  );

  // Không bị mẫu 99 chọn chặn -> vì AI tắt nên skip với lý do tắt trả lời
  assert.equal(result.template, undefined);
  assert.equal(result.skip, true);
  assert.equal(result.reason, 'Tự động trả lời bình luận của Fanpage này đang tắt');
});

test('Tiêu chí 5: Mẫu exact có {sdt_shop} bỏ trống ở cả mẫu lẫn Page: không bị skip im lặng, chuyển sang AI tự trả lời', async () => {
  let aiCalled = false;
  // Mock callAi tạm thời
  const originalCallAi = core.callAi;
  core.callAi = async () => {
    aiCalled = true;
    return JSON.stringify({ sentiment: 'purchase', template_id: null, reply: 'Dạ shop xin chào bạn, shop sẽ tư vấn ngay ạ!' });
  };

  try {
    const result = await generateReply(
      'giá bao nhiêu',
      {
        aiEnabled: true,
        vars: {} // không có sdt_shop
      },
      [
        { id: 12, name: 'Mẫu thiếu biến', keywords: 'giá, bao nhiêu', content: 'Gọi {sdt_shop}', mode: 'exact', vars: null }
      ],
      'Tuấn'
    );

    assert.equal(aiCalled, true);
    assert.equal(result.reply, 'Dạ shop xin chào bạn, shop sẽ tư vấn ngay ạ!');
    assert.equal(result.template, null);
    assert.match(result.note, /Mẫu "Mẫu thiếu biến" thiếu biến \{sdt_shop\}, chuyển sang AI tự trả lời/);
  } finally {
    core.callAi = originalCallAi;
  }
});

test('Tiêu chí 5 (guided): Mẫu guided có biến thiếu: biến của mẫu -> biến của Page làm dự phòng, không đè ten_page khi đã nhập', () => {
  const resolved = core.resolveTemplateVars(
    { sdt_shop: '0123456789', ten_page: 'Tên Từ Mẫu' },
    { sdt_shop: '0999999999', dia_chi_shop: 'Hà Nội', ten_page: 'Tên Từ Page' },
    'Tên Fanpage Mặc Định'
  );

  assert.equal(resolved.sdt_shop, '0123456789'); // ưu tiên biến của mẫu
  assert.equal(resolved.dia_chi_shop, 'Hà Nội'); // dự phòng từ page
  assert.equal(resolved.ten_page, 'Tên Từ Mẫu'); // không đè ten_page người dùng đã nhập
});

test('Tiêu chí validate guided facts: thiếu số điện thoại, giá hoặc link sẽ bị từ chối và fallback nguyên văn', () => {
  const originalTemplate = 'Giá 150k, gọi 0901234567 hoặc vào https://shop.vn nhé!';
  
  // AI giữ đủ facts
  const goodAiReply = 'Chào bạn, giá 150k bạn nhé. Bạn có thể gọi 0901234567 hoặc xem tại https://shop.vn';
  assert.equal(validateGuidedFacts(originalTemplate, goodAiReply), true);

  // AI làm mất số điện thoại
  const badAiReplyNoPhone = 'Chào bạn, giá 150k nhé, xem tại https://shop.vn';
  assert.equal(validateGuidedFacts(originalTemplate, badAiReplyNoPhone), false);

  // AI làm mất giá
  const badAiReplyNoPrice = 'Chào bạn, liên hệ 0901234567 hoặc https://shop.vn nhé';
  assert.equal(validateGuidedFacts(originalTemplate, badAiReplyNoPrice), false);

  // AI làm mất link
  const badAiReplyNoLink = 'Chào bạn, giá 150k, gọi 0901234567';
  assert.equal(validateGuidedFacts(originalTemplate, badAiReplyNoLink), false);
});

test('Tiêu chí 3: Bình luận ".", "👍", "1", "ib", spam đều được trả lời qua AI, không bị skip too_short hay spam', async () => {
  const shortInputs = ['.', '👍', '1', 'ib', 'quảng cáo vay tiền nhanh'];
  const originalCallAi = core.callAi;
  core.callAi = async (messages) => {
    // Giả lập AI trả về sentiment spam hoặc neutral kèm reply
    return JSON.stringify({ sentiment: 'spam', template_id: null, reply: 'Chào bạn, shop có thể giúp gì cho bạn ạ?' });
  };

  try {
    for (const text of shortInputs) {
      const result = await generateReply(text, { aiEnabled: true, vars: {} }, [], 'Khách');
      assert.equal(result.skip, undefined, `Bình luận "${text}" không được bị skip`);
      assert.equal(result.reply, 'Chào bạn, shop có thể giúp gì cho bạn ạ?');
    }
  } finally {
    core.callAi = originalCallAi;
  }
});

test('Tiêu chí 4: AI chọn mẫu exact ở bước (b) -> code ghi đè reply = nội dung mẫu, bất kể AI trả gì', async () => {
  const originalCallAi = core.callAi;
  core.callAi = async () => {
    // AI trả về một câu bịa khác hẳn mẫu
    return JSON.stringify({ sentiment: 'purchase', template_id: 88, reply: 'Câu trả lời tự bịa của AI không giống mẫu' });
  };

  try {
    const result = await generateReply(
      'có ship hỏa tốc không shop?', // không khớp từ khóa "ship"
      { aiEnabled: true, vars: {} },
      [
        { id: 88, name: 'Mẫu Ship Hỏa Tốc', keywords: 'hỏa tốc', content: 'Shop có hỗ trợ ship hỏa tốc trong 2h nhé {ten}.', mode: 'exact' }
      ],
      'Linh'
    );

    assert.equal(result.template?.id, 88);
    // Bắt buộc trùng từng ký tự với mẫu đã điền biến, đè câu bịa của AI
    assert.equal(result.reply, 'Shop có hỗ trợ ship hỏa tốc trong 2h nhé Linh.');
  } finally {
    core.callAi = originalCallAi;
  }
});

test('Thống nhất tách từ khóa: dấu phẩy, chấm phẩy, xuống dòng đều nhận diện tốt', async () => {
  const result = await generateReply(
    'tư vấn giúp mình',
    { aiEnabled: true, vars: {} },
    [
      { id: 77, name: 'Tư vấn', keywords: 'báo giá, giá bao nhiêu;\ntư vấn\n;hỗ trợ', content: 'Dạ shop tư vấn cho {ten} ngay ạ!', mode: 'exact' }
    ],
    'Hương'
  );

  assert.equal(result.reply, 'Dạ shop tư vấn cho Hương ngay ạ!');
  assert.equal(result.template?.id, 77);
});

test.after(() => {
  try {
    fs.rmSync(dataDir, { recursive: true, force: true });
  } catch {}
});
