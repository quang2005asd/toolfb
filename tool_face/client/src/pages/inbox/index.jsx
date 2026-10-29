import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  CheckCircle2,
  ExternalLink,
  FileText,
  ImagePlus,
  Inbox,
  Lightbulb,
  Loader2,
  MessageCircle,
  RefreshCw,
  Search,
  Send,
  X
} from 'lucide-react';
import MainLayout from '../../components/layout/MainLayout';
import PlatformIcon from '../../components/PlatformIcon';
import AutoReplyModal from '../../components/inbox/AutoReplyModal';
import IceBreakersModal from '../../components/inbox/IceBreakersModal';
import messengerApi from '../../services/messengerApi';
import { refreshMessengerUnread } from '../../hooks/useMessengerUnread';

// Server tự đồng bộ với Facebook mỗi 5 giây; giao diện đọc lại CSDL cùng nhịp đó
const POLL_MS = 5000;
const MAX_TEXT_LENGTH = 2000;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const PAGE_STATUS = {
  linked: { tone: 'ok', label: 'Đã liên kết' },
  no_permission: { tone: 'warn', label: 'Thiếu quyền Messenger' },
  ig_access_disabled: { tone: 'warn', label: 'Chưa bật quyền tin nhắn' },
  rate_limited: { tone: 'warn', label: 'Facebook đang giới hạn tần suất' },
  temporarily_unavailable: { tone: 'warn', label: 'Facebook tạm lỗi, đang tự thử lại' },
  token_expired: { tone: 'error', label: 'Token hết hạn' },
  error: { tone: 'error', label: 'Lỗi đồng bộ' },
  unknown: { tone: 'idle', label: 'Đang kiểm tra…' }
};

const PLATFORM_TABS = [
  { id: 'all', label: 'Tất cả' },
  { id: 'messenger', label: 'Messenger' },
  { id: 'instagram', label: 'Instagram' }
];

function errorText(err, fallback) {
  return err.response?.data?.message || err.message || fallback;
}

function isSafeUrl(value) {
  return typeof value === 'string' && /^(https?:|blob:)/i.test(value);
}

function relativeTime(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  const diff = Date.now() - date.getTime();
  if (diff < 60000) return 'Vừa xong';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} phút`;
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  const yesterday = new Date(today.getTime() - 86400000);
  if (date.toDateString() === yesterday.toDateString()) return 'Hôm qua';
  if (diff < 7 * 86400000) return date.toLocaleDateString('vi-VN', { weekday: 'short' });
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

function dayLabel(iso) {
  const date = new Date(iso);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return 'Hôm nay';
  if (date.toDateString() === new Date(today.getTime() - 86400000).toDateString()) return 'Hôm qua';
  return date.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
}

function timeLabel(iso) {
  return iso ? new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '';
}

function Avatar({ name, src, size = 40 }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="inbox-avatar" style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {src && !failed && isSafeUrl(src)
        ? <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
        : (name || 'K').trim().charAt(0).toUpperCase()}
    </span>
  );
}

function Attachment({ item, onMediaLoad }) {
  if (!isSafeUrl(item.url) && !isSafeUrl(item.previewUrl)) return null;
  if (item.type === 'image' || item.type === 'sticker') {
    const src = isSafeUrl(item.previewUrl) ? item.previewUrl : item.url;
    return (
      <a href={isSafeUrl(item.url) ? item.url : src} target="_blank" rel="noopener noreferrer" className={`inbox-attachment-image${item.type === 'sticker' ? ' is-sticker' : ''}`}>
        <img src={src} alt={item.type === 'sticker' ? 'Sticker' : 'Ảnh đính kèm'} referrerPolicy="no-referrer" onLoad={onMediaLoad} />
      </a>
    );
  }
  if (item.type === 'video') {
    return <video className="inbox-attachment-video" src={item.url} poster={isSafeUrl(item.previewUrl) ? item.previewUrl : undefined} controls preload="none" onLoadedMetadata={onMediaLoad} />;
  }
  if (item.type === 'audio') {
    return <audio className="inbox-attachment-audio" src={item.url} controls preload="none" />;
  }
  return (
    <a href={item.url} target="_blank" rel="noopener noreferrer" className="inbox-attachment-file">
      {item.type === 'link' ? <ExternalLink size={14} /> : <FileText size={14} />}
      <span>{item.name || item.url}</span>
    </a>
  );
}

// Gom tin liên tiếp của cùng một bên (cách nhau < 5 phút) thành một cụm, chèn mốc ngày giữa các ngày
function buildThreadItems(messages) {
  const items = [];
  let lastDay = null;
  messages.forEach((message, index) => {
    const day = message.createdTime ? new Date(message.createdTime).toDateString() : lastDay;
    if (day && day !== lastDay) {
      items.push({ type: 'day', key: `day-${day}`, label: dayLabel(message.createdTime) });
      lastDay = day;
    }
    const next = messages[index + 1];
    const endsGroup = !next
      || next.isFromPage !== message.isFromPage
      || (next.sentByUserId || null) !== (message.sentByUserId || null)
      || new Date(next.createdTime) - new Date(message.createdTime) > 5 * 60000
      || (next.createdTime && new Date(next.createdTime).toDateString() !== day);
    items.push({ type: 'message', key: message.id, message, endsGroup });
  });
  return items;
}

export default function InboxPage() {
  const [pages, setPages] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [pageFilter, setPageFilter] = useState('all');
  const [platformFilter, setPlatformFilter] = useState('all');
  const [readFilter, setReadFilter] = useState('all');
  const [autoSync, setAutoSync] = useState(null);
  const [autoReplyOpen, setAutoReplyOpen] = useState(false);
  const [iceBreakersOpen, setIceBreakersOpen] = useState(false);
  const [autoReplySummary, setAutoReplySummary] = useState(null); // { enabled, total }
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const [activeId, setActiveId] = useState(null);
  const [thread, setThread] = useState(null); // { conversation, messages }
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadError, setThreadError] = useState('');

  const [text, setText] = useState('');
  const [image, setImage] = useState(null); // { file, previewUrl }
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');

  const messagesRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const activeIdRef = useRef(null);
  const sendingRef = useRef(false);
  const stickToBottomRef = useRef(true);
  const autoSyncRef = useRef(null);

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  // Thông báo thành công tự ẩn để không chiếm chỗ khung chat
  useEffect(() => {
    if (notice?.tone !== 'ok') return undefined;
    const timer = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  // Tìm kiếm có độ trễ để không gọi API mỗi lần gõ phím
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Khi server đang tự đồng bộ thì chỉ cần đọc CSDL; nếu server tắt vòng tự đồng bộ thì nhờ server đồng bộ hộ
  const shouldRequestSync = () => !autoSyncRef.current?.enabled;

  const loadConversations = useCallback(async ({ sync = false, silent = false } = {}) => {
    if (!silent) setListLoading(true);
    try {
      const res = await messengerApi.conversations({ pageId: pageFilter, platform: platformFilter, filter: readFilter, search, sync });
      setConversations(res.conversations || []);
      setPages(res.pages || []);
      autoSyncRef.current = res.autoSync || null;
      setAutoSync(res.autoSync || null);
      setListError('');
      setLastUpdated(new Date());
      refreshMessengerUnread();
    } catch (err) {
      setListError(errorText(err, 'Không thể tải danh sách hội thoại.'));
    } finally {
      if (!silent) setListLoading(false);
    }
  }, [pageFilter, platformFilter, readFilter, search]);

  useEffect(() => {
    loadConversations({ sync: true });
  }, [loadConversations]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden) loadConversations({ sync: shouldRequestSync(), silent: true });
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [loadConversations]);

  const loadAutoReplySummary = useCallback(async () => {
    try {
      const res = await messengerApi.autoReplySettings();
      const list = res.pages || [];
      setAutoReplySummary({ enabled: list.filter((page) => page.autoReply?.enabled).length, total: list.length });
    } catch {
      setAutoReplySummary(null);
    }
  }, []);

  useEffect(() => {
    loadAutoReplySummary();
  }, [loadAutoReplySummary]);

  const loadThread = useCallback(async (conversationId, { sync = true, force = false, silent = false } = {}) => {
    if (!silent) setThreadLoading(true);
    try {
      const res = await messengerApi.messages(conversationId, { sync, force });
      if (activeIdRef.current !== conversationId) return;
      setThread({ conversation: res.conversation, messages: res.messages || [] });
      setThreadError(res.syncError ? `Không đồng bộ được tin mới: ${res.syncError}` : '');
      // Mở hội thoại = đã đọc: cập nhật danh sách và badge ngay
      setConversations((current) => current.map((item) => (item.id === conversationId ? { ...item, ...res.conversation, unreadCount: 0 } : item)));
      refreshMessengerUnread();
    } catch (err) {
      if (activeIdRef.current === conversationId) setThreadError(errorText(err, 'Không thể tải tin nhắn.'));
    } finally {
      if (!silent && activeIdRef.current === conversationId) setThreadLoading(false);
    }
  }, []);

  const openConversation = (conversationId) => {
    if (conversationId === activeId) return;
    stickToBottomRef.current = true;
    setActiveId(conversationId);
    setThread(null);
    setThreadError('');
    setSendError('');
    setText('');
    clearImage();
    loadThread(conversationId, { sync: true, force: true });
  };

  useEffect(() => {
    if (!activeId) return undefined;
    const timer = setInterval(() => {
      if (!document.hidden && !sendingRef.current) loadThread(activeId, { sync: shouldRequestSync(), silent: true });
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [activeId, loadThread]);

  // Giữ khung chat ở cuối khi có tin mới, trừ khi người dùng đang cuộn xem tin cũ
  useEffect(() => {
    const box = messagesRef.current;
    if (box && stickToBottomRef.current) box.scrollTop = box.scrollHeight;
  }, [thread]);

  // Ảnh tải xong làm khung chat cao thêm: cuộn lại xuống cuối nếu người dùng đang ở cuối
  const handleMediaLoad = useCallback(() => {
    const box = messagesRef.current;
    if (box && stickToBottomRef.current) box.scrollTop = box.scrollHeight;
  }, []);

  useEffect(() => {
    window.addEventListener('resize', handleMediaLoad);
    return () => window.removeEventListener('resize', handleMediaLoad);
  }, [handleMediaLoad]);

  const handleMessagesScroll = () => {
    const box = messagesRef.current;
    if (box) stickToBottomRef.current = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    setNotice(null);
    try {
      const res = await messengerApi.syncNow(pageFilter);
      const failed = (res.results || []).filter((item) => !item.success);
      setNotice({
        tone: failed.length && failed.length === (res.results || []).length ? 'error' : 'ok',
        text: failed.length
          ? `${res.message} Lỗi: ${failed.map((item) => `${item.pageName} – ${item.message}`).join('; ')}`
          : res.message
      });
      await loadConversations({ silent: true });
      if (activeId) await loadThread(activeId, { sync: true, force: true, silent: true });
      refreshMessengerUnread();
    } catch (err) {
      setNotice({ tone: 'error', text: errorText(err, 'Không thể đồng bộ hộp thư.') });
    } finally {
      setSyncing(false);
    }
  };

  function clearImage() {
    setImage((current) => {
      if (current?.previewUrl) URL.revokeObjectURL(current.previewUrl);
      return null;
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  const handlePickImage = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setSendError('Chỉ gửi được tệp hình ảnh.');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setSendError('Ảnh vượt quá giới hạn 10 MB.');
      return;
    }
    setSendError('');
    clearImage();
    setImage({ file, previewUrl: URL.createObjectURL(file) });
  };

  const handleSend = async () => {
    const conversationId = activeId;
    const draft = text.trim();
    if (!conversationId || sending || (!draft && !image)) return;
    if (draft.length > MAX_TEXT_LENGTH) {
      setSendError(`Tin nhắn tối đa ${MAX_TEXT_LENGTH} ký tự.`);
      return;
    }
    setSending(true);
    sendingRef.current = true;
    setSendError('');
    stickToBottomRef.current = true;
    // Hiện ngay tin đang gửi, thay bằng dữ liệu thật khi Facebook xác nhận
    const pending = {
      id: `pending-${Date.now()}`,
      isFromPage: true,
      text: draft,
      attachments: image ? [{ type: 'image', url: image.previewUrl, previewUrl: image.previewUrl }] : [],
      createdTime: new Date().toISOString(),
      pending: true
    };
    setThread((current) => (current ? { ...current, messages: [...current.messages, pending] } : current));
    setText('');
    try {
      const res = await messengerApi.send(conversationId, { text: draft, image: image?.file });
      clearImage();
      if (activeIdRef.current === conversationId) {
        setThread({ conversation: res.conversation, messages: res.messages || [] });
      }
      setConversations((current) => {
        const updated = current.find((item) => item.id === conversationId);
        const rest = current.filter((item) => item.id !== conversationId);
        return updated ? [{ ...updated, ...res.conversation, unreadCount: 0 }, ...rest] : current;
      });
    } catch (err) {
      setThread((current) => (current ? { ...current, messages: current.messages.filter((item) => item.id !== pending.id) } : current));
      setText(draft);
      setSendError(errorText(err, 'Không gửi được tin nhắn.'));
    } finally {
      setSending(false);
      sendingRef.current = false;
      textareaRef.current?.focus();
    }
  };

  const handleComposerKeyDown = (event) => {
    // Enter để gửi, Shift+Enter xuống dòng; bỏ qua khi bộ gõ tiếng Việt đang ghép chữ
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      handleSend();
    }
  };

  useEffect(() => {
    const area = textareaRef.current;
    if (!area) return;
    area.style.height = 'auto';
    area.style.height = `${Math.min(area.scrollHeight, 140)}px`;
  }, [text]);

  const threadItems = useMemo(() => buildThreadItems(thread?.messages || []), [thread]);
  const activeConversation = thread?.conversation || conversations.find((item) => item.id === activeId) || null;
  const totalUnread = conversations.reduce((sum, item) => sum + (item.unreadCount || 0), 0);
  const igNeedsCheck = (page) => page.instagram?.status === 'linked' && !page.instagram.conversationCount;
  const problemPages = pages.filter((page) => ['no_permission', 'token_expired', 'error'].includes(page.status)
    || ['ig_access_disabled', 'token_expired', 'error'].includes(page.instagram?.status)
    || igNeedsCheck(page));
  const canReply = activeConversation ? activeConversation.canReply !== false : false;
  const autoReplyOn = (autoReplySummary?.enabled || 0) > 0;

  return (
    <MainLayout
      title="Hộp thư Messenger & Instagram"
      actions={(
        <div className="inbox-actions">
          <span className={`inbox-live${autoSync?.enabled ? ' is-on' : ''}`} title={lastUpdated ? `Cập nhật lúc ${lastUpdated.toLocaleTimeString('vi-VN')}` : ''}>
            <span className="inbox-live-dot" aria-hidden="true" />
            {autoSync?.enabled ? `Tự động đồng bộ ${autoSync.intervalSeconds} giây/lần` : `Làm mới ${POLL_MS / 1000} giây/lần`}
          </span>
          <button
            type="button"
            className={`button button-secondary inbox-autoreply-btn${autoReplyOn ? ' is-on' : ''}`}
            onClick={() => setAutoReplyOpen(true)}
            disabled={pages.length === 0}
            title="Cài đặt tự động trả lời mọi tin nhắn của khách"
          >
            <Bot size={15} />
            <span className="inbox-autoreply-label">Trả lời tự động</span>
            <span className="inbox-autoreply-state">{autoReplyOn ? `Bật${autoReplySummary.total > 1 ? ` ${autoReplySummary.enabled}/${autoReplySummary.total}` : ''}` : 'Tắt'}</span>
          </button>
          <button
            type="button"
            className="button button-secondary inbox-autoreply-btn"
            onClick={() => setIceBreakersOpen(true)}
            disabled={pages.length === 0}
            title="Câu hỏi gợi ý khách thấy sẵn khi mở đoạn chat Messenger với Fanpage"
          >
            <Lightbulb size={15} />
            <span className="inbox-autoreply-label">Câu hỏi gợi ý</span>
          </button>
          <button type="button" className="button button-primary" onClick={handleSyncNow} disabled={syncing || pages.length === 0}>
            <RefreshCw size={15} className={syncing ? 'spin' : ''} /> {syncing ? 'Đang đồng bộ…' : 'Đồng bộ ngay'}
          </button>
        </div>
      )}
    >
      {iceBreakersOpen && (
        <IceBreakersModal
          onClose={() => setIceBreakersOpen(false)}
          onSaved={(message) => setNotice({ tone: 'ok', text: message })}
        />
      )}
      {autoReplyOpen && (
        <AutoReplyModal
          onClose={() => { setAutoReplyOpen(false); loadAutoReplySummary(); }}
          onSaved={(message) => {
            setNotice({ tone: 'ok', text: message });
            loadAutoReplySummary();
          }}
        />
      )}
      {notice && (
        <div className={`notice inbox-notice ${notice.tone === 'error' ? 'settings-inline-notice is-error' : 'settings-inline-notice is-success'}`}>
          {notice.tone === 'error' ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
          <span>{notice.text}</span>
          <button type="button" className="um-icon-btn" onClick={() => setNotice(null)} aria-label="Đóng thông báo"><X size={14} /></button>
        </div>
      )}

      {!listLoading && pages.length === 0 ? (
        <section className="panel inbox-empty-panel">
          <Inbox size={36} />
          <h2>Chưa có Fanpage nào được kết nối</h2>
          <p className="muted">Kết nối Fanpage bằng token có quyền <strong>pages_messaging</strong> để xem và trả lời tin nhắn của khách ngay trong tool.</p>
          <Link href="/channels" className="button button-primary">Kết nối Fanpage</Link>
        </section>
      ) : (
        <>
          {/* Trạng thái liên kết Messenger của từng Fanpage */}
          <div className={`inbox-page-strip${activeId ? ' is-collapsed-mobile' : ''}`} aria-label="Trạng thái liên kết Fanpage">
            {pages.flatMap((page) => {
              const status = PAGE_STATUS[page.status] || PAGE_STATUS.unknown;
              const chips = [(
                <span key={page.id} className={`inbox-page-chip is-${status.tone}`} title={page.statusMessage || status.label}>
                  <span className="inbox-page-dot" aria-hidden="true" />
                  <PlatformIcon platform="messenger" size={13} />
                  <strong>{page.name}</strong>
                  <span>{status.label}</span>
                </span>
              )];
              if (page.instagram) {
                // Đã kết nối nhưng Meta chưa trả về hội thoại nào (thường do app Meta chưa được duyệt)
                const igEmpty = page.instagram.status === 'linked' && !page.instagram.conversationCount;
                const igStatus = igEmpty
                  ? { tone: 'warn', label: 'Chưa thấy hội thoại' }
                  : PAGE_STATUS[page.instagram.status] || PAGE_STATUS.unknown;
                const igTitle = page.instagram.statusMessage
                  || (igEmpty ? 'Meta chưa trả về hội thoại Instagram nào. Vào Kênh → Instagram → "Kiểm tra tin nhắn" để xem nguyên nhân.' : igStatus.label);
                chips.push(
                  <span key={`${page.id}-ig`} className={`inbox-page-chip is-${igStatus.tone}`} title={igTitle}>
                    <span className="inbox-page-dot" aria-hidden="true" />
                    <PlatformIcon platform="instagram" size={13} />
                    <strong>@{page.instagram.username}</strong>
                    <span>{igStatus.label}</span>
                  </span>
                );
              }
              return chips;
            })}
            {problemPages.length > 0 && (
              <Link href={pages.some((page) => page.instagram?.status === 'ig_access_disabled' || igNeedsCheck(page)) ? '/channels?platform=instagram' : '/channels'} className="inbox-page-fix">
                {pages.some(igNeedsCheck) ? 'Kiểm tra tin nhắn Instagram tại trang Kênh →' : 'Xem hướng dẫn khắc phục tại trang Kênh →'}
              </Link>
            )}
          </div>

          <div className={`inbox-shell${activeId ? ' has-active' : ''}`}>
            {/* ═══ DANH SÁCH HỘI THOẠI ═══ */}
            <aside className="panel inbox-list">
              <div className="inbox-list-head">
                <select className="field" value={pageFilter} onChange={(e) => { setPageFilter(e.target.value); }} aria-label="Lọc theo Fanpage">
                  <option value="all">Tất cả Fanpage ({pages.length})</option>
                  {pages.map((page) => <option key={page.id} value={page.id}>{page.name}</option>)}
                </select>
                <div className="inbox-search">
                  <Search size={15} aria-hidden="true" />
                  <input className="field" placeholder="Tìm tên khách hoặc nội dung…" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} aria-label="Tìm hội thoại" />
                </div>
                <div className="inbox-tabs" role="tablist" aria-label="Lọc theo nền tảng">
                  {PLATFORM_TABS.map((tab) => (
                    <button
                      type="button"
                      role="tab"
                      key={tab.id}
                      aria-selected={platformFilter === tab.id}
                      className={platformFilter === tab.id ? 'is-active' : ''}
                      onClick={() => setPlatformFilter(tab.id)}
                    >
                      {tab.id !== 'all' && <PlatformIcon platform={tab.id} size={13} />} {tab.label}
                    </button>
                  ))}
                </div>
                <div className="inbox-tabs" role="tablist" aria-label="Lọc theo trạng thái đọc">
                  <button type="button" role="tab" aria-selected={readFilter === 'all'} className={readFilter === 'all' ? 'is-active' : ''} onClick={() => setReadFilter('all')}>Tất cả</button>
                  <button type="button" role="tab" aria-selected={readFilter === 'unread'} className={readFilter === 'unread' ? 'is-active' : ''} onClick={() => setReadFilter('unread')}>
                    Chưa đọc{totalUnread > 0 && readFilter === 'all' ? ` (${totalUnread})` : ''}
                  </button>
                </div>
              </div>

              <div className="inbox-list-body">
                {listError && <div className="inbox-list-error"><AlertTriangle size={14} /> {listError}</div>}
                {listLoading && conversations.length === 0 && (
                  <div className="inbox-placeholder"><Loader2 size={18} className="spin" /> Đang đồng bộ hộp thư…</div>
                )}
                {!listLoading && conversations.length === 0 && !listError && (
                  <div className="inbox-placeholder">
                    {search ? 'Không có hội thoại phù hợp.'
                      : readFilter === 'unread' ? 'Không có hội thoại chưa đọc.'
                        : platformFilter === 'instagram' ? 'Chưa có hội thoại Instagram. Kiểm tra trạng thái liên kết Instagram ở đầu trang.'
                          : 'Chưa có hội thoại nào. Bấm “Đồng bộ ngay” để tải từ Facebook.'}
                  </div>
                )}
                {conversations.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className={`inbox-conversation${item.id === activeId ? ' is-active' : ''}${item.unreadCount > 0 ? ' is-unread' : ''}`}
                    onClick={() => openConversation(item.id)}
                  >
                    <span className="inbox-avatar-wrap">
                      <Avatar name={item.participantName} src={item.participantAvatar} />
                      <span className="inbox-platform-badge"><PlatformIcon platform={item.platform} size={15} /></span>
                    </span>
                    <span className="inbox-conversation-main">
                      <span className="inbox-conversation-top">
                        <strong>{item.participantName}</strong>
                        <time dateTime={item.updatedTime || undefined}>{relativeTime(item.updatedTime)}</time>
                      </span>
                      <span className="inbox-conversation-bottom">
                        <span className="inbox-snippet">{item.snippet || 'Tệp đính kèm'}</span>
                        {item.unreadCount > 0 && <span className="inbox-unread-badge">{item.unreadCount > 99 ? '99+' : item.unreadCount}</span>}
                      </span>
                      {pageFilter === 'all' && pages.length > 1 && item.pageName && <span className="inbox-page-tag">{item.pageName}</span>}
                    </span>
                  </button>
                ))}
              </div>
            </aside>

            {/* ═══ KHUNG CHAT ═══ */}
            <section className="panel inbox-thread">
              {!activeConversation ? (
                <div className="inbox-thread-empty">
                  <MessageCircle size={40} />
                  <h2>Chọn một hội thoại để xem tin nhắn</h2>
                  <p className="muted">Tin nhắn Messenger và Instagram được đồng bộ 2 chiều mỗi vài giây: trả lời tại đây sẽ hiện trên Facebook / Instagram và ngược lại.</p>
                </div>
              ) : (
                <>
                  <header className="inbox-thread-head">
                    <button type="button" className="um-icon-btn inbox-back" onClick={() => setActiveId(null)} aria-label="Quay lại danh sách">
                      <ArrowLeft size={16} />
                    </button>
                    <Avatar name={activeConversation.participantName} src={activeConversation.participantAvatar} size={38} />
                    <div className="inbox-thread-title">
                      <strong>{activeConversation.participantName}</strong>
                      <span className="muted inbox-thread-sub">
                        <PlatformIcon platform={activeConversation.platform} size={13} />
                        {activeConversation.platform === 'instagram' ? 'Instagram' : 'Messenger'}
                        {activeConversation.participantUsername ? ` · @${activeConversation.participantUsername}` : ''}
                        {' · '}{activeConversation.pageName || 'Fanpage'}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="um-icon-btn"
                      title="Tải lại tin nhắn từ Facebook"
                      aria-label="Tải lại tin nhắn từ Facebook"
                      onClick={() => loadThread(activeId, { sync: true, force: true })}
                      disabled={threadLoading}
                    >
                      <RefreshCw size={15} className={threadLoading ? 'spin' : ''} />
                    </button>
                    {activeConversation.link && (
                      <a className="um-icon-btn" href={activeConversation.link} target="_blank" rel="noopener noreferrer" title="Mở trong hộp thư Meta" aria-label="Mở hội thoại trong hộp thư Meta">
                        <ExternalLink size={15} />
                      </a>
                    )}
                  </header>

                  <div className="inbox-messages" ref={messagesRef} onScroll={handleMessagesScroll} aria-live="polite">
                    {threadLoading && !thread && <div className="inbox-placeholder"><Loader2 size={18} className="spin" /> Đang tải tin nhắn…</div>}
                    {threadError && <div className="inbox-list-error"><AlertTriangle size={14} /> {threadError}</div>}
                    {thread && thread.messages.length === 0 && !threadLoading && (
                      <div className="inbox-placeholder">Chưa tải được tin nhắn nào trong hội thoại này.</div>
                    )}
                    {threadItems.map((item) => {
                      if (item.type === 'day') return <div className="inbox-day" key={item.key}><span>{item.label}</span></div>;
                      const { message, endsGroup } = item;
                      const hasContent = message.text || message.attachments.length > 0;
                      return (
                        <div key={item.key} className={`inbox-row ${message.isFromPage ? 'is-page' : 'is-customer'}${endsGroup ? ' ends-group' : ''}`}>
                          {!message.isFromPage && (
                            <span className="inbox-row-avatar">
                              {endsGroup && <Avatar name={activeConversation.participantName} src={activeConversation.participantAvatar} size={28} />}
                            </span>
                          )}
                          <div className="inbox-bubble-wrap">
                            {message.attachments.map((attachment, index) => (
                              <Attachment key={`${message.id}-a${index}`} item={attachment} onMediaLoad={handleMediaLoad} />
                            ))}
                            {(message.text || !hasContent) && (
                              <div className={`inbox-bubble${message.pending ? ' is-pending' : ''}${message.isAutoReply ? ' is-auto' : ''}`} title={message.createdTime ? new Date(message.createdTime).toLocaleString('vi-VN') : ''}>
                                {message.text || <em className="muted">Tin nhắn không hỗ trợ hiển thị</em>}
                              </div>
                            )}
                            {endsGroup && (
                              <span className="inbox-meta">
                                {message.isAutoReply && <Bot size={11} aria-hidden="true" />}
                                {message.pending ? 'Đang gửi…' : timeLabel(message.createdTime)}
                                {message.isAutoReply ? ' · Trả lời tự động' : (message.sentByName && ` · Gửi bởi ${message.sentByName}`)}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <footer className="inbox-composer">
                    {activeConversation.replyWindowOpen === false && canReply && !sendError && (
                      <div className="inbox-window-warning">
                        <AlertTriangle size={14} />
                        Đã quá 24 giờ kể từ tin nhắn cuối của khách — Facebook có thể từ chối tin gửi từ Page cho tới khi khách nhắn lại.
                      </div>
                    )}
                    {sendError && <div className="inbox-send-error"><AlertTriangle size={14} /> {sendError}</div>}
                    {image && (
                      <div className="inbox-image-preview">
                        <img src={image.previewUrl} alt="Ảnh sẽ gửi" />
                        <button type="button" onClick={clearImage} aria-label="Bỏ ảnh" disabled={sending}><X size={12} /></button>
                      </div>
                    )}
                    {canReply ? (
                      <div className="inbox-composer-row">
                        <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handlePickImage} />
                        <button
                          type="button"
                          className="um-icon-btn"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={sending || activeConversation.canSendImage === false}
                          title={activeConversation.canSendImage === false ? 'Instagram chưa hỗ trợ gửi ảnh tải lên từ tool' : 'Gửi ảnh'}
                          aria-label="Đính kèm ảnh"
                        >
                          <ImagePlus size={17} />
                        </button>
                        <textarea
                          ref={textareaRef}
                          className="field inbox-textarea"
                          rows={1}
                          placeholder="Nhập tin nhắn…"
                          title="Enter để gửi, Shift+Enter để xuống dòng"
                          value={text}
                          onChange={(e) => setText(e.target.value)}
                          onKeyDown={handleComposerKeyDown}
                          maxLength={MAX_TEXT_LENGTH}
                          aria-label="Nội dung tin nhắn"
                        />
                        <button type="button" className="button button-primary inbox-send" onClick={handleSend} disabled={sending || (!text.trim() && !image)}>
                          {sending ? <Loader2 size={16} className="spin" /> : <Send size={16} />}
                          <span>Gửi</span>
                        </button>
                      </div>
                    ) : (
                      <div className="inbox-window-warning">Facebook không cho phép Page trả lời hội thoại này.</div>
                    )}
                    {text.length > MAX_TEXT_LENGTH - 200 && (
                      <small className="inbox-counter">{text.length}/{MAX_TEXT_LENGTH}</small>
                    )}
                  </footer>
                </>
              )}
            </section>
          </div>
        </>
      )}
    </MainLayout>
  );
}
