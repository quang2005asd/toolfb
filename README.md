# toolfb — Tool Social

Mã nguồn của **Tool Social** (https://toolsocial.store): quản lý Fanpage Facebook, Instagram và TikTok — lên lịch đăng bài, đăng hàng loạt từ Excel, hộp thư Messenger / Instagram, trả lời tự động, AI Studio, AI Bình luận.

Toàn bộ ứng dụng nằm trong thư mục `tool_face/` → hướng dẫn chi tiết: **[tool_face/README.md](tool_face/README.md)**.

```
toolfb/
└── tool_face/                     Ứng dụng — KHÔNG đổi tên / di chuyển (VPS deploy theo đúng đường dẫn này)
    ├── server/                    API Node.js / Express + worker hàng đợi (BullMQ)
    ├── client/                    Giao diện Next.js (xuất trang tĩnh, nginx phục vụ)
    ├── deploy/                    Hướng dẫn & cấu hình đưa lên VPS, Meta App, auto-deploy
    ├── eval/                      Dữ liệu đánh giá AI Studio
    ├── docker-compose.yml         Chạy thử trên máy
    ├── docker-compose.shared.yml  VPS dùng chung với website khác (bản đang chạy thật)
    └── docker-compose.prod.yml    VPS riêng, Caddy tự cấp HTTPS
```

## Quy tắc làm việc nhóm (tránh xung đột)

1. **`main` là bản đang chạy thật.** Máy chủ tự kiểm tra `main` mỗi 3 phút và deploy commit mới. Commit làm hỏng build hoặc server không khởi động được sẽ tự quay về bản trước và **không được thử lại** — phải sửa bằng một commit mới.
2. **Đẩy thẳng lên `main`, nhưng luôn lấy code mới của người khác trước khi push** và tự giải quyết xung đột ở máy mình:
   ```bash
   git pull --rebase origin main
   git push origin main
   ```
   Không dùng `git push --force` lên `main` (sẽ xóa commit của người khác). Thay đổi lớn hoặc chưa chắc chắn thì làm trên nhánh riêng rồi mở Pull Request.
3. **Không di chuyển / đổi tên** `tool_face/`, `tool_face/server/`, `tool_face/client/`, `tool_face/docker-compose.shared.yml`, và không tạo bản sao lồng nhau kiểu `toolfb/tool_face/...` — script deploy trên máy chủ đọc đúng các đường dẫn này.
4. **Repo công khai:** không commit `.env`, mật khẩu, token, App Secret, file CSDL (`*.sqlite`, `*.db`) hay ảnh / video người dùng tải lên. Chỉ commit file mẫu `*.example`.
5. **Kiểm tra trước khi push** (giống các bước máy chủ kiểm tra trước khi deploy):
   ```bash
   cd tool_face/server
   for f in $(find src config queues scripts -name '*.js'); do node --check "$f" || break; done
   cd ../client && npm run build
   ```
6. **Phần riêng không được làm sập phần chung:** module tùy chọn (ví dụ `server/src/modules/kb`) phải được nạp sao cho thiếu file hoặc lỗi chỉ tắt riêng phần đó.
7. **Không chạy bản trên máy song song với bản VPS bằng cùng Fanpage / token thật:** cả hai nơi đều tự trả lời tin nhắn, bình luận và đăng bài hẹn giờ → khách nhận trả lời hai lần, bài có thể bị đăng hai lần.
