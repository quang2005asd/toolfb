import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, AppWindow, BookOpen, CheckCircle2, ChevronDown, CircleAlert, KeyRound, LayoutList, LogIn, RefreshCw, Settings2, ShieldAlert, UserPlus } from 'lucide-react';

// Trạng thái từng bước: done / current / error / todo
function buildSteps(status) {
  const { level, app, apps = [], accounts } = status;
  const validAccounts = accounts.filter((account) => account.valid);
  let appStep;
  if (app.source === 'system') {
    appStep = app.domainOk === false
      ? { state: 'error', hint: `App chung chưa khai báo miền ${app.domain}` }
      : { state: 'done', hint: status.system?.name ? `App chung “${status.system.name}”` : 'App chung của tool' };
  } else {
    const validApps = apps.filter((item) => item.credentialsValid);
    appStep = !apps.length
      ? { state: 'current', hint: 'Chưa có Meta App' }
      : !validApps.length
        ? { state: 'error', hint: 'App ID / Khóa bí mật không đúng' }
        : app.domainOk === false
          ? { state: 'error', hint: `Chưa khai báo miền ${app.domain}` }
          : { state: 'done', hint: apps.length > 1 ? `${apps.length} Meta App riêng` : `${app.label || 'Meta App riêng'} · ID ${app.appId}` };
  }
  const loginStep = validAccounts.length
    ? { state: 'done', hint: `${validAccounts.length} nick đang hoạt động` }
    : accounts.length
      ? { state: 'error', hint: 'Token đã hết hạn' }
      : { state: level === 'login' ? 'current' : 'todo', hint: 'Chưa kết nối nick nào' };
  const missing = new Set();
  let unknown = false;
  let required = 0;
  for (const account of validAccounts) {
    for (const feature of account.features) {
      if (feature.optional) continue;
      if (feature.ok === false) missing.add(feature.key);
      if (feature.ok === null) unknown = true;
    }
    required = Math.max(required, account.features.filter((feature) => !feature.optional).length);
  }
  const permissionStep = !validAccounts.length
    ? { state: 'todo', hint: 'Sau khi kết nối' }
    : missing.size
      ? { state: 'error', hint: `Thiếu quyền ${missing.size}/${required} tính năng` }
      : unknown
        ? { state: 'current', hint: 'Chưa đọc được quyền' }
        : { state: 'done', hint: `Đủ quyền ${required}/${required} tính năng` };
  return [
    { key: 'app', label: 'Meta App', ...appStep },
    { key: 'login', label: 'Kết nối Facebook', ...loginStep },
    { key: 'permissions', label: 'Quyền tính năng', ...permissionStep }
  ];
}

function StepIcon({ state, index }) {
  if (state === 'done') return <CheckCircle2 size={16} aria-hidden="true" />;
  if (state === 'error') return <CircleAlert size={16} aria-hidden="true" />;
  return <span className="fb-connect-step-num" aria-hidden="true">{index + 1}</span>;
}

const STATE_TEXT = { done: 'đã xong', current: 'cần làm', error: 'có lỗi', todo: 'chưa tới' };

// App đã cấp token cho nick: ghi lúc kết nối (metaAppId), nick cũ chưa ghi thì lấy từ Facebook (tokenAppId)
const accountAppId = (account) => String(account?.metaAppId || account?.tokenAppId || '');
const viaSystemApp = (account, status) => Boolean(status?.system?.appId) && accountAppId(account) === String(status.system.appId);

// Nick kết nối qua app nào: cùng một người kết nối qua 2 Meta App sẽ thành 2 nick (Facebook cấp ID khác nhau cho mỗi app)
export function accountAppLabel(account, status) {
  if (!account) return null;
  const appId = accountAppId(account);
  if (!appId) return 'qua app cũ (kết nối từ trước, không rõ app)';
  if (viaSystemApp(account, status)) return 'qua app chung';
  const own = (status?.apps || []).find((app) => String(app.appId) === appId);
  if (own) return `qua Meta App riêng ${own.label || `ID ${own.appId}`}`;
  return `qua app cũ ID ${appId} — không còn dùng`;
}

// Vì sao nick thiếu quyền — mỗi nguyên nhân một cách xử lý khác nhau:
//   other-app: token do Meta App khác app chung cấp → quyền thêm trong app chung không áp dụng, phải kết nối lại qua app chung
//   declined:  người dùng đã tắt quyền trong hộp thoại Facebook → Cấp thêm quyền và bật lại
//   not-asked: Facebook chưa từng hỏi quyền đó (token cấp trước khi app có quyền / cấu hình đăng nhập thiếu quyền)
function missingCauses(status) {
  const causes = [];
  for (const account of status.accounts.filter((item) => item.valid)) {
    const features = account.features.filter((feature) => !feature.optional && feature.ok === false);
    if (!features.length) continue;
    const scopes = [...new Set(features.flatMap((feature) => feature.missing))];
    const declined = [...new Set(features.flatMap((feature) => feature.declined || []))];
    let kind = 'unknown';
    if (status.app.source === 'system' && accountAppId(account) && !viaSystemApp(account, status)) kind = 'other-app';
    else if (declined.length) kind = 'declined';
    else if (features.every((feature) => Array.isArray(feature.declined))) kind = 'not-asked';
    // Nick này đã có bản ghi khác qua app chung (cùng tên) → chỉ cần gỡ bản ghi cũ
    const hasSystemTwin = status.accounts.some((other) => other.id !== account.id && other.name === account.name && viaSystemApp(other, status));
    causes.push({ account, scopes, declined, kind, hasSystemTwin });
  }
  return causes;
}

function CauseList({ causes, status }) {
  if (!causes.length) return null;
  const systemName = status.system?.name ? ` “${status.system.name}”` : '';
  return (
    <ul className="fb-connect-causes">
      {causes.map(({ account, scopes, declined, kind, hasSystemTwin }) => {
        const nick = <strong>{account.name}</strong>;
        const list = <code>{scopes.join(', ')}</code>;
        let text;
        if (kind === 'other-app') {
          text = (
            <>Nick {nick} đang dùng token cấp {accountAppLabel(account, status)}, không phải app chung{systemName}. Quyền bạn thêm trong app chung chỉ có hiệu lực với token do app chung cấp.
              {' '}{hasSystemTwin
                ? <>Nick này đã có bản ghi qua app chung — vào tab <em>Nick Facebook đã kết nối</em> gỡ bản ghi “Kết nối {accountAppLabel(account, status)}” (Fanpage được giữ).</>
                : <>Cách sửa: bấm <em>Kết nối lại qua app chung</em> và đăng nhập nick này, rồi vào tab <em>Nick Facebook đã kết nối</em> gỡ bản ghi cũ (Fanpage được giữ qua bản ghi mới).</>}</>
          );
        } else if (kind === 'declined') {
          text = <>Nick {nick} đã tắt quyền <code>{declined.join(', ')}</code> lúc đăng nhập Facebook. Cách sửa: bấm <em>Cấp thêm quyền</em> → trong hộp thoại Facebook chọn <em>Chỉnh sửa quyền truy cập</em> → bật lại quyền này.</>;
        } else if (kind === 'not-asked') {
          text = (
            <>Facebook chưa từng hỏi nick {nick} quyền {list} — token được cấp khi app chưa có quyền này. Thêm quyền trong Meta App không tự cập nhật token đã cấp: bấm <em>Cấp thêm quyền</em> để Facebook hỏi lại.
              {viaSystemApp(account, status) && status.system?.loginForBusiness
                ? <> App chung đang đăng nhập bằng Configuration ID nên Facebook chỉ hỏi các quyền có trong cấu hình đó: thêm {list} vào cấu hình (Facebook Login for Business → Cấu hình) hoặc xóa Configuration ID ở Cài đặt → Meta App chung.</>
                : <> Facebook vẫn không hỏi? Kiểm tra quyền {list} đã nằm trong Trường hợp sử dụng của app (developers.facebook.com → app → Trường hợp sử dụng → Tùy chỉnh).</>}
            </>
          );
        } else {
          text = <>Nick {nick} thiếu quyền {list}. Bấm <em>Cấp thêm quyền</em>, trong hộp thoại Facebook chọn <em>Chỉnh sửa quyền truy cập</em> và bật các quyền còn thiếu.</>;
        }
        return <li key={account.id}><AlertTriangle size={14} aria-hidden="true" /><span>{text}</span></li>;
      })}
    </ul>
  );
}

function FeatureList({ accounts, status }) {
  const valid = accounts.filter((account) => account.valid);
  if (!valid.length) return null;
  return (
    <div className="fb-connect-features">
      {valid.map((account) => (
        <div key={account.id} className="fb-connect-account">
          {(valid.length > 1 || account.level === 'minimal') && (
            <span className="fb-connect-account-name">
              {account.name}
              {accountAppLabel(account, status) ? ` · ${accountAppLabel(account, status)}` : ''}
              {account.level === 'minimal' ? ' · quyền tối giản' : ''}
            </span>
          )}
          <ul>
            {account.features.map((feature) => {
              const tone = feature.ok === true ? 'ok' : feature.ok === false ? (feature.optional ? 'idle' : 'warn') : 'idle';
              return (
                <li key={feature.key} className={`is-${tone}`} title={feature.missing.length ? `Thiếu: ${feature.missing.join(', ')}` : undefined}>
                  {feature.ok === true ? <CheckCircle2 size={13} aria-hidden="true" /> : <AlertTriangle size={13} aria-hidden="true" />}
                  <span>{feature.label}</span>
                  {feature.ok === false && (
                    <small>{feature.notRequested ? 'không xin (quyền tối giản)' : `${feature.optional ? 'tùy chọn · ' : ''}thiếu ${feature.missing.join(', ')}`}</small>
                  )}
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
 * Bảng trạng thái kết nối Facebook. Mặc định mọi người dùng kết nối qua app chung của tool (nút "Kết nối Facebook");
 * Meta App riêng nằm ở mục Nâng cao. Đã kết nối được → thu gọn một dòng để Fanpage nằm ngay bên dưới.
 * status: kết quả GET /channels/facebook-status
 */
export default function FacebookConnectPanel({ status, error, checking, onLogin, onOpenGuide, onOwnApp, onPasteToken, onPickPages, onRefresh }) {
  const [expanded, setExpanded] = useState(false);
  if (!status) {
    if (!error) return null;
    return (
      <section className="fb-connect is-warn" aria-live="polite">
        <div className="fb-connect-message">
          <AlertTriangle size={18} aria-hidden="true" />
          <div><strong>Chưa kiểm tra được trạng thái kết nối Facebook</strong><p>{error}</p></div>
        </div>
        <div className="fb-connect-actions">
          <button type="button" className="button button-secondary" onClick={onRefresh} disabled={checking}><RefreshCw size={15} className={checking ? 'spin' : ''} /> Thử lại</button>
          <button type="button" className="button button-quiet" onClick={() => onOpenGuide('login-errors')}><BookOpen size={15} /> Hướng dẫn</button>
        </div>
      </section>
    );
  }

  const { level, app, apps = [], accounts, canConfigure } = status;
  const usesSystem = app.source === 'system';
  const steps = buildSteps(status);
  const validAccounts = accounts.filter((account) => account.valid);
  // Cùng một nick có thêm bản ghi qua app chung → bản ghi qua app khác (Meta App riêng / app cũ) là thừa, gợi ý gỡ
  const staleSameName = usesSystem
    ? accounts.filter((account) => !viaSystemApp(account, status)
      && accounts.some((other) => other.id !== account.id && other.name === account.name && viaSystemApp(other, status)))
    : [];
  const causes = level === 'partial' ? missingCauses(status) : [];
  // Mọi nick thiếu quyền đều do token của app khác → việc cần làm là kết nối lại qua app chung, không phải cấp thêm quyền
  const grantLabel = causes.length && causes.every((cause) => cause.kind === 'other-app') ? 'Kết nối lại qua app chung' : 'Cấp thêm quyền';
  const refreshButton = (
    <button type="button" className="button button-quiet" onClick={onRefresh} disabled={checking} title="Kiểm tra lại với Facebook">
      <RefreshCw size={15} className={checking ? 'spin' : ''} /> {checking ? 'Đang kiểm tra…' : 'Kiểm tra lại'}
    </button>
  );
  const advancedButton = (
    <button type="button" className="button button-quiet" onClick={onOwnApp} title="Dùng Meta App của riêng bạn thay cho app chung">
      <AppWindow size={15} /> {apps.length ? `Meta App riêng (${apps.length})` : 'Nâng cao: Meta App riêng'}
    </button>
  );
  const pickButton = validAccounts.length > 0 && (
    <button type="button" className="button button-secondary" onClick={() => onPickPages(validAccounts.length === 1 ? validAccounts[0] : null)}>
      <LayoutList size={14} /> Chọn Fanpage
    </button>
  );

  // Đã kết nối được (đủ hoặc thiếu vài quyền): thu gọn một dòng, Fanpage hiện ngay bên dưới
  if ((level === 'ready' || level === 'partial') && !expanded) {
    const missingFeatures = [...new Set(validAccounts.flatMap((account) => account.features.filter((feature) => !feature.optional && feature.ok === false).map((feature) => feature.label)))];
    return (
      <section className={`fb-connect fb-connect-compact is-${level === 'ready' ? 'ok' : 'warn'}`} aria-label="Trạng thái kết nối Facebook">
        <div className="fb-connect-compact-row">
          {level === 'ready' ? <CheckCircle2 size={17} aria-hidden="true" /> : <AlertTriangle size={17} aria-hidden="true" />}
          <p>
            <strong>{level === 'ready' ? 'Facebook đã sẵn sàng' : `Thiếu quyền: ${missingFeatures.join(', ')}`}</strong>
            <span> · {validAccounts.length} nick · {usesSystem ? (status.system?.name ? `app chung “${status.system.name}”` : 'app chung') : `${apps.length} Meta App riêng`} · tool tự kiểm tra token mỗi 30 phút</span>
          </p>
          <div className="fb-connect-compact-actions">
            <button type="button" className="button button-secondary" onClick={onLogin}><UserPlus size={14} /> {level === 'partial' ? grantLabel : 'Thêm nick'}</button>
            {pickButton}
            <button type="button" className="button button-quiet" onClick={() => setExpanded(true)} aria-expanded="false"><ChevronDown size={14} /> Chi tiết</button>
          </div>
        </div>
        <CauseList causes={causes} status={status} />
      </section>
    );
  }

  let tone;
  let Icon;
  let title;
  let body;
  let actions;
  if (level === 'setup') {
    // Không có app chung dùng được và cũng chưa có app riêng
    tone = 'warn';
    Icon = AlertTriangle;
    title = status.system?.configured ? 'Meta App chung của tool đang lỗi' : 'Tool chưa có Meta App chung';
    body = (
      <>
        <p>
          {canConfigure
            ? (status.system?.configured
              ? `Facebook từ chối App ID / Khóa bí mật của app chung${status.system.credentialsError ? ` (“${status.system.credentialsError}”)` : ''}. Vào Cài đặt → Meta App chung để kiểm tra lại.`
              : 'Nhập App ID và Khóa bí mật của Meta App (ví dụ app “Tool Social”) ở Cài đặt → Meta App chung. Sau đó mọi người dùng chỉ cần bấm “Kết nối Facebook”.')
            : 'Quản trị viên chưa cấu hình Meta App chung cho tool. Báo Quản trị viên, hoặc dùng Meta App của riêng bạn (Nâng cao).'}
        </p>
        <p className="fb-connect-sub">Cách khác: thêm Fanpage bằng token tự tạo.</p>
      </>
    );
    actions = (
      <>
        {canConfigure && <Link href="/settings?tab=meta-app" className="button button-primary"><Settings2 size={15} /> Cấu hình Meta App chung</Link>}
        <button type="button" className={`button ${canConfigure ? 'button-secondary' : 'button-primary'}`} onClick={onOwnApp}><AppWindow size={15} /> Dùng Meta App riêng</button>
        <button type="button" className="button button-secondary" onClick={onPasteToken}><KeyRound size={15} /> Dùng token thay thế</button>
        {refreshButton}
      </>
    );
  } else if (level === 'login') {
    tone = app.domainOk === false ? 'warn' : 'info';
    Icon = app.domainOk === false ? AlertTriangle : LogIn;
    title = app.domainOk === false ? `Meta App chưa khai báo tên miền ${app.domain}` : 'Kết nối Facebook để bắt đầu';
    body = app.domainOk === false
      ? (
        <p>
          Facebook sẽ chặn đăng nhập (“Không thể tải URL”).{' '}
          {usesSystem
            ? (canConfigure ? 'Vào Meta App chung → Cài đặt ứng dụng → Thông tin cơ bản, thêm miền này vào Miền ứng dụng (xem các địa chỉ cần khai báo ở Cài đặt → Meta App chung).' : 'Báo Quản trị viên khai báo miền của tool trong Meta App chung.')
            : <>Vào Meta App → Cài đặt ứng dụng → Thông tin cơ bản → thêm <code>{app.domain}</code> vào Miền ứng dụng, rồi thêm URI chuyển hướng ở Đăng nhập bằng Facebook → Cài đặt.</>}
        </p>
      )
      : (
        <>
          <p>Bấm “Kết nối Facebook” → chọn mức quyền → đăng nhập Facebook và chọn Fanpage → quay lại tool chọn những Fanpage muốn dùng.</p>
          {usesSystem && <p className="fb-connect-sub">Facebook báo “Ứng dụng không hoạt động” hoặc không hỏi quyền Fanpage? App chung có thể chưa được Meta duyệt cho nick của bạn — xem hướng dẫn hiện ra sau khi thử.</p>}
        </>
      );
    actions = (
      <>
        <button type="button" className="button button-primary" onClick={onLogin}><LogIn size={15} /> Kết nối Facebook</button>
        {advancedButton}
        {refreshButton}
      </>
    );
  } else if (level === 'expired') {
    tone = 'error';
    Icon = ShieldAlert;
    title = 'Token của nick Facebook đã hết hạn — cần kết nối lại';
    body = <p>Các Fanpage trực thuộc đang tạm ngưng đăng bài &amp; nhắn tin. Kết nối lại Facebook, tool sẽ đổi sang token dài hạn và lấy lại token cho toàn bộ Fanpage.</p>;
    actions = (
      <>
        <button type="button" className="button button-primary" onClick={onLogin}><LogIn size={15} /> Kết nối lại Facebook</button>
        {advancedButton}
        <button type="button" className="button button-quiet" onClick={() => onOpenGuide('login-errors')}><BookOpen size={15} /> Facebook báo lỗi?</button>
        {refreshButton}
      </>
    );
  } else {
    tone = level === 'ready' ? 'ok' : 'warn';
    Icon = level === 'ready' ? CheckCircle2 : AlertTriangle;
    title = level === 'ready' ? 'Facebook đã sẵn sàng — đủ quyền cho mọi tính năng đã chọn' : 'Một số tính năng chưa dùng được vì token thiếu quyền';
    body = level === 'ready'
      ? <p className="fb-connect-sub">Tool tự kiểm tra và lấy lại token mỗi 30 phút.</p>
      : <CauseList causes={causes} status={status} />;
    actions = (
      <>
        {level === 'partial' && <button type="button" className="button button-primary" onClick={onLogin}><LogIn size={15} /> {grantLabel}</button>}
        {level === 'partial' && <button type="button" className="button button-secondary" onClick={() => onOpenGuide('permissions')}><BookOpen size={15} /> Hướng dẫn cấp quyền</button>}
        {level === 'ready' && <button type="button" className="button button-secondary" onClick={onLogin}><UserPlus size={15} /> Thêm nick Facebook</button>}
        {pickButton}
        {advancedButton}
        <button type="button" className="button button-quiet" onClick={() => setExpanded(false)}>Thu gọn</button>
        {refreshButton}
      </>
    );
  }

  return (
    <section className={`fb-connect is-${tone}`} aria-live="polite" aria-label="Trạng thái kết nối Facebook">
      <Steps steps={steps} />
      <div className="fb-connect-message">
        <Icon size={18} aria-hidden="true" />
        <div>
          <strong>{title}</strong>
          {body}
        </div>
      </div>
      {staleSameName.length > 0 && (
        <p className="fb-connect-sub fb-connect-dup">
          <AlertTriangle size={14} aria-hidden="true" /> Nick “{staleSameName[0].name}” đang có 2 bản ghi vì đã kết nối qua 2 Meta App khác nhau.
          {' '}Vào tab <strong>Nick Facebook đã kết nối</strong>, gỡ bản ghi “Kết nối {accountAppLabel(staleSameName[0], status)}” — Fanpage vẫn được giữ qua bản ghi qua app chung.
        </p>
      )}
      <FeatureList accounts={accounts} status={status} />
      <div className="fb-connect-actions">{actions}</div>
    </section>
  );
}
