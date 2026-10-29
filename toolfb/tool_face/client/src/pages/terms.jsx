import LegalPage from '../components/legal/LegalPage';

const CONTENT = {
  vi: {
    title: 'Điều khoản sử dụng',
    intro: 'Khi tạo tài khoản hoặc sử dụng {appName} ("Dịch vụ") do {operator} vận hành, bạn đồng ý với các điều khoản dưới đây.',
    sections: [
      {
        h: '1. Tài khoản',
        ul: [
          'Cung cấp thông tin chính xác, giữ bí mật mật khẩu và chịu trách nhiệm về mọi hoạt động trong tài khoản của bạn.',
          'Quản trị viên có thể khóa hoặc xóa tài khoản vi phạm các điều khoản này.'
        ]
      },
      {
        h: '2. Sử dụng hợp lệ',
        ul: [
          'Chỉ kết nối Fanpage và tài khoản Instagram mà bạn có quyền quản lý.',
          'Tuân thủ Điều khoản Nền tảng của Meta, Tiêu chuẩn cộng đồng và chính sách nhắn tin (chỉ trả lời trong khung 24 giờ kể từ tin nhắn gần nhất của khách, trừ trường hợp Meta cho phép).',
          'Không dùng Dịch vụ để gửi thư rác, tin quảng cáo trái phép, lừa đảo hoặc nội dung vi phạm pháp luật.',
          'Không tìm cách truy cập trái phép, làm quá tải hoặc can thiệp vào hệ thống.'
        ]
      },
      {
        h: '3. Nội dung',
        ul: [
          'Bạn sở hữu và chịu trách nhiệm về nội dung bạn đăng, gửi hoặc tải lên. Bạn cho phép Dịch vụ xử lý nội dung đó chỉ để thực hiện các chức năng bạn yêu cầu.',
          'Nội dung do AI tạo có thể chưa chính xác; hãy kiểm tra trước khi đăng hoặc bật trả lời tự động.'
        ]
      },
      {
        h: '4. Dịch vụ của bên thứ ba',
        p: ['Dịch vụ hoạt động qua API của Meta và nhà cung cấp AI. Các bên này có thể thay đổi, giới hạn hoặc tạm ngưng API; chúng tôi không chịu trách nhiệm về gián đoạn phát sinh từ họ.']
      },
      {
        h: '5. Giới hạn trách nhiệm',
        p: ['Dịch vụ được cung cấp "như hiện có". Trong phạm vi pháp luật cho phép, chúng tôi không chịu trách nhiệm về thiệt hại gián tiếp, mất doanh thu hoặc mất dữ liệu phát sinh từ việc sử dụng Dịch vụ.']
      },
      {
        h: '6. Chấm dứt',
        p: ['Bạn có thể ngừng sử dụng và yêu cầu xóa dữ liệu bất cứ lúc nào (xem trang Xóa dữ liệu). Chúng tôi có thể tạm ngưng tài khoản vi phạm các điều khoản này.']
      },
      {
        h: '7. Luật áp dụng và thay đổi',
        p: ['Điều khoản được điều chỉnh bởi pháp luật Việt Nam. Khi điều khoản thay đổi, ngày cập nhật ở đầu trang sẽ thay đổi; tiếp tục sử dụng Dịch vụ nghĩa là bạn đồng ý với bản mới.']
      }
    ]
  },
  en: {
    title: 'Terms of Service',
    intro: 'By creating an account or using {appName} (the "Service") operated by {operator}, you agree to the following terms.',
    sections: [
      {
        h: '1. Accounts',
        ul: [
          'Provide accurate information, keep your password secret and remain responsible for all activity in your account.',
          'Administrators may suspend or delete accounts that violate these terms.'
        ]
      },
      {
        h: '2. Acceptable use',
        ul: [
          'Only connect Facebook Pages and Instagram accounts you are authorized to manage.',
          'Comply with the Meta Platform Terms, Community Standards and messaging policies (reply only within 24 hours of the customer\'s last message unless Meta allows otherwise).',
          'Do not use the Service for spam, unsolicited promotions, fraud or unlawful content.',
          'Do not attempt unauthorized access to, overload or interfere with the Service.'
        ]
      },
      {
        h: '3. Content',
        ul: [
          'You own and are responsible for the content you post, send or upload. You allow the Service to process it only to perform the features you request.',
          'AI-generated content may be inaccurate; review it before publishing or enabling auto-replies.'
        ]
      },
      {
        h: '4. Third-party services',
        p: ['The Service relies on Meta APIs and an AI provider. They may change, limit or suspend their APIs; we are not liable for interruptions caused by them.']
      },
      {
        h: '5. Limitation of liability',
        p: ['The Service is provided "as is". To the extent permitted by law, we are not liable for indirect damages, lost revenue or data loss arising from use of the Service.']
      },
      {
        h: '6. Termination',
        p: ['You may stop using the Service and request deletion of your data at any time (see the Data Deletion page). We may suspend accounts that violate these terms.']
      },
      {
        h: '7. Governing law and changes',
        p: ['These terms are governed by the laws of Vietnam. When they change, the date at the top of the page is updated; continuing to use the Service means you accept the new version.']
      }
    ]
  }
};

export default function TermsPage() {
  return <LegalPage path="/terms" content={CONTENT} />;
}
