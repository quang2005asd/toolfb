import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, AppWindow, CheckCircle2, KeyRound, Loader2, LogIn, PlusCircle, RefreshCw, ShieldAlert, Trash2, UserRound, X } from 'lucide-react';
import { CreatePageSteps, Ext, OwnAppCreateSteps, OwnAppEnterSteps, OwnTokenSteps, SwitchNickSteps, UseCasePermissionBlocks } from './FacebookGuideSteps';

const ERRORS = {
  oauth_denied: {
    title: 'Bạn đã hủy đăng nhập Facebook',
    text: 'Facebook báo bạn đã bấm Hủy hoặc chưa cho phép tool truy cập. Bấm Thử lại, chọn “Chỉnh sửa quyền truy cập”, tích đủ Fanpage rồi bấm Tiếp tục.'
  },
  oauth_failed: {
    title: 'Facebook không hoàn tất đăng nhập',
    text: 'Tool không đổi được mã đăng nhập sang token. Thường do Khóa bí mật của Meta App đã bị đặt lại, hoặc URI chuyển hướng trong app chưa đúng. Kiểm tra app ở “Meta App của tôi”, rồi thử lại.'
  },
  oauth_state_invalid: {
    title: 'Phiên đăng nhập Facebook đã hết hạn',
    text: 'Trang đăng nhập Facebook bị mở quá 10 phút, hoặc trình duyệt đang chặn cookie của tool. Bấm Thử lại và đăng nhập ngay trong cửa sổ vừa mở.'
  }
};

function appName(app) {
  return app?.label ? `${app.label} (ID ${app.appId})` : `ID ${app?.appId}`;
}

// Hỏi người dùng đã có Meta App chưa để đưa đúng bảng hướng dẫn
function OwnAppChooser({ onOwnApp }) {
  return (
    <div className="fb-own-app-choice">
      <button type="button" className="fb-own-app-option" onClick={() => onOwnApp('own-app-enter')}>
        <AppWindow size={20} aria-hidden="true" />
        <span>
          <strong>Tôi đã có Meta App</strong>
          <small>Kiểm tra cài đặt, thêm quyền từng mục rồi điền App ID + Khóa bí mật vào tool</small>
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

// Danh sách Meta App đã lưu: đăng nhập bằng từng app hoặc gỡ app
function OwnAppList({ apps, onLoginWith, onRemove, loginLabel = 'Đăng nhập bằng app này' }) {
  if (!apps?.length) return null;
  return (
    <ul className="fb-app-list">
      {apps.map((app) => {
        const ok = app.credentialsValid !== false && app.domainOk !== false;
        return (
          <li key={app.appId} className={ok ? '' : 'is-error'}>
            <div className="fb-app-list-info">
              <strong>{app.label || 'Meta App'}</strong>
              <small>ID {app.appId}{app.credentialsValid === false ? ' · Khóa bí mật không đúng / app đã bị xóa' : app.domainOk === false ? ' · chưa khai báo miền của tool' : ''}</small>
            </div>
            <div className="fb-app-list-actions">
              {onLoginWith && <button type="button" className="button button-primary" onClick={() => onLoginWith(app.appId)} disabled={!ok}><LogIn size={14} /> {loginLabel}</button>}
              {onRemove && <button type="button" className="button button-quiet" onClick={() => onRemove(app.appId)} aria-label={`Gỡ Meta App ${app.appId}`}><Trash2 size={14} /> Gỡ</button>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// Thêm một Meta App: server kiểm tra với Facebook (khóa, miền của tool) trước khi lưu
function OwnAppForm({ onSave, onLoginWith }) {
  const [appId, setAppId] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null); // { ok, message, appId }

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setResult(null);
    try {
      const res = await onSave(appId.trim(), appSecret.trim(), label.trim());
      setAppSecret('');
      setResult({ ok: true, message: res.message || 'Đã lưu Meta App của bạn.', appId: res.appId || appId.trim() });
    } catch (error) {
      setResult({ ok: false, message: error.response?.data?.message || error.message || 'Không lưu được Meta App.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="fb-own-app-form" onSubmit={submit}>
      <strong>Điền Meta App vào tool</strong>
      <div className="fb-own-app-fields">
        <label>
          <span className="field-label">ID ứng dụng (App ID)</span>
          <input id="own-app-id" className="field" inputMode="numeric" autoComplete="off" placeholder="VD: 123456789012345" value={appId} onChange={(event) => setAppId(event.target.value.replace(/\s/g, ''))} required />
        </label>
        <label>
          <span className="field-label">Khóa bí mật của ứng dụng (App Secret)</span>
          <input id="own-app-secret" className="field" type="password" autoComplete="new-password" placeholder="Dán khóa bí mật" value={appSecret} onChange={(event) => setAppSecret(event.target.value.trim())} required />
        </label>
        <label className="fb-own-app-label">
          <span className="field-label">Tên gợi nhớ (không bắt buộc)</span>
          <input id="own-app-label" className="field" maxLength={60} placeholder="VD: App của nick Shop A" value={label} onChange={(event) => setLabel(event.target.value)} />
        </label>
      </div>
      {result && <p className={`fb-own-app-result ${result.ok ? 'is-ok' : 'is-error'}`} role="status">{result.ok ? <CheckCircle2 size={14} aria-hidden="true" /> : <AlertTriangle size={14} aria-hidden="true" />} {result.message}</p>}
      <div className="fb-own-app-actions">
        {result?.ok
          ? <button type="button" className="button button-primary" onClick={() => onLoginWith(result.appId)}><LogIn size={15} /> Đăng nhập Facebook bằng app này</button>
          : <button type="submit" className="button button-primary" disabled={saving}>{saving ? 'Đang kiểm tra với Facebook…' : 'Kiểm tra & lưu'}</button>}
      </div>
    </form>
  );
}

// Nick Facebook vừa đăng nhập: Facebook tự chọn theo phiên trong trình duyệt → luôn cho người dùng thấy và đổi nếu nhầm
function LoginNick({ nick, onSwitchNick }) {
  if (!nick?.name) return null;
  return (
    <div className="fb-login-cause">
      <strong><UserRound size={14} aria-hidden="true" /> Facebook vừa đăng nhập nick “{nick.name}”</strong>
      <span>Không phải nick bạn muốn kết nối? Đổi nick trong cửa sổ Facebook rồi đăng nhập lại.</span>
      <button type="button" className="button button-secondary fb-guide-action" onClick={() => onSwitchNick(nick)}><RefreshCw size={15} /> Không phải nick này — đổi nick</button>
    </div>
  );
}

// Đổi nick: mở trang chủ Facebook trong cửa sổ đăng nhập, người dùng đổi trang cá nhân / đăng xuất rồi đăng nhập lại
function SwitchNickBody({ state, onRemoveNick }) {
  const nick = state.nick;
  let nickNote = <span>Tool chưa lưu nick này.</span>;
  if (nick?.removed) nickNote = <span>Đã gỡ nick này (và Fanpage của nó) khỏi tool.</span>;
  else if (nick?.saved && nick.id) {
    nickNote = (
      <>
        <span>Nick này đã được thêm vào tool. Không dùng nick này thì gỡ khỏi tool:</span>
        <button type="button" className="button button-quiet fb-guide-action" onClick={() => onRemoveNick(nick)}><Trash2 size={14} /> Gỡ nick “{nick.name}” khỏi tool</button>
      </>
    );
  }
  return (
    <>
      <p className="fb-login-lead">
        Tool không tự chọn nick và không lưu phiên đăng nhập Facebook: Facebook luôn dùng nick (trang cá nhân) <em>đang đăng nhập trong trình duyệt này</em>, và chỉ Facebook / trình duyệt mới xóa được phiên đó.
        {' '}{state.popupBlocked
          ? <>Trình duyệt chặn cửa sổ phụ — mở <Ext href="https://www.facebook.com/">facebook.com</Ext> ở tab mới để đổi nick.</>
          : 'Tool đã mở trang Facebook trong cửa sổ đăng nhập — đổi nick ngay ở đó:'}
      </p>
      {nick?.name && (
        <div className="fb-login-cause">
          <strong>Lần vừa rồi Facebook trả về nick “{nick.name}”</strong>
          {nickNote}
        </div>
      )}
      <div className="fb-login-cause is-main">
        <strong>Đổi sang đúng nick trong cửa sổ Facebook</strong>
        <SwitchNickSteps />
      </div>
    </>
  );
}

// Facebook chặn đăng nhập ("Ứng dụng không hoạt động") hoặc người dùng đóng cửa sổ trước khi xong
function IncompleteBody({ state, apps, onOwnApp, onLoginWith, onSwitchNick }) {
  const used = apps.find((app) => app.appId === state.appId) || apps[0];
  return (
    <>
      <p className="fb-login-lead">Tool chưa nhận được kết quả đăng nhập từ Facebook{used ? <> qua Meta App <strong>{appName(used)}</strong></> : null}. Nếu bạn vẫn đang đăng nhập ở cửa sổ Facebook, cứ hoàn tất — tool sẽ tự cập nhật.</p>
      <div className="fb-login-cause is-main">
        <strong>Facebook báo “Ứng dụng không hoạt động”?</strong>
        <span>Nick đang đăng nhập trong cửa sổ Facebook <em>không có vai trò</em> trong Meta App này. Chọn một cách:</span>
        <ol className="fb-guide-substeps">
          <li>Đăng nhập đúng <em>nick quản trị viên</em> của app: bấm <em>Đổi nick Facebook</em> bên dưới → trong cửa sổ Facebook chọn đúng trang cá nhân (<em>Xem tất cả trang cá nhân</em>) hoặc đăng xuất rồi đăng nhập nick đó → bấm Đăng nhập lại.</li>
          <li>Thêm nick đang dùng vào app: <em>Vai trò trong ứng dụng</em> → <em>Thêm người</em> → <em>Quản trị viên</em> → nick đó chấp nhận tại <Ext href="https://developers.facebook.com/requests/">developers.facebook.com/requests</Ext>.</li>
          <li>Nick đó có Meta App riêng: thêm app đó vào tool rồi đăng nhập bằng app đó.</li>
        </ol>
        <div className="fb-own-app-actions">
          <button type="button" className="button button-secondary fb-guide-action" onClick={() => onSwitchNick()}><RefreshCw size={15} /> Đổi nick Facebook</button>
          <button type="button" className="button button-secondary fb-guide-action" onClick={() => onOwnApp('own-app')}><PlusCircle size={15} /> Thêm Meta App khác</button>
        </div>
      </div>
      {apps.length > 1 && (
        <div className="fb-login-cause">
          <strong>Đăng nhập bằng app khác đã lưu</strong>
          <OwnAppList apps={apps} onLoginWith={onLoginWith} />
        </div>
      )}
      <div className="fb-login-cause">
        <strong>Facebook báo lỗi khác hoặc bạn đã đóng cửa sổ / bấm Hủy</strong>
        <span>Bấm “Thử lại”, hoặc xem bảng xử lý lỗi theo đúng câu Facebook hiện.</span>
      </div>
    </>
  );
}

// Đăng nhập được nhưng Facebook không cấp quyền Fanpage
function NoPermissionBody({ state, status, onSwitchNick }) {
  const fromToken = state.source === 'token';
  return (
    <>
      <p className="fb-login-lead">
        {fromToken ? 'Token bạn vừa dán hợp lệ nhưng chưa có quyền quản lý Fanpage.' : 'Đăng nhập Facebook thành công, nhưng Facebook chưa cấp quyền quản lý Fanpage cho tool.'}
        {state.missing?.length ? <> Còn thiếu: {state.missing.map((scope) => <code key={scope}>{scope}</code>)}</> : null}
      </p>
      {!fromToken && <LoginNick nick={state.nick} onSwitchNick={onSwitchNick} />}
      {!fromToken && (
        <div className="fb-login-cause">
          <strong>Bạn đã bỏ tích quyền khi đăng nhập?</strong>
          <span>Bấm “Đăng nhập lại” → ở hộp thoại Facebook chọn <em>Chỉnh sửa quyền truy cập</em> → bật hết các quyền và Fanpage → <em>Tiếp tục</em>.</span>
        </div>
      )}
      <div className="fb-login-cause is-main">
        <strong>Facebook không hỏi quyền đó?</strong>
        <span>Quyền chưa được thêm vào đúng trường hợp sử dụng trong Meta App. Thêm theo từng khối dưới đây (quyền đang thiếu được tô đỏ), rồi {fromToken ? 'tạo lại token' : 'đăng nhập lại'}:</span>
        <UseCasePermissionBlocks missing={state.missing} compact />
      </div>
      {fromToken && (
        <div className="fb-login-cause">
          <strong>Tạo lại token có đủ quyền</strong>
          <OwnTokenSteps features={status?.features} missing={state.missing} />
        </div>
      )}
    </>
  );
}

function NoPagesBody({ state, onSwitchNick }) {
  return (
    <>
      <p className="fb-login-lead">
        {state.source === 'token'
          ? 'Token hợp lệ nhưng nick này chưa có Fanpage nào (hoặc chưa tích Fanpage khi tạo token).'
          : 'Đăng nhập Facebook thành công, nhưng nick này chưa có Fanpage nào (hoặc chưa tích Fanpage khi đăng nhập).'}
        {' '}Làm theo các bước sau:
      </p>
      {state.source !== 'token' && <LoginNick nick={state.nick} onSwitchNick={onSwitchNick} />}
      <CreatePageSteps />
    </>
  );
}

/**
 * Hộp thoại đăng nhập Facebook trong tool (tool không có app chung — mỗi người dùng Meta App riêng, có thể nhiều app).
 * state.phase: 'waiting' | 'incomplete' | 'switch-nick' | 'choose-app' | 'own-app' | 'own-app-enter' | 'own-app-create' | 'no-permission' | 'no-pages' | 'error'
 * state: { appId? (app vừa dùng), code?, missing?, source? ('login' | 'token'), nick? ({ id, name, saved, removed } — nick Facebook vừa đăng nhập), popupBlocked? }
 */
export default function FacebookLoginDialog({ state, status, onRetry, onLoginWith, onFocusPopup, onAppNotActive, onSwitchNick, onRemoveNick, onOwnApp, onSaveOwnApp, onRemoveOwnApp, onOpenGuide, onPasteToken, onClose }) {
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

  const apps = status?.apps || [];
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
    const used = apps.find((app) => app.appId === state.appId);
    body = (
      <>
        <p className="fb-login-lead">Hoàn tất đăng nhập trong cửa sổ Facebook vừa mở{used ? <> (Meta App <strong>{appName(used)}</strong>)</> : null}. Ở bước hỏi quyền, chọn <em>Chỉnh sửa quyền truy cập</em> và tích đủ Fanpage.</p>
        <div className="fb-login-cause">
          <strong>Cửa sổ Facebook đang vào nhầm nick?</strong>
          <span>Facebook dùng nick (trang cá nhân) đang đăng nhập trong trình duyệt — nhập đúng mật khẩu mà tài khoản có nhiều trang cá nhân thì Facebook vẫn mở trang cá nhân dùng gần nhất. Bấm để đổi nick ngay trong cửa sổ Facebook.</span>
          <button type="button" className="button button-secondary fb-guide-action" onClick={() => onSwitchNick()}><RefreshCw size={15} /> Đổi nick Facebook</button>
        </div>
        <div className="fb-login-cause is-main">
          <strong>Facebook báo “Ứng dụng không hoạt động”?</strong>
          <span>Bấm nút bên dưới — tool đóng cửa sổ Facebook và hướng dẫn cách xử lý.</span>
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
    body = <IncompleteBody state={state} apps={apps} onOwnApp={onOwnApp} onLoginWith={onLoginWith} onSwitchNick={onSwitchNick} />;
    actions = (
      <>
        <button ref={primaryRef} type="button" className="button button-primary" onClick={onRetry}><LogIn size={15} /> Thử lại</button>
        <button type="button" className="button button-secondary" onClick={() => onOpenGuide('login-errors')}>Bảng xử lý lỗi</button>
        {pasteButton(false)}
        {closeButton}
      </>
    );
  } else if (phase === 'switch-nick') {
    Icon = RefreshCw;
    tone = 'info';
    title = 'Đổi sang đúng nick Facebook';
    body = <SwitchNickBody state={state} onRemoveNick={onRemoveNick} />;
    actions = (
      <>
        <button ref={primaryRef} type="button" className="button button-primary" onClick={onRetry}><LogIn size={15} /> Đã đổi xong — Đăng nhập lại</button>
        <button type="button" className="button button-secondary" onClick={() => onSwitchNick(state.nick)}>Mở Facebook để đổi nick</button>
        {closeButton}
      </>
    );
  } else if (phase === 'choose-app') {
    Icon = AppWindow;
    tone = 'info';
    title = 'Đăng nhập bằng Meta App nào?';
    body = (
      <>
        <p className="fb-login-lead">Bạn đã lưu {apps.length} Meta App. Chọn app mà <em>nick Facebook sắp đăng nhập</em> là quản trị viên (mỗi nick đi qua app của nó).</p>
        <OwnAppList apps={apps} onLoginWith={onLoginWith} />
      </>
    );
    actions = (
      <>
        <button type="button" className="button button-secondary" onClick={() => onOwnApp('own-app')}><PlusCircle size={15} /> Thêm Meta App khác</button>
        {closeButton}
      </>
    );
  } else if (phase === 'own-app') {
    Icon = AppWindow;
    tone = 'info';
    title = apps.length ? 'Thêm Meta App khác' : 'Cần Meta App để đăng nhập Facebook';
    body = (
      <>
        <p className="fb-login-lead">
          {apps.length
            ? 'Mỗi nick Facebook đăng nhập qua một Meta App mà nick đó là quản trị viên. Thêm app của nick khác để quản lý thêm Fanpage.'
            : <>Tool không dùng app chung: mỗi tài khoản dùng <em>Meta App của riêng mình</em> (miễn phí). Nick tạo app là quản trị viên nên đăng nhập được ngay, không cần ai mời.</>}
          {' '}Bạn đã có Meta App trên developers.facebook.com chưa?
        </p>
        <OwnAppChooser onOwnApp={onOwnApp} />
        {apps.length > 0 && (
          <div className="fb-login-cause">
            <strong>Meta App đã lưu</strong>
            <OwnAppList apps={apps} onLoginWith={onLoginWith} onRemove={onRemoveOwnApp} />
          </div>
        )}
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
            ? 'Kiểm tra app có đủ từng mục dưới đây (nhất là quyền của từng trường hợp sử dụng), rồi điền App ID và Khóa bí mật ở cuối bảng.'
            : 'Làm lần lượt từng bước (khoảng 10 phút), rồi điền App ID và Khóa bí mật ở cuối bảng.'}
          {' '}
          <button type="button" className="auth-inline-link" onClick={() => onOwnApp(phase === 'own-app-enter' ? 'own-app-create' : 'own-app-enter')}>
            {phase === 'own-app-enter' ? 'Chưa có app? Xem hướng dẫn tạo' : 'Đã có app? Chỉ cần kiểm tra & điền'}
          </button>
        </p>
        {phase === 'own-app-enter'
          ? <OwnAppEnterSteps app={status?.app} webhook={status?.webhook} />
          : <OwnAppCreateSteps app={status?.app} webhook={status?.webhook} />}
        <OwnAppForm key={phase} onSave={onSaveOwnApp} onLoginWith={onLoginWith} />
        {apps.length > 0 && (
          <div className="fb-login-cause">
            <strong>Meta App đã lưu</strong>
            <OwnAppList apps={apps} onLoginWith={onLoginWith} onRemove={onRemoveOwnApp} />
          </div>
        )}
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
    body = <NoPermissionBody state={state} status={status} onSwitchNick={onSwitchNick} />;
    actions = (
      <>
        {fromToken ? pasteButton(true) : <button ref={primaryRef} type="button" className="button button-primary" onClick={onRetry}><LogIn size={15} /> Đăng nhập lại</button>}
        <button type="button" className="button button-secondary" onClick={() => onOpenGuide('permissions')}>Bảng quyền từng mục</button>
        {closeButton}
      </>
    );
  } else if (phase === 'no-pages') {
    title = 'Chưa có Fanpage nào để kết nối';
    body = <NoPagesBody state={state} onSwitchNick={onSwitchNick} />;
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
        <button type="button" className="button button-secondary" onClick={() => (state.code === 'oauth_failed' ? onOwnApp('own-app') : onOpenGuide('login-errors'))}>Xem hướng dẫn</button>
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
