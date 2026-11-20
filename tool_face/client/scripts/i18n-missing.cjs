/**
 * Liệt kê chữ tiếng Việt trên giao diện chưa có bản dịch trong src/i18n/en.json.
 * Chạy sau khi thêm / sửa chữ hiển thị:   npm run i18n:missing
 * Thêm từng câu còn thiếu vào en.json dạng "câu tiếng Việt": "English". Chuỗi ghép biến `...${x}...`
 * được in dạng mẫu {0}, {1} — giữ nguyên các mẫu này trong bản tiếng Anh.
 */
const fs = require('fs');
const path = require('path');
const { parse } = require('next/dist/compiled/babel/parser');

const SRC = path.join(__dirname, '..', 'src');
const DICT = path.join(SRC, 'i18n', 'en.json');
const VI = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
// Trang pháp lý đã có bản tiếng Anh riêng; nút ngôn ngữ cố ý giữ "Tiếng Việt"
// aiPosts.js: số đếm bằng chữ ("bốn", "năm"…) để đọc yêu cầu gửi AI, không hiển thị
const SKIP = /(privacy|terms|data-deletion)\.jsx$|LegalPage\.jsx$|LanguageToggle\.jsx$|aiPosts\.js$|[\\/]i18n[\\/]/;

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const file = path.join(dir, name);
    if (fs.statSync(file).isDirectory()) walk(file, out);
    else if (/\.jsx?$/.test(name) && !SKIP.test(file)) out.push(file);
  }
  return out;
}

const dictionary = JSON.parse(fs.readFileSync(DICT, 'utf8'));
const missing = new Map();
function add(text, file) {
  const key = text.replace(/\s+/g, ' ').trim();
  if (!key || !VI.test(key) || dictionary[key]) return;
  if (!missing.has(key)) missing.set(key, path.relative(SRC, file).replace(/\\/g, '/'));
}
function visit(node, file) {
  if (!node || typeof node.type !== 'string') return;
  if (node.type === 'ImportDeclaration') return;
  if (node.type === 'CallExpression' && node.callee?.object?.name === 'console') return;
  if (node.type === 'JSXText' || node.type === 'StringLiteral') add(node.value, file);
  if (node.type === 'TemplateLiteral') {
    add(node.quasis.map((q, i) => q.value.cooked + (i < node.expressions.length ? `{${i}}` : '')).join(''), file);
  }
  for (const key of Object.keys(node)) {
    if (['loc', 'start', 'end', 'extra', 'leadingComments', 'trailingComments', 'innerComments'].includes(key)) continue;
    const value = node[key];
    if (Array.isArray(value)) value.forEach((child) => visit(child, file));
    else if (value && typeof value.type === 'string') visit(value, file);
  }
}

for (const file of walk(SRC)) {
  try {
    visit(parse(fs.readFileSync(file, 'utf8'), { sourceType: 'module', plugins: ['jsx'] }).program, file);
  } catch (error) {
    console.error(`Không đọc được ${file}: ${error.message}`);
  }
}

if (!missing.size) {
  console.log('Mọi chữ tiếng Việt trên giao diện đều đã có bản dịch.');
} else {
  console.log(`${missing.size} câu chưa có bản dịch (thêm vào src/i18n/en.json):\n`);
  for (const [text, file] of missing) console.log(`${file}\t${text}`);
}
