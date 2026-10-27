import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { CopyValue, CreatePageSteps, MultiNickSteps, OwnAppCreateSteps, OwnAppEnterSteps, OwnTokenSteps, UseCasePermissionBlocks } from './FacebookGuideSteps';

// Hướng dẫn từng bước cho đăng nhập Facebook: tạo / điền Meta App riêng, quyền từng trường hợp sử dụng, nhiều nick, xử lý lỗi, token, Fanpage
export const GUIDE_TABS = [
  { id: 'create-app', label: 'Tạo Meta App' },
  { id: 'enter-app', label: 'Đã có app' },
  { id: 'permissions', label: 'Quyền từng mục' },
  { id: 'multi-nick', label: 'Nhiều nick Facebook' },
  { id: 'login-errors', label: 'Lỗi khi đăng nhập' },
  { id: 'account-token', label: 'Tự tạo token' },
  { id: 'page-token', label: 'Token Page' },
  { id: 'create-page', label: 'Tạo Fanpage' }
];
// Tên tab cũ vẫn mở được đúng nội dung mới
const TAB_ALIASES = { setup: 'create-app' };

const LOGIN_ERRORS = [
  { title: '“Ứng dụng không hoạt động” / “App not active”', fix: 'Nick đang đăng nhập trong cửa sổ Facebook không có vai trò trong Meta App bạn chọn. Đăng nhập đúng nick quản trị viên của app (tab “Nhiều nick Facebook”), hoặc thêm nick đó vào Vai trò trong ứng dụng, hoặc thêm Meta App của chính nick đó vào tool.' },
  { title: '“Hiện không dùng được tính năng này” / “Feature unavailable”', fix: 'Meta đang cập nhật app (vừa tạo, vừa sửa cài đặt hoặc vừa phát hành) — đợi 5–30 phút rồi thử lại. Vẫn lỗi thì kiểm tra app đã có “Đăng nhập bằng Facebook (cho doanh nghiệp)” và đủ quyền ở từng trường hợp sử dụng (tab “Quyền từng mục”).' },
  { title: '“URL bị chặn” / “URL Blocked”', fix: 'Chưa khai báo URI chuyển hướng. Làm bước “Cài đặt Đăng nhập bằng Facebook” ở tab “Tạo Meta App”.' },
  { title: '“Không thể tải URL… miền của URL không có trong miền của ứng dụng”', fix: 'Chưa khai báo tên miền của tool. Làm bước “Khai báo tên miền của tool” (thêm nền tảng Trang web + Miền ứng dụng).' },
  { title: '“Phạm vi không hợp lệ” / “Invalid Scopes: …”', fix: 'App chưa thêm quyền được nêu trong lỗi. Mở đúng trường hợp sử dụng chứa quyền đó → Tùy chỉnh → Quyền và tính năng → Thêm (tab “Quyền từng mục”).' },
  { title: 'Đăng nhập xong nhưng tool báo “chưa đủ quyền dùng Fanpage”', fix: 'Đăng nhập lại, chọn “Chỉnh sửa quyền truy cập” và bật hết quyền + Fanpage. Facebook không hỏi quyền nào thì quyền đó chưa được thêm vào app.' },
  { title: 'Đăng nhập xong nhưng tool báo “chưa có Fanpage”', fix: 'Nick chưa quản trị Fanpage nào, hoặc chưa tích Fanpage khi đăng nhập. Xem tab “Tạo Fanpage”.' },
  { title: 'Kết nối nhầm nick (không phải nick muốn thêm)', fix: 'Facebook dùng nick đang đăng nhập trong trình duyệt. Trong cửa sổ Facebook đăng xuất / chuyển tài khoản sang nick cần thêm rồi thử lại (tab “Nhiều nick Facebook”).' },
  { title: 'Quay về tool nhưng báo “Phiên đăng nhập Facebook đã hết hạn”', fix: 'Bạn mở trang đăng nhập quá lâu hoặc trình duyệt chặn cookie của tool. Đăng nhập tool lại rồi bấm Đăng nhập Facebook ngay.' }
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
      <p className="fb-guide-intro">Quyền được thêm <strong>riêng trong từng trường hợp sử dụng</strong> của Meta App — mỗi mục có nút <em>Tùy chỉnh</em> riêng. Làm lần lượt từng khối dưới đây.</p>
      <UseCasePermissionBlocks />
      <h3 className="fb-guide-subtitle">Tính năng nào cần quyền nào</h3>
      <table className="fb-guide-table">
        <thead><tr><th scope="col">Tính năng của tool</th><th scope="col">Quyền cần có</th></tr></thead>
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
        <li><strong>Thêm quyền xong rồi cấp cho tool</strong><span>Bấm <em>Đăng nhập Facebook</em> trong trang Kênh → ở hộp thoại Facebook chọn <em>Chỉnh sửa quyền truy cập</em> → bật đủ Fanpage và các quyền → <em>Tiếp tục</em>.</span></li>
        <li><strong>Facebook không hỏi một quyền</strong><span>Quyền đó chưa được thêm vào đúng trường hợp sử dụng trong app. Thêm xong đăng nhập lại.</span></li>
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

  const current = TAB_ALIASES[tab] || tab;
  const app = status?.app;
  const webhook = status?.webhook;
  const body = {
    'create-app': (
      <>
        <p className="fb-guide-intro">Tool không dùng app chung: mỗi tài khoản dùng <strong>Meta App của riêng mình</strong> (miễn phí, khoảng 10 phút). Nick tạo app là quản trị viên nên đăng nhập được ngay, không cần ai mời.</p>
        <OwnAppCreateSteps app={app} webhook={webhook} />
      </>
    ),
    'enter-app': (
      <>
        <p className="fb-guide-intro">Đã có Meta App trên developers.facebook.com: kiểm tra đủ các mục dưới đây rồi điền App ID + Khóa bí mật ở <em>Meta App của tôi</em> trong trang Kênh.</p>
        <OwnAppEnterSteps app={app} webhook={webhook} />
      </>
    ),
    permissions: <PermissionsGuide features={status?.features} />,
    'multi-nick': (
      <>
        <p className="fb-guide-intro">Một tài khoản tool kết nối được nhiều nick Facebook và quản lý Fanpage của tất cả các nick đó.</p>
        <MultiNickSteps />
      </>
    ),
    'login-errors': <LoginErrorsGuide />,
    'account-token': (
      <>
        <p className="fb-guide-intro">Không muốn điền Meta App vào tool? Tự tạo token bằng app của bạn rồi dán vào — tool tự nạp toàn bộ Fanpage của nick.</p>
        <OwnTokenSteps features={status?.features} />
      </>
    ),
    'page-token': (
      <>
        <p className="fb-guide-intro">Dùng khi chỉ cần thêm <strong>một Fanpage</strong>. Fanpage thêm bằng Page Token không tự lấy lại token được — nên ưu tiên đăng nhập Facebook hoặc token tài khoản.</p>
        <ol className="fb-guide-steps">
          <li><strong>Có token tài khoản trước</strong><span>Làm bước 1–3 ở tab <em>Tự tạo token</em> (chưa cần dán vào tool).</span></li>
          <li><strong>Lấy danh sách Fanpage</strong><span>Trong Graph API Explorer, dán token 60 ngày vào ô <em>Mã truy cập</em>, nhập truy vấn sau rồi bấm <em>Gửi</em>:</span>
            <dl className="fb-guide-fields"><dt>Truy vấn</dt><dd><CopyValue value="me/accounts?fields=id,name,access_token" /></dd></dl>
          </li>
          <li><strong>Chép Page ID và Page Token</strong><span>Trong kết quả, tìm Fanpage cần thêm: <code>id</code> là <em>Page ID</em>, <code>access_token</code> là <em>Page Token</em>.</span></li>
          <li><strong>Dán vào tool</strong><span>Trang Kênh → <em>Thêm qua token → Token Page</em> → điền Page ID + Page Token → <em>Lưu kết nối</em>.</span></li>
          <li><strong>Token không hết hạn</strong><span>Page Token lấy từ token tài khoản 60 ngày sẽ không hết hạn. Lấy từ token chưa gia hạn thì chỉ sống 1–2 giờ.</span></li>
        </ol>
      </>
    ),
    'create-page': (
      <>
        <p className="fb-guide-intro">Nick Facebook cần quản trị ít nhất 1 Fanpage thì tool mới có Trang để đăng bài, nhắn tin. Nick mới tạo có thể bị Facebook giới hạn tạo Trang vài ngày đầu — hãy xác minh số điện thoại cho nick trước.</p>
        <CreatePageSteps />
      </>
    )
  }[current] || null;

  return createPortal(
    <div className="fb-guide-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="fb-guide-dialog" role="dialog" aria-modal="true" aria-labelledby="fb-guide-title">
        <div className="fb-guide-head">
          <h2 id="fb-guide-title">Hướng dẫn kết nối Facebook</h2>
          <button ref={closeRef} type="button" className="icon-button" onClick={onClose} aria-label="Đóng hướng dẫn"><X size={17} /></button>
        </div>
        <div className="fb-guide-tabs" role="tablist" aria-label="Chủ đề hướng dẫn">
          {GUIDE_TABS.map((item) => (
            <button key={item.id} type="button" role="tab" aria-selected={current === item.id} className={current === item.id ? 'is-active' : ''} onClick={() => onTabChange(item.id)}>
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
