/**
 * SchedulerWatchdog.js
 * Tiến trình giám sát ĐỘC LẬP ngoài Poller.
 * Kiểm tra file logs/scheduler_heartbeat.json: Nếu nhịp tim cũ hơn 2 phút hoặc tiến trình Poller chết hẳn:
 * Bắn thông báo khẩn cấp lên Telegram MỘT LẦN DUY NHẤT (không spam).
 * Khi Poller sống lại: Tự động reset cờ cảnh báo.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const telegramAlertService = require('./TelegramAlertService');

const LOG_DIR = path.resolve(__dirname, '../../logs');
const HEARTBEAT_FILE = path.join(LOG_DIR, 'scheduler_heartbeat.json');
const WATCHDOG_STATE_FILE = path.join(LOG_DIR, 'watchdog_state.json');

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    try { fs.mkdirSync(LOG_DIR, { recursive: true }); } catch (_) {}
  }
}

function getWatchdogState() {
  try {
    if (fs.existsSync(WATCHDOG_STATE_FILE)) {
      return JSON.parse(fs.readFileSync(WATCHDOG_STATE_FILE, 'utf8'));
    }
  } catch (_) {}
  return { alert_sent: false, last_alert_time: null };
}

function saveWatchdogState(state) {
  try {
    ensureLogDir();
    fs.writeFileSync(WATCHDOG_STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (_) {}
}

async function checkHeartbeat() {
  const now = Date.now();
  let heartbeat = null;

  if (fs.existsSync(HEARTBEAT_FILE)) {
    try {
      heartbeat = JSON.parse(fs.readFileSync(HEARTBEAT_FILE, 'utf8'));
    } catch (_) {}
  }

  const state = getWatchdogState();
  const timeSinceLastHeartbeat = heartbeat && heartbeat.timestamp_ms ? (now - heartbeat.timestamp_ms) : Infinity;
  const isDead = timeSinceLastHeartbeat > 120000; // > 2 phút

  if (isDead) {
    const gapMinutes = Number.isFinite(timeSinceLastHeartbeat) 
      ? Math.round(timeSinceLastHeartbeat / 60000) 
      : 'Không xác định';

    if (!state.alert_sent) {
      const alertMsg = `🚨 [SCHEDULER_PROCESS_DEAD] CẢNH BÁO KHẨN: Tiến trình Poller đã DỪNG HOẠT ĐỘNG hoặc BỊ TẮT HOÀN TOÀN!\n- Không nhận được heartbeat trong ~${gapMinutes} phút.\n- Lần tick cuối: ${heartbeat?.last_tick_at || 'Chưa từng ghi nhận'}\n- Vui lòng kiểm tra lại tiến trình Node.js trên máy!`;
      console.error(alertMsg);

      try {
        await telegramAlertService.notifyPostFailed({
          postId: 0,
          pageName: 'WATCHDOG ĐỘC LẬP',
          pageId: 'SYSTEM_WATCHDOG',
          errorMessage: alertMsg
        });
      } catch (err) {
        console.error('[Watchdog Alert Send Error]', err.message);
      }

      state.alert_sent = true;
      state.last_alert_time = new Date().toISOString();
      state.gap_minutes = gapMinutes;
      saveWatchdogState(state);
    }
  } else {
    // Poller đang sống khỏe mạnh: nếu trước đó đã từng báo chết thì reset cờ
    if (state.alert_sent) {
      console.log('✅ [Watchdog] Poller đã hoạt động trở lại bình thường. Reset cờ cảnh báo.');
      try {
        await telegramAlertService.notifyPostFailed({
          postId: 0,
          pageName: 'WATCHDOG ĐỘC LẬP',
          pageId: 'SYSTEM_WATCHDOG',
          errorMessage: '✅ [SCHEDULER_RECOVERED] Tiến trình Poller đã hoạt động trở lại bình thường.'
        });
      } catch (_) {}
      state.alert_sent = false;
      state.recovered_at = new Date().toISOString();
      saveWatchdogState(state);
    }
  }
}

// Nếu chạy với tham số --once (ví dụ từ Windows Task Scheduler định kỳ 2 phút)
if (process.argv.includes('--once')) {
  checkHeartbeat().then(() => process.exit(0)).catch(() => process.exit(1));
} else {
  // Chạy độc lập dưới dạng daemon tuần tra mỗi 30 giây
  console.log('🛡️ [SchedulerWatchdog] Khởi động tiến trình giám sát độc lập (kiểm tra mỗi 30s)...');
  checkHeartbeat();
  setInterval(checkHeartbeat, 30000);
}

module.exports = { checkHeartbeat };
