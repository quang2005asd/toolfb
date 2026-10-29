const { Worker } = require('bullmq');
const { redisConfig } = require('../config/db');
const { executePublishComment } = require('../src/utils/PostExecutionService');

const commentWorker = new Worker(
  'comment-seeding-queue',
  async (job) => {
    const { commentId } = job.data;
    await executePublishComment(commentId);
  },
  { connection: redisConfig }
);

commentWorker.on('error', (error) => {
  console.error('[Comment Worker Error]', error.message);
});

console.log('Comment worker is listening for scheduled comments.');