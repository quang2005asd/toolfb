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
      'Fanpage / TikTok Channel (Tên | Page ID)',
      'Fanpage / TikTok Channel',
      'Kênh đăng (Fanpage hoặc TikTok ID/User)',
      'Kênh đăng (Fanpage hoặc TikTok)',
      'Fanpage Channel (Tên | Page ID)',
      'Fanpage Channel',
      'Channel',
      'Kênh',
      'Kênh đăng',
      'Page ID',
      'Tài khoản'
    ]);
    const mediaLinks = parseMediaLinks(cellValue(row, headers, [
      'Media Link',
      'Link Media',
      'Đường dẫn media',
      'Media URL',
      'Url Media'
    ]));
    if (!content && mediaLinks.length === 0) return;

    const rawPlatform = cellValue(row, headers, [
      'Platform',
      'Nền tảng',
      'Nen tang',
      'Nền tảng (FB/TikTok)',
      'Nen tang (FB/TikTok)',
      'Nền tảng (Facebook/TikTok)',
      'Nen tang (Facebook/TikTok)',
      'Kênh MXH',
      'Mạng xã hội'
    ]);

    let platform = null;
    if (rawPlatform) {
      const normP = normalizeHeader(rawPlatform);
      if (normP.includes('tiktok') || normP === 'tt') platform = 'tiktok';
      else if (normP.includes('facebook') || normP === 'fb' || normP === 'fanpage') platform = 'facebook';
      else if (normP.includes('ca hai') || normP.includes('all') || normP.includes('both') || normP.includes('tat ca')) platform = 'all';
    }

    const channelStr = String(channel || '').trim();

    // Hỗ trợ nhiều Page ID / kênh cách nhau bằng dấu phẩy hoặc dấu chấm phẩy
    // Mỗi phần tử có thể ở dạng: "Tên Page | 123456" hoặc chỉ "123456" hoặc "@username"
    const channelParts = channelStr
      .split(/[,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    const pageIds = channelParts.map((part) => {
      const matchPipe = part.match(/\|\s*([0-9a-zA-Z_@.-]+)\s*$/);
      if (matchPipe) return matchPipe[1].trim();
      return part;
    });

    // pageId đầu tiên dùng để tự động nhận diện platform
    const pageId = pageIds[0] || null;

    // Tự động nhận diện platform qua channel nếu cột Nền tảng để trống
    if (!platform && channelStr) {
      const lowerChannel = channelStr.toLowerCase();
      if (lowerChannel.startsWith('@') || lowerChannel.includes('tiktok') || lowerChannel.includes('tt |') || lowerChannel.includes('tt|')) {
        platform = 'tiktok';
      }
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

    let mediaType = normalizeMediaType(
      cellValue(row, headers, ['Media Type', 'Loại Media', 'Loại nội dung', 'Type']),
      mediaLinks
    );

    // TikTok yêu cầu video: nếu là TikTok và có file media, đảm bảo mediaType là video
    if (platform === 'tiktok' && mediaLinks.length > 0 && mediaType !== 'reel') {
      mediaType = 'video';
    }

    parsedPosts.push({
      rowIndex: headerIndex + rowOffset + 2,
      pageId,
      pageIds: pageIds.length > 0 ? pageIds : (pageId ? [pageId] : []),
      channelRaw: channelStr,
      platform: platform || 'facebook',
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