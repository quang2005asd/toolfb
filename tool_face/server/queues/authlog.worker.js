const { Worker } = require('bullmq');
const axios = require('axios');
const { redisConfig } = require('../config/db');

const webhookUrl = process.env.APPS_SCRIPT_URL;

const authLogWorker = new Worker(
  'auth-log',
  async (job) => {
    const payload = job.data;
    const targetUrl = process.env.APPS_SCRIPT_URL || webhookUrl;
    if (!targetUrl) {
      console.warn('[AuthLog Worker] APPS_SCRIPT_URL chưa được cấu hình.');
      return;
    }

    console.log(`🚀 [AuthLog Job #${job.id}] Đang gửi log: ${payload.type} | ${payload.username || payload.email || 'N/A'} | ${payload.result}`);

    const response = await axios.post(targetUrl, payload, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 15000,
      maxRedirects: 5
    });

    if (response.status !== 200 && response.status !== 302) {
      throw new Error(`Webhook Google Sheet trả về mã HTTP ${response.status}`);
    }

    return response.data;
  },
  {
    connection: redisConfig,
    concurrency: 5
  }
);

authLogWorker.on('completed', (job) => {
  console.log(`🎉 [AuthLog Job #${job.id}] Đã ghi log thành công vào Google Sheet!`);
});

authLogWorker.on('failed', (job, err) => {
  console.error(`💥 [AuthLog Job #${job?.id}] Thất bại (Lần ${job?.attemptsMade}/${job?.opts?.attempts || 3}): ${err.message}`);
});

authLogWorker.on('error', (err) => {
  console.error('[AuthLog Worker Error]', err.message);
});

console.log('AuthLog Worker is listening for jobs on auth-log queue.');

module.exports = authLogWorker;
