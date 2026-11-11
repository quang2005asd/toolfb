import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Copy, ExternalLink, KeyRound, Save, Trash2 } from 'lucide-react';
import settingsApi from '../../services/settingsApi';

function CopyRow({ label, value }) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
      <button type="button" className="icon-button" onClick={copy} aria-label={`Sao chép ${label}`} title={copied ? 'Đã sao chép' : 'Sao chép'}>
        {copied ? <CheckCircle2 size={14} /> : <Copy size={14} />}
      </button>
    </div>
  );
}

/**
 * Meta App chung của tool (chỉ Admin): mọi người dùng bấm "Kết nối Facebook" sẽ đăng nhập qua app này.
 * Khóa bí mật không bao giờ được gửi lại về trình duyệt; để trống khi lưu = giữ khóa cũ.
 */
export default function MetaAppSettings() {
  const [info, setInfo] = useState(null);
  const [setup, setSetup] = useState(null);
  const [form, setForm] = useState({ appId: '', appSecret: '', configFull: '', configMinimal: '' });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null); // { ok, text }

  const apply = (res) => {
    setInfo(res.app);
    setSetup(res.setup);
    setForm({ appId: res.app?.origin === 'settings' ? res.app.appId || '' : '', appSecret: '', configFull: res.app?.configFull || '', configMinimal: res.app?.configMinimal || '' });
  };

  useEffect(() => {
    settingsApi.getMetaApp().then(apply).catch((err) => setNotice({ ok: false, text: err.response?.data?.message || 'Không đọc được Meta App chung.' }));
  }, []);

  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const res = await settingsApi.saveMetaApp({
        appId: form.appId.trim(),
        appSecret: form.appSecret.trim(),
        configFull: form.configFull.trim(),
        configMinimal: form.configMinimal.trim()
      });
      apply(res);
      setNotice({ ok: true, text: res.message || 'Đã lưu Meta App chung.' });
    } catch (err) {
      setNotice({ ok: false, text: err.response?.data?.message || 'Không lưu được Meta App chung.' });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm('Gỡ Meta App chung khỏi Cài đặt? Người dùng sẽ không kết nối Facebook bằng app chung được nữa (nick đã kết nối vẫn giữ Fanpage).')) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await settingsApi.removeMetaApp();
      apply(res);
      setNotice({ ok: true, text: res.message });
    } catch (err) {
      setNotice({ ok: false, text: err.response?.data?.message || 'Không gỡ được Meta App chung.' });
    } finally {
      setBusy(false);
    }
  };

  const setField = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value.replace(/\s/g, '') }));

  return (
    <div className="settings-section-grid">
      <section className="panel">
        <div className="panel-heading">
          <h2><KeyRound size={16} style={{ verticalAlign: 'middle', marginRight: 8, color: 'var(--blue)' }} />Meta App chung · Kết nối Facebook cho mọi người dùng</h2>
        </div>
        <div className="panel-body meta-app-setup">
          {info && (
            <div className={`meta-app-state ${info.configured ? 'is-ok' : 'is-warn'}`} role="status">
              {info.configured ? <CheckCircle2 size={16} aria-hidden="true" /> : <AlertTriangle size={16} aria-hidden="true" />}
              <span>
                {info.configured
                  ? <>Đang dùng app <strong>ID {info.appId}</strong> ({info.origin === 'env' ? 'khai báo trong file .env trên máy chủ' : 'lưu trong Cài đặt'}). Người dùng chỉ cần bấm <strong>Kết nối Facebook</strong> ở trang Kênh.</>
                  : 'Chưa có Meta App chung — người dùng phải tự tạo Meta App riêng mới kết nối được Facebook. Nhập app của tool (ví dụ “Tool Social”) bên dưới.'}
              </span>
            </div>
          )}

          <form onSubmit={save} className="meta-app-setup">
            <div className="meta-app-fields">
              <label>
                <span className="field-label">ID ứng dụng (App ID)</span>
                <input className="field" inputMode="numeric" autoComplete="off" placeholder={info?.origin === 'env' ? `Đang dùng ${info.appId} từ .env` : 'VD: 1839336660715087'} value={form.appId} onChange={setField('appId')} required />
              </label>
              <label>
                <span className="field-label">Khóa bí mật (App Secret)</span>
                <input className="field" type="password" autoComplete="new-password" placeholder={info?.origin === 'settings' ? 'Để trống = giữ khóa đã lưu' : 'Dán khóa bí mật'} value={form.appSecret} onChange={setField('appSecret')} />
              </label>
              <label>
                <span className="field-label">Configuration ID · quyền đầy đủ (tùy chọn)</span>
                <input className="field" inputMode="numeric" autoComplete="off" placeholder="Facebook Login for Business" value={form.configFull} onChange={setField('configFull')} />
                <small>Có thì Facebook hiện hộp cấp quyền gọn như SO9 (app loại Doanh nghiệp → Facebook Login for Business → Cấu hình). Để trống = xin quyền theo danh sách mặc định.</small>
              </label>
              <label>
                <span className="field-label">Configuration ID · quyền tối giản (tùy chọn)</span>
                <input className="field" inputMode="numeric" autoComplete="off" placeholder="Chỉ đăng bài + báo cáo" value={form.configMinimal} onChange={setField('configMinimal')} />
                <small>Cấu hình chỉ gồm quyền đăng bài và đọc số liệu. Để trống = dùng danh sách quyền tối giản mặc định.</small>
              </label>
            </div>
            {notice && (
              <p className={`fb-own-app-result ${notice.ok ? 'is-ok' : 'is-error'}`} role="status">
                {notice.ok ? <CheckCircle2 size={14} aria-hidden="true" /> : <AlertTriangle size={14} aria-hidden="true" />} {notice.text}
              </p>
            )}
            <div className="meta-app-actions">
              <button type="submit" className="button button-primary" disabled={busy}><Save size={15} /> {busy ? 'Đang kiểm tra với Facebook…' : 'Kiểm tra & lưu'}</button>
              {info?.origin === 'settings' && <button type="button" className="button button-quiet" onClick={remove} disabled={busy}><Trash2 size={15} /> Gỡ app khỏi Cài đặt</button>}
            </div>
          </form>
        </div>
      </section>

      {setup && (
        <section className="panel">
          <div className="panel-heading">
            <h2>Khai báo trong Meta App (developers.facebook.com)</h2>
          </div>
          <div className="panel-body meta-app-setup">
            <dl className="meta-app-urls">
              <CopyRow label="Miền ứng dụng (App Domains)" value={setup.domain} />
              <CopyRow label="URI chuyển hướng OAuth hợp lệ" value={setup.redirectUri} />
              <CopyRow label="Webhook · Callback URL" value={setup.webhookUrl} />
              <CopyRow label="Webhook · Verify token" value={setup.verifyToken} />
              <CopyRow label="URL xóa dữ liệu (Data Deletion)" value={setup.dataDeletionUrl} />
              <CopyRow label="URL chính sách quyền riêng tư" value={setup.privacyUrl} />
              <CopyRow label="URL điều khoản dịch vụ" value={setup.termsUrl} />
            </dl>
            <p className="meta-app-note">
              <strong>Vì sao SO9 kết nối được ngay?</strong> App của họ đã qua <em>Xác minh doanh nghiệp</em> và <em>App Review</em> (Advanced Access).
              Khi app chung của tool chưa được duyệt, Facebook chỉ cấp quyền Fanpage cho nick có vai trò trong app — thêm khách dùng thử ở
              {' '}<em>Vai trò trong ứng dụng → Người thử nghiệm</em>. Các bước xin duyệt: xem <code>deploy/META-APP-REVIEW.md</code>.
            </p>
            <a className="button button-secondary" href="https://developers.facebook.com/apps/" target="_blank" rel="noreferrer">Mở Meta for Developers <ExternalLink size={13} /></a>
          </div>
        </section>
      )}
    </div>
  );
}
