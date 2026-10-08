const axios = require('axios');
const fs = require('fs/promises');
const nodeFs = require('fs');
const path = require('path');
const { getFacebookPageAccessToken } = require('./FacebookPageAccessToken');

function getUploadFilePath(fileName) {
  if (process.env.APP_DATA_DIR) {
    const p = path.join(process.env.APP_DATA_DIR, 'uploads', fileName);
    if (nodeFs.existsSync(p)) return p;
  }
  const p2 = path.resolve(__dirname, '../../uploads', fileName);
  if (nodeFs.existsSync(p2)) return p2;
  return process.env.APP_DATA_DIR ? path.join(process.env.APP_DATA_DIR, 'uploads', fileName) : p2;
}

const graphVersion = process.env.FB_GRAPH_VERSION || 'v19.0';

/**
 * Kiểm tra xem bài đăng có đủ điều kiện hẹn giờ trực tiếp bằng Facebook Scheduled Post API hay không.
 * Điều kiện:
 * 1. Thuộc loại bài Feed thường: text, image, video (Reels và Stories giữ nguyên cơ chế hàng đợi riêng).
 * 2. Thời gian hẹn giờ trong khoảng từ 11 phút đến 29 ngày kể từ hiện tại (Facebook yêu cầu tối thiểu 10 phút, tối đa 30/75 ngày).
 */
function canScheduleOnFacebook({ mediaType, scheduledAt }) {
  if (!['text', 'image', 'video'].includes(mediaType)) {
    return false;
  }

  const scheduledTime = new Date(scheduledAt).getTime();
  if (!Number.isFinite(scheduledTime)) {
    return false;
  }

  const diffMs = scheduledTime - Date.now();
  const minBufferMs = 11 * 60 * 1000; // 11 phút để tránh lệch đồng hồ với máy chủ Meta
  const maxBufferMs = 29 * 24 * 60 * 60 * 1000; // 29 ngày

  return diffMs >= minBufferMs && diffMs <= maxBufferMs;
}

/**
 * Tải ảnh dạng unpublished lên Facebook Page để lấy ID ảnh (media_fbid)
 */
async function uploadUnpublishedPhoto({ pageId, mediaLink, token }) {
  const isLocalUpload = typeof mediaLink === 'string' && mediaLink.startsWith('local://');

  if (isLocalUpload) {
    const fileName = mediaLink.slice('local://'.length);
    if (path.basename(fileName) !== fileName || !/^[a-f0-9-]+\.[a-z0-9]+$/i.test(fileName)) {
      throw new Error('Đường dẫn ảnh nội bộ không hợp lệ.');
    }
    const filePath = getUploadFilePath(fileName);
    const fileBuffer = await fs.readFile(filePath);

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

/**
 * Lên lịch đăng bài trực tiếp trên Facebook Page qua Graph API.
 * Facebook sẽ tự động đăng đúng giờ trên cloud kể cả khi tắt máy / tắt server.
 */
async function schedulePostOnFacebook({ pageId, content, mediaType, mediaLinks = [], scheduledAt }) {
  const token = await getFacebookPageAccessToken(pageId);
  const scheduledPublishTime = Math.floor(new Date(scheduledAt).getTime() / 1000);

  if (mediaType === 'image') {
    if (!Array.isArray(mediaLinks) || mediaLinks.length === 0) {
      throw new Error('Bài đăng ảnh chưa có đường dẫn media.');
    }

    // Tải tất cả ảnh ở chế độ unpublished
    const photoIds = [];
    for (const link of mediaLinks) {
      const photoId = await uploadUnpublishedPhoto({ pageId, mediaLink: link, token });
      photoIds.push(photoId);
    }

    // Lên lịch bài viết dạng Feed đính kèm danh sách ảnh
    const feedRes = await axios.post(
      `https://graph.facebook.com/${graphVersion}/${pageId}/feed`,
      {
        message: content || '',
        attached_media: photoIds.map((id) => ({ media_fbid: id })),
        published: false,
        scheduled_publish_time: scheduledPublishTime,
        access_token: token
      },
      { timeout: 60000 }
    );

    return feedRes.data.id;
  } else if (mediaType === 'video') {
    const mediaLink = mediaLinks[0];
    if (!mediaLink) throw new Error('Bài đăng video chưa có đường dẫn video.');

    const isLocalUpload = typeof mediaLink === 'string' && mediaLink.startsWith('local://');
    if (isLocalUpload) {
      const fileName = mediaLink.slice('local://'.length);
      if (path.basename(fileName) !== fileName || !/^[a-f0-9-]+\.[a-z0-9]+$/i.test(fileName)) {
        throw new Error('Đường dẫn video nội bộ không hợp lệ.');
      }
      const filePath = getUploadFilePath(fileName);
      const fileBuffer = await fs.readFile(filePath);

      const formData = new FormData();
      formData.append('source', new Blob([fileBuffer]), fileName);
      formData.append('description', content || '');
      formData.append('published', 'false');
      formData.append('scheduled_publish_time', String(scheduledPublishTime));
      formData.append('access_token', token);

      const res = await axios.post(
        `https://graph.facebook.com/${graphVersion}/${pageId}/videos`,
        formData,
        { timeout: 180000 }
      );
      return res.data.id;
    } else {
      const res = await axios.post(
        `https://graph.facebook.com/${graphVersion}/${pageId}/videos`,
        {
          description: content || '',
          file_url: mediaLink,
          published: false,
          scheduled_publish_time: scheduledPublishTime,
          access_token: token
        },
        { timeout: 180000 }
      );
      return res.data.id;
    }
  } else {
    // Bài viết Text thường
    const res = await axios.post(
      `https://graph.facebook.com/${graphVersion}/${pageId}/feed`,
      {
        message: content || '',
        published: false,
        scheduled_publish_time: scheduledPublishTime,
        access_token: token
      },
      { timeout: 60000 }
    );
    return res.data.id;
  }
}

/**
 * Xóa hoặc hủy bài đăng đã hẹn giờ trên Facebook
 */
async function cancelFacebookScheduledPost({ pageId, facebookPostId }) {
  if (!facebookPostId) return;
  try {
    const token = await getFacebookPageAccessToken(pageId);
    await axios.delete(
      `https://graph.facebook.com/${graphVersion}/${facebookPostId}`,
      { params: { access_token: token }, timeout: 15000 }
    );
    console.log(`[FB CANCEL] Đã xóa bài hẹn giờ ${facebookPostId} trên Facebook.`);
  } catch (err) {
    console.warn(`[FB CANCEL WARNING] Không thể xóa bài ${facebookPostId} trên Facebook:`, err.response?.data?.error?.message || err.message);
  }
}

module.exports = {
  canScheduleOnFacebook,
  schedulePostOnFacebook,
  cancelFacebookScheduledPost
};
