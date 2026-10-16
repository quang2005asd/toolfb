import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Bot } from 'lucide-react';
import MainLayout from '../layout/MainLayout';
import AiStudioSwitch from './AiStudioSwitch';
import channelApi from '../../services/channelApi';
import commentAiApi, { apiMessage } from '../../services/commentAiApi';

const TABS = [
  { href: '/comment-ai', label: 'Tổng quan', match: ['/comment-ai', '/comment-ai/activity'] },
  { href: '/comment-ai/templates', label: 'Mẫu trả lời', match: ['/comment-ai/templates'] },
  { href: '/comment-ai/customers', label: 'Khách hàng', match: ['/comment-ai/customers', '/comment-ai/leads'] },
  { href: '/comment-ai/settings', label: 'Cài đặt', match: ['/comment-ai/settings', '/comment-ai/diagnostics'] }
];
const SUBS = {
  'Khách hàng': [['/comment-ai/customers', 'Khách đã tương tác'], ['/comment-ai/leads', 'Bài từ nhóm']],
  'Cài đặt': [['/comment-ai/settings', 'Giọng điệu và thử trả lời'], ['/comment-ai/diagnostics', 'Kiểm tra hệ thống']]
};
const MODES = [
  { id: 'off', title: 'Tắt', desc: 'Không tự trả lời. Bình luận vẫn được ghi lại.', patch: { aiEnabled: false, onlyTemplates: false } },
  { id: 'tpl', title: 'Chỉ theo mẫu của tôi', desc: 'Khớp từ khóa thì trả lời bằng mẫu. Không bao giờ gọi AI.', patch: { aiEnabled: false, onlyTemplates: true } },
  { id: 'ai', title: 'AI tự trả lời', desc: 'Ưu tiên mẫu. Không có mẫu thì AI soạn câu trả lời.', patch: { aiEnabled: true, onlyTemplates: false } }
];
const modeOf = (s) => (s.aiEnabled ? 'ai' : s.onlyTemplates ? 'tpl' : 'off');
export const MODE_EVENT = 'commentAiMode';
const STORAGE_KEY = 'commentAiPageId';

/** Thanh trạng thái + chọn cách trả lời, hiển thị ở mọi tab. */
function ModeBar({ pageId }) {
  const [settings, setSettings] = useState(null);
  const [note, setNote] = useState(null);

  useEffect(() => {
    let cancelled = false;
    commentAiApi.getSettings(pageId)
      .then((res) => { if (!cancelled) setSettings(res.settings); })
      .catch((err) => { if (!cancelled) setNote({ type: 'error', text: apiMessage(err, 'Không tải được cách trả lời.') }); });
    return () => { cancelled = true; };
  }, [pageId]);

  const choose = async (mode) => {
    const prev = settings;
    const next = { ...settings, ...mode.patch };
    setSettings(next);
    setNote(null);
    try {
      await commentAiApi.saveSettings(pageId, next);
      window.dispatchEvent(new CustomEvent(MODE_EVENT, { detail: mode.patch }));
      setNote({ type: 'success', text: 'Đã lưu cách trả lời.' });
    } catch (err) {
      setSettings(prev);
      setNote({ type: 'error', text: apiMessage(err, 'Không lưu được cách trả lời.') });
    }
  };

  if (!settings) return null;
  const current = modeOf(settings);
  const label = current === 'off' ? 'Đang tắt' : current === 'tpl' ? 'Đang bật · Trả lời theo mẫu' : 'Đang bật · AI tự trả lời';
  return (
    <section className="panel" style={{ marginBottom: 16 }}>
      <div className="panel-heading">
        <h2>Cách trả lời bình luận</h2>
        <span className={`status-pill ${current === 'off' ? 'pending' : 'published'}`}>{label}</span>
      </div>
      <div className="panel-body">
        <div role="radiogroup" aria-label="Cách trả lời bình luận" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={current === m.id}
              onClick={() => choose(m)}
              style={{ textAlign: 'left', padding: 12, borderRadius: 12, cursor: 'pointer', background: 'transparent', color: 'inherit', border: `2px solid ${current === m.id ? 'var(--blue)' : 'var(--line)'}` }}
            >
              <b style={{ display: 'block' }}>{m.title}{current === m.id ? ' ✓' : ''}</b>
              <small className="muted">{m.desc}</small>
            </button>
          ))}
        </div>
        {note && <small style={{ display: 'block', marginTop: 8, color: note.type === 'error' ? '#ef4444' : '#10b981' }}>{note.text}</small>}
      </div>
    </section>
  );
}

/** Khung chung của phần "Trả lời bình luận" trong AI Studio. */
export default function CommentAiShell({ title, children }) {
  const router = useRouter();
  const [channels, setChannels] = useState([]);
  const [pageId, setPageId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    channelApi.list()
      .then((res) => {
        if (cancelled) return;
        const list = res.channels || [];
        setChannels(list);
        const saved = window.localStorage.getItem(STORAGE_KEY);
        setPageId(list.some((c) => String(c.id) === saved) ? saved : (list[0] ? String(list[0].id) : ''));
      })
      .catch((err) => { if (!cancelled) setError(err.response?.data?.message || 'Không tải được danh sách Fanpage.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const changePage = (id) => { setPageId(id); window.localStorage.setItem(STORAGE_KEY, id); };

  const pageSelect = channels.length > 0 ? (
    <select className="field" aria-label="Chọn Fanpage" value={pageId} onChange={(e) => changePage(e.target.value)} style={{ minWidth: 220 }}>
      {channels.map((c) => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
    </select>
  ) : null;

  const currentTab = TABS.find((t) => t.match.includes(router.pathname)) || TABS[0];
  const subs = SUBS[currentTab.label];

  return (
    <MainLayout title={title} actions={pageSelect}>
      <AiStudioSwitch current="comments" />
      {error && <div className="notice" style={{ marginBottom: 14, borderColor: 'rgba(239, 68, 68, 0.4)', color: '#ef4444' }}>{error}</div>}

      {!loading && !pageId && !error && (
        <section className="panel" style={{ padding: 28, textAlign: 'center' }}>
          <Bot size={32} aria-hidden="true" />
          <h3 style={{ margin: '12px 0 6px' }}>Chưa có Fanpage nào</h3>
          <p className="muted" style={{ margin: '0 0 14px' }}>Hãy kết nối ít nhất một Fanpage ở mục Kênh trước khi trả lời bình luận.</p>
          <Link href="/channels" className="button button-primary">Đến mục Kênh</Link>
        </section>
      )}

      {pageId && <ModeBar key={pageId} pageId={pageId} />}

      <div className="step-strip" role="tablist" style={{ marginBottom: subs ? 8 : 20 }}>
        {TABS.map((tab) => (
          <Link key={tab.href} href={tab.href} className={`step-button${tab === currentTab ? ' is-current' : ''}`}>{tab.label}</Link>
        ))}
      </div>
      {subs && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
          {subs.map(([href, label]) => (
            <Link key={href} href={href} className={`button ${router.pathname === href ? 'button-primary' : 'button-secondary'}`}>{label}</Link>
          ))}
        </div>
      )}

      {pageId && children(pageId)}
    </MainLayout>
  );
}

export function Notice({ notice }) {
  if (!notice || !notice.text) return null;
  const isError = notice.type === 'error';
  return (
    <div
      className="notice"
      style={{
        marginBottom: 14,
        borderColor: isError ? 'rgba(239, 68, 68, 0.4)' : 'rgba(16, 185, 129, 0.4)',
        color: isError ? '#ef4444' : '#10b981',
        background: isError ? 'rgba(239, 68, 68, 0.08)' : 'rgba(16, 185, 129, 0.08)'
      }}
    >
      {notice.text}
    </div>
  );
}

export const SENTIMENT_LABEL = {
  positive: 'Tích cực',
  negative: 'Tiêu cực',
  purchase: 'Hỏi mua hàng',
  spam: 'Spam',
  neutral: 'Bình thường'
};

export const formatTime = (value) => (value ? new Date(value).toLocaleString('vi-VN') : '');
