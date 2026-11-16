import { useCallback, useEffect, useState } from 'react';
import { Check, Edit2, Plus, Save, Sparkles, Trash2, X } from 'lucide-react';
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
const SHOP_VARS = VARS.filter(([key]) => key !== 'ten');

const EMPTY_FORM = { name: '', keywords: '', content: '', mode: 'guided' };
const PREFILL_KEY = 'commentAiPrefill';

function TemplatesPanel({ pageId }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [templates, setTemplates] = useState([]);
  const [settings, setSettings] = useState(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [requireApproval, setRequireApproval] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState(null);

  const load = useCallback(async () => {
    try {
      const [list, settings] = await Promise.all([commentAiApi.listTemplates(pageId), commentAiApi.getSettings(pageId)]);
      setTemplates(list.templates || []);
      setSettings(settings.settings);
      setRequireApproval(Boolean(settings.settings?.requireApproval));
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

  const saveSettings = async () => {
    if (!settings) return;
    setSavingSettings(true);
    setNotice(null);
    try {
      const res = await commentAiApi.saveSettings(pageId, settings);
      setSettings(res.settings);
      setRequireApproval(Boolean(res.settings?.requireApproval));
      setNotice({ type: 'success', text: 'Đã lưu hướng dẫn AI và biến dùng trong mẫu.' });
    } catch (err) {
      setNotice({ type: 'error', text: apiMessage(err, 'Không lưu được hướng dẫn và biến.') });
    } finally {
      setSavingSettings(false);
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
    setForm({ name: t.name, keywords: t.keywords || '', content: t.content, mode: t.mode });
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
    setForm({ name: s.name, keywords: s.keywords, content: s.content, mode: 'guided' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const active = templates.filter((t) => t.status === 'approved' && t.active);
  const unused = active.filter((t) => !t.uses).length;

  return (
    <>
      <Notice notice={notice} />

      <section className="panel" style={{ marginBottom: 18 }}>
        <div className="panel-heading"><h2>Hướng dẫn AI và biến dùng trong mẫu</h2></div>
        <div className="panel-body" style={{ display: 'grid', gap: 14 }}>
          <div>
            <label className="field-label" htmlFor="ai-tone">Giọng điệu và quy tắc trả lời</label>
            <textarea id="ai-tone" className="field" rows={3} value={settings?.tone || ''} onChange={(e) => setSettings({ ...settings, tone: e.target.value })} />
          </div>
          <div>
            <label className="field-label" htmlFor="ai-shop">Thông tin cửa hàng (AI chỉ được dùng thông tin này, không tự bịa giá hay địa chỉ)</label>
            <textarea id="ai-shop" className="field" rows={4} value={settings?.shop || ''} onChange={(e) => setSettings({ ...settings, shop: e.target.value })} placeholder="Ví dụ: Shop bán hoa tươi. Giao nội thành trong 2 giờ. Giá bó hoa từ 250.000đ..." />
          </div>
          <div>
            <h3 style={{ margin: '4px 0 0' }}>Biến dùng trong mẫu</h3>
            <p className="muted" style={{ margin: 0 }}>Nhập một lần để tự áp dụng cho mọi mẫu. Hướng dẫn chỉ dùng khi bật AI; khi tắt AI, mẫu được gửi sau khi thay biến. Mẫu có biến chưa nhập sẽ được bỏ qua, tránh đăng nội dung còn dấu ngoặc lên Facebook.</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
              {SHOP_VARS.map(([key, label]) => (
                <div key={key}>
                  <label className="field-label" htmlFor={`var-${key}`}>{label}</label>
                  <input
                    id={`var-${key}`}
                    className="field"
                    value={settings?.vars?.[key] || ''}
                    onChange={(e) => setSettings({ ...settings, vars: { ...settings?.vars, [key]: e.target.value } })}
                  />
                </div>
              ))}
            </div>
          </div>
          <div>
            <button type="button" className="button button-primary" onClick={saveSettings} disabled={savingSettings || !settings}>
              <Save size={15} /> {savingSettings ? 'Đang lưu...' : 'Lưu hướng dẫn và biến'}
            </button>
          </div>
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
                <span className="status-pill publishing">{t.mode === 'exact' ? 'Nguyên văn' : 'AI viết lại khi bật AI'}</span>{' '}
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
