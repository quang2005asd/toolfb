/**
 * WebSearchService.js
 * Dịch vụ tra cứu tin tức thời sự tiếng Việt thời gian thực (Hoàn toàn miễn phí qua Google News RSS).
 * Giúp AI nắm bắt dữ kiện thực tế mới nhất trong ngày (hôm nay, tin mới, drama, sự kiện...)
 * để viết bài chính xác 100%, không bịa đặt (anti-hallucination).
 */
const axios = require('axios');

function decodeHtmlEntities(str) {
  if (!str) return '';
  return str
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

// Từ khóa gợi ý cần kích hoạt tra cứu tin tức
const NEWS_TRIGGER_KEYWORDS = [
  'hôm nay', 'hom nay',
  'mới nhất', 'moi nhat',
  'vừa xong', 'vua xong',
  'sáng nay', 'sang nay',
  'chiều nay', 'chieu nay',
  'tối nay', 'toi nay',
  'tin tức', 'tin tuc',
  'thời sự', 'thoi su',
  'nóng', 'hot', 'vừa qua',
  'vừa xảy ra', 'drama',
  'giá vàng', 'bão', 'trận đấu',
  'kết quả', 'tâm thư', 'chia tay'
];

function shouldSearchNews(prompt) {
  if (!prompt || typeof prompt !== 'string') return false;
  const lower = prompt.toLowerCase();
  return NEWS_TRIGGER_KEYWORDS.some((kw) => lower.includes(kw));
}

// Trích xuất từ khóa tìm kiếm cốt lõi từ prompt người dùng
function extractSearchQuery(prompt) {
  if (!prompt) return '';
  // Loại bỏ các từ thừa như "viết 1 bài về", "hãy viết bài đăng", "viết bài"
  let cleaned = prompt
    .replace(/^(hãy\s+)?(viết|soạn|tạo)(\s+cho\s+tôi)?(\s+\d+)?\s+(bài|post|content)(\s+về|\s+nói\s+về)?/i, '')
    .replace(/^(viết\s+về|kể\s+về|chia\s+sẻ\s+về)\s+/i, '')
    .trim();

  // Giới hạn độ dài query khoảng 10-12 từ để Google RSS tìm chính xác nhất
  const words = cleaned.split(/\s+/).slice(0, 10).join(' ');
  return words || prompt.slice(0, 50);
}

/**
 * Tra cứu tin tức thời sự mới nhất
 * @param {string} query - Từ khóa tìm kiếm
 * @param {number} maxResults - Số bài báo tối đa cần lấy
 */
async function searchNews(query, maxResults = 5) {
  if (!query || !query.trim()) return [];

  const searchQuery = extractSearchQuery(query.trim());
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(searchQuery)}&hl=vi&gl=VN&ceid=VN:vi`;

  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml'
      },
      timeout: 8000
    });

    const xml = response.data || '';
    const items = [];
    const itemRegex = /<item>[\s\S]*?<title>(.*?)<\/title>[\s\S]*?<link>(.*?)<\/link>[\s\S]*?<pubDate>(.*?)<\/pubDate>[\s\S]*?<\/item>/g;

    let match;
    while ((match = itemRegex.exec(xml)) !== null && items.length < maxResults) {
      const fullTitle = decodeHtmlEntities(match[1]);
      const link = match[2];
      const pubDate = match[3];

      // Tách tiêu đề và nguồn báo (VD: "Tiêu đề bài viết - Báo Dân trí")
      const lastDash = fullTitle.lastIndexOf(' - ');
      let title = fullTitle;
      let source = 'Báo chí';
      if (lastDash > 0) {
        title = fullTitle.slice(0, lastDash).trim();
        source = fullTitle.slice(lastDash + 3).trim();
      }

      items.push({ title, source, pubDate, link });
    }

    return items;
  } catch (error) {
    console.warn('[WebSearchService] Lỗi khi tra cứu tin tức thời sự:', error.message);
    return [];
  }
}

/**
 * Lấy chuỗi ngữ cảnh tin tức đã format để nạp vào prompt của AI
 */
async function getNewsContext(query, maxResults = 5) {
  const news = await searchNews(query, maxResults);
  if (!news || news.length === 0) return '';

  const newsList = news
    .map((item, idx) => `${idx + 1}. [${item.source}] ${item.title}`)
    .join('\n');

  return `\n\n📰 THÔNG TIN THỜI SỰ / SỰ KIỆN THẬT MỚI NHẤT VỪA GHI NHẬN TỪ BÁO CHÍ:\n${newsList}\n\n⚠️ QUY TẮC BẮT BUỘC DÀNH CHO AI:\n- Hãy sử dụng chính xác các dữ kiện thời sự thực tế ở trên để viết bài.\n- TUYỆT ĐỐI KHÔNG tự bịa đặt chi tiết sai lệch với sự kiện (ví dụ: không bịa tỷ số, bàn thắng hay kết quả nếu báo chí không đề cập).\n- Viết với góc nhìn sâu sắc, tự nhiên, hấp dẫn và giữ đúng bản chất sự kiện thật.\n`;
}

module.exports = {
  shouldSearchNews,
  searchNews,
  getNewsContext,
  extractSearchQuery
};
