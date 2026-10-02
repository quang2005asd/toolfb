# 🚀 Tool Face Tuan — Facebook Fanpage Automation

Tool tự động quản lý và đăng bài lên Facebook Fanpage. Hỗ trợ lên lịch, bulk upload từ Excel, seeding comment tự động và AI Studio.

---

## 📋 Yêu cầu hệ thống

| Phần mềm | Phiên bản |
|---|---|
| **Node.js** | >= 18.x |
| **SQL Server** | 2019+ (Express hoặc Developer) |
| **Redis** | 7.x (chạy qua Docker) |
| **Docker Desktop** | >= 4.x (để chạy Redis) |

---

## ⚡ Hướng dẫn chạy (từng bước)

### Bước 1 — Bật Docker Desktop & khởi chạy Redis

Mở Docker Desktop, chờ icon 🐳 trên taskbar chuyển xanh, rồi chạy:

```bash
docker run -d --name redis-toolfb -p 6379:6379 redis:7-alpine
```

> **Lần sau** chỉ cần chạy `docker start redis-toolfb` (không cần `docker run` lại).

### Bước 2 — Tạo Database trong SQL Server

```bash
sqlcmd -S localhost -i server/scripts/init-db.sql -C
```

Lệnh này sẽ tự tạo database `tool_face_db` và 2 bảng `Posts`, `PostComments`.

### Bước 3 — Cấu hình file `.env`

File `.env` đã được tạo sẵn tại `server/.env`. Mở lên và điền các giá trị Facebook:

```env
FACEBOOK_APP_ID=your_app_id
FACEBOOK_APP_SECRET=your_app_secret
FACEBOOK_PAGE_ID=your_page_id
FACEBOOK_ADMIN_IDS=your_facebook_user_id
```

> Nếu chưa có Facebook App, có thể bỏ qua bước này — web vẫn chạy được nhưng không đăng nhập/đăng bài được.

### Bước 4 — Cài dependencies

```bash
# Terminal 1: Cài server
cd tool_face/server
npm install

# Terminal 2: Cài client
cd tool_face/client
npm install
```

### Bước 5 — Chạy ứng dụng (cần 3 terminal)

```bash
# Terminal 1: Chạy Backend API (port 5000)
cd tool_face/server
npm run dev

# Terminal 2: Chạy Worker (hàng đợi đăng bài)
cd tool_face/server
npm run worker

# Terminal 3: Chạy Frontend (port 3000)
cd tool_face/client
npm run dev
```

### Bước 6 — Mở trình duyệt

Truy cập: **http://localhost:3000**

---

## 🔧 Tóm tắt các lệnh

| Việc cần làm | Lệnh |
|---|---|
| Bật Redis (lần đầu) | `docker run -d --name redis-toolfb -p 6379:6379 redis:7-alpine` |
| Bật Redis (lần sau) | `docker start redis-toolfb` |
| Tắt Redis | `docker stop redis-toolfb` |
| Tạo database | `sqlcmd -S localhost -i server/scripts/init-db.sql -C` |
| Chạy backend | `cd server && npm run dev` |
| Chạy worker | `cd server && npm run worker` |
| Chạy comment worker | `cd server && npm run worker:comments` |
| Chạy frontend | `cd client && npm run dev` |

---

## 📁 Cấu trúc dự án

```
tool_face/
├── client/                    # Frontend (Next.js + React 19)
│   ├── src/
│   │   ├── pages/             # Các trang: dashboard, compose, calendar, AI...
│   │   ├── components/        # Layout components
│   │   ├── services/          # API client (axios)
│   │   ├── hooks/             # React hooks
│   │   └── styles/            # CSS
│   └── package.json
│
├── server/                    # Backend (Express.js)
│   ├── src/
│   │   ├── app.js             # Express server chính (port 5000)
│   │   ├── middlewares/       # Auth middleware (Facebook OAuth)
│   │   ├── modules/           # Excel parser
│   │   └── utils/             # Facebook API helpers
│   ├── config/
│   │   └── db.js              # SQL Server + Redis config
│   ├── queues/                # BullMQ workers
│   │   ├── post.worker.js     # Worker đăng bài tự động
│   │   └── comment.worker.js  # Worker seeding comment
│   ├── scripts/
│   │   └── init-db.sql        # Script tạo database
│   ├── .env                   # Cấu hình môi trường (không commit)
│   └── package.json
│
└── ecosystem.config.js        # PM2 config (production)
```

---

## 🌐 Các Port mặc định

| Service | Port |
|---|---|
| Frontend (Next.js) | `3000` |
| Backend (Express) | `5000` |
| Redis | `6379` |
| SQL Server | `1433` |

---

## ❓ Xử lý lỗi thường gặp

### `DB_SERVER và DB_NAME cần được khai báo`
→ Chưa có file `server/.env` hoặc thiếu `DB_SERVER`, `DB_NAME`. Kiểm tra lại file `.env`.

### `Redis connection refused`
→ Redis chưa chạy. Chạy `docker start redis-toolfb` hoặc kiểm tra `docker ps`.

### `ODBC Driver 17 for SQL Server not found`
→ Cài ODBC Driver: https://learn.microsoft.com/en-us/sql/connect/odbc/download-odbc-driver-for-sql-server

### `Facebook login chưa cấu hình`
→ Điền `FACEBOOK_APP_ID` và `FACEBOOK_APP_SECRET` vào `server/.env`.
