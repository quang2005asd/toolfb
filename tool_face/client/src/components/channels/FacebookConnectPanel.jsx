import Link from 'next/link';
import { AlertTriangle, BookOpen, CheckCircle2, CircleAlert, KeyRound, LogIn, RefreshCw, ShieldAlert } from 'lucide-react';

// Trạng thái từng bước: done / current / error / todo
function buildSteps(status) {
  const { level, app, accounts } = status;
  const validAccounts = accounts.filter((account) => account.valid);
  const appStep = !app.configured
    ? { state: 'current', hint: 'Chưa có App ID / App Secret' }
    : !app.credentialsValid
      ? { state: 'error', hint: 'App ID / App Secret không đúng' }
      : app.domainOk === false
        ? { state: 'error', hint: `Chưa khai báo miền ${app.domain}` }
        : { state: 'done', hint: `App ID ${app.appId}` };
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
    { key: 'app', label: 'Thiết lập Meta App', ...appStep },
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

/**
 * Bảng trạng thái đăng nhập Facebook theo cấp độ (setup → login → partial / ready) kèm hành động & hướng dẫn.
 * status: kết quả GET /channels/facebook-status
 */
export default function FacebookConnectPanel({ status, error, checking, onLogin, onOpenGuide, onPasteToken, onRefresh }) {
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
          <button type="button" className="button button-quiet" onClick={() => onOpenGuide('setup')}><BookOpen size={15} /> Hướng dẫn</button>
        </div>
      </section>
    );
  }

  const { level, app, accounts } = status;
  const steps = buildSteps(status);
  const refreshButton = (
    <button type="button" className="button button-quiet" onClick={onRefresh} disabled={checking} title="Kiểm tra lại với Facebook">
      <RefreshCw size={15} className={checking ? 'spin' : ''} /> {checking ? 'Đang kiểm tra…' : 'Kiểm tra lại'}
    </button>
  );

  let tone;
  let Icon;
  let title;
  let body;
  let actions;
  if (level === 'setup') {
    tone = 'warn';
    Icon = AlertTriangle;
    title = 'Chưa thiết lập đăng nhập Facebook';
    body = (
      <>
        <p>
          {!app.configured
            ? 'Tool chưa có App ID & App Secret của Meta App (developers.facebook.com) nên nút “Đăng nhập Facebook” chưa dùng được.'
            : `App ID / App Secret đã lưu không hợp lệ${app.credentialsError ? ` — Facebook báo: “${app.credentialsError}”` : ''}. Hãy kiểm tra lại trong Meta App rồi nhập lại.`}
          {' '}Làm theo hướng dẫn từng bước để thiết lập một lần.
        </p>
        <p className="fb-connect-sub">
          {accounts.length
            ? 'Nick đã kết nối bằng token vẫn dùng được, nhưng token chỉ sống 1–2 giờ và không tự gia hạn cho tới khi thiết lập xong.'
            : 'Trong lúc chờ thiết lập, bạn vẫn có thể thêm Fanpage bằng token (Thêm qua token).'}
          {!status.canConfigure && ' Chỉ Quản trị viên của tool nhập được App ID / App Secret.'}
        </p>
      </>
    );
    actions = (
      <>
        <button type="button" className="button button-primary" onClick={() => onOpenGuide('setup')}><BookOpen size={15} /> Xem hướng dẫn thiết lập</button>
        {status.canConfigure && <Link href="/settings" className="button button-secondary"><KeyRound size={15} /> Nhập App ID & App Secret</Link>}
        <button type="button" className="button button-secondary" onClick={onPasteToken}><KeyRound size={15} /> Dùng token thay thế</button>
        {refreshButton}
      </>
    );
  } else if (level === 'login') {
    tone = app.domainOk === false ? 'warn' : 'info';
    Icon = app.domainOk === false ? AlertTriangle : LogIn;
    title = app.domainOk === false ? `Meta App chưa khai báo tên miền ${app.domain}` : 'Meta App đã sẵn sàng — hãy đăng nhập Facebook';
    body = (
      <>
        {app.domainOk === false
          ? <p>Facebook sẽ chặn đăng nhập (“Không thể tải URL”). Vào Meta App → Cài đặt ứng dụng → Thông tin cơ bản → thêm <code>{app.domain}</code> vào Miền ứng dụng, rồi thêm URI chuyển hướng ở Đăng nhập bằng Facebook → Cài đặt.</p>
          : <p>Bấm “Đăng nhập Facebook”, chọn nick quản lý Fanpage, bấm “Chỉnh sửa quyền truy cập” và bật đủ Fanpage + các quyền được hỏi.</p>}
        <p className="fb-connect-sub">
          Facebook chặn đăng nhập (“Ứng dụng không hoạt động”) hoặc không cấp quyền Fanpage cho nick của bạn? Tool sẽ hướng dẫn tự tạo token để dùng Fanpage của chính bạn — không cần ai mời.
        </p>
      </>
    );
    actions = (
      <>
        <button type="button" className="button button-primary" onClick={onLogin}><LogIn size={15} /> Đăng nhập Facebook</button>
        <button type="button" className="button button-secondary" onClick={() => onOpenGuide('account-token')}><KeyRound size={15} /> Tự tạo token</button>
        <button type="button" className="button button-quiet" onClick={() => onOpenGuide('login-errors')}><BookOpen size={15} /> Facebook báo lỗi?</button>
        {refreshButton}
      </>
    );
  } else if (level === 'expired') {
    tone = 'error';
    Icon = ShieldAlert;
    title = 'Token của nick Facebook đã hết hạn — cần đăng nhập lại';
    body = <p>Các Fanpage trực thuộc đang tạm ngưng đăng bài & nhắn tin. Đăng nhập lại Facebook một lần, tool sẽ tự đổi sang token dài hạn và lấy lại token cho toàn bộ Fanpage.</p>;
    actions = (
      <>
        <button type="button" className="button button-primary" onClick={onLogin}><LogIn size={15} /> Đăng nhập lại Facebook</button>
        <button type="button" className="button button-quiet" onClick={() => onOpenGuide('login-errors')}><BookOpen size={15} /> Facebook báo lỗi?</button>
        {refreshButton}
      </>
    );
  } else if (level === 'partial') {
    tone = 'warn';
    Icon = AlertTriangle;
    title = 'Một số tính năng chưa dùng được vì token thiếu quyền';
    body = <p>Bấm “Cấp thêm quyền”, ở hộp thoại Facebook chọn “Chỉnh sửa quyền truy cập” và bật các quyền còn thiếu. Nếu Facebook không hỏi quyền đó, tự tạo token có đủ quyền theo hướng dẫn — không cần ai mời.</p>;
    actions = (
      <>
        <button type="button" className="button button-primary" onClick={onLogin}><LogIn size={15} /> Cấp thêm quyền (đăng nhập lại)</button>
        <button type="button" className="button button-secondary" onClick={() => onOpenGuide('permissions')}><BookOpen size={15} /> Xem hướng dẫn cấp quyền</button>
        <button type="button" className="button button-secondary" onClick={() => onOpenGuide('account-token')}><KeyRound size={15} /> Tự tạo token</button>
        {refreshButton}
      </>
    );
  } else {
    tone = 'ok';
    Icon = CheckCircle2;
    title = 'Facebook đã sẵn sàng — đủ quyền cho mọi tính năng';
    body = null;
    actions = (
      <>
        <button type="button" className="button button-quiet" onClick={() => onOpenGuide('permissions')}><BookOpen size={15} /> Hướng dẫn</button>
        {refreshButton}
      </>
    );
  }

  return (
    <section className={`fb-connect is-${tone}`} aria-live="polite" aria-label="Trạng thái đăng nhập Facebook">
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
