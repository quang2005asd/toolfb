import { useCallback, useEffect, useState } from 'react';
import { Check, Edit2, Plus, Sparkles, Trash2, X } from 'lucide-react';
import CommentAiShell, { Notice, formatTime } from '../../components/comment-ai/CommentAiShell';
import commentAiApi, { apiMessage } from '../../services/commentAiApi';
import useAuth from '../../hooks/useAuth';

const VARS = [
  ['ten', 'Tên khách'],
  ['ten_page', 'Tên Fanpage'],
  ['sdt_shop', 'SĐT shop'],
  ['dia_chi_shop', 'Địa chỉ'],
  ['website', 'Website'],
  ['gio_mo_cua', 'Giờ mở cửa']
];

const TEMPLATE_VARS = VARS.filter(([key]) => key !== 'ten');
const EMPTY_FORM = { name: '', keywords: '', content: '', mode: 'guided', aiInstruction: '', vars: {} };
const PREFILL_KEY = 'commentAiPrefill';

function TemplatesPanel({ pageId }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [templates, setTemplates] = useState([]);
  const [requireApproval, setRequireApproval] = useState(false);
  const [legacyVars, setLegacyVars] = useState({});
  const [legacyInstruction, setLegacyInstruction] = useState('');
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState(null);
  const [tryText, setTryText] = useState('');
  const [tryResult, setTryResult] = useState(null);
  const [trying, setTrying] = useState(false);

  const tryComment = async () => {
    const text = tryText.trim();
    if (!text) return;
    setTrying(true);
    try {
      setTryResult(await commentAiApi.preview(pageId, { comment: text }));
    } catch (err) {
      setTryResult({ error: apiMessage(err, 'Không thử được.') });
    } finally {
      setTrying(false);
    }
  };

  const load = useCallback(async () => {
    try {
      const [list, settings] = await Promise.all([commentAiApi.listTemplates(pageId), commentAiApi.getSettings(pageId)]);
      setTemplates(list.templates || []);
      setRequireApproval(Boolean(settings.settings?.requireApproval));
      setLegacyVars(settings.settings?.vars || {});
      setLegacyInstruction([
        settings.settings?.tone,
        settings.settings?.shop ? `Thông tin cửa hàng:\n${settings.settings.shop}` : ''
      ].filter(Boolean).join('\n'));
    } catch (err) {
      setNotice({ type: 'error', text: apiMessage(err, 'Không tải được danh sách mẫu.') });
    } finally {
      setLoading(false);
    }
  }, [pageId]);

  useEffect(() => { load(); }, [load]);

  // Nhận câu trả lời được chuyển từ trang Hoạt động ("Lưu thành mẫu")
  useEffect(() => {
    const raw = window.sessionStorage.getItem(PREFILL_KEY);
    if (!raw) return;
    window.sessionStorage.removeItem(PREFILL_KEY);
    try {
      const data = JSON.parse(raw);
      setForm({ ...EMPTY_FORM, name: data.name || '', content: data.content || '', keywords: data.keywords || '' });
    } catch { /* bỏ qua */ }
  }, []);

  const resetForm = () => { setForm(EMPTY_FORM); setEditingId(null); };

  const insertVar = (key) => {
    setForm((prev) => ({ ...prev, content: `${prev.content}{${key}}` }));
  };

  const submit = async () => {
    setSaving(true);
    setNotice(null);
    try {
      const res = editingId
        ? await commentAiApi.updateTemplate(pageId, editingId, form)
        : await commentAiApi.createTemplate(pageId, form);
      setNotice({ type: 'success', text: res.message || 'Đã lưu mẫu.' });
      resetForm();
      await load();
    } catch (err) {
      setNotice({ type: 'error', text: apiMessage(err, 'Không lưu được mẫu.') });
    } finally {
      setSaving(false);
    }
  };

  const run = async (action, okText) => {
    setNotice(null);
    try {
      await action();
      if (okText) setNotice({ type: 'success', text: okText });
      await load();
    } catch (err) {
      setNotice({ type: 'error', text: apiMessage(err, 'Thao tác không thành công.') });
    }
  };

  const startEdit = (t) => {
    setEditingId(t.id);
    setForm({
      ...EMPTY_FORM,
      name: t.name,
      keywords: t.keywords || '',
      content: t.content,
      mode: t.mode,
      aiInstruction: t.aiInstruction || legacyInstruction,
      vars: t.vars || legacyVars
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const reject = (t) => {
    const reason = window.prompt('Lý do từ chối (không bắt buộc):');
    if (reason === null) return;
    run(() => commentAiApi.rejectTemplate(pageId, t.id, reason), 'Đã từ chối mẫu.');
  };

  const remove = (t) => {
    if (!window.confirm(`Xóa mẫu "${t.name}"?`)) return;
    run(() => commentAiApi.deleteTemplate(pageId, t.id), 'Đã xóa mẫu.');
  };

  const suggest = async () => {
    setSuggesting(true);
    setNotice(null);
    try {
      setSuggestions(await commentAiApi.suggestTemplates(pageId));
    } catch (err) {
      setNotice({ type: 'error', text: apiMessage(err, 'AI không đề xuất được mẫu.') });
    } finally {
      setSuggesting(false);
    }
  };

  const useSuggestion = (s) => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, name: s.name, keywords: s.keywords, content: s.content, mode: 'guided' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const active = templates.filter((t) => t.status === 'approved' && t.active);
  const unused = active.filter((t) => !t.uses).length;

  return (
    <>
      <Notice notice={notice} />

      <section className="panel" style={{ marginBottom: 18 }}>
        <div className="panel-heading"><h2>Thử một bình luận</h2></div>
        <div className="panel-body">
          <div style={{ display: 'flex', gap: 10 }}>
            <input className="field" value={tryText} placeholder="Ví dụ: . hoặc giá bao nhiêu shop?" aria-label="Bình luận thử" onChange={(e) => setTryText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') tryComment(); }} />
            <button type="button" className="button button-primary" onClick={tryComment} disabled={trying}>{trying ? 'Đang thử...' : 'Thử'}</button>
          </div>
          {tryResult && (
            <div className="notice" style={{ marginTop: 10, whiteSpace: 'pre-wrap' }}>
              {tryResult.error || (tryResult.skipped ? `Sẽ bỏ qua: ${tryResult.reason}` : `${tryResult.template ? `Mẫu “${tryResult.template.name}” trả lời:` : 'AI trả lời:'}\n${tryResult.reply}`)}
            </div>
          )}
          <small className="muted">Chỉ xem thử, không đăng lên Facebook.</small>
        </div>
      </section>

      <section className="panel" style={{ marginBottom: 18 }}>
        <div className="panel-heading">
          <h2>{editingId ? 'Sửa mẫu trả lời' : 'Thêm mẫu trả lời'}</h2>
          {requireApproval && <span className="status-pill pending">Cần admin duyệt</span>}
        </div>
        <div className="panel-body" style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
            <div>
              <label className="field-label" htmlFor="tpl-name">Tên mẫu</label>
              <input id="tpl-name" className="field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ví dụ: Hỏi giá" />
            </div>
            <div>
              <label className="field-label" htmlFor="tpl-keywords">Từ khóa nhận biết (cách nhau dấu phẩy)</label>
              <input id="tpl-keywords" className="field" value={form.keywords} onChange={(e) => setForm({ ...form, keywords: e.target.value })} placeholder="giá, bao nhiêu" />
            </div>
          </div>
          <div>
            <label className="field-label" htmlFor="tpl-content">Nội dung mẫu</label>
            <textarea id="tpl-content" className="field" rows={4} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
              <small className="muted">Chèn biến:</small>
              {VARS.map(([key, label]) => (
                <button key={key} type="button" className="button button-quiet" style={{ minHeight: 28, fontSize: 12 }} onClick={() => insertVar(key)}>{label}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="field-label" htmlFor="tpl-instruction">Hướng dẫn riêng cho AI (không bắt buộc)</label>
            <textarea
              id="tpl-instruction"
              className="field"
              rows={3}
              maxLength={2000}
              value={form.aiInstruction}
              onChange={(e) => setForm({ ...form, aiInstruction: e.target.value })}
              placeholder="Ví dụ: Báo giá theo mẫu, hỏi khách muốn màu nào; không tự thêm khuyến mãi."
            />
          </div>
          <div>
            <span className="field-label">Giá trị biến cho mẫu này</span>
            <p className="muted" style={{ margin: '0 0 10px', fontSize: 13 }}>Các giá trị này được dùng chung khi AI trả lời bình luận và tin nhắn Inbox bằng mẫu.</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              {TEMPLATE_VARS.map(([key, label]) => (
                <div key={key}>
                  <label className="field-label" htmlFor={`tpl-var-${key}`}>{label}</label>
                  <input
                    id={`tpl-var-${key}`}
                    className="field"
                    value={form.vars?.[key] || ''}
                    onChange={(e) => setForm({ ...form, vars: { ...form.vars, [key]: e.target.value } })}
                  />
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <select className="field" style={{ width: 'auto' }} value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })} aria-label="Kiểu dùng mẫu">
              <option value="guided">AI viết lại theo ý mẫu</option>
              <option value="exact">Gửi đúng nguyên văn mẫu</option>
            </select>
            <button type="button" className="button button-primary" onClick={submit} disabled={saving}>
              <Plus size={15} /> {saving ? 'Đang lưu...' : (editingId ? 'Cập nhật mẫu' : 'Lưu mẫu')}
            </button>
            {editingId && <button type="button" className="button button-secondary" onClick={resetForm}>Hủy sửa</button>}
            <button type="button" className="button button-secondary" onClick={suggest} disabled={suggesting}>
              <Sparkles size={15} /> {suggesting ? 'AI đang phân tích...' : 'AI đề xuất mẫu từ lịch sử'}
            </button>
          </div>
        </div>
      </section>

      {suggestions && (
        <section className="panel" style={{ marginBottom: 18 }}>
          <div className="panel-heading">
            <h2>Đề xuất của AI (chưa lưu)</h2>
            <button type="button" className="button button-quiet" onClick={() => setSuggestions(null)}><X size={14} /> Đóng</button>
          </div>
          <div className="panel-body" style={{ display: 'grid', gap: 10 }}>
            <p className="muted" style={{ margin: 0 }}>AI đã đọc {suggestions.analyzed} bình luận gần đây.</p>
            {suggestions.suggestions.length === 0 && <span className="muted">AI chưa thấy nhóm câu hỏi nào lặp lại.</span>}
            {suggestions.suggestions.map((s, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 320px' }}>
                  <b>{s.name}</b> <span className="status-pill publishing">{s.count} bình luận</span>
                  <small className="muted" style={{ display: 'block' }}>Từ khóa: {s.keywords}</small>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{s.content}</div>
                  {s.examples.length > 0 && <small className="muted">Ví dụ: {s.examples.join(' | ')}</small>}
                </div>
                <button type="button" className="button button-secondary" onClick={() => useSuggestion(s)}>Dùng làm mẫu</button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="panel">
        <div className="panel-heading">
          <h2>Mẫu của Fanpage ({templates.length})</h2>
          {templates.length > 0 && <span className="muted" style={{ fontSize: 13 }}>{active.length} đang dùng{unused ? ` · ${unused} chưa được dùng lần nào` : ''}</span>}
        </div>
        <div className="panel-body" style={{ display: 'grid', gap: 12 }}>
          {loading && <span className="muted">Đang tải...</span>}
          {!loading && templates.length === 0 && <span className="muted">Chưa có mẫu nào.</span>}
          {templates.map((t) => (
            <div key={t.id} style={{ display: 'flex', gap: 12, justifyContent: 'space-between', flexWrap: 'wrap', paddingBottom: 12, borderBottom: '1px solid var(--line)' }}>
              <div style={{ flex: '1 1 320px' }}>
                <b>{t.name}</b>{' '}
                <span className="status-pill publishing">{t.mode === 'exact' ? 'Nguyên văn' : 'AI viết lại'}</span>{' '}
                {t.status === 'pending' && <span className="status-pill pending">Chờ duyệt</span>}
                {t.status === 'rejected' && <span className="status-pill failed">Bị từ chối</span>}
                {t.status === 'approved' && !t.active && <span className="status-pill failed">Đang tắt</span>}
                <small className="muted" style={{ display: 'block' }}>
                  {t.keywords ? `Từ khóa: ${t.keywords} · ` : ''}{t.createdBy || '?'} soạn · sửa bởi {t.updatedBy || '?'} · {formatTime(t.updatedAt)}
                  {t.status === 'approved' && t.approvedBy ? ` · duyệt bởi ${t.approvedBy}` : ''}
                </small>
                <small className="muted" style={{ display: 'block' }}>{t.uses ? `Đã dùng ${t.uses} lần · gần nhất ${formatTime(t.lastUsed)}` : 'Chưa dùng lần nào'}</small>
                <div style={{ whiteSpace: 'pre-wrap', marginTop: 4 }}>{t.content}</div>
                {t.status === 'rejected' && t.reviewNote && <div style={{ color: '#ef4444', marginTop: 4 }}>Lý do: {t.reviewNote}</div>}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                {isAdmin && t.status === 'pending' && (
                  <>
                    <button type="button" className="button button-primary" onClick={() => run(() => commentAiApi.approveTemplate(pageId, t.id), 'Đã duyệt mẫu.')}><Check size={14} /> Duyệt</button>
                    <button type="button" className="button button-danger" onClick={() => reject(t)}>Từ chối</button>
                  </>
                )}
                {t.status === 'approved' && (!requireApproval || isAdmin) && (
                  <button type="button" className="button button-secondary" onClick={() => run(() => commentAiApi.updateTemplate(pageId, t.id, { active: !t.active }))}>{t.active ? 'Tắt' : 'Bật'}</button>
                )}
                <button type="button" className="button button-secondary" onClick={() => startEdit(t)}><Edit2 size={14} /> Sửa</button>
                <button type="button" className="button button-danger" onClick={() => remove(t)}><Trash2 size={14} /> Xóa</button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

export default function CommentAiTemplatesPage() {
  return (
    <CommentAiShell title="Mẫu trả lời">
      {(pageId) => <TemplatesPanel key={pageId} pageId={pageId} />}
    </CommentAiShell>
  );
}
