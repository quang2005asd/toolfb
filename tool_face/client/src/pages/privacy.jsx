import LegalPage from '../components/legal/LegalPage';

const CONTENT = {
  vi: {
    title: 'Chính sách quyền riêng tư',
    intro: '{appName} ("Dịch vụ") do {operator} vận hành tại {siteUrl}. Dịch vụ giúp người quản lý Fanpage Facebook và tài khoản Instagram chuyên nghiệp lên lịch đăng bài, xem và trả lời tin nhắn của khách hàng. Chính sách này giải thích dữ liệu nào được thu thập, dùng để làm gì, chia sẻ với ai và cách bạn yêu cầu xóa.',
    sections: [
      {
        h: '1. Dữ liệu chúng tôi thu thập',
        ul: [
          'Tài khoản Dịch vụ: tên đăng nhập, Gmail, mật khẩu (chỉ lưu dạng băm, không lưu bản gốc), vai trò và thời điểm đăng nhập.',
          'Nhật ký đăng ký / đăng nhập: mỗi lần đăng ký hoặc đăng nhập (thành công hay thất bại), Dịch vụ ghi lại tên đăng nhập, Gmail, vai trò, thời điểm, kết quả và mã lỗi nếu có, để phát hiện truy cập bất thường. Nhật ký không chứa mật khẩu.',
          'Kết nối Facebook / Instagram (khi bạn đăng nhập Facebook và cấp quyền): ID, tên và ảnh đại diện tài khoản Facebook; ID, tên và mã truy cập (access token) của các Fanpage bạn quản lý; thông tin tài khoản Instagram chuyên nghiệp liên kết với Fanpage (ID, tên người dùng, ảnh đại diện, số người theo dõi). Mã truy cập được mã hóa AES-256-GCM trước khi lưu.',
          'Nội dung bạn tạo: bài viết, lịch đăng, ảnh / video tải lên, bình luận mồi, bản nháp và yêu cầu gửi cho trợ lý AI.',
          'Tin nhắn: hội thoại Messenger và Instagram Direct của Fanpage / tài khoản Instagram bạn kết nối (tên và ID người gửi do Meta cung cấp, nội dung, tệp đính kèm, thời gian) để hiển thị hộp thư, trả lời và trả lời tự động.',
          'Kỹ thuật: cookie phiên đăng nhập bắt buộc. Dịch vụ không dùng cookie quảng cáo hay công cụ theo dõi của bên thứ ba.'
        ]
      },
      {
        h: '2. Mục đích sử dụng',
        p: ['Dữ liệu chỉ được dùng để cung cấp các tính năng bạn yêu cầu:'],
        ul: [
          'Đăng và hẹn giờ bài viết, bình luận lên Fanpage của bạn.',
          'Hiển thị tin nhắn của khách trong hộp thư, gửi câu trả lời của bạn và trả lời tự động theo cài đặt bạn bật.',
          'Thống kê hoạt động đăng bài, bảo mật tài khoản và hỗ trợ kỹ thuật.'
        ]
      },
      {
        h: '3. Những điều chúng tôi không làm',
        ul: [
          'Không bán, cho thuê hay trao đổi dữ liệu cá nhân.',
          'Không dùng dữ liệu nhận từ Meta cho quảng cáo, lập hồ sơ người dùng hoặc huấn luyện mô hình AI.',
          'Không gửi tin nhắn cho khách hàng ngoài những tin bạn gửi hoặc trả lời tự động bạn đã bật, và luôn tuân thủ chính sách nhắn tin của Meta (khung 24 giờ).'
        ]
      },
      {
        h: '4. Chia sẻ dữ liệu',
        ul: [
          'Meta Platforms (Facebook / Instagram Graph API): để đăng bài, đọc và gửi tin nhắn theo yêu cầu của bạn.',
          'Nhà cung cấp AI do quản trị viên cấu hình: chỉ khi bạn dùng tính năng AI. Dịch vụ gửi nội dung yêu cầu viết bài, và với trả lời tự động bằng AI là nội dung tin nhắn của khách, để tạo câu trả lời. Không gửi mã truy cập hay mật khẩu.',
          'Google (Google Sheets qua Google Apps Script): nơi lưu nhật ký đăng ký / đăng nhập nêu ở mục 1; chỉ quản trị viên Dịch vụ xem được.',
          'Nhà cung cấp máy chủ lưu trữ Dịch vụ.',
          'Cơ quan nhà nước có thẩm quyền khi pháp luật yêu cầu.'
        ]
      },
      {
        h: '5. Lưu trữ và bảo mật',
        ul: [
          'Kết nối HTTPS; mã truy cập được mã hóa; mật khẩu được băm; phân quyền Quản trị viên / Quản lý / Thành viên.',
          'Dữ liệu được giữ khi tài khoản còn hoạt động hoặc Fanpage còn kết nối. Khi bạn gỡ kết nối hoặc yêu cầu xóa, dữ liệu liên quan bị xóa trong tối đa 30 ngày; bản sao lưu tự xóa sau 30 ngày.'
        ]
      },
      {
        h: '6. Quyền của bạn',
        ul: [
          'Xem, sửa, xuất hoặc xóa dữ liệu của bạn; gỡ kết nối Fanpage hoặc tài khoản Facebook ngay trong trang Kênh.',
          'Thu hồi quyền của Dịch vụ bất cứ lúc nào trong cài đặt Facebook. Hướng dẫn chi tiết ở trang Xóa dữ liệu.'
        ]
      },
      {
        h: '7. Trẻ em',
        p: ['Dịch vụ dành cho người quản lý Fanpage và doanh nghiệp, không dành cho người dưới 18 tuổi.']
      },
      {
        h: '8. Thay đổi chính sách',
        p: ['Khi chính sách thay đổi, ngày cập nhật ở đầu trang sẽ thay đổi và thay đổi quan trọng sẽ được thông báo trong Dịch vụ.']
      }
    ]
  },
  en: {
    title: 'Privacy Policy',
    intro: '{appName} (the "Service") is operated by {operator} at {siteUrl}. The Service helps people who manage Facebook Pages and Instagram professional accounts schedule posts and read and reply to customer messages. This policy explains what data we collect, why, who we share it with and how to request deletion.',
    sections: [
      {
        h: '1. Data we collect',
        ul: [
          'Service account: username, email, password (stored only as a salted hash), role and sign-in time.',
          'Sign-up / sign-in log: for every sign-up or sign-in attempt (successful or not), the Service records the username, email, role, time, result and error code if any, to detect unusual access. The log never contains passwords.',
          'Facebook / Instagram connection (when you log in with Facebook and grant permissions): your Facebook user ID, name and profile picture; the IDs, names and access tokens of the Pages you manage; details of the Instagram professional account linked to each Page (ID, username, profile picture, follower counts). Access tokens are encrypted with AES-256-GCM before storage.',
          'Content you create: posts, schedules, uploaded images and videos, seeding comments, drafts and prompts sent to the AI assistant.',
          'Messages: Messenger and Instagram Direct conversations of the Pages and Instagram accounts you connect (sender name and ID provided by Meta, message text, attachments, timestamps), used to show the inbox, send your replies and send auto-replies.',
          'Technical: a required session cookie. The Service uses no advertising cookies or third-party trackers.'
        ]
      },
      {
        h: '2. How we use data',
        p: ['Data is used only to provide the features you request:'],
        ul: [
          'Publishing and scheduling posts and comments on your Pages.',
          'Showing customer messages in the inbox, sending your replies and sending auto-replies according to the settings you enable.',
          'Posting statistics, account security and technical support.'
        ]
      },
      {
        h: '3. What we never do',
        ul: [
          'We do not sell, rent or trade personal data.',
          'We do not use data received from Meta for advertising, profiling or training AI models.',
          'We do not message customers except for replies you send or auto-replies you enable, always within Meta messaging policies (24-hour window).'
        ]
      },
      {
        h: '4. Sharing',
        ul: [
          'Meta Platforms (Facebook / Instagram Graph API): to publish posts and read and send messages on your behalf.',
          'The AI provider configured by the administrator: only when you use AI features. The Service sends your writing prompt and, for AI auto-replies, the customer message text in order to generate a reply. Access tokens and passwords are never sent.',
          'Google (Google Sheets via Google Apps Script): stores the sign-up / sign-in log described in section 1; only Service administrators can view it.',
          'The hosting provider that runs the Service.',
          'Competent authorities when required by law.'
        ]
      },
      {
        h: '5. Retention and security',
        ul: [
          'HTTPS connections, encrypted access tokens, hashed passwords and role-based access (Admin / Manager / Member).',
          'Data is kept while your account is active or the Page stays connected. When you disconnect or request deletion, related data is deleted within 30 days; backups expire after 30 days.'
        ]
      },
      {
        h: '6. Your rights',
        ul: [
          'Access, correct, export or delete your data; disconnect Pages or Facebook accounts at any time on the Channels page.',
          'Revoke the Service\'s permissions at any time in your Facebook settings. See the Data Deletion page for step-by-step instructions.'
        ]
      },
      {
        h: '7. Children',
        p: ['The Service is intended for Page managers and businesses and is not directed to anyone under 18.']
      },
      {
        h: '8. Changes',
        p: ['When this policy changes, the date at the top of the page is updated and significant changes are announced inside the Service.']
      }
    ]
  }
};

export default function PrivacyPage() {
  return <LegalPage path="/privacy" content={CONTENT} />;
}
