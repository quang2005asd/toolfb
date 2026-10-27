import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import CommentAiShell, { MODE_EVENT } from '../../components/comment-ai/CommentAiShell';
import ActivityList from '../../components/comment-ai/ActivityList';
import commentAiApi from '../../services/commentAiApi';

const sameDay = (value) => value && new Date(value).toDateString() === new Date().toDateString();

function Overview({ pageId }) {
  const [logs, setLogs] = useState([]);
  const [templateCount, setTemplateCount] = useState(null);
  const [modeOn, setModeOn] = useState(null);

  const refreshSetup = useCallback(() => {
    commentAiApi.listTemplates(pageId).then((r) => setTemplateCount((r.templates || []).length)).catch(() => {});
    commentAiApi.getSettings(pageId).then((r) => setModeOn(Boolean(r.settings?.aiEnabled || r.settings?.onlyTemplates))).catch(() => {});
  }, [pageId]);

  useEffect(() => { refreshSetup(); }, [refreshSetup]);
  useEffect(() => {
    const onMode = (e) => setModeOn(Boolean(e.detail?.aiEnabled || e.detail?.onlyTemplates));
    window.addEventListener(MODE_EVENT, onMode);
    return () => window.removeEventListener(MODE_EVENT, onMode);
  }, []);

  const today = logs.filter((l) => sameDay(l.created_at));
  const byTemplate = today.filter((l) => l.status === 'done' && l.kind === 'template').length;
  const byAi = today.filter((l) => l.status === 'done' && l.kind !== 'template').length;
  const skipped = today.filter((l) => l.status === 'skipped').length;
  const replied = logs.some((l) => l.status === 'done');
  const steps = [
    [templateCount > 0, <>Thêm mẫu trả lời đầu tiên ở tab <Link href="/comment-ai/templates">Mẫu trả lời</Link></>],
    [modeOn === true, 'Chọn cách trả lời ở phía trên (Tắt, Chỉ theo mẫu hoặc AI tự trả lời)'],
    [replied, 'Bình luận thử trên Facebook bằng tài khoản thường và chờ tối đa 1 phút']
  ];
  const allDone = steps.every(([done]) => done);

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
        {[[byTemplate, 'trả lời bằng mẫu hôm nay'], [byAi, 'trả lời bằng AI hôm nay'], [skipped, 'bình luận được bỏ qua']].map(([n, label]) => (
          <section key={label} className="panel" style={{ padding: 16 }}>
            <strong style={{ fontSize: 28, display: 'block', lineHeight: 1.1 }}>{n}</strong>
            <span className="muted">{label}</span>
          </section>
        ))}
      </div>

      {!allDone && (
        <section className="panel" style={{ marginBottom: 16 }}>
          <div className="panel-heading"><h2>Bắt đầu trong 3 bước</h2></div>
          <div className="panel-body">
            {steps.map(([done, text], i) => (
              <div key={i} style={{ display: 'flex', gap: 10, padding: '6px 0', alignItems: 'center' }}>
                <span className={`status-pill ${done ? 'published' : 'pending'}`} aria-label={done ? 'Đã xong' : 'Chưa xong'}>{done ? '✓' : i + 1}</span>
                <span style={{ textDecoration: done ? 'line-through' : 'none', opacity: done ? 0.6 : 1 }}>{text}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <ActivityList pageId={pageId} onLoaded={setLogs} />
    </>
  );
}

export default function CommentAiOverviewPage() {
  return (
    <CommentAiShell title="Trả lời bình luận">
      {(pageId) => <Overview key={pageId} pageId={pageId} />}
    </CommentAiShell>
  );
}
