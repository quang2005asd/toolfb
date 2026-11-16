# AI Bình luận độc lập

Project này chỉ giữ lại giao diện AI bình luận Facebook, đăng nhập, kết nối Fanpage và API cần cho các chức năng đó. App gốc vẫn nằm bên ngoài thư mục này và không bị xóa hay thay đổi bởi project độc lập.

## Chức năng có trong bản tách riêng

- Cấu hình AI theo Fanpage, xem trước câu trả lời và bật/tắt tự động trả lời.
- Mẫu trả lời, hồ sơ khách hàng, bài từ nhóm, nhật ký hoạt động và chẩn đoán.
- Kết nối Facebook bằng Meta OAuth, Facebook User Access Token hoặc Page Access Token thủ công.
- Webhook Facebook và quét bình luận định kỳ.
- Dùng lại các bảng `AppUsers`, `FacebookPages`, `ConnectedFbAccounts`, `SystemSettings` và các bảng `CommentAi*` của hệ thống hiện tại.
- Nhập bài từ file `.xlsx` hoặc `.csv`; file `.xls` cũ cần lưu lại thành `.xlsx` trước khi nhập.

Không có các màn hình/lịch xử lý cho đăng bài, lịch đăng, Messenger, Instagram, TikTok, AI Studio, báo cáo hoặc quản trị kênh khác.

## Chạy local

1. Tạo `server/.env` từ `server/.env.example`. SQLite được bật mặc định và lưu tại `server/data/tool_face.sqlite`; điền `SESSION_SECRET`, `ADMIN_PASSWORD` và cấu hình AI.
2. Để dùng lại dữ liệu cũ, sao lưu database trước, đặt `APP_DATA_DIR` thành đường dẫn tới thư mục đang chứa `tool_face.sqlite` của ứng dụng hiện tại (ví dụ `D:\duong-dan-toi\tool_face\server\data`) và giữ nguyên `SESSION_SECRET` cũ. Không chép file database lên GitHub. Database sẽ được dùng trực tiếp, không tự thay bằng file mới.
3. Khi chạy local, đặt `NODE_ENV=development`, `CLIENT_ORIGIN=http://localhost:3000`, `FACEBOOK_REDIRECT_URI=http://localhost:5000/api/auth/facebook/callback` và `COOKIE_SECURE=false` trong `server/.env`. Đăng ký đúng callback URI này trong Meta App nếu dùng OAuth; dán token thủ công không cần OAuth.
4. Cài dependency:

   ```powershell
   cd server
   npm install
   cd ..\client
   npm install
   ```

5. Mở hai terminal:

   ```powershell
   cd server
   npm run dev
   ```

   ```powershell
   cd client
   npm run dev
   ```

6. Mở `http://localhost:3000`. Đăng nhập bằng tài khoản đang có trong bảng `AppUsers`.

Để dùng SQL Server thay SQLite, đặt `USE_SQLITE=false` và điền đủ `DB_SERVER`, `DB_NAME`, `DB_USER` và `DB_PASSWORD`.

Để chạy frontend ở cổng khác backend, đặt `NEXT_PUBLIC_API_ORIGIN` khi chạy/build frontend. Mặc định development gọi `http://localhost:5000`.

## Chạy bằng Docker

1. Tạo `server/.env` từ `server/.env.example`. Đặt `NODE_ENV=production`, `COOKIE_SECURE=true`, URL HTTPS public trong `CLIENT_ORIGIN` và `FACEBOOK_REDIRECT_URI`. SQLite sẽ nằm trong Docker volume `comment_ai_data`; sao lưu volume định kỳ. Trong Meta for Developers, khai báo đúng OAuth Redirect URI, bật các quyền cần cho bình luận (`pages_show_list`, `pages_read_engagement`, `pages_read_user_content`, `pages_manage_metadata`, `pages_manage_engagement`) và đăng ký webhook.
2. Trỏ `CLIENT_ORIGIN` và `FACEBOOK_REDIRECT_URI` tới domain public của frontend; dùng HTTPS khi deploy thật.
3. Tại thư mục này, chạy:

   ```powershell
   docker compose up --build -d
   ```

4. Truy cập `http://localhost:3000` hoặc domain đã cấu hình.

## Cấu hình AI

Project mặc định dùng SQLite và cũng có thể cấu hình SQL Server. Project ưu tiên cấu hình AI đã có trong bảng `SystemSettings` (`ai_api_key`, `ai_model`, `ai_base_url`), sau đó mới dùng `AI_API_KEY`, `AI_MODEL`, `AI_API_BASE_URL` từ `server/.env`. API Key chỉ nằm ở máy chủ.

## Dùng trong GitHub / thay thế source

Đưa riêng thư mục `comment-ai-only/` lên branch/repository cần bàn giao. Đồng nghiệp có thể clone/pull project đó, tạo `server/.env` và chạy local hoặc Docker theo hướng dẫn. Không chép `.env`, token Facebook, database hay dữ liệu thật lên GitHub.

Nếu thay thế source đang chạy, giữ lại file `.env` và database hiện hữu; chỉ thay source/config deployment theo project này rồi build lại. Với SQLite, đặt `APP_DATA_DIR` trỏ tới thư mục chứa file `tool_face.sqlite` cũ. Các bảng Facebook và AI bình luận được giữ theo database đó, không cần nhập lại token nếu dùng đúng database và `SESSION_SECRET` cũ. Hãy thử với bản sao lưu trước khi trỏ ứng dụng production vào dữ liệu thật.
