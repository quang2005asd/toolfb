/**
 * tiktok.queue.js
 * ============================================================
 * Hàng đợi BullMQ dành riêng cho upload TikTok (Puppeteer).
 *
 * VẤN ĐỀ CẦN GIẢI QUYẾT:
 *   Mỗi lần upload TikTok phải khởi động 1 browser Chromium thông qua
 *   Puppeteer, tốn ~300-500 MB RAM và nhiều CPU. Nếu 10-20 người upload
 *   cùng lúc → server bị quá tải ngay lập tức.
 *
 * GIẢI PHÁP: Upload Queue với giới hạn đồng thời (Concurrency Limit)
 *   - Tối đa TIKTOK_MAX_CONCURRENT_BROWSERS browser chạy cùng lúc (mặc định: 2)
 *   - Các job còn lại xếp hàng chờ, KHÔNG bị từ chối – chỉ chờ đến lượt
 *   - Mỗi tài khoản TikTok được giới hạn tốc độ riêng (rate limit per account)
 *     để tránh TikTok phát hiện hành vi bất thường
 *   - Job thất bại được thử lại tối đa 2 lần với độ trễ tăng dần (exponential backoff)
 *
 * ENV:
 *   TIKTOK_MAX_CONCURRENT_BROWSERS  - số browser chạy song song (mặc định: 2)
 *   TIKTOK_ACCOUNT_RATE_LIMIT_MS    - khoảng cách tối thiểu (ms) giữa 2 lần upload
 *                                     từ cùng 1 tài khoản (mặc định: 60000 = 1 phút)
 *   DISABLE_REDIS                   - nếu 'true', fallback sang InMemoryQueue
 * ============================================================
 */

const isStandalone = process.env.DISABLE_REDIS === 'true';

// ─── Giới hạn tài nguyên ────────────────────────────────────────────────────
const MAX_CONCURRENT = parseInt(process.env.TIKTOK_MAX_CONCURRENT_BROWSERS || '2', 10);
const ACCOUNT_RATE_LIMIT_MS = parseInt(process.env.TIKTOK_ACCOUNT_RATE_LIMIT_MS || '60000', 10);

// ─── BullMQ Queue (chế độ đầy đủ với Redis) ────────────────────────────────
let tiktokQueue = null;

if (!isStandalone) {
  try {
    const { Queue } = require('bullmq');
    const { redisConfig } = require('../config/db');

    tiktokQueue = new Queue('tiktok-upload-queue', {
      connection: redisConfig,
      defaultJobOptions: {
        // Thử lại tối đa 2 lần nếu thất bại (Puppeteer có thể gặp lỗi mạng tạm thời)
        attempts: 2,
        backoff: {
          type: 'exponential',
          delay: 30000 // 30s → 60s
        },
        removeOnComplete: { count: 50 }, // Giữ 50 job gần nhất để debug
        removeOnFail: { count: 100 }
      }
    });

    tiktokQueue.on('error', (error) => {
      console.error('[TikTok Queue Error]', error.message);
    });

    console.log(`[TikTok Queue] Khởi tạo thành công. Tối đa ${MAX_CONCURRENT} browser song song.`);
  } catch (e) {
    console.warn('[TikTok Queue] Không thể khởi tạo Redis queue:', e.message);
  }
}

// ─── InMemory fallback (chế độ standalone không có Redis) ──────────────────
/**
 * Hàng đợi in-memory đơn giản với giới hạn concurrency.
 * Dùng khi DISABLE_REDIS=true hoặc Redis không khả dụng.
 */
class InMemoryTikTokQueue {
  constructor(maxConcurrent) {
    this._queue = [];         // Danh sách job đang chờ
    this._running = 0;        // Số job đang chạy
    this._maxConcurrent = maxConcurrent;
    this._accountLastUpload = new Map(); // Map<accountId, timestamp> – rate limiting
  }

  /**
   * Thêm job vào hàng đợi
   * @param {number} postId
   * @param {number} tiktokAccountId
   * @returns {Promise<{queued: boolean, position: number}>}
   */
  add(postId, tiktokAccountId) {
    return new Promise((resolve, reject) => {
      const position = this._queue.length + 1;
      this._queue.push({ postId, tiktokAccountId, resolve, reject, addedAt: Date.now() });
      console.log(`[TikTok InMemory Queue] Post #${postId} được xếp hàng. Vị trí: ${position}. Đang chạy: ${this._running}/${this._maxConcurrent}`);
      this._tick();
      resolve({ queued: true, position });
    });
  }

  /** Lên lịch chạy job tiếp theo nếu còn slot */
  _tick() {
    if (this._running >= this._maxConcurrent || this._queue.length === 0) return;

    const job = this._queue.shift();
    if (!job) return;

    // Rate limiting per account
    const accountId = String(job.tiktokAccountId);
    const lastUpload = this._accountLastUpload.get(accountId) || 0;
    const waitMs = Math.max(0, ACCOUNT_RATE_LIMIT_MS - (Date.now() - lastUpload));

    if (waitMs > 0) {
      console.log(`[TikTok Queue] Tài khoản #${accountId} cần chờ thêm ${Math.ceil(waitMs / 1000)}s (rate limit).`);
      // Đưa job trở lại đầu hàng đợi và lên lịch chạy lại sau
      this._queue.unshift(job);
      setTimeout(() => this._tick(), waitMs + 100);
      return;
    }

    this._running++;
    this._accountLastUpload.set(accountId, Date.now());
    console.log(`[TikTok Queue] 🚀 Bắt đầu xử lý Post #${job.postId}. Slot đang dùng: ${this._running}/${this._maxConcurrent}`);

    // Lazy require để tránh circular dependency
    const { executePublishTikTokPost } = require('../src/utils/TikTokPuppeteerService');
    executePublishTikTokPost(job.postId)
      .then(() => {
        console.log(`[TikTok Queue] ✅ Post #${job.postId} hoàn thành.`);
      })
      .catch((err) => {
        console.error(`[TikTok Queue] ❌ Post #${job.postId} thất bại:`, err.message);
      })
      .finally(() => {
        this._running--;
        console.log(`[TikTok Queue] Slot giải phóng. Còn chạy: ${this._running}/${this._maxConcurrent}. Hàng chờ: ${this._queue.length}`);
        this._tick(); // Kích hoạt job tiếp theo
      });
  }

  /** Trả về thống kê hiện tại */
  getStats() {
    return {
      running: this._running,
      maxConcurrent: this._maxConcurrent,
      queued: this._queue.length,
      accountRateLimitMs: ACCOUNT_RATE_LIMIT_MS
    };
  }
}

const inMemoryQueue = new InMemoryTikTokQueue(MAX_CONCURRENT);

// ─── API công khai ──────────────────────────────────────────────────────────

/**
 * Thêm job upload TikTok vào hàng đợi.
 * Nếu có Redis → dùng BullMQ. Nếu không → InMemoryQueue.
 *
 * @param {number} postId         - ID bài đăng trong DB
 * @param {number} tiktokAccountId - ID tài khoản TikTok
 * @returns {Promise<{jobId?: string, queued: boolean, position?: number}>}
 */
async function addTikTokUploadToQueue(postId, tiktokAccountId) {
  if (!isStandalone && tiktokQueue) {
    // BullMQ path: Worker sẽ tự xử lý concurrency limit
    const jobId = `tiktok-post-${postId}`;

    // Kiểm tra job đã tồn tại chưa (tránh duplicate)
    const existingJob = await tiktokQueue.getJob(jobId);
    if (existingJob) {
      const state = await existingJob.getState();
      if (state === 'active' || state === 'waiting' || state === 'delayed') {
        console.log(`[TikTok Queue] Job #${jobId} đã tồn tại (trạng thái: ${state}). Bỏ qua.`);
        return { jobId, queued: false, state };
      }
      await existingJob.remove().catch(() => {});
    }

    const job = await tiktokQueue.add(
      'upload_tiktok_video',
      { postId, tiktokAccountId },
      { jobId }
    );

    const waiting = await tiktokQueue.getWaitingCount();
    console.log(`[TikTok Queue] Post #${postId} đã vào hàng BullMQ. Job ID: ${job.id}. Đang chờ: ${waiting}`);
    return { jobId: job.id, queued: true };
  }

  // InMemory fallback
  return inMemoryQueue.add(postId, tiktokAccountId);
}

/**
 * Lấy thống kê hàng đợi TikTok (dùng cho monitoring)
 * @returns {Promise<object>}
 */
async function getTikTokQueueStats() {
  if (!isStandalone && tiktokQueue) {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      tiktokQueue.getWaitingCount(),
      tiktokQueue.getActiveCount(),
      tiktokQueue.getCompletedCount(),
      tiktokQueue.getFailedCount(),
      tiktokQueue.getDelayedCount()
    ]);
    return {
      mode: 'bullmq',
      maxConcurrent: MAX_CONCURRENT,
      accountRateLimitMs: ACCOUNT_RATE_LIMIT_MS,
      waiting,
      active,
      completed,
      failed,
      delayed
    };
  }

  return {
    mode: 'in-memory',
    ...inMemoryQueue.getStats()
  };
}

module.exports = {
  tiktokQueue,
  addTikTokUploadToQueue,
  getTikTokQueueStats,
  MAX_CONCURRENT,
  ACCOUNT_RATE_LIMIT_MS
};
