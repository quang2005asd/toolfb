import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, AppWindow, CheckCircle2, KeyRound, Loader2, LogIn, PlusCircle, ShieldAlert, X } from 'lucide-react';
import { CreatePageSteps, Ext, OwnAppCreateSteps, OwnAppEnterSteps, OwnTokenSteps } from './FacebookGuideSteps';

const ERRORS = {
  oauth_denied: {
    title: 'Bạn đã hủy đăng nhập Facebook',
    text: 'Facebook báo bạn đã bấm Hủy hoặc chưa cho phép tool truy cập. Bấm Thử lại, chọn “Chỉnh sửa quyền truy cập”, tích đủ Fanpage rồi bấm Tiếp tục.'
  },
  oauth_failed: {
    title: 'Facebook không hoàn tất đăng nhập',
    text: 'Tool không đổi được mã đăng nhập sang token. Thường do App Secret trong Meta App đã bị đổi, hoặc URI chuyển hướng trong Meta App chưa đúng. Kiểm tra lại cài đặt Meta App, rồi thử lại.',
    guide: 'setup'
  },
  oauth_state_invalid: {
    title: 'Phiên đăng nhập Facebook đã hết hạn',
    text: 'Trang đăng nhập Facebook bị mở quá 10 phút, hoặc trình duyệt đang chặn cookie của tool. Bấm Thử lại và đăng nhập ngay trong cửa sổ vừa mở.'
  }
};

function AdminNote({ status, children }) {
  if (!status?.canConfigure) return null;
  const appId = status.app?.source === 'system' ? status.app?.appId : null;
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

// Hỏi người dùng đã có Meta App chưa để đưa đúng bảng hướng dẫn
function OwnAppChooser({ onOwnApp }) {
  return (
    <div className="fb-own-app-choice">
      <button type="button" className="fb-own-app-option" onClick={() => onOwnApp('own-app-enter')}>
        <AppWindow size={20} aria-hidden="true" />
        <span>
          <strong>Tôi đã có Meta App</strong>
          <small>Hướng dẫn kiểm tra cài đặt và điền App ID, Khóa bí mật, quyền vào tool</small>
        </span>
      </button>
      <button type="button" className="fb-own-app-option" onClick={() => onOwnApp('own-app-create')}>
        <PlusCircle size={20} aria-hidden="true" />
        <span>
          <strong>Tôi chưa có Meta App</strong>
          <small>Hướng dẫn tạo từng bước trên developers.facebook.com (miễn phí, khoảng 10 phút)</small>
        </span>
      </button>
    </div>
  );
}

// Nhập App ID + Khóa bí mật của Meta App riêng; server kiểm tra với Facebook trước khi lưu
function OwnAppForm({ status, onSave, onRemove, onLogin }) {
  const own = status?.app?.source === 'user' ? status.app : null;
  const [appId, setAppId] = useState(own?.appId || '');
  const [appSecret, setAppSecret] = useState('');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null); // { ok, message }

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setResult(null);
    try {
      const res = await onSave(appId.trim(), appSecret.trim());
      setAppSecret('');
      setResult({ ok: true, message: res.message || 'Đã lưu Meta App của bạn.' });
    } catch (error) {
      setResult({ ok: false, message: error.response?.data?.message || error.message || 'Không lưu được Meta App.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="fb-own-app-form" onSubmit={submit}>
      <strong>Điền Meta App của bạn vào tool</strong>
      {own && <span className="fb-guide-note">Đang dùng Meta App riêng ID <code>{own.appId}</code>. Điền lại để đổi app.</span>}
      <div className="fb-own-app-fields">
        <label>
          <span className="field-label">ID ứng dụng (App ID)</span>
          <input id="own-app-id" className="field" inputMode="numeric" autoComplete="off" placeholder="VD: 123456789012345" value={appId} onChange={(event) => setAppId(event.target.value.replace(/\s/g, ''))} required />
        </label>
        <label>
          <span className="field-label">Khóa bí mật của ứng dụng (App Secret)</span>
          <input id="own-app-secret" className="field" type="password" autoComplete="new-password" placeholder={own ? 'Để trống nếu không đổi' : 'Dán khóa bí mật'} value={appSecret} onChange={(event) => setAppSecret(event.target.value.trim())} required={!own || own.appId !== appId} />
        </label>
      </div>
      {result && <p className={`fb-own-app-result ${result.ok ? 'is-ok' : 'is-error'}`} role="status">{result.ok ? <CheckCircle2 size={14} aria-hidden="true" /> : <AlertTriangle size={14} aria-hidden="true" />} {result.message}</p>}
      <div className="fb-own-app-actions">
        {result?.ok
          ? <button type="button" className="button button-primary" onClick={onLogin}><LogIn size={15} /> Đăng nhập Facebook bằng app của bạn</button>
          : <button type="submit" className="button button-primary" disabled={saving}>{saving ? 'Đang kiểm tra với Facebook…' : 'Kiểm tra & lưu'}</button>}
        {own && !result?.ok && <button type="button" className="button button-quiet" onClick={onRemove}>Bỏ app riêng, dùng app chung</button>}
      </div>
    </form>
  );
}

// Facebook chặn đăng nhập ("Ứng dụng không hoạt động") hoặc người dùng đóng cửa sổ trước khi xong
function IncompleteBody({ status, onOwnApp }) {
  if (status?.app?.source === 'user') {
    return (
      <>
        <p className="fb-login-lead">Tool chưa nhận được kết quả đăng nhập qua <strong>Meta App của bạn</strong> (ID <code>{status.app.appId}</code>). Nếu bạn vẫn đang đăng nhập ở cửa sổ Facebook, cứ hoàn tất — tool sẽ tự cập nhật.</p>
        <div className="fb-login-cause is-main">
          <strong>Facebook báo lỗi với app của bạn?</strong>
          <span>Đăng nhập Facebook bằng <em>đúng nick quản trị viên</em> của app đó, và kiểm tra app đã khai báo miền, URI chuyển hướng, quyền như hướng dẫn.</span>
          <button type="button" className="button button-secondary fb-guide-action" onClick={() => onOwnApp('own-app-enter')}><AppWindow size={15} /> Kiểm tra / đổi Meta App của tôi</button>
        </div>
        <div className="fb-login-cause">
          <strong>Bạn đã đóng cửa sổ Facebook hoặc bấm Hủy</strong>
          <span>Bấm “Thử lại” để mở lại cửa sổ đăng nhập.</span>
        </div>
      </>
    );
  }
  return (
    <>
      <p className="fb-login-lead">Tool chưa nhận được kết quả đăng nhập từ Facebook. Nếu bạn vẫn đang đăng nhập ở cửa sổ Facebook, cứ hoàn tất — tool sẽ tự cập nhật.</p>
      <div className="fb-login-cause is-main">
        <strong>Facebook báo “Ứng dụng không hoạt động”?</strong>
        <span>Nick Facebook của bạn không có quyền quản trị trong Meta App chung của tool. Hãy dùng <em>Meta App của riêng bạn</em>: bạn là quản trị viên nên đăng nhập được ngay — không cần ai mời. Bạn đã có Meta App chưa?</span>
        <OwnAppChooser onOwnApp={onOwnApp} />
      </div>
      <AdminNote status={status}>Nick quản trị viên Meta App chung vẫn đăng nhập bình thường. Muốn mọi nick dùng được app chung thì app cần được Meta duyệt quyền nâng cao (Xét duyệt ứng dụng + xác minh doanh nghiệp).</AdminNote>
      <div className="fb-login-cause">
        <strong>Bạn đã đóng cửa sổ Facebook hoặc bấm Hủy</strong>
        <span>Bấm “Thử lại” để mở lại cửa sổ đăng nhập.</span>
      </div>
    </>
  );
}

// Đăng nhập được nhưng Facebook không cấp quyền Fanpage
function NoPermissionBody({ state, status, onOwnApp }) {
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
      {!fromToken && status?.app?.source !== 'user' && (
        <div className="fb-login-cause is-main">
          <strong>Facebook không hỏi quyền Fanpage?</strong>
          <span>Meta App chung của tool chưa được Meta duyệt quyền nâng cao cho nick của bạn. Dùng <em>Meta App của riêng bạn</em> để Facebook cấp đủ quyền — bạn đã có Meta App chưa?</span>
          <OwnAppChooser onOwnApp={onOwnApp} />
        </div>
      )}
      <div className={`fb-login-cause${fromToken ? ' is-main' : ''}`}>
        <strong>{fromToken ? 'Tạo lại token có đủ quyền' : 'Hoặc: tự tạo token rồi dán vào tool'}</strong>
        <span>{fromToken ? 'Làm lại theo bảng dưới, nhớ thêm đủ quyền ở bước 3–4:' : 'Không muốn điền Meta App vào tool thì tạo token theo bảng dưới — không cần ai mời:'}</span>
        <OwnTokenSteps features={status?.features} missing={state.missing} />
      </div>
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
 * state.phase: 'waiting' | 'incomplete' | 'own-app' | 'own-app-enter' | 'own-app-create' | 'no-permission' | 'no-pages' | 'error'
 * state: { code?, missing?, source? ('login' | 'token') }
 */
export default function FacebookLoginDialog({ state, status, onRetry, onFocusPopup, onAppNotActive, onOwnApp, onSaveOwnApp, onRemoveOwnApp, onOpenGuide, onPasteToken, onClose }) {
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
          <span>Bấm nút bên dưới — tool đóng cửa sổ Facebook và hướng dẫn bạn dùng Meta App của riêng mình.</span>
          <button ref={primaryRef} type="button" className="button button-primary fb-guide-action" onClick={onAppNotActive}><ShieldAlert size={15} /> Facebook báo “Ứng dụng không hoạt động”</button>
        </div>
      </>
    );
    actions = (
      <>
        <button type="button" className="button button-secondary" onClick={onFocusPopup}>Mở lại cửa sổ Facebook</button>
        <button type="button" className="button button-quiet" onClick={onClose}>Hủy</button>
      </>
    );
  } else if (phase === 'incomplete') {
    title = 'Chưa đăng nhập được Facebook';
    body = <IncompleteBody status={status} onOwnApp={onOwnApp} />;
    actions = (
      <>
        <button ref={primaryRef} type="button" className="button button-primary" onClick={onRetry}><LogIn size={15} /> Thử lại</button>
        {pasteButton(false)}
        <button type="button" className="button button-secondary" onClick={() => onOpenGuide('login-errors')}>Facebook báo lỗi khác?</button>
        {closeButton}
      </>
    );
  } else if (phase === 'own-app') {
    Icon = AppWindow;
    tone = 'info';
    title = 'Dùng Meta App của riêng bạn';
    body = (
      <>
        <p className="fb-login-lead">Đăng nhập Facebook qua tool cần một Meta App mà nick của bạn là <em>quản trị viên</em>. Dùng app của riêng bạn thì đăng nhập được ngay, không cần ai mời. Bạn đã có Meta App trên developers.facebook.com chưa?</p>
        <OwnAppChooser onOwnApp={onOwnApp} />
      </>
    );
    actions = (
      <>
        {pasteButton(false)}
        {closeButton}
      </>
    );
  } else if (phase === 'own-app-enter' || phase === 'own-app-create') {
    Icon = AppWindow;
    tone = 'info';
    title = phase === 'own-app-enter' ? 'Điền Meta App của bạn vào tool' : 'Tạo Meta App của riêng bạn';
    body = (
      <>
        <p className="fb-login-lead">
          {phase === 'own-app-enter'
            ? 'Kiểm tra app có đủ các mục dưới đây, rồi điền App ID và Khóa bí mật vào cuối bảng.'
            : 'Làm lần lượt từng bước (khoảng 10 phút), rồi điền App ID và Khóa bí mật vào cuối bảng.'}
          {' '}
          <button type="button" className="auth-inline-link" onClick={() => onOwnApp(phase === 'own-app-enter' ? 'own-app-create' : 'own-app-enter')}>
            {phase === 'own-app-enter' ? 'Chưa có app? Xem hướng dẫn tạo' : 'Đã có app? Chỉ cần kiểm tra & điền'}
          </button>
        </p>
        {phase === 'own-app-enter' ? <OwnAppEnterSteps app={status?.app} features={status?.features} /> : <OwnAppCreateSteps app={status?.app} features={status?.features} />}
        <OwnAppForm key={phase} status={status} onSave={onSaveOwnApp} onRemove={onRemoveOwnApp} onLogin={onRetry} />
      </>
    );
    actions = (
      <>
        <button type="button" className="button button-secondary" onClick={() => onOwnApp('own-app')}>Quay lại</button>
        {closeButton}
      </>
    );
  } else if (phase === 'no-permission') {
    title = 'Chưa đủ quyền dùng Fanpage';
    body = <NoPermissionBody state={state} status={status} onOwnApp={onOwnApp} />;
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
        <button type="button" className="button button-secondary" onClick={() => (status?.app?.source === 'user' ? onOwnApp('own-app-enter') : onOpenGuide(info.guide || 'login-errors'))}>Xem hướng dẫn</button>
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
