import { useState } from 'react';
import { Check, Copy, ExternalLink } from 'lucide-react';

// Các bảng hướng dẫn dùng chung cho hộp hướng dẫn và hộp thoại đăng nhập Facebook

const FALLBACK_PAGE_SCOPES = [
  'pages_show_list', 'pages_read_engagement', 'pages_manage_posts', 'pages_messaging',
  'pages_manage_metadata', 'pages_read_user_content', 'pages_manage_engagement', 'business_management'
];
const INSTAGRAM_SCOPES = ['instagram_basic', 'instagram_manage_messages'];

// Quyền Fanpage cần cho các tính năng (không gồm Instagram) — lấy từ server, dự phòng bằng danh sách cố định
export function pageScopesFrom(features) {
  const scopes = (features || []).filter((feature) => feature.key !== 'instagram').flatMap((feature) => feature.scopes || []);
  return scopes.length ? [...new Set(scopes)] : FALLBACK_PAGE_SCOPES;
}

export function CopyValue({ value }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const area = document.createElement('textarea');
      area.value = value;
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <span className="fb-guide-value">
      <code>{value}</code>
      <button type="button" className="fb-guide-copy" onClick={copy} aria-label={`Chép ${value}`}>
        {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Đã chép' : 'Chép'}
      </button>
    </span>
  );
}

export function Ext({ href, children }) {
  return <a href={href} target="_blank" rel="noopener noreferrer">{children} <ExternalLink size={11} aria-hidden="true" /></a>;
}

// Tự tạo token bằng Meta App của chính mình — không cần ai mời hay cấp vai trò
export function OwnTokenSteps({ features, missing }) {
  const scopes = pageScopesFrom(features);
  return (
    <ol className="fb-guide-steps">
      <li>
        <strong>Đăng ký tài khoản nhà phát triển (một lần)</strong>
        <span>Mở <Ext href="https://developers.facebook.com/">developers.facebook.com</Ext> bằng chính nick Facebook quản lý Fanpage → <em>Bắt đầu</em> → xác minh số điện thoại / email → chọn vai trò bất kỳ → <em>Hoàn tất</em>. Miễn phí.</span>
      </li>
      <li>
        <strong>Tạo Meta App của riêng bạn</strong>
        <span><Ext href="https://developers.facebook.com/apps/">Ứng dụng của tôi</Ext> → <em>Tạo ứng dụng</em> → đặt tên (vd. “Token Fanpage”) → chọn trường hợp sử dụng <em>Quản lý mọi thứ trên Trang của bạn</em> (thêm <em>Messenger</em> nếu dùng hộp thư) → <em>Tạo ứng dụng</em>. Để app ở chế độ phát triển là đủ — bạn là quản trị viên nên dùng được với Fanpage của chính mình.</span>
      </li>
      <li>
        <strong>Thêm quyền cho app</strong>
        <span>Trong app vừa tạo: <em>Trường hợp sử dụng</em> → <em>Tùy chỉnh</em> → <em>Quyền và tính năng</em> → bấm <em>Thêm</em> ở từng quyền dưới đây{missing?.length ? ' (tool đang thiếu các quyền được tô đậm)' : ''}:</span>
        <span className="fb-guide-scopes">
          {scopes.map((scope) => <code key={scope} className={missing?.includes(scope) ? 'is-missing' : ''}>{scope}</code>)}
        </span>
      </li>
      <li>
        <strong>Tạo token</strong>
        <span>Mở <Ext href="https://developers.facebook.com/tools/explorer/">Graph API Explorer</Ext> → ô <em>Meta App</em> chọn app vừa tạo → <em>Người dùng hoặc Trang</em> chọn <em>User Token</em> → ô <em>Quyền</em> thêm các quyền sau → <em>Generate Access Token</em> → <em>Chỉnh sửa quyền truy cập</em> → tích <strong>tất cả Fanpage</strong> → <em>Tiếp tục</em>.</span>
        <dl className="fb-guide-fields">
          <dt>Quyền Fanpage</dt><dd><CopyValue value={scopes.join(',')} /></dd>
          <dt>Thêm nếu dùng Instagram</dt><dd><CopyValue value={INSTAGRAM_SCOPES.join(',')} /></dd>
        </dl>
      </li>
      <li>
        <strong>Gia hạn token lên 60 ngày</strong>
        <span>Chép token vừa tạo → mở <Ext href="https://developers.facebook.com/tools/debug/accesstoken/">Trình gỡ lỗi mã truy cập</Ext> → dán → <em>Gỡ lỗi</em> → kéo xuống cuối bấm <em>Gia hạn mã truy cập</em> → chép token mới (bắt đầu bằng <code>EAA…</code>).</span>
      </li>
      <li>
        <strong>Dán vào tool</strong>
        <span>Trang Kênh → <em>Thêm qua token</em> → <em>Token tài khoản Facebook</em> → dán → <em>Xác thực &amp; Nạp Pages</em>. Tool tự nạp toàn bộ Fanpage; token Fanpage lấy từ token 60 ngày sẽ không hết hạn.</span>
      </li>
    </ol>
  );
}

// Các mục Meta App riêng phải có để đăng nhập qua tool (dùng chung cho "đã có app" và cuối bước "tạo app")
function OwnAppSettingsSteps({ app, features }) {
  const origin = app?.siteOrigin || (typeof window !== 'undefined' ? window.location.origin : '');
  const domain = app?.domain || (typeof window !== 'undefined' ? window.location.hostname : '');
  const scopes = pageScopesFrom(features);
  return (
    <>
      <li>
        <strong>Khai báo tên miền của tool</strong>
        <span><em>Cài đặt ứng dụng → Thông tin cơ bản</em> → <em>+ Thêm nền tảng</em> → <em>Trang web</em> → điền URL trang web, rồi điền <em>Miền ứng dụng</em> → <em>Lưu thay đổi</em>:</span>
        <dl className="fb-guide-fields">
          <dt>URL trang web</dt><dd><CopyValue value={`${origin}/`} /></dd>
          <dt>Miền ứng dụng</dt><dd><CopyValue value={domain} /></dd>
        </dl>
      </li>
      <li>
        <strong>Khai báo URI chuyển hướng</strong>
        <span><em>Đăng nhập bằng Facebook</em> → <em>Cài đặt</em> → bật <em>Đăng nhập OAuth trên web</em> → thêm vào <em>URI chuyển hướng OAuth hợp lệ</em> → <em>Lưu thay đổi</em>:</span>
        <dl className="fb-guide-fields"><dt>URI chuyển hướng</dt><dd><CopyValue value={app?.redirectUri || `${origin}/api/auth/facebook/callback`} /></dd></dl>
      </li>
      <li>
        <strong>Thêm quyền</strong>
        <span><em>Trường hợp sử dụng</em> → từng mục → <em>Tùy chỉnh</em> → <em>Quyền và tính năng</em> → bấm <em>Thêm</em> ở các quyền:</span>
        <span className="fb-guide-scopes">{scopes.map((scope) => <code key={scope}>{scope}</code>)}</span>
      </li>
      <li>
        <strong>Chép App ID &amp; Khóa bí mật</strong>
        <span><em>Cài đặt ứng dụng → Thông tin cơ bản</em> → chép <em>ID ứng dụng</em>, bấm <em>Hiển thị</em> ở <em>Khóa bí mật của ứng dụng</em> rồi chép → dán vào ô bên dưới. App để ở chế độ phát triển là đủ — bạn là quản trị viên nên đăng nhập được ngay.</span>
      </li>
    </>
  );
}

// Đã có Meta App trên developers.facebook.com → chỉ cần kiểm tra cài đặt rồi điền vào tool
export function OwnAppEnterSteps({ app, features }) {
  return (
    <ol className="fb-guide-steps">
      <li>
        <strong>Mở Meta App của bạn</strong>
        <span>Vào <Ext href="https://developers.facebook.com/apps/">developers.facebook.com/apps</Ext> bằng nick Facebook quản lý Fanpage → chọn app. App cần có trường hợp sử dụng <em>Quản lý mọi thứ trên Trang của bạn</em> (thêm bằng <em>Trường hợp sử dụng → Thêm</em> nếu chưa có).</span>
      </li>
      <OwnAppSettingsSteps app={app} features={features} />
    </ol>
  );
}

// Chưa có Meta App → tạo từ đầu (miễn phí, không cần xác minh doanh nghiệp khi chỉ dùng cho Fanpage của mình)
export function OwnAppCreateSteps({ app, features }) {
  return (
    <ol className="fb-guide-steps">
      <li>
        <strong>Đăng ký tài khoản nhà phát triển (một lần)</strong>
        <span>Mở <Ext href="https://developers.facebook.com/">developers.facebook.com</Ext> bằng chính nick Facebook quản lý Fanpage → <em>Bắt đầu</em> → xác minh số điện thoại / email → <em>Hoàn tất</em>. Miễn phí.</span>
      </li>
      <li>
        <strong>Tạo ứng dụng</strong>
        <span><Ext href="https://developers.facebook.com/apps/creation/">Tạo ứng dụng</Ext> → đặt tên (vd. “Fanpage của tôi”) → chọn đúng 3 trường hợp sử dụng: <em>Quản lý mọi thứ trên Trang của bạn</em>, <em>Tương tác với khách hàng trên Messenger from Meta</em>, <em>Quản lý hoạt động nhắn tin và nội dung trên Instagram</em> → <em>Tôi chưa muốn kết nối danh mục doanh nghiệp</em> → <em>Tạo ứng dụng</em>. <strong>Không</strong> chọn mục quảng cáo (sẽ bị đòi xác minh doanh nghiệp).</span>
      </li>
      <OwnAppSettingsSteps app={app} features={features} />
    </ol>
  );
}

// Tạo Fanpage mới hoặc được thêm làm quản trị viên Fanpage có sẵn
export function CreatePageSteps() {
  return (
    <ol className="fb-guide-steps">
      <li>
        <strong>Mở trang tạo Fanpage</strong>
        <span>Vào <Ext href="https://www.facebook.com/pages/create">facebook.com/pages/create</Ext> bằng đúng nick Facebook sẽ đăng nhập vào tool.</span>
      </li>
      <li>
        <strong>Điền thông tin Trang</strong>
        <span>Nhập <em>Tên Trang</em>, chọn <em>Hạng mục</em> (vd. Cửa hàng bán lẻ, Thương hiệu…), thêm <em>Tiểu sử</em> nếu muốn → <em>Tạo Trang</em>.</span>
      </li>
      <li>
        <strong>Hoàn thiện Trang</strong>
        <span>Thêm ảnh đại diện, ảnh bìa, thông tin liên hệ (có thể bỏ qua) → <em>Tiếp</em> → <em>Xong</em>. Nick tạo Trang tự có toàn quyền quản trị.</span>
      </li>
      <li>
        <strong>Fanpage đã có sẵn do người khác tạo?</strong>
        <span>Chủ Trang vào Trang → <em>Cài đặt</em> → <em>Quyền truy cập Trang</em> → <em>Thêm mới</em> → nhập nick của bạn → bật <em>Toàn quyền</em> → bạn bấm <em>Chấp nhận</em> trong thông báo Facebook.</span>
      </li>
      <li>
        <strong>Kết nối vào tool</strong>
        <span>Quay lại trang Kênh → <em>Đăng nhập Facebook</em> → ở bước hỏi quyền chọn <em>Chỉnh sửa quyền truy cập</em> → tích Fanpage vừa tạo → <em>Tiếp tục</em>.</span>
      </li>
    </ol>
  );
}
