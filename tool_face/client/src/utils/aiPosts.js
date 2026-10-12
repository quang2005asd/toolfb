// Xử lý nội dung AI viết cho Facebook: Facebook không hiển thị markdown nên phải bỏ ký hiệu **, *, #...
const NUMBER_WORDS = { hai: 2, ba: 3, 'bốn': 4, 'năm': 5, 'sáu': 6, 'bảy': 7, 'tám': 8, 'chín': 9, 'mười': 10 };
export const MAX_AI_POSTS = 10;

export function stripMarkdown(text) {
  return String(text || '')
    .replace(/```[a-z]*\n?([\s\S]*?)```/gi, '$1')            // khối code
    .replace(/\*\*([^*\n]+?)\*\*/g, '$1')                    // **đậm**
    .replace(/__([^_\n]+?)__/g, '$1')                        // __đậm__
    .replace(/(^|[^*\w])\*(?!\s)([^*\n]+?)(?<!\s)\*(?!\*)/g, '$1$2') // *nghiêng*
    .replace(/^#{1,6}\s+/gm, '')                             // # Tiêu đề (hashtag không có dấu cách nên được giữ)
    .replace(/^\s*[*+]\s+/gm, '• ')                           // * gạch đầu dòng
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '$1 ($2)') // [chữ](link)
    .replace(/\*\*/g, '')                                    // ** còn sót
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// "Viết 4 bài về..." / "bốn bài" → 4
export function detectPostCount(prompt) {
  const text = String(prompt || '').toLowerCase();
  const digit = text.match(/(\d{1,2})\s*(?:bài|post|status|caption)/);
  if (digit) return Math.min(MAX_AI_POSTS, Math.max(1, Number(digit[1])));
  const word = text.match(/(hai|ba|bốn|năm|sáu|bảy|tám|chín|mười)\s+(?:bài|post|status|caption)/);
  return word ? NUMBER_WORDS[word[1]] : null;
}

const POST_HEADING = /^[^\p{L}\p{N}]{0,8}(?:bài(?:\s*viết)?|post)\s*(?:số\s*)?#?\d+\s*[:.\-–—)]?/iu;

function cleanPost(raw) {
  const lines = String(raw).trim().split('\n');
  // Bỏ nhãn "Bài viết 1:" ở dòng đầu, giữ emoji đứng trước và phần tiêu đề phía sau
  const firstLine = lines.length ? lines[0].replace(/\*/g, '').trim() : '';
  if (POST_HEADING.test(firstLine)) {
    const emoji = (firstLine.match(/^[^\p{L}\p{N}]*/u)?.[0] || '').replace(/[\s"“”'#\-–—:.]/g, '');
    let rest = firstLine.replace(POST_HEADING, '').trim();
    // 🎉 "Siêu sale 10/10" → 🎉 Siêu sale 10/10
    const quoted = rest.match(/^([^\p{L}\p{N}"“]*)["“](.+)["”]$/u);
    if (quoted) rest = `${quoted[1]}${quoted[2]}`.trim();
    if (rest) lines[0] = emoji ? `${emoji} ${rest}` : rest;
    else lines.shift();
  }
  const content = stripMarkdown(lines.join('\n'));
  const title = (content.split('\n').find((line) => line.trim()) || '').replace(/^[^\p{L}\p{N}]+/u, '').slice(0, 80);
  return { title, content };
}

// Tách một câu trả lời chứa nhiều bài (ngăn bởi "---" hoặc tiêu đề "Bài viết N") thành từng bài
export function splitAiPosts(text) {
  const raw = String(text || '').trim();
  if (!raw) return [];
  const lines = raw.split('\n');
  const headingIndexes = lines.reduce((acc, line, index) => (POST_HEADING.test(line.replace(/\*/g, '')) ? [...acc, index] : acc), []);

  let parts = [];
  if (headingIndexes.length >= 2) {
    parts = headingIndexes.map((start, i) => lines.slice(start, headingIndexes[i + 1] ?? lines.length).join('\n'));
  } else {
    parts = raw.split(/^\s*(?:-{3,}|\*{3,}|_{3,}|={3,})\s*$/m);
  }
  parts = parts
    .map((part) => part.replace(/^\s*(?:-{3,}|\*{3,}|_{3,}|={3,})\s*$/gm, '').trim())
    .filter((part) => part.replace(/\s/g, '').length > 30);
  // Câu mở đầu kiểu "Dưới đây là 4 bài viết..." không phải là bài
  if (parts.length > 2 && parts[0].length < 160 && !POST_HEADING.test(parts[0].replace(/\*/g, ''))) parts = parts.slice(1);
  return parts.length >= 2 ? parts.map(cleanPost) : [];
}
