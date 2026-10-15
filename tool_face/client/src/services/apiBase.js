// Địa chỉ gọi API.
// - Khi chạy `npm run dev` (cổng 3000): gọi thẳng server ở http://localhost:5000
// - Bản build (Docker/nginx, VPS sau nginx / Caddy): dùng đường dẫn tương đối /api cùng domain
// - Muốn ép một địa chỉ khác: đặt NEXT_PUBLIC_API_ORIGIN (ví dụ http://localhost:5000) trước khi build
export const API_ORIGIN = (process.env.NEXT_PUBLIC_API_ORIGIN
  ?? (process.env.NODE_ENV === 'development' ? 'http://localhost:5000' : '')).replace(/\/$/, '');
export const API_BASE = `${API_ORIGIN}/api`;
// Tên gọi khác của API_BASE (dùng trong authApi, AiImageStudioModal, trang pháp lý)
export const API_BASE_URL = API_BASE;

// Ảnh / video đã tải lên server (mediaLink dạng local://ten-file)
export function mediaUrl(link) {
  if (typeof link !== 'string') return link;
  if (link.startsWith('local://')) return `${API_BASE}/media/${link.slice('local://'.length)}`;
  return link;
}
