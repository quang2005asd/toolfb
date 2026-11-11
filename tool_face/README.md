# Tool Social (Tool Face)

Quản lý Fanpage Facebook, Instagram và TikTok trên một giao diện: lên lịch đăng bài, đăng hàng loạt từ Excel, seeding bình luận, hộp thư Messenger / Instagram, trả lời tự động, AI Studio viết bài, AI Bình luận. Bản chạy thật: https://toolsocial.store.

> Quy tắc làm việc nhóm (cách push lên `main`, kiểm tra trước khi push, những thư mục không được di chuyển): xem [README ở thư mục gốc repo](../README.md).

---

## Tính năng (theo menu)

| Menu | Chức năng |
|---|---|
| **Bảng tin** | Tổng quan bài đăng, kênh, tin nhắn |
| **AI Studio** | Viết bài theo giọng văn, gắn hashtag / emoji, tạo ảnh AI, kiểm duyệt nội dung theo ngành, KB-facts (kho dữ kiện khách hàng / sản phẩm) |
| **Viết bài** (`/post-planner/write`) | Chọn chức năng từ lớn đến nhỏ: **Viết thường** (một bài: chữ, ảnh, album, video, Reels, Tin; Facebook & TikTok; bình luận mồi) · **Viết hàng loạt** — *TikTok · Reels · Shorts*, *Ảnh & video thường*, *Tin (Story)*: tải nhiều file, mỗi file một bài, tự giãn giờ đăng; hoặc *Nhập từ file Excel* · **Viết blog** (bài dài có tiêu đề / các mục / ảnh bìa, AI lập dàn ý & viết, tự lưu nháp) |
| **Lịch đăng / Bài đăng** | Xem lịch, danh sách, trạng thái từng bài |
| **Tin nhắn** | Hộp thư Messenger + Instagram Direct, trả lời tự động (mẫu cố định hoặc AI), câu hỏi gợi ý (Ice Breakers) |
| **Báo cáo** | Báo cáo kênh: lượt xem (tách trả phí / tự nhiên, người theo dõi / người lạ), người xem, tương tác, người theo dõi mới, bài đã đăng — so với kỳ trước, 7 / 14 / 30 ngày, bài viết nổi bật |
| **AI Bình luận** | Tự trả lời bình luận trên Fanpage bằng mẫu / AI, khách hàng, khách tiềm năng, nhật ký, chẩn đoán |
| **Kênh** | **Kết nối Facebook** (app chung, chọn mức quyền, chọn Fanpage), Instagram, TikTok, nhóm kênh; Meta App riêng ở mục Nâng cao |
| **Thành viên** | Quản lý tài khoản (Admin / Quản lý) |
| **Cài đặt** | Hồ sơ & mật khẩu; AI API Key, Telegram, lịch đăng, **Meta App chung** (Admin) |

Trang công khai: trang giới thiệu, đăng nhập / đăng ký, Chính sách quyền riêng tư, Điều khoản, Xóa dữ liệu (Meta bắt buộc).

---

## Cấu trúc thư mục

```
tool_face/
├── server/                         BACKEND — Node.js 20, Express 4, BullMQ
│   ├── src/
│   │   ├── app.js                  Toàn bộ REST API + khởi động tác vụ nền (đồng bộ tin nhắn, gia hạn token, hẹn giờ đăng bài…)
│   │   ├── middlewares/auth.js     Phiên đăng nhập (cookie ký HMAC), requireAuth / requirePermission
│   │   ├── modules/
│   │   │   ├── comment-ai/         AI Bình luận: /api/comment-ai/*, webhook /api/webhooks/facebook
│   │   │   ├── kb/                 KB-facts của AI Studio: /api/kb/* (module tùy chọn, lỗi chỉ tắt phần này)
│   │   │   └── excel-parser/       Đọc file Excel đăng hàng loạt
│   │   ├── utils/                  Dịch vụ nghiệp vụ (bảng bên dưới)
│   │   └── rules/                  Luật kiểm duyệt nội dung (content-rules.json)
│   ├── config/                     db.js (SQLite hoặc SQL Server + Redis), sqliteAdapter.js (dịch T-SQL → SQLite, schema SQLite)
│   ├── queues/                     Hàng đợi BullMQ: post, comment, tiktok, authlog — start.workers.js chạy tất cả
│   ├── scripts/                    Vận hành: backup-db.js, init-db.sql (SQL Server), migrate-*, rotate-session-secret.js,
│   │                               generate-sample-excel.js — còn test-* / benchmark-* / audit-* / run-*: đo chất lượng AI Studio
│   ├── eval/                       Dữ liệu đánh giá AI Studio
│   └── tests/                      Unit test (node --test)
│
├── client/                         FRONTEND — Next.js 16 (Pages Router, xuất trang tĩnh), React 19, JavaScript
│   ├── src/pages/                  Mỗi file là một trang (đường dẫn = tên file)
│   ├── src/components/             layout/, channels/, write/ (thanh Viết bài), charts/ (biểu đồ Báo cáo), settings/, inbox/, comment-ai/…
│   ├── src/styles/features.css     CSS của các tính năng mới (kết nối Facebook, Báo cáo, Viết bài) — tách khỏi globals.css cho ít xung đột
│   ├── src/services/               Gọi API bằng axios; apiBase.js chọn địa chỉ API
│   ├── src/context/, hooks/, utils/  AuthContext / ThemeContext, useAuth, phân quyền phía giao diện…
│   ├── src/styles/globals.css      Hệ thống giao diện (class panel, button, field, status-pill, step-strip…)
│   └── nginx.conf                  Phục vụ trang tĩnh, chuyển /api sang server
│
├── deploy/                         Đưa lên VPS: HUONG-DAN-VPS.md, META-APP-REVIEW.md, nginx/, auto-deploy/, Caddyfile
├── eval/                           Bản công khai của dữ liệu đánh giá AI Studio
├── AI_DOCUMENTATION.md             Tài liệu kỹ thuật AI Studio (sinh bài, kiểm duyệt, KB-facts)
├── Mau_Upload_Bai_Dang.xlsx        File mẫu đăng hàng loạt (tạo bằng server/scripts/generate-sample-excel.js)
├── docker-compose.yml              Chạy thử trên máy
├── docker-compose.shared.yml       VPS dùng chung với website khác — bản đang chạy thật
├── docker-compose.prod.yml         VPS riêng, Caddy tự cấp HTTPS
└── .env.production.example         Mẫu .env cho VPS
```

### `server/src/utils/` theo nhóm

| Nhóm | File |
|---|---|
| Facebook & token | `FacebookPageConnections`, `FacebookTokenService` (gia hạn mỗi 30 phút), `FacebookPageAccessToken`, `FacebookLoginStatusService`, `FacebookScheduleService`, `TokenHealthCheckService` |
| Đăng bài | `PostExecutionService` (đăng lên Facebook / chuyển TikTok vào hàng đợi), `StandaloneScheduler` (quét bài đến giờ mỗi 10 giây), `PostStateMachine`, `DateParsers` |
| Báo cáo | `ReportService` (chỉ số Lượt xem / Người xem của Meta, so kỳ trước, nhớ tạm 30 phút) |
| Tin nhắn | `MessengerService`, `MessengerAutoReplyService`, `MessengerIceBreakerService`, `InstagramService` |
| TikTok | `TikTokService`, `TikTokPuppeteerService` (đăng bằng Chromium tự động) |
| AI Studio | `AiContentGenerator`, `AiClientService`, `AiConversationService`, `AiImageService`, `TopicPackService`, `WebSearchService`, `ContentValidator`, `ClaimExtractor`, `KbFactsService` |
| AI Bình luận | `CommentAiCore`, `CommentAiService`, `CommentAiLeadService`, `CommentAiSchema` |
| Tài khoản & hệ thống | `AppUserService`, `Roles`, `SettingsService`, `ChannelGroupService`, `TelegramAlertService`, `ssrfValidator` |

---

## Chạy trên máy

> Không chạy bản trên máy cùng lúc với bản VPS bằng cùng Fanpage / token thật (hai nơi sẽ cùng tự trả lời và cùng đăng bài).

### Cách 1 — Docker (khuyến nghị)

1. Tạo file `.env` cạnh `docker-compose.yml`, tối thiểu:
   ```env
   SESSION_SECRET=<chuỗi ngẫu nhiên ≥ 32 ký tự, ví dụ từ: openssl rand -hex 32>
   ```
2. Chạy:
   ```bash
   docker compose up -d --build                    # redis + server + client
   docker compose --profile queue up -d --build    # thêm worker (cần khi đăng TikTok)
   ```
3. Mở http://localhost:3000 (API ở http://localhost:5000, Redis ở cổng 6380). Đăng nhập `admin` / `1` rồi đổi mật khẩu.

Lệnh hay dùng: `docker compose logs -f server`, `docker compose restart`, `docker compose down`. **Không** dùng `docker compose down -v` nếu muốn giữ dữ liệu (lệnh này xóa CSDL).

### Cách 2 — Chạy thủ công (sửa code, tự tải lại)

```bash
docker run -d --name redis-toolfb -p 6379:6379 redis:7-alpine   # Redis

cd server
cp .env.example .env        # rồi thêm dòng USE_SQLITE=true (mẫu mặc định trỏ tới SQL Server)
npm install
npm run dev                 # API ở cổng 5000
npm run workers             # (cửa sổ khác) worker đăng bài, bình luận, TikTok

cd client
npm install
npm run dev                 # http://localhost:3000, tự gọi API ở http://localhost:5000
```

- CSDL mặc định là SQLite, file `server/data/tool_face.sqlite`, tự tạo bảng khi khởi động. Muốn dùng SQL Server: bỏ `USE_SQLITE`, điền `DB_SERVER`, `DB_NAME` và chạy `server/scripts/init-db.sql`.
- Không muốn chạy Redis: thêm `DISABLE_REDIS=true` vào `server/.env` — bài hẹn giờ và seeding bình luận do `StandaloneScheduler` trong server xử lý, TikTok dùng hàng đợi trong bộ nhớ.
- Unit test: `cd server && node --test tests/scheduler-time.test.js` (đừng chạy `node --test` không kèm tên file: nó sẽ chạy cả các script `scripts/test-*.js` gọi AI thật).

---

## Đưa lên VPS

| Trường hợp | File compose | Hướng dẫn |
|---|---|---|
| VPS dùng chung với website khác (nginx sẵn có) — **bản đang chạy thật**, tự deploy khi `main` có commit mới | `docker-compose.shared.yml` | [deploy/HUONG-DAN-VPS.md § 9b](deploy/HUONG-DAN-VPS.md), `deploy/nginx/`, `deploy/auto-deploy/` |
| VPS riêng, Caddy tự cấp HTTPS | `docker-compose.prod.yml` | [deploy/HUONG-DAN-VPS.md](deploy/HUONG-DAN-VPS.md), `deploy/Caddyfile` |
| Cấu hình Meta App, xác minh doanh nghiệp, App Review | — | [deploy/META-APP-REVIEW.md](deploy/META-APP-REVIEW.md) |

File mẫu cấu hình:

| File mẫu | Sao chép thành | Dùng khi |
|---|---|---|
| `server/.env.example` | `server/.env` | Chạy thủ công trên máy |
| `.env.production.example` | `.env` cạnh file compose | VPS |
| `deploy/auto-deploy/deploy.conf.example` | `/opt/toolsocial/.deploy.conf` | Tự động deploy trên VPS |

`SESSION_SECRET` vừa ký phiên đăng nhập vừa mã hóa token Facebook trong CSDL: **không đổi** sau khi đã kết nối Fanpage. Cần đổi thì dùng `server/scripts/rotate-session-secret.js` (mã hóa lại toàn bộ token).

---

## Quy ước code (đọc trước khi sửa)

**Server**
- Truy cập CSDL theo kiểu `mssql`: `pool.request().input('x', sql.Int, x).query('... @x ...')`. Code chạy được trên cả SQL Server lẫn SQLite nhờ `config/sqliteAdapter.js`, nên chỉ dùng cú pháp T-SQL mà adapter dịch được: `TOP n`, `OFFSET … FETCH`, `OUTPUT INSERTED.id`, `UPDATE …; IF @@ROWCOUNT = 0 INSERT …`. Ghi thời gian bằng tham số (chuỗi ISO / `DateTime2`), đừng dựa vào `DEFAULT`.
- **Bảng mới**: khai báo ở cả `sqliteAdapter.js` (`SCHEMA_DDL`) và `scripts/init-db.sql` (hoặc hàm `ensure…Schema`). **Cột mới cho bảng đã có**: thêm vào `COLUMN_MIGRATIONS` trong `sqliteAdapter.js` (`CREATE TABLE IF NOT EXISTS` không tự thêm cột cho CSDL cũ).
- **Đăng bài / bình luận**: server (`StandaloneScheduler`) và worker (BullMQ) cùng có thể xử lý một bài. Mọi luồng đăng mới phải "giữ chỗ" trước khi gọi Facebook: `UPDATE … SET status = 'publishing' OUTPUT INSERTED.id WHERE id = @id AND status IN ('pending','scheduled')` — không giữ được chỗ thì bỏ qua. Làm vậy để bài không bị đăng hai lần.
- **Phân quyền**: ba vai trò `admin` > `manager` > `user` khai báo trong `src/utils/Roles.js`; API kiểm tra bằng `requireAuth` / `requirePermission(PERMISSIONS.…)`. Mỗi vai trò chỉ quản lý được vai trò thấp hơn.
- **Module tùy chọn**: phần riêng của từng người (ví dụ `modules/kb`) nạp trong `try/catch` hoặc `optionalModule()`, để thiếu file / lỗi chỉ tắt phần đó.
- Không ghi bí mật vào code hay log; token Facebook luôn lưu dạng mã hóa (AES-GCM).

**Client**
- Next.js Pages Router, `output: 'export'` (không có API route, không có server-side rendering), JavaScript thuần. Đọc `client/AGENTS.md` trước khi dùng API Next.js lạ — bản 16 khác nhiều so với tài liệu cũ.
- Gọi API qua `src/services/*Api.js` (dùng `API_BASE` trong `apiBase.js`), không viết cứng `http://localhost:5000`.
- Dùng class sẵn có trong `globals.css` (`panel`, `button button-primary`, `field`, `status-pill`…) để giao diện đồng nhất ở cả chế độ sáng / tối.

---

## Câu hỏi thường gặp

**Đăng nhập lần đầu bằng tài khoản nào?**
Hệ thống tự tạo `admin`. Trên máy mật khẩu là `1`; trên VPS là `ADMIN_PASSWORD` trong `.env` (bắt buộc, ≥ 8 ký tự). Người dùng mới tự đăng ký (vai trò Thành viên) hoặc được Admin / Quản lý tạo ở trang **Thành viên**.

**Phân quyền hoạt động thế nào?**

| Vai trò | Quyền |
|---|---|
| Quản trị viên (admin) | Toàn quyền: cấu hình AI / Telegram / lịch đăng, quản lý Quản lý & Thành viên, xem toàn bộ bài đăng, cấp quyền Admin |
| Quản lý (manager) | Tạo / sửa / khóa / xóa Thành viên, xem & điều phối bài đăng của Thành viên |
| Thành viên (user) | Viết bài, lên lịch, AI Studio, quản lý Fanpage của mình |

**Kết nối Facebook hoạt động thế nào?**
- Admin nhập **Meta App chung** của tool (App ID + Khóa bí mật, ví dụ app “Tool Social”) ở **Cài đặt → Meta App chung**; không nhập thì tool dùng `FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET` trong `.env`. Trang đó liệt kê sẵn các địa chỉ cần khai báo trong Meta App (miền, URI chuyển hướng, webhook, URL xóa dữ liệu…).
- Người dùng chỉ cần bấm **Kênh → Kết nối Facebook** → chọn **Quyền đầy đủ** (đăng bài, báo cáo, tin nhắn, bình luận) hoặc **Quyền tối giản** (chỉ đăng bài + báo cáo) → đăng nhập Facebook → chọn Fanpage muốn dùng. Fanpage bỏ chọn không bị tự thêm lại khi gia hạn token; chọn lại ở tab Tài khoản Facebook → **Chọn Fanpage**.
- Có **Configuration ID** (app loại Doanh nghiệp → Facebook Login for Business) thì nhập ở Cài đặt → Meta App chung để hộp cấp quyền của Facebook gọn hơn; không có thì tool xin quyền theo danh sách mặc định.
- **Quan trọng:** khi app chung chưa được Meta duyệt **App Review** (Advanced Access, cần Xác minh doanh nghiệp), Facebook chỉ cấp quyền Fanpage cho nick có vai trò trong app (Admin / Developer / Người thử nghiệm). Trong thời gian chờ: thêm khách làm *Người thử nghiệm*, hoặc khách dùng **Meta App riêng** (Kênh → Nâng cao). Xem [deploy/META-APP-REVIEW.md](deploy/META-APP-REVIEW.md).
- Tool tự đổi sang token dài hạn (~60 ngày), token Fanpage lấy từ đó không hết hạn; tool tự kiểm tra mỗi 30 phút và tự lấy lại token Fanpage khi lỗi. Token ngắn hạn dán từ Graph API Explorer chỉ sống 1–2 giờ.

**Trang Báo cáo không có số liệu?**
Báo cáo dùng chỉ số “Lượt xem / Người xem” mới của Meta (`page_media_view`, `page_total_media_view_unique`…), cần token Fanpage có quyền `read_insights`. Nick kết nối trước khi có quyền này: bấm **Cấp thêm quyền** ở trang Kênh. Số liệu mỗi Fanpage được nhớ tạm 30 phút (nút **Làm mới** để lấy ngay); Facebook có thể trễ tới 48 giờ.

**Hộp thư Messenger + Instagram hoạt động thế nào?**
- Token Fanpage cần quyền `pages_messaging` (và `instagram_manage_messages` cho Instagram). Instagram còn phải bật *Cho phép truy cập tin nhắn* trong ứng dụng Instagram (Cài đặt → Tin nhắn và lượt phản hồi tin → Công cụ đã kết nối).
- Server tự đồng bộ mỗi `MESSENGER_SYNC_INTERVAL_SECONDS` giây (mặc định 5, đặt 0 để tắt), tự giãn nhịp khi Facebook báo giới hạn. Có HTTPS thì khai báo webhook để nhận tin gần như tức thì: Callback URL `https://<tên-miền>/api/webhooks/messenger`, Verify Token = `MESSENGER_VERIFY_TOKEN` (chi tiết trong `deploy/META-APP-REVIEW.md`).
- Facebook chỉ cho Page trả lời trong **24 giờ** kể từ tin cuối của khách.

**Trả lời tự động hoạt động thế nào?**
Bật cho từng Fanpage bằng nút **Trả lời tự động** ở trang Tin nhắn. Tool trả lời mọi tin mới gửi **sau** lúc bật (khách nhắn liên tiếp thì trả lời một lần cho cả cụm), bỏ qua nếu nhân viên đã trả lời trước. Hai kiểu: mẫu cố định (biến `{ten_khach}`, `{ten_page}`) hoặc AI soạn theo hướng dẫn riêng — AI lỗi thì dùng mẫu dự phòng.

**TikTok báo "Mất kết nối"?**
TikTok đăng bằng cookie phiên đăng nhập (Chromium tự động, không dùng API chính thức); cookie hết hạn khi TikTok đăng xuất từ xa, đổi mật khẩu hoặc lâu không dùng. Vào **Kênh → TikTok** → **Kết nối lại**. Mỗi trình duyệt tốn ~300–500 MB RAM; số trình duyệt chạy cùng lúc đặt bằng `TIKTOK_MAX_CONCURRENT_BROWSERS` (mặc định 2).

**Chạy TikTok trên Linux không dùng Docker bị lỗi Chromium?**
Image Docker đã có sẵn Chromium. Chạy thẳng trên Linux thì cài thêm thư viện:
```bash
apt-get install -y libx11-xcb1 libxcomposite1 libxdamage1 libxrandr2 libgbm1 libpango-1.0-0 \
  libcairo2 libasound2 libatk1.0-0 libnss3 libxss1 libgtk-3-0 fonts-liberation
```
Máy ít RAM thì thêm swap (≥ 2 GB).

**`docker compose up` báo cổng đã bị chiếm (3000 / 5000 / 6380)?**
Đang có `npm run dev` hoặc chương trình khác giữ cổng đó — tắt đi hoặc đổi cổng trong `docker-compose.yml`.

**Giao diện hiển thị sai màu sau khi cập nhật?**
Xóa cache trình duyệt (`Ctrl + F5`).
