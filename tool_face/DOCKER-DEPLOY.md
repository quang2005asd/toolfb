# Triển khai bằng Docker trên VPS (đã sửa ngày 13/10/2026, CHƯA chạy thử trên máy chủ thật)

## Thay đổi so với bản trước
- Client: thêm `client/src/services/apiBase.js`, 9 file khác dùng nó thay cho `http://localhost:5000` viết cứng.
  `npm run dev` (cổng 3000) vẫn gọi thẳng http://localhost:5000; bản build (Docker/nginx hoặc server phục vụ giao diện) dùng `/api` tương đối.
  Sau khi chép đè, bản build cần `npm run build` lại ở client.
- server/src/app.js: CORS từ chối origin lạ; đăng ký tài khoản đóng khi NODE_ENV=production (mở tạm bằng ALLOW_REGISTER=true).
- client/nginx.conf: client_max_body_size 100m, chuyển tiếp X-Forwarded-Proto.
- docker-compose.yml: chỉ server + client chạy mặc định (redis, worker cần `--profile queue`), cổng 3000/5000 chỉ nghe 127.0.0.1,
  bắt buộc SESSION_SECRET, thêm CLIENT_ORIGIN, BACKEND_URL, COOKIE_SECURE, ALLOW_REGISTER, FACEBOOK_ADMIN_IDS, TOKEN_HEALTH_CHECK_MINUTES.

## Các bước
1. Cài Docker + Caddy, trỏ tên miền về IP máy chủ.
2. Đưa thư mục này lên máy chủ. Đổi `docker.env.example` thành `.env` (cạnh docker-compose.yml), điền giá trị thật.
3. `docker compose up -d --build`
4. Đặt Caddy theo `Caddyfile.example`, mở https://<tên-miền>, đăng ký admin, rồi đặt ALLOW_REGISTER=false và chạy lại `docker compose up -d`.
5. App Facebook: Callback URL webhook = https://<tên-miền>/api/webhooks/facebook, dán lại token Fanpage ở mục Kênh.

## Rủi ro chưa kiểm chứng
- `msnodesqlv8` có thể làm build Docker lỗi trên Linux (chuyển sang optionalDependencies nếu cần).
- `sqlite3` v6 trên Node 20 (image Docker) chưa xác nhận.
- Copy database cũ sang thì phải dùng đúng SESSION_SECRET cũ (token Fanpage mã hóa bằng khóa này).
