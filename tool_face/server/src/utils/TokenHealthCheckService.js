const axios = require('axios');
const { sql, getPool } = require('../../config/db');
const { getFacebookPageAccessToken } = require('./FacebookPageAccessToken');
const telegramAlertService = require('./TelegramAlertService');
const { getSettings } = require('./SettingsService');

class TokenHealthCheckService {
  constructor() {
    this.timer = null;
    this.isRunning = false;
  }

  /**
   * Chạy quét sức khỏe toàn bộ Token Fanpage trong hệ thống
   */
  async runHealthCheck(triggerSource = 'manual') {
    if (this.isRunning) {
      return { success: false, message: 'Đang có một tiến trình quét token đang chạy dở.' };
    }
    this.isRunning = true;
    console.log(`🩺 [HealthCheck] Bắt đầu quét kiểm tra sức khỏe Token (${triggerSource})...`);

    const results = {
      timestamp: new Date().toISOString(),
      total: 0,
      valid: 0,
      expired: 0,
      pages: []
    };

    try {
      const pool = await getPool();
      await pool.request().query(`
        IF COL_LENGTH('dbo.FacebookPages', 'is_valid') IS NULL
        BEGIN
          ALTER TABLE dbo.FacebookPages ADD is_valid bit NULL;
        END;
      `).catch(() => {});

      const pagesRes = await pool.request().query(`
        SELECT page_id, page_name AS name, fb_account_id, fb_account_name, is_valid
        FROM dbo.FacebookPages
      `);
      const rawPages = pagesRes.recordset || [];
      const seenPageIds = new Set();
      const pages = [];
      for (const p of rawPages) {
        if (!seenPageIds.has(String(p.page_id))) {
          seenPageIds.add(String(p.page_id));
          pages.push(p);
        }
      }
      results.total = pages.length;

      const graphVersion = process.env.FB_GRAPH_VERSION || 'v19.0';
      const newlyExpiredPages = [];

      for (const page of pages) {
        let isValid = true;
        let errorDetail = null;

        try {
          const token = await getFacebookPageAccessToken(page.page_id);
          // Gọi API thử nghiệm quyền quản lý Page
          await axios.get(`https://graph.facebook.com/${graphVersion}/${page.page_id}`, {
            params: { fields: 'id,name', access_token: token },
            timeout: 8000
          });
        } catch (err) {
          isValid = false;
          const fbErr = err.response?.data?.error;
          errorDetail = fbErr?.message || err.message || 'Lỗi xác thực Token Facebook.';
        }

        if (isValid) {
          results.valid += 1;
        } else {
          results.expired += 1;
          newlyExpiredPages.push({
            pageId: page.page_id,
            pageName: page.name,
            fbAccountName: page.fb_account_name,
            errorDetail
          });
        }

        // Cập nhật trạng thái vào DB nếu có thay đổi
        try {
          await pool.request()
            .input('pageId', sql.VarChar(64), String(page.page_id))
            .input('isValid', sql.Bit, isValid ? 1 : 0)
            .query('UPDATE dbo.FacebookPages SET is_valid = @isValid WHERE page_id = @pageId');
        } catch (dbErr) {
          console.warn('[HealthCheck DB Update Warning]', dbErr.message);
        }

        results.pages.push({
          pageId: page.page_id,
          name: page.name,
          isValid,
          error: errorDetail
        });
      }

      console.log(`🩺 [HealthCheck Hoàn tất] ${results.valid}/${results.total} Pages hợp lệ, ${results.expired} Pages bị lỗi.`);

      // Gửi cảnh báo Telegram cho từng Page bị mất token nếu có
      if (newlyExpiredPages.length > 0) {
        for (const item of newlyExpiredPages) {
          try {
            await telegramAlertService.notifyTokenExpired({
              pageName: item.pageName,
              pageId: item.pageId,
              fbAccountName: item.fbAccountName,
              errorDetail: item.errorDetail
            });
          } catch (tgErr) {
            console.error('[HealthCheck Telegram Alert Error]', tgErr.message);
          }
        }
      }

      return {
        success: true,
        summary: results
      };
    } catch (globalErr) {
      console.error('[HealthCheck Fatal Error]', globalErr);
      return { success: false, message: globalErr.message };
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Bật lịch quét tự động định kỳ ngầm
   */
  startScheduler(intervalHours = 6) {
    if (this.timer) {
      clearInterval(this.timer);
    }

    const intervalMs = Math.max(1, intervalHours) * 60 * 60 * 1000;
    console.log(`⏱️ [Token HealthCheck Scheduler] Đã khởi động, chu kỳ quét: mỗi ${intervalHours} giờ.`);

    // Quét lần đầu sau 2 phút khởi động
    setTimeout(() => {
      this.runHealthCheck('scheduler_startup');
    }, 2 * 60 * 1000);

    // Chạy lặp lại theo chu kỳ
    this.timer = setInterval(() => {
      this.runHealthCheck('scheduler_recurring');
    }, intervalMs);
  }

  stopScheduler() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log('⏱️ [Token HealthCheck Scheduler] Đã tạm dừng.');
    }
  }
}

module.exports = new TokenHealthCheckService();
