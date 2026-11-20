/**
 * Bộ dịch giao diện sang tiếng Anh, chạy trên trang đã hiển thị (chỉ khi người dùng chọn English).
 * Giao diện gốc viết tiếng Việt trực tiếp trong component; thay vì sửa từng component, bộ dịch thay chữ
 * hiển thị (nút, nhãn, placeholder, tooltip, tiêu đề tab, hộp xác nhận) theo từ điển en.json và tự dịch
 * phần giao diện mới hiện ra (MutationObserver). Chữ không có trong từ điển giữ nguyên tiếng Việt.
 *
 * Từ điển: { "câu tiếng Việt": "English" }. Câu có {0}, {1}… là mẫu cho chuỗi ghép biến
 * (vd. "Thiếu quyền {0}/{1} tính năng" → "Missing permissions for {0}/{1} features").
 *
 * Không dịch: nội dung người dùng nhập (ô nhập, vùng soạn thảo) và mọi phần tử có translate="no"
 * (tin nhắn của khách, nội dung bài đăng, trang pháp lý đã có bản tiếng Anh riêng).
 */
const VI_CHARS = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'CODE', 'PRE', 'svg']);
const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
const ENTITIES = { '&amp;': '&', '&nbsp;': ' ', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'" };

let exact = new Map();
let patterns = [];
const appliedText = new WeakMap(); // nút chữ → bản dịch đã gán (bỏ qua thay đổi do chính bộ dịch gây ra)
const appliedAttr = new WeakMap(); // phần tử → { thuộc tính: bản dịch đã gán }
let observer = null;

function normalize(text) {
  return String(text)
    .replace(/&(amp|nbsp|lt|gt|quot|#39|apos);/g, (entity) => ENTITIES[entity])
    .replace(/[\s ]+/g, ' ')
    .trim();
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function loadDictionary(dictionary) {
  exact = new Map();
  patterns = [];
  for (const [vi, en] of Object.entries(dictionary || {})) {
    if (!en || typeof en !== 'string') continue;
    const key = normalize(vi);
    if (/\{\d+\}/.test(key)) {
      const literal = key.replace(/\{\d+\}/g, '');
      if (!VI_CHARS.test(literal)) continue; // mẫu không có chữ Việt cố định thì quá rộng — bỏ
      const order = [];
      const source = key.split(/(\{\d+\})/).map((part) => {
        const match = /^\{(\d+)\}$/.exec(part);
        if (!match) return escapeRegExp(part);
        order.push(Number(match[1]));
        return '(.+?)';
      }).join('');
      patterns.push({ regex: new RegExp(`^${source}$`), order, en: normalize(en), weight: literal.length });
    } else {
      exact.set(key, normalize(en));
    }
  }
  patterns.sort((a, b) => b.weight - a.weight);
}

// Dịch một câu; null nếu không có trong từ điển
export function translateText(text) {
  const key = normalize(text);
  if (!key || !VI_CHARS.test(key)) return null;
  const direct = exact.get(key);
  if (direct) return direct;
  for (const pattern of patterns) {
    const match = pattern.regex.exec(key);
    if (!match) continue;
    const values = match.slice(1);
    // Phần biến chỉ nhận giá trị ngắn (tên nick, tên Fanpage, số…). Một đoạn câu tiếng Việt chưa dịch được
    // nghĩa là mẫu khớp nhầm (vd. "Tài khoản {0}" với "Tài khoản chưa có Fanpage…") → bỏ mẫu này
    if (values.some((value) => VI_CHARS.test(value) && !exact.has(normalize(value)) && looksLikeSentence(value))) continue;
    return pattern.en.replace(/\{(\d+)\}/g, (_, index) => {
      const value = values[pattern.order.indexOf(Number(index))] ?? '';
      return exact.get(normalize(value)) || value;
    });
  }
  return translateDate(key) || translateJoined(key);
}

function looksLikeSentence(value) {
  const text = value.trim();
  return text.split(/\s+/).length > 4 || /[.!?:;,]$/.test(text);
}

// Ngày do trình duyệt định dạng kiểu Việt (toLocaleDateString('vi-VN'))
const VI_WEEKDAYS = { 'chủ nhật': 'Sunday', 'thứ hai': 'Monday', 'thứ ba': 'Tuesday', 'thứ tư': 'Wednesday', 'thứ năm': 'Thursday', 'thứ sáu': 'Friday', 'thứ bảy': 'Saturday' };
const EN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function translateDate(text) {
  let match = /^(chủ nhật|thứ hai|thứ ba|thứ tư|thứ năm|thứ sáu|thứ bảy), (\d{1,2}) tháng (\d{1,2}),? (?:năm )?(\d{4})$/i.exec(text);
  if (match) return `${VI_WEEKDAYS[match[1].toLowerCase()]}, ${EN_MONTHS[Number(match[3]) - 1]} ${Number(match[2])}, ${match[4]}`;
  match = /^(\d{1,2}) tháng (\d{1,2}),? (?:năm )?(\d{4})$/i.exec(text);
  if (match) return `${EN_MONTHS[Number(match[2]) - 1]} ${Number(match[1])}, ${match[3]}`;
  match = /^tháng (\d{1,2}),? (?:năm )?(\d{4})$/i.exec(text);
  if (match) return `${EN_MONTHS[Number(match[1]) - 1]} ${match[2]}`;
  return null;
}

// Chuỗi ghép "a · b · c": dịch từng phần khi mọi phần có chữ Việt đều dịch được
function translateJoined(text) {
  if (!text.includes(' · ')) return null;
  let changed = false;
  const parts = text.split(' · ').map((part) => {
    if (!VI_CHARS.test(part)) return part;
    const translated = exact.get(normalize(part)) || translateDate(normalize(part));
    if (translated) changed = true;
    return translated || part;
  });
  return changed ? parts.join(' · ') : null;
}

function skipped(element) {
  if (!element) return true;
  if (SKIP_TAGS.has(element.tagName)) return true;
  if (element.isContentEditable) return true;
  return Boolean(element.closest('[translate="no"], .legal-page, textarea, [contenteditable="true"]'));
}

function translateTextNode(node) {
  const value = node.nodeValue;
  if (!value || appliedText.get(node) === value || !VI_CHARS.test(value)) return;
  if (skipped(node.parentElement)) return;
  const translated = translateText(value);
  if (!translated) return;
  // Giữ khoảng trắng đầu / cuối (chữ ghép cạnh biến trong JSX: " nick đang hoạt động")
  const lead = /^[\s ]*/.exec(value)[0];
  const trail = /[\s ]*$/.exec(value)[0];
  const next = `${lead ? ' ' : ''}${translated}${trail ? ' ' : ''}`;
  appliedText.set(node, next);
  node.nodeValue = next;
}

// Thuộc tính (placeholder, tooltip…) là chữ của giao diện kể cả trên ô nhập; chỉ bỏ vùng translate="no"
function translateAttributes(element) {
  if (element.closest('[translate="no"], .legal-page')) return;
  for (const name of ATTRS) {
    const value = element.getAttribute(name);
    if (!value || !VI_CHARS.test(value)) continue;
    const done = appliedAttr.get(element) || {};
    if (done[name] === value) continue;
    const translated = translateText(value);
    if (!translated) continue;
    done[name] = translated;
    appliedAttr.set(element, done);
    element.setAttribute(name, translated);
  }
}

function translateTree(root) {
  if (!root) return;
  if (root.nodeType === Node.TEXT_NODE) {
    translateTextNode(root);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  if (root.closest?.('[translate="no"], .legal-page')) return;
  translateAttributes(root);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.getAttribute('translate') === 'no' || node.classList?.contains('legal-page')) return NodeFilter.FILTER_REJECT;
        if (SKIP_TAGS.has(node.tagName)) {
          // Ô soạn thảo: dịch placeholder, không đụng nội dung người dùng
          if (node.tagName === 'TEXTAREA') translateAttributes(node);
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  let node = walker.nextNode();
  while (node) {
    if (node.nodeType === Node.TEXT_NODE) translateTextNode(node);
    else translateAttributes(node);
    node = walker.nextNode();
  }
}

function translateTitle() {
  const translated = translateText(document.title);
  if (translated && translated !== document.title) document.title = translated;
}

// Hộp thoại của trình duyệt (xác nhận gỡ nick, cảnh báo…) cũng dịch theo từ điển
function patchDialogs() {
  for (const name of ['alert', 'confirm', 'prompt']) {
    const original = window[name];
    if (typeof original !== 'function' || original.__toolfbTranslated) continue;
    const wrapped = function wrappedDialog(message, ...rest) {
      const text = typeof message === 'string'
        ? message.split('\n').map((line) => translateText(line) || line).join('\n')
        : message;
      return original.call(window, text, ...rest);
    };
    wrapped.__toolfbTranslated = true;
    window[name] = wrapped;
  }
}

export function startTranslator(dictionary) {
  if (typeof window === 'undefined' || observer) return;
  loadDictionary(dictionary);
  document.documentElement.setAttribute('lang', 'en');
  translateTree(document.body);
  translateTitle();
  patchDialogs();
  observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'characterData') translateTextNode(mutation.target);
      else if (mutation.type === 'attributes') {
        if (mutation.target.nodeType === Node.ELEMENT_NODE) translateAttributes(mutation.target);
      } else {
        mutation.addedNodes.forEach((node) => translateTree(node));
      }
    }
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  const titleElement = document.querySelector('head > title');
  if (titleElement) new MutationObserver(translateTitle).observe(titleElement, { childList: true, characterData: true, subtree: true });
}
