// Gọi API cùng domain qua /api: nginx của client (và Caddy trên VPS) chuyển tiếp sang server,
// nên chạy được cả http://localhost:3000 lẫn https://ten-mien-cua-ban mà không cần sửa code.
// Chạy `next dev` riêng (không qua nginx) thì đặt NEXT_PUBLIC_API_URL=http://localhost:5000/api
export const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || '/api').replace(/\/$/, '');

// Ảnh / video đã tải lên server (mediaLink dạng local://ten-file)
export function mediaUrl(link) {
  if (typeof link !== 'string') return link;
  if (link.startsWith('local://')) return `${API_BASE_URL}/media/${link.slice('local://'.length)}`;
  return link;
}
