# Đưa Tool Face lên VPS cho người dùng thật

Kết quả: tool chạy 24/7 tại `https://ten-mien-cua-ban.com`, HTTPS tự động, webhook Messenger / Instagram nhận tin gần như tức thì.

Chi phí tham khảo: tên miền ~250–300k/năm, VPS ~100–200k/tháng.

---

## 1. Mua tên miền và VPS

- **Tên miền**: mua ở nhà cung cấp bất kỳ (Namecheap, Cloudflare, Mắt Bão, PA Việt Nam…). Nên chọn tên giống tên doanh nghiệp / thương hiệu — Meta xem tên miền khi xác minh doanh nghiệp.
- **VPS** — cấu hình khuyến nghị **2 vCPU · 4 GB RAM · 60–80 GB SSD NVMe**, Ubuntu 24.04 LTS, ảo hóa **KVM** (không chọn OpenVZ/LXC — Docker chạy không ổn định), IPv4 riêng, quyền root, đặt ở Singapore hoặc Việt Nam. Tối thiểu chạy được: 1 vCPU · 2 GB RAM · 40 GB (bắt buộc thêm swap ở bước 3). Ghi lại **địa chỉ IP** và **mật khẩu root**.

## 2. Trỏ tên miền về VPS

Trong trang quản lý DNS của tên miền, tạo 2 bản ghi:

| Loại | Tên | Giá trị |
|---|---|---|
| A | `@` | IP của VPS |
| A | `www` | IP của VPS |

Đợi 5–30 phút. Kiểm tra trên máy Windows: `ping ten-mien-cua-ban.com` phải ra đúng IP VPS.

> Nếu dùng Cloudflare: để đám mây **xám** (DNS only) cho tới khi tool chạy HTTPS xong.

## 3. Cài Docker trên VPS

Trên Windows mở PowerShell:

```powershell
ssh root@IP_CUA_VPS
```

Trên VPS:

```bash
curl -fsSL https://get.docker.com | sh
ufw allow 22 && ufw allow 80 && ufw allow 443 && ufw --force enable
# VPS 2 GB RAM: thêm 2 GB swap để build giao diện không bị thiếu bộ nhớ
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile && echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

## 4. Đưa code lên VPS

Trên Windows mở **Git Bash** tại `D:\Tools\toolfb` rồi chạy (bỏ qua node_modules và file build):

```bash
tar --exclude=node_modules --exclude=.next --exclude=out --exclude=.env -czf tool_face.tgz tool_face
scp tool_face.tgz root@IP_CUA_VPS:/opt/
```

Trên VPS:

```bash
cd /opt && tar -xzf tool_face.tgz && cd tool_face
```

## 5. Tạo file cấu hình `.env`

```bash
cp .env.production.example .env
openssl rand -hex 32   # chạy 2 lần: 1 chuỗi cho SESSION_SECRET, 1 chuỗi cho MESSENGER_VERIFY_TOKEN
nano .env
```

Điền tối thiểu: `DOMAIN`, `SESSION_SECRET`, `ADMIN_PASSWORD` (≥ 8 ký tự), `MESSENGER_VERIFY_TOKEN`, `PUBLIC_OPERATOR_NAME`, `PUBLIC_CONTACT_EMAIL`. Lưu: `Ctrl+O`, `Enter`, `Ctrl+X`.

> `SESSION_SECRET` dùng để mã hóa token Facebook. **Không đổi** sau khi đã kết nối Fanpage, nếu đổi phải kết nối lại Facebook.

## 6. Chạy tool

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml logs -f caddy server   # Ctrl+C để thoát xem log
```

Lần đầu build mất 5–10 phút (image server ~1,6 GB vì có Chromium cho đăng bài TikTok; không dùng TikTok thì thêm `INSTALL_CHROMIUM: "false"` vào `build.args` của service server để image nhẹ hơn). Khi log Caddy báo `certificate obtained successfully`, mở `https://ten-mien-cua-ban.com`:

- Đăng nhập `admin` với mật khẩu `ADMIN_PASSWORD`.
- Mở `https://ten-mien-cua-ban.com/privacy` — trang này phải xem được **không cần đăng nhập** (Meta sẽ kiểm tra).

## 7. Cấu hình Meta App và kết nối Facebook

Làm theo `deploy/META-APP-REVIEW.md` phần A, sau đó trong tool:

1. **Cài đặt → Meta App**: nhập App ID và App Secret.
2. **Kênh → Đăng nhập lại Facebook**: cấp đủ quyền cho Fanpage và Instagram.
3. **Kênh → Instagram → Kiểm tra tin nhắn**.

## 8. Sao lưu tự động hằng ngày

```bash
crontab -e
```

Thêm dòng (3 giờ sáng mỗi ngày, giữ 14 bản gần nhất):

```
0 3 * * * cd /opt/tool_face && docker compose -f docker-compose.prod.yml exec -T server node scripts/backup-db.js >> /var/log/tool_face_backup.log 2>&1
```

Tải bản sao lưu về máy định kỳ:

```bash
cd /opt/tool_face && docker compose -f docker-compose.prod.yml cp server:/app/data/backups ./backups
# Trên Windows: scp -r root@IP_CUA_VPS:/opt/tool_face/backups D:\SaoLuu\
```

## 9. Cập nhật phiên bản mới

Làm lại bước 4 (đè code mới, **giữ nguyên file `.env`**), rồi:

```bash
cd /opt/tool_face && docker compose -f docker-compose.prod.yml up -d --build
```

Dữ liệu nằm trong Docker volume nên không mất khi cập nhật. **Không chạy** `docker compose down -v` (lệnh này xóa toàn bộ dữ liệu).

## 10. (Tùy chọn) Chuyển dữ liệu từ máy hiện tại

Trên Windows (Docker local đang chạy):

```powershell
docker cp tool-face-server:/app/data/tool_face.sqlite D:\tool_face.sqlite
scp D:\tool_face.sqlite root@IP_CUA_VPS:/opt/tool_face/
```

Trên VPS:

```bash
cd /opt/tool_face
docker compose -f docker-compose.prod.yml stop server worker
docker compose -f docker-compose.prod.yml cp tool_face.sqlite server:/app/data/tool_face.sqlite
docker compose -f docker-compose.prod.yml start server worker
```

Giữ lại: tài khoản, bài đăng, tin nhắn, cài đặt. Vì `SESSION_SECRET` trên VPS khác bản local, cần **nhập lại App Secret** ở Cài đặt → Meta App và **đăng nhập lại Facebook** ở trang Kênh. Mật khẩu `1` của admin tự được thay bằng `ADMIN_PASSWORD`.

## Sự cố thường gặp

| Hiện tượng | Cách xử lý |
|---|---|
| Caddy báo lỗi lấy chứng chỉ | Tên miền chưa trỏ đúng IP hoặc cổng 80/443 bị chặn — kiểm tra bước 2 và `ufw status` |
| Build client bị dừng / `Killed` | Thiếu RAM — thêm swap ở bước 3 |
| Trang báo "máy chủ API đang tắt" | Xem log: `docker compose -f docker-compose.prod.yml logs --tail 100 server` |
| `docker compose` báo thiếu biến | Điền đủ các biến bắt buộc trong `.env` (bước 5) |
