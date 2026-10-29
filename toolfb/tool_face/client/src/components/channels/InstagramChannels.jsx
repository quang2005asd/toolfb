import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, AlertTriangle, CheckCircle2, ExternalLink, Loader2, MessageCircle, RefreshCw, ShieldCheck } from 'lucide-react';
import channelApi from '../../services/channelApi';
import PlatformIcon from '../PlatformIcon';

const MESSAGING_STATUS = {
  linked: { tone: 'ok', label: 'Tin nhắn: đã liên kết' },
  ig_access_disabled: { tone: 'warn', label: 'Tin nhắn: chưa bật quyền truy cập' },
  rate_limited: { tone: 'warn', label: 'Tin nhắn: Facebook đang giới hạn tần suất' },
  temporarily_unavailable: { tone: 'warn', label: 'Tin nhắn: Facebook tạm lỗi, đang tự thử lại' },
  token_expired: { tone: 'error', label: 'Tin nhắn: token hết hạn' },
  error: { tone: 'error', label: 'Tin nhắn: lỗi đồng bộ' },
  unknown: { tone: 'idle', label: 'Tin nhắn: đang kiểm tra' }
};

const CHECK_ICONS = { ok: CheckCircle2, warn: AlertTriangle, error: AlertCircle };

// "Đã liên kết" nhưng chưa có hội thoại nào → thường do Meta ẩn tin của người lạ (app chưa duyệt)
function messagingStatusOf(account) {
  if (account.messagingStatus === 'linked') {
    return account.conversationCount > 0
      ? { tone: 'ok', label: `Tin nhắn: đã liên kết · ${numberFormat.format(account.conversationCount)} hội thoại` }
      : { tone: 'warn', label: 'Tin nhắn: đã kết nối, chưa thấy hội thoại' };
  }
  return MESSAGING_STATUS[account.messagingStatus] || MESSAGING_STATUS.unknown;
}

const numberFormat = new Intl.NumberFormat('vi-VN');

function formatCount(value) {
  return value === null || value === undefined ? '—' : numberFormat.format(value);
}

function errorText(err, fallback) {
  return err.response?.data?.message || err.message || fallback;
}

export default function InstagramChannels({ onCountChange }) {
  const [data, setData] = useState({ accounts: [], pagesWithoutInstagram: [] });
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState(null);
  const [diagnoses, setDiagnoses] = useState({}); // pageId -> { loading, result, error }
  const countCallbackRef = useRef(onCountChange);
  countCallbackRef.current = onCountChange;

  const apply = useCallback((res) => {
    setData({ accounts: res.accounts || [], pagesWithoutInstagram: res.pagesWithoutInstagram || [] });
    countCallbackRef.current?.((res.accounts || []).length);
  }, []);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    setNotice(null);
    try {
      const res = await channelApi.syncInstagram();
      apply(res);
      setNotice({ tone: 'ok', text: res.message });
    } catch (err) {
      setNotice({ tone: 'error', text: errorText(err, 'Không thể đồng bộ tài khoản Instagram.') });
    } finally {
      setSyncing(false);
    }
  }, [apply]);

  useEffect(() => {
    let active = true;
    channelApi.instagramAccounts()
      .then((res) => {
        if (!active) return;
        apply(res);
        // Chưa có dữ liệu (server chưa chạy lượt quét Instagram) thì đồng bộ ngay một lần
        if (!(res.accounts || []).length && (res.pagesWithoutInstagram || []).length) handleSync();
      })
      .catch((err) => active && setNotice({ tone: 'error', text: errorText(err, 'Không thể tải tài khoản Instagram.') }))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [apply, handleSync]);

  const runDiagnose = useCallback(async (pageId) => {
    setDiagnoses((prev) => ({ ...prev, [pageId]: { loading: true } }));
    try {
      const res = await channelApi.diagnoseInstagram(pageId);
      setDiagnoses((prev) => ({ ...prev, [pageId]: { result: res } }));
    } catch (err) {
      setDiagnoses((prev) => ({ ...prev, [pageId]: { error: errorText(err, 'Không thể kiểm tra kết nối tin nhắn Instagram.') } }));
    }
  }, []);

  const { accounts, pagesWithoutInstagram } = data;
  const needsMessagingAccess = accounts.some((account) => account.messagingStatus === 'ig_access_disabled');

  return (
    <div className="ig-channels">
      <div className="ig-toolbar">
        <div>
          <strong>{accounts.length} tài khoản Instagram</strong>
          <span className="muted"> liên kết với Fanpage đã kết nối. Tin nhắn Instagram Direct được đồng bộ vào trang Tin nhắn.</span>
        </div>
        <div className="ig-toolbar-actions">
          <Link href="/inbox" className="button button-secondary"><MessageCircle size={15} /> Mở hộp thư</Link>
          <button type="button" className="button button-primary" onClick={handleSync} disabled={syncing}>
            <RefreshCw size={15} className={syncing ? 'spin' : ''} /> {syncing ? 'Đang đồng bộ…' : 'Đồng bộ từ Facebook'}
          </button>
        </div>
      </div>

      {notice && (
        <div className={`notice settings-inline-notice ${notice.tone === 'error' ? 'is-error' : 'is-success'}`}>
          {notice.tone === 'error' ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}
          <span>{notice.text}</span>
        </div>
      )}

      {loading ? (
        <div className="inbox-placeholder"><Loader2 size={18} className="spin" /> Đang tải tài khoản Instagram…</div>
      ) : accounts.length === 0 ? (
        <section className="panel ig-empty">
          <PlatformIcon platform="instagram" size={40} />
          <h2>Chưa có tài khoản Instagram nào được liên kết</h2>
          <p className="muted">Instagram được kết nối thông qua Fanpage: liên kết tài khoản Instagram chuyên nghiệp với Fanpage, rồi bấm “Đồng bộ từ Facebook”.</p>
        </section>
      ) : (
        <div className="ig-grid">
          {accounts.map((account) => {
            const status = messagingStatusOf(account);
            const diagnosis = diagnoses[account.pageId];
            const noConversations = account.messagingStatus === 'linked' && !account.conversationCount;
            return (
              <article className="panel ig-card" key={account.id}>
                <header className="ig-card-head">
                  <span className="ig-avatar">
                    {account.profilePictureUrl
                      ? <img src={account.profilePictureUrl} alt="" referrerPolicy="no-referrer" />
                      : <PlatformIcon platform="instagram" size={30} />}
                  </span>
                  <div className="ig-card-title">
                    <strong>@{account.username}</strong>
                    <span className="muted">{account.name}</span>
                  </div>
                  <PlatformIcon platform="instagram" size={20} />
                </header>
                <dl className="ig-stats">
                  <div><dt>Người theo dõi</dt><dd>{formatCount(account.followersCount)}</dd></div>
                  <div><dt>Đang theo dõi</dt><dd>{formatCount(account.followsCount)}</dd></div>
                  <div><dt>Bài viết</dt><dd>{formatCount(account.mediaCount)}</dd></div>
                </dl>
                <div className="ig-linked-page">
                  <PlatformIcon platform="facebook" size={14} /> Liên kết với Fanpage <strong>{account.pageName || account.pageId}</strong>
                </div>
                <span className={`inbox-page-chip is-${status.tone}`} title={account.messagingMessage || status.label}>
                  <span className="inbox-page-dot" aria-hidden="true" /> {status.label}
                </span>
                {account.messagingStatus === 'ig_access_disabled' && account.messagingMessage && (
                  <p className="ig-card-warning">{account.messagingMessage}</p>
                )}
                {noConversations && !diagnosis && (
                  <p className="ig-card-warning">Meta chưa trả về hội thoại Instagram nào. Bấm “Kiểm tra tin nhắn” để xem nguyên nhân.</p>
                )}
                <div className="ig-card-actions">
                  <button
                    type="button"
                    className="button button-primary"
                    onClick={() => runDiagnose(account.pageId)}
                    disabled={diagnosis?.loading}
                  >
                    {diagnosis?.loading ? <Loader2 size={14} className="spin" /> : <ShieldCheck size={14} />}
                    {diagnosis?.loading ? 'Đang kiểm tra…' : 'Kiểm tra tin nhắn'}
                  </button>
                  {account.profileUrl && (
                    <a className="button button-secondary" href={account.profileUrl} target="_blank" rel="noopener noreferrer">
                      Mở Instagram <ExternalLink size={13} />
                    </a>
                  )}
                  <Link className="button button-secondary" href="/inbox">Xem tin nhắn</Link>
                </div>
                {diagnosis?.error && <p className="ig-card-warning">{diagnosis.error}</p>}
                {diagnosis?.result && (
                  <ol className="ig-diagnosis" aria-label="Kết quả kiểm tra tin nhắn Instagram">
                    {diagnosis.result.checks.map((check) => {
                      const Icon = CHECK_ICONS[check.status] || AlertCircle;
                      return (
                        <li key={check.id} className={`ig-check is-${check.status}`}>
                          <Icon size={15} aria-hidden="true" />
                          <div>
                            <strong>{check.label}</strong>
                            {check.detail && <span>{check.detail}</span>}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </article>
            );
          })}
        </div>
      )}

      {pagesWithoutInstagram.length > 0 && (
        <div className="ig-unlinked">
          <span className="muted">Fanpage chưa liên kết Instagram:</span>
          {pagesWithoutInstagram.map((page) => (
            <span key={page.id} className="inbox-page-chip is-idle"><PlatformIcon platform="facebook" size={13} /> {page.name}</span>
          ))}
        </div>
      )}

      <section className={`panel ig-guide${needsMessagingAccess ? ' is-highlight' : ''}`}>
        <div className="panel-heading"><h2>Kết nối Instagram vào tool</h2></div>
        <ol className="panel-body">
          <li>Chuyển tài khoản Instagram sang <strong>tài khoản chuyên nghiệp</strong> (Doanh nghiệp hoặc Nhà sáng tạo).</li>
          <li>
            Liên kết Instagram với Fanpage trong{' '}
            <a href="https://business.facebook.com/latest/settings/instagram_account" target="_blank" rel="noopener noreferrer">Meta Business Suite → Cài đặt → Tài khoản Instagram</a>.
          </li>
          <li>Kết nối lại token Facebook (tab Facebook) có quyền <code>instagram_basic</code>, <code>instagram_manage_messages</code> và <code>pages_messaging</code>.</li>
          <li className={needsMessagingAccess ? 'is-attention' : ''}>
            Trong ứng dụng Instagram: <strong>Cài đặt → Tin nhắn và lượt phản hồi tin → Công cụ đã kết nối</strong> → bật <strong>“Cho phép truy cập tin nhắn”</strong>.
          </li>
          <li>Bấm <strong>“Đồng bộ từ Facebook”</strong>. Tin nhắn Instagram sẽ tự về trang Tin nhắn và dùng chung cài đặt trả lời tự động của Fanpage.</li>
          <li className={accounts.some((account) => account.messagingStatus === 'linked' && !account.conversationCount) ? 'is-attention' : ''}>
            App Meta <strong>chưa được duyệt</strong> (Standard Access) chỉ đọc được tin nhắn của người có vai trò trong app / Fanpage.
            Để test, thêm người nhắn làm <strong>Tester</strong> trong{' '}
            <a href="https://developers.facebook.com/apps/" target="_blank" rel="noopener noreferrer">Meta for Developers → Vai trò trong ứng dụng</a>.
            Để nhận tin của mọi khách: xác minh doanh nghiệp và gửi <strong>App Review</strong> xin Advanced Access cho <code>instagram_manage_messages</code>.
          </li>
        </ol>
      </section>
    </div>
  );
}
