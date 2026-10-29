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
const kbFactsService = require('./KbFactsService');
const { transition, POST_STATES, assertPublishable, isPageIdAllowed } = require('./PostStateMachine');

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
      const err = new Error('Đường dẫn ảnh nội bộ không hợp lệ.');
      err.isInternalPermanent = true;
      throw err;
    }
    const filePath = getUploadFilePath(fileName);
    let fileBuffer;
    try {
      fileBuffer = await fs.readFile(filePath);
    } catch {
      const err = new Error(`Tệp ảnh ${fileName} không còn tồn tại trên máy chủ.`);
      err.isInternalPermanent = true;
      throw err;
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
 * Chuẩn hóa nội dung văn bản để so sánh chính xác giữa DB và Facebook Feed
 * - Chuẩn hóa Unicode NFC (tránh lệch tổ hợp / dựng sẵn tiếng Việt)
 * - Đưa \r\n và \r về \n
 * - Loại bỏ ký tự tàng hình (zero-width spaces)
 * - Chuẩn hóa khoảng trắng thừa
 */
function normalizePostText(text) {
  if (!text) return '';
  return text
    .normalize('NFC')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .replace(/\s+\n/g, '\n')
    .trim()
    .toLowerCase();
}

/**
 * Kiểm tra an toàn xem bài viết đã lên Facebook sau timeout hay chưa:
 * 1. Chỉ chạy khi lỗi trước đó là timeout
 * 2. Chỉ so sánh các bài tạo ra SAU publishing_started_at
 * 3. Nếu gọi /feed lỗi (thiếu quyền, rate limit): DỪNG NGAY, ném lỗi để người xử lý và alert Telegram
 * 4. Nếu mơ hồ (khớp nhiều hơn 1 bài): DỪNG NGAY, chuyển người xử lý
 */
async function checkIfPostAlreadyPublishedOnFacebook({ post, token, graphVersion: gv }) {
  const version = gv || process.env.FB_GRAPH_VERSION || 'v19.0';
  const pageId = post.page_id;
  const lastError = String(post.last_error || '').toLowerCase();

  // RULE 1: CHỈ CHẠY KHI LỖI TRƯỚC ĐÓ LÀ TIMEOUT HOẶC LỖI KẾT NỐI MẠNG
  const isTimeoutError = lastError.includes('timeout') ||
    lastError.includes('econnreset') ||
    lastError.includes('etimedout') ||
    lastError.includes('quá thời gian') ||
    lastError.includes('econnaborted');

  if (!isTimeoutError) {
    return { shouldProceed: true, existingFbId: null };
  }

  // RULE 2: Cần có mốc publishing_started_at để chỉ so với các bài đăng TRONG / SAU khoảng thời gian vừa gọi API
  if (!post.publishing_started_at) {
    return { shouldProceed: true, existingFbId: null };
  }

  const startedAtMs = new Date(post.publishing_started_at).getTime() - 30000; // Buffer 30s lệch đồng hồ
  // RULE 3: NẾU BÀI KHÔNG CÓ NỘI DUNG CHỮ (CHỈ CÓ ẢNH/VIDEO RỖNG MESSAGE):
  // Không thể đối soát message trên Feed -> BẮT BUỘC CHUYỂN NGƯỜI XỬ LÝ ĐỂ TRÁNH ĐĂNG TRÙNG MÙ QUÁNG
  const postContentNorm = normalizePostText(post.content);
  if (!postContentNorm) {
    const err = new Error(`[CẦN CAN THIỆP THỦ CÔNG] Bài viết ID #${post.id} không có nội dung chữ (message rỗng). Không thể tự động đối soát Facebook Feed sau sự cố timeout.`);
    err.isManualInterventionRequired = true;
    throw err;
  }

  let feedPosts = [];
  try {
    const res = await axios.get(
      `https://graph.facebook.com/${version}/${pageId}/feed`,
      {
        params: { fields: 'id,message,created_time', limit: 10 },
        headers: { Authorization: `Bearer ${token}` },
        timeout: 10000
      }
    );
    feedPosts = res.data?.data || [];
  } catch (feedErr) {
    // RULE 4: NẾU GỌI /FEED BỊ LỖI -> KHÔNG ĐƯỢC ĐĂNG TIẾP! Dừng và yêu cầu can thiệp thủ công
    const errMsg = feedErr.response?.data?.error?.message || feedErr.message;
    console.error(`🚨 [Feed Check FAILED] Không thể kiểm tra /feed của Page ${pageId}: ${errMsg}. Dừng đăng để tránh trùng lặp!`);
    const err = new Error(`[CẦN CAN THIỆP THỦ CÔNG] Không thể xác minh bài viết trên Facebook Feed sau timeout: ${errMsg}`);
    err.isManualInterventionRequired = true;
    throw err;
  }

  // RULE 5: Lọc những bài trên Facebook được tạo SAU publishing_started_at
  const candidates = feedPosts.filter((fbPost) => {
    const createdMs = new Date(fbPost.created_time).getTime();
    if (createdMs < startedAtMs) return false;

    const fbMsgNorm = normalizePostText(fbPost.message);
    return fbMsgNorm === postContentNorm;
  });

  // RULE 6: Mơ hồ (khớp nhiều hơn 1 bài) -> Chuyển người xử lý, không được tự quyết!
  if (candidates.length > 1) {
    const err = new Error(`[CẦN CAN THIỆP THỦ CÔNG] Phát hiện ${candidates.length} bài viết mới khớp thời gian trên Fanpage. Hệ thống tạm dừng để tránh đăng trùng.`);
    err.isManualInterventionRequired = true;
    throw err;
  }

  if (candidates.length === 1) {
    const matched = candidates[0];
    console.warn(`🎯 [Duplicate Prevention] Xác nhận bài viết đã lên Facebook sau timeout (ID: ${matched.id}, đăng lúc: ${matched.created_time}).`);
    return { shouldProceed: false, existingFbId: matched.id, publishedAt: matched.created_time };
  }

  return { shouldProceed: true, existingFbId: null };
}

/**
 * Quét các bài viết bị kẹt ở trạng thái PUBLISHING quá 10 phút để giải cứu và đưa vào retry
 */
async function recoverStuckPublishingPosts() {
  const pool = await getPool();
  const isSqlite = process.env.USE_SQLITE === 'true';
  const res = await pool.request().query(`
    SELECT id, retry_count
    FROM ${isSqlite ? 'Posts' : 'dbo.Posts'}
    WHERE status = '${POST_STATES.PUBLISHING}'
      AND publishing_started_at IS NOT NULL
      AND ${isSqlite ? "(strftime('%s', 'now') - strftime('%s', publishing_started_at)) >= 600" : "DATEDIFF(minute, publishing_started_at, SYSUTCDATETIME()) >= 10"};
  `);

  const stuckPosts = res.recordset || [];
  for (const p of stuckPosts) {
    console.warn(`⚠️ [Stuck Rescue] Phát hiện bài #${p.id} bị kẹt PUBLISHING > 10 phút. Đang hoàn trả trạng thái...`);
    const newRetry = (p.retry_count || 0) + 1;
    await pool.request()
      .input('id', sql.Int, p.id)
      .input('newRetry', sql.Int, newRetry)
      .input('err', sql.NVarChar(sql.MAX), 'Quá thời gian thực thi (kẹt PUBLISHING > 10 phút)')
      .query(`
        UPDATE ${isSqlite ? 'Posts' : 'dbo.Posts'}
        SET status = '${POST_STATES.PUBLISH_RETRY_OR_FAILED}',
            retry_count = @newRetry,
            last_error = @err,
            next_retry_at = ${isSqlite ? "datetime('now')" : 'SYSUTCDATETIME()'}
        WHERE id = @id;
      `);

    try {
      await pool.request()
        .input('postId', sql.Int, p.id)
        .input('actor', sql.VarChar(100), 'system_rescue')
        .input('fromState', sql.VarChar(50), POST_STATES.PUBLISHING)
        .input('toState', sql.VarChar(50), POST_STATES.PUBLISH_RETRY_OR_FAILED)
        .input('reason', sql.NVarChar, 'Giải cứu bài kẹt PUBLISHING > 10 phút')
        .query(`INSERT INTO ${isSqlite ? 'PostAuditLog' : 'dbo.PostAuditLog'} (post_id, actor, from_state, to_state, reason, created_at)
                VALUES (@postId, @actor, @fromState, @toState, @reason, ${isSqlite ? "datetime('now')" : 'SYSUTCDATETIME()'});`);
    } catch (_) {}
  }
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

  // ── BƯỚC 1: KIỂM TRA TRẠNG THÁI ỨNG VIÊN XUẤT BẢN & ĐIỀU KIỆN RETRY ──
  // Chỉ chấp nhận các bài đang ở APPROVED, SCHEDULED hoặc PUBLISH_RETRY_OR_FAILED
  // Nếu bài đã PUBLISHED, NEW, BLOCKED, REJECTED, PENDING_REVIEW -> Tuyệt đối không can thiệp, không đổi trạng thái!
  const PUBLISH_CANDIDATE_STATES = [
    POST_STATES.APPROVED,
    POST_STATES.SCHEDULED,
    POST_STATES.PUBLISH_RETRY_OR_FAILED
  ];

  if (!PUBLISH_CANDIDATE_STATES.includes(post.status)) {
    console.log(`Bài #${postId} ở trạng thái "${post.status}", không thuộc nhóm được phép xuất bản (${PUBLISH_CANDIDATE_STATES.join(', ')}). Bỏ qua.`);
    return;
  }

  // Với bài đang ở trạng thái retry (PUBLISH_RETRY_OR_FAILED):
  // Bắt buộc kiểm tra 3 điều kiện: không phải lỗi vĩnh viễn, chưa vượt quá 5 lần retry, và đã đến hạn next_retry_at
  if (post.status === POST_STATES.PUBLISH_RETRY_OR_FAILED) {
    if (post.is_permanent_failure === 1 || post.is_permanent_failure === true) {
      console.log(`Bài #${postId} bị đánh dấu lỗi vĩnh viễn (is_permanent_failure = 1). Không thể retry.`);
      return;
    }
    if (Number(post.retry_count) >= 5) {
      console.log(`Bài #${postId} đã đạt ngưỡng tối đa 5 lần retry (retry_count = ${post.retry_count}). Không thể retry.`);
      return;
    }
    if (post.next_retry_at && new Date(post.next_retry_at).getTime() > Date.now()) {
      console.log(`Bài #${postId} chưa đến thời điểm retry (next_retry_at: ${post.next_retry_at}). Bỏ qua.`);
      return;
    }
  }

  // Với bài có lịch hẹn ở tương lai (chưa đến giờ đăng): BẮT BUỘC CHẶN XUẤT BẢN
  if (post.status !== POST_STATES.PUBLISH_RETRY_OR_FAILED && post.scheduled_at) {
    const schedMs = new Date(post.scheduled_at).getTime();
    if (schedMs > Date.now() + 30000) {
      console.log(`⏳ [PostExecutionService] Bài #${postId} có lịch đăng ở tương lai (${new Date(post.scheduled_at).toISOString()}). Chưa đến giờ xuất bản.`);
      return;
    }

    // ── CỬA SỔ TRỄ TỐI ĐA (MAX_SCHEDULE_DELAY_MINUTES) ──
    // Nếu máy ngủ/treo nhiều giờ khiến bài bị trễ quá lâu (ví dụ > 60 phút):
    // Tuyệt đối không tự ý đăng ồ ạt sai giờ vàng/hết hạn khuyến mãi. Chuyển PENDING_REVIEW & báo quản trị viên.
    const maxDelayMinutes = Number(process.env.MAX_SCHEDULE_DELAY_MINUTES) || 60;
    const delayMs = Date.now() - schedMs;
    if (delayMs > maxDelayMinutes * 60 * 1000) {
      const delayMins = Math.round(delayMs / 60000);
      const expireReason = `[SCHEDULE_EXPIRED_WINDOW] Bài viết #${postId} có lịch hẹn (${new Date(post.scheduled_at).toISOString()}) đã quá hạn ${delayMins} phút (vượt ngưỡng cho phép ${maxDelayMinutes} phút). Đã tạm dừng xuất bản và chuyển PENDING_REVIEW để người dùng xem xét lại giờ đăng.`;
      console.warn(`⏳🛑 ${expireReason}`);

      try {
        await transition(post, POST_STATES.PENDING_REVIEW, {
          actor: 'system',
          reason: expireReason,
          errorMessage: expireReason
        });
      } catch (transErr) {
        console.warn(`[Expire Transition Fallback]`, transErr.message);
        const isSqlite = process.env.USE_SQLITE === 'true';
        await pool.request()
          .input('id', sql.Int, postId)
          .input('err', sql.NVarChar(sql.MAX), expireReason)
          .query(`
            UPDATE ${isSqlite ? 'Posts' : 'dbo.Posts'}
            SET status = '${POST_STATES.PENDING_REVIEW}',
                approved_hash = NULL,
                approved_by = NULL,
                error_message = @err
            WHERE id = @id;
          `);
      }

      if (!post.alerted_at) {
        try {
          await telegramAlertService.notifyPostFailed({
            postId: post.id,
            pageName: post.page_id || 'Unknown',
            pageId: post.page_id,
            errorMessage: expireReason
          });
          const isSqlite = process.env.USE_SQLITE === 'true';
          await pool.request()
            .input('id', sql.Int, postId)
            .query(`UPDATE ${isSqlite ? 'Posts' : 'dbo.Posts'} SET alerted_at = ${isSqlite ? "datetime('now')" : "SYSUTCDATETIME()"} WHERE id = @id;`);
        } catch (_) {}
      }

      return;
    }
  }

  // ── CHẶN CỨNG BẢO VỆ: CHỈ CHO PHÉP XUẤT BẢN TRÊN CÁC FANPAGE TRONG WHITELIST ──
  const allowedPageIds = (process.env.ALLOWED_PAGE_IDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  const isProduction = process.env.NODE_ENV === 'production' || process.env.APP_ENV === 'production';
  const isMockTestPage = !isProduction && (
    String(post.page_id).startsWith('SYSTEM_TEST_') || 
    String(post.page_id).startsWith('page_') || 
    String(post.page_id).startsWith('tiktok_')
  );

  // Trong giai đoạn thử nghiệm: nếu ALLOWED_PAGE_IDS rỗng => TỪ CHỐI TẤT CẢ (Fail Closed)
  if (!isPageIdAllowed(post.page_id)) {
    const blockReason = allowedPageIds.length === 0
      ? `[FAIL_CLOSED] Biến ALLOWED_PAGE_IDS trong .env chưa cấu hình hoặc rỗng. Từ chối xuất bản bài #${postId} (Page: ${post.page_id}).`
      : `[PAGE_WHITELIST_BLOCKED] Page ID "${post.page_id}" của bài #${postId} nằm ngoài danh sách được phép đăng (${allowedPageIds.join(', ')}).`;

    console.warn(`🛑 ${blockReason}`);

    // Chuyển bài sang PENDING_REVIEW qua transition() để tước bỏ approved_hash & approved_by, ngăn poller lặp lại
    try {
      await transition(post, POST_STATES.PENDING_REVIEW, {
        actor: 'system',
        reason: blockReason,
        errorMessage: blockReason
      });
    } catch (transErr) {
      console.warn(`[Whitelist Transition Fallback] Lỗi transition(), thực hiện cập nhật DB trực tiếp:`, transErr.message);
      const isSqlite = process.env.USE_SQLITE === 'true';
      await pool.request()
        .input('id', sql.Int, postId)
        .input('err', sql.NVarChar(sql.MAX), blockReason)
        .query(`
          UPDATE ${isSqlite ? 'Posts' : 'dbo.Posts'}
          SET status = '${POST_STATES.PENDING_REVIEW}',
              approved_hash = NULL,
              approved_by = NULL,
              error_message = @err
          WHERE id = @id;
        `);
    }

    // Bắn thông báo Telegram MỘT LẦN DUY NHẤT (tránh spam khi quét lặp)
    if (!post.alerted_at) {
      try {
        await telegramAlertService.notifyPostFailed({
          postId: post.id,
          pageName: post.page_id || 'Unknown',
          pageId: post.page_id,
          errorMessage: blockReason
        });
        const isSqlite = process.env.USE_SQLITE === 'true';
        await pool.request()
          .input('id', sql.Int, postId)
          .query(`UPDATE ${isSqlite ? 'Posts' : 'dbo.Posts'} SET alerted_at = ${isSqlite ? "datetime('now')" : "SYSUTCDATETIME()"} WHERE id = @id;`);
      } catch (alertErr) {
        console.warn(`[Telegram Alert Error] Không thể gửi cảnh báo Telegram:`, alertErr.message);
      }
    }

    return;
  }

  // ── BƯỚC 2: CHỐT CHẶN DUYỆT & TOÀN VẸN HASH (assertPublishable) + CHỐNG LẶP POLLER ──
  // Kiểm tra cho TẤT CẢ nền tảng (cả Facebook lẫn TikTok) TRƯỚC KHI CLAIM VÀ TRƯỚC KHI RẼ NHÁNH
  // currentContentHash ĐƯỢC TÍNH MỚI TRỰC TIẾP TỪ NỘI DUNG (computePostHash), KHÔNG ĐỌC TỪ CỘT DB!
  let currentContentHash;
  try {
    const gateCheck = assertPublishable(post);
    currentContentHash = gateCheck.contentHash;
  } catch (gateErr) {
    console.warn(`🛑 [PostExecutionService] Bài #${postId} bị chặn xuất bản do vi phạm chốt chặn duyệt: ${gateErr.message}`);
    // Đẩy về PENDING_REVIEW qua transition() để xóa approved_hash & approved_by
    try {
      await transition(post, POST_STATES.PENDING_REVIEW, {
        actor: 'system',
        reason: gateErr.message,
        errorMessage: gateErr.message
      });
    } catch (transErr) {
      console.warn(`[Transition Error Fallback] Không thể chuyển qua transition(), kích hoạt DB fallback:`, transErr.message);
      // Fallback trực tiếp để đảm bảo bài rời khỏi APPROVED/SCHEDULED, poller 10s không bị lặp vô hạn
      const isSqlite = process.env.USE_SQLITE === 'true';
      await pool.request()
        .input('id', sql.Int, postId)
        .input('err', sql.NVarChar(sql.MAX), `[GATE CHECK FAILED & FALLBACK] ${gateErr.message}`)
        .query(`
          UPDATE ${isSqlite ? 'Posts' : 'dbo.Posts'}
          SET status = '${POST_STATES.PENDING_REVIEW}',
              approved_hash = NULL,
              approved_by = NULL,
              error_message = @err
          WHERE id = @id;
        `);

      // Ghi nhận audit log cho nhánh DB Fallback
      try {
        await pool.request()
          .input('postId', sql.Int, postId)
          .input('actor', sql.VarChar(100), 'system_fallback')
          .input('fromState', sql.VarChar(50), post.status)
          .input('toState', sql.VarChar(50), POST_STATES.PENDING_REVIEW)
          .input('reason', sql.NVarChar, `[DB FALLBACK] ${gateErr.message}`)
          .query(`INSERT INTO ${isSqlite ? 'PostAuditLog' : 'dbo.PostAuditLog'} (post_id, actor, from_state, to_state, reason, created_at)
                  VALUES (@postId, @actor, @fromState, @toState, @reason, ${isSqlite ? "datetime('now')" : 'SYSUTCDATETIME()'});`);
      } catch (_) {}
    }
    return;
  }

  // ── BƯỚC 3: ATOMIC CLAIM VÀO TRẠNG THÁI PUBLISHING ──
  // Kiểm tra nguyên tử: status hợp lệ, approved_hash IS NOT NULL và approved_hash = @currentHash
  // SQLite tách biệt UPDATE và SELECT riêng biệt để không lỗi batch multi-statement
  const isSqlite = process.env.USE_SQLITE === 'true';
  let claimSuccess = false;

  if (isSqlite) {
    await pool.request()
      .input('id', sql.Int, postId)
      .input('currentHash', sql.VarChar(64), currentContentHash)
      .query(`
        UPDATE Posts
        SET status = '${POST_STATES.PUBLISHING}',
            publishing_started_at = datetime('now')
        WHERE id = @id
          AND status IN ('${POST_STATES.APPROVED}', '${POST_STATES.SCHEDULED}', '${POST_STATES.PUBLISH_RETRY_OR_FAILED}')
          AND approved_hash IS NOT NULL
          AND approved_hash = @currentHash;
      `);

    const checkRes = await pool.request()
      .input('id', sql.Int, postId)
      .query(`SELECT id FROM Posts WHERE id = @id AND status = '${POST_STATES.PUBLISHING}';`);
    claimSuccess = Boolean(checkRes.recordset && checkRes.recordset.length > 0);
  } else {
    const claimResult = await pool.request()
      .input('id', sql.Int, postId)
      .input('currentHash', sql.VarChar(64), currentContentHash)
      .query(`
        UPDATE dbo.Posts
        SET status = '${POST_STATES.PUBLISHING}',
            publishing_started_at = SYSUTCDATETIME()
        OUTPUT INSERTED.id
        WHERE id = @id
          AND status IN ('${POST_STATES.APPROVED}', '${POST_STATES.SCHEDULED}', '${POST_STATES.PUBLISH_RETRY_OR_FAILED}')
          AND approved_hash IS NOT NULL
          AND approved_hash = @currentHash;
      `);
    claimSuccess = Boolean(claimResult.recordset && claimResult.recordset.length > 0);
  }

  if (!claimSuccess) {
    console.log(`Bài #${postId} không thể claim (đang xử lý bởi worker khác hoặc điều kiện không khớp). Bỏ qua.`);
    return;
  }

  // Ghi nhật ký PostAuditLog cho transition sang PUBLISHING
  try {
    await pool.request()
      .input('postId', sql.Int, postId)
      .input('actor', sql.VarChar(100), 'system')
      .input('fromState', sql.VarChar(50), post.status)
      .input('toState', sql.VarChar(50), POST_STATES.PUBLISHING)
      .input('reason', sql.NVarChar, 'Hệ thống claim bài thành công để bắt đầu xuất bản')
      .query(`INSERT INTO ${isSqlite ? 'PostAuditLog' : 'dbo.PostAuditLog'} (post_id, actor, from_state, to_state, reason, created_at)
              VALUES (@postId, @actor, @fromState, @toState, @reason, ${isSqlite ? "datetime('now')" : 'SYSUTCDATETIME()'});`);
  } catch (auditErr) {
    console.warn(`[AuditLog Warning] Bài #${postId}:`, auditErr.message);
  }

  // ── BƯỚC 4: KIỂM TRA FACTS HẾT HẠN (CHẠY SAU KHI ĐÃ CLAIM - TRIỆT TIÊU KHOẢNG HỞ TOCTOU) ──
  if (post.used_fact_ids) {
    let factIds = [];
    try {
      factIds = typeof post.used_fact_ids === 'string'
        ? JSON.parse(post.used_fact_ids)
        : post.used_fact_ids;
    } catch {
      factIds = String(post.used_fact_ids).split(',').map((id) => parseInt(id.trim(), 10)).filter(Boolean);
    }

    if (Array.isArray(factIds) && factIds.length > 0) {
      const expirationCheck = await kbFactsService.checkFactsExpiration(factIds);
      if (!expirationCheck.valid) {
        const expiredDesc = expirationCheck.expiredFacts
          .map((f) => `Fact #${f.id} (${f.factType}: "${f.content.slice(0, 30)}...") đã hết hạn`)
          .join('; ');
        const errorMsg = `[CHẶN XUẤT BẢN] Dữ kiện/Giá khuyến mãi trong bài đã hết hạn trước giờ đăng: ${expiredDesc}`;
        console.warn(`🛑 [PostExecutionService] Bài #${postId} bị chặn xuất bản do facts hết hạn!`);

        // Đẩy từ PUBLISHING về PENDING_REVIEW qua transition() để tước bỏ approved_hash & approved_by
        await transition({ ...post, status: POST_STATES.PUBLISHING }, POST_STATES.PENDING_REVIEW, {
          actor: 'system',
          reason: errorMsg,
          errorMessage: errorMsg
        });
        return;
      }
    }
  }

  // ── BƯỚC 5: ĐIỀU HƯỚNG NỀN TẢNG (CHỈ CHẠY KHI ĐÃ QUA TOÀN BỘ CỔNG DUYỆT, CLAIM VÀ FACTS CHECK) ──
  if (post.platform === 'tiktok') {
    const { executePublishTikTokPost } = require('./TikTokPuppeteerService');
    return executePublishTikTokPost(postId, { alreadyClaimed: true });
  }

  try {
    const pageId = post.page_id;
    let pageName = `Page ${pageId}`;

    let fbPostId = post.facebook_post_id || '';
    const isDryRunId = String(fbPostId).startsWith('dry_run_');
    const isFutureScheduled = post.scheduled_at && new Date(post.scheduled_at).getTime() > Date.now();

    // ── BƯỚC 6A: IDEMPOTENCY CHECK - BÀI ĐÃ CÓ FACEBOOK_POST_ID THẬT ──
    // Nếu bài viết đã có facebook_post_id thật (lần trước bị timeout mạng lúc nhận response,
    // hoặc bài đã được schedule thành công trên Facebook):
    // LỌC: Bỏ qua ID dry_run_ và bài hẹn giờ native chưa tới giờ!
    if (fbPostId && String(fbPostId).trim() && !isDryRunId && !isFutureScheduled) {
      console.log(`ℹ️ [FB IDEMPOTENCY] Bài #${postId} đã có facebook_post_id thật (${fbPostId}). Không gọi API tạo mới, chuyển thẳng sang PUBLISHED.`);
      await transition({ ...post, status: POST_STATES.PUBLISHING }, POST_STATES.PUBLISHED, {
        actor: 'system',
        facebookPostId: fbPostId,
        reason: 'Xuất bản thành công (Idempotent - post_id đã tồn tại trên Facebook)'
      });
      return;
    }

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

    // Cờ giả lập test lỗi mạng / token (phục vụ Page Test)
    const flagNetPath = path.resolve(__dirname, '../../temp_network_block.flag');
    if (nodeFs.existsSync(flagNetPath)) {
      const netErr = new Error('getaddrinfo ENOTFOUND graph.facebook.com');
      netErr.code = 'ENOTFOUND';
      throw netErr;
    }
    const flagTokenPath = path.resolve(__dirname, '../../temp_token_190.flag');
    if (nodeFs.existsSync(flagTokenPath)) {
      const oauthErr = new Error('Error validating access token: Session has expired.');
      oauthErr.response = {
        status: 400,
        data: {
          error: {
            message: 'Error validating access token: Session has expired.',
            type: 'OAuthException',
            code: 190,
            error_subcode: 463
          }
        }
      };
      throw oauthErr;
    }

    // ── BƯỚC 6B: FEED CHECK SAU TIMEOUT (QUAN TRỌNG: CA 2.2 ĐỐI SOÁT CHỐNG ĐĂNG ĐÚP) ──
    // Nếu bài bị lỗi timeout trước đó nhưng Facebook đã đăng thành công:
    // Quét /feed để tìm bài viết trùng nội dung được tạo sau publishing_started_at
    const feedCheck = await checkIfPostAlreadyPublishedOnFacebook({
      post,
      token: pageAccessToken,
      graphVersion
    });

    if (feedCheck.shouldProceed === false) {
      if (feedCheck.existingFbId) {
        console.warn(`🎯 [Feed Check Found] Bài #${postId} đã tồn tại trên Facebook sau timeout (ID: ${feedCheck.existingFbId}).`);
        fbPostId = feedCheck.existingFbId;
      } else {
        const err = new Error(`[CẦN CAN THIỆP THỦ CÔNG] Dừng đăng bài để tránh đăng trùng lặp: Không thể xác minh bài viết sau sự cố timeout.`);
        err.isManualInterventionRequired = true;
        throw err;
      }
    } else {
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
        if (mediaLinks.length === 0) {
          const err = new Error('Bài đăng ảnh chưa có đường dẫn media.');
          err.isInternalPermanent = true;
          throw err;
        }
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
        if (!mediaUrl) {
          const err = new Error('Bài đăng video chưa có đường dẫn media.');
          err.isInternalPermanent = true;
          throw err;
        }
        const response = await publishMedia({ pageId, mediaType: 'video', mediaLink: mediaUrl, content: post.content, token: pageAccessToken, graphVersion });
        fbPostId = response.data.id;
      } else if (post.media_type === 'reel') {
        const mediaUrl = mediaLinks[0];
        if (!mediaUrl) {
          const err = new Error('Bài đăng Reels chưa có đường dẫn video.');
          err.isInternalPermanent = true;
          throw err;
        }
        fbPostId = await publishReel({ pageId, mediaLink: mediaUrl, content: post.content, token: pageAccessToken, graphVersion });
      } else if (post.media_type === 'story') {
        const mediaUrl = mediaLinks[0];
        if (!mediaUrl) {
          const err = new Error('Bài đăng Tin (Story) chưa có hình ảnh hoặc video.');
          err.isInternalPermanent = true;
          throw err;
        }
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
    }

    console.log(`✅ [FB SUCCESS] Đăng bài thành công lên Facebook! ID: ${fbPostId}`);

    // ── BƯỚC 7: LƯU NGAY facebook_post_id VÀO DATABASE TRƯỚC MỌI VIỆC KHÁC! ──
    const isSqlite = process.env.USE_SQLITE === 'true';
    await pool.request()
      .input('id', sql.Int, postId)
      .input('fbId', sql.NVarChar(200), fbPostId)
      .query(`
        UPDATE ${isSqlite ? 'Posts' : 'dbo.Posts'}
        SET facebook_post_id = @fbId
        WHERE id = @id;
      `);

    await transition({ ...post, status: POST_STATES.PUBLISHING }, POST_STATES.PUBLISHED, {
      actor: 'system',
      facebookPostId: fbPostId,
      reason: 'Đăng bài thành công lên Facebook'
    });

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
    const httpStatus = err.response?.status;
    const fbError = err.response?.data?.error;
    const errorCode = fbError?.code;
    const errorSubcode = fbError?.error_subcode;
    const errorMsg = fbError?.message || err.message;

    // 1. Cờ lỗi nội bộ rõ ràng của hệ thống (bắt buộc dừng ngay, không retry):
    const isInternalError = Boolean(err.isInternalPermanent || err.isManualInterventionRequired);

    // 2. Mã lỗi vĩnh viễn đã xác định của Facebook Meta Graph API:
    // - Code 190: Access token expired/invalid/revoked
    // - Code 200..299: Toàn bộ khoảng lỗi bị cấm quyền (Permission errors)
    // - Code 100 kèm subcode 33: Đối tượng không tồn tại (Object does not exist)
    const isPermanentFbCode = Boolean(
      errorCode === 190 ||
      (errorCode >= 200 && errorCode <= 299) ||
      (errorCode === 100 && errorSubcode === 33)
    );

    // 3. Lỗi Client HTTP 4xx thuần không phải từ Graph API (hoặc không có mã lỗi FB hợp lệ):
    // HTTP 400..499 trừ 408 (Request Timeout) và 429 (Too Many Requests / Rate Limit)
    // đều là lỗi request sai, route 404, file quá tải 413 -> Dừng ngay, không retry vô ích!
    const isClientErrorWithoutRetry = Boolean(
      httpStatus >= 400 && httpStatus <= 499 &&
      httpStatus !== 408 && httpStatus !== 429 &&
      !errorCode
    );

    // 4. Phân loại dừng ngay vs retry:
    // - Lỗi vĩnh viễn: Lỗi nội bộ, mã vĩnh viễn FB, hoặc lỗi HTTP 4xx không phải timeout/rate limit.
    // - Lỗi tạm thời (được retry): Mã tạm thời FB (1, 2, 4, 17, 32, 613, 368), HTTP 408/429, HTTP 5xx (500, 502, 503, 504),
    //   timeout axios/socket (ECONNRESET, ETIMEDOUT, ECONNABORTED, ENOTFOUND, EAI_AGAIN), hoặc mã lạ chưa rõ nguyên nhân.
    const isPermanent = isInternalError || isPermanentFbCode || isClientErrorWithoutRetry;
    const isRetryable = !isPermanent;

    const isSqlite = process.env.USE_SQLITE === 'true';
    const countRes = await pool.request().input('id', sql.Int, postId).query(`SELECT retry_count, alerted_at FROM ${isSqlite ? 'Posts' : 'dbo.Posts'} WHERE id = @id`);
    const currentRetry = countRes.recordset[0]?.retry_count || 0;
    const alertedAt = countRes.recordset[0]?.alerted_at;
    const newRetry = currentRetry + 1;

    // Exponential Backoff:
    // Lỗi vĩnh viễn: 0
    // Lỗi tạm thời: lần 1: 1m, lần 2: 2m, lần 3: 5m, lần 4: 15m, lần 5: 0 (dừng tự động)
    const backoffMinutes = isPermanent ? 0 : (
      newRetry === 1 ? 1 :
      newRetry === 2 ? 2 :
      newRetry === 3 ? 5 :
      newRetry === 4 ? 15 : 0
    );

    // PHÂN BIỆT 2 TRẠNG THÁI DỪNG:
    // - isPermanent = 1: Lỗi vĩnh viễn thực sự (Token hỏng 190, cấm quyền 200..299, object not found, lỗi media/SSRF/file). Nút "Thử lại" không tự reset được.
    // - Chạm trần 5 lần: isPermanent = 0 (giữ nguyên là lỗi tạm thời), nhưng next_retry_at = NULL để poller dừng quét. Nút "Thử lại" reset được!
    const isPermanentFailureDb = isPermanent ? 1 : 0;
    const errCodeNum = Number.isInteger(Number(errorCode)) ? Number(errorCode) : null;
    const errSubcodeNum = Number.isInteger(Number(errorSubcode)) ? Number(errorSubcode) : null;

    console.error(`❌ [FB ERROR] Đăng bài #${postId} thất bại (${isPermanent ? 'Lỗi vĩnh viễn/Cần can thiệp (dừng retry)' : 'Lỗi tạm thời (có thể retry)'}, Code: ${errorCode || 'N/A'}, Subcode: ${errorSubcode || 'N/A'}): ${errorMsg}`);

    // BƯỚC 1: TRANSITION() SANG PUBLISH_RETRY_OR_FAILED ĐỂ GHI NHẬN AUDIT LOG CHUẨN
    try {
      await transition({ ...post, status: POST_STATES.PUBLISHING }, POST_STATES.PUBLISH_RETRY_OR_FAILED, {
        actor: 'system',
        reason: `Xuất bản thất bại: ${errorMsg}`.slice(0, 500),
        errorMessage: errorMsg
      });
    } catch (transErr) {
      console.warn(`[Retry Transition Warn] Không thể transition sang PUBLISH_RETRY_OR_FAILED: ${transErr.message}`);
    }

    // BƯỚC 2: CẬP NHẬT METADATA RETRY & LỖI VÀO DATABASE (KHÔNG CẦN CẬP NHẬT LẠI STATUS VÌ TRANSITION ĐÃ LÀM)
    await pool.request()
      .input('id', sql.Int, postId)
      .input('newRetry', sql.Int, newRetry)
      .input('errorMsg', sql.NVarChar(sql.MAX), errorMsg)
      .input('errCode', sql.Int, errCodeNum)
      .input('errSubcode', sql.Int, errSubcodeNum)
      .input('isPerm', sql.Int, isPermanentFailureDb)
      .input('backoffMinutes', sql.Int, backoffMinutes)
      .query(`
        UPDATE ${isSqlite ? 'Posts' : 'dbo.Posts'}
        SET retry_count = @newRetry,
            is_permanent_failure = @isPerm,
            last_error = @errorMsg,
            last_error_code = @errCode,
            last_error_subcode = @errSubcode,
            next_retry_at = ${isSqlite 
              ? "CASE WHEN @backoffMinutes > 0 THEN datetime('now', '+' || @backoffMinutes || ' minutes') ELSE NULL END"
              : "CASE WHEN @backoffMinutes > 0 THEN DATEADD(minute, @backoffMinutes, SYSUTCDATETIME()) ELSE NULL END"}
        WHERE id = @id;
      `);

    // Gửi cảnh báo Telegram DUY NHẤT 1 LẦN (Chống spam):
    // 1. Chỉ gửi khi: Lỗi vĩnh viễn (Token hỏng 190, Cần can thiệp thủ công) HOẶC chạm ngưỡng 5 lần thử thất bại HOẶC mã 100 dừng ở lần 2.
    // 2. Không gửi trên các lần retry tạm thời 1..4 (để Exponential Backoff tự xử lý).
    // 3. Sau khi gửi, set alerted_at ngay để các tick sau không bao giờ gửi lại.
    const shouldAlert = !alertedAt && (isPermanent || newRetry >= 5);
    if (shouldAlert) {
      console.warn(`🚨 [Telegram Alert Triggered] Gửi cảnh báo duy nhất 1 lần cho bài #${postId} (${isPermanent ? 'Lỗi vĩnh viễn/Tham số' : 'Retry lần ' + newRetry})...`);
      await pool.request().input('id', sql.Int, postId).query(`UPDATE ${isSqlite ? 'Posts' : 'dbo.Posts'} SET alerted_at = ${isSqlite ? "datetime('now')" : 'SYSUTCDATETIME()'} WHERE id = @id`);
      
      const alertPrefix = isPermanent 
        ? `🚨 [CẦN CAN THIỆP THỦ CÔNG / LỖI VĨNH VIỄN]`
        : `🚨 [ĐÃ RETRY ${newRetry} LẦN THẤT BẠI - DỪNG TỰ ĐỘNG]`;

      telegramAlertService.notifyPostFailed({
        postId,
        pageName: post?.page_id ? `Page ${post.page_id}` : 'Facebook Page',
        pageId: post?.page_id,
        errorMessage: `${alertPrefix}\n${errorMsg}`
      }).catch((tgErr) => console.warn('[Telegram Alert Error]', tgErr.message));
    }

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
    const errorCode = error.response?.data?.error?.code;
    const errorSubcode = error.response?.data?.error?.error_subcode;
    const httpStatus = error.response?.status;
    const isPermanent = Boolean(
      errorCode === 190 ||
      (errorCode >= 200 && errorCode <= 299) ||
      (errorCode === 100 && errorSubcode === 33) ||
      (httpStatus >= 400 && httpStatus <= 499 && httpStatus !== 408 && httpStatus !== 429 && !errorCode) ||
      error.isInternalPermanent
    );

    const isSqlite = process.env.USE_SQLITE === 'true';
    await pool.request()
      .input('id', sql.Int, commentId)
      .input('errMsg', sql.NVarChar(sql.MAX), errorMsg)
      .input('isPerm', sql.Bit, isPermanent ? 1 : 0)
      .query(`
        UPDATE ${isSqlite ? 'PostComments' : 'dbo.PostComments'} 
        SET status = 'failed', 
            error_message = @errMsg,
            is_permanent_failure = @isPerm
        WHERE id = @id;
      `);
    console.error(`❌ [Comment ERROR #${commentId}]`, errorMsg);
    throw error;
  }
}

module.exports = {
  executePublishPost,
  executePublishComment,
  normalizePostText,
  checkIfPostAlreadyPublishedOnFacebook,
  recoverStuckPublishingPosts,
  assertPublishable
};
