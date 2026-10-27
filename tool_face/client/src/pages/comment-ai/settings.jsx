import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Bot, RefreshCw, Save, Send, Sparkles } from 'lucide-react';
import CommentAiShell, { Notice, SENTIMENT_LABEL } from '../../components/comment-ai/CommentAiShell';
import commentAiApi, { apiMessage } from '../../services/commentAiApi';
import useAuth from '../../hooks/useAuth';

function SettingsPanel({ pageId }) {
  const { user } = useAuth();
  const canManageApproval = user?.role === 'admin' || user?.role === 'manager';
  const [settings, setSettings] = useState(null);
  const [defaultTone, setDefaultTone] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadingStudioTone, setLoadingStudioTone] = useState(false);
  const [notice, setNotice] = useState(null);
  const [comment, setComment] = useState('');
  const [chat, setChat] = useState([]);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    commentAiApi.getSettings(pageId)
      .then((res) => {
        if (!cancelled) {
          setSettings(res.settings);
          setDefaultTone(res.defaults?.tone || '');
        }
      })
      .catch((err) => { if (!cancelled) setNotice({ type: 'error', text: apiMessage(err, 'Không tải được cấu hình.') }); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [pageId]);

  useEffect(() => {
    const onMode = (e) => setSettings((prev) => (prev ? { ...prev, ...e.detail } : prev));
    window.addEventListener('commentAiMode', onMode);
    return () => window.removeEventListener('commentAiMode', onMode);
  }, []);

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

  const importStudioTone = async () => {
    if (settings.toneConfigured || (settings.tone?.trim() && settings.tone !== defaultTone)) {
      setNotice({ type: 'error', text: 'Ô giọng văn đã có nội dung; không ghi đè dữ liệu hiện tại.' });
      return;
    }
    setLoadingStudioTone(true);
    setNotice(null);
    try {
      const res = await commentAiApi.getStudioTone(pageId);
      if (!res.tone) {
        setNotice({ type: 'error', text: 'AI Studio chưa có giọng văn để lấy.' });
      } else {
        update({ tone: res.tone });
        setNotice({ type: 'success', text: 'Đã điền giọng văn từ AI Studio. Bạn có thể chỉnh sửa trước khi lưu.' });
      }
    } catch (err) {
      setNotice({ type: 'error', text: apiMessage(err, 'Không lấy được giọng văn từ AI Studio.') });
    } finally {
      setLoadingStudioTone(false);
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

  const commentReplyEnabled = settings.aiEnabled || settings.onlyTemplates;
  const replyStatus = settings.aiEnabled ? 'Đang bật' : settings.onlyTemplates ? 'Chỉ theo mẫu' : 'Đang tắt';

  return (
    <>
      <Notice notice={notice} />

      <section className="panel" style={{ marginBottom: 18 }}>
        <div className="panel-heading">
          <h2><Bot size={16} style={{ verticalAlign: 'middle', marginRight: 8 }} />Cài đặt trả lời của Fanpage này</h2>
          <span className={`status-pill ${commentReplyEnabled ? 'published' : 'pending'}`}>{replyStatus}</span>
        </div>
        <div className="panel-body" style={{ display: 'grid', gap: 12 }}>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>Cách trả lời (Tắt, Chỉ theo mẫu, AI tự trả lời) được chọn ở phía trên trang.</p>
          {canManageApproval && (
            <label className={`ar-toggle${settings.requireApproval ? ' is-on' : ''}`}>
              <span>
                <strong>Yêu cầu admin duyệt mẫu</strong>
                <small className="muted">Khi bật, mẫu do thành viên soạn chỉ được AI sử dụng sau khi admin duyệt.</small>
              </span>
              <input type="checkbox" role="switch" aria-label="Yêu cầu admin duyệt mẫu" checked={settings.requireApproval} onChange={(e) => update({ requireApproval: e.target.checked })} />
              <span className="ar-switch" aria-hidden="true" />
            </label>
          )}
          
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
              <label className="field-label" htmlFor="comment-ai-tone" style={{ margin: 0 }}>Giọng văn AI cho bình luận</label>
              <button
                type="button"
                className="button button-secondary"
                onClick={importStudioTone}
                disabled={loadingStudioTone || settings.toneConfigured || (Boolean(settings.tone?.trim()) && settings.tone !== defaultTone)}
              >
                <Sparkles size={14} /> {loadingStudioTone ? 'Đang lấy...' : 'Lấy giọng văn từ AI Studio'}
              </button>
            </div>
            <textarea
              id="comment-ai-tone"
              className="field"
              rows={3}
              value={settings.tone || ''}
              onChange={(e) => update({ tone: e.target.value })}
              placeholder="Mô tả giọng điệu và quy tắc trả lời bình luận..."
            />
            <small className="muted">Chỉ điền từ AI Studio khi ô này chưa có nội dung tùy chỉnh; bạn vẫn có thể sửa trước khi lưu.</small>
          </div>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            AI dùng nhà cung cấp, model và API Key đã cấu hình ở <Link href="/settings">Cài đặt</Link>.
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
        <Link href="/comment-ai/diagnostics" className="button button-secondary">Kiểm tra hệ thống</Link>
      </div>

      <section className="panel">
        <div className="panel-heading"><h2>Thử trả lời (không đăng lên Facebook)</h2></div>
        <div className="panel-body">
          <div style={{ display: 'grid', gap: 10, marginBottom: 14 }}>
            {chat.length === 0 && <span className="muted">Nhập một bình luận mẫu để xem AI sẽ trả lời thế nào. Cấu hình đang soạn trên màn hình được dùng ngay, không cần lưu trước.</span>}
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
    <CommentAiShell title="Cài đặt trả lời bình luận">
      {(pageId) => <SettingsPanel key={pageId} pageId={pageId} />}
    </CommentAiShell>
  );
}
