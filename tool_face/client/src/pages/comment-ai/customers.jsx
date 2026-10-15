import { useCallback, useEffect, useRef, useState } from 'react';
import { Search, Trash2 } from 'lucide-react';
import CommentAiShell, { Notice, SENTIMENT_LABEL, formatTime } from '../../components/comment-ai/CommentAiShell';
import commentAiApi, { apiMessage } from '../../services/commentAiApi';
import useAuth from '../../hooks/useAuth';

const tagsOf = (c) => String(c.tags || '').split(',').map((x) => x.trim()).filter(Boolean);

function CustomerDetail({ pageId, id, isAdmin, onChanged }) {
  const [customer, setCustomer] = useState(null);
  const [form, setForm] = useState({ phone: '', address: '', tags: '', note: '' });
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    let cancelled = false;
    commentAiApi.getCustomer(pageId, id)
      .then((res) => {
        if (cancelled) return;
        setCustomer(res.customer);
        setForm({ phone: res.customer.phone, address: res.customer.address, tags: res.customer.tags, note: res.customer.note });
      })
      .catch((err) => { if (!cancelled) setNotice({ type: 'error', text: apiMessage(err, 'Không tải được hồ sơ.') }); });
    return () => { cancelled = true; };
  }, [pageId, id]);

  const save = async () => {
    try {
      await commentAiApi.updateCustomer(pageId, id, form);
      setNotice({ type: 'success', text: 'Đã lưu hồ sơ.' });
      onChanged();
    } catch (err) {
      setNotice({ type: 'error', text: apiMessage(err, 'Không lưu được hồ sơ.') });
    }
  };

  const remove = async () => {
    if (!window.confirm('Xóa hồ sơ khách này?')) return;
    try {
      await commentAiApi.deleteCustomer(pageId, id);
      onChanged();
    } catch (err) {
      setNotice({ type: 'error', text: apiMessage(err, 'Không xóa được hồ sơ.') });
    }
  };

  if (!customer) return <div style={{ padding: '10px 0' }}><Notice notice={notice} /><span className="muted">Đang tải...</span></div>;

  return (
    <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
      <Notice notice={notice} />
      <input className="field" placeholder="Số điện thoại" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
      <input className="field" placeholder="Địa chỉ" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
      <input className="field" placeholder="Thẻ, cách nhau dấu phẩy (ví dụ: VIP, Khách quen)" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
      <textarea className="field" rows={2} placeholder="Ghi chú" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="button button-primary" onClick={save}>Lưu hồ sơ</button>
        {isAdmin && <button type="button" className="button button-danger" onClick={remove}><Trash2 size={14} /> Xóa khách</button>}
        {customer.updatedBy && <small className="muted">Sửa bởi {customer.updatedBy}</small>}
      </div>
      <div>
        <b>Lịch sử bình luận</b>
        {customer.history.length === 0 && <div className="muted">Chưa có.</div>}
        {customer.history.map((h) => (
          <div key={h.id} style={{ marginTop: 8 }}>
            <small className="muted">{formatTime(h.created_at)}{h.sentiment ? ` · ${SENTIMENT_LABEL[h.sentiment] || ''}` : ''}</small>
            <div>{h.message}</div>
            {h.reply && <div style={{ color: 'var(--blue)' }}>↳ {h.reply}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function CustomersPanel({ pageId }) {
  const { user } = useAuth();
  const [customers, setCustomers] = useState([]);
  const [allTags, setAllTags] = useState([]);
  const [q, setQ] = useState('');
  const [tag, setTag] = useState('');
  const [openId, setOpenId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState(null);
  const timer = useRef(null);

  const load = useCallback(async (query, tagFilter) => {
    try {
      const res = await commentAiApi.listCustomers(pageId, { q: query, tag: tagFilter });
      setCustomers(res.customers || []);
      if (!query && !tagFilter) {
        setAllTags([...new Set((res.customers || []).flatMap(tagsOf))].sort());
      }
    } catch (err) {
      setNotice({ type: 'error', text: apiMessage(err, 'Không tải được danh sách khách hàng.') });
    } finally {
      setLoading(false);
    }
  }, [pageId]);

  useEffect(() => { load('', ''); }, [load]);

  const onSearch = (value) => {
    setQ(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => load(value.trim(), tag), 300);
  };

  const onTag = (value) => {
    setTag(value);
    load(q.trim(), value);
  };

  return (
    <>
      <Notice notice={notice} />
      <section className="panel">
        <div className="panel-heading"><h2>Khách hàng ({customers.length})</h2></div>
        <div className="panel-body">
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
            <div style={{ position: 'relative', flex: '2 1 220px' }}>
              <Search size={15} style={{ position: 'absolute', left: 10, top: 12 }} aria-hidden="true" />
              <input className="field" style={{ paddingLeft: 32 }} placeholder="Tìm theo tên, SĐT, địa chỉ, thẻ..." value={q} onChange={(e) => onSearch(e.target.value)} />
            </div>
            <select className="field" style={{ flex: '1 1 140px' }} value={tag} onChange={(e) => onTag(e.target.value)} aria-label="Lọc theo thẻ">
              <option value="">Mọi thẻ</option>
              {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <p className="muted" style={{ margin: '0 0 12px', fontSize: 13 }}>Hồ sơ tự tạo khi khách bình luận. AI tự gắn thẻ theo cảm xúc (Hỏi mua, Phàn nàn, Khen) và lưu số điện thoại nếu khách để lại trong bình luận.</p>
          {loading && <span className="muted">Đang tải...</span>}
          {!loading && customers.length === 0 && <span className="muted">Chưa có khách hàng nào.</span>}
          {customers.map((c) => (
            <div key={c.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <div>
                  <b>{c.name || '(không tên)'}</b>{' '}
                  {tagsOf(c).map((t) => <span key={t} className="status-pill publishing" style={{ marginRight: 4 }}>{t}</span>)}
                  <small className="muted" style={{ display: 'block' }}>
                    {c.phone ? `SĐT ${c.phone} · ` : ''}{c.commentCount} bình luận
                    {c.lastSentiment ? ` · gần nhất: ${SENTIMENT_LABEL[c.lastSentiment] || ''}` : ''}
                    {c.lastCommentAt ? ` · ${formatTime(c.lastCommentAt)}` : ''}
                  </small>
                </div>
                <button type="button" className="button button-secondary" onClick={() => setOpenId(openId === c.id ? null : c.id)}>
                  {openId === c.id ? 'Đóng' : 'Chi tiết'}
                </button>
              </div>
              {openId === c.id && (
                <CustomerDetail
                  pageId={pageId}
                  id={c.id}
                  isAdmin={user?.role === 'admin'}
                  onChanged={() => { setOpenId(null); load(q.trim(), tag); }}
                />
              )}
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

export default function CommentAiCustomersPage() {
  return (
    <CommentAiShell title="Khách hàng">
      {(pageId) => <CustomersPanel key={pageId} pageId={pageId} />}
    </CommentAiShell>
  );
}
