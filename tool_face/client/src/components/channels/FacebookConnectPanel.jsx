import { useState } from 'react';
import { AlertTriangle, AppWindow, BookOpen, CheckCircle2, ChevronDown, CircleAlert, KeyRound, LogIn, RefreshCw, ShieldAlert, UserPlus } from 'lucide-react';

// Trạng thái từng bước: done / current / error / todo
function buildSteps(status) {
  const { level, app, apps = [], accounts } = status;
  const validAccounts = accounts.filter((account) => account.valid);
  const validApps = apps.filter((item) => item.credentialsValid);
  const appStep = !apps.length
    ? { state: 'current', hint: 'Chưa thêm Meta App nào' }
    : !validApps.length
      ? { state: 'error', hint: 'App ID / Khóa bí mật không đúng' }
      : app.domainOk === false
        ? { state: 'error', hint: `Chưa khai báo miền ${app.domain}` }
        : { state: 'done', hint: apps.length > 1 ? `${apps.length} Meta App` : `${app.label || 'Meta App'} · ID ${app.appId}` };
  const loginStep = validAccounts.length
    ? { state: 'done', hint: `${validAccounts.length} nick đang hoạt động` }
    : accounts.length
      ? { state: 'error', hint: 'Token đã hết hạn' }
      : { state: level === 'login' ? 'current' : 'todo', hint: 'Chưa kết nối nick nào' };
  const required = status.features.filter((feature) => !feature.optional).length;
  const missing = new Set();
  let unknown = false;
  for (const account of validAccounts) {
    for (const feature of account.features) {
      if (feature.optional) continue;
      if (feature.ok === false) missing.add(feature.key);
      if (feature.ok === null) unknown = true;
    }
  }
  const permissionStep = !validAccounts.length
    ? { state: 'todo', hint: 'Sau khi đăng nhập' }
    : missing.size
      ? { state: 'error', hint: `Thiếu quyền ${missing.size}/${required} tính năng` }
      : unknown
        ? { state: 'current', hint: 'Chưa đọc được quyền' }
        : { state: 'done', hint: `Đủ quyền ${required}/${required} tính năng` };
  return [
    { key: 'app', label: 'Meta App của bạn', ...appStep },
    { key: 'login', label: 'Đăng nhập Facebook', ...loginStep },
    { key: 'permissions', label: 'Quyền tính năng', ...permissionStep }
  ];
}

function StepIcon({ state, index }) {
  if (state === 'done') return <CheckCircle2 size={16} aria-hidden="true" />;
  if (state === 'error') return <CircleAlert size={16} aria-hidden="true" />;
  return <span className="fb-connect-step-num" aria-hidden="true">{index + 1}</span>;
}

const STATE_TEXT = { done: 'đã xong', current: 'cần làm', error: 'có lỗi', todo: 'chưa tới' };

function FeatureList({ accounts }) {
  const valid = accounts.filter((account) => account.valid);
  if (!valid.length) return null;
  return (
    <div className="fb-connect-features">
      {valid.map((account) => (
        <div key={account.id} className="fb-connect-account">
          {valid.length > 1 && <span className="fb-connect-account-name">{account.name}</span>}
          <ul>
            {account.features.map((feature) => {
              const tone = feature.ok === true ? 'ok' : feature.ok === false ? (feature.optional ? 'idle' : 'warn') : 'idle';
              return (
                <li key={feature.key} className={`is-${tone}`} title={feature.missing.length ? `Thiếu: ${feature.missing.join(', ')}` : undefined}>
                  {feature.ok === true ? <CheckCircle2 size={13} aria-hidden="true" /> : <AlertTriangle size={13} aria-hidden="true" />}
                  <span>{feature.label}</span>
                  {feature.ok === false && <small>{feature.optional ? 'tùy chọn · ' : ''}thiếu {feature.missing.join(', ')}</small>}
                  {feature.ok === null && <small>chưa kiểm tra được</small>}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

function Steps({ steps }) {
  return (
    <ol className="fb-connect-steps">
      {steps.map((step, index) => (
        <li key={step.key} className={`is-${step.state}`}>
          <StepIcon state={step.state} index={index} />
          <span>
            <strong>{step.label}</strong>
            <small>{step.hint}<span className="fb-sr-only"> ({STATE_TEXT[step.state]})</span></small>
          </span>
        </li>
      ))}
    </ol>
  );
}

/**
 * Bảng trạng thái đăng nhập Facebook (tool không có app chung: mỗi người dùng Meta App riêng).
 * Đã kết nối được → thu gọn một dòng để Fanpage nằm ngay bên dưới; còn việc phải làm → hiện đầy đủ bước + hướng dẫn.
 * status: kết quả GET /channels/facebook-status
 */
export default function FacebookConnectPanel({ status, error, checking, onLogin, onOpenGuide, onOwnApp, onPasteToken, onRefresh }) {
  const [expanded, setExpanded] = useState(false);
  if (!status) {
    if (!error) return null;
    return (
      <section className="fb-connect is-warn" aria-live="polite">
        <div className="fb-connect-message">
          <AlertTriangle size={18} aria-hidden="true" />
          <div><strong>Chưa kiểm tra được trạng thái đăng nhập Facebook</strong><p>{error}</p></div>
        </div>
        <div className="fb-connect-actions">
          <button type="button" className="button button-secondary" onClick={onRefresh} disabled={checking}><RefreshCw size={15} className={checking ? 'spin' : ''} /> Thử lại</button>
          <button type="button" className="button button-quiet" onClick={() => onOpenGuide('create-app')}><BookOpen size={15} /> Hướng dẫn</button>
        </div>
      </section>
    );
  }

  const { level, app, apps = [], accounts } = status;
  const steps = buildSteps(status);
  const validAccounts = accounts.filter((account) => account.valid);
  const refreshButton = (
    <button type="button" className="button button-quiet" onClick={onRefresh} disabled={checking} title="Kiểm tra lại với Facebook">
      <RefreshCw size={15} className={checking ? 'spin' : ''} /> {checking ? 'Đang kiểm tra…' : 'Kiểm tra lại'}
    </button>
  );
  const ownAppButton = (primary = false) => (
    <button type="button" className={`button ${primary ? 'button-primary' : 'button-secondary'}`} onClick={onOwnApp}>
      <AppWindow size={15} /> {apps.length ? 'Meta App của tôi' : 'Thêm Meta App của tôi'}
    </button>
  );

  // Đã kết nối được (đủ hoặc thiếu vài quyền): thu gọn một dòng, Fanpage hiện ngay bên dưới
  if ((level === 'ready' || level === 'partial') && !expanded) {
    const missingFeatures = [...new Set(validAccounts.flatMap((account) => account.features.filter((feature) => !feature.optional && feature.ok === false).map((feature) => feature.label)))];
    return (
      <section className={`fb-connect fb-connect-compact is-${level === 'ready' ? 'ok' : 'warn'}`} aria-label="Trạng thái đăng nhập Facebook">
        <div className="fb-connect-compact-row">
          {level === 'ready' ? <CheckCircle2 size={17} aria-hidden="true" /> : <AlertTriangle size={17} aria-hidden="true" />}
          <p>
            <strong>{level === 'ready' ? 'Facebook đã sẵn sàng' : `Thiếu quyền: ${missingFeatures.join(', ')}`}</strong>
            <span> · {validAccounts.length} nick · {apps.length} Meta App · tool tự kiểm tra token mỗi 30 phút</span>
          </p>
          <div className="fb-connect-compact-actions">
            <button type="button" className="button button-secondary" onClick={onLogin}><UserPlus size={14} /> Thêm nick</button>
            {ownAppButton(false)}
            <button type="button" className="button button-quiet" onClick={() => setExpanded(true)} aria-expanded="false"><ChevronDown size={14} /> Chi tiết</button>
          </div>
        </div>
      </section>
    );
  }

  let tone;
  let Icon;
  let title;
  let body;
  let actions;
  if (level === 'setup') {
    tone = 'warn';
    Icon = AlertTriangle;
    title = apps.length ? 'Meta App của bạn chưa dùng được' : 'Cần Meta App để đăng nhập Facebook';
    body = (
      <>
        <p>
          {apps.length
            ? `App ID / Khóa bí mật đã lưu không hợp lệ${app.credentialsError ? ` — Facebook báo: “${app.credentialsError}”` : ''}. App có thể đã bị xóa hoặc Khóa bí mật đã bị đặt lại — kiểm tra trong developers.facebook.com rồi điền lại.`
            : 'Tool không dùng app chung: mỗi tài khoản dùng Meta App của riêng mình (miễn phí, khoảng 10 phút). Nick tạo app là quản trị viên nên đăng nhập được ngay, không cần ai mời.'}
        </p>
        <p className="fb-connect-sub">Chưa có app thì bấm “Thêm Meta App của tôi” → “Tôi chưa có Meta App” để xem hướng dẫn tạo từng bước. Hoặc thêm Fanpage bằng token tự tạo.</p>
      </>
    );
    actions = (
      <>
        {ownAppButton(true)}
        <button type="button" className="button button-secondary" onClick={() => onOpenGuide('create-app')}><BookOpen size={15} /> Hướng dẫn tạo Meta App</button>
        <button type="button" className="button button-secondary" onClick={onPasteToken}><KeyRound size={15} /> Dùng token thay thế</button>
        {refreshButton}
      </>
    );
  } else if (level === 'login') {
    tone = app.domainOk === false ? 'warn' : 'info';
    Icon = app.domainOk === false ? AlertTriangle : LogIn;
    title = app.domainOk === false ? `Meta App của bạn chưa khai báo tên miền ${app.domain}` : 'Meta App đã sẵn sàng — hãy đăng nhập Facebook';
    body = (
      <>
        {app.domainOk === false
          ? <p>Facebook sẽ chặn đăng nhập (“Không thể tải URL”). Vào Meta App → Cài đặt ứng dụng → Thông tin cơ bản → thêm nền tảng Trang web và <code>{app.domain}</code> vào Miền ứng dụng, rồi thêm URI chuyển hướng ở Đăng nhập bằng Facebook → Cài đặt.</p>
          : <p>Bấm “Đăng nhập Facebook” bằng <em>nick quản trị viên</em> của Meta App, bấm “Chỉnh sửa quyền truy cập” và bật đủ Fanpage + các quyền được hỏi.</p>}
        <p className="fb-connect-sub">Facebook báo “Ứng dụng không hoạt động”? Nick đang đăng nhập trong trình duyệt không có vai trò trong app — xem hướng dẫn nhiều nick.</p>
      </>
    );
    actions = (
      <>
        <button type="button" className="button button-primary" onClick={onLogin}><LogIn size={15} /> Đăng nhập Facebook</button>
        {ownAppButton(false)}
        <button type="button" className="button button-quiet" onClick={() => onOpenGuide('multi-nick')}><BookOpen size={15} /> Nhiều nick Facebook</button>
        {refreshButton}
      </>
    );
  } else if (level === 'expired') {
    tone = 'error';
    Icon = ShieldAlert;
    title = 'Token của nick Facebook đã hết hạn — cần đăng nhập lại';
    body = <p>Các Fanpage trực thuộc đang tạm ngưng đăng bài &amp; nhắn tin. Đăng nhập lại Facebook bằng đúng Meta App của nick đó, tool sẽ đổi sang token dài hạn và lấy lại token cho toàn bộ Fanpage.</p>;
    actions = (
      <>
        <button type="button" className="button button-primary" onClick={onLogin}><LogIn size={15} /> Đăng nhập lại Facebook</button>
        {ownAppButton(false)}
        <button type="button" className="button button-quiet" onClick={() => onOpenGuide('login-errors')}><BookOpen size={15} /> Facebook báo lỗi?</button>
        {refreshButton}
      </>
    );
  } else {
    tone = level === 'ready' ? 'ok' : 'warn';
    Icon = level === 'ready' ? CheckCircle2 : AlertTriangle;
    title = level === 'ready' ? 'Facebook đã sẵn sàng — đủ quyền cho mọi tính năng' : 'Một số tính năng chưa dùng được vì token thiếu quyền';
    body = level === 'ready'
      ? <p className="fb-connect-sub">Tool tự kiểm tra và lấy lại token mỗi 30 phút.</p>
      : <p>Bấm “Cấp thêm quyền”, chọn “Chỉnh sửa quyền truy cập” và bật các quyền còn thiếu. Facebook không hỏi quyền đó thì quyền chưa được thêm vào đúng trường hợp sử dụng của Meta App — xem bảng quyền từng mục.</p>;
    actions = (
      <>
        {level === 'partial' && <button type="button" className="button button-primary" onClick={onLogin}><LogIn size={15} /> Cấp thêm quyền (đăng nhập lại)</button>}
        {level === 'partial' && <button type="button" className="button button-secondary" onClick={() => onOpenGuide('permissions')}><BookOpen size={15} /> Xem hướng dẫn cấp quyền</button>}
        {level === 'ready' && <button type="button" className="button button-secondary" onClick={onLogin}><UserPlus size={15} /> Thêm nick Facebook</button>}
        {ownAppButton(false)}
        <button type="button" className="button button-quiet" onClick={() => setExpanded(false)}>Thu gọn</button>
        {refreshButton}
      </>
    );
  }

  return (
    <section className={`fb-connect is-${tone}`} aria-live="polite" aria-label="Trạng thái đăng nhập Facebook">
      <Steps steps={steps} />
      <div className="fb-connect-message">
        <Icon size={18} aria-hidden="true" />
        <div>
          <strong>{title}</strong>
          {body}
        </div>
      </div>
      <FeatureList accounts={accounts} />
      <div className="fb-connect-actions">{actions}</div>
    </section>
  );
}
