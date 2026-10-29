const XLSX = require('xlsx');
const { parseSo9Schedule, parseCommentDelayMinutes } = require('../../utils/DateParsers');

function normalizeHeader(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function findColumn(headers, aliases) {
  const normalizedAliases = aliases.map(normalizeHeader);
  return headers.findIndex((header) => normalizedAliases.includes(normalizeHeader(header)));
}

function cellValue(row, headers, aliases) {
  const index = findColumn(headers, aliases);
  return index < 0 ? null : row[index];
}

function parseMediaLinks(value) {
  if (!value) return [];
  return String(value)
    .split(',')
    .map((link) => link.replace(/\[.*?\]/g, '').trim())
    .filter(Boolean);
}

function normalizeMediaType(value, mediaLinks = []) {
  const type = normalizeHeader(value);
  if (type === 'image' || type === 'photo' || type === 'anh') return 'image';
  if (type === 'video') return 'video';
  if (type === 'story' || type === 'tin') return 'story';
  if (type === 'reel' || type === 'reels') return 'reel';

  // Tự động nhận diện qua đuôi link nếu không điền cột Loại Media
  if (mediaLinks.length > 0) {
    const first = String(mediaLinks[0]).toLowerCase();
    if (first.includes('.mp4') || first.includes('.mov') || first.includes('drive.google') || type.includes('video')) {
      return 'video';
    }
    if (first.includes('.jpg') || first.includes('.jpeg') || first.includes('.png') || first.includes('.webp')) {
      return 'image';
    }
  }

  return 'text';
}

function parseBulkExcel(fileBuffer) {
  const workbook = XLSX.read(fileBuffer, { type: 'buffer', cellDates: true });
  const sheetName = workbook.Sheets['MAIN SHEET'] ? 'MAIN SHEET' : workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) {
    throw new Error('File Excel không hợp lệ. Không tìm thấy sheet dữ liệu!');
  }

  const rawRows = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: null,
    blankrows: false
  });
  const headerIndex = rawRows.findIndex((row) => {
    if (!Array.isArray(row)) return false;
    const headers = row.map(normalizeHeader);
    return headers.some((h) => ['content', 'noi dung', 'noi dung bai dang'].includes(h))
      && headers.some((h) => ['schedule', 'thoi gian dang', 'lich dang'].includes(h));
  });
  if (headerIndex < 0) {
    throw new Error('Không tìm thấy hàng tiêu đề có cột Content và Schedule trong file Excel.');
  }

  const headers = rawRows[headerIndex];
  const contentColumn = findColumn(headers, ['Content', 'Nội dung', 'Nội dung bài đăng']);
  const scheduleColumn = findColumn(headers, ['Schedule', 'Thời gian đăng', 'Lịch đăng']);
  if (contentColumn < 0 || scheduleColumn < 0) {
    throw new Error('File Excel cần có cột nội dung và thời gian đăng.');
  }

  const parsedPosts = [];

  rawRows.slice(headerIndex + 1).forEach((row, rowOffset) => {
    const content = cellValue(row, headers, ['Content', 'Nội dung', 'Nội dung bài đăng']);
    const rawSchedule = row[scheduleColumn];
    const channel = cellValue(row, headers, [
      'Fanpage Channel (Tên | Page ID)',
      'Fanpage Channel',
      'Channel',
      'Kênh',
      'Kênh đăng',
      'Page ID'
    ]);
    const mediaLinks = parseMediaLinks(cellValue(row, headers, [
      'Media Link',
      'Link Media',
      'Đường dẫn media',
      'Media URL',
      'Url Media'
    ]));
    if (!content && mediaLinks.length === 0) return;

    let pageId = null;
    const channelStr = String(channel || '').trim();
    const channelMatch = channelStr.match(/\|\s*([a-f0-9]+)/i) || channelStr.match(/\|\s*([0-9a-zA-Z_]+)/);
    if (channelMatch) {
      pageId = channelMatch[1].trim();
    } else if (/^\d{8,25}$/.test(channelStr) || /^\d+$/.test(channelStr)) {
      pageId = channelStr;
    }

    const postScheduledAt = parseSo9Schedule(rawSchedule);

    const comments = [];
    for (let commentIndex = 1; commentIndex <= 5; commentIndex++) {
      const commentContent = cellValue(row, headers, [
        `Comment ${commentIndex}`,
        `Seeding Comment ${commentIndex}`,
        `Bình luận ${commentIndex}`,
        `Seeding ${commentIndex}`
      ]);
      if (!commentContent || !String(commentContent).trim()) continue;

      const rawDelay = cellValue(row, headers, [
        `Schedule Comment ${commentIndex}`,
        `Thời gian comment ${commentIndex}`,
        `Lịch comment ${commentIndex}`,
        `Delay Comment ${commentIndex}`,
        `Delay ${commentIndex}`
      ]);

      const delayMinutes = parseCommentDelayMinutes(rawDelay, postScheduledAt);

      comments.push({
        commentIndex,
        content: String(commentContent).trim(),
        delayMinutes,
        mediaUrl: cellValue(row, headers, [
          `Media Comment ${commentIndex}`,
          `Ảnh comment ${commentIndex}`,
          `Media comment ${commentIndex}`
        ]) || null
      });
    }

    const mediaType = normalizeMediaType(
      cellValue(row, headers, ['Media Type', 'Loại Media', 'Loại nội dung', 'Type']),
      mediaLinks
    );

    parsedPosts.push({
      rowIndex: headerIndex + rowOffset + 2,
      pageId,
      content: String(content || '').trim(),
      scheduledAt: postScheduledAt,
      mediaType,
      mediaLinks,
      mediaThumb: cellValue(row, headers, ['Media Thumb', 'Ảnh đại diện', 'Thumb']) || null,
      comments
    });
  });

  if (parsedPosts.length === 0) {
    throw new Error('File Excel không có bài đăng hợp lệ sau hàng tiêu đề.');
  }

  return parsedPosts;
}

module.exports = { parseBulkExcel };