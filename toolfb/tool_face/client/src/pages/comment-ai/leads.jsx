import { useCallback, useEffect, useRef, useState } from 'react';
import { ExternalLink, RefreshCw, Search } from 'lucide-react';
import CommentAiShell, { Notice, formatTime } from '../../components/comment-ai/CommentAiShell';
import commentAiApi, { apiMessage } from '../../services/commentAiApi';
import useAuth from '../../hooks/useAuth';

const CAT_LABEL = { buyer: 'Người mua', seller: 'Người bán', unknown: 'Chưa xác định' };
const STATUS_LABEL = { new: 'Mới', contacted: 'Đã liên hệ', skipped: 'Bỏ qua' };
const STATUS_PILL = { new: 'pending', contacted: 'published', skipped: 'failed' };
const PAGE_SIZE = 50;

function LeadRow({ lead, pageId, templateId, user, onUpdate, onRemove, setNotice }) {
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState('');
  const long = lead.content.length > 240;

  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); } catch { /* người dùng có thể copy thủ công trong ô soạn */ }
  };

  const makeDraft = async (tpl) => {
    setBusy(tpl ? 'tpl' : 'ai');
    try {
      const res = await commentAiApi.draftLeadReply(pageId, lead.id, tpl || undefined);
      setDraft(res);
      if (tpl) { await copy(res.reply); setNotice({ type: 'success', text: 'Đã sao chép, hãy dán vào bình luận.' }); }
    } catch (err) {
      setNotice({ type: 'error', text: apiMessage(err, 'Không soạn được câu trả lời.') });
    } finally {
      setBusy('');
    }
  };

  const useTemplate = () => {
    if (!templateId) {
      setNotice({ type: 'error', text: 'Hãy chọn một mẫu ở phía trên trước.' });
      return;
    }
    makeDraft(Number(templateId));
  };

  return (
    <div style={{ padding: '12px 0', borderBottom: '1px solid var(--line)' }}>
      <span className="status-pill publishing">{CAT_LABEL[lead.category]}</span>{' '}
      <span className={`status-pill ${STATUS_PILL[lead.status]}`}>{STATUS_LABEL[lead.status]}</span>
      {lead.assignedTo && <> <span className="status-pill publishing">Phụ trách: {lead.assignedTo}</span></>}
      <small className="muted" style={{ display: 'block' }}>
        {lead.groupId ? `Nhóm ${lead.groupId} · ` : ''}{formatTime(lead.postedAt)}{lead.updatedBy ? ` · sửa bởi ${lead.updatedBy}` : ''}
      </small>
      <div style={{ whiteSpace: 'pre-wrap' }}>
        {long && !expanded ? `${lead.content.slice(0, 240)}…` : lead.content}
        {long && (
          <button type="button" className="button button-quiet" style={{ minHeight: 24, marginLeft: 6 }} onClick={() => setExpanded(!expanded)}>
            {expanded ? 'Thu gọn' : 'Xem hết'}
          </button>
        )}
      </div>

      {draft && (
        <div style={{ marginTop: 8 }}>
          <textarea className="field" rows={3} value={draft.reply} onChange={(e) => setDraft({ ...draft, reply: e.target.value })} />
          <div style={{ display: 'flex', gap: 8, marginTop: 4, alignItems: 'center' }}>
            <button type="button" className="button button-primary" onClick={async () => { await copy(draft.reply); setNotice({ type: 'success', text: 'Đã sao chép.' }); }}>Sao chép</button>
            <small className="muted">{draft.template ? `Theo mẫu: ${draft.template}` : 'AI soạn'}</small>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
        {lead.postUrl && <a className="button button-secondary" href={lead.postUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={13} /> Mở bài</a>}
        {lead.profileUrl && <a className="button button-secondary" href={lead.profileUrl} target="_blank" rel="noopener noreferrer">Hồ sơ</a>}
        <button type="button" className="button button-secondary" onClick={useTemplate} disabled={busy === 'tpl'}>Sao chép mẫu</button>
        <button type="button" className="button button-secondary" onClick={() => makeDraft(null)} disabled={busy === 'ai'}>{busy === 'ai' ? 'Đang soạn...' : 'AI soạn'}</button>
        <button type="button" className="button button-secondary" onClick={() => onUpdate(lead.id, { assignedTo: user?.name || '' })}>Nhận xử lý</button>
        <button type="button" className="button button-secondary" onClick={() => onUpdate(lead.id, { status: 'contacted' })}>Đã liên hệ</button>
        <button type="button" className="button button-secondary" onClick={() => onUpdate(lead.id, { status: 'skipped' })}>Bỏ qua</button>
        <select className="field" style={{ width: 'auto', minHeight: 36 }} value={lead.category} onChange={(e) => onUpdate(lead.id, { category: e.target.value })} aria-label="Phân loại">
          {Object.entries(CAT_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
        {user?.role === 'admin' && <button type="button" className="button button-danger" onClick={() => onRemove(lead.id)}>Xóa</button>}
      </div>
    </div>
  );
}

function LeadsPanel({ pageId }) {
  const { user } = useAuth();
  const [category, setCategory] = useState('buyer');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [leads, setLeads] = useState([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState({ buyer: 0, seller: 0, unknown: 0 });
  const [templates, setTemplates] = useState([]);
  const [templateId, setTemplateId] = useState('');
  const [rules, setRules] = useState({ buyer: '', seller: '' });
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState(null);
  const timer = useRef(null);
  const fileInput = useRef(null);

  const load = useCallback(async (opts = {}) => {
    const cat = opts.category ?? category;
    const st = opts.status ?? status;
    const query = opts.q ?? q;
    const offset = opts.more ? leads.length : 0;
    try {
      const res = await commentAiApi.listLeads(pageId, { category: cat, status: st, q: query, offset, limit: PAGE_SIZE });
      setLeads((prev) => (opts.more ? [...prev, ...res.rows] : res.rows));
      setTotal(res.total);
      setCounts(res.counts);
    } catch (err) {
      setNotice({ type: 'error', text: apiMessage(err, 'Không tải được danh sách.') });
    } finally {
      setLoading(false);
    }
  }, [pageId, category, status, q, leads.length]);

  // Chỉ tải lại khi đổi Fanpage; các bộ lọc tự gọi load() khi người dùng thay đổi
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [pageId]);

  useEffect(() => {
    commentAiApi.listTemplates(pageId)
      .then((res) => setTemplates((res.templates || []).filter((t) => t.status === 'approved' && t.active)))
      .catch(() => {});
    commentAiApi.getLeadRules(pageId)
      .then((res) => setRules({ buyer: res.rules.buyer.join('\n'), seller: res.rules.seller.join('\n') }))
      .catch(() => {});
  }, [pageId]);

  const changeCategory = (cat) => { setCategory(cat); load({ category: cat }); };
  const changeStatus = (value) => { setStatus(value); load({ status: value }); };
  const onSearch = (value) => {
    setQ(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => load({ q: value.trim() }), 300);
  };

  const importFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setNotice(null);
    try {
      const res = await commentAiApi.importLeads(pageId, file);
      setNotice({ type: 'success', text: res.message });
      await load();
    } catch (err) {
      setNotice({ type: 'error', text: apiMessage(err, 'Không nhập được file.') });
    } finally {
      setImporting(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const update = async (id, body) => {
    try {
      await commentAiApi.updateLead(pageId, id, body);
      await load();
    } catch (err) {
      setNotice({ type: 'error', text: apiMessage(err, 'Không cập nhật được.') });
    }
  };

  const remove = async (id) => {
    if (!window.confirm('Xóa bài này?')) return;
    try {
      await commentAiApi.deleteLead(pageId, id);
      await load();
    } catch (err) {
      setNotice({ type: 'error', text: apiMessage(err, 'Không xóa được.') });
    }
  };

  const ruleAction = async (action) => {
    setNotice(null);
    try {
      const res = await action();
      setNotice({ type: 'success', text: res.message || 'Xong.' });
      await load();
    } catch (err) {
      setNotice({ type: 'error', text: apiMessage(err, 'Thao tác không thành công.') });
    }
  };

  const saveRules = () => ruleAction(() => commentAiApi.saveLeadRules(pageId, { buyer: rules.buyer, seller: rules.seller }));
  const resetRules = async () => {
    if (!window.confirm('Đặt lại quy tắc về mặc định?')) return;
    await ruleAction(async () => {
      const res = await commentAiApi.saveLeadRules(pageId, { reset: true });
      setRules({ buyer: res.rules.buyer.join('\n'), seller: res.rules.seller.join('\n') });
      return res;
    });
  };

  const allCount = counts.buyer + counts.seller + counts.unknown;

  return (
    <>
      <Notice notice={notice} />

      <section className="panel" style={{ marginBottom: 18 }}>
        <div className="panel-heading"><h2>Nhập bài từ nhóm</h2></div>
        <div className="panel-body">
          <p className="muted" style={{ marginTop: 0 }}>Nhập file Excel/CSV các bài đã thu thập từ nhóm (cột: Dấu thời gian, Groups, Contents, Link Posts, Link Profiles). Hệ thống tự phân loại Người mua / Người bán và bỏ qua bài trùng link. Team mở bài, bình luận bằng mẫu hoặc câu AI soạn rồi đánh dấu đã liên hệ. Tool không tự đăng bình luận vào nhóm.</p>
          <input ref={fileInput} type="file" accept=".xlsx,.xls,.csv" onChange={importFile} disabled={importing} className="field" />
          {importing && <small className="muted">Đang nhập file...</small>}
        </div>
      </section>

      <section className="panel" style={{ marginBottom: 18 }}>
        <div className="panel-body">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {[['buyer', counts.buyer], ['seller', counts.seller], ['unknown', counts.unknown], ['', allCount]].map(([cat, n]) => (
              <button key={cat || 'all'} type="button" className={`button ${category === cat ? 'button-primary' : 'button-secondary'}`} onClick={() => changeCategory(cat)}>
                {cat ? CAT_LABEL[cat] : 'Tất cả'} ({n})
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
            <div style={{ position: 'relative', flex: '2 1 220px' }}>
              <Search size={15} style={{ position: 'absolute', left: 10, top: 12 }} aria-hidden="true" />
              <input className="field" style={{ paddingLeft: 32 }} placeholder="Tìm trong nội dung, nhóm, ghi chú..." value={q} onChange={(e) => onSearch(e.target.value)} />
            </div>
            <select className="field" style={{ flex: '1 1 140px' }} value={status} onChange={(e) => changeStatus(e.target.value)} aria-label="Lọc trạng thái">
              <option value="">Mọi trạng thái</option>
              {Object.entries(STATUS_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
            <select className="field" style={{ flex: '1 1 200px' }} value={templateId} onChange={(e) => setTemplateId(e.target.value)} aria-label="Mẫu sao chép nhanh">
              <option value="">Mẫu để sao chép nhanh (chọn trước)</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>

          {loading && <span className="muted">Đang tải...</span>}
          {!loading && leads.length === 0 && <span className="muted">Chưa có bài nào. Hãy nhập file Excel ở trên.</span>}
          {leads.map((lead) => (
            <LeadRow key={lead.id} lead={lead} pageId={pageId} templateId={templateId} user={user} onUpdate={update} onRemove={remove} setNotice={setNotice} />
          ))}
          {leads.length < total && (
            <div style={{ marginTop: 12 }}>
              <button type="button" className="button button-secondary" onClick={() => load({ more: true })}>Xem thêm ({total - leads.length})</button>
            </div>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading"><h2>Quy tắc phân loại</h2></div>
        <div className="panel-body">
          <p className="muted" style={{ marginTop: 0 }}>Mỗi dòng là một cụm từ (không phân biệt hoa thường và dấu). Dùng <b>.*</b> làm ký tự đại diện, ví dụ <i>công ty .*chuyên</i>. Bài khớp &quot;Người bán&quot; được xếp trước, sau đó mới tới &quot;Người mua&quot;. Chỉ áp dụng cho Fanpage đang chọn.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
            <div>
              <label className="field-label" htmlFor="rules-buyer">Người mua</label>
              <textarea id="rules-buyer" className="field" rows={8} value={rules.buyer} onChange={(e) => setRules({ ...rules, buyer: e.target.value })} />
            </div>
            <div>
              <label className="field-label" htmlFor="rules-seller">Người bán</label>
              <textarea id="rules-seller" className="field" rows={8} value={rules.seller} onChange={(e) => setRules({ ...rules, seller: e.target.value })} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            <button type="button" className="button button-primary" onClick={saveRules}>Lưu quy tắc</button>
            <button type="button" className="button button-secondary" onClick={() => ruleAction(() => commentAiApi.reclassifyLeads(pageId, 'unknown'))}><RefreshCw size={14} /> Phân loại lại mục chưa xác định</button>
            <button type="button" className="button button-secondary" onClick={() => ruleAction(() => commentAiApi.aiClassifyLeads(pageId))}>AI phân loại 30 mục chưa xác định</button>
            <button type="button" className="button button-danger" onClick={resetRules}>Về mặc định</button>
          </div>
        </div>
      </section>
    </>
  );
}

export default function CommentAiLeadsPage() {
  return (
    <CommentAiShell title="Bài từ nhóm">
      {(pageId) => <LeadsPanel key={pageId} pageId={pageId} />}
    </CommentAiShell>
  );
}
