import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { RefreshCw, Trash2 } from 'lucide-react';
import { Notice, formatTime } from './CommentAiShell';
import commentAiApi, { apiMessage } from '../../services/commentAiApi';

const REASON = {
  too_short: 'Quá ngắn, bỏ qua',
  page_comment: 'Bình luận của Page, bỏ qua',
  no_template_match: 'Không có mẫu phù hợp, bỏ qua',
  reply_disabled: 'Đang tắt trả lời, bỏ qua',
  ai_disabled: 'Đang tắt trả lời, bỏ qua'
};
const FILTERS = [['all', 'Tất cả'], ['done', 'Đã trả lời'], ['skipped', 'Bỏ qua'], ['failed', 'Lỗi']];

export function describe(log) {
  if (log.status === 'done') return log.kind === 'template' ? `Đã trả lời bằng mẫu${log.template_name ? ` “${log.template_name}”` : ''}` : 'Đã trả lời bằng AI';
  if (log.status === 'skipped') return REASON[log.error] || log.error || 'Bỏ qua';
  if (log.status === 'failed') return `Chưa trả lời được: ${log.error || 'lỗi tạm thời'}`;
  return 'Đang xử lý';
}

/** Danh sách hoạt động dễ đọc. Gọi onLoaded(logs) để trang cha tính số liệu. */
export default function ActivityList({ pageId, onLoaded }) {
  const router = useRouter();
  const [logs, setLogs] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await commentAiApi.listLogs(pageId, { limit: 100 });
      const rows = (res.logs || []).filter((l) => l.error !== 'duplicate');
      setLogs(rows);
      if (onLoaded) onLoaded(rows);
    } catch (err) {
      setNotice({ type: 'error', text: apiMessage(err, 'Không tải được hoạt động.') });
    } finally {
      setLoading(false);
    }
  }, [pageId, onLoaded]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(load, 20000); return () => clearInterval(t); }, [load]);

  const remove = async (id) => {
    if (!window.confirm('Xóa dòng hoạt động này?')) return;
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

  const shown = logs.filter((l) => filter === 'all' || l.status === filter);
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Hoạt động gần đây</h2>
        <button type="button" className="button button-secondary" onClick={load} disabled={loading}><RefreshCw size={14} /> Làm mới</button>
      </div>
      <div className="panel-body">
        <Notice notice={notice} />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          {FILTERS.map(([key, label]) => (
            <button key={key} type="button" aria-pressed={filter === key} className={`button ${filter === key ? 'button-primary' : 'button-secondary'}`} onClick={() => setFilter(key)}>{label}</button>
          ))}
        </div>
        {!loading && shown.length === 0 && <span className="muted">Chưa có hoạt động nào trong mục này. Khi khách bình luận, kết quả sẽ hiện ở đây.</span>}
        {shown.map((l) => (
          <div key={l.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 320px' }}>
              <b style={{ whiteSpace: 'pre-wrap' }}>{l.message || '(không có nội dung)'}</b>
              <small className="muted" style={{ display: 'block' }}>{describe(l)} · {formatTime(l.created_at)}</small>
              {l.reply && <div style={{ color: 'var(--blue)', whiteSpace: 'pre-wrap' }}>↳ {l.reply}</div>}
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
              {l.comment_id && l.reply && <button type="button" className="button button-secondary" onClick={() => saveAsTemplate(l)}>Lưu thành mẫu</button>}
              <button type="button" className="button button-quiet" onClick={() => remove(l.id)} aria-label="Xóa dòng này" title="Xóa"><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
