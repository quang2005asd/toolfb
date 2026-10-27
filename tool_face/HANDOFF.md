# Bản bàn giao cho AI tiếp theo (cập nhật 16/10/2026)

## 1. Bối cảnh
Team quyết định dùng **chuẩn của dự án `toolfb` (tool_face)** làm nền duy nhất. Project cũ `comment-ai-bot` (Express + Sequelize + PostgreSQL + giao diện HTML thuần) đã được **chuyển các chức năng AI Bình luận sang kiến trúc của tool_face**. Người dùng nói tiếng Việt: trả lời tiếng Việt, ngắn gọn, nói rõ cái gì đã kiểm tra / chưa. Mỗi lần sửa phải đóng zip và `present_files`; KHÔNG đưa `.env` vào zip.

## 2. Chuẩn của tool_face (phải theo)
- Server Node/Express 4 trong `server/`, truy cập DB bằng API kiểu `mssql` (`pool.request().input(...).query(T-SQL)`); chạy được SQL Server và **SQLite** (`config/sqliteAdapter.js` dịch T-SQL → SQLite, schema SQLite nằm trong `SCHEMA_DDL`). Chỉ dùng SQL mà adapter dịch được (`TOP n`, `OFFSET/FETCH`, `OUTPUT INSERTED.id`, `UPDATE...; IF @@ROWCOUNT = 0 INSERT...`); ghi thời gian bằng tham số `DateTime2` (đừng dựa vào DEFAULT).
- Bảng mới phải thêm vào CẢ `sqliteAdapter.js` (SQLite) lẫn `scripts/init-db.sql` + hàm `ensure...Schema` (SQL Server).
- Đăng nhập, phiên, Fanpage (`FacebookPages`, token mã hóa AES-GCM), cài đặt AI (`SettingsService`/`getAiConfig`), hàng đợi BullMQ, Telegram… đều của tool_face. Chỉ có 2 vai trò: `admin` và `user`.
- Client Next.js (Pages Router, `output: 'export'`, JS thuần), dịch vụ axios trong `client/src/services`, giao diện dùng class trong `globals.css` (`panel`, `button button-primary`, `field`, `status-pill`, `step-strip`…). Đọc `client/AGENTS.md` / `client/CLAUDE.md` trước khi sửa client.

## 3. Đã làm trong lần chuyển đổi này (module "AI Bình luận")
Server: `server/src/modules/comment-ai/comment-ai.routes.js` (API `/api/comment-ai/*` + webhook công khai `/api/webhooks/facebook`), `server/src/utils/CommentAiCore.js | CommentAiService.js | CommentAiLeadService.js | CommentAiSchema.js`; gắn vào `src/app.js` (rawBody để kiểm chữ ký webhook, khởi động polling theo `POLL_COMMENTS_INTERVAL_MS`, mặc định 60 giây); export thêm `getAiConfig` ở `AiContentGenerator.js`; các bảng `CommentAi*` và `PageReplies`.
Client: `client/src/pages/comment-ai/{index,templates,customers,leads,activity,diagnostics}.jsx`, `components/comment-ai/CommentAiShell.jsx`, `services/commentAiApi.js`, mục "AI Bình luận" trong `MainLayout.jsx`.
Tài liệu/cấu hình: README (mục AI Bình luận), `.env.example` (mục 4), `docker-compose.yml` (FB_VERIFY_TOKEN, POLL_COMMENTS, REPLY_MIN_GAP_MS).

Đã kiểm thử: `node --check`; chạy NGUYÊN adapter SQLite thật của tool_face (giả lập driver bằng `node:sqlite`) với ~12 nhóm kiểm tra tầng dịch vụ (cài đặt, mẫu + duyệt, xử lý bình luận, CRM, các nhánh bỏ qua, lỗi che token, quét + webhook, thống kê, đề xuất mẫu, bài từ nhóm, chẩn đoán) và kiểm tra lớp API (quyền theo Fanpage, admin, chữ ký webhook). Kiểm tra cú pháp JSX bằng `tsc`.
**Tại thời điểm bàn giao 10/10 chưa kiểm thử:** build Next.js, chạy giao diện trong trình duyệt, SQL Server thật, Facebook/AI thật, webhook thật. Trạng thái build cập nhật bên dưới.

### Cập nhật 16/10/2026
- Nhánh AI bình luận bổ sung ngữ cảnh bài đăng: tra `Posts` theo ID Facebook dạng đầy đủ/rút gọn, rồi cache `CommentAiPostCache` trong 24 giờ, cuối cùng mới gọi Graph API. Diagnostics đếm lượt AI có/không có ngữ cảnh; nhánh mẫu và `only_templates` không tải nội dung bài.
- AI Studio có thể tạo bản nháp mẫu cho Fanpage qua `POST /api/comment-ai/templates/generate`; chỉ lưu các mẫu được chọn bằng API tạo mẫu hiện có nên vẫn áp dụng `require_approval`. Tab Cấu hình AI có nút nhập system prompt của AI Studio vào tone khi ô chưa có nội dung tùy chỉnh.
- Schema `CommentAiPostCache` được khai báo trong `sqliteAdapter.js`, `scripts/init-db.sql` và migration `CommentAiSchema.js`; thời điểm ghi dùng tham số `DateTime2`.
- Đã kiểm tra lại `node --check`, tích hợp SQLite qua adapter thật (cache/TTL, fallback, nhánh mẫu, lọc trùng từ khóa, endpoint và quyền duyệt) và `npm run build` client.
- **Chưa kiểm tra:** Facebook/AI thật, SQL Server thật, giao diện trên trình duyệt.

## 4. Thay đổi hành vi so với comment-ai-bot (cần người dùng biết)
- AI trả lời mặc định **TẮT** cho mỗi Fanpage (trước đây bật sẵn); bật xong chỉ trả lời bình luận từ lúc bật.
- Phân quyền: bỏ staff/manager; còn `admin` và `user`. Duyệt mẫu trở thành tùy chọn theo Fanpage (`require_approval`) để người dùng một mình không bị kẹt.
- Dùng cấu hình AI chung ở Cài đặt (không còn DEEPSEEK_* riêng); đăng nhập/quản lý Fanpage của tool_face (không còn Page model, ngrok callback cũ, `x-page-id`).
- Bình luận thiếu trường `from` giờ được ghi log "bỏ qua" kèm lý do (trước đây bỏ qua âm thầm). Có giãn cách giữa các lần trả lời. Webhook kiểm tra chữ ký.
- "Bài từ nhóm": đọc Excel ở server (thư viện `xlsx` có sẵn), trùng link tính theo từng Fanpage (đã sửa giới hạn cũ).
- Bỏ: thùng rác lịch sử (xóa hẳn), "Comment mẫu" hàng loạt cũ (tool_face đã có seeding comment), toàn bộ đăng bài/lịch đăng cũ (tool_face có bản mạnh hơn), trang đăng nhập/tài khoản cũ.
- Dữ liệu cũ trong PostgreSQL của comment-ai-bot KHÔNG tự chuyển sang; nếu cần phải viết script nhập riêng.

## 5. Việc cần làm tiếp (ưu tiên)
1. `npm install` cả server và client, chạy `next build` và sửa lỗi nếu có; thử toàn bộ 6 trang với Fanpage thật (kết nối qua mục Kênh).
2. Thử webhook thật (Callback URL + `FB_VERIFY_TOKEN`) và quét 2 phút; xác nhận token có `pages_read_user_content` (xem trang Chẩn đoán đầy đủ). Lưu ý: kết nối Page của tool_face bằng token do người dùng dán, nên scope phụ thuộc token đó (có thể đặt `FACEBOOK_LOGIN_SCOPES`).
3. Chạy trên SQL Server thật để kiểm tra DDL (`init-db.sql`, `CommentAiSchema.js`) và các truy vấn (chỉ mới thử qua SQLite).
4. Cân nhắc đưa trả lời AI vào BullMQ (hiện chạy trực tiếp trong tiến trình server như TokenHealthCheck), thông báo Telegram khi AI lỗi, và phân quyền Fanpage theo từng nhân viên.
5. Rủi ro bảo mật trong tool_face cần xem lại trước khi mở ra Internet: `/api/auth/register` mở đăng ký cho bất kỳ ai; CORS cho phép mọi origin kèm credentials; `SESSION_SECRET` mặc định trong `docker-compose.yml`; `baseURL` axios của client viết cứng `http://localhost:5000`.
6. Chưa làm: model AI miễn phí không ổn định (khuyến nghị dùng model cố định), độ trễ/giới hạn tốc độ theo cấu hình giao diện, đa kênh (Instagram/Zalo…), đơn hàng, giao diện chọn nhiều bài từ nhóm cùng lúc.
