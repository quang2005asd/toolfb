const isStandalone = process.env.DISABLE_REDIS === 'true';

let postQueue = null;
if (!isStandalone) {
  try {
    const { Queue } = require('bullmq');
    const { redisConfig } = require('../config/db');
    postQueue = new Queue('post-publishing-queue', { connection: redisConfig });
    postQueue.on('error', (error) => {
      console.error('[Post Queue Error]', error.message);
    });
  } catch (e) {
    console.warn('[Post Queue] Redis queue not initialized:', e.message);
  }
}

async function addPostToQueue(postId, scheduledAt) {
  if (isStandalone || !postQueue) return;
  const scheduledTime = new Date(scheduledAt).getTime();
  if (!Number.isFinite(scheduledTime)) {
    throw new Error('Thời gian đăng bài không hợp lệ.');
  }

  const jobId = `post-${postId}`;
  const currentJob = await postQueue.getJob(jobId);
  if (currentJob) {
    if (await currentJob.getState() === 'active') {
      throw new Error(`Bài đăng ${postId} đang được xử lý.`);
    }
    await currentJob.remove();
  }

  const delayMs = Math.max(0, scheduledTime - Date.now());

  await postQueue.add(
    'publish_main_post',
    { postId },
    { jobId, delay: delayMs, attempts: 1, removeOnComplete: true, removeOnFail: true }
  );

  console.log(`[Queue SQL] Đã lên lịch cho Bài đăng ID (INT): ${postId} sau ${Math.round(delayMs / 1000)}s`);
}

async function removePostFromQueue(postId) {
  if (isStandalone || !postQueue) return;
  const job = await postQueue.getJob(`post-${postId}`);
  if (!job) return;

  if (await job.getState() === 'active') {
    throw new Error(`Bài đăng ${postId} đang được xử lý và không thể xóa.`);
  }

  await job.remove();
}

module.exports = { postQueue, addPostToQueue, removePostFromQueue };