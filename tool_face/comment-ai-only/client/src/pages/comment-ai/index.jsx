import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Bot, RefreshCw, Save, Send } from 'lucide-react';
import CommentAiShell, { Notice, SENTIMENT_LABEL } from '../../components/comment-ai/CommentAiShell';
import commentAiApi, { apiMessage } from '../../services/commentAiApi';

function SettingsPanel({ pageId }) {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);
  const [comment, setComment] = useState('');
  const [chat, setChat] = useState([]);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    commentAiApi.getSettings(pageId)
      .then((res) => { if (!cancelled) setSettings(res.settings); })
      .catch((err) => { if (!cancelled) setNotice({ type: 'error', text: apiMessage(err, 'Không tải được cấu hình.') }); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [pageId]);

  const update = (patch) => setSettings((prev) => ({ ...prev, ...patch }));

  const save = async () => {
    setSaving(true);
    setNotice(null);
    try {
      const res = await commentAiApi.saveSettings(pageId, settings);
      setSettings(res.settings);
      setNotice({ type: 'success', text: res.message || 'Đã lưu.' });
    } catch (err) {
      setNotice({ type: 'error', text: apiMessage(err, 'Không lưu được cấu hình.') });
    } finally {
      setSaving(false);
    }
  };

  const subscribe = async () => {
    setNotice(null);
    try {
      const res = await commentAiApi.subscribe(pageId);
      setNotice({ type: 'success', text: res.message });
    } catch (err) {
      setNotice({ type: 'error', text: apiMessage(err, 'Không đăng ký được webhook.') });
    }
  };

  const sendTest = async () => {
    const text = comment.trim();
    if (!text) return;
    setComment('');
    setTesting(true);
    const item = { id: Date.now(), comment: text, result: null, error: '' };
    setChat((prev) => [...prev, item]);
    try {
      const res = await commentAiApi.preview(pageId, {
        comment: text,
        aiEnabled: settings.aiEnabled,
        tone: settings.tone,
        shop: settings.shop,
        onlyTemplates: settings.onlyTemplates,
        vars: settings.vars
      });
      setChat((prev) => prev.map((x) => (x.id === item.id ? { ...x, result: res } : x)));
    } catch (err) {
      setChat((prev) => prev.map((x) => (x.id === item.id ? { ...x, error: apiMessage(err, 'AI không phản hồi.') } : x)));
    } finally {
      setTesting(false);
    }
  };

  if (loading) return <section className="panel" style={{ padding: 24 }}><span className="muted">Đang tải...</span></section>;
  if (!settings) return <Notice notice={notice} />;

  return (
    <>
      <Notice notice={notice} />

      <section className="panel" style={{ marginBottom: 18 }}>
        <div className="panel-heading">
          <h2><Bot size={16} style={{ verticalAlign: 'middle', marginRight: 8 }} />Trạng thái AI của Fanpage này</h2>
          <span className={`status-pill ${settings.aiEnabled ? 'published' : 'pending'}`}>{settings.aiEnabled ? 'AI soạn câu trả lời' : 'Chỉ dùng mẫu'}</span>
        </div>
        <div className="panel-body" style={{ display: 'grid', gap: 12 }}>
          <label className={`ar-toggle${settings.aiEnabled ? ' is-on' : ''}`}>
            <span>
              <strong>Tự động trả lời bình luận mới</strong>
              <small className="muted">Bật: AI tự soạn câu trả lời. Tắt: vẫn trả lời theo mẫu đã duyệt và thay biến; không dùng AI để lọc spam.</small>
            </span>
            <input type="checkbox" checked={settings.aiEnabled} onChange={(e) => update({ aiEnabled: e.target.checked })} aria-label="Cho phép AI tự soạn câu trả lời" />
            <span className="ar-switch" aria-hidden="true" />
          </label>
          <label className={`ar-toggle${settings.onlyTemplates ? ' is-on' : ''}`}>
            <span>
              <strong>Chỉ trả lời khi có mẫu phù hợp</strong>
              <small className="muted">{settings.aiEnabled ? 'Khi bật AI, chỉ trả lời nếu chọn được mẫu phù hợp.' : 'Khi tắt AI ở trên, chỉ gửi mẫu có từ khóa khớp; bình luận khác sẽ được bỏ qua.'}</small>
            </span>
            <input type="checkbox" checked={settings.onlyTemplates} onChange={(e) => update({ onlyTemplates: e.target.checked })} aria-label="Chỉ trả lời khi có mẫu phù hợp" />
            <span className="ar-switch" aria-hidden="true" />
          </label>
          <label className={`ar-toggle${settings.requireApproval ? ' is-on' : ''}`}>
            <span>
              <strong>Yêu cầu admin duyệt mẫu</strong>
              <small className="muted">Khi bật, mẫu do thành viên soạn chỉ được dùng sau khi admin duyệt.</small>
            </span>
            <input type="checkbox" checked={settings.requireApproval} onChange={(e) => update({ requireApproval: e.target.checked })} aria-label="Yêu cầu admin duyệt mẫu" />
            <span className="ar-switch" aria-hidden="true" />
          </label>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            Các công tắc này chỉ áp dụng cho bình luận, không tắt trả lời tự động trong Inbox. Cài hướng dẫn AI và biến ở trang{' '}
            <Link href="/comment-ai/templates">Mẫu trả lời</Link>.
            {' '}AI dùng API Key, model và địa chỉ dịch vụ trong cấu hình máy chủ.
          </p>
        </div>
      </section>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 22 }}>
        <button type="button" className="button button-primary" onClick={save} disabled={saving}>
          <Save size={15} /> {saving ? 'Đang lưu...' : 'Lưu cấu hình'}
        </button>
        <button type="button" className="button button-secondary" onClick={subscribe}>
          <RefreshCw size={15} /> Đăng ký webhook
        </button>
      </div>

      <section className="panel">
        <div className="panel-heading"><h2>Thử trả lời (không đăng lên Facebook)</h2></div>
        <div className="panel-body">
          <div style={{ display: 'grid', gap: 10, marginBottom: 14 }}>
            {chat.length === 0 && <span className="muted">Nhập bình luận để thử chế độ hiện tại. Khi tắt AI, hệ thống chỉ dùng mẫu và biến đã cấu hình ở trang Mẫu trả lời.</span>}
            {chat.map((item) => (
              <div key={item.id} style={{ display: 'grid', gap: 6 }}>
                <div style={{ justifySelf: 'end', maxWidth: '80%', padding: '8px 12px', borderRadius: 12, background: 'rgba(79, 140, 255, 0.15)' }}>{item.comment}</div>
                <div style={{ justifySelf: 'start', maxWidth: '80%', padding: '8px 12px', borderRadius: 12, background: 'rgba(148, 163, 184, 0.15)', whiteSpace: 'pre-wrap' }}>
                  {item.error && <span style={{ color: '#ef4444' }}>{item.error}</span>}
                  {!item.error && !item.result && '...'}
                  {item.result && (item.result.skipped ? `(Sẽ bỏ qua: ${item.result.reason})` : item.result.reply)}
                  {item.result && (
                    <small className="muted" style={{ display: 'block', marginTop: 4 }}>
                      {SENTIMENT_LABEL[item.result.sentiment] || ''}{item.result.template ? ` · Mẫu: ${item.result.template.name}` : ' · Không dùng mẫu'}
                    </small>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <input
              className="field"
              value={comment}
              placeholder="Ví dụ: Shop ơi giá bao nhiêu vậy?"
              onChange={(e) => setComment(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') sendTest(); }}
            />
            <button type="button" className="button button-primary" onClick={sendTest} disabled={testing}>
              <Send size={15} /> Gửi
            </button>
          </div>
        </div>
      </section>
    </>
  );
}

export default function CommentAiSettingsPage() {
  return (
    <CommentAiShell title="AI Bình luận">
      {(pageId) => <SettingsPanel key={pageId} pageId={pageId} />}
    </CommentAiShell>
  );
}
