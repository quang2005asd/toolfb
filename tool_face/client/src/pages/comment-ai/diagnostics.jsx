import { useState } from 'react';
import { Activity, Zap } from 'lucide-react';
import CommentAiShell, { Notice } from '../../components/comment-ai/CommentAiShell';
import commentAiApi, { apiMessage } from '../../services/commentAiApi';

function DiagnosticsPanel({ pageId }) {
  const [report, setReport] = useState('');
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState(null);

  const run = async (full) => {
    setBusy(full ? 'full' : 'quick');
    setNotice(null);
    try {
      const res = await commentAiApi.diagnostics(pageId, full);
      setReport(res.report);
    } catch (err) {
      setNotice({ type: 'error', text: apiMessage(err, 'Không tạo được báo cáo.') });
    } finally {
      setBusy('');
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(report);
      setNotice({ type: 'success', text: 'Đã sao chép báo cáo.' });
    } catch {
      setNotice({ type: 'error', text: 'Không sao chép được, hãy bôi đen và copy thủ công.' });
    }
  };

  return (
    <>
      <Notice notice={notice} />
      <section className="panel">
        <div className="panel-heading"><h2>Kiểm tra hệ thống của Fanpage đang chọn</h2></div>
        <div className="panel-body">
          <p className="muted" style={{ marginTop: 0 }}>Tạo báo cáo tình trạng để gửi cho người hỗ trợ thay cho ảnh chụp màn hình. Token và khóa bí mật đã được che tự động. Chế độ đầy đủ sẽ gọi Facebook và AI để kiểm tra token, quyền, webhook và bình luận.</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
            <button type="button" className="button button-primary" onClick={() => run(false)} disabled={Boolean(busy)}>
              <Activity size={15} /> {busy === 'quick' ? 'Đang kiểm tra...' : 'Chẩn đoán nhanh'}
            </button>
            <button type="button" className="button button-secondary" onClick={() => run(true)} disabled={Boolean(busy)}>
              <Zap size={15} /> {busy === 'full' ? 'Đang kiểm tra...' : 'Chẩn đoán đầy đủ (gọi Facebook và AI)'}
            </button>
            <button type="button" className="button button-secondary" onClick={copy} disabled={!report}>Sao chép báo cáo</button>
          </div>
          <textarea
            className="field"
            rows={22}
            readOnly
            value={report}
            placeholder="Bấm một nút ở trên để tạo báo cáo."
            style={{ fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: 13 }}
          />
        </div>
      </section>
    </>
  );
}

export default function CommentAiDiagnosticsPage() {
  return (
    <CommentAiShell title="Kiểm tra hệ thống">
      {(pageId) => <DiagnosticsPanel key={pageId} pageId={pageId} />}
    </CommentAiShell>
  );
}
