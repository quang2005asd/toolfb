import Link from 'next/link';
import { AlertTriangle, CheckCircle2, KeyRound, LogIn, RefreshCw, ShieldAlert, Clock3 } from 'lucide-react';
import PlatformIcon from '../PlatformIcon';

function formatTime(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
}

function daysLeft(iso) {
  if (!iso) return null;
  return Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 86400000));
}

function describeAccount(account) {
  if (account.status === 'expired' || account.status === 'invalid') {
    return { tone: 'error', text: `token đã hết hạn${account.expiresAt ? ` (lúc ${formatTime(account.expiresAt)})` : ''} — cần đăng nhập lại Facebook` };
  }
  if (account.status !== 'valid') return { tone: 'idle', text: 'đang kiểm tra token…' };
  if (account.type === 'never') return { tone: 'ok', text: 'token không hết hạn' };
  if (account.type === 'long') return { tone: 'ok', text: `token dài hạn, còn ${daysLeft(account.expiresAt)} ngày (đến ${formatTime(account.expiresAt)})` };
  if (account.type === 'short') return { tone: 'warn', text: `token NGẮN HẠN, sẽ hết hạn lúc ${formatTime(account.expiresAt)}` };
  return { tone: 'idle', text: 'token còn sống (chưa đọc được hạn dùng)' };
}

/**
 * Tình trạng token Facebook + hành động tự lấy lại token.
 * info: { appConfigured, oauthAvailable, accounts: [{ id, name, status, type, expiresAt, error }] }
 */
export default function TokenHealthBanner({ info, invalidPageCount = 0, canConfigureApp, renewing, onRenew, onReconnect, onPasteToken }) {
  if (!info) return null;
  const accounts = info.accounts || [];
  const expired = accounts.filter((item) => item.status === 'expired' || item.status === 'invalid');
  const shortLived = accounts.filter((item) => item.status === 'valid' && item.type === 'short');
  const tone = expired.length ? 'error' : (shortLived.length || invalidPageCount) ? 'warn' : 'ok';
  const needsLogin = expired.length > 0;

  let title;
  if (needsLogin) title = `${expired.length} nick Facebook đã hết hạn token — các Fanpage trực thuộc tạm ngưng đăng bài & nhắn tin`;
  else if (shortLived.length) title = 'Token ngắn hạn sắp hết hạn';
  else if (invalidPageCount) title = `${invalidPageCount} Fanpage mất quyền dù nick Facebook vẫn còn hạn`;
  else if (accounts.length) title = 'Token Facebook đang hoạt động — tool tự kiểm tra & lấy lại token mỗi 30 phút';
  else title = 'Chưa có nick Facebook nào được kết nối bằng token tài khoản';

  const Icon = tone === 'error' ? ShieldAlert : tone === 'warn' ? AlertTriangle : CheckCircle2;

  return (
    <section className={`token-banner is-${tone}`} aria-live="polite">
      <div className="token-banner-head">
        <Icon size={18} aria-hidden="true" />
        <strong>{title}</strong>
      </div>

      {accounts.length > 0 && (
        <ul className="token-banner-accounts">
          {accounts.map((account) => {
            const state = describeAccount(account);
            return (
              <li key={account.id} className={`is-${state.tone}`}>
                <PlatformIcon platform="facebook" size={14} />
                <strong>{account.name}</strong>
                <span>{state.text}</span>
              </li>
            );
          })}
        </ul>
      )}

      {needsLogin && (
        <p className="token-banner-note">
          Facebook không cho phép tự gia hạn một token <em>đã</em> hết hạn. Hãy đăng nhập lại Facebook một lần —
          {info.appConfigured
            ? ' tool sẽ tự đổi sang token dài hạn (~60 ngày) và lấy lại token cho toàn bộ Fanpage (token Fanpage dài hạn không hết hạn).'
            : ' hoặc dán token mới. Để từ nay tool tự đổi sang token dài hạn, cần cấu hình App ID & App Secret.'}
        </p>
      )}
      {!needsLogin && shortLived.length > 0 && (
        <p className="token-banner-note">
          {info.appConfigured
            ? 'Tool sẽ tự đổi sang token dài hạn trong lần kiểm tra tới — hoặc bấm “Làm mới token” để đổi ngay.'
            : canConfigureApp
              ? 'Token lấy từ Graph API Explorer chỉ sống 1–2 giờ. Nhập App ID & App Secret của Meta App để tool tự đổi sang token dài hạn.'
              : 'Token lấy từ Graph API Explorer chỉ sống 1–2 giờ. Nhờ Quản trị viên cấu hình App ID & App Secret để tool tự đổi sang token dài hạn.'}
        </p>
      )}
      {!needsLogin && !shortLived.length && invalidPageCount > 0 && (
        <p className="token-banner-note">
          Fanpage thêm bằng Page Token thủ công không tự lấy lại được. Kết nối bằng token tài khoản (hoặc đăng nhập Facebook) để tool tự quản lý token.
        </p>
      )}

      <div className="token-banner-actions">
        {info.oauthAvailable && (needsLogin || shortLived.length > 0 || invalidPageCount > 0) && (
          <button type="button" className="button button-primary" onClick={onReconnect}>
            <LogIn size={15} /> Đăng nhập lại Facebook
          </button>
        )}
        {(needsLogin || invalidPageCount > 0 || !accounts.length) && (
          <button type="button" className={`button ${info.oauthAvailable ? 'button-secondary' : 'button-primary'}`} onClick={onPasteToken}>
            <KeyRound size={15} /> Dán token mới
          </button>
        )}
        {accounts.length > 0 && (
          <button type="button" className="button button-secondary" onClick={onRenew} disabled={renewing}>
            <RefreshCw size={15} className={renewing ? 'spin' : ''} /> {renewing ? 'Đang làm mới…' : 'Làm mới token'}
          </button>
        )}
        {!info.appConfigured && canConfigureApp && (
          <Link href="/settings" className="button button-quiet">
            <Clock3 size={15} /> Cấu hình App ID & App Secret
          </Link>
        )}
      </div>
    </section>
  );
}
