const isStandalone = process.env.USE_SQLITE === 'true' || process.env.DISABLE_REDIS === 'true';

let commentQueue = null;
if (!isStandalone) {
  try {
    const { Queue } = require('bullmq');
    const { redisConfig } = require('../config/db');
    commentQueue = new Queue('comment-seeding-queue', { connection: redisConfig });
    commentQueue.on('error', (error) => {
      console.error('[Comment Queue Error]', error.message);
    });
  } catch (e) {
    console.warn('[Comment Queue] Redis queue not initialized:', e.message);
  }
}

/**
 * Đẩy Sub-Job Auto Comment vào Queue đếm ngược
 */
async function addCommentToQueue(commentId, delayMinutes) {
  if (isStandalone || !commentQueue) return;
  const delayMs = Math.max(0, delayMinutes * 60 * 1000);

  await commentQueue.add(
    'publish_comment_job',
    { commentId },
    { jobId: `comment-${commentId}`, delay: delayMs, removeOnComplete: true }
  );

  console.log(`[Queue Comment] Đã lên lịch Auto Comment ID: ${commentId} sau ${delayMinutes} phút`);
}

module.exports = { commentQueue, addCommentToQueue };