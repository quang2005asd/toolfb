# 🚀 Tool Face — Facebook & TikTok Automation Suite

Hệ thống quản lý, lập lịch bài đăng và tự động hoá Fanpage Facebook & **TikTok** chuyên nghiệp. Tích hợp AI Studio sáng tạo nội dung, tải lên hàng loạt từ file Excel, kịch bản seeding bình luận tự động, quản lý đa tài khoản và giao diện **Apple Frosted Glass** hiện đại hỗ trợ cả **Tone Trắng (Light Mode)** và **Giao diện Tối (Dark Mode)**.

---

## 🌟 Tính Năng Nổi Bật

- 📅 **Lập lịch đăng bài thông minh:** Hỗ trợ bài viết đơn lẻ hoặc hàng loạt với kiểm duyệt nội dung trước khi xuất bản — cả **Facebook lẫn TikTok**.
- 📊 **Tải lên hàng loạt từ Excel (Bulk Upload):** Kiểm tra tính hợp lệ của từng dòng dữ liệu, xem trước nội dung và ảnh media trực quan.
- 💬 **Seeding bình luận tự động:** Tự động trả lời, gắn thẻ và seeding tương tác theo chu kỳ định sẵn.
- 🎨 **AI Studio & Sáng tạo ảnh:** Tích hợp mô hình AI tạo bài viết theo nhiều giọng văn, gắn hashtag và emoji tự động.
- 👥 **Quản lý đa Fanpage, Nick Facebook & Tài khoản TikTok:** Phân quyền token riêng lẻ hoặc đồng bộ theo tài khoản cá nhân.
- 🎵 **Đăng video lên TikTok tự động:** Kết nối tài khoản TikTok qua Puppeteer (không cần API chính thức), lên lịch đăng video với caption & hashtag.
- 🌗 **Giao diện Apple Frosted Glass:** Tinh chỉnh chuẩn mực với hiệu ứng kính mờ cao cấp, mượt mà ở cả Tone Trắng kem và Dark Mode bóng đêm.
- 🐳 **Đóng gói Docker Compose toàn diện:** Triển khai cả hệ thống (Frontend, Backend, Worker, Redis, SQLite) chỉ với **1 lệnh duy nhất**.

---

## 🎵 Tích Hợp TikTok

Hệ thống hỗ trợ đăng video lên TikTok thông qua Puppeteer (tự động hoá trình duyệt), không phụ thuộc vào TikTok API chính thức.

### Kiến Trúc TikTok

```
[Frontend Compose]
    └─> Chọn nền tảng "TikTok" + tài khoản TikTok
    └─> Upload video lên server (/api/upload)
    └─> Tạo bài đăng (/api/posts) với platform="tiktok"
            │
[BullMQ Worker / Scheduler]
    └─> Phát hiện bài đăng TikTok đến giờ đăng
    └─> Gọi TikTokPuppeteerService.executePublishTikTokPost()
            │
[Puppeteer / Chromium]
    └─> Mở trình duyệt ẩn → đăng nhập TikTok bằng cookie đã lưu
    └─> Upload video → điền caption + hashtag → Xuất bản
```

### Cách Kết Nối Tài Khoản TikTok

1. Vào trang **Kênh → Tab TikTok**.
2. Bấm nút **"Kết nối TikTok"** — trình duyệt Chromium sẽ mở ra trang đăng nhập TikTok.
3. Đăng nhập TikTok bằng tài khoản của bạn (hỗ trợ cả đăng nhập bằng điện thoại / email / QR Code).
4. Sau khi đăng nhập thành công, hệ thống tự động lưu cookie phiên đăng nhập.
5. Tài khoản sẽ xuất hiện trong danh sách với trạng thái **"Đã kết nối"**.

> **Lưu ý:** Cookie TikTok được mã hóa và lưu trữ an toàn trong database. Tuy nhiên, TikTok có thể vô hiệu hóa phiên bất kỳ lúc nào — hãy kết nối lại nếu tài khoản báo "Mất kết nối".

### Cách Đăng Bài Lên TikTok

1. Vào trang **Lên Lịch → Soạn Bài**.
2. Chọn **nền tảng "TikTok"** ở bộ chọn Platform.
3. Chọn **tài khoản TikTok** từ danh sách tài khoản đã kết nối.
4. Upload **file video** (định dạng MP4/MOV, tối đa theo giới hạn TikTok).
5. Nhập **caption** và **hashtag** (không bắt buộc).
6. Chọn thời gian đăng → Bấm **Lên Lịch**.

Hệ thống sẽ tự động đăng video vào đúng giờ đã đặt thông qua BullMQ Worker.

### Yêu Cầu Hệ Thống Cho TikTok (Puppeteer)

| Thành phần | Yêu cầu |
|---|---|
| **Chromium** | Tự động tải về khi `npm install` (gói `puppeteer`) |
| **RAM** | Khuyến nghị tối thiểu **2 GB** (Chromium chạy ngầm) |
| **VPS** | Cần cài thêm thư viện hệ thống cho Chromium headless trên Linux |
| **Docker** | Dockerfile đã tích hợp sẵn các thư viện Chromium headless |

> **Trên VPS Linux (không dùng Docker):** Chạy lệnh sau để cài thư viện hệ thống cần thiết:
> ```bash
> apt-get install -y libx11-xcb1 libxcomposite1 libxdamage1 libxrandr2 \
>   libgbm1 libpango-1.0-0 libcairo2 libasound2 libatk1.0-0 libnss3 \
>   libxss1 libgtk-3-0 fonts-liberation
> ```

---

## 📋 Yêu Cầu Hệ Thống

| Phần mềm | Tùy chọn Docker (Khuyến nghị) | Tùy chọn Chạy Thủ Công (Local Dev) |
|---|---|---|
| **Hệ điều hành** | Windows / macOS / Linux | Windows 10/11 / macOS / Linux |
| **Docker Desktop** | Khuyên dùng (có sẵn Docker Compose) | Không bắt buộc |
| **Node.js** | Không cần cài | `>= 18.x` |
| **Redis** | Tự động chạy trong Docker | `7.x` |
| **Database** | Mặc định SQLite (Zero-config) | SQLite hoặc SQL Server 2019+ |

---

## 🚀 Cách 1: Triển Khai Nhanh Bằng Docker Compose (Khuyến nghị)

> **Dành cho mọi thành viên trong team:** Không cần cài Node.js, không cần cấu hình SQL Server phức tạp. Chỉ cần mở Docker Desktop và chạy lệnh.

### 1. Khởi động toàn bộ hệ sinh thái

Mở Terminal tại thư mục `tool_face` và chạy:

```bash
docker compose up -d --build
```

*(Hoặc `docker-compose up -d --build` tùy phiên bản Docker)*

Hệ thống sẽ tự động khởi tạo 4 dịch vụ:
- 🌐 **Frontend (`tool-face-client`):** Truy cập tại **http://localhost:3000** (Phục vụ qua Nginx tối ưu siêu nhẹ).
- ⚙️ **Backend API (`tool-face-server`):** Lắng nghe tại **http://localhost:5000**.
- 📬 **Redis (`tool-face-redis`):** Queue engine port `6379`.
- ⚡ **Worker (`tool-face-worker`):** Tiến trình ngầm xử lý hàng đợi đăng bài và bình luận tự động.

### 2. Các lệnh quản lý Docker hữu ích

| Nhu cầu | Lệnh |
|---|---|
| **Xem log trực tiếp** | `docker compose logs -f` |
| **Xem log của riêng backend** | `docker compose logs -f server` |
| **Xem log của worker đăng bài** | `docker compose logs -f worker` |
| **Tạm dừng hệ thống** | `docker compose stop` |
| **Khởi động lại** | `docker compose restart` |
| **Tắt và dọn dẹp container** | `docker compose down` |
| **Dọn dẹp sạch cả database volume** | `docker compose down -v` |

---

## 🌍 Chạy Thật Cho Người Dùng (VPS + Tên Miền + HTTPS)

Bản `docker-compose.yml` ở trên chỉ dành cho chạy thử trên máy. Khi đưa lên Internet dùng `docker-compose.prod.yml` (Caddy tự cấp HTTPS, bắt buộc đặt mật khẩu admin, khóa bí mật riêng, trang Chính sách / Điều khoản / Xóa dữ liệu cho Meta):

- Hướng dẫn từng bước: [deploy/HUONG-DAN-VPS.md](deploy/HUONG-DAN-VPS.md)
- Cấu hình Meta App, xác minh doanh nghiệp, App Review: [deploy/META-APP-REVIEW.md](deploy/META-APP-REVIEW.md)

---

## 💻 Cách 2: Chạy Thủ Công Từng Phần (Local Development)

Nếu bạn cần sửa code frontend hoặc backend liên tục (Hot Reload):

### Bước 1 — Khởi chạy Redis

```bash
docker run -d --name redis-toolfb -p 6379:6379 redis:7-alpine
```
*(Nếu container đã tạo từ trước, chỉ cần: `docker start redis-toolfb`)*

### Bước 2 — Cài đặt thư viện dependencies

```bash
# Terminal 1: Cài đặt Backend
cd server
npm install

# Terminal 2: Cài đặt Frontend
cd client
npm install
```

### Bước 3 — Cấu hình môi trường (`server/.env`)

Tạo file `server/.env` (tham khảo mẫu tại `server/.env.example`):

```env
CLIENT_ORIGIN=http://localhost:3000
PORT=5000

# Chế độ Database: Mặc định bật SQLite để chạy ngay lập tức không cần cài SQL Server
USE_SQLITE=true
DB_TYPE=sqlite

# Kết nối Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Cấu hình Facebook App (nếu sử dụng tính năng Facebook Login OAuth)
FACEBOOK_APP_ID=
FACEBOOK_APP_SECRET=
FACEBOOK_REDIRECT_URI=http://localhost:5000/api/auth/facebook/callback
```

> **Ghi chú về SQL Server:** Nếu muốn dùng Microsoft SQL Server thay vì SQLite, đặt `USE_SQLITE=false` và điền `DB_SERVER=localhost`, `DB_NAME=tool_face_db`.

### Bước 4 — Khởi chạy ứng dụng

Mở 3 cửa sổ Terminal riêng biệt:

```bash
# Terminal 1: Chạy Server Backend (Port 5000)
cd server
npm run dev

# Terminal 2: Chạy Worker Queue xử lý đăng bài
cd server
npm run worker

# Terminal 3: Chạy Client Frontend (Port 3000)
cd client
# npm run dev tự gọi API ở http://localhost:5000 (đổi địa chỉ khác: đặt NEXT_PUBLIC_API_ORIGIN)
npm run dev
```

Truy cập: **http://localhost:3000**

---

## 📁 Cấu Trúc Dự Án

```
tool_face/
├── docker-compose.yml          # Docker Compose toàn diện cho cả hệ thống
├── README.md                   # Tài liệu hướng dẫn sử dụng
├── ecosystem.config.js         # Cấu hình PM2 cho môi trường VPS
│
├── client/                     # FRONTEND (Next.js 16 + React 19)
│   ├── Dockerfile              # Multi-stage Dockerfile (Nginx)
│   ├── nginx.conf              # Cấu hình Web Server Nginx & Reverse Proxy
│   ├── src/
│   │   ├── pages/              # Các trang giao diện (Dashboard, Compose, Channels...)
│   │   ├── components/         # Layout & thành phần giao diện dùng chung
│   │   ├── context/            # AuthContext, ThemeContext (Đồng bộ Dark/Light)
│   │   ├── services/           # Axios API clients
│   │   └── styles/             # globals.css (Hệ thống thiết kế Apple Frosted Glass)
│   └── package.json
│
├── server/                     # BACKEND (Node.js Express + BullMQ)
│   ├── Dockerfile              # Dockerfile backend & worker
│   ├── src/                    # API routes, controllers, middleware
│   ├── config/
│   │   ├── db.js               # Kết nối CSDL (SQLite / MSSQL) & Redis
│   │   └── sqliteAdapter.js    # Trình tương thích SQLite không cần cài SQL Server
│   ├── queues/                 # Hàng đợi BullMQ (post.worker.js, comment.worker.js, start.workers.js)
│   ├── data/                   # Thư mục lưu database SQLite tự động
│   ├── uploads/                # Thư mục lưu ảnh / video đính kèm
│   └── package.json
│
└── desktop/                    # DESKTOP APP (Electron wrapper)
    ├── main.js
    └── package.json
```

---

## 🌐 Danh Sách Cổng Kết Nối (Ports)

| Dịch vụ | Cổng (Port) | Chức năng |
|---|---|---|
| **Frontend Web** | `3000` | Giao diện người dùng Next.js |
| **Backend API** | `5000` | REST API Express.js |
| **Redis** | `6379` | Hàng đợi công việc BullMQ |
| **SQL Server** | `1433` | Cơ sở dữ liệu (tùy chọn khi không dùng SQLite) |

---

## ❓ Xử Lý Lỗi Thường Gặp (Troubleshooting)

### 1. `docker compose up` báo lỗi port đã bị chiếm dụng (Port 3000 / 5000 / 6379 already in use)
→ Do bạn đang chạy ứng dụng trực tiếp bằng `npm run dev` hoặc Redis đang chạy ở ngoài. Hãy tắt các tiến trình Terminal cũ hoặc đổi port ánh xạ trong `docker-compose.yml`.

### 2. Không cần cài SQL Server có chạy được không?
→ **Có!** Hệ thống đã tích hợp sẵn SQLite Adapter. Khi `USE_SQLITE=true` (mặc định trong Docker), database sẽ tự động khởi tạo trong thư mục `server/data/tool_face.db`.

### 3. Giao diện bị mất màu ở Dark Mode?
→ Toàn bộ hệ thống giao diện đã được chuẩn hoá với Apple Frosted Glass tokens trong `client/src/styles/globals.css`. Hãy xóa cache trình duyệt (`Ctrl + F5`) để nhận CSS mới nhất.

### 4. Đăng nhập lần đầu bằng tài khoản nào?
→ Hệ thống tự tạo sẵn tài khoản Quản trị viên **`admin` / `1`**. Hãy đổi mật khẩu tại **Cài đặt → Hồ sơ & bảo mật** sau lần đăng nhập đầu tiên. Người dùng mới có thể tự đăng ký (vai trò Thành viên) hoặc được Quản lý / Quản trị viên tạo tại trang **Thành viên**.

### 5. Phân quyền hoạt động thế nào?
| Vai trò | Quyền hạn |
|---|---|
| **Quản trị viên (Admin)** | Toàn quyền: cấu hình AI / Telegram / lịch đăng, quản lý Quản lý & Thành viên, xem toàn bộ bài đăng, cấp quyền Admin cho tài khoản khác |
| **Quản lý (Manager)** | Tạo / sửa / khóa / xóa Thành viên, xem & điều phối bài đăng của Thành viên |
| **Thành viên (User)** | Các chức năng cơ bản: viết bài, lên lịch, AI Studio, quản lý Fanpage của mình |

Mỗi vai trò chỉ quản lý được vai trò **thấp hơn** — Admin không thể sửa hay xóa tài khoản của Admin khác. Định nghĩa vai trò nằm trong `server/src/utils/Roles.js`.

### 6. Hộp thư Messenger + Instagram (trang **Tin nhắn**) hoạt động thế nào?
- Xem và trả lời tin nhắn khách gửi vào các Fanpage (Messenger) và tài khoản Instagram liên kết với Fanpage (Instagram Direct); tin trả lời từ tool hiện trên Facebook / Instagram và ngược lại.
- Token Fanpage cần quyền **`pages_messaging`** (và **`instagram_manage_messages`** cho Instagram). Riêng Instagram còn phải bật **"Cho phép truy cập tin nhắn"** trong ứng dụng Instagram (Cài đặt → Tin nhắn và lượt phản hồi tin → Công cụ đã kết nối). Trạng thái liên kết từng Fanpage / Instagram hiện ở đầu trang Tin nhắn và tab **Kênh → Instagram**.
- **Tự động đồng bộ mỗi `MESSENGER_SYNC_INTERVAL_SECONDS` giây** (mặc định 5, đặt 0 để tắt) ngay trên server, không cần mở trang hay bấm nút. Khi Facebook báo giới hạn tần suất hoặc lỗi tạm thời, hệ thống tự giãn nhịp (30 giây → 5 phút) rồi quay lại nhịp cũ.
- Khi deploy có domain HTTPS: khai báo webhook trong Meta App với Callback URL `https://<domain>/api/webhooks/messenger` và Verify Token = `MESSENGER_VERIFY_TOKEN` (cần `FACEBOOK_APP_SECRET`) để nhận tin gần như tức thì.
- Facebook chỉ cho Page trả lời trong **24 giờ** kể từ tin nhắn cuối của khách; quá hạn, tool sẽ cảnh báo và hiển thị lỗi rõ ràng.

### 7. Trả lời tự động hoạt động thế nào?
Bấm nút **Trả lời tự động** cạnh nút "Đồng bộ ngay" ở trang Tin nhắn để bật cho từng Fanpage (Messenger và/hoặc Instagram).
- Trả lời **mọi** tin nhắn mới của khách — kể cả tin vô nghĩa như "shgagdwy"; khách nhắn liên tiếp nhiều tin thì nhận một câu trả lời cho cả cụm.
- Chỉ trả lời tin gửi **sau** lúc bật (không trả lời tin cũ), mỗi tin một lần, và bỏ qua nếu nhân viên đã trả lời trước.
- Hai cách trả lời: **mẫu cố định** (có biến `{ten_khach}`, `{ten_page}`) hoặc **AI tự soạn** theo hướng dẫn riêng (dùng AI API Key ở Cài đặt; AI lỗi thì tự dùng mẫu dự phòng nên luôn có câu trả lời).
- Tin trả lời tự động hiện màu tím kèm nhãn "Trả lời tự động" trong hội thoại.

### 8. Fanpage báo "Mất quyền" / token hết hạn?
Token lấy từ Graph API Explorer là **token ngắn hạn, chỉ sống 1–2 giờ**; token Fanpage lấy từ nó cũng hết hạn theo. Facebook **không cho làm mới một token đã hết hạn**, nên cách bền vững là:
1. Quản trị viên nhập **App ID & App Secret** của Meta App tại **Cài đặt → Hồ sơ & bảo mật → Meta App** (lấy ở Meta for Developers → Cài đặt ứng dụng → Thông tin cơ bản).
2. Kết nối lại một lần (nút **Đăng nhập lại Facebook** hoặc dán token tạo từ *đúng app đó* trong Graph API Explorer).

Từ đó tool tự đổi sang **token dài hạn (~60 ngày)**; token Fanpage lấy từ token dài hạn **không hết hạn**. Tool tự kiểm tra mỗi 30 phút, tự lấy lại token Fanpage khi bị lỗi (cả khi đăng bài, nhắn tin hay bấm "Kiểm tra Token"), và hiển thị hạn dùng từng nick ở trang **Kênh**. Để dùng "Đăng nhập lại Facebook 1 chạm", thêm `http://localhost:5000/api/auth/facebook/callback` vào *Valid OAuth Redirect URIs* của Meta App.

### 9. Đăng nhập Facebook báo lỗi App ID?
→ Facebook không dùng để đăng nhập vào tool (tool dùng tài khoản riêng). Facebook Login chỉ dùng để kết nối / lấy lại token Fanpage và cần App ID & App Secret như mục 8.

### 10. TikTok báo "Mất kết nối" / cookie hết hạn?
TikTok sử dụng cookie phiên đăng nhập. Cookie có thể hết hạn vì các lý do:
- **TikTok đăng xuất từ xa** (bảo mật tài khoản, đổi mật khẩu, đăng nhập thiết bị khác).
- **Cookie hết thời hạn sống** (thường sau vài tuần nếu không hoạt động).

→ Vào **Kênh → TikTok**, bấm **"Kết nối lại"** và đăng nhập lại để làm mới cookie.

### 11. Chromium không khởi động được khi chạy TikTok trên VPS?
Nguyên nhân thường gặp trên VPS Linux:
- Thiếu thư viện hệ thống cho Chromium headless.
- Không đủ RAM (Chromium cần ít nhất 512 MB mỗi phiên).
- Môi trường không có màn hình ảo (`DISPLAY`).

→ **Giải pháp:**
1. Đảm bảo đã cài thư viện hệ thống (xem mục **Tích Hợp TikTok** bên trên).
2. Nếu dùng Docker, kiểm tra trong Dockerfile đã có `--no-sandbox` và `--disable-dev-shm-usage`.
3. Tăng RAM cho VPS hoặc thêm swap file:
```bash
# Tạo 2 GB swap
fallocate -l 2G /swapfile && chmod 600 /swapfile
mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```
