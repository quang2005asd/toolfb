const axios = require('axios');
const { getSettings } = require('./SettingsService');

class TelegramAlertService {
  /**
   * Lấy cấu hình Telegram từ SystemSettings hoặc biến môi trường
   */
  async getConfig() {
    try {
      const settings = await getSettings();
      const botToken = String(settings.telegram_bot_token || process.env.TELEGRAM_BOT_TOKEN || '').trim();
      const chatId = String(settings.telegram_chat_id || process.env.TELEGRAM_CHAT_ID || '').trim();
      const enabled = settings.telegram_alert_enabled !== false && Boolean(botToken && chatId);
      const alertOnExpired = settings.telegram_alert_on_expired !== false;
      const alertOnFailed = settings.telegram_alert_on_failed !== false;

      return {
        botToken,
        chatId,
        enabled,
        alertOnExpired,
        alertOnFailed
      };
    } catch (err) {
      console.warn('[TelegramAlertService] Không đọc được config:', err.message);
      return {
        botToken: String(process.env.TELEGRAM_BOT_TOKEN || '').trim(),
        chatId: String(process.env.TELEGRAM_CHAT_ID || '').trim(),
        enabled: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
        alertOnExpired: true,
        alertOnFailed: true
      };
    }
  }

  /**
   * Gửi tin nhắn bất kỳ tới Telegram
   */
  async sendMessage(text, customToken = null, customChatId = null) {
    try {
      const config = await this.getConfig();
      const token = String(customToken || config.botToken || '').trim();
      const chatId = String(customChatId || config.chatId || '').trim();

      if (!token && !chatId) {
        return { success: false, message: 'Chưa cấu hình Telegram Bot Token và Chat ID.' };
      }
      if (!token) {
        return { success: false, message: 'Chưa có Telegram Bot Token. Vui lòng nhập Token từ @BotFather.' };
      }
      if (!chatId) {
        return { success: false, message: 'Bạn chưa nhập Telegram Chat ID! Vui lòng chat với bot @userinfobot để lấy ID của bạn rồi điền vào ô bên trên.' };
      }

      const url = `https://api.telegram.org/bot${token}/sendMessage`;
      const response = await axios.post(
        url,
        {
          chat_id: chatId,
          text,
          parse_mode: 'HTML',
          disable_web_page_preview: true
        },
        { timeout: 10000 }
      );

      if (response.data?.ok) {
        return { success: true, message: 'Đã gửi tin nhắn Telegram thành công!' };
      }
      return { success: false, message: response.data?.description || 'Lỗi gửi tin Telegram.' };
    } catch (error) {
      const detail = error.response?.data?.description || error.message;
      console.error('[TelegramAlertService Send Error]', detail);
      if (detail.includes("the bot can't send messages to the bot")) {
        return {
          success: false,
          message: 'Bạn đang nhập Chat ID là ID của chính con Bot! Bot không thể gửi tin nhắn cho chính nó. Chat ID phải là ID tài khoản cá nhân của bạn (chat với @userinfobot để lấy ID).'
        };
      }
      if (detail.includes('chat not found') || detail.includes('bot was blocked')) {
        return {
          success: false,
          message: 'Bot chưa thể gửi tin nhắn cho bạn. Vui lòng mở cuộc trò chuyện với Bot của bạn trên Telegram và bấm nút "START" (Bắt đầu) trước nhé.'
        };
      }
      return { success: false, message: `Lỗi Telegram: ${detail}` };
    }
  }

  /**
   * Gửi tin nhắn kiểm tra kết nối (Test message)
   */
  async testConnection(botToken, chatId) {
    const config = await this.getConfig();
    const token = String(botToken || config.botToken || '').trim();
    const targetChatId = String(chatId || config.chatId || '').trim();

    const timeStr = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
    const text = `🔔 <b>THÔNG BÁO TEST HỆ THỐNG AUTO FANPAGE</b>\n\n` +
      `✅ Kết nối Telegram Bot thành công!\n` +
      `⏰ Thời gian: <i>${timeStr}</i>\n` +
      `🚀 Hệ thống giám sát Token & Lịch đăng đã sẵn sàng gửi cảnh báo real-time tới bạn.`;

    return this.sendMessage(text, token, targetChatId);
  }

  /**
   * Cảnh báo Fanpage bị mất quyền hoặc hết hạn Token
   */
  async notifyTokenExpired({ pageName, pageId, fbAccountName, errorDetail }) {
    const config = await this.getConfig();
    if (!config.enabled || !config.alertOnExpired) return;

    const timeStr = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
    const text = `🚨 <b>CẢNH BÁO TOKEN FANPAGE HẾT HẠN!</b>\n\n` +
      `📌 <b>Fanpage:</b> ${pageName || 'Không tên'} (<code>${pageId}</code>)\n` +
      (fbAccountName ? `👤 <b>Nick FB sở hữu:</b> ${fbAccountName}\n` : '') +
      `⚠️ <b>Tình trạng:</b> Token bị thu hồi hoặc mất quyền đăng bài\n` +
      (errorDetail ? `🔍 <b>Chi tiết:</b> <i>${errorDetail}</i>\n` : '') +
      `⏰ <b>Thời điểm phát hiện:</b> ${timeStr}\n\n` +
      `👉 <i>Vui lòng vào mục "Quản lý kênh" trên tool để cập nhật lại Token để lịch đăng không bị gián đoạn!</i>`;

    return this.sendMessage(text);
  }

  /**
   * Cảnh báo bài đăng bị thất bại
   */
  async notifyPostFailed({ postId, pageName, pageId, errorMessage }) {
    const config = await this.getConfig();
    if (!config.enabled || !config.alertOnFailed) return;

    const timeStr = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
    const text = `⚠️ <b>LỖI XUẤT BẢN BÀI VIẾT FACEBOOK!</b>\n\n` +
      `📝 <b>Bài đăng:</b> #${postId}\n` +
      `📌 <b>Kênh:</b> ${pageName || pageId}\n` +
      `❌ <b>Nguyên nhân lỗi:</b>\n<code>${errorMessage || 'Lỗi không xác định'}</code>\n` +
      `⏰ <b>Thời gian:</b> ${timeStr}\n\n` +
      `👉 <i>Vui lòng kiểm tra lại nội dung, hình ảnh hoặc hạn ngạch tài khoản trên Facebook.</i>`;

    return this.sendMessage(text);
  }

  /**
   * Thông báo đăng bài thành công (tùy chọn)
   */
  async notifyPostSuccess({ postId, pageName, postUrl }) {
    const config = await this.getConfig();
    if (!config.enabled) return;

    const timeStr = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
    const text = `🎉 <b>BÀI VIẾT ĐÃ ĐĂNG THÀNH CÔNG!</b>\n\n` +
      `📝 <b>Bài đăng:</b> #${postId}\n` +
      `📌 <b>Fanpage:</b> ${pageName}\n` +
      `⏰ <b>Thời gian:</b> ${timeStr}\n` +
      (postUrl ? `🔗 <b>Link bài viết:</b> <a href="${postUrl}">Xem trên Facebook</a>\n` : '');

    return this.sendMessage(text);
  }
}

module.exports = new TelegramAlertService();
