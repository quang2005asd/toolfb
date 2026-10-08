const { Worker } = require('bullmq');
const { redisConfig } = require('../config/db');
const { executePublishPost } = require('../src/utils/PostExecutionService');

const postWorker = new Worker(
  'post-publishing-queue',
  async (job) => {
    const { postId } = job.data;
    console.log(`🚀 [Job #${job.id}] Bắt đầu xử lý Post ID: ${postId}`);
    await executePublishPost(postId);
  },
  { connection: redisConfig }
);

postWorker.on('completed', (job) => {
  console.log(`🎉 [Job #${job.id}] Đã hoàn thành xử lý bài đăng!`);
});

postWorker.on('failed', (job, err) => {
  console.error(`💥 [Job #${job?.id}] Thất bại: ${err.message}`);
});

postWorker.on('error', (err) => {
  console.error('[Post Worker Error]', err.message);
});

console.log('Post Worker is listening for jobs on post-publishing-queue.');