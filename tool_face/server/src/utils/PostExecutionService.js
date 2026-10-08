/**
 * PostExecutionService.js
 * Chứa logic thực thi xuất bản bài viết và comment seeding lên Facebook.
 * Có thể được gọi từ BullMQ Worker (nếu có Redis) HOẶC từ StandaloneScheduler (chạy độc lập không cần Redis).
 */
const axios = require('axios');
const fs = require('fs/promises');
const nodeFs = require('fs');
const path = require('path');
const { sql, getPool } = require('../../config/db');
const { getFacebookPageAccessToken } = require('./FacebookPageAccessToken');
const telegramAlertService = require('./TelegramAlertService');

function getUploadFilePath(fileName) {
  if (process.env.APP_DATA_DIR) {
    const p = path.join(process.env.APP_DATA_DIR, 'uploads', fileName);
    if (nodeFs.existsSync(p)) return p;
  }
  const p2 = path.resolve(__dirname, '../../uploads', fileName);
  if (nodeFs.existsSync(p2)) return p2;
  return process.env.APP_DATA_DIR ? path.join(process.env.APP_DATA_DIR, 'uploads', fileName) : p2;
}

async function uploadUnpublishedPhoto({ pageId, mediaLink, token, graphVersion }) {
  const isLocalUpload = typeof mediaLink === 'string' && mediaLink.startsWith('local://');
  if (isLocalUpload) {
    const fileName = mediaLink.slice('local://'.length);
    if (path.basename(fileName) !== fileName || !/^[a-f0-9-]+\.[a-z0-9]+$/i.test(fileName)) {
      throw new Error('Đường dẫn ảnh nội bộ không hợp lệ.');
    }
    const filePath = getUploadFilePath(fileName);
    let fileBuffer;
    try {
      fileBuffer = await fs.readFile(filePath);
    } catch {
      throw new Error(`Tệp ảnh ${fileName} không còn tồn tại trên máy chủ.`);
    }
    const formData = new FormData();
    formData.append('source', new Blob([fileBuffer]), fileName);
    formData.append('published', 'false');
    formData.append('access_token', token);
    const res = await axios.post(
      `https://graph.facebook.com/${graphVersion}/${pageId}/photos`,
      formData,
      { timeout: 60000 }
    );
    return res.data.id;
  } else {
    const res = await axios.post(
      `https://graph.facebook.com/${graphVersion}/${pageId}/photos`,
      {
        url: mediaLink,
        published: false,
        access_token: token
      },
      { timeout: 60000 }
    );
    return res.data.id;
  }
}

async function publishStory({ pageId, mediaLink, token, graphVersion }) {
  const isVideo = typeof mediaLink === 'string' && (
    mediaLink.endsWith('.mp4') || mediaLink.endsWith('.mov') || mediaLink.includes('video')
  );

  if (isVideo) {
    console.log(`🎬 [Story API] Bắt đầu đăng Video Story lên Fanpage ${pageId}...`);
    const isLocalUpload = typeof mediaLink === 'string' && mediaLink.startsWith('local://');
    let fileName = '';
    let fileBuffer = null;

    if (isLocalUpload) {
      fileName = mediaLink.slice('local://'.length);
      const filePath = getUploadFilePath(fileName);
      fileBuffer = await fs.readFile(filePath);
    } else {
      const resp = await axios.get(mediaLink, { responseType: 'arraybuffer' });
      fileBuffer = Buffer.from(resp.data);
      fileName = 'story-video.mp4';
    }

    const startRes = await axios.post(
      `https://graph.facebook.com/${graphVersion}/${pageId}/video_stories`,
      { upload_phase: 'start', access_token: token }
    );
    const { video_id: videoId, upload_url: uploadUrl } = startRes.data;

    await axios.post(uploadUrl, fileBuffer, {
      headers: {
        Authorization: `OAuth ${token}`,
        offset: '0',
        file_size: String(fileBuffer.length)
      },
      timeout: 180000
    });

    const finishRes = await axios.post(
      `https://graph.facebook.com/${graphVersion}/${pageId}/video_stories`,
      { upload_phase: 'finish', video_id: videoId, access_token: token }
    );
    console.log(`✨ [Story API] Đăng Video Story thành công! ID: ${finishRes.data.post_id || videoId}`);
    return finishRes.data.post_id || videoId;
  } else {
    console.log(`📸 [Story API] Bắt đầu đăng Photo Story lên Fanpage ${pageId}...`);
    const photoId = await uploadUnpublishedPhoto({ pageId, mediaLink, token, graphVersion });
    const res = await axios.post(
      `https://graph.facebook.com/${graphVersion}/${pageId}/photo_stories`,
      { photo_id: photoId, access_token: token }
    );
    console.log(`✨ [Story API] Đăng Photo Story thành công! ID: ${res.data.post_id || photoId}`);
    return res.data.post_id || photoId;
  }
}

async function publishReel({ pageId, mediaLink, content, token, graphVersion }) {
  console.log(`🎬 [Reels API] Bắt đầu quy trình đăng Reel lên Fanpage ${pageId}...`);
  const initRes = await axios.post(
    `https://graph.facebook.com/${graphVersion}/${pageId}/video_reels`,
    { upload_phase: 'start', access_token: token }
  );
  const { video_id: videoId, upload_url: uploadUrl } = initRes.data;
  if (!videoId || !uploadUrl) throw new Error('Facebook không trả về video_id hoặc upload_url khi tạo Reel.');

  const isLocalUpload = typeof mediaLink === 'string' && mediaLink.startsWith('local://');
  let fileBuffer;
  if (isLocalUpload) {
    const fileName = mediaLink.slice('local://'.length);
    const filePath = getUploadFilePath(fileName);
    fileBuffer = await fs.readFile(filePath);
  } else {
    const resp = await axios.get(mediaLink, { responseType: 'arraybuffer' });
    fileBuffer = Buffer.from(resp.data);
  }

  await axios.post(uploadUrl, fileBuffer, {
    headers: {
      Authorization: `OAuth ${token}`,
      offset: '0',
      file_size: String(fileBuffer.length)
    },
    timeout: 180000
  });

  const publishRes = await axios.post(
    `https://graph.facebook.com/${graphVersion}/${pageId}/video_reels`,
    {
      upload_phase: 'finish',
      access_token: token,
      video_id: videoId,
      video_state: 'PUBLISHED',
      description: content || ''
    }
  );
  return publishRes.data.id || videoId;
}

async function publishMedia({ pageId, mediaType, mediaLink, content, token, graphVersion }) {
  const isVideo = mediaType === 'video';
  const endpoint = isVideo ? 'videos' : 'photos';
  const isLocalUpload = typeof mediaLink === 'string' && mediaLink.startsWith('local://');
  const url = `https://graph.facebook.com/${graphVersion}/${pageId}/${endpoint}`;
  const captionKey = isVideo ? 'description' : 'caption';

  if (isLocalUpload) {
    const fileName = mediaLink.slice('local://'.length);
    const filePath = getUploadFilePath(fileName);
    const fileBuffer = await fs.readFile(filePath);
    const formData = new FormData();
    formData.append('source', new Blob([fileBuffer]), fileName);
    formData.append(captionKey, content);
    formData.append('access_token', token);
    return axios.post(url, formData, { timeout: isVideo ? 180000 : 60000 });
  }

  return axios.post(url, {
    [captionKey]: content,
    [isVideo ? 'file_url' : 'url']: mediaLink,
    access_token: token
  }, { timeout: isVideo ? 180000 : 60000 });
}

/**
 * Xuất bản một bài đăng lên Facebook
 */
async function executePublishPost(postId) {
  console.log(`🚀 Bắt đầu xuất bản Post ID: ${postId}`);
  const pool = await getPool();

  const postQuery = await pool.request()
    .input('id', sql.Int, postId)
    .query('SELECT * FROM Posts WHERE id = @id');

  const post = postQuery.recordset[0];
  if (!post) {
    console.log(`Bài viết ID #${postId} không tồn tại trong database. Bỏ qua.`);
    return;
  }

  if (post.status === 'published' || post.status === 'cancelled') {
    console.log(`Bài #${postId} đã ở trạng thái ${post.status}. Bỏ qua.`);
    return;
  }

  const claimResult = await pool.request()
    .input('id', sql.Int, postId)
    .query("UPDATE Posts SET status = 'publishing' OUTPUT INSERTED.id WHERE id = @id AND status IN ('pending', 'scheduled')");
  if (claimResult.recordset.length === 0) return;

  try {
    const pageId = post.page_id;
    let pageName = `Page ${pageId}`;
    try {
      const pageLookup = await pool.request()
        .input('pageId', sql.VarChar(64), String(pageId))
        .query("SELECT name FROM dbo.FacebookPages WHERE page_id = @pageId");
      if (pageLookup.recordset[0]?.name) {
        pageName = pageLookup.recordset[0].name;
      }
    } catch (_) {}

    const pageAccessToken = await getFacebookPageAccessToken(pageId);
    const graphVersion = process.env.FB_GRAPH_VERSION || 'v19.0';

    let fbPostId = post.facebook_post_id || '';
    let mediaLinks = [];
    if (post.media_links) {
      try {
        const parsedLinks = JSON.parse(post.media_links);
        mediaLinks = Array.isArray(parsedLinks) ? parsedLinks : [parsedLinks];
      } catch {
        mediaLinks = String(post.media_links).split(',').map((link) => link.trim()).filter(Boolean);
      }
    }

    if (post.facebook_post_id) {
      console.log(`ℹ️ [FB SCHEDULED] Bài #${postId} đã được lên lịch trực tiếp trên Facebook (ID: ${post.facebook_post_id}).`);
      const scheduledTime = post.scheduled_at ? new Date(post.scheduled_at).getTime() : 0;
      const now = Date.now();
      if (scheduledTime > now) {
        await pool.request()
          .input('id', sql.Int, postId)
          .query("UPDATE Posts SET status = 'scheduled' WHERE id = @id");
        return;
      }
    } else if (post.media_type === 'image') {
      if (mediaLinks.length === 0) throw new Error('Bài đăng ảnh chưa có đường dẫn media.');
      if (mediaLinks.length > 1) {
        console.log(`📸 [Album API] Bắt đầu đăng Album gồm ${mediaLinks.length} ảnh lên Fanpage ${pageId}...`);
        const photoIds = [];
        for (const link of mediaLinks) {
          const photoId = await uploadUnpublishedPhoto({ pageId, mediaLink: link, token: pageAccessToken, graphVersion });
          photoIds.push(photoId);
        }
        const albumRes = await axios.post(
          `https://graph.facebook.com/${graphVersion}/${pageId}/feed`,
          {
            message: post.content,
            attached_media: photoIds.map((id) => ({ media_fbid: id })),
            access_token: pageAccessToken
          },
          { timeout: 60000 }
        );
        fbPostId = albumRes.data.id;
      } else {
        const mediaUrl = mediaLinks[0];
        const response = await publishMedia({ pageId, mediaType: 'image', mediaLink: mediaUrl, content: post.content, token: pageAccessToken, graphVersion });
        fbPostId = response.data.post_id || response.data.id;
      }
    } else if (post.media_type === 'video') {
      const mediaUrl = mediaLinks[0];
      if (!mediaUrl) throw new Error('Bài đăng video chưa có đường dẫn media.');
      const response = await publishMedia({ pageId, mediaType: 'video', mediaLink: mediaUrl, content: post.content, token: pageAccessToken, graphVersion });
      fbPostId = response.data.id;
    } else if (post.media_type === 'reel') {
      const mediaUrl = mediaLinks[0];
      if (!mediaUrl) throw new Error('Bài đăng Reels chưa có đường dẫn video.');
      fbPostId = await publishReel({ pageId, mediaLink: mediaUrl, content: post.content, token: pageAccessToken, graphVersion });
    } else if (post.media_type === 'story') {
      const mediaUrl = mediaLinks[0];
      if (!mediaUrl) throw new Error('Bài đăng Tin (Story) chưa có hình ảnh hoặc video.');
      fbPostId = await publishStory({ pageId, mediaLink: mediaUrl, token: pageAccessToken, graphVersion });
    } else {
      const response = await axios.post(
        `https://graph.facebook.com/${graphVersion}/${pageId}/feed`,
        {
          message: post.content,
          access_token: pageAccessToken,
        }
      );
      fbPostId = response.data.id;
    }

    console.log(`✅ [FB SUCCESS] Đăng bài thành công lên Facebook! ID: ${fbPostId}`);

    await pool.request()
      .input('id', sql.Int, postId)
      .input('fbId', sql.NVarChar, fbPostId)
      .query("UPDATE Posts SET status = 'published', facebook_post_id = @fbId WHERE id = @id");

    const cleanPostId = fbPostId && fbPostId.includes('_') ? fbPostId.split('_')[1] : fbPostId;
    const directPostUrl = `https://www.facebook.com/${post.page_id}/posts/${cleanPostId}`;

    telegramAlertService.notifyPostSuccess({
      postId,
      pageName,
      postUrl: directPostUrl
    }).catch((tgErr) => console.warn('[Telegram Success Alert Warn]', tgErr.message));


    // Schedule pending comments:
    // Có thể trigger qua standalone scheduler hoặc BullMQ
    const commentQuery = await pool.request()
      .input('postId', sql.Int, postId)
      .query("SELECT id, delay_minutes FROM PostComments WHERE post_id = @postId AND status = 'pending'");

    for (const comment of commentQuery.recordset) {
      if (comment.delay_minutes === 0) {
        // Comment ngay lập tức
        executePublishComment(comment.id).catch((e) => console.error(`Lỗi comment tức thì #${comment.id}:`, e.message));
      }
    }

  } catch (err) {
    const errorMsg = err.response?.data?.error?.message || err.message;
    console.error(`❌ [FB ERROR] Đăng bài thất bại: ${errorMsg}`);

    await pool.request()
      .input('id', sql.Int, postId)
      .query("UPDATE Posts SET status = 'failed' WHERE id = @id");

    telegramAlertService.notifyPostFailed({
      postId,
      pageName: post?.page_id ? `Page ${post.page_id}` : 'Facebook Page',
      pageId: post?.page_id,
      errorMessage: errorMsg
    }).catch(() => {});

    throw err;
  }
}

/**
 * Xuất bản một comment seeding lên Facebook
 */
async function executePublishComment(commentId) {
  const pool = await getPool();
  const claimResult = await pool.request()
    .input('id', sql.Int, commentId)
    .query(`
      UPDATE commentRow
      SET status = 'posting'
      OUTPUT INSERTED.id
      FROM PostComments AS commentRow
      WHERE commentRow.id = @id AND commentRow.status = 'pending';
    `);

  if (claimResult.recordset.length === 0) return;

  try {
    const result = await pool.request()
      .input('id', sql.Int, commentId)
      .query(`
        SELECT commentRow.content, commentRow.media_url, postRow.facebook_post_id, postRow.page_id
        FROM PostComments AS commentRow
        INNER JOIN Posts AS postRow ON postRow.id = commentRow.post_id
        WHERE commentRow.id = @id;
      `);
    const comment = result.recordset[0];
    if (!comment || !comment.facebook_post_id) {
      throw new Error(`Không tìm thấy bài đăng Facebook cho comment #${commentId}.`);
    }

    const pageAccessToken = await getFacebookPageAccessToken(comment.page_id);
    const graphVersion = process.env.FB_GRAPH_VERSION || 'v19.0';
    const payload = {
      message: comment.content,
      access_token: pageAccessToken
    };
    if (comment.media_url) payload.attachment_url = comment.media_url;

    await axios.post(
      `https://graph.facebook.com/${graphVersion}/${comment.facebook_post_id}/comments`,
      payload
    );

    await pool.request()
      .input('id', sql.Int, commentId)
      .query("UPDATE PostComments SET status = 'posted' WHERE id = @id");
    console.log(`✅ [Comment SUCCESS] Đã đăng comment seeding #${commentId} lên Facebook.`);
  } catch (error) {
    await pool.request()
      .input('id', sql.Int, commentId)
      .query("UPDATE PostComments SET status = 'failed' WHERE id = @id");
    console.error(`❌ [Comment ERROR #${commentId}]`, error.response?.data?.error?.message || error.message);
    throw error;
  }
}

module.exports = {
  executePublishPost,
  executePublishComment
};
