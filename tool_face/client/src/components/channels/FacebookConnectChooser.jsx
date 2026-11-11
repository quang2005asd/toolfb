import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, AppWindow, LogIn, ShieldCheck, ShieldHalf, X } from 'lucide-react';

const LEVELS = [
  {
    id: 'full',
    icon: ShieldCheck,
    title: 'Quyền đầy đủ (khuyên dùng)',
    text: 'Đăng bài & hẹn giờ, báo cáo lượt xem, hộp thư Messenger / Instagram, trả lời tự động, bình luận & AI Bình luận.'
  },
  {
    id: 'minimal',
    icon: ShieldHalf,
    title: 'Quyền tối giản',
    text: 'Chỉ đăng bài, quản lý bài đăng và xem báo cáo. Tool không đọc tin nhắn / bình luận — Tin nhắn, Trả lời tự động và AI Bình luận sẽ không hoạt động.'
  }
];

/**
 * Bước đầu khi bấm "Kết nối Facebook" bằng app chung: chọn mức quyền rồi mở cửa sổ Facebook.
 * system: status.system (app chung) — appReady=false thì báo Admin chưa cấu hình.
 */
export default function FacebookConnectChooser({ open, system, canConfigure, onConnect, onOwnApp, onClose }) {
  const [level, setLevel] = useState('full');
  const connectRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    connectRef.current?.focus();
    const onKey = (event) => { if (event.key === 'Escape') onCloseRef.current(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
  if (!open || typeof document === 'undefined') return null;

  const appReady = Boolean(system?.configured && system?.credentialsValid && system?.domainOk !== false);

  return createPortal(
    <div className="fb-guide-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="fb-guide-dialog fb-connect-chooser" role="dialog" aria-modal="true" aria-labelledby="fb-connect-chooser-title">
        <div className="fb-guide-head">
          <h2 id="fb-connect-chooser-title"><LogIn size={18} aria-hidden="true" /> Kết nối Facebook</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Đóng"><X size={17} /></button>
        </div>
        <div className="fb-guide-body">
          <p className="fb-login-lead">
            Kết nối Fanpage để hẹn giờ đăng bài, xem báo cáo, quản lý tin nhắn và bình luận. Bạn đăng nhập ngay trên Facebook —
            tool <em>không hỏi mật khẩu</em> và chỉ dùng những quyền bạn cấp.
          </p>

          {!appReady && (
            <div className="fb-login-cause is-main" role="alert">
              <strong><AlertTriangle size={14} aria-hidden="true" /> {system?.configured ? 'Meta App chung của tool đang lỗi' : 'Tool chưa có Meta App chung'}</strong>
              <span>
                {canConfigure
                  ? (system?.configured
                    ? `Kiểm tra lại App ID / Khóa bí mật và miền ứng dụng ở Cài đặt → Meta App chung${system?.credentialsError ? ` (Facebook báo: ${system.credentialsError})` : ''}.`
                    : 'Vào Cài đặt → Meta App chung để nhập App ID và Khóa bí mật — sau đó mọi người dùng chỉ cần bấm Kết nối.')
                  : 'Báo Quản trị viên kiểm tra mục Meta App chung trong Cài đặt. Trong lúc chờ, bạn có thể dùng Meta App riêng (Nâng cao).'}
              </span>
            </div>
          )}

          <fieldset className="fb-level-options" disabled={!appReady}>
            <legend className="field-label">Mức quyền cấp cho tool</legend>
            {LEVELS.map((item) => {
              const Icon = item.icon;
              const selected = level === item.id;
              return (
                <label key={item.id} className={`fb-level-option${selected ? ' is-selected' : ''}`}>
                  <input type="radio" name="fb-level" value={item.id} checked={selected} onChange={() => setLevel(item.id)} />
                  <Icon size={20} aria-hidden="true" />
                  <span>
                    <strong>{item.title}</strong>
                    <small>{item.text}</small>
                  </span>
                </label>
              );
            })}
          </fieldset>

          <ol className="fb-connect-flow" aria-label="Các bước kết nối">
            <li>Facebook hỏi <em>“Tiếp tục dưới tên …?”</em> — kiểm tra đúng nick rồi bấm Tiếp tục.</li>
            <li>Chọn Fanpage và xác nhận quyền trên Facebook.</li>
            <li>Quay lại tool, chọn những Fanpage muốn dùng.</li>
          </ol>
        </div>
        <div className="fb-login-actions fb-connect-chooser-actions">
          <button type="button" className="auth-inline-link fb-connect-advanced" onClick={onOwnApp}>
            <AppWindow size={14} aria-hidden="true" /> Nâng cao: dùng Meta App riêng
          </button>
          <button type="button" className="button button-quiet" onClick={onClose}>Hủy</button>
          <button ref={connectRef} type="button" className="button button-primary" onClick={() => onConnect(level)} disabled={!appReady}>
            <LogIn size={15} /> Kết nối
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
