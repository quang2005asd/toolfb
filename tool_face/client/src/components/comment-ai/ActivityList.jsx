import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { RefreshCw, Trash2 } from 'lucide-react';
import { Notice, formatTime } from './CommentAiShell';
import commentAiApi, { apiMessage } from '../../services/commentAiApi';

const REASON = {
  page_comment: 'Bình luận của Page, bỏ qua',
  thread_reply: 'Bình luận trong luồng do tool tạo, bỏ qua',
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
  const [selectedIds, setSelectedIds] = useState([]);
  const [deleteTargetIds, setDeleteTargetIds] = useState([]);
  const [deleteAction, setDeleteAction] = useState('reply');
  const [deleting, setDeleting] = useState(false);

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

  // Tab đang mở: tự động quét Facebook mỗi 12 giây (dừng khi tab ẩn)
  useEffect(() => {
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        commentAiApi.scan(pageId).catch(() => {}).then(() => load());
      }
    }, 12000);
    return () => clearInterval(timer);
  }, [pageId, load]);

  const refreshAndScan = async () => {
    setLoading(true);
    setNotice(null);
    try {
      const scanRes = await commentAiApi.scan(pageId);
      if (scanRes.count > 0) {
        setNotice({ type: 'success', text: `Đã quét Facebook: có ${scanRes.count} bình luận mới.` });
      }
    } catch (err) {
      console.warn('[ActivityList] Lỗi scan:', err);
    }
    await load();
  };

  const remove = (id) => {
    setDeleteTargetIds([id]);
    setDeleteAction('reply');
  };

  const confirmRemoval = async () => {
    if (!deleteTargetIds.length) return;
    setDeleting(true);
    try {
      const result = deleteTargetIds.length === 1
        ? await commentAiApi.deleteLog(pageId, deleteTargetIds[0], deleteAction).then((res) => ({
          deleted: res.success ? deleteTargetIds : [],
          failed: res.success ? [] : [{ id: deleteTargetIds[0], message: 'Dòng nhật ký không tồn tại.' }]
        }))
        : await commentAiApi.deleteLogs(pageId, deleteTargetIds, deleteAction);
      const deleted = result.deleted || [];
      setLogs((prev) => prev.filter((l) => !deleted.includes(l.id)));
      setSelectedIds((prev) => prev.filter((id) => !deleted.includes(id)));
      if (result.failed?.length) {
        setNotice({ type: 'error', text: result.failed.map((item) => `${item.id}: ${item.message}`).join(' · ') });
      } else {
        setNotice({ type: 'success', text: `Đã xóa ${deleted.length} dòng hoạt động.` });
      }
      setDeleteTargetIds([]);
    } catch (err) {
      setNotice({ type: 'error', text: apiMessage(err, 'Không xóa được. Dòng nhật ký vẫn được giữ nguyên.') });
    } finally {
      setDeleting(false);
    }
  };

  const saveAsTemplate = (log) => {
    window.sessionStorage.setItem('commentAiPrefill', JSON.stringify({
      name: String(log.message || 'Mẫu mới').slice(0, 40),
      content: log.reply || '',
      keywords: '',
      mode: log.kind === 'template' ? 'exact' : 'guided'
    }));
    router.push('/comment-ai/templates');
  };

  const shown = logs.filter((l) => filter === 'all' || l.status === filter);
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Hoạt động gần đây</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          {selectedIds.length > 0 && (
            <button type="button" className="button button-secondary" onClick={() => { setDeleteTargetIds(selectedIds); setDeleteAction('reply'); }}>
              Xóa đã chọn ({selectedIds.length})
            </button>
          )}
          <button type="button" className="button button-secondary" onClick={refreshAndScan} disabled={loading}><RefreshCw size={14} className={loading ? 'spin' : ''} /> Làm mới</button>
        </div>
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
              <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', marginBottom: 5 }}>
                <input
                  type="checkbox"
                  checked={selectedIds.includes(l.id)}
                  aria-label={`Chọn dòng ${l.id}`}
                  onChange={(e) => setSelectedIds((prev) => e.target.checked ? [...new Set([...prev, l.id])] : prev.filter((id) => id !== l.id))}
                />
                <span className="muted">Chọn dòng</span>
              </label>
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
      {deleteTargetIds.length > 0 && (
        <div role="presentation" style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.55)', display: 'grid', placeItems: 'center', padding: 16 }}>
          <section role="dialog" aria-modal="true" aria-labelledby="comment-ai-delete-title" className="panel" style={{ width: 'min(560px, 100%)', maxHeight: '90vh', overflow: 'auto' }}>
            <div className="panel-heading"><h2 id="comment-ai-delete-title">Xác nhận xóa {deleteTargetIds.length > 1 ? `${deleteTargetIds.length} dòng` : 'dòng hoạt động'}</h2></div>
            <div className="panel-body" style={{ display: 'grid', gap: 12 }}>
              <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <input type="radio" name="comment-ai-delete-action" value="reply" checked={deleteAction === 'reply'} onChange={() => setDeleteAction('reply')} />
                <span><strong>Xóa phản hồi của Page trên Facebook</strong><small className="muted" style={{ display: 'block' }}>Mặc định được chọn. Không xóa bình luận gốc của khách.</small></span>
              </label>
              <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <input type="radio" name="comment-ai-delete-action" value="hide_comment" checked={deleteAction === 'hide_comment'} onChange={() => setDeleteAction('hide_comment')} />
                <span><strong>Ẩn bình luận của khách trên Facebook</strong><small style={{ display: 'block', color: 'var(--warning, #b45309)' }}>Không thể khôi phục bằng thao tác xóa trong tool. Chỉ admin/manager được dùng.</small></span>
              </label>
              <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <input type="radio" name="comment-ai-delete-action" value="tool_only" checked={deleteAction === 'tool_only'} onChange={() => setDeleteAction('tool_only')} />
                <span><strong>Chỉ xóa dòng trong tool</strong><small className="muted" style={{ display: 'block' }}>Không thay đổi nội dung trên Facebook.</small></span>
              </label>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" className="button button-secondary" disabled={deleting} onClick={() => setDeleteTargetIds([])}>Hủy</button>
                <button type="button" className="button button-danger" disabled={deleting} onClick={confirmRemoval}>{deleting ? 'Đang xóa...' : 'Xác nhận xóa'}</button>
              </div>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
