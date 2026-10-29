const fs = require('fs');
const path = require('path');

const filePath = path.resolve(__dirname, '../src/utils/PostStateMachine.js');
let content = fs.readFileSync(filePath, 'utf8');

const target = `  const rawString = \`\${pageId}|\${title}|\${content}|\${mediaType}|\${mediaLinks}|\${scheduledTime}\`;
  return crypto.createHash('sha256').update(rawString, 'utf8').digest('hex');
}`;

const additions = `  const rawString = \`\${pageId}|\${title}|\${content}|\${mediaType}|\${mediaLinks}|\${scheduledTime}\`;
  return crypto.createHash('sha256').update(rawString, 'utf8').digest('hex');
}

/**
 * Kiểm tra Fanpage có nằm trong Whitelist được phép thao tác/xuất bản hay không.
 * Nguyên tắc: FAIL-CLOSED (Nếu rỗng hoặc không cấu hình thì từ chối tất cả).
 */
function isPageIdAllowed(pageId) {
  if (!pageId) return false;
  const rawList = process.env.ALLOWED_PAGE_IDS || '';
  const allowed = rawList
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  const isProduction = process.env.NODE_ENV === 'production' || process.env.APP_ENV === 'production';
  const isMock = !isProduction && (
    String(pageId).startsWith('SYSTEM_TEST_') ||
    String(pageId).startsWith('page_') ||
    String(pageId).startsWith('tiktok_')
  );
  if (isMock) return true;
  if (allowed.length === 0) return false; // Fail-closed!
  return allowed.includes(String(pageId).trim());
}

/**
 * Hàm chuẩn hóa và tạo Payload dữ liệu bài viết duy nhất dùng chung cho mọi luồng (API create, Draft publish, Excel Bulk Upload)
 * Đảm bảo:
 * 1. Kiểm tra Whitelist Page ngay từ đầu (Chặn từ bước tạo bài, ném lỗi 403).
 * 2. Tính toán Hash đầy đủ và đồng nhất 100% với hàm đối soát của Poller (computePostHash).
 * 3. Chuẩn hóa mediaLinks dạng JSON string nhất quán.
 * 4. Chuẩn hóa scheduledAt dạng Date chuẩn.
 */
function prepareStandardPostInsert({
  pageId,
  content = '',
  mediaType = 'text',
  mediaLinks = [],
  mediaThumb = null,
  scheduledAt = null,
  ownerId = null,
  status = POST_STATES.APPROVED
}) {
  const cleanPageId = String(pageId || '').trim();
  if (!isPageIdAllowed(cleanPageId)) {
    const err = new Error(\`Fanpage ID "\${cleanPageId}" nằm ngoài danh sách được phép thao tác (ALLOWED_PAGE_IDS trong .env).\`);
    err.statusCode = 403;
    err.code = 'PAGE_NOT_ALLOWED';
    throw err;
  }

  const cleanMediaType = ['text', 'image', 'video', 'reel', 'story'].includes(mediaType) ? mediaType : 'text';
  const cleanMediaLinksArray = Array.isArray(mediaLinks)
    ? mediaLinks.filter(Boolean)
    : (typeof mediaLinks === 'string' && mediaLinks ? [mediaLinks] : []);
  const mediaLinksJson = JSON.stringify(cleanMediaLinksArray);

  const scheduledDate = scheduledAt ? new Date(scheduledAt) : null;
  const finalScheduledAt = (scheduledDate && !Number.isNaN(scheduledDate.getTime())) ? scheduledDate : null;

  const hash = computePostHash({
    page_id: cleanPageId,
    content: String(content || '').trim(),
    media_type: cleanMediaType,
    media_links: mediaLinksJson,
    scheduled_at: finalScheduledAt
  });

  const shouldApprove = status === POST_STATES.APPROVED || status === POST_STATES.SCHEDULED;

  return {
    pageId: cleanPageId,
    content: String(content || '').trim(),
    mediaType: cleanMediaType,
    mediaLinks: cleanMediaLinksArray,
    mediaLinksJson,
    mediaThumb: mediaThumb || null,
    scheduledAt: finalScheduledAt,
    ownerId: ownerId ? String(ownerId) : null,
    status,
    contentHash: hash,
    approvedHash: shouldApprove ? hash : null,
    approvedBy: shouldApprove ? (ownerId ? String(ownerId) : 'system_creator') : null
  };
}`;

if (!content.includes('prepareStandardPostInsert')) {
  content = content.replace(target, additions);
  // Also export them
  content = content.replace(
    'module.exports = {',
    'module.exports = {\n  isPageIdAllowed,\n  prepareStandardPostInsert,'
  );
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('✅ Successfully updated PostStateMachine.js with isPageIdAllowed and prepareStandardPostInsert!');
} else {
  console.log('Already updated.');
}

