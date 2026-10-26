import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { X } from 'lucide-react';
import { CopyValue, CreatePageSteps, Ext, OwnTokenSteps } from './FacebookGuideSteps';

// Hướng dẫn từng bước cho đăng nhập Facebook: thiết lập Meta App, xử lý lỗi, cấp quyền, tự tạo token, tạo Fanpage
export const GUIDE_TABS = [
  { id: 'setup', label: 'Thiết lập Meta App' },
  { id: 'login-errors', label: 'Lỗi khi đăng nhập' },
  { id: 'permissions', label: 'Cấp quyền' },
  { id: 'account-token', label: 'Tự tạo token' },
  { id: 'page-token', label: 'Token Page' },
  { id: 'create-page', label: 'Tạo Fanpage' }
];

function SetupGuide({ app, canConfigure, webhook }) {
  const origin = app?.siteOrigin || (typeof window !== 'undefined' ? window.location.origin : '');
  return (
    <>
      <p className="fb-guide-intro">Làm một lần cho cả tool (Quản trị viên). Mỗi bước đều cần thiết — thiếu bước nào Facebook sẽ báo lỗi ở trang đăng nhập.</p>
      <ol className="fb-guide-steps">
        <li>
          <strong>Tạo Meta App</strong>
          <span>Vào <Ext href="https://developers.facebook.com/apps/">developers.facebook.com/apps</Ext> → <em>Tạo ứng dụng</em> → chọn loại <em>Doanh nghiệp</em> → đặt tên ứng dụng.</span>
        </li>
        <li>
          <strong>Chọn đúng 3 trường hợp sử dụng</strong>
          <span><em>Quản lý mọi thứ trên Trang của bạn</em>, <em>Tương tác với khách hàng trên Messenger from Meta</em>, <em>Quản lý hoạt động nhắn tin và nội dung trên Instagram</em>. <strong>Không</strong> thêm các mục về quảng cáo, Danh mục, Video trực tiếp — chúng bắt buộc xác minh doanh nghiệp khi phát hành và không gỡ ra được. Trong từng mục, bấm <em>Tùy chỉnh → Quyền và tính năng</em> để thêm các quyền ở tab “Cấp quyền”.</span>
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
          <strong>Cấu hình Webhook (nhận tin nhắn &amp; bình luận gần như tức thì)</strong>
          <span>
            <em>Trường hợp sử dụng</em> → <em>Tương tác với khách hàng trên Messenger from Meta</em> → <em>Tùy chỉnh</em> → <em>Cấu hình webhook</em> → dán 2 giá trị dưới → <em>Xác minh và lưu</em> → bật các trường của Trang
            {' '}{(webhook?.pageFields || ['messages', 'message_echoes', 'feed']).map((field) => <code key={field}>{field}</code>)}.
            {' '}Làm tương tự ở <em>Quản lý hoạt động nhắn tin và nội dung trên Instagram</em> với
            {' '}{(webhook?.instagramFields || ['messages', 'comments']).map((field) => <code key={field}>{field}</code>)}.
            {' '}Tool tự đăng ký từng Fanpage với app sau khi đăng nhập Facebook.
          </span>
          {webhook ? (
            <dl className="fb-guide-fields">
              <dt>URL gọi lại (Callback URL)</dt><dd><CopyValue value={webhook.callbackUrl} /></dd>
              <dt>Mã xác minh (Verify token)</dt>
              <dd>{webhook.verifyToken ? <CopyValue value={webhook.verifyToken} /> : <span className="fb-guide-note">Máy chủ chưa đặt MESSENGER_VERIFY_TOKEN — chưa dùng được Webhook (tool vẫn tự đồng bộ tin nhắn định kỳ).</span>}</dd>
            </dl>
          ) : <span className="fb-guide-note">Chỉ Quản trị viên của tool xem được URL gọi lại và mã xác minh.</span>}
        </li>
        <li>
          <strong>Phát hành app (chế độ Live) để mọi nick đăng nhập được</strong>
          <span>
            Mở {app?.appId ? <Ext href={`https://developers.facebook.com/apps/${app.appId}/dashboard/`}>trang tổng quan app</Ext> : 'trang tổng quan app'} → <em>Phát hành</em> (chuyển <em>Chế độ ứng dụng</em> sang <em>Đang hoạt động / Live</em>) và làm các mục Meta yêu cầu trên màn hình.
            Khi app còn ở chế độ phát triển, Facebook chặn mọi nick không có vai trò trong app bằng thông báo “Ứng dụng không hoạt động”.
          </span>
        </li>
        <li>
          <strong>Quyền Fanpage cho mọi nick (làm sau)</strong>
          <span>Sau khi phát hành, mọi nick đăng nhập được, nhưng Facebook chỉ cấp quyền Fanpage cho nick quản trị app cho tới khi app được duyệt <em>quyền nâng cao</em> (Xét duyệt ứng dụng + xác minh doanh nghiệp). Trong lúc đó, nick khác đăng nhập xong sẽ được tool hướng dẫn <em>tự tạo token</em> — không cần ai mời.</span>
        </li>
      </ol>
    </>
  );
}

const LOGIN_ERRORS = [
  { title: '“Ứng dụng không hoạt động” / “App not active” / “ứng dụng đang ở chế độ phát triển”', fix: 'Meta App của tool chưa phát hành nên Facebook chặn nick không có vai trò trong app (nick mới cũng vậy). Quản trị viên tool: phát hành app (bước 6 tab “Thiết lập Meta App”). Trong lúc chờ, bạn vẫn dùng được Fanpage của mình theo tab “Tự tạo token” — không cần ai mời.' },
  { title: '“URL bị chặn” / “URL Blocked”', fix: 'Chưa khai báo URI chuyển hướng. Làm bước 4 phần Thiết lập (Đăng nhập bằng Facebook → Cài đặt → URI chuyển hướng OAuth hợp lệ).' },
  { title: '“Không thể tải URL… miền của URL không có trong miền của ứng dụng”', fix: 'Chưa khai báo tên miền của tool. Làm bước 3 phần Thiết lập (Miền ứng dụng).' },
  { title: '“Tính năng không khả dụng” / “Feature unavailable”', fix: 'App chưa có Đăng nhập bằng Facebook. Làm bước 2 phần Thiết lập (thêm trường hợp sử dụng Đăng nhập bằng Facebook).' },
  { title: '“Phạm vi không hợp lệ” / “Invalid Scopes: …”', fix: 'App chưa được thêm quyền được nêu trong lỗi. Vào Trường hợp sử dụng → Tùy chỉnh → Quyền và tính năng → thêm đúng quyền đó (xem tab “Cấp quyền”).' },
  { title: 'Đăng nhập xong nhưng tool báo “chưa đủ quyền dùng Fanpage”', fix: 'Nếu Facebook có hỏi quyền: đăng nhập lại, chọn “Chỉnh sửa quyền truy cập” và bật hết. Nếu Facebook không hỏi quyền Fanpage: làm theo tab “Tự tạo token”.' },
  { title: 'Đăng nhập xong nhưng tool báo “chưa có Fanpage”', fix: 'Nick chưa quản trị Fanpage nào, hoặc chưa tích Fanpage khi đăng nhập. Xem tab “Tạo Fanpage”.' },
  { title: 'Quay về tool nhưng báo “Phiên đăng nhập Facebook đã hết hạn”', fix: 'Bạn mở trang đăng nhập quá lâu hoặc trình duyệt chặn cookie của tool. Đăng nhập tool lại rồi bấm Đăng nhập Facebook ngay (không mở ở tab ẩn danh khác).' }
];

function LoginErrorsGuide() {
  return (
    <>
      <p className="fb-guide-intro">Nếu sau khi bấm <em>Đăng nhập Facebook</em> mà Facebook hiện thông báo lỗi, đối chiếu thông báo với bảng dưới:</p>
      <ul className="fb-guide-errors">
        {LOGIN_ERRORS.map((item) => (
          <li key={item.title}><strong>{item.title}</strong><span>{item.fix}</span></li>
        ))}
      </ul>
    </>
  );
}

function PermissionsGuide({ features }) {
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
        <li><strong>Facebook có hỏi quyền khi đăng nhập</strong><span>Bấm <em>Đăng nhập Facebook</em> → ở hộp thoại Facebook chọn <em>Chỉnh sửa quyền truy cập</em> → bật đủ Fanpage và các quyền → <em>Tiếp tục</em>.</span></li>
        <li><strong>Facebook không hỏi quyền Fanpage</strong><span>Meta App của tool chưa được duyệt quyền nâng cao cho nick của bạn. Tự tạo token có đủ quyền theo tab <em>Tự tạo token</em> — không cần ai mời.</span></li>
        <li><strong>Quản trị viên Meta App của tool</strong><span>Thêm quyền vào app (Trường hợp sử dụng → Tùy chỉnh → <em>Quyền và tính năng</em>) và gửi <em>Xét duyệt ứng dụng</em> để mọi nick được Facebook hỏi quyền khi đăng nhập.</span></li>
      </ol>
    </>
  );
}

function AccountTokenGuide({ features }) {
  return (
    <>
      <p className="fb-guide-intro">Dùng khi đăng nhập Facebook bị chặn hoặc không được cấp quyền Fanpage. Bạn tự tạo token bằng Meta App <strong>của chính mình</strong> — không cần ai mời hay cấp vai trò. Tool sẽ tự nạp toàn bộ Fanpage của nick.</p>
      <OwnTokenSteps features={features} />
    </>
  );
}

function PageTokenGuide() {
  return (
    <>
      <p className="fb-guide-intro">Dùng khi chỉ cần thêm <strong>một Fanpage</strong>. Lưu ý: Fanpage thêm bằng Page Token không tự lấy lại token được — nên ưu tiên token tài khoản (tab “Tự tạo token”).</p>
      <ol className="fb-guide-steps">
        <li><strong>Có token tài khoản trước</strong><span>Làm bước 1–5 ở tab <em>Tự tạo token</em> (chưa cần dán vào tool).</span></li>
        <li><strong>Lấy danh sách Fanpage</strong><span>Trong Graph API Explorer, dán token 60 ngày vào ô <em>Mã truy cập</em>, nhập truy vấn sau rồi bấm <em>Gửi</em>:</span>
          <dl className="fb-guide-fields"><dt>Truy vấn</dt><dd><CopyValue value="me/accounts?fields=id,name,access_token" /></dd></dl>
        </li>
        <li><strong>Chép Page ID và Page Token</strong><span>Trong kết quả, tìm Fanpage cần thêm: <code>id</code> là <em>Page ID</em>, <code>access_token</code> là <em>Page Token</em>.</span></li>
        <li><strong>Dán vào tool</strong><span>Trang Kênh → <em>Thêm qua token → Token Page</em> → điền Page ID + Page Token → <em>Lưu kết nối</em>.</span></li>
        <li><strong>Token không hết hạn</strong><span>Page Token lấy từ token tài khoản 60 ngày sẽ không hết hạn. Lấy từ token chưa gia hạn thì chỉ sống 1–2 giờ.</span></li>
      </ol>
    </>
  );
}

function CreatePageGuide() {
  return (
    <>
      <p className="fb-guide-intro">Nick Facebook cần quản trị ít nhất 1 Fanpage thì tool mới có Trang để đăng bài, nhắn tin. Nick mới tạo có thể bị Facebook giới hạn tạo Trang trong vài ngày đầu — hãy xác minh số điện thoại cho nick trước.</p>
      <CreatePageSteps />
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
    setup: <SetupGuide app={app} canConfigure={status?.canConfigure} webhook={status?.webhook} />,
    'login-errors': <LoginErrorsGuide />,
    permissions: <PermissionsGuide features={status?.features} />,
    'account-token': <AccountTokenGuide features={status?.features} />,
    'page-token': <PageTokenGuide />,
    'create-page': <CreatePageGuide />
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
