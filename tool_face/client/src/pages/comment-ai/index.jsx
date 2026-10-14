import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Bot, RefreshCw, Save, Send } from 'lucide-react';
import CommentAiShell, { Notice, SENTIMENT_LABEL } from '../../components/comment-ai/CommentAiShell';
import commentAiApi, { apiMessage } from '../../services/commentAiApi';

const VARS = [
  ['ten_page', 'Tên Fanpage'],
  ['sdt_shop', 'SĐT / Zalo shop'],
  ['dia_chi_shop', 'Địa chỉ shop'],
  ['website', 'Website / link đặt hàng'],
  ['gio_mo_cua', 'Giờ mở cửa']
];

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
          <span className={`status-pill ${settings.aiEnabled ? 'published' : 'pending'}`}>{settings.aiEnabled ? 'Đang bật' : 'Đang tắt'}</span>
        </div>
        <div className="panel-body" style={{ display: 'grid', gap: 12 }}>
          <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input type="checkbox" checked={settings.aiEnabled} onChange={(e) => update({ aiEnabled: e.target.checked })} />
            <span><b>Tự động trả lời bình luận mới</b><small className="muted" style={{ display: 'block' }}>Mặc định tắt. Khi bật, AI chỉ trả lời các bình luận từ thời điểm bật trở đi.</small></span>
          </label>
          <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input type="checkbox" checked={settings.onlyTemplates} onChange={(e) => update({ onlyTemplates: e.target.checked })} />
            <span>Chỉ trả lời khi có mẫu phù hợp (bỏ qua bình luận còn lại)</span>
          </label>
          <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input type="checkbox" checked={settings.requireApproval} onChange={(e) => update({ requireApproval: e.target.checked })} />
            <span>Mẫu do thành viên soạn phải được admin duyệt mới dùng được</span>
          </label>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            AI dùng nhà cung cấp, model và API Key đã cấu hình ở <Link href="/settings">Cài đặt</Link>.
          </p>
        </div>
      </section>

      <section className="panel" style={{ marginBottom: 18 }}>
        <div className="panel-heading"><h2>Hướng dẫn cho AI</h2></div>
        <div className="panel-body" style={{ display: 'grid', gap: 14 }}>
          <div>
            <label className="field-label" htmlFor="ai-tone">Giọng điệu và quy tắc trả lời</label>
            <textarea id="ai-tone" className="field" rows={3} value={settings.tone} onChange={(e) => update({ tone: e.target.value })} />
          </div>
          <div>
            <label className="field-label" htmlFor="ai-shop">Thông tin cửa hàng (AI chỉ được dùng thông tin này, không tự bịa giá hay địa chỉ)</label>
            <textarea id="ai-shop" className="field" rows={5} value={settings.shop} onChange={(e) => update({ shop: e.target.value })} placeholder="Ví dụ: Shop bán hoa tươi. Giao nội thành trong 2 giờ. Giá bó hoa từ 250.000đ..." />
          </div>
        </div>
      </section>

      <section className="panel" style={{ marginBottom: 18 }}>
        <div className="panel-heading"><h2>Biến dùng trong mẫu</h2></div>
        <div className="panel-body">
          <p className="muted" style={{ marginTop: 0 }}>Nhập một lần, mọi mẫu tự cập nhật. Khi soạn mẫu, bấm nút chèn biến ở trang Mẫu trả lời. Mẫu dùng biến chưa nhập sẽ bị bỏ qua để không đăng chữ trống lên Facebook.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
            {VARS.map(([key, label]) => (
              <div key={key}>
                <label className="field-label" htmlFor={`var-${key}`}>{label}</label>
                <input
                  id={`var-${key}`}
                  className="field"
                  value={settings.vars?.[key] || ''}
                  onChange={(e) => update({ vars: { ...settings.vars, [key]: e.target.value } })}
                />
              </div>
            ))}
          </div>
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
    <CommentAiShell title="AI Bình luận">
      {(pageId) => <SettingsPanel key={pageId} pageId={pageId} />}
    </CommentAiShell>
  );
}
