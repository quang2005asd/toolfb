# Cấu hình Meta App và xin quyền cho người dùng thật

Thay `ten-mien-cua-ban.com` bằng tên miền thật. Mở app tại [developers.facebook.com/apps](https://developers.facebook.com/apps/).

**Vì sao cần App Review?** App chưa duyệt (Standard Access) chỉ đọc / trả lời được tin nhắn của **người có vai trò trong app**. Muốn phục vụ mọi khách hàng phải có **Advanced Access**, và Meta chỉ cấp Advanced Access cho app thuộc **doanh nghiệp đã xác minh**.

---

## A. Làm ngay khi tool đã chạy trên tên miền (chưa cần giấy tờ)

### A1. Cài đặt ứng dụng → Thông tin cơ bản

| Mục | Giá trị |
|---|---|
| Miền ứng dụng (App domains) | `ten-mien-cua-ban.com` |
| URL Chính sách quyền riêng tư | `https://ten-mien-cua-ban.com/privacy?lang=en` |
| URL Điều khoản dịch vụ | `https://ten-mien-cua-ban.com/terms?lang=en` |
| Xóa dữ liệu người dùng | chọn **URL gọi lại yêu cầu xóa dữ liệu**: `https://ten-mien-cua-ban.com/api/meta/data-deletion` |
| Biểu tượng ứng dụng | ảnh vuông 1024×1024 |
| Hạng mục | Business and pages (Doanh nghiệp và trang) |
| Email liên hệ | trùng `PUBLIC_CONTACT_EMAIL` |

### A2. Facebook Login → Cài đặt

- **URI chuyển hướng OAuth hợp lệ**: `https://ten-mien-cua-ban.com/api/auth/facebook/callback`
- Bật **Bắt buộc HTTPS** và **Chế độ nghiêm ngặt cho URI chuyển hướng**.

### A3. Webhooks (sản phẩm Messenger và Instagram)

- **Callback URL**: `https://ten-mien-cua-ban.com/api/webhooks/messenger`
- **Verify token**: đúng chuỗi `MESSENGER_VERIFY_TOKEN` trong `.env`
- Đăng ký trường (subscribe fields):
  - **Page**: `messages`, `message_echoes`
  - **Instagram**: `messages`
- Tool xác thực chữ ký webhook bằng App Secret: nhập App Secret ở **tool → Cài đặt → Meta App**.

### A4. Trong lúc chờ xác minh: thêm người thử nghiệm

**Vai trò trong ứng dụng → Vai trò → Thêm người → Người thử nghiệm.** Tin nhắn của những người này (và Instagram liên kết với Facebook của họ trong Trung tâm tài khoản) sẽ hiện trong tool. Đây cũng là tài khoản dùng để quay video App Review.

---

## B. Xác minh doanh nghiệp (cần giấy tờ)

Meta chấp nhận giấy tờ pháp lý của doanh nghiệp hoặc **hộ kinh doanh**. Nếu chưa có, cách nhanh và rẻ nhất là **đăng ký hộ kinh doanh** tại cơ quan đăng ký kinh doanh địa phương (thường vài ngày làm việc).

1. Vào [business.facebook.com/settings](https://business.facebook.com/settings) → **Trung tâm bảo mật → Bắt đầu xác minh**.
2. Khai **tên pháp lý, địa chỉ, số điện thoại, website** đúng như trên giấy tờ (website = tên miền của tool).
3. Tải lên giấy chứng nhận đăng ký kinh doanh / hộ kinh doanh; xác nhận qua email tên miền, SMS hoặc cuộc gọi.
4. Sau khi được duyệt: **Cài đặt ứng dụng → Thông tin cơ bản → Danh mục doanh nghiệp (Business portfolio)** → chọn doanh nghiệp vừa xác minh.

Thời gian duyệt: vài ngày tới vài tuần.

---

## C. App Review: xin Advanced Access

**Xét duyệt ứng dụng → Quyền và tính năng.** Chỉ xin những quyền dưới đây (tool không dùng `instagram_content_publish`, `instagram_manage_comments` — không xin).

Video quay màn hình: giao diện tool là tiếng Việt, nên **thêm phụ đề tiếng Anh** hoặc chú thích từng bước. Quay bằng một Fanpage thật và tài khoản Tester nhắn tin thật.

### Mô tả dán vào form (tiếng Anh)

**pages_show_list**
> Our tool lets a Page admin connect the Facebook Pages they manage. After Facebook Login we call /me/accounts to list the user's Pages so they can choose which Pages to manage. The screencast shows the Page list on the Channels screen right after login.

**pages_manage_metadata**
> Used to subscribe each connected Page to our app's webhooks (messages, message_echoes) so new customer messages appear in the tool's inbox in real time, and to read the Page's connected Instagram professional account.

**pages_messaging**
> The tool provides a unified inbox. Page admins read customer conversations from Messenger and reply to them from the tool. Optionally the admin enables auto-replies for incoming customer messages; replies are only sent within the 24-hour standard messaging window. The screencast shows a customer message arriving, the admin replying from the tool, and the reply appearing in Messenger.

**instagram_basic**
> Used to read the Instagram professional account linked to the connected Page (username, profile picture, follower count) so the admin can see which Instagram account is connected and use its inbox.

**instagram_manage_messages**
> The same unified inbox shows Instagram Direct conversations of the Instagram professional account linked to the Page. The admin reads and replies to customer DMs from the tool and can enable auto-replies within the 24-hour window. The screencast shows an Instagram DM arriving, the reply sent from the tool, and the reply visible in Instagram.

**pages_manage_posts**
> Admins write posts in the tool (optionally with AI-assisted text and images they review first) and publish them immediately or at a scheduled time on their own Pages. The screencast shows creating a post, scheduling it, and the published post on the Page.

**pages_read_engagement**
> Used to read the Page's own posts and their engagement (reactions, comments count) to show publishing results and statistics on the tool's dashboard.

**pages_manage_engagement**
> After a post is published, the admin can schedule the Page's own first comments (for example contact details or a link) to be posted under that post. The screencast shows a scheduled Page comment appearing under the published post.

**pages_read_user_content**
> Used to read comments that users leave on the Page's posts so the admin can review them alongside the post results.

**business_management**
> Required to list and manage Pages that the admin accesses through a Meta Business portfolio rather than as a personal Page role.

### Kịch bản video (một video cho mỗi nhóm quyền, hoặc một video dài có chú thích)

1. Mở `https://ten-mien-cua-ban.com`, đăng nhập tool.
2. **Kênh → Đăng nhập Facebook**: quay rõ hộp thoại cấp quyền của Facebook.
3. Danh sách Fanpage và tài khoản Instagram hiện ra (pages_show_list, instagram_basic).
4. **Viết bài** → đăng ngay / hẹn giờ → mở Fanpage cho thấy bài đã lên (pages_manage_posts), bình luận của Page dưới bài (pages_manage_engagement).
5. Tài khoản Tester nhắn Messenger cho Page → tin hiện trong **Tin nhắn** → trả lời từ tool → mở Messenger cho thấy câu trả lời (pages_messaging, pages_manage_metadata).
6. Làm tương tự với Instagram Direct (instagram_manage_messages).
7. Mở **Trả lời tự động**, bật và cho thấy câu trả lời tự động.
8. **Kênh → gỡ kết nối Fanpage** và mở trang `/data-deletion` (xử lý dữ liệu).

### Sau khi được duyệt

- Bật app sang **Đang hoạt động (Live)** ở thanh trên cùng trang app.
- Trong tool: **Kênh → Đăng nhập lại Facebook** để token mang quyền mới, rồi **Kênh → Instagram → Kiểm tra tin nhắn** — bước cuối phải chuyển xanh khi có khách nhắn.
