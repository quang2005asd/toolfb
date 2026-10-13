import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { RefreshCw, Trash2 } from 'lucide-react';
import CommentAiShell, { Notice, SENTIMENT_LABEL, formatTime } from '../../components/comment-ai/CommentAiShell';
import commentAiApi, { apiMessage } from '../../services/commentAiApi';

const KIND_LABEL = { comment: 'Bình luận', template: 'Mẫu trả lời' };
const STATUS_PILL = { done: 'published', pending: 'publishing', skipped: 'pending', failed: 'failed' };
const STATUS_LABEL = { done: 'Đã trả lời', pending: 'Đang xử lý', skipped: 'Bỏ qua', failed: 'Lỗi' };

function ActivityPanel({ pageId }) {
  const router = useRouter();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await commentAiApi.listLogs(pageId, { limit: 100 });
      setLogs(res.logs || []);
    } catch (err) {
      setNotice({ type: 'error', text: apiMessage(err, 'Không tải được nhật ký.') });
    } finally {
      setLoading(false);
    }
  }, [pageId]);

  useEffect(() => { load(); }, [load]);

  // Tự làm mới mỗi 20 giây để theo dõi bình luận mới
  useEffect(() => {
    const timer = setInterval(() => { load(); }, 20000);
    return () => clearInterval(timer);
  }, [load]);

  const remove = async (id) => {
    try {
      await commentAiApi.deleteLog(pageId, id);
      setLogs((prev) => prev.filter((l) => l.id !== id));
    } catch (err) {
      setNotice({ type: 'error', text: apiMessage(err, 'Không xóa được.') });
    }
  };

  const saveAsTemplate = (log) => {
    window.sessionStorage.setItem('commentAiPrefill', JSON.stringify({ name: String(log.message || 'Mẫu mới').slice(0, 40), content: log.reply || '', keywords: '' }));
    router.push('/comment-ai/templates');
  };

  return (
    <>
      <Notice notice={notice} />
      <section className="panel">
        <div className="panel-heading">
          <h2>Hoạt động gần đây</h2>
          <button type="button" className="button button-secondary" onClick={load} disabled={loading}><RefreshCw size={14} /> Làm mới</button>
        </div>
        <div className="panel-body">
          {!loading && logs.length === 0 && <span className="muted">Chưa có hoạt động nào. Khi có bình luận mới và AI đang bật, bình luận sẽ hiện ở đây.</span>}
          {logs.map((l) => (
            <div key={l.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 320px' }}>
                <span className={`status-pill ${STATUS_PILL[l.status] || 'pending'}`}>{STATUS_LABEL[l.status] || l.status}</span>{' '}
                <span className="status-pill publishing">{KIND_LABEL[l.kind] || l.kind}</span>{' '}
                {l.sentiment && <span className="status-pill publishing">{SENTIMENT_LABEL[l.sentiment] || l.sentiment}</span>}{' '}
                {l.template_name && <span className="status-pill publishing">Mẫu: {l.template_name}</span>}
                <small className="muted" style={{ display: 'block' }}>{l.actor_name ? `${l.actor_name} · ` : ''}{formatTime(l.created_at)}</small>
                {l.message && <div style={{ whiteSpace: 'pre-wrap' }}>{l.message}</div>}
                {l.reply && <div style={{ color: 'var(--blue)', whiteSpace: 'pre-wrap' }}>↳ {l.reply}</div>}
                {l.error && <div style={{ color: l.status === 'failed' ? '#ef4444' : undefined }} className={l.status === 'failed' ? undefined : 'muted'}>{l.error}</div>}
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                {l.kind === 'comment' && l.reply && <button type="button" className="button button-secondary" onClick={() => saveAsTemplate(l)}>Lưu thành mẫu</button>}
                <button type="button" className="button button-danger" onClick={() => remove(l.id)} aria-label="Xóa"><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

export default function CommentAiActivityPage() {
  return (
    <CommentAiShell title="Hoạt động AI">
      {(pageId) => <ActivityPanel key={pageId} pageId={pageId} />}
    </CommentAiShell>
  );
}
