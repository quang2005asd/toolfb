// Địa chỉ gọi API.
// - Khi chạy `npm run dev` (cổng 3000): gọi thẳng server ở http://localhost:5000
// - Bản build (server phục vụ giao diện, hoặc Docker/nginx): dùng đường dẫn tương đối /api
// - Muốn ép một địa chỉ khác: đặt NEXT_PUBLIC_API_ORIGIN (ví dụ http://localhost:5000) trước khi build
export const API_ORIGIN = process.env.NEXT_PUBLIC_API_ORIGIN
  ?? (process.env.NODE_ENV === 'development' ? 'http://localhost:5000' : '');
export const API_BASE = `${API_ORIGIN}/api`;
