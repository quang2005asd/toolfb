/**
 * Combined Worker Runner for Docker & Background Processing
 * Runs post publishing worker, comment seeding worker, and TikTok upload worker
 *
 * TikTok Upload Worker:
 *   - Giới hạn tối đa TIKTOK_MAX_CONCURRENT_BROWSERS browser Chromium/Puppeteer chạy cùng lúc
 *   - Khi nhiều người upload cùng lúc, các job sẽ xếp hàng chờ thay vì làm quá tải server
 *   - Cấu hình qua ENV: TIKTOK_MAX_CONCURRENT_BROWSERS (mặc định: 2), TIKTOK_ACCOUNT_RATE_LIMIT_MS (mặc định: 60000)
 */
require('./post.worker');
require('./comment.worker');

// TikTok Upload Worker: chỉ khởi động nếu Redis khả dụng (không chạy trong standalone mode)
const isStandalone = process.env.DISABLE_REDIS === 'true';
if (!isStandalone) {
  require('./tiktok.worker');
} else {
  console.log('[Workers] DISABLE_REDIS=true → TikTok BullMQ Worker bị bỏ qua. Sẽ dùng InMemoryQueue khi có request.');
}

console.log('🚀 [Workers] All background workers (Post, Comment Seeding, TikTok Upload) are active and listening.');
