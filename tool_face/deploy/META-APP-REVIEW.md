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
- Tool xác thực chữ ký webhook bằng App Secret: app chung của tool nhập ở **tool → Cài đặt → Meta App chung** (trang này cũng liệt kê sẵn mọi địa chỉ cần khai báo). Meta App riêng của người dùng (Kênh → Nâng cao) cũng được nhận — sự kiện ký bằng app riêng chỉ giao cho Fanpage của những tài khoản đã thêm app đó.
- Quyền cần xin trong App Review (mức đầy đủ): `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `pages_read_user_content`, `pages_manage_engagement`, `pages_manage_metadata`, `pages_messaging`, `read_insights` (trang Báo cáo), `instagram_basic`, `instagram_manage_messages`. Mức tối giản chỉ cần `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `read_insights`.

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

**read_insights**
> Used only to show the Page admin their own Page performance on the Reports screen: daily views (page_media_view, split into paid / organic and followers / non-followers), viewers, post engagements and new followers, compared with the previous period. Data is shown only to admins of that Page and is not shared. The screencast shows the Reports screen for a connected Page.

**pages_manage_engagement**
> After a post is published, the admin can schedule the Page's own first comments (for example contact details or a link) to be posted under that post. The screencast shows a scheduled Page comment appearing under the published post.

**pages_read_user_content**
> Used to read comments that users leave on the Page's posts so the admin can review them alongside the post results.

### Kịch bản video (một video cho mỗi nhóm quyền, hoặc một video dài có chú thích)

1. Mở `https://ten-mien-cua-ban.com`, đăng nhập tool bằng tài khoản dành cho người duyệt (xem mục "Tài khoản cho người duyệt").
2. **Kênh → Kết nối Facebook → Quyền đầy đủ → Kết nối**: quay rõ hộp thoại cấp quyền của Facebook (danh sách quyền, chọn Fanpage).
3. Quay lại tool: hộp **"Bạn muốn thêm những Fanpage nào?"** → chọn Fanpage → Lưu; danh sách Fanpage và tài khoản Instagram hiện ra (pages_show_list, instagram_basic).
4. **Viết bài → Viết thường** → đăng ngay / hẹn giờ → mở Fanpage cho thấy bài đã lên (pages_manage_posts), bình luận của Page dưới bài (pages_manage_engagement).
5. **Báo cáo**: cho thấy lượt xem, người xem, tương tác của Fanpage vừa kết nối (read_insights, pages_read_engagement).
6. Tài khoản Tester nhắn Messenger cho Page → tin hiện trong **Tin nhắn** → trả lời từ tool → mở Messenger cho thấy câu trả lời (pages_messaging, pages_manage_metadata).
7. Làm tương tự với Instagram Direct (instagram_manage_messages).
8. Mở **Trả lời tự động**, bật và cho thấy câu trả lời tự động; mở **AI Bình luận** cho thấy bình luận của khách dưới bài (pages_read_user_content).
9. **Kênh → gỡ kết nối Fanpage** và mở trang `/data-deletion` (xử lý dữ liệu).

### Tài khoản cho người duyệt

Tạo một tài khoản tool riêng (vd. `metareview`, vai trò Thành viên) và ghi vào ô **hướng dẫn cho người duyệt** của form:
> Log in at https://ten-mien-cua-ban.com/login with username `metareview` / password `<mật khẩu>`. Go to Channels → "Kết nối Facebook" (Connect Facebook) → "Quyền đầy đủ" (Full permissions) → "Kết nối" (Connect), log in with your Facebook test user and select a Page. The UI is in Vietnamese; the screencast has English captions for every step.

### Sau khi được duyệt

- Bật app sang **Đang hoạt động (Live)** ở thanh trên cùng trang app (nếu chưa).
- Trong tool: **Kênh → Kết nối Facebook** (hoặc "Cấp thêm quyền") để token mang quyền mới, rồi **Kênh → Instagram → Kiểm tra tin nhắn** — bước cuối phải chuyển xanh khi có khách nhắn.
- Từ đây **mọi nick Facebook** bấm Kết nối Facebook là dùng được, không cần thêm làm Người thử nghiệm.
- (Tùy chọn) Tạo **Facebook Login for Business → Cấu hình** (đầy đủ / tối giản) và dán Configuration ID vào tool → Cài đặt → Meta App chung để hộp cấp quyền gọn như SO9.
