// Ngôn ngữ giao diện: 'vi' (mặc định) | 'en'. Lưu trong trình duyệt; ?lang=en|vi trên đường dẫn ghi đè và được nhớ
// (gửi người duyệt Meta link https://.../login?lang=en là vào thẳng tiếng Anh).
export const LANG_KEY = 'toolfb_lang';
export const LANGS = ['vi', 'en'];

export function readLang() {
  if (typeof window === 'undefined') return 'vi';
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('lang');
    if (LANGS.includes(fromUrl)) {
      window.localStorage.setItem(LANG_KEY, fromUrl);
      return fromUrl;
    }
    const saved = window.localStorage.getItem(LANG_KEY);
    return LANGS.includes(saved) ? saved : 'vi';
  } catch {
    return 'vi';
  }
}

// Đổi ngôn ngữ: lưu lại rồi tải lại trang (bộ dịch chỉ chạy khi tải trang ở chế độ tiếng Anh,
// tiếng Việt là giao diện gốc nên không phải hoàn tác gì)
export function switchLang(next) {
  if (!LANGS.includes(next) || typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.delete('lang');
  try {
    window.localStorage.setItem(LANG_KEY, next);
  } catch {
    // trình duyệt chặn bộ nhớ: giữ ngôn ngữ qua ?lang trên đường dẫn
    if (next === 'en') url.searchParams.set('lang', 'en');
  }
  window.location.replace(url.toString());
}
