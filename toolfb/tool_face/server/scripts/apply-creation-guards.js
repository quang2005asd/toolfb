const fs = require('fs');
const path = require('path');

const filePath = path.resolve(__dirname, '../src/app.js');
let code = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');

// 1. In POST /api/drafts/publish
const target1 = `      for (const pageId of targetPageIds) {
        try {
          const postHash = computePostHash({
            page_id: pageId,
            content: finalContent,
            media_type: finalMediaType,
            media_links: JSON.stringify(finalMediaLinks),
            scheduled_at: schedule
          });
          const initialStatus = POST_STATES.APPROVED;
          const result = await pool.request()
            .input('pageId_' + pageId, sql.VarChar, pageId)
            .input('ownerId_' + pageId, sql.VarChar(64), req.user.sub)
            .input('content_' + pageId, sql.NVarChar, finalContent)
            .input('mediaType_' + pageId, sql.VarChar, finalMediaType)
            .input('mediaLinks_' + pageId, sql.NVarChar, JSON.stringify(finalMediaLinks))
            .input('scheduledAt_' + pageId, sql.DateTime2, schedule)
            .input('status_' + pageId, sql.VarChar, initialStatus)
            .input('hash_' + pageId, sql.VarChar(64), postHash)
            .query(\`INSERT INTO Posts (page_id, content, media_type, media_links, scheduled_at, status, created_by_user_id, content_hash, approved_hash, approved_by) OUTPUT INSERTED.id VALUES (@pageId_\${pageId}, @content_\${pageId}, @mediaType_\${pageId}, @mediaLinks_\${pageId}, @scheduledAt_\${pageId}, @status_\${pageId}, @ownerId_\${pageId}, @hash_\${pageId}, @hash_\${pageId}, @ownerId_\${pageId});\`);`;

const rep1 = `      for (const pageId of targetPageIds) {
        try {
          if (!isPageIdAllowed(pageId)) {
            results.push({ draftId, success: false, message: \`Fanpage ID "\${pageId}" không thuộc danh sách được phép đăng (ALLOWED_PAGE_IDS trong .env).\` });
            continue;
          }
          const postRecord = prepareStandardPostInsert({
            pageId,
            content: finalContent,
            mediaType: finalMediaType,
            mediaLinks: finalMediaLinks,
            scheduledAt: schedule,
            ownerId: req.user.sub,
            status: POST_STATES.APPROVED
          });
          const result = await pool.request()
            .input('pageId_' + pageId, sql.VarChar, postRecord.pageId)
            .input('ownerId_' + pageId, sql.VarChar(64), postRecord.ownerId)
            .input('content_' + pageId, sql.NVarChar, postRecord.content)
            .input('mediaType_' + pageId, sql.VarChar, postRecord.mediaType)
            .input('mediaLinks_' + pageId, sql.NVarChar, postRecord.mediaLinksJson)
            .input('scheduledAt_' + pageId, sql.DateTime2, postRecord.scheduledAt)
            .input('status_' + pageId, sql.VarChar, postRecord.status)
            .input('hash_' + pageId, sql.VarChar(64), postRecord.contentHash)
            .query(\`INSERT INTO Posts (page_id, content, media_type, media_links, scheduled_at, status, created_by_user_id, content_hash, approved_hash, approved_by) OUTPUT INSERTED.id VALUES (@pageId_\${pageId}, @content_\${pageId}, @mediaType_\${pageId}, @mediaLinks_\${pageId}, @scheduledAt_\${pageId}, @status_\${pageId}, @ownerId_\${pageId}, @hash_\${pageId}, @hash_\${pageId}, @ownerId_\${pageId});\`);`;

if (!code.includes(target1)) {
  console.error('Target 1 not found!');
  process.exit(1);
}
code = code.replace(target1, rep1);
console.log('✅ Target 1 replaced');

// 2. In POST /api/posts
const target2 = `    console.log('[POST /api/posts] Bước 2: kiểm tra quyền sở hữu page...');
    const authorizedPageIds = [];
    for (const pageId of targetPageIds) {
      if (await userOwnsPage(req.user.sub, pageId)) {
        authorizedPageIds.push(pageId);
      }
    }
    if (authorizedPageIds.length === 0) {
      return res.status(403).json({ success: false, message: 'Các Fanpage đã chọn chưa được kết nối với tài khoản Facebook của bạn.' });
    }

    console.log('[POST /api/posts] Bước 3: INSERT vào DB cho', authorizedPageIds.length, 'page...');
    const pool = await getPool();
    const createdPosts = [];

    for (const pageId of authorizedPageIds) {
      const transaction = new sql.Transaction(pool);
      await transaction.begin();
      let postId;
      try {
        const postHash = computePostHash({
          page_id: pageId,
          content,
          media_type: mediaType,
          media_links: JSON.stringify(mediaLinks),
          scheduled_at: scheduledAt
        });
        const initialStatus = POST_STATES.APPROVED;
        const result = await new sql.Request(transaction)
          .input('pageId', sql.VarChar, pageId)
          .input('ownerId', sql.VarChar(64), req.user.sub)
          .input('content', sql.NVarChar, content)
          .input('mediaType', sql.VarChar, mediaType)
          .input('mediaLinks', sql.NVarChar, JSON.stringify(mediaLinks))
          .input('scheduledAt', sql.DateTime2, scheduledAt)
          .input('status', sql.VarChar, initialStatus)
          .input('hash', sql.VarChar(64), postHash)
          .query('INSERT INTO Posts (page_id, content, media_type, media_links, scheduled_at, status, created_by_user_id, content_hash, approved_hash, approved_by) OUTPUT INSERTED.id VALUES (@pageId, @content, @mediaType, @mediaLinks, @scheduledAt, @status, @ownerId, @hash, @hash, @ownerId);');`;

const rep2 = `    console.log('[POST /api/posts] Bước 2: kiểm tra quyền sở hữu page và Whitelist...');
    for (const pageId of targetPageIds) {
      if (!isPageIdAllowed(pageId)) {
        return res.status(403).json({
          success: false,
          code: 'PAGE_NOT_ALLOWED',
          message: \`Fanpage ID "\${pageId}" nằm ngoài danh sách được phép đăng (ALLOWED_PAGE_IDS trong .env).\`
        });
      }
    }

    const authorizedPageIds = [];
    for (const pageId of targetPageIds) {
      if (await userOwnsPage(req.user.sub, pageId)) {
        authorizedPageIds.push(pageId);
      }
    }
    if (authorizedPageIds.length === 0) {
      return res.status(403).json({ success: false, message: 'Các Fanpage đã chọn chưa được kết nối với tài khoản Facebook của bạn.' });
    }

    console.log('[POST /api/posts] Bước 3: INSERT vào DB cho', authorizedPageIds.length, 'page...');
    const pool = await getPool();
    const createdPosts = [];

    for (const pageId of authorizedPageIds) {
      const transaction = new sql.Transaction(pool);
      await transaction.begin();
      let postId;
      try {
        const postRecord = prepareStandardPostInsert({
          pageId,
          content,
          mediaType,
          mediaLinks,
          scheduledAt,
          ownerId: req.user.sub,
          status: POST_STATES.APPROVED
        });
        const result = await new sql.Request(transaction)
          .input('pageId', sql.VarChar, postRecord.pageId)
          .input('ownerId', sql.VarChar(64), postRecord.ownerId)
          .input('content', sql.NVarChar, postRecord.content)
          .input('mediaType', sql.VarChar, postRecord.mediaType)
          .input('mediaLinks', sql.NVarChar, postRecord.mediaLinksJson)
          .input('scheduledAt', sql.DateTime2, postRecord.scheduledAt)
          .input('status', sql.VarChar, postRecord.status)
          .input('hash', sql.VarChar(64), postRecord.contentHash)
          .query('INSERT INTO Posts (page_id, content, media_type, media_links, scheduled_at, status, created_by_user_id, content_hash, approved_hash, approved_by) OUTPUT INSERTED.id VALUES (@pageId, @content, @mediaType, @mediaLinks, @scheduledAt, @status, @ownerId, @hash, @hash, @ownerId);');`;

if (!code.includes(target2)) {
  console.error('Target 2 not found!');
  process.exit(1);
}
code = code.replace(target2, rep2);
console.log('✅ Target 2 replaced');

// 3. In POST /api/posts/bulk-upload
const target3 = `        const pageId = String(post.pageId || defaultPageId || '');
        if (!connectedPageIds.has(pageId)) throw new Error('Page trong dòng Excel chưa được kết nối với Facebook account này.');
        const inserted = await new sql.Request(transaction)
          .input('pageId', sql.VarChar, pageId)
          .input('ownerId', sql.VarChar(64), req.user.sub)
          .input('content', sql.NVarChar, post.content)
          .input('mediaType', sql.VarChar, post.mediaType)
          .input('mediaLinks', sql.NVarChar, JSON.stringify(post.mediaLinks))
          .input('mediaThumb', sql.VarChar, post.mediaThumb)
          .input('scheduledAt', sql.DateTime2, post.scheduledAt)
          .input('status', sql.VarChar, 'pending')
          .query('INSERT INTO Posts (page_id,content,media_type,media_links,media_thumb,scheduled_at,status,created_by_user_id) OUTPUT INSERTED.id VALUES (@pageId,@content,@mediaType,@mediaLinks,@mediaThumb,@scheduledAt,@status,@ownerId);');`;

const rep3 = `        const pageId = String(post.pageId || defaultPageId || '');
        if (!connectedPageIds.has(pageId)) throw new Error('Page trong dòng Excel chưa được kết nối với Facebook account này.');
        if (!isPageIdAllowed(pageId)) throw new Error(\`Fanpage ID "\${pageId}" trong file Excel nằm ngoài danh sách được phép đăng (ALLOWED_PAGE_IDS trong .env).\`);
        const postRecord = prepareStandardPostInsert({
          pageId,
          content: post.content,
          mediaType: post.mediaType,
          mediaLinks: post.mediaLinks,
          mediaThumb: post.mediaThumb,
          scheduledAt: post.scheduledAt,
          ownerId: req.user.sub,
          status: POST_STATES.APPROVED
        });
        const inserted = await new sql.Request(transaction)
          .input('pageId', sql.VarChar, postRecord.pageId)
          .input('ownerId', sql.VarChar(64), postRecord.ownerId)
          .input('content', sql.NVarChar, postRecord.content)
          .input('mediaType', sql.VarChar, postRecord.mediaType)
          .input('mediaLinks', sql.NVarChar, postRecord.mediaLinksJson)
          .input('mediaThumb', sql.VarChar, postRecord.mediaThumb)
          .input('scheduledAt', sql.DateTime2, postRecord.scheduledAt)
          .input('status', sql.VarChar, postRecord.status)
          .input('hash', sql.VarChar(64), postRecord.contentHash)
          .query('INSERT INTO Posts (page_id,content,media_type,media_links,media_thumb,scheduled_at,status,created_by_user_id,content_hash,approved_hash,approved_by) OUTPUT INSERTED.id VALUES (@pageId,@content,@mediaType,@mediaLinks,@mediaThumb,@scheduledAt,@status,@ownerId,@hash,@hash,@ownerId);');`;

if (!code.includes(target3)) {
  console.error('Target 3 not found!');
  process.exit(1);
}
code = code.replace(target3, rep3);
console.log('✅ Target 3 replaced');

fs.writeFileSync(filePath, code, 'utf8');
console.log('🎉 Done updating app.js!');
