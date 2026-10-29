const fs = require('fs');
const path = require('path');

const filePath = path.resolve(__dirname, '../src/app.js');
let code = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');

// 1. Add handleContentMutation to imports
code = code.replace(
  "const { computePostHash, POST_STATES, isPageIdAllowed, prepareStandardPostInsert } = require('./utils/PostStateMachine');",
  "const { computePostHash, POST_STATES, isPageIdAllowed, prepareStandardPostInsert, handleContentMutation } = require('./utils/PostStateMachine');"
);

// 2. Add PUT /api/posts/:id route right before // ═══ HỦY LỊCH BÀI ĐĂNG (CANCEL SCHEDULED POST) ═══
const routeCode = `// ═══ CHỈNH SỬA BÀI ĐĂNG (EDIT POST) ═══
app.put('/api/posts/:id', requireAuth, async (req, res) => {
  const postId = Number.parseInt(req.params.id, 10);
  if (!Number.isSafeInteger(postId) || postId <= 0) {
    return res.status(400).json({ success: false, message: 'ID bài đăng không hợp lệ.' });
  }

  try {
    await ensurePostOwnershipSchema();
    const pool = await getPool();
    const existingRes = await pool.request()
      .input('id', sql.Int, postId)
      .query('SELECT * FROM Posts WHERE id = @id');
    const post = existingRes.recordset[0];
    if (!post) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy bài viết.' });
    }

    // 1. Chặn sửa bài đang PUBLISHING
    if (post.status === POST_STATES.PUBLISHING) {
      return res.status(400).json({
        success: false,
        message: 'Bài viết đang trong quá trình xuất bản lên Facebook, không thể chỉnh sửa.'
      });
    }

    const { content, pageId, mediaType, mediaLinks, scheduledAt } = req.body;
    const targetPageId = pageId ? String(pageId).trim() : post.page_id;

    // 2. Chặn đổi sang Page ngoài Whitelist (Fail-Closed, 403 Forbidden)
    if (!isPageIdAllowed(targetPageId)) {
      return res.status(403).json({
        success: false,
        code: 'PAGE_NOT_ALLOWED',
        message: \`Fanpage ID "\${targetPageId}" nằm ngoài danh sách được phép đăng (ALLOWED_PAGE_IDS trong .env).\`
      });
    }

    // 3. Kiểm tra quyền sở hữu Page mới
    if (pageId && !(await userOwnsPage(req.user.sub, targetPageId))) {
      return res.status(403).json({
        success: false,
        message: 'Bạn không có quyền quản lý Fanpage đích này.'
      });
    }

    // 4. Kiểm tra thay đổi nội dung (Anti-tamper content mutation)
    const newPostData = {
      pageId: targetPageId,
      content: content !== undefined ? content : post.content,
      mediaType: mediaType !== undefined ? mediaType : post.media_type,
      mediaLinks: mediaLinks !== undefined ? (typeof mediaLinks === 'string' ? mediaLinks : JSON.stringify(mediaLinks)) : post.media_links,
      scheduledAt: scheduledAt !== undefined ? scheduledAt : post.scheduled_at
    };

    const mutation = handleContentMutation(post, newPostData);
    let nextStatus = post.status;
    let newApprovedHash = post.approved_hash;
    let newApprovedBy = post.approved_by;
    let newContentHash = computePostHash({ ...post, ...newPostData });

    if (mutation.invalidated) {
      nextStatus = mutation.nextState || POST_STATES.READY_FOR_APPROVAL;
      newApprovedHash = null;
      newApprovedBy = null;
    }

    // Nếu bài đang có lịch FB native thì hủy lịch cũ trên FB
    if (post.facebook_post_id) {
      try {
        await cancelFacebookScheduledPost({ pageId: post.page_id, facebookPostId: post.facebook_post_id });
      } catch (fbErr) {
        return res.status(502).json({
          success: false,
          message: 'Không thể hủy lịch cũ trên Facebook. Thao tác sửa bị hủy.'
        });
      }
    }

    await pool.request()
      .input('id', sql.Int, postId)
      .input('pageId', sql.VarChar, targetPageId)
      .input('content', sql.NVarChar, newPostData.content)
      .input('mediaType', sql.VarChar, newPostData.mediaType)
      .input('mediaLinks', sql.NVarChar, newPostData.mediaLinks || '[]')
      .input('scheduledAt', sql.DateTime2, newPostData.scheduledAt ? new Date(newPostData.scheduledAt) : null)
      .input('status', sql.VarChar, nextStatus)
      .input('contentHash', sql.VarChar(64), newContentHash)
      .input('approvedHash', sql.VarChar(64), newApprovedHash)
      .input('approvedBy', sql.VarChar(64), newApprovedBy)
      .query(\`
        UPDATE Posts 
        SET page_id = @pageId,
            content = @content,
            media_type = @mediaType,
            media_links = @mediaLinks,
            scheduled_at = @scheduledAt,
            status = @status,
            content_hash = @contentHash,
            approved_hash = @approvedHash,
            approved_by = @approvedBy,
            facebook_post_id = NULL,
            updated_at = SYSUTCDATETIME()
        WHERE id = @id
      \`);

    return res.json({
      success: true,
      message: mutation.invalidated ? 'Đã cập nhật bài viết. Do thay đổi nội dung, bài cần được phê duyệt lại.' : 'Đã cập nhật bài viết thành công.',
      status: nextStatus,
      invalidated: mutation.invalidated
    });
  } catch (err) {
    console.error('[Update Post Error]', err);
    return res.status(500).json({ success: false, message: 'Lỗi cập nhật bài viết: ' + err.message });
  }
});

// ═══ HỦY LỊCH BÀI ĐĂNG (CANCEL SCHEDULED POST) ═══`;

code = code.replace('// ═══ HỦY LỊCH BÀI ĐĂNG (CANCEL SCHEDULED POST) ═══', routeCode);

fs.writeFileSync(filePath, code, 'utf8');
console.log('✅ Added PUT /api/posts/:id route with Whitelist & Mutation protection!');

