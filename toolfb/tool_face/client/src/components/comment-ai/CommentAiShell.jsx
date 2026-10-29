import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Bot } from 'lucide-react';
import MainLayout from '../layout/MainLayout';
import channelApi from '../../services/channelApi';

const TABS = [
  { href: '/comment-ai', label: 'Cấu hình AI' },
  { href: '/comment-ai/templates', label: 'Mẫu trả lời' },
  { href: '/comment-ai/customers', label: 'Khách hàng' },
  { href: '/comment-ai/leads', label: 'Bài từ nhóm' },
  { href: '/comment-ai/activity', label: 'Hoạt động' },
  { href: '/comment-ai/diagnostics', label: 'Chẩn đoán' }
];

const STORAGE_KEY = 'commentAiPageId';

/**
 * Khung chung của các trang "AI Bình luận": chọn Fanpage đang làm việc + thanh tab.
 * Cách dùng: <CommentAiShell title="...">{(pageId) => <Panel key={pageId} pageId={pageId} />}</CommentAiShell>
 * (key={pageId} để giao diện tự làm mới khi đổi Fanpage)
 */
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
        const next = list.some((c) => String(c.id) === saved) ? saved : (list[0] ? String(list[0].id) : '');
        setPageId(next);
      })
      .catch((err) => {
        if (!cancelled) setError(err.response?.data?.message || 'Không tải được danh sách Fanpage.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const changePage = (id) => {
    setPageId(id);
    window.localStorage.setItem(STORAGE_KEY, id);
  };

  const pageSelect = channels.length > 0 ? (
    <select
      className="field"
      aria-label="Chọn Fanpage"
      value={pageId}
      onChange={(e) => changePage(e.target.value)}
      style={{ minWidth: 220 }}
    >
      {channels.map((c) => (
        <option key={c.id} value={String(c.id)}>{c.name}</option>
      ))}
    </select>
  ) : null;

  return (
    <MainLayout title={title} actions={pageSelect}>
      <div className="step-strip" role="tablist" style={{ marginBottom: 20 }}>
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={`step-button${router.pathname === tab.href ? ' is-current' : ''}`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {error && <div className="notice" style={{ marginBottom: 14, borderColor: 'rgba(239, 68, 68, 0.4)', color: '#ef4444' }}>{error}</div>}

      {!loading && !pageId && !error && (
        <section className="panel" style={{ padding: 28, textAlign: 'center' }}>
          <Bot size={32} aria-hidden="true" />
          <h3 style={{ margin: '12px 0 6px' }}>Chưa có Fanpage nào</h3>
          <p className="muted" style={{ margin: '0 0 14px' }}>Hãy kết nối ít nhất một Fanpage ở mục Kênh trước khi dùng AI Bình luận.</p>
          <Link href="/channels" className="button button-primary">Đến mục Kênh</Link>
        </section>
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
