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

function isDueScheduledPost(scheduledAt, nowMs = Date.now()) {
  if (scheduledAt == null || scheduledAt === '') return false;
  const scheduledTime = new Date(scheduledAt).getTime();
  if (!Number.isFinite(scheduledTime)) return false;
  return scheduledTime <= nowMs;
}

let pollInterval = null;
let isPolling = false;
let redisAvailable = false;

// Dynamic import BullMQ queues chỉ khi bật cờ USE_REDIS
let postQueueModule = null;
let commentQueueModule = null;

if (process.env.USE_REDIS === 'true') {
  try {
    postQueueModule = require('../../queues/post.queue');
    commentQueueModule = require('../../queues/comment.queue');
  } catch (_) {}
}

/**
 * Kiểm tra và xuất bản các bài viết đã đến giờ hẹn
 */
async function pollPendingPosts() {
  try {
    const pool = await getPool();
    const isSqlite = process.env.USE_SQLITE === 'true';

    const allowedPageIds = (process.env.ALLOWED_PAGE_IDS || '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);

    const isProduction = process.env.NODE_ENV === 'production' || process.env.APP_ENV === 'production';

    // Chặn cứng ở câu lệnh SQL: Chỉ query các page_id trong ALLOWED_PAGE_IDS
    // Trong production: Tuyệt đối không cho phép mock prefix bypass; nếu biến rỗng -> 1 = 0 (từ chối 100%)
    let pageFilterSql = '';
    if (allowedPageIds.length > 0) {
      const inList = allowedPageIds.map((id) => `'${id.replace(/'/g, "''")}'`).join(', ');
      pageFilterSql = isProduction
        ? `AND page_id IN (${inList})`
        : `AND (page_id IN (${inList}) OR page_id LIKE 'SYSTEM_TEST_%' OR page_id LIKE 'page_%' OR page_id LIKE 'tiktok_%')`;
    } else {
      pageFilterSql = isProduction
        ? `AND 1 = 0`
        : `AND (page_id LIKE 'SYSTEM_TEST_%' OR page_id LIKE 'page_%' OR page_id LIKE 'tiktok_%')`;
    }

    const result = await pool.request().query(`
      SELECT id, scheduled_at, status, facebook_post_id, page_id
      FROM ${isSqlite ? 'Posts' : 'dbo.Posts'}
      WHERE (
        (status IN ('APPROVED', 'SCHEDULED')
         AND scheduled_at IS NOT NULL
         AND scheduled_at <= ${isSqlite ? "datetime('now')" : "SYSUTCDATETIME()"}
         AND approved_hash IS NOT NULL
         AND content_hash = approved_hash)
        OR
        (status = 'PUBLISH_RETRY_OR_FAILED'
         AND is_permanent_failure = 0
         AND retry_count < 5
         AND (next_retry_at IS NULL OR next_retry_at <= ${isSqlite ? "datetime('now')" : "SYSUTCDATETIME()"})
         AND content_hash IS NOT NULL
         AND approved_hash IS NOT NULL
         AND content_hash = approved_hash)
      )
      ${pageFilterSql}
      AND ${isSqlite ? "(facebook_post_id IS NULL OR SUBSTR(facebook_post_id, 1, 8) = 'dry_run_')" : "(facebook_post_id IS NULL OR LEFT(facebook_post_id, 8) = 'dry_run_')"}
      ORDER BY scheduled_at ASC;
    `);

    const nowMs = Date.now();
    const duePosts = (result.recordset || []).filter((post) => {
      const isMock = !isProduction && (
        String(post.page_id).startsWith('SYSTEM_TEST_') || 
        String(post.page_id).startsWith('page_') || 
        String(post.page_id).startsWith('tiktok_')
      );
      if (!isMock && (allowedPageIds.length === 0 || !allowedPageIds.includes(String(post.page_id)))) {
        return false;
      }
      if (post.status === 'PUBLISH_RETRY_OR_FAILED') return true;
      return isDueScheduledPost(post.scheduled_at, nowMs);
    });

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
        AND (p.status = 'PUBLISHED' OR p.status = 'published')
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

const fs = require('fs');
const path = require('path');
const telegramAlertService = require('./TelegramAlertService');

let lastTickTimestamp = Date.now();
const LOG_DIR = path.resolve(__dirname, '../../logs');
const HEARTBEAT_FILE = path.join(LOG_DIR, 'scheduler_heartbeat.json');
const LOG_FILE = path.join(LOG_DIR, 'scheduler.log');

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    try { fs.mkdirSync(LOG_DIR, { recursive: true }); } catch (_) {}
  }
}

function writeHeartbeat(gapDetectedMinutes = 0) {
  try {
    ensureLogDir();
    const data = {
      last_tick_at: new Date().toISOString(),
      timestamp_ms: Date.now(),
      gap_detected_minutes: gapDetectedMinutes,
      status: 'RUNNING'
    };
    fs.writeFileSync(HEARTBEAT_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (_) {}
}

function appendSchedulerLog(msg) {
  try {
    ensureLogDir();
    const line = `[${new Date().toISOString()}] ${msg}\n`;
    if (fs.existsSync(LOG_FILE)) {
      const stats = fs.statSync(LOG_FILE);
      if (stats.size > 5 * 1024 * 1024) { // > 5MB -> rotate
        const oldFile = `${LOG_FILE}.${Date.now()}.bak`;
        fs.renameSync(LOG_FILE, oldFile);
      }
    }
    fs.appendFileSync(LOG_FILE, line, 'utf8');
  } catch (_) {}
}

/**
 * Vòng lặp quét database định kỳ kèm theo dõi nhịp thở (Heartbeat)
 */
async function tick() {
  if (isPolling) {
    console.warn('[StandaloneScheduler] Chu kỳ quét trước chưa kết thúc, đang xử lý...');
    return;
  }

  const now = Date.now();
  const timeSinceLastTick = now - lastTickTimestamp;

  // Phát hiện gián đoạn nhịp poller (máy tính sleep, hibernate hoặc CPU bị đóng băng > 2 phút):
  if (lastTickTimestamp && timeSinceLastTick > 120000) {
    const gapMinutes = Math.round(timeSinceLastTick / 60000);
    const gapMsg = `⚠️ [SCHEDULER_HEARTBEAT_GAP] Phát hiện gián đoạn nhịp Poller kéo dài ~${gapMinutes} phút (có thể do máy tính Sleep hoặc mất kết nối)!`;
    console.warn(gapMsg);
    appendSchedulerLog(gapMsg);
    telegramAlertService.notifyPostFailed({
      postId: 0,
      pageName: 'Scheduler Heartbeat Monitor',
      pageId: 'SYSTEM',
      errorMessage: gapMsg
    }).catch(() => {});
  }

  isPolling = true;
  try {
    await pollPendingPosts();
    await pollPendingComments();

    // QUAN TRỌNG: CHỈ GHI NHẬP THỞ (HEARTBEAT) Ở CUỐI MỖI LẦN QUÉT THÀNH CÔNG!
    // Tránh trường hợp vòng lặp treo/deadlock nhưng file heartbeat vẫn cập nhật giả tạo.
    writeHeartbeat(0);
    lastTickTimestamp = Date.now();
  } catch (err) {
    console.error('[StandaloneScheduler Loop Error]', err.message);
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
  appendSchedulerLog(`[START] Scheduler khởi động với chu kỳ ${intervalMs / 1000}s.`);
  
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
    appendSchedulerLog('[STOP] Scheduler đã dừng.');
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
  isDueScheduledPost,
  startStandaloneScheduler,
  stopStandaloneScheduler,
  schedulePost,
  scheduleComment,
  pollPendingPosts,
  pollPendingComments
};

if (require.main === module) {
  console.log('🚀 [StandaloneScheduler] Khởi động Poller ngầm độc lập...');
  startStandaloneScheduler(10000);
}
