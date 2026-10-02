const { Worker } = require('bullmq');
const axios = require('axios');
const fs = require('fs/promises');
const path = require('path');
const { sql, getPool, redisConfig } = require('../config/db');
const { addCommentToQueue } = require('./comment.queue');
const { getFacebookPageAccessToken } = require('../src/utils/FacebookPageAccessToken');

async function uploadUnpublishedPhoto({ pageId, mediaLink, token, graphVersion }) {
  const isLocalUpload = typeof mediaLink === 'string' && mediaLink.startsWith('local://');
  if (isLocalUpload) {
    const fileName = mediaLink.slice('local://'.length);
    if (path.basename(fileName) !== fileName || !/^[a-f0-9-]+\.[a-z0-9]+$/i.test(fileName)) {
      throw new Error('Đường dẫn ảnh nội bộ không hợp lệ.');
    }
    const filePath = path.resolve(__dirname, '../uploads', fileName);
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
      const filePath = path.resolve(__dirname, '../uploads', fileName);
      fileBuffer = await fs.readFile(filePath);
    }

    const startRes = await axios.post(
      `https://graph.facebook.com/${graphVersion}/${pageId}/video_stories`,
      { upload_phase: 'start', access_token: token },
      { timeout: 30000 }
    );

    const { video_id, upload_url } = startRes.data || {};
    if (!video_id || !upload_url) {
      throw new Error('Facebook không khởi tạo được phiên upload Video Story.');
    }

    if (isLocalUpload && fileBuffer) {
      await axios.post(upload_url, fileBuffer, {
        headers: {
          'Authorization': `OAuth ${token}`,
          'offset': '0',
          'file_size': String(fileBuffer.length),
          'Content-Type': 'application/octet-stream'
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        timeout: 180000
      });
    } else {
      await axios.post(upload_url, null, {
        headers: { 'Authorization': `OAuth ${token}`, 'file_url': mediaLink },
        timeout: 180000
      });
    }

    const finishRes = await axios.post(
      `https://graph.facebook.com/${graphVersion}/${pageId}/video_stories`,
      { upload_phase: 'finish', video_id: video_id, access_token: token },
      { timeout: 30000 }
    );

    console.log(`✨ [Story API] Xuất bản Video Story thành công! ID: ${video_id}`);
    return finishRes.data?.post_id || finishRes.data?.id || video_id;
  } else {
    console.log(`📸 [Story API] Bắt đầu đăng Photo Story lên Fanpage ${pageId}...`);
    const photoId = await uploadUnpublishedPhoto({ pageId, mediaLink, token, graphVersion });
    if (!photoId) {
      throw new Error('Tải ảnh chưa xuất bản lên Facebook thất bại.');
    }

    const storyRes = await axios.post(
      `https://graph.facebook.com/${graphVersion}/${pageId}/photo_stories`,
      { photo_id: photoId, access_token: token },
      { timeout: 30000 }
    );

    console.log(`✨ [Story API] Xuất bản Photo Story thành công! ID: ${storyRes.data?.id || photoId}`);
    return storyRes.data?.post_id || storyRes.data?.id || photoId;
  }
}

async function publishReel({ pageId, mediaLink, content, token, graphVersion }) {
  console.log(`🎬 [Reels API] Bắt đầu đăng Facebook Reels lên Fanpage ${pageId}...`);
  const isLocalUpload = typeof mediaLink === 'string' && mediaLink.startsWith('local://');
  let fileName = '';
  let fileBuffer = null;

  if (isLocalUpload) {
    fileName = mediaLink.slice('local://'.length);
    if (path.basename(fileName) !== fileName || !/^[a-f0-9-]+\.[a-z0-9]+$/i.test(fileName)) {
      throw new Error('Đường dẫn media nội bộ không hợp lệ.');
    }
    const filePath = path.resolve(__dirname, '../uploads', fileName);
    fileBuffer = await fs.readFile(filePath);
  }

  try {
    // Phase 1: Start video_reels session
    const startRes = await axios.post(
      `https://graph.facebook.com/${graphVersion}/${pageId}/video_reels`,
      {
        upload_phase: 'start',
        access_token: token
      },
      { timeout: 30000 }
    );

    const { video_id, upload_url } = startRes.data || {};
    if (!video_id || !upload_url) {
      throw new Error('Facebook không khởi tạo được phiên upload Reels.');
    }

    // Phase 2: Upload bytes
    if (isLocalUpload && fileBuffer) {
      await axios.post(upload_url, fileBuffer, {
        headers: {
          'Authorization': `OAuth ${token}`,
          'offset': '0',
          'file_size': String(fileBuffer.length),
          'Content-Type': 'application/octet-stream'
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        timeout: 180000
      });
    } else {
      await axios.post(upload_url, null, {
        headers: {
          'Authorization': `OAuth ${token}`,
          'file_url': mediaLink
        },
        timeout: 180000
      });
    }

    // Phase 3: Finish & Publish Reel
    const finishRes = await axios.post(
      `https://graph.facebook.com/${graphVersion}/${pageId}/video_reels`,
      {
        upload_phase: 'finish',
        video_id: video_id,
        video_state: 'PUBLISHED',
        description: content || '',
        access_token: token
      },
      { timeout: 30000 }
    );

    console.log(`✨ [Reels API] Xuất bản Reels thành công! ID: ${video_id}`);
    return finishRes.data?.post_id || finishRes.data?.id || video_id;
  } catch (reelsErr) {
    console.warn(`⚠️ [Reels API Edge Warning] ${reelsErr.response?.data?.error?.message || reelsErr.message}. Fallback qua standard videos...`);
    const fallbackRes = await publishMedia({ pageId, mediaType: 'video', mediaLink, content, token, graphVersion });
    return fallbackRes.data.id;
  }
}

async function publishMedia({ pageId, mediaType, mediaLink, content, token, graphVersion }) {
  const isLocalUpload = typeof mediaLink === 'string' && mediaLink.startsWith('local://');
  const endpoint = mediaType === 'video' ? 'videos' : 'photos';
  const url = `https://graph.facebook.com/${graphVersion}/${pageId}/${endpoint}`;
  const captionKey = mediaType === 'video' ? 'description' : 'caption';

  if (isLocalUpload) {
    const fileName = mediaLink.slice('local://'.length);
    if (path.basename(fileName) !== fileName || !/^[a-f0-9-]+\.[a-z0-9]+$/i.test(fileName)) {
      throw new Error('Đường dẫn media nội bộ không hợp lệ.');
    }
    const filePath = path.resolve(__dirname, '../uploads', fileName);
    const fileBuffer = await fs.readFile(filePath);
    const formData = new FormData();
    formData.append('source', new Blob([fileBuffer]), fileName);
    formData.append(captionKey, content);
    formData.append('access_token', token);
    return axios.post(url, formData, { timeout: mediaType === 'video' ? 180000 : 60000 });
  }

  return axios.post(url, {
    [captionKey]: content,
    [mediaType === 'video' ? 'file_url' : 'url']: mediaLink,
    access_token: token
  }, { timeout: mediaType === 'video' ? 180000 : 60000 });
}

const postWorker = new Worker(
  'post-publishing-queue',
  async (job) => {
    const { postId } = job.data;
    console.log(`🚀 [Job #${job.id}] Bắt đầu xử lý Post ID: ${postId}`);

    const pool = await getPool();

    // 1. Lấy thông tin bài viết từ SQL Server
    const postQuery = await pool.request()
      .input('id', sql.Int, postId)
      .query('SELECT * FROM Posts WHERE id = @id');

    const post = postQuery.recordset[0];
    if (!post) {
      throw new Error(`Không tìm thấy bài viết ID #${postId} trong SQL Server!`);
    }

    const claimResult = await pool.request()
      .input('id', sql.Int, postId)
      .query("UPDATE Posts SET status = 'publishing' OUTPUT INSERTED.id WHERE id = @id AND status = 'pending'");
    if (claimResult.recordset.length === 0) return;

    try {
      const pageId = post.page_id;
      const pageAccessToken = await getFacebookPageAccessToken(pageId);
      const graphVersion = process.env.FB_GRAPH_VERSION || 'v19.0';

      let fbPostId = '';
      let mediaLinks = [];
      if (post.media_links) {
        try {
          const parsedLinks = JSON.parse(post.media_links);
          mediaLinks = Array.isArray(parsedLinks) ? parsedLinks : [parsedLinks];
        } catch {
          mediaLinks = String(post.media_links).split(',').map((link) => link.trim()).filter(Boolean);
        }
      }

      if (post.media_type === 'image') {
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
          console.log(`✨ [Album API] Xuất bản Album ${mediaLinks.length} ảnh thành công! ID: ${fbPostId}`);
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
        // Đăng bài dạng Text thuần túy
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

      // 4. Cập nhật trạng thái 'published' và lưu fbPostId vào SQL Server
      await pool.request()
        .input('id', sql.Int, postId)
        .input('fbId', sql.NVarChar, fbPostId)
        .query("UPDATE Posts SET status = 'published', facebook_post_id = @fbId WHERE id = @id");

      for (const mediaLink of mediaLinks) {
        if (typeof mediaLink !== 'string' || !mediaLink.startsWith('local://')) continue;
        const fileName = mediaLink.slice('local://'.length);
        if (path.basename(fileName) === fileName && /^[a-f0-9-]+\.[a-z0-9]+$/i.test(fileName)) {
          await fs.unlink(path.resolve(__dirname, '../uploads', fileName)).catch(() => {});
        }
      }

      // Schedule comments relative to the successful post time.
      const commentQuery = await pool.request()
        .input('postId', sql.Int, postId)
        .query("SELECT id, delay_minutes FROM PostComments WHERE post_id = @postId AND status = 'pending'");

      for (const comment of commentQuery.recordset) {
        try {
          await addCommentToQueue(comment.id, comment.delay_minutes || 0);
        } catch (commentError) {
          console.error(`❌ Không thể lên lịch comment #${comment.id}:`, commentError.message);
        }
      }

    } catch (err) {
      const errorMsg = err.response?.data?.error?.message || err.message;
      console.error(`❌ [FB ERROR] Đăng bài thất bại: ${errorMsg}`);

      // Cập nhật trạng thái 'failed' trong SQL Server
      await pool.request()
        .input('id', sql.Int, postId)
        .query("UPDATE Posts SET status = 'failed' WHERE id = @id");

      throw new Error(errorMsg);
    }
  },
  { connection: redisConfig }
);

postWorker.on('error', (error) => {
  console.error('[Post Worker Error]', error.message);
});

console.log('⚡ BullMQ Worker đã sẵn sàng lắng nghe Hàng chờ (Queue)...');