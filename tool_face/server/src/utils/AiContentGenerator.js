/**
 * AiContentGenerator.js
 * Service tạo nhiều bài đăng Facebook từ prompt người dùng thông qua AI.
 * Hỗ trợ tạo batch nhiều bài cùng lúc, lưu nháp, chỉnh sửa, regenerate.
 */
const crypto = require('crypto');
const axios = require('axios');
const { sql, getPool } = require('../../config/db');
const { getSettings } = require('./SettingsService');
const webSearchService = require('./WebSearchService');

// ═══ SCHEMA ═══
let draftSchemaReady = null;

async function ensureDraftSchema() {
  if (!draftSchemaReady) {
    draftSchemaReady = getPool().then(async (pool) => {
      await pool.request().query(`
        IF OBJECT_ID(N'dbo.AiGeneratedDrafts', N'U') IS NULL
        BEGIN
          CREATE TABLE dbo.AiGeneratedDrafts (
            id INT IDENTITY(1,1) PRIMARY KEY,
            user_id VARCHAR(64) NOT NULL,
            batch_id VARCHAR(64) NOT NULL,
            title NVARCHAR(255) NOT NULL DEFAULT N'',
            content NVARCHAR(MAX) NOT NULL,
            hashtags NVARCHAR(MAX) NOT NULL DEFAULT '[]',
            suggested_time VARCHAR(10) NOT NULL DEFAULT '',
            topic NVARCHAR(255) NOT NULL DEFAULT N'',
            tone NVARCHAR(100) NOT NULL DEFAULT N'',
            status VARCHAR(20) NOT NULL DEFAULT 'draft',
            selected_page_ids NVARCHAR(MAX) NOT NULL DEFAULT '[]',
            scheduled_at DATETIME2 NULL,
            original_prompt NVARCHAR(MAX) NOT NULL DEFAULT N'',
            created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
            updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
          );
          CREATE INDEX IX_AiDrafts_user_batch ON dbo.AiGeneratedDrafts (user_id, batch_id);
          CREATE INDEX IX_AiDrafts_user_status ON dbo.AiGeneratedDrafts (user_id, status);
        END;
        ELSE
        BEGIN
          IF COL_LENGTH(N'dbo.AiGeneratedDrafts', N'media_type') IS NULL
            ALTER TABLE dbo.AiGeneratedDrafts ADD media_type VARCHAR(20) NOT NULL CONSTRAINT DF_AiDrafts_media_type DEFAULT 'text';
          IF COL_LENGTH(N'dbo.AiGeneratedDrafts', N'media_links') IS NULL
            ALTER TABLE dbo.AiGeneratedDrafts ADD media_links NVARCHAR(MAX) NOT NULL CONSTRAINT DF_AiDrafts_media_links DEFAULT '[]';
        END;
      `);
    });
  }
  return draftSchemaReady;
}

function generateBatchId() {
  return 'batch_' + Date.now().toString(36) + '_' + crypto.randomBytes(4).toString('hex');
}

// ═══ AI CONFIG HELPER ═══
async function getAiConfig() {
  const settings = await getSettings().catch(() => ({}));
  let apiKey = settings.ai_api_key || process.env.AI_API_KEY;
  let model = settings.ai_model || process.env.AI_MODEL || 'gpt-4o-mini';
  let baseUrl = (settings.ai_base_url || process.env.AI_API_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');

  // Auto-detect Groq
  if (apiKey?.startsWith('gsk_')) {
    if (baseUrl.includes('api.openai.com')) {
      baseUrl = 'https://api.groq.com/openai/v1';
    }
    if (model === 'llama-3.3-70b-versatile' || model === 'gpt-4o-mini') {
      model = 'openai/gpt-oss-120b';
    }
  }

  return { apiKey, model, baseUrl };
}

// ═══ GENERATE POSTS ═══
async function generatePosts(userId, { prompt, tone = '', includeHashtags = true, includeEmoji = true, enableWebSearch = true, eventDetails = '' }) {
  const { apiKey, model, baseUrl } = await getAiConfig();
  if (!apiKey) throw new Error('AI chưa được cấu hình. Hãy vào Cài đặt để thêm AI API Key.');
  if (!prompt?.trim()) throw new Error('Vui lòng nhập yêu cầu tạo bài.');

  let newsContext = '';
  if (eventDetails && eventDetails.trim()) {
    newsContext = `\n\n📌 THÔNG TIN SỰ KIỆN DO NGƯỜI DÙNG CUNG CẤP:\n${eventDetails.trim()}\n(BẮT BUỘC BÁM SÁT THÔNG TIN NÀY)\n`;
  } else if (enableWebSearch !== false && webSearchService.shouldSearchNews(prompt)) {
    try {
      newsContext = await webSearchService.getNewsContext(prompt, 5);
      if (newsContext) {
        console.log('[AiContentGenerator] Đã tra cứu tin tức thời sự nạp vào AI prompt thành công.');
      }
    } catch (searchErr) {
      console.warn('[AiContentGenerator WebSearch Warning]', searchErr.message);
    }
  }

  const systemPrompt = `Bạn là chuyên gia viết content Facebook chuyên nghiệp. Nhiệm vụ: tạo các bài đăng Facebook theo yêu cầu của người dùng.

QUY TẮC BẮT BUỘC:
1. Phân tích yêu cầu của người dùng để xác định CÓ BAO NHIÊU bài cần tạo và CHỦ ĐỀ gì.
2. Nếu người dùng yêu cầu "2 bài", tạo đúng 2 bài. "5 bài" thì tạo 5. Nếu không nói cụ thể, mặc định tạo 3 bài.
3. Mỗi bài phải CÓ NỘI DUNG KHÁC NHAU, không được giống nhau.
4. ${includeEmoji ? 'SỬ DỤNG emoji phù hợp trong nội dung.' : 'KHÔNG sử dụng emoji.'}
5. ${includeHashtags ? 'THÊM hashtag liên quan vào mảng hashtags.' : 'KHÔNG thêm hashtag.'}
6. ${tone ? `Giọng văn: ${tone}.` : 'Giọng văn tự nhiên, thu hút.'}
7. Nội dung bài phải ĐẦY ĐỦ, SẴN SÀNG ĐĂNG ĐƯỢC NGAY, không dùng placeholder [...].
8. CHỐNG BỊA ĐẶT (ANTI-HALLUCINATION): Khi viết về nhân vật có thật, sự kiện thời sự hay tin tức, TUYỆT ĐỐI KHÔNG tự bịa đặt các chi tiết sai thực tế (như tỷ số, bàn thắng, sự việc chưa từng xảy ra). Bắt buộc bám sát các dữ kiện báo chí hoặc sự kiện người dùng cung cấp. Nếu không có dữ kiện chi tiết, hãy tập trung vào bình luận cảm xúc, tri ân và hành trình.

PHẢI trả về JSON duy nhất theo ĐÚNG format sau (KHÔNG có text nào khác ngoài JSON):
{
  "posts": [
    {
      "title": "Tiêu đề ngắn gọn (dưới 50 ký tự)",
      "content": "Nội dung đầy đủ của bài đăng...",
      "hashtags": ["#hashtag1", "#hashtag2"],
      "suggestedTime": "09:00",
      "topic": "Chủ đề của bài"
    }
  ]
}`;

  const userPromptWithContext = newsContext ? `${prompt.trim()}\n${newsContext}` : prompt.trim();

  const response = await axios.post(`${baseUrl}/chat/completions`, {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPromptWithContext }
    ],
    temperature: 0.8,
    max_tokens: 4096
  }, {
    headers: { Authorization: `Bearer ${apiKey}` },
    timeout: 120000
  });

  const rawReply = response.data.choices?.[0]?.message?.content;
  if (!rawReply) throw new Error('AI không trả về kết quả. Vui lòng thử lại.');

  // Parse JSON from AI response (handle markdown code blocks)
  let parsed;
  try {
    let jsonStr = rawReply.trim();
    // Remove markdown code fence if present
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim();
    }
    parsed = JSON.parse(jsonStr);
  } catch (parseErr) {
    console.error('[AiContentGenerator] Failed to parse AI JSON:', rawReply.slice(0, 500));
    throw new Error('AI trả về format không hợp lệ. Vui lòng thử lại.');
  }

  if (!parsed.posts || !Array.isArray(parsed.posts) || parsed.posts.length === 0) {
    throw new Error('AI không tạo được bài viết nào. Vui lòng mô tả rõ hơn yêu cầu.');
  }

  // Save drafts to DB
  await ensureDraftSchema();
  const pool = await getPool();
  const batchId = generateBatchId();
  const savedDrafts = [];

  for (const post of parsed.posts) {
    const result = await pool.request()
      .input('user_id', sql.VarChar(64), String(userId))
      .input('batch_id', sql.VarChar(64), batchId)
      .input('title', sql.NVarChar(255), String(post.title || '').slice(0, 255))
      .input('content', sql.NVarChar(sql.MAX), String(post.content || ''))
      .input('hashtags', sql.NVarChar(sql.MAX), JSON.stringify(Array.isArray(post.hashtags) ? post.hashtags : []))
      .input('suggested_time', sql.VarChar(10), String(post.suggestedTime || '').slice(0, 10))
      .input('topic', sql.NVarChar(255), String(post.topic || '').slice(0, 255))
      .input('tone', sql.NVarChar(100), String(tone).slice(0, 100))
      .input('original_prompt', sql.NVarChar(sql.MAX), prompt.trim())
      .query(`
        INSERT INTO dbo.AiGeneratedDrafts (user_id, batch_id, title, content, hashtags, suggested_time, topic, tone, original_prompt)
        OUTPUT INSERTED.*
        VALUES (@user_id, @batch_id, @title, @content, @hashtags, @suggested_time, @topic, @tone, @original_prompt);
      `);
    savedDrafts.push(formatDraft(result.recordset[0]));
  }

  return { batchId, drafts: savedDrafts, count: savedDrafts.length };
}

// ═══ REGENERATE SINGLE DRAFT ═══
async function regenerateDraft(userId, draftId) {
  await ensureDraftSchema();
  const pool = await getPool();

  const existing = await pool.request()
    .input('id', sql.Int, draftId)
    .input('user_id', sql.VarChar(64), String(userId))
    .query('SELECT * FROM dbo.AiGeneratedDrafts WHERE id = @id AND user_id = @user_id');

  if (!existing.recordset.length) throw new Error('Bài nháp không tồn tại.');
  const draft = existing.recordset[0];

  const { apiKey, model, baseUrl } = await getAiConfig();
  if (!apiKey) throw new Error('AI chưa được cấu hình.');

  const regenPrompt = `Viết lại bài đăng Facebook với chủ đề: "${draft.topic}". 
Nội dung cũ (cần viết lại hoàn toàn mới, KHÁC nội dung cũ): ${draft.content.slice(0, 500)}

Trả về JSON duy nhất:
{
  "title": "Tiêu đề mới",
  "content": "Nội dung mới hoàn toàn...",
  "hashtags": ["#tag1"],
  "suggestedTime": "09:00",
  "topic": "${draft.topic}"
}`;

  const response = await axios.post(`${baseUrl}/chat/completions`, {
    model,
    messages: [
      { role: 'system', content: 'Bạn là chuyên gia viết content Facebook. Trả về JSON duy nhất, không có text nào khác.' },
      { role: 'user', content: regenPrompt }
    ],
    temperature: 0.9,
    max_tokens: 2048
  }, {
    headers: { Authorization: `Bearer ${apiKey}` },
    timeout: 60000
  });

  const rawReply = response.data.choices?.[0]?.message?.content;
  let parsed;
  try {
    let jsonStr = rawReply.trim();
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) jsonStr = codeBlockMatch[1].trim();
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error('AI trả về format không hợp lệ khi tạo lại bài.');
  }

  const updated = await pool.request()
    .input('id', sql.Int, draftId)
    .input('user_id', sql.VarChar(64), String(userId))
    .input('title', sql.NVarChar(255), String(parsed.title || draft.topic).slice(0, 255))
    .input('content', sql.NVarChar(sql.MAX), String(parsed.content || ''))
    .input('hashtags', sql.NVarChar(sql.MAX), JSON.stringify(Array.isArray(parsed.hashtags) ? parsed.hashtags : []))
    .input('suggested_time', sql.VarChar(10), String(parsed.suggestedTime || '').slice(0, 10))
    .query(`
      UPDATE dbo.AiGeneratedDrafts
      SET title = @title, content = @content, hashtags = @hashtags, suggested_time = @suggested_time, updated_at = SYSUTCDATETIME()
      WHERE id = @id AND user_id = @user_id;
      SELECT * FROM dbo.AiGeneratedDrafts WHERE id = @id;
    `);

  return formatDraft(updated.recordset[0]);
}

// ═══ CRUD DRAFTS ═══
async function getDrafts(userId, status = 'draft') {
  await ensureDraftSchema();
  const pool = await getPool();
  const result = await pool.request()
    .input('user_id', sql.VarChar(64), String(userId))
    .input('status', sql.VarChar(20), status)
    .query(`
      SELECT * FROM dbo.AiGeneratedDrafts
      WHERE user_id = @user_id AND status = @status
      ORDER BY created_at DESC
    `);
  return result.recordset.map(formatDraft);
}

async function getDraftsByBatch(userId, batchId) {
  await ensureDraftSchema();
  const pool = await getPool();
  const result = await pool.request()
    .input('user_id', sql.VarChar(64), String(userId))
    .input('batch_id', sql.VarChar(64), batchId)
    .query(`
      SELECT * FROM dbo.AiGeneratedDrafts
      WHERE user_id = @user_id AND batch_id = @batch_id
      ORDER BY id ASC
    `);
  return result.recordset.map(formatDraft);
}

async function updateDraft(userId, draftId, updates) {
  await ensureDraftSchema();
  const pool = await getPool();
  const fields = [];
  const req = pool.request()
    .input('id', sql.Int, draftId)
    .input('user_id', sql.VarChar(64), String(userId));

  if (updates.title !== undefined) {
    fields.push('title = @title');
    req.input('title', sql.NVarChar(255), String(updates.title).slice(0, 255));
  }
  if (updates.content !== undefined) {
    fields.push('content = @content');
    req.input('content', sql.NVarChar(sql.MAX), String(updates.content));
  }
  if (updates.hashtags !== undefined) {
    fields.push('hashtags = @hashtags');
    req.input('hashtags', sql.NVarChar(sql.MAX), JSON.stringify(Array.isArray(updates.hashtags) ? updates.hashtags : []));
  }
  if (updates.selected_page_ids !== undefined) {
    fields.push('selected_page_ids = @page_ids');
    req.input('page_ids', sql.NVarChar(sql.MAX), JSON.stringify(Array.isArray(updates.selected_page_ids) ? updates.selected_page_ids : []));
  }
  if (updates.scheduled_at !== undefined) {
    fields.push('scheduled_at = @scheduled_at');
    req.input('scheduled_at', sql.DateTime2, updates.scheduled_at ? new Date(updates.scheduled_at) : null);
  }
  if (updates.status !== undefined) {
    fields.push('status = @status');
    req.input('status', sql.VarChar(20), String(updates.status));
  }
  if (updates.media_type !== undefined) {
    fields.push('media_type = @media_type');
    req.input('media_type', sql.VarChar(20), String(updates.media_type));
  }
  if (updates.media_links !== undefined) {
    fields.push('media_links = @media_links');
    req.input('media_links', sql.NVarChar(sql.MAX), JSON.stringify(Array.isArray(updates.media_links) ? updates.media_links : []));
  }

  if (fields.length === 0) throw new Error('Không có trường nào cần cập nhật.');
  fields.push('updated_at = SYSUTCDATETIME()');

  await req.query(`
    UPDATE dbo.AiGeneratedDrafts SET ${fields.join(', ')}
    WHERE id = @id AND user_id = @user_id
  `);

  const result = await pool.request()
    .input('id', sql.Int, draftId)
    .input('user_id', sql.VarChar(64), String(userId))
    .query('SELECT * FROM dbo.AiGeneratedDrafts WHERE id = @id AND user_id = @user_id');

  return result.recordset.length ? formatDraft(result.recordset[0]) : null;
}

async function deleteDraft(userId, draftId) {
  await ensureDraftSchema();
  const pool = await getPool();
  const result = await pool.request()
    .input('id', sql.Int, draftId)
    .input('user_id', sql.VarChar(64), String(userId))
    .query('DELETE FROM dbo.AiGeneratedDrafts WHERE id = @id AND user_id = @user_id');
  return result.rowsAffected[0] > 0;
}

async function deleteBatch(userId, batchId) {
  await ensureDraftSchema();
  const pool = await getPool();
  const result = await pool.request()
    .input('user_id', sql.VarChar(64), String(userId))
    .input('batch_id', sql.VarChar(64), batchId)
    .query("DELETE FROM dbo.AiGeneratedDrafts WHERE user_id = @user_id AND batch_id = @batch_id AND status = 'draft'");
  return result.rowsAffected[0];
}

// ═══ HELPERS ═══
function formatDraft(row) {
  if (!row) return null;
  let hashtags = [];
  let selectedPageIds = [];
  let mediaLinks = [];
  try { hashtags = JSON.parse(row.hashtags || '[]'); } catch { hashtags = []; }
  try { selectedPageIds = JSON.parse(row.selected_page_ids || '[]'); } catch { selectedPageIds = []; }
  try { mediaLinks = JSON.parse(row.media_links || '[]'); } catch { mediaLinks = []; }
  return {
    id: row.id,
    batch_id: row.batch_id,
    title: row.title,
    content: row.content,
    hashtags,
    suggested_time: row.suggested_time,
    topic: row.topic,
    tone: row.tone,
    status: row.status,
    media_type: row.media_type || 'text',
    media_links: mediaLinks,
    selected_page_ids: selectedPageIds,
    scheduled_at: row.scheduled_at,
    original_prompt: row.original_prompt,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

// ═══ GENERATE SEEDING COMMENTS ═══
async function generateSeedingComments({ postContent, count = 3, tone = 'tự nhiên, thân thiện' }) {
  if (!postContent || !postContent.trim()) {
    throw new Error('Cần có nội dung bài đăng để AI sinh comment mồi phù hợp.');
  }

  const { apiKey, model, baseUrl } = await getAiConfig();
  if (!apiKey) throw new Error('AI chưa được cấu hình. Hãy vào Cài đặt để thêm AI API Key.');

  const targetCount = Math.min(5, Math.max(1, count || 3));
  const systemPrompt = `Bạn là chuyên gia marketing Facebook chuyên viết comment seeding (bình luận mồi) để kích thích thuật toán Facebook đẩy bài viết lên Feed và tăng tương tác.

Nhiệm vụ: Viết đúng ${targetCount} comment seeding cực kỳ tự nhiên dựa trên nội dung bài viết.
Các dạng comment cần có:
1. Comment kêu gọi hành động / Thông tin (Admin Fanpage chia sẻ Hotline, Zalo, link tư vấn hoặc nhắc inbox).
2. Comment người dùng hỏi han (Khách hỏi về giá, chất lượng, cách mua hàng, địa chỉ shop).
3. Comment feedback mồi / Tạo hiệu ứng đám đông (Khen ngợi, chấm hóng, xin thêm thông tin).

QUY TẮC BẮT BUỘC:
- Dùng tiếng Việt tự nhiên, phù hợp với người dùng mạng xã hội, có emoji thích hợp.
- Gợi ý số phút delay hợp lý (ví dụ: comment 1 delay 0 phút, comment 2 delay 2 phút, comment 3 delay 5 phút).
- KHÔNG dùng markdown hay chữ thừa nào khác ngoài JSON.

PHẢI trả về JSON duy nhất theo ĐÚNG định dạng:
{
  "comments": [
    {
      "content": "Nội dung comment seeding...",
      "delayMinutes": 0,
      "type": "cta | question | feedback"
    }
  ]
}`;

  const response = await axios.post(`${baseUrl}/chat/completions`, {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Nội dung bài viết Facebook:\n"""\n${postContent.trim().slice(0, 3000)}\n"""` }
    ],
    temperature: 0.8,
    max_tokens: 1024
  }, {
    headers: { Authorization: `Bearer ${apiKey}` },
    timeout: 60000
  });

  const rawReply = response.data.choices?.[0]?.message?.content;
  if (!rawReply) throw new Error('AI không trả về kết quả comment seeding.');

  let parsed;
  try {
    let jsonStr = rawReply.trim();
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) jsonStr = codeBlockMatch[1].trim();
    parsed = JSON.parse(jsonStr);
  } catch (parseErr) {
    console.error('[AiContentGenerator] Parse seeding comments error:', rawReply.slice(0, 300));
    throw new Error('AI trả về định dạng comment không hợp lệ.');
  }

  const rawComments = Array.isArray(parsed?.comments) ? parsed.comments : [];
  if (rawComments.length === 0) {
    throw new Error('AI không sinh được comment seeding nào.');
  }

  return rawComments.slice(0, 5).map((c, i) => ({
    content: String(c.content || '').trim(),
    delayMinutes: Number.isInteger(c.delayMinutes) ? Math.max(0, c.delayMinutes) : (i * 2),
    type: c.type || 'seeding'
  })).filter(c => c.content.length > 0);
}

module.exports = {
  generatePosts,
  regenerateDraft,
  getDrafts,
  getDraftsByBatch,
  updateDraft,
  deleteDraft,
  deleteBatch,
  generateSeedingComments
};

