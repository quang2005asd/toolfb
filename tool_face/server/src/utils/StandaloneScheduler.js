/**
 * StandaloneScheduler.js
 * Bộ đếm giờ độc lập chạy ngầm trực tiếp trong Node.js, KHÔNG CẦN REDIS HAY DOCKER.
 * 
 * Cơ chế:
 * 1. Tự động kiểm tra database mỗi 10 giây để tìm bài viết hoặc comment seeding đến giờ hẹn.
 * 2. Tự động chuyển đổi mượt mà: Nếu máy có Redis thì dùng BullMQ, nếu không có Redis thì tự động chạy bằng bộ đếm giờ ngầm này!
 */
const { sql, getPool } = require('../../config/db');
const { executePublishPost, executePublishComment } = require('./PostExecutionService');

let pollInterval = null;
let isPolling = false;
let redisAvailable = false;

// Dynamic import BullMQ queues nếu có Redis
let postQueueModule = null;
let commentQueueModule = null;

try {
  postQueueModule = require('../../queues/post.queue');
  commentQueueModule = require('../../queues/comment.queue');
} catch (_) {}

/**
 * Kiểm tra và xuất bản các bài viết đã đến giờ hẹn
 */
async function pollPendingPosts() {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT id, scheduled_at, status
      FROM Posts
      WHERE status IN ('pending', 'scheduled')
        AND (facebook_post_id IS NULL OR facebook_post_id = '')
        AND scheduled_at IS NOT NULL
        AND scheduled_at <= SYSUTCDATETIME()
      ORDER BY scheduled_at ASC;
    `);

    const duePosts = result.recordset || [];
    for (const post of duePosts) {
      console.log(`⏰ [StandaloneScheduler] Phát hiện bài viết #${post.id} đến giờ đăng. Đang xuất bản...`);
      executePublishPost(post.id).catch((err) => {
        console.error(`[StandaloneScheduler] Lỗi xuất bản bài #${post.id}:`, err.message);
      });
    }
  } catch (err) {
    // Tránh spam log khi DB đang khởi động
    if (!err.message?.includes('Failed to connect')) {
      console.warn('[StandaloneScheduler Post Poll Warning]', err.message);
    }
  }
}

/**
 * Kiểm tra và xuất bản các comment seeding đã đến giờ hẹn
 */
async function pollPendingComments() {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT c.id, c.delay_minutes, p.published_at, p.updated_at, p.created_at, p.status AS post_status
      FROM PostComments c
      INNER JOIN Posts p ON p.id = c.post_id
      WHERE c.status = 'pending'
        AND p.status = 'published'
      ORDER BY c.delay_minutes ASC, c.id ASC;
    `);

    const now = Date.now();
    const dueComments = (result.recordset || []).filter((comment) => {
      // QUAN TRỌNG: Độ trễ comment seeding tính từ lúc bài viết được xuất bản (published_at),
      // tuyệt đối không tính từ lúc tạo bản nháp/upload Excel (created_at).
      const pubTimeStr = comment.published_at || comment.updated_at;
      if (!pubTimeStr) return false;

      const pubTime = new Date(pubTimeStr).getTime();
      if (!Number.isFinite(pubTime)) return false;

      const delayMs = Math.max(0, (comment.delay_minutes || 0) * 60 * 1000);
      return (now - pubTime) >= delayMs;
    });

    for (const comment of dueComments) {
      console.log(`💬 [StandaloneScheduler] Phát hiện comment seeding #${comment.id} đến giờ đăng. Đang xuất bản...`);
      try {
        await executePublishComment(comment.id);
        // Nếu có nhiều comment cùng đến hạn, giãn cách 2.5s để tránh Facebook chặn spam
        if (dueComments.length > 1) {
          await new Promise((resolve) => setTimeout(resolve, 2500));
        }
      } catch (err) {
        console.error(`[StandaloneScheduler] Lỗi xuất bản comment #${comment.id}:`, err.message);
      }
    }
  } catch (err) {
    if (!err.message?.includes('Failed to connect')) {
      console.warn('[StandaloneScheduler Comment Poll Warning]', err.message);
    }
  }
}

/**
 * Vòng lặp quét database định kỳ
 */
async function tick() {
  if (isPolling) return;
  isPolling = true;
  try {
    await pollPendingPosts();
    await pollPendingComments();
  } finally {
    isPolling = false;
  }
}

/**
 * Bắt đầu bộ đếm giờ độc lập
 */
function startStandaloneScheduler(intervalMs = 10000) {
  if (pollInterval) return;
  console.log(`⏰ [StandaloneScheduler] Đã kích hoạt bộ đếm giờ ngầm độc lập (quét mỗi ${intervalMs / 1000}s, không cần Redis).`);
  
  // Quét ngay lần đầu sau 2 giây khi app đã sẵn sàng
  setTimeout(tick, 2000);
  
  pollInterval = setInterval(tick, intervalMs);
}

/**
 * Dừng bộ đếm giờ
 */
function stopStandaloneScheduler() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
    console.log('[StandaloneScheduler] Đã dừng bộ đếm giờ ngầm.');
  }
}

/**
 * Lên lịch đăng bài (Hỗ trợ cả Redis và Standalone)
 */
async function schedulePost(postId, scheduledAt) {
  const scheduledTime = new Date(scheduledAt).getTime();
  const delayMs = Math.max(0, scheduledTime - Date.now());

  // Nếu bài đăng ngay (< 30s), kích hoạt tức thì không cần chờ
  if (delayMs < 30000) {
    console.log(`⚡ [Scheduler] Bài #${postId} được đặt đăng ngay, bắt đầu xuất bản trực tiếp...`);
    setImmediate(() => {
      executePublishPost(postId).catch((e) => console.error(`[Immediate Publish Error #${postId}]`, e.message));
    });
    return;
  }

  // Thử dùng BullMQ nếu có Redis
  if (postQueueModule && postQueueModule.addPostToQueue && !process.env.FORCE_STANDALONE_SCHEDULER) {
    try {
      await Promise.race([
        postQueueModule.addPostToQueue(postId, scheduledAt),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Redis timeout')), 3000))
      ]);
      return;
    } catch (e) {
      console.warn(`[Scheduler] Không thể đưa vào Redis (${e.message}), chuyển sang bộ đếm giờ độc lập.`);
    }
  }

  console.log(`[StandaloneScheduler] Đã ghi nhận bài #${postId} vào lịch đăng (đăng lúc: ${new Date(scheduledAt).toLocaleString('vi-VN')}).`);
}

/**
 * Lên lịch comment seeding (Hỗ trợ cả Redis và Standalone)
 */
async function scheduleComment(commentId, delayMinutes) {
  if (delayMinutes === 0) {
    executePublishComment(commentId).catch((e) => console.error(`[Immediate Comment Error #${commentId}]`, e.message));
    return;
  }

  if (commentQueueModule && commentQueueModule.addCommentToQueue && !process.env.FORCE_STANDALONE_SCHEDULER) {
    try {
      await Promise.race([
        commentQueueModule.addCommentToQueue(commentId, delayMinutes),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Redis timeout')), 3000))
      ]);
      return;
    } catch (_) {}
  }

  console.log(`[StandaloneScheduler] Đã ghi nhận comment seeding #${commentId} vào lịch (sau ${delayMinutes} phút).`);
}

module.exports = {
  startStandaloneScheduler,
  stopStandaloneScheduler,
  schedulePost,
  scheduleComment,
  pollPendingPosts,
  pollPendingComments
};
