# 🚀 Tool Face — Facebook Fanpage Automation Suite

Hệ thống quản lý, lập lịch bài đăng và tự động hoá Fanpage Facebook chuyên nghiệp. Tích hợp AI Studio sáng tạo nội dung, tải lên hàng loạt từ file Excel, kịch bản seeding bình luận tự động, quản lý đa tài khoản và giao diện **Apple Frosted Glass** hiện đại hỗ trợ cả **Tone Trắng (Light Mode)** và **Giao diện Tối (Dark Mode)**.

---

## 🌟 Tính Năng Nổi Bật

- 📅 **Lập lịch đăng bài thông minh:** Hỗ trợ bài viết đơn lẻ hoặc hàng loạt với kiểm duyệt nội dung trước khi xuất bản.
- 📊 **Tải lên hàng loạt từ Excel (Bulk Upload):** Kiểm tra tính hợp lệ của từng dòng dữ liệu, xem trước nội dung và ảnh media trực quan.
- 💬 **Seeding bình luận tự động:** Tự động trả lời, gắn thẻ và seeding tương tác theo chu kỳ định sẵn.
- 🎨 **AI Studio & Sáng tạo ảnh:** Tích hợp mô hình AI tạo bài viết theo nhiều giọng văn, gắn hashtag và emoji tự động.
- 👥 **Quản lý đa Fanpage & Nick Facebook:** Phân quyền token riêng lẻ hoặc đồng bộ theo tài khoản cá nhân.
- 🌗 **Giao diện Apple Frosted Glass:** Tinh chỉnh chuẩn mực với hiệu ứng kính mờ cao cấp, mượt mà ở cả Tone Trắng kem và Dark Mode bóng đêm.
- 🐳 **Đóng gói Docker Compose toàn diện:** Triển khai cả hệ thống (Frontend, Backend, Worker, Redis, SQLite) chỉ với **1 lệnh duy nhất**.

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

Mở Terminal tại thư mục dự án và chạy:

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
cd tool_face/server
npm install

# Terminal 2: Cài đặt Frontend
cd tool_face/client
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
cd tool_face/server
npm run dev

# Terminal 2: Chạy Worker Queue xử lý đăng bài
cd tool_face/server
npm run worker

# Terminal 3: Chạy Client Frontend (Port 3000)
cd tool_face/client
npm run dev
```

Truy cập: **http://localhost:3000**

---

## 📁 Cấu Trúc Dự Án

```
toolfb/
├── docker-compose.yml              # File Docker Compose tại gốc dự án
├── README.md                       # Tài liệu hướng dẫn sử dụng
└── tool_face/
    ├── docker-compose.yml          # Docker Compose nội bộ
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
    │   ├── queues/                 # Hàng đợi BullMQ (post.worker.js, comment.worker.js)
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

### 4. Đăng nhập Facebook báo lỗi App ID?
→ Bạn có thể đăng nhập nhanh bằng tính năng **"Đăng nhập bằng Access Token"** tại trang Login mà không bắt buộc phải tạo Facebook App.
