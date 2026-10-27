/**
 * tiktok.worker.js
 * ============================================================
 * BullMQ Worker xử lý hàng đợi upload TikTok.
 *
 * QUAN TRỌNG - Kiểm soát tải:
 *   - `concurrency` được đặt bằng TIKTOK_MAX_CONCURRENT_BROWSERS (mặc định: 2)
 *     → Worker chỉ xử lý tối đa N job CÙNG LÚC, phần còn lại tự động chờ
 *   - Rate limiting per account được xử lý bên trong job logic
 *   - Mỗi job thất bại sẽ được thử lại theo cấu hình trong tiktok.queue.js
 * ============================================================
 */

const { Worker } = require('bullmq');
const { redisConfig } = require('../config/db');
const { executePublishTikTokPost } = require('../src/utils/TikTokPuppeteerService');
const { MAX_CONCURRENT, ACCOUNT_RATE_LIMIT_MS } = require('./tiktok.queue');

// Map<accountId, lastUploadTimestamp> - Rate limiting giữa các lần upload cùng account
const accountLastUploadMap = new Map();

const tiktokWorker = new Worker(
  'tiktok-upload-queue',

  async (job) => {
    const { postId, tiktokAccountId } = job.data;
    const accountKey = String(tiktokAccountId);

    console.log(`\n🎬 [TikTok Worker] =============================================`);
    console.log(`🎬 [TikTok Worker] Nhận Job #${job.id} | Post #${postId} | Tài khoản #${tiktokAccountId}`);
    console.log(`🎬 [TikTok Worker] Lần thử: ${job.attemptsMade + 1}/${job.opts.attempts}`);

    // ── Rate Limiting: Đảm bảo cùng 1 tài khoản không upload quá nhanh ──
    const lastUpload = accountLastUploadMap.get(accountKey) || 0;
    const waitMs = Math.max(0, ACCOUNT_RATE_LIMIT_MS - (Date.now() - lastUpload));

    if (waitMs > 0) {
      console.log(`⏱️  [TikTok Worker] Tài khoản #${accountKey} cần chờ ${Math.ceil(waitMs / 1000)}s (rate limit bảo vệ TikTok không bị spam).`);
      await new Promise((r) => setTimeout(r, waitMs));
    }

    // Cập nhật thời gian upload của account này
    accountLastUploadMap.set(accountKey, Date.now());

    // Dọn dẹp cache rate limiting để tránh memory leak (giữ tối đa 500 account)
    if (accountLastUploadMap.size > 500) {
      const oldest = [...accountLastUploadMap.entries()].sort((a, b) => a[1] - b[1]);
      oldest.slice(0, 100).forEach(([key]) => accountLastUploadMap.delete(key));
    }

    // ── Thực thi upload ──────────────────────────────────────────────────
    await executePublishTikTokPost(postId);

    console.log(`🎬 [TikTok Worker] ✅ Job #${job.id} hoàn thành thành công!`);
  },

  {
    connection: redisConfig,
    // ★ ĐÂY LÀ CHÌA KHÓA CHỐNG QUÁ TẢI:
    //   Worker chỉ kéo và xử lý tối đa MAX_CONCURRENT job cùng lúc.
    //   BullMQ tự động giữ phần còn lại trong hàng đợi Redis.
    concurrency: MAX_CONCURRENT,

    // Giới hạn tốc độ lấy job từ Redis (tránh polling quá nhanh)
    limiter: {
      max: MAX_CONCURRENT * 2,  // Số job tối đa được xử lý trong khoảng thời gian duration
      duration: 10000            // Mỗi 10 giây
    }
  }
);

// ─── Event Listeners ────────────────────────────────────────────────────────

tiktokWorker.on('active', (job) => {
  console.log(`▶️  [TikTok Worker] Bắt đầu xử lý Job #${job.id} | Post #${job.data?.postId}`);
});

tiktokWorker.on('completed', (job) => {
  console.log(`✅  [TikTok Worker] Job #${job.id} | Post #${job.data?.postId} → HOÀN THÀNH`);
});

tiktokWorker.on('failed', (job, err) => {
  const retriesLeft = (job?.opts?.attempts || 1) - (job?.attemptsMade || 0) - 1;
  if (retriesLeft > 0) {
    console.warn(`⚠️  [TikTok Worker] Job #${job?.id} thất bại (còn ${retriesLeft} lần thử): ${err.message}`);
  } else {
    console.error(`💥  [TikTok Worker] Job #${job?.id} | Post #${job?.data?.postId} → THẤT BẠI CUỐI CÙNG: ${err.message}`);
  }
});

tiktokWorker.on('error', (err) => {
  console.error('[TikTok Worker] Lỗi Worker:', err.message);
});

tiktokWorker.on('stalled', (jobId) => {
  console.warn(`[TikTok Worker] ⚠️  Job #${jobId} bị stalled (worker chết giữa chừng?). BullMQ sẽ tự retry.`);
});

console.log(`\n🚀 [TikTok Worker] Đã khởi động!`);
console.log(`   • Concurrency tối đa : ${MAX_CONCURRENT} browser song song`);
console.log(`   • Rate limit/tài khoản: ${ACCOUNT_RATE_LIMIT_MS / 1000}s giữa các lần upload`);
console.log(`   • Queue              : tiktok-upload-queue`);
console.log(`   Các job vượt quá giới hạn sẽ TỰ ĐỘNG XẾP HÀNG CHỜ.\n`);

module.exports = tiktokWorker;
