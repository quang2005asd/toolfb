import { useState } from 'react';
import { Check, Copy, ExternalLink } from 'lucide-react';

// Các bảng hướng dẫn dùng chung cho hộp hướng dẫn và hộp thoại đăng nhập Facebook

// Quyền tool cần, tách theo đúng từng trường hợp sử dụng trong Meta App (mỗi mục bấm "Tùy chỉnh" riêng)
export const USE_CASES = [
  {
    key: 'pages',
    name: 'Quản lý mọi thứ trên Trang của bạn',
    en: 'Manage everything on your Page',
    note: 'Bắt buộc. Thiếu mục này tool không nạp được Fanpage.',
    permissions: [
      { scope: 'pages_show_list', purpose: 'Xem danh sách Fanpage bạn quản lý — bắt buộc để tool nạp Fanpage' },
      { scope: 'pages_read_engagement', purpose: 'Đọc bài viết, bình luận và số liệu tương tác của Fanpage' },
      { scope: 'pages_manage_posts', purpose: 'Đăng, lên lịch và sửa bài viết trên Fanpage' },
      { scope: 'pages_read_user_content', purpose: 'Đọc bình luận, bài viết của khách trên Fanpage (AI Bình luận)' },
      { scope: 'pages_manage_engagement', purpose: 'Trả lời, ẩn, xóa bình luận (AI Bình luận, bình luận mồi)' },
      { scope: 'pages_manage_metadata', purpose: 'Đăng ký Webhook và đọc cài đặt của Fanpage' },
      { scope: 'business_management', purpose: 'Fanpage nằm trong Meta Business Suite (thêm nếu danh sách có)', optional: true }
    ]
  },
  {
    key: 'messenger',
    name: 'Tương tác với khách hàng trên Messenger from Meta',
    en: 'Engage with customers on Messenger from Meta',
    note: 'Cần cho trang Tin nhắn và trả lời tự động. Các quyền pages_… ở mục trên nếu xuất hiện lại ở đây thì để nguyên.',
    permissions: [
      { scope: 'pages_messaging', purpose: 'Đọc và gửi tin nhắn Messenger của Fanpage, trả lời tự động' }
    ]
  },
  {
    key: 'instagram',
    name: 'Quản lý hoạt động nhắn tin và nội dung trên Instagram',
    en: 'Manage messaging & content on Instagram',
    note: 'Chỉ cần khi dùng Instagram. Khi Meta hỏi cách thiết lập, chọn “Thiết lập API bằng đăng nhập Facebook” (API setup with Facebook login), không chọn đăng nhập Instagram.',
    permissions: [
      { scope: 'instagram_basic', purpose: 'Đọc thông tin tài khoản Instagram liên kết với Fanpage' },
      { scope: 'instagram_manage_messages', purpose: 'Đọc và trả lời tin nhắn Instagram Direct' },
      { scope: 'instagram_manage_comments', purpose: 'Đọc và trả lời bình luận Instagram', optional: true },
      { scope: 'instagram_content_publish', purpose: 'Đăng bài lên Instagram', optional: true }
    ]
  }
];

const FALLBACK_PAGE_SCOPES = USE_CASES.filter((item) => item.key !== 'instagram').flatMap((item) => item.permissions.map((perm) => perm.scope));
const INSTAGRAM_SCOPES = USE_CASES.find((item) => item.key === 'instagram').permissions.map((perm) => perm.scope);

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

// Quyền theo từng trường hợp sử dụng: mỗi mục một khối riêng, mỗi quyền một dòng có giải thích
export function UseCasePermissionBlocks({ missing, compact = false }) {
  return (
    <div className="fb-usecase-list">
      {USE_CASES.map((useCase, index) => (
        <section key={useCase.key} className="fb-usecase">
          <div className="fb-usecase-head">
            <span className="fb-usecase-num">{index + 1}</span>
            <div>
              <strong>{useCase.name}</strong>
              <small>{useCase.en}</small>
            </div>
          </div>
          {!compact && (
            <p className="fb-usecase-path">
              <em>Trường hợp sử dụng</em> → mục <em>{useCase.name}</em> → <em>Tùy chỉnh</em> → <em>Quyền và tính năng</em> → bấm <em>Thêm</em> ở từng quyền dưới đây. Quyền thêm xong hiện trạng thái <em>Sẵn sàng thử nghiệm</em>.
            </p>
          )}
          {useCase.note && <p className="fb-usecase-note">{useCase.note}</p>}
          <ul className="fb-usecase-perms">
            {useCase.permissions.map((perm) => (
              <li key={perm.scope} className={missing?.includes(perm.scope) ? 'is-missing' : ''}>
                <CopyValue value={perm.scope} />
                <span>{perm.purpose}{perm.optional ? ' (tùy chọn)' : ''}{missing?.includes(perm.scope) ? ' — tool đang thiếu quyền này' : ''}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

// Các mục một Meta App phải có để đăng nhập qua tool (dùng chung cho "đã có app" và "tạo app mới")
function OwnAppSettingsSteps({ app, webhook, missing }) {
  const origin = app?.siteOrigin || (typeof window !== 'undefined' ? window.location.origin : '');
  const domain = app?.domain || (typeof window !== 'undefined' ? window.location.hostname : '');
  const redirectUri = app?.redirectUri || `${origin}/api/auth/facebook/callback`;
  return (
    <>
      <li>
        <strong>Điền Thông tin cơ bản của app</strong>
        <span>Menu trái <em>Cài đặt ứng dụng</em> → <em>Thông tin cơ bản</em> — điền đủ các ô dưới (Meta bắt buộc khi phát hành app):</span>
        <ol className="fb-guide-substeps">
          <li>Kéo xuống cuối trang → <em>+ Thêm nền tảng</em> → chọn <em>Trang web</em> → <em>Tiếp</em> → ô <em>URL trang web</em> dán giá trị bên dưới.</li>
          <li>Ô <em>Miền ứng dụng</em> → dán tên miền → nhấn Enter.</li>
          <li>Ô <em>URL chính sách quyền riêng tư</em> và ô <em>URL Điều khoản dịch vụ</em> → dán 2 URL bên dưới.</li>
          <li>Mục <em>Xóa dữ liệu người dùng</em> → chọn <em>URL gọi lại xóa dữ liệu</em> → dán URL gọi lại bên dưới (tool tự xóa dữ liệu khi người dùng gỡ app trên Facebook). Ô này chỉ nhận <em>URL hướng dẫn xóa dữ liệu</em> thì dán URL hướng dẫn.</li>
          <li><em>Biểu tượng ứng dụng</em> (ảnh vuông 1024 × 1024), <em>Hạng mục</em> (vd. Kinh doanh và trang) và <em>Email liên hệ</em>: điền thông tin của bạn.</li>
          <li>Bấm <em>Lưu thay đổi</em> ở cuối trang. Meta báo lỗi “miền phải khớp URL trang web” nghĩa là chưa thêm nền tảng Trang web.</li>
        </ol>
        <dl className="fb-guide-fields">
          <dt>URL trang web</dt><dd><CopyValue value={`${origin}/`} /></dd>
          <dt>Miền ứng dụng</dt><dd><CopyValue value={domain} /></dd>
          <dt>URL chính sách quyền riêng tư</dt><dd><CopyValue value={`${origin}/privacy/`} /></dd>
          <dt>URL Điều khoản dịch vụ</dt><dd><CopyValue value={`${origin}/terms/`} /></dd>
          <dt>URL gọi lại xóa dữ liệu</dt><dd><CopyValue value={`${origin}/api/meta/data-deletion`} /></dd>
          <dt>URL hướng dẫn xóa dữ liệu</dt><dd><CopyValue value={`${origin}/data-deletion/`} /></dd>
        </dl>
      </li>
      <li>
        <strong>Cài đặt Đăng nhập bằng Facebook</strong>
        <span>Menu trái <em>Đăng nhập bằng Facebook cho doanh nghiệp</em> (hoặc <em>Đăng nhập bằng Facebook</em>) → <em>Cài đặt</em>:</span>
        <ol className="fb-guide-substeps">
          <li><em>Đăng nhập OAuth ứng dụng khách</em>: <strong>Có</strong>.</li>
          <li><em>Đăng nhập OAuth trên web</em>: <strong>Có</strong>. <em>Bắt buộc HTTPS</em>: <strong>Có</strong>.</li>
          <li>Ô <em>URI chuyển hướng OAuth hợp lệ</em>: dán URI bên dưới → nhấn Enter → <em>Lưu thay đổi</em>.</li>
          <li>Có ô <em>Trình xác thực URI chuyển hướng</em> thì dán URI vào để kiểm tra — đúng sẽ báo hợp lệ.</li>
        </ol>
        <dl className="fb-guide-fields"><dt>URI chuyển hướng</dt><dd><CopyValue value={redirectUri} /></dd></dl>
      </li>
      <li>
        <strong>Thêm quyền cho từng trường hợp sử dụng</strong>
        <span>Làm lần lượt <em>từng mục</em> — mỗi mục có nút <em>Tùy chỉnh</em> riêng, quyền của mục nào thêm ở mục đó:</span>
        <UseCasePermissionBlocks missing={missing} />
      </li>
      <li>
        <strong>Nick Facebook dùng để đăng nhập phải có vai trò trong app</strong>
        <span>Nick tạo app tự là <em>Quản trị viên</em> nên đăng nhập được ngay. Muốn đăng nhập thêm nick khác <em>qua cùng app này</em>: menu trái <em>Vai trò trong ứng dụng</em> → <em>Vai trò</em> → <em>Thêm người</em> → chọn <em>Quản trị viên</em> hoặc <em>Nhà phát triển</em> → nhập tên nick → nick đó mở <Ext href="https://developers.facebook.com/requests/">developers.facebook.com/requests</Ext> bấm <em>Chấp nhận</em>. Hoặc nick đó tự tạo app riêng rồi thêm app thứ hai vào tool.</span>
      </li>
      <li>
        <strong>Chép App ID và Khóa bí mật vào tool</strong>
        <span><em>Cài đặt ứng dụng</em> → <em>Thông tin cơ bản</em> → chép <em>ID ứng dụng</em>; ở ô <em>Khóa bí mật của ứng dụng</em> bấm <em>Hiển thị</em> (nhập lại mật khẩu Facebook nếu được hỏi) → chép → dán vào ô bên dưới bảng này. Không gửi Khóa bí mật cho ai khác.</span>
      </li>
      <li>
        <strong>Nhận tin nhắn tức thì qua Webhook (tùy chọn)</strong>
        <span>Không làm bước này tool vẫn tự đồng bộ tin nhắn vài giây một lần. Muốn nhận tức thì: <em>Trường hợp sử dụng</em> → <em>Tương tác với khách hàng trên Messenger from Meta</em> → <em>Tùy chỉnh</em> → <em>Cấu hình webhook</em> → dán 2 giá trị dưới → <em>Xác minh và lưu</em> → bật trường {(webhook?.pageFields || ['messages', 'message_echoes', 'feed']).map((field) => <code key={field}>{field}</code>)}. Với Instagram làm tương tự, bật {(webhook?.instagramFields || ['messages', 'comments']).map((field) => <code key={field}>{field}</code>)}.</span>
        {webhook?.callbackUrl && (
          <dl className="fb-guide-fields">
            <dt>URL gọi lại</dt><dd><CopyValue value={webhook.callbackUrl} /></dd>
            {webhook.verifyToken && <><dt>Mã xác minh</dt><dd><CopyValue value={webhook.verifyToken} /></dd></>}
          </dl>
        )}
      </li>
    </>
  );
}

// Đã có Meta App trên developers.facebook.com → kiểm tra đủ các mục rồi điền vào tool
export function OwnAppEnterSteps({ app, webhook, missing }) {
  return (
    <ol className="fb-guide-steps">
      <li>
        <strong>Mở đúng Meta App</strong>
        <span>Vào <Ext href="https://developers.facebook.com/apps/">developers.facebook.com/apps</Ext> bằng nick Facebook quản lý Fanpage → bấm vào app. Menu trái <em>Trường hợp sử dụng</em> phải có mục <em>Quản lý mọi thứ trên Trang của bạn</em>; chưa có thì bấm <em>Thêm trường hợp sử dụng</em> (góc trên bên phải) để thêm. App có các mục quảng cáo vẫn dùng được — chỉ cần không bấm Phát hành.</span>
      </li>
      <OwnAppSettingsSteps app={app} webhook={webhook} missing={missing} />
    </ol>
  );
}

// Chưa có Meta App → tạo từ đầu (miễn phí; để ở chế độ phát triển là đủ dùng cho Fanpage của chính mình)
export function OwnAppCreateSteps({ app, webhook, missing }) {
  return (
    <ol className="fb-guide-steps">
      <li>
        <strong>Đăng ký tài khoản nhà phát triển (một lần, miễn phí)</strong>
        <ol className="fb-guide-substeps">
          <li>Mở <Ext href="https://developers.facebook.com/">developers.facebook.com</Ext> bằng <em>đúng nick Facebook quản lý Fanpage</em> → bấm <em>Bắt đầu</em> (Get Started) ở góc phải.</li>
          <li>Đồng ý điều khoản → xác minh số điện thoại hoặc email theo hướng dẫn của Meta.</li>
          <li>Chọn vai trò bất kỳ (vd. <em>Nhà phát triển</em>) → <em>Hoàn tất đăng ký</em>.</li>
        </ol>
      </li>
      <li>
        <strong>Tạo ứng dụng</strong>
        <ol className="fb-guide-substeps">
          <li>Mở <Ext href="https://developers.facebook.com/apps/creation/">Tạo ứng dụng</Ext>.</li>
          <li><em>Thông tin chi tiết về ứng dụng</em>: đặt tên (vd. “Fanpage của tôi”), email liên hệ → <em>Tiếp</em>.</li>
          <li><em>Trường hợp sử dụng</em>: tích <em>Quản lý mọi thứ trên Trang của bạn</em>, <em>Tương tác với khách hàng trên Messenger from Meta</em>, và <em>Quản lý hoạt động nhắn tin và nội dung trên Instagram</em> nếu dùng Instagram (dùng ô tìm kiếm cho nhanh) → <em>Tiếp</em>. <strong>Không</strong> chọn mục quảng cáo, Danh mục, Video trực tiếp — chúng đòi xác minh doanh nghiệp và không gỡ ra được.</li>
          <li><em>Doanh nghiệp</em>: chọn <em>Tôi chưa muốn kết nối danh mục doanh nghiệp</em> → <em>Tiếp</em>.</li>
          <li><em>Yêu cầu</em> → <em>Tiếp</em> → <em>Tổng quan</em> → <em>Tạo ứng dụng</em> (Facebook có thể hỏi lại mật khẩu).</li>
        </ol>
      </li>
      <OwnAppSettingsSteps app={app} webhook={webhook} missing={missing} />
      <li>
        <strong>Không cần phát hành app</strong>
        <span>App để ở chế độ phát triển là đủ: bạn là quản trị viên nên đăng nhập và dùng được Fanpage của chính mình. Chỉ phát hành khi muốn người khác (không có vai trò trong app) đăng nhập qua app này.</span>
      </li>
    </ol>
  );
}

// Một tài khoản tool quản lý nhiều nick Facebook / Fanpage
// Đổi nick trong cửa sổ Facebook. Tool không chọn được nick và không xóa được phiên đăng nhập Facebook trong trình duyệt
// (cookie của facebook.com chỉ Facebook / trình duyệt xóa được), nên hướng dẫn người dùng đổi ngay trên Facebook.
export function SwitchNickSteps() {
  return (
    <ol className="fb-guide-substeps">
      <li>Trong cửa sổ Facebook bấm <em>ảnh đại diện</em> (góc phải trên) để xem nick đang đăng nhập.</li>
      <li>Có nút <em>Xem tất cả trang cá nhân</em>: tài khoản Facebook này có nhiều trang cá nhân — nhập đúng email / mật khẩu, Facebook vẫn mở <em>trang cá nhân dùng gần nhất</em>. Bấm nút đó → chọn đúng trang cá nhân cần kết nối (chọn trang cá nhân, không chọn Fanpage).</li>
      <li>Nick cần dùng không có trong danh sách → <em>Đăng xuất</em>. Ở trang đăng nhập, nick cũ còn trong ô <em>Đăng nhập gần đây</em> thì bấm dấu <em>×</em> trên ô đó để Facebook quên nick cũ → đăng nhập nick cần dùng; Facebook hỏi lưu thông tin đăng nhập thì chọn <em>Lúc khác</em>.</li>
      <li>Đang dùng cửa sổ ẩn danh / InPrivate: Facebook giữ phiên đăng nhập tới khi đóng <em>hết</em> các cửa sổ ẩn danh. Muốn làm mới hoàn toàn: đóng hết, mở cửa sổ ẩn danh mới, đăng nhập tool rồi đăng nhập Facebook.</li>
      <li>Góc phải đã hiện đúng tên nick → quay lại tool bấm <em>Đã đổi xong — Đăng nhập lại</em> (hoặc <em>Đăng nhập Facebook</em>).</li>
    </ol>
  );
}

export function MultiNickSteps() {
  return (
    <ol className="fb-guide-steps">
      <li>
        <strong>Mỗi nick cần một Meta App có nick đó là quản trị viên</strong>
        <span>Hai cách: (a) thêm nick đó vào <em>Vai trò trong ứng dụng</em> của app bạn đang dùng (Quản trị viên / Nhà phát triển, nick đó chấp nhận lời mời); hoặc (b) nick đó tự tạo Meta App riêng, rồi bạn thêm app thứ hai vào tool ở <em>Meta App của tôi</em>. Tool nhớ nick nào đi qua app nào để tự gia hạn token đúng app.</span>
      </li>
      <li>
        <strong>Đăng nhập đúng nick trong cửa sổ Facebook</strong>
        <span>Facebook dùng nick <em>đang đăng nhập trong trình duyệt</em> — tool không chọn và không xóa được phiên đó. Sau mỗi lần đăng nhập tool hiện tên nick vừa kết nối; nhầm nick thì bấm <em>Không phải nick này?</em> / <em>Đổi nick Facebook</em> rồi làm trong cửa sổ Facebook:</span>
        <SwitchNickSteps />
      </li>
      <li>
        <strong>Fanpage của các nick hiển thị chung</strong>
        <span>Trang Kênh gom Fanpage của mọi nick; lọc theo từng nick bằng thanh <em>Lọc theo nick FB</em>. Gỡ một nick chỉ gỡ Fanpage của nick đó.</span>
      </li>
    </ol>
  );
}

// Tự tạo token bằng Meta App của chính mình — dùng khi không muốn điền App vào tool
export function OwnTokenSteps({ features, missing }) {
  const scopes = pageScopesFrom(features);
  return (
    <ol className="fb-guide-steps">
      <li>
        <strong>Có Meta App của riêng bạn</strong>
        <span>Chưa có thì làm theo bảng <em>Tạo Meta App</em> (bước 1–5), gồm cả phần thêm quyền cho từng trường hợp sử dụng.</span>
      </li>
      <li>
        <strong>Tạo token</strong>
        <span>Mở <Ext href="https://developers.facebook.com/tools/explorer/">Graph API Explorer</Ext> → ô <em>Meta App</em> chọn app của bạn → <em>Người dùng hoặc Trang</em> chọn <em>User Token</em> → ô <em>Quyền</em> thêm các quyền sau → <em>Generate Access Token</em> → <em>Chỉnh sửa quyền truy cập</em> → tích <strong>tất cả Fanpage</strong> → <em>Tiếp tục</em>.</span>
        <span className="fb-guide-scopes">{scopes.map((scope) => <code key={scope} className={missing?.includes(scope) ? 'is-missing' : ''}>{scope}</code>)}</span>
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
