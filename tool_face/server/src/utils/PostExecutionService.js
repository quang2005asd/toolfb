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

const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const GOOGLE_DRIVE_HOSTS = new Set(['drive.google.com', 'drive.usercontent.google.com']);

function normalizeGoogleDriveUrl(mediaLink) {
  if (!mediaLink || typeof mediaLink !== 'string') return null;
  let url;
  try {
    url = new URL(mediaLink);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || !GOOGLE_DRIVE_HOSTS.has(url.hostname)) return null;

  const fileId = url.searchParams.get('id') || url.pathname.match(/\/file\/d\/([^/]+)/)?.[1];
  if (!fileId) return null;

  return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`;
}

async function downloadGoogleDriveVideo(mediaLink) {
  const directLink = normalizeGoogleDriveUrl(mediaLink);
  if (!directLink) throw new Error('Không thể phân tích đường dẫn Google Drive.');
  let currentUrl = new URL(directLink);

  for (let redirectCount = 0; redirectCount <= 5; redirectCount++) {
    if (currentUrl.protocol !== 'https:' || !GOOGLE_DRIVE_HOSTS.has(currentUrl.hostname)) {
      throw new Error('Google Drive chuyển hướng đến máy chủ không hợp lệ.');
    }

    const response = await axios.get(currentUrl.toString(), {
      responseType: 'arraybuffer',
      maxContentLength: MAX_VIDEO_BYTES,
      maxRedirects: 0,
      timeout: 120000,
      validateStatus: (status) => status >= 200 && status < 400
    });

    if (response.status >= 300) {
      if (!response.headers.location || redirectCount === 5) {
        throw new Error('Không thể tải video từ Google Drive. Vui lòng bật quyền xem "Bất kỳ ai có đường liên kết".');
      }
      currentUrl = new URL(response.headers.location, currentUrl);
      continue;
    }

    const contentType = String(response.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (!contentType.startsWith('video/') && contentType !== 'application/octet-stream') {
      throw new Error('Tệp tải về từ Google Drive không phải là video. Kiểm tra quyền chia sẻ công khai của file.');
    }

    const fileName = response.headers['content-disposition']?.match(/filename="?([^";]+)"?/i)?.[1];
    return {
      buffer: Buffer.from(response.data),
      contentType: contentType === 'application/octet-stream' ? 'video/mp4' : contentType,
      fileName: path.basename(fileName || 'drive-video.mp4')
    };
  }

  throw new Error('Quá số lần chuyển hướng cho phép khi tải video từ Google Drive.');
}

async function publishStory({ pageId, mediaLink, token, graphVersion }) {
  const isVideo = typeof mediaLink === 'string' && (
    mediaLink.endsWith('.mp4') || mediaLink.endsWith('.mov') || mediaLink.includes('video') || Boolean(normalizeGoogleDriveUrl(mediaLink))
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
    } else if (normalizeGoogleDriveUrl(mediaLink)) {
      const driveVideo = await downloadGoogleDriveVideo(mediaLink);
      fileBuffer = driveVideo.buffer;
      fileName = driveVideo.fileName;
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
  } else if (normalizeGoogleDriveUrl(mediaLink)) {
    const driveVideo = await downloadGoogleDriveVideo(mediaLink);
    fileBuffer = driveVideo.buffer;
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
    formData.append(captionKey, content || '');
    formData.append('access_token', token);
    return axios.post(url, formData, { timeout: isVideo ? 180000 : 60000 });
  }

  if (isVideo) {
    const isGoogleDrive = normalizeGoogleDriveUrl(mediaLink);
    if (isGoogleDrive) {
      console.log(`📥 [Google Drive Video] Đang tải video từ Google Drive để upload lên Fanpage ${pageId}...`);
      const driveVideo = await downloadGoogleDriveVideo(mediaLink);
      const formData = new FormData();
      formData.append('source', new Blob([driveVideo.buffer], { type: driveVideo.contentType }), driveVideo.fileName);
      formData.append('description', content || '');
      formData.append('access_token', token);
      return axios.post(url, formData, {
        timeout: 180000,
        maxBodyLength: MAX_VIDEO_BYTES
      });
    }
  }

  return axios.post(url, {
    [captionKey]: content || '',
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

    const nowIso = new Date().toISOString();
    await pool.request()
      .input('id', sql.Int, postId)
      .input('fbId', sql.NVarChar, fbPostId)
      .input('nowIso', sql.NVarChar, nowIso)
      .query("UPDATE Posts SET status = 'published', facebook_post_id = @fbId, published_at = @nowIso, updated_at = @nowIso WHERE id = @id");

    const cleanPostId = fbPostId && fbPostId.includes('_') ? fbPostId.split('_')[1] : fbPostId;
    const directPostUrl = `https://www.facebook.com/${post.page_id}/posts/${cleanPostId}`;

    telegramAlertService.notifyPostSuccess({
      postId,
      pageName,
      postUrl: directPostUrl
    }).catch((tgErr) => console.warn('[Telegram Success Alert Warn]', tgErr.message));


    // Schedule pending comments:
    const commentQuery = await pool.request()
      .input('postId', sql.Int, postId)
      .query("SELECT id, delay_minutes FROM PostComments WHERE post_id = @postId AND status = 'pending' ORDER BY delay_minutes ASC, id ASC");

    let addCommentToQueueFn = null;
    try {
      const cq = require('../../../queues/comment.queue') || require('../../queues/comment.queue');
      addCommentToQueueFn = cq.addCommentToQueue;
    } catch (_) {
      try {
        const cq2 = require('../../queues/comment.queue');
        addCommentToQueueFn = cq2.addCommentToQueue;
      } catch (__) {}
    }

    const comments = commentQuery.recordset || [];
    for (let i = 0; i < comments.length; i++) {
      const comment = comments[i];
      if (comment.delay_minutes === 0) {
        // Comment ngay lập tức (giãn cách nhẹ 2.5s nếu có nhiều comment delay 0 để không bị rate limit)
        const immediateDelayMs = i * 2500;
        setTimeout(() => {
          executePublishComment(comment.id).catch((e) => console.error(`Lỗi comment tức thì #${comment.id}:`, e.message));
        }, immediateDelayMs);
      } else {
        if (addCommentToQueueFn) {
          addCommentToQueueFn(comment.id, comment.delay_minutes).catch((e) => console.warn(`[Queue Comment Error #${comment.id}]:`, e.message));
        }
        const delayMs = Math.max(0, (comment.delay_minutes || 0) * 60 * 1000);
        setTimeout(() => {
          executePublishComment(comment.id).catch((e) => console.error(`Lỗi comment hẹn giờ #${comment.id}:`, e.message));
        }, delayMs);
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
    .query("UPDATE PostComments SET status = 'posting' OUTPUT INSERTED.id WHERE id = @id AND status = 'pending';");

  if (claimResult.recordset.length === 0) return;

  try {
    const result = await pool.request()
      .input('id', sql.Int, commentId)
      .query(`
        SELECT commentRow.content, commentRow.media_url, commentRow.parent_comment_id,
               postRow.facebook_post_id, postRow.page_id,
               parentRow.facebook_comment_id AS parent_facebook_comment_id
        FROM PostComments AS commentRow
        INNER JOIN Posts AS postRow ON postRow.id = commentRow.post_id
        LEFT JOIN PostComments AS parentRow ON parentRow.id = commentRow.parent_comment_id
        WHERE commentRow.id = @id;
      `);
    const comment = result.recordset[0];
    if (!comment || !comment.facebook_post_id) {
      throw new Error(`Không tìm thấy bài đăng Facebook cho comment #${commentId}.`);
    }

    const pageAccessToken = await getFacebookPageAccessToken(comment.page_id);
    const graphVersion = process.env.FB_GRAPH_VERSION || 'v19.0';
    const targetId = comment.parent_facebook_comment_id || comment.facebook_post_id;

    const payload = {
      message: comment.content,
      access_token: pageAccessToken
    };
    if (comment.media_url) payload.attachment_url = comment.media_url;

    console.log(`💬 [Comment API] Đang đăng bình luận #${commentId} lên đối tượng FB ${targetId}...`);
    const fbRes = await axios.post(
      `https://graph.facebook.com/${graphVersion}/${targetId}/comments`,
      payload
    );

    const fbCommentId = fbRes.data?.id || null;

    await pool.request()
      .input('id', sql.Int, commentId)
      .input('fbCommentId', sql.NVarChar(128), fbCommentId)
      .query("UPDATE PostComments SET status = 'posted', facebook_comment_id = @fbCommentId, error_message = NULL WHERE id = @id");
    console.log(`✅ [Comment SUCCESS] Đã đăng comment seeding #${commentId} lên Facebook! FB Comment ID: ${fbCommentId}`);
  } catch (error) {
    const errorMsg = error.response?.data?.error?.message || error.message;
    await pool.request()
      .input('id', sql.Int, commentId)
      .input('errMsg', sql.NVarChar(sql.MAX), errorMsg)
      .query("UPDATE PostComments SET status = 'failed', error_message = @errMsg WHERE id = @id");
    console.error(`❌ [Comment ERROR #${commentId}]`, errorMsg);
    throw error;
  }
}

module.exports = {
  executePublishPost,
  executePublishComment
};
