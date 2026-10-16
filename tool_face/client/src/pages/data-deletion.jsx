import { useRouter } from 'next/router';
import LegalPage from '../components/legal/LegalPage';

const CONTENT = {
  vi: {
    title: 'Hướng dẫn xóa dữ liệu',
    intro: 'Bạn có thể yêu cầu xóa toàn bộ dữ liệu mà {appName} lưu về bạn bất cứ lúc nào bằng một trong các cách dưới đây.',
    sections: [
      {
        h: 'Cách 1: Gỡ ứng dụng trong cài đặt Facebook',
        ol: [
          'Mở Facebook → Cài đặt và quyền riêng tư → Cài đặt.',
          'Chọn "Tiện ích tích hợp cho doanh nghiệp" (hoặc "Ứng dụng và trang web").',
          'Chọn {appName} → Gỡ.'
        ],
        note: ['Quyền truy cập của Dịch vụ bị thu hồi ngay. Khi bạn gửi yêu cầu xóa dữ liệu trong mục đó, Facebook tự thông báo cho Dịch vụ: mã truy cập, Fanpage, tin nhắn và thông tin Instagram liên quan được xóa tự động và bạn nhận được mã xác nhận.']
      },
      {
        h: 'Cách 2: Gỡ kết nối ngay trong Dịch vụ',
        ol: [
          'Đăng nhập {appName} → mở trang Kênh.',
          'Bấm gỡ kết nối từng Fanpage, hoặc xóa tài khoản Facebook đã kết nối để gỡ toàn bộ Fanpage của tài khoản đó.'
        ],
        note: ['Mã truy cập của Fanpage được xóa ngay. Khi không còn tài khoản nào kết nối Fanpage đó, tin nhắn đã đồng bộ, cài đặt trả lời tự động và thông tin Instagram liên kết cũng bị xóa ngay.']
      },
      {
        h: 'Cách 3: Gửi yêu cầu xóa toàn bộ dữ liệu',
        p: [
          'Gửi email tới {email} với tiêu đề "Yêu cầu xóa dữ liệu", kèm tên đăng nhập trong Dịch vụ hoặc tên / ID tài khoản Facebook của bạn.',
          'Chúng tôi xác minh yêu cầu, xóa dữ liệu trong tối đa 30 ngày và gửi email xác nhận khi hoàn tất.'
        ]
      },
      {
        h: 'Dữ liệu bị xóa',
        ul: [
          'Tài khoản Dịch vụ (tên đăng nhập, Gmail, mật khẩu đã băm).',
          'Thông tin tài khoản Facebook, mã truy cập Fanpage và thông tin tài khoản Instagram liên kết.',
          'Bài viết đã lên lịch, ảnh / video tải lên, bản nháp AI và lịch sử trò chuyện với trợ lý AI.',
          'Hội thoại và tin nhắn Messenger / Instagram đã đồng bộ cùng cài đặt trả lời tự động.'
        ]
      },
      {
        h: 'Lưu ý',
        ul: [
          'Bài viết và tin nhắn đã gửi lên Facebook / Instagram nằm trên nền tảng của Meta; hãy xóa trực tiếp trên Facebook / Instagram nếu muốn gỡ.',
          'Bản sao lưu tự xóa sau 30 ngày. Dữ liệu chỉ được giữ lâu hơn khi pháp luật bắt buộc.'
        ]
      }
    ]
  },
  en: {
    title: 'Data Deletion Instructions',
    intro: 'You can ask {appName} to delete all data it stores about you at any time using any of the options below.',
    sections: [
      {
        h: 'Option 1: Remove the app in your Facebook settings',
        ol: [
          'Open Facebook → Settings & privacy → Settings.',
          'Choose "Business integrations" (or "Apps and websites").',
          'Select {appName} → Remove.'
        ],
        note: ['The Service\'s access is revoked immediately. When you also send a data deletion request there, Facebook notifies the Service: access tokens, Pages, messages and linked Instagram details are deleted automatically and you receive a confirmation code.']
      },
      {
        h: 'Option 2: Disconnect inside the Service',
        ol: [
          'Sign in to {appName} → open the Channels page.',
          'Disconnect each Page, or remove the connected Facebook account to disconnect all of its Pages.'
        ],
        note: ['The Page access token is deleted immediately. Once no account is connected to that Page, its synced messages, auto-reply settings and linked Instagram details are deleted immediately as well.']
      },
      {
        h: 'Option 3: Request full deletion',
        p: [
          'Email {email} with the subject "Data deletion request" and include your Service username or your Facebook name / ID.',
          'We verify the request, delete your data within 30 days and send a confirmation email when it is done.'
        ]
      },
      {
        h: 'What is deleted',
        ul: [
          'Your Service account (username, email, hashed password).',
          'Facebook account details, Page access tokens and linked Instagram account details.',
          'Scheduled posts, uploaded images / videos, AI drafts and AI assistant chat history.',
          'Synced Messenger / Instagram conversations and messages, and auto-reply settings.'
        ]
      },
      {
        h: 'Notes',
        ul: [
          'Posts and messages already sent to Facebook / Instagram live on Meta\'s platforms; delete them directly on Facebook / Instagram if needed.',
          'Backups expire after 30 days. Data is kept longer only when required by law.'
        ]
      }
    ]
  }
};

// Meta chuyển người dùng tới /data-deletion?code=... sau khi xử lý yêu cầu xóa
function ConfirmationBanner({ code, lang }) {
  if (!/^[a-f0-9]{8,32}$/i.test(code || '')) return null;
  return (
    <div className="legal-confirm" role="status">
      {lang === 'en'
        ? <>Your data deletion request has been processed. Confirmation code: <strong>{code}</strong></>
        : <>Yêu cầu xóa dữ liệu của bạn đã được xử lý. Mã xác nhận: <strong>{code}</strong></>}
    </div>
  );
}

export default function DataDeletionPage() {
  const router = useRouter();
  const code = typeof router.query.code === 'string' ? router.query.code : '';
  return <LegalPage path="/data-deletion" content={CONTENT} banner={(lang) => <ConfirmationBanner code={code} lang={lang} />} />;
}
