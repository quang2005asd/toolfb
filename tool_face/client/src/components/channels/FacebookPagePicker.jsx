import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Check, Loader2, Search, X } from 'lucide-react';
import channelApi from '../../services/channelApi';

/**
 * "Bạn muốn thêm những Fanpage nào?" — danh sách Fanpage nick đang quản lý trên Facebook.
 * Fanpage bỏ chọn bị gỡ khỏi tool và không tự thêm lại khi gia hạn token; có thể chọn lại bất cứ lúc nào.
 * account: { id, name } nick Facebook; onSaved(result) sau khi lưu
 */
export default function FacebookPagePicker({ account, onSaved, onClose }) {
  const [pages, setPages] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const saveRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const accountId = account?.id || null;

  useEffect(() => {
    if (!accountId) return undefined;
    let cancelled = false;
    setPages(null);
    setLoadError('');
    setSaveError('');
    channelApi.accountPages(accountId)
      .then((res) => {
        if (cancelled) return;
        const list = res.pages || [];
        setPages(list);
        // Mặc định: giữ Fanpage đang dùng; lần đầu (chưa có Fanpage nào trong tool) thì chọn tất cả
        const connected = list.filter((page) => page.connected);
        setSelected(new Set((connected.length ? connected : list).map((page) => page.id)));
      })
      .catch((err) => { if (!cancelled) setLoadError(err.response?.data?.message || 'Không đọc được danh sách Fanpage từ Facebook.'); });
    return () => { cancelled = true; };
  }, [accountId]);

  useEffect(() => {
    if (!accountId) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') onCloseRef.current(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [accountId]);

  const visible = useMemo(() => {
    const text = query.trim().toLowerCase();
    if (!pages || !text) return pages || [];
    return pages.filter((page) => page.name.toLowerCase().includes(text) || page.id.includes(text));
  }, [pages, query]);

  if (!accountId || typeof document === 'undefined') return null;

  const total = pages?.length || 0;
  const allSelected = total > 0 && selected.size === total;
  const toggle = (id) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set((pages || []).map((page) => page.id)));

  const save = async () => {
    setSaving(true);
    setSaveError('');
    try {
      const res = await channelApi.saveAccountPages(accountId, [...selected]);
      onSaved?.(res);
    } catch (err) {
      setSaveError(err.response?.data?.message || 'Không lưu được lựa chọn.');
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fb-guide-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="fb-guide-dialog fb-page-picker" role="dialog" aria-modal="true" aria-labelledby="fb-page-picker-title">
        <div className="fb-guide-head">
          <h2 id="fb-page-picker-title">Bạn muốn thêm những Fanpage nào?</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Đóng"><X size={17} /></button>
        </div>
        <div className="fb-guide-body">
          <p className="fb-login-lead">
            Fanpage của nick <em>{account.name || account.id}</em>. Bỏ chọn Fanpage bạn không muốn quản lý trong tool — có thể chọn lại bất cứ lúc nào ở tab Tài khoản Facebook.
          </p>
          {loadError && (
            <div className="fb-login-cause is-main" role="alert">
              <strong><AlertTriangle size={14} aria-hidden="true" /> {loadError}</strong>
            </div>
          )}
          {!pages && !loadError && (
            <p className="fb-page-picker-loading"><Loader2 size={16} className="spin" aria-hidden="true" /> Đang đọc danh sách Fanpage từ Facebook…</p>
          )}
          {pages && total === 0 && (
            <div className="fb-login-cause">
              <strong>Nick này chưa cấp quyền Fanpage nào cho tool</strong>
              <span>Kết nối lại Facebook và tích chọn Fanpage ở bước Facebook hỏi quyền.</span>
            </div>
          )}
          {pages && total > 0 && (
            <>
              <div className="fb-page-picker-toolbar">
                <label className="fb-page-picker-all">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                  <span>Chọn tất cả</span>
                </label>
                {total > 6 && (
                  <label className="fb-page-picker-search">
                    <Search size={14} aria-hidden="true" />
                    <input className="field" type="search" placeholder="Tìm Fanpage" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Tìm Fanpage" />
                  </label>
                )}
              </div>
              <ul className="fb-page-picker-list">
                {visible.map((page) => (
                  <li key={page.id}>
                    <label className={selected.has(page.id) ? 'is-selected' : ''}>
                      {page.picture
                        ? <img src={page.picture} alt="" width={36} height={36} />
                        : <span className="fb-page-picker-initial" aria-hidden="true">{(page.name || '?').charAt(0).toUpperCase()}</span>}
                      <span className="fb-page-picker-name">
                        <strong>{page.name}</strong>
                        <small>{page.category ? `${page.category} · ` : ''}ID {page.id}{page.connected ? ' · đang dùng' : ''}</small>
                      </span>
                      <input type="checkbox" checked={selected.has(page.id)} onChange={() => toggle(page.id)} aria-label={`Chọn ${page.name}`} />
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}
          {saveError && <p className="fb-own-app-result is-error" role="alert"><AlertTriangle size={14} aria-hidden="true" /> {saveError}</p>}
        </div>
        <div className="fb-login-actions fb-page-picker-actions">
          <span className="fb-page-picker-count">{pages ? `Đã chọn ${selected.size}/${total} Fanpage` : ''}</span>
          <button type="button" className="button button-quiet" onClick={onClose}>Để sau</button>
          <button ref={saveRef} type="button" className="button button-primary" onClick={save} disabled={!pages || saving || Boolean(loadError)}>
            {saving ? <Loader2 size={15} className="spin" /> : <Check size={15} />} {saving ? 'Đang lưu…' : 'Lưu lựa chọn'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
