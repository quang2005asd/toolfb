import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { Check, Copy, ExternalLink, X } from 'lucide-react';

// Hướng dẫn từng bước cho đăng nhập Facebook: thiết lập Meta App, xử lý lỗi, cấp quyền, lấy token
export const GUIDE_TABS = [
  { id: 'setup', label: 'Thiết lập Meta App' },
  { id: 'login-errors', label: 'Lỗi khi đăng nhập' },
  { id: 'permissions', label: 'Cấp quyền' },
  { id: 'account-token', label: 'Token tài khoản' },
  { id: 'page-token', label: 'Token Page' }
];

function CopyValue({ value }) {
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

function Ext({ href, children }) {
  return <a href={href} target="_blank" rel="noopener noreferrer">{children} <ExternalLink size={11} aria-hidden="true" /></a>;
}

function SetupGuide({ app, canConfigure }) {
  const origin = app?.siteOrigin || (typeof window !== 'undefined' ? window.location.origin : '');
  return (
    <>
      <p className="fb-guide-intro">Làm một lần cho cả tool. Mỗi bước đều cần thiết — thiếu bước nào Facebook sẽ báo lỗi ở trang đăng nhập.</p>
      <ol className="fb-guide-steps">
        <li>
          <strong>Tạo Meta App</strong>
          <span>Vào <Ext href="https://developers.facebook.com/apps/">developers.facebook.com/apps</Ext> → <em>Tạo ứng dụng</em> → chọn loại <em>Doanh nghiệp</em> → đặt tên ứng dụng.</span>
        </li>
        <li>
          <strong>Thêm trường hợp sử dụng</strong>
          <span>Trong app: <em>Trường hợp sử dụng → Thêm</em> các mục về <em>Quản lý Trang (Page)</em>, <em>Messenger</em>, <em>Instagram</em> (nếu dùng) và <em>Đăng nhập bằng Facebook</em>. Trong từng mục, bấm <em>Tùy chỉnh → Quyền và tính năng</em> để thêm các quyền ở tab “Cấp quyền”.</span>
        </li>
        <li>
          <strong>Cài đặt ứng dụng → Thông tin cơ bản</strong>
          <span>Điền các ô sau rồi bấm <em>Lưu thay đổi</em>:</span>
          <dl className="fb-guide-fields">
            <dt>Miền ứng dụng</dt><dd><CopyValue value={app?.domain || ''} /></dd>
            <dt>URL Chính sách quyền riêng tư</dt><dd><CopyValue value={`${origin}/privacy?lang=en`} /></dd>
            <dt>URL Điều khoản dịch vụ</dt><dd><CopyValue value={`${origin}/terms?lang=en`} /></dd>
            <dt>Xóa dữ liệu người dùng (URL gọi lại)</dt><dd><CopyValue value={`${origin}/api/meta/data-deletion`} /></dd>
          </dl>
          <span>Thêm <em>Hạng mục</em> và <em>Biểu tượng ứng dụng</em> 1024×1024.</span>
        </li>
        <li>
          <strong>Đăng nhập bằng Facebook → Cài đặt</strong>
          <span>Bật <em>Đăng nhập OAuth trên web</em> và <em>Bắt buộc HTTPS</em>, rồi thêm vào <em>URI chuyển hướng OAuth hợp lệ</em>:</span>
          <dl className="fb-guide-fields"><dt>URI chuyển hướng</dt><dd><CopyValue value={app?.redirectUri || `${origin}/api/auth/facebook/callback`} /></dd></dl>
        </li>
        <li>
          <strong>Đưa App ID & App Secret vào tool</strong>
          <span>Trong app: <em>Cài đặt ứng dụng → Thông tin cơ bản</em> → chép <em>ID ứng dụng</em> và bấm <em>Hiển thị</em> ở <em>Khóa bí mật của ứng dụng</em>. Dán vào tool tại <em>Cài đặt → Hồ sơ &amp; bảo mật → Meta App</em>.</span>
          {canConfigure
            ? <Link href="/settings" className="button button-secondary fb-guide-action">Mở Cài đặt → Meta App</Link>
            : <span className="fb-guide-note">Chỉ Quản trị viên của tool nhập được App ID / App Secret — hãy gửi 2 giá trị này cho Quản trị viên.</span>}
        </li>
        <li>
          <strong>Thêm vai trò cho nick Facebook sẽ đăng nhập</strong>
          <span>Khi app <em>chưa phát hành</em>, chỉ nick có vai trò trong app mới đăng nhập được. Vào <em>Vai trò trong ứng dụng → Vai trò → Thêm người</em> → chọn <em>Người thử nghiệm</em> (hoặc Nhà phát triển). Người được mời phải bấm <em>Chấp nhận</em> lời mời.</span>
        </li>
        <li>
          <strong>Dùng cho khách hàng thật (làm sau)</strong>
          <span>Để mọi nick Facebook đăng nhập được: xác minh doanh nghiệp → gửi <em>Xét duyệt ứng dụng (App Review)</em> xin quyền nâng cao → chuyển app sang <em>Đang hoạt động (Live)</em>.</span>
        </li>
      </ol>
    </>
  );
}

const LOGIN_ERRORS = [
  { title: '“Ứng dụng không hoạt động” / “App not active” / “ứng dụng đang ở chế độ phát triển”', fix: 'Nick Facebook bạn đang đăng nhập không có vai trò trong app. Thêm nick đó làm Người thử nghiệm (bước 6 phần Thiết lập) và chấp nhận lời mời — hoặc đăng nhập bằng nick Quản trị viên của app.' },
  { title: '“URL bị chặn” / “URL Blocked”', fix: 'Chưa khai báo URI chuyển hướng. Làm bước 4 phần Thiết lập (Đăng nhập bằng Facebook → Cài đặt → URI chuyển hướng OAuth hợp lệ).' },
  { title: '“Không thể tải URL… miền của URL không có trong miền của ứng dụng”', fix: 'Chưa khai báo tên miền của tool. Làm bước 3 phần Thiết lập (Miền ứng dụng).' },
  { title: '“Tính năng không khả dụng” / “Feature unavailable”', fix: 'App chưa có Đăng nhập bằng Facebook. Làm bước 2 phần Thiết lập (thêm trường hợp sử dụng Đăng nhập bằng Facebook).' },
  { title: '“Phạm vi không hợp lệ” / “Invalid Scopes: …”', fix: 'App chưa được thêm quyền được nêu trong lỗi. Vào Trường hợp sử dụng → Tùy chỉnh → Quyền và tính năng → thêm đúng quyền đó (xem tab “Cấp quyền”).' },
  { title: 'Đăng nhập xong nhưng tool báo “đã hủy” hoặc “chưa cấp đủ quyền”', fix: 'Bấm Đăng nhập Facebook lại, chọn “Chỉnh sửa quyền truy cập” và bật đủ Trang (Fanpage) + các quyền được hỏi.' },
  { title: 'Quay về tool nhưng báo “Phiên đăng nhập Facebook đã hết hạn”', fix: 'Bạn mở trang đăng nhập quá lâu hoặc trình duyệt chặn cookie của tool. Đăng nhập tool lại rồi bấm Đăng nhập Facebook ngay (không mở ở tab ẩn danh khác).' }
];

function LoginErrorsGuide() {
  return (
    <>
      <p className="fb-guide-intro">Nếu sau khi bấm <em>Đăng nhập Facebook</em> mà Facebook hiện thông báo lỗi và không quay về tool, đối chiếu thông báo với bảng dưới:</p>
      <ul className="fb-guide-errors">
        {LOGIN_ERRORS.map((item) => (
          <li key={item.title}><strong>{item.title}</strong><span>{item.fix}</span></li>
        ))}
      </ul>
    </>
  );
}

function PermissionsGuide({ features, loginScopes }) {
  return (
    <>
      <p className="fb-guide-intro">Mỗi tính năng cần các quyền dưới đây. Thiếu quyền nào thì tính năng đó chưa dùng được.</p>
      <table className="fb-guide-table">
        <thead><tr><th scope="col">Tính năng</th><th scope="col">Quyền cần có</th></tr></thead>
        <tbody>
          {(features || []).map((feature) => (
            <tr key={feature.key}>
              <td>{feature.label}{feature.optional ? <span className="fb-guide-note"> (tùy chọn)</span> : null}</td>
              <td>{feature.scopes.map((scope) => <code key={scope}>{scope}</code>)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ol className="fb-guide-steps">
        <li><strong>Thêm quyền vào Meta App</strong><span>Trường hợp sử dụng → Tùy chỉnh → <em>Quyền và tính năng</em> → bấm <em>Thêm</em> cho từng quyền còn thiếu.</span></li>
        <li><strong>Cấp quyền cho tool</strong><span>Bấm <em>Đăng nhập Facebook</em> trong trang Kênh → ở hộp thoại Facebook chọn <em>Chỉnh sửa quyền truy cập</em> → bật đủ Fanpage và các quyền → <em>Tiếp tục</em>.</span></li>
        <li><strong>Dùng token dán tay?</strong><span>Khi tạo token ở Graph API Explorer, thêm đủ các quyền sau rồi tạo token mới:</span>
          <dl className="fb-guide-fields"><dt>Danh sách quyền</dt><dd><CopyValue value={(loginScopes || []).join(',')} /></dd></dl>
        </li>
      </ol>
    </>
  );
}

function AccountTokenGuide({ app, loginScopes }) {
  return (
    <>
      <p className="fb-guide-intro">Token tài khoản giúp tool tự nạp <strong>toàn bộ Fanpage</strong> của nick Facebook và tự lấy lại token khi hết hạn.</p>
      <ol className="fb-guide-steps">
        <li><strong>Mở Graph API Explorer</strong><span><Ext href="https://developers.facebook.com/tools/explorer/">developers.facebook.com/tools/explorer</Ext> (đăng nhập bằng nick Facebook quản lý Fanpage).</span></li>
        <li><strong>Chọn đúng Meta App</strong><span>Ô <em>Meta App</em> → chọn app của tool{app?.appId ? <> (ID <code>{app.appId}</code>)</> : null}. Token tạo bằng app khác sẽ không tự gia hạn được.</span></li>
        <li><strong>Chọn loại token</strong><span>Ô <em>Người dùng hoặc Trang</em> → <em>Mã truy cập người dùng (User Token)</em>.</span></li>
        <li><strong>Thêm quyền</strong><span>Ô <em>Quyền</em> → thêm từng quyền sau:</span>
          <dl className="fb-guide-fields"><dt>Danh sách quyền</dt><dd><CopyValue value={(loginScopes || []).join(',')} /></dd></dl>
        </li>
        <li><strong>Tạo token</strong><span>Bấm <em>Generate Access Token</em> → đăng nhập → <em>Chỉnh sửa quyền truy cập</em> → chọn tất cả Fanpage → cho phép.</span></li>
        <li><strong>Dán vào tool</strong><span>Chép token (bắt đầu bằng <code>EAA…</code>) → trang Kênh → <em>Thêm qua token → Token tài khoản Facebook</em> → dán → <em>Xác thực & Nạp Pages</em>.{app?.configured ? ' Tool tự đổi sang token dài hạn.' : ' Token này chỉ sống 1–2 giờ cho tới khi Quản trị viên cấu hình App ID & App Secret.'}</span></li>
      </ol>
    </>
  );
}

function PageTokenGuide({ app }) {
  return (
    <>
      <p className="fb-guide-intro">Dùng khi chỉ cần thêm <strong>một Fanpage</strong>. Lưu ý: Fanpage thêm bằng Page Token không tự lấy lại token được — nên ưu tiên Token tài khoản.</p>
      <ol className="fb-guide-steps">
        <li><strong>Có Token tài khoản trước</strong><span>Làm bước 1–5 ở tab <em>Token tài khoản</em> trong Graph API Explorer (chưa cần dán vào tool).</span></li>
        <li><strong>Lấy danh sách Fanpage</strong><span>Trong Graph API Explorer, nhập vào ô truy vấn rồi bấm <em>Gửi</em>:</span>
          <dl className="fb-guide-fields"><dt>Truy vấn</dt><dd><CopyValue value="me/accounts?fields=id,name,access_token" /></dd></dl>
        </li>
        <li><strong>Chép Page ID và Page Token</strong><span>Trong kết quả, tìm Fanpage cần thêm: <code>id</code> là <em>Page ID</em>, <code>access_token</code> là <em>Page Token</em>.</span></li>
        <li><strong>Dán vào tool</strong><span>Trang Kênh → <em>Thêm qua token → Token Page</em> → điền Page ID + Page Token → <em>Lưu kết nối</em>.</span></li>
        <li><strong>Token không hết hạn</strong><span>{app?.configured ? 'Page Token lấy từ token tài khoản dài hạn sẽ không hết hạn. Nếu Token tài khoản là loại ngắn hạn, hãy dán nó vào tool trước (tool đổi sang dài hạn) rồi mới lấy Page Token.' : 'Page Token lấy từ token ngắn hạn sẽ hết hạn sau 1–2 giờ. Cấu hình App ID & App Secret để tool tự quản lý token dài hạn.'}</span></li>
      </ol>
    </>
  );
}

export default function FacebookGuideModal({ open, tab, onTabChange, onClose, status }) {
  const closeRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  // Chỉ chạy khi mở / đóng: focus nút Đóng, Esc để đóng, đóng xong trả focus về nút đã mở hướng dẫn
  useEffect(() => {
    if (!open) return undefined;
    const opener = document.activeElement;
    closeRef.current?.focus();
    const onKey = (event) => { if (event.key === 'Escape') onCloseRef.current(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, [open]);
  if (!open || typeof document === 'undefined') return null;

  const app = status?.app;
  const body = {
    setup: <SetupGuide app={app} canConfigure={status?.canConfigure} />,
    'login-errors': <LoginErrorsGuide />,
    permissions: <PermissionsGuide features={status?.features} loginScopes={status?.loginScopes} />,
    'account-token': <AccountTokenGuide app={app} loginScopes={status?.loginScopes} />,
    'page-token': <PageTokenGuide app={app} />
  }[tab] || null;

  return createPortal(
    <div className="fb-guide-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="fb-guide-dialog" role="dialog" aria-modal="true" aria-labelledby="fb-guide-title">
        <div className="fb-guide-head">
          <h2 id="fb-guide-title">Hướng dẫn kết nối Facebook</h2>
          <button ref={closeRef} type="button" className="icon-button" onClick={onClose} aria-label="Đóng hướng dẫn"><X size={17} /></button>
        </div>
        <div className="fb-guide-tabs" role="tablist" aria-label="Chủ đề hướng dẫn">
          {GUIDE_TABS.map((item) => (
            <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} className={tab === item.id ? 'is-active' : ''} onClick={() => onTabChange(item.id)}>
              {item.label}
            </button>
          ))}
        </div>
        <div className="fb-guide-body" role="tabpanel">{body}</div>
      </div>
    </div>,
    document.body
  );
}
