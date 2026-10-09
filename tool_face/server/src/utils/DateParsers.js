const moment = require('moment');

function parseSo9Schedule(scheduleStr) {
  if (!scheduleStr) return new Date();
  if (scheduleStr instanceof Date && !Number.isNaN(scheduleStr.getTime())) return scheduleStr;
  if (typeof scheduleStr === 'number') {
    const parsedExcelDate = require('xlsx').SSF.parse_date_code(scheduleStr);
    if (parsedExcelDate) {
      return new Date(parsedExcelDate.y, parsedExcelDate.m - 1, parsedExcelDate.d, parsedExcelDate.H, parsedExcelDate.M, parsedExcelDate.S);
    }
  }
  if (['now', 'đăng ngay'].includes(String(scheduleStr).trim().toLowerCase())) return new Date();

  const value = String(scheduleStr).trim();
  const rangeMatch = value.match(/^(.+_\d{1,2}:\d{2})-\d{1,2}:\d{2}$/);
  const startTimeStr = rangeMatch ? rangeMatch[1] : value;
  const parsedMoment = moment(startTimeStr, [
    'D/M/YYYY_HH:mm',
    'DD/MM/YYYY_HH:mm',
    'D/M/YYYY HH:mm',
    'DD/MM/YYYY HH:mm',
    'YYYY-MM-DD HH:mm:ss',
    'YYYY-MM-DD HH:mm',
    'YYYY-MM-DDTHH:mm:ss',
    'YYYY-MM-DDTHH:mm',
    'YYYY/MM/DD HH:mm',
    'DD-MM-YYYY HH:mm',
    'DD-MM-YYYY HH:mm:ss'
  ], true);

  if (!parsedMoment.isValid()) {
    throw new Error(`Định dạng thời gian không hợp lệ: ${scheduleStr}. Chuẩn yêu cầu: DD/M/YYYY_HH:mm`);
  }

  return parsedMoment.toDate();
}

function parseCommentDelayMinutes(rawDelay, postScheduledAt) {
  if (rawDelay === null || rawDelay === undefined || rawDelay === '') {
    return 0;
  }

  if (typeof rawDelay === 'number') {
    if (rawDelay > 1000) {
      try {
        const parsedExcelDate = require('xlsx').SSF.parse_date_code(rawDelay);
        if (parsedExcelDate) {
          const date = new Date(parsedExcelDate.y, parsedExcelDate.m - 1, parsedExcelDate.d, parsedExcelDate.H, parsedExcelDate.M, parsedExcelDate.S);
          if (postScheduledAt instanceof Date && !Number.isNaN(postScheduledAt.getTime())) {
            const diff = Math.round((date.getTime() - postScheduledAt.getTime()) / 60000);
            return Math.max(0, diff);
          }
        }
      } catch {}
    }
    return Math.max(0, Math.round(rawDelay));
  }

  const str = String(rawDelay).trim();
  const lower = str.toLowerCase();
  if (lower === 'now' || lower === 'ngay' || lower === 'đăng ngay' || lower === '0') {
    return 0;
  }

  // Nếu nhập ngày giờ cụ thể (VD: 8/10/2026_16:10 hoặc 8/10/2026 16:10)
  if (str.includes('/') || (str.includes('-') && str.length > 5)) {
    try {
      const commentDate = parseSo9Schedule(str);
      if (commentDate && postScheduledAt instanceof Date && !Number.isNaN(postScheduledAt.getTime())) {
        const diff = Math.round((commentDate.getTime() - postScheduledAt.getTime()) / 60000);
        return Math.max(0, diff);
      }
    } catch {}
  }

  // Nếu chỉ nhập giờ phút (VD: 16:10 hoặc 16:10:00)
  const timeMatch = str.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (timeMatch && postScheduledAt instanceof Date && !Number.isNaN(postScheduledAt.getTime())) {
    const hours = parseInt(timeMatch[1], 10);
    const minutes = parseInt(timeMatch[2], 10);
    const commentDate = new Date(postScheduledAt);
    commentDate.setHours(hours, minutes, 0, 0);
    const diff = Math.round((commentDate.getTime() - postScheduledAt.getTime()) / 60000);
    return Math.max(0, diff);
  }

  // Nếu nhập số phút trực tiếp (VD: "5", "5 phút", "+5m", "sau 5p")
  const numMatch = str.match(/\d+/);
  if (numMatch) {
    return Math.max(0, parseInt(numMatch[0], 10));
  }

  return 0;
}

module.exports = { parseSo9Schedule, parseCommentDelayMinutes };