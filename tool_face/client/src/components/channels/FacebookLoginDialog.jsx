import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, KeyRound, Loader2, LogIn, ShieldAlert, X } from 'lucide-react';
import { CreatePageSteps, Ext, OwnTokenSteps } from './FacebookGuideSteps';

const ERRORS = {
  oauth_denied: {
    title: 'Bạn đã hủy đăng nhập Facebook',
    text: 'Facebook báo bạn đã bấm Hủy hoặc chưa cho phép tool truy cập. Bấm Thử lại, chọn “Chỉnh sửa quyền truy cập”, tích đủ Fanpage rồi bấm Tiếp tục.'
  },
  oauth_failed: {
    title: 'Facebook không hoàn tất đăng nhập',
    text: 'Tool không đổi được mã đăng nhập sang token. Thường do App Secret trong Meta App đã bị đổi, hoặc URI chuyển hướng trong Meta App chưa đúng. Quản trị viên kiểm tra lại theo hướng dẫn thiết lập, rồi thử lại.',
    guide: 'setup'
  },
  oauth_state_invalid: {
    title: 'Phiên đăng nhập Facebook đã hết hạn',
    text: 'Trang đăng nhập Facebook bị mở quá 10 phút, hoặc trình duyệt đang chặn cookie của tool. Bấm Thử lại và đăng nhập ngay trong cửa sổ vừa mở.'
  }
};

function AdminNote({ status, children }) {
  if (!status?.canConfigure) return null;
  const appId = status.app?.appId;
  return (
    <div className="fb-login-cause">
      <strong>Dành cho Quản trị viên tool</strong>
      <span>
        {children}{' '}
        {appId && <Ext href={`https://developers.facebook.com/apps/${appId}/dashboard/`}>Mở trang tổng quan Meta App</Ext>}
      </span>
    </div>
  );
}

// Facebook chặn đăng nhập ("Ứng dụng không hoạt động") hoặc người dùng đóng cửa sổ trước khi xong
function IncompleteBody({ status }) {
  return (
    <>
      <p className="fb-login-lead">Tool chưa nhận được kết quả đăng nhập từ Facebook. Nếu bạn vẫn đang đăng nhập ở cửa sổ Facebook, cứ hoàn tất — tool sẽ tự cập nhật.</p>
      <div className="fb-login-cause is-main">
        <strong>Facebook báo “Ứng dụng không hoạt động”, hoặc đây là nick Facebook mới</strong>
        <span>Meta App của tool chưa phát hành nên Facebook chặn đăng nhập với nick của bạn. Bạn vẫn dùng được Fanpage của chính mình bằng cách <em>tự tạo token</em> — không cần ai mời hay cấp vai trò:</span>
        <OwnTokenSteps features={status?.features} />
      </div>
      <AdminNote status={status}>Phát hành Meta App (chuyển sang chế độ Live) để mọi nick đăng nhập được mà không gặp lỗi này.</AdminNote>
      <div className="fb-login-cause">
        <strong>Bạn đã đóng cửa sổ Facebook hoặc bấm Hủy</strong>
        <span>Bấm “Thử lại” để mở lại cửa sổ đăng nhập.</span>
      </div>
    </>
  );
}

// Đăng nhập được nhưng Facebook không cấp quyền Fanpage
function NoPermissionBody({ state, status }) {
  const fromToken = state.source === 'token';
  return (
    <>
      <p className="fb-login-lead">
        {fromToken ? 'Token bạn vừa dán hợp lệ nhưng chưa có quyền quản lý Fanpage.' : 'Đăng nhập Facebook thành công, nhưng Facebook chưa cấp quyền quản lý Fanpage cho tool.'}
        {state.missing?.length ? <> Còn thiếu: {state.missing.map((scope) => <code key={scope}>{scope}</code>)}</> : null}
      </p>
      {!fromToken && (
        <div className="fb-login-cause">
          <strong>Bạn đã bỏ tích quyền khi đăng nhập?</strong>
          <span>Bấm “Đăng nhập lại” → ở hộp thoại Facebook chọn <em>Chỉnh sửa quyền truy cập</em> → bật hết các quyền và Fanpage → <em>Tiếp tục</em>.</span>
        </div>
      )}
      <div className="fb-login-cause is-main">
        <strong>{fromToken ? 'Tạo lại token có đủ quyền' : 'Facebook không hỏi quyền Fanpage?'}</strong>
        <span>
          {fromToken
            ? 'Làm lại theo bảng dưới, nhớ thêm đủ quyền ở bước 3–4:'
            : <>Meta App của tool chưa được Meta duyệt quyền nâng cao cho nick của bạn. Tự tạo token theo bảng dưới — <em>không cần ai mời</em>:</>}
        </span>
        <OwnTokenSteps features={status?.features} missing={state.missing} />
      </div>
      <AdminNote status={status}>Để Facebook hỏi quyền Fanpage với mọi nick ngay khi đăng nhập, Meta App cần được duyệt quyền nâng cao (Xét duyệt ứng dụng + xác minh doanh nghiệp).</AdminNote>
    </>
  );
}

function NoPagesBody({ state }) {
  return (
    <>
      <p className="fb-login-lead">
        {state.source === 'token'
          ? 'Token hợp lệ nhưng nick này chưa có Fanpage nào (hoặc chưa tích Fanpage khi tạo token).'
          : 'Đăng nhập Facebook thành công, nhưng nick này chưa có Fanpage nào (hoặc chưa tích Fanpage khi đăng nhập).'}
        {' '}Làm theo các bước sau:
      </p>
      <CreatePageSteps />
    </>
  );
}

/**
 * Hộp thoại đăng nhập Facebook trong tool.
 * state: { phase: 'waiting' | 'incomplete' | 'no-permission' | 'no-pages' | 'error', code?, missing?, source? ('login' | 'token') }
 */
export default function FacebookLoginDialog({ state, status, onRetry, onFocusPopup, onOpenGuide, onPasteToken, onClose }) {
  const primaryRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const phase = state?.phase;

  useEffect(() => {
    if (!phase) return undefined;
    primaryRef.current?.focus();
    const onKey = (event) => { if (event.key === 'Escape') onCloseRef.current(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [phase]);
  if (!phase || typeof document === 'undefined') return null;

  const fromToken = state.source === 'token';
  const pasteButton = (primary) => (
    <button ref={primary ? primaryRef : undefined} type="button" className={`button ${primary ? 'button-primary' : 'button-secondary'}`} onClick={onPasteToken}>
      <KeyRound size={15} /> {fromToken ? 'Dán token khác' : 'Dán token đã tạo'}
    </button>
  );
  const closeButton = <button type="button" className="button button-quiet" onClick={onClose}>Đóng</button>;

  let Icon = AlertTriangle;
  let tone = 'warn';
  let title;
  let body;
  let actions;
  if (phase === 'waiting') {
    Icon = Loader2;
    tone = 'info';
    title = 'Đang chờ đăng nhập Facebook…';
    body = (
      <>
        <p className="fb-login-lead">Hoàn tất đăng nhập trong cửa sổ Facebook vừa mở. Ở bước hỏi quyền, chọn <em>Chỉnh sửa quyền truy cập</em> và tích đủ Fanpage.</p>
        <div className="fb-login-cause is-main">
          <strong>Facebook báo “Ứng dụng không hoạt động”?</strong>
          <span>Đóng cửa sổ Facebook — tool sẽ hướng dẫn cách dùng Fanpage của bạn mà không cần đăng nhập qua app.</span>
        </div>
      </>
    );
    actions = (
      <>
        <button ref={primaryRef} type="button" className="button button-secondary" onClick={onFocusPopup}>Mở lại cửa sổ Facebook</button>
        <button type="button" className="button button-quiet" onClick={onClose}>Hủy</button>
      </>
    );
  } else if (phase === 'incomplete') {
    title = 'Chưa đăng nhập được Facebook';
    body = <IncompleteBody status={status} />;
    actions = (
      <>
        <button ref={primaryRef} type="button" className="button button-primary" onClick={onRetry}><LogIn size={15} /> Thử lại</button>
        {pasteButton(false)}
        <button type="button" className="button button-secondary" onClick={() => onOpenGuide('login-errors')}>Facebook báo lỗi khác?</button>
        {closeButton}
      </>
    );
  } else if (phase === 'no-permission') {
    title = 'Chưa đủ quyền dùng Fanpage';
    body = <NoPermissionBody state={state} status={status} />;
    actions = (
      <>
        {pasteButton(true)}
        {!fromToken && <button type="button" className="button button-secondary" onClick={onRetry}><LogIn size={15} /> Đăng nhập lại</button>}
        {closeButton}
      </>
    );
  } else if (phase === 'no-pages') {
    title = 'Chưa có Fanpage nào để kết nối';
    body = <NoPagesBody state={state} />;
    actions = (
      <>
        {fromToken
          ? pasteButton(true)
          : <button ref={primaryRef} type="button" className="button button-primary" onClick={onRetry}><LogIn size={15} /> Đăng nhập lại &amp; chọn Fanpage</button>}
        {closeButton}
      </>
    );
  } else {
    const info = ERRORS[state.code] || { title: 'Không đăng nhập được Facebook', text: 'Facebook trả về một lỗi chưa rõ. Thử lại, nếu vẫn lỗi hãy xem bảng xử lý lỗi.' };
    Icon = ShieldAlert;
    tone = 'error';
    title = info.title;
    body = <p className="fb-login-lead">{info.text}</p>;
    actions = (
      <>
        <button ref={primaryRef} type="button" className="button button-primary" onClick={onRetry}><LogIn size={15} /> Thử lại</button>
        <button type="button" className="button button-secondary" onClick={() => onOpenGuide(info.guide || 'login-errors')}>Xem hướng dẫn</button>
        {closeButton}
      </>
    );
  }

  return createPortal(
    <div className="fb-guide-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && phase !== 'waiting') onClose(); }}>
      <div className={`fb-guide-dialog fb-login-dialog is-${tone}`} role="dialog" aria-modal="true" aria-labelledby="fb-login-title" aria-live="polite">
        <div className="fb-guide-head">
          <h2 id="fb-login-title"><Icon size={18} aria-hidden="true" className={phase === 'waiting' ? 'spin' : ''} /> {title}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Đóng"><X size={17} /></button>
        </div>
        <div className="fb-guide-body">{body}</div>
        <div className="fb-login-actions">{actions}</div>
      </div>
    </div>,
    document.body
  );
}
