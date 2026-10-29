import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Lightbulb, Loader2, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import messengerApi from '../../services/messengerApi';

const VARIABLES = [
  { token: '{ten_khach}', label: 'Tên khách' },
  { token: '{ten_page}', label: 'Tên Fanpage' }
];
const DEFAULT_LIMITS = { items: 4, question: 80, answer: 1000 };

function errorText(err, fallback) {
  return err.response?.data?.message || err.message || fallback;
}

const itemsFromPage = (page) => (page?.iceBreakers?.items || []).map((item) => ({ question: item.question || '', answer: item.answer || '' }));
const formatTime = (iso) => (iso ? new Date(iso).toLocaleString('vi-VN') : '');

/**
 * Câu hỏi gợi ý (Ice Breakers) hiện trong Messenger khi khách mở đoạn chat mới với Fanpage.
 * Mỗi câu có thể kèm câu trả lời tự động; lưu xong tool đẩy ngay lên Messenger của Fanpage.
 */
export default function IceBreakersModal({ onClose, onSaved }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [items, setItems] = useState([]);
  const [applyAll, setApplyAll] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [live, setLive] = useState(null); // { loading } | { ok, questions, hasGetStarted } | { ok: false, message }

  const load = useCallback(async (keepSelection) => {
    setLoading(true);
    try {
      const res = await messengerApi.iceBreakers();
      setData(res);
      const pages = res.pages || [];
      const target = pages.find((page) => page.id === keepSelection) || pages[0] || null;
      setSelectedId(target?.id || null);
      setItems(itemsFromPage(target));
      setError('');
    } catch (err) {
      setError(errorText(err, 'Không tải được câu hỏi gợi ý.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(null);
  }, [load]);

  useEffect(() => {
    const handleKey = (event) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const pages = data?.pages || [];
  const limits = data?.limits || DEFAULT_LIMITS;
  const selectedPage = pages.find((page) => page.id === selectedId) || null;
  const config = selectedPage?.iceBreakers || {};

  const selectPage = (page) => {
    setSelectedId(page.id);
    setItems(itemsFromPage(page));
    setLive(null);
    setError('');
  };

  const updateItem = (index, patch) => setItems((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  const removeItem = (index) => setItems((current) => current.filter((_, i) => i !== index));
  const addItem = () => setItems((current) => (current.length >= limits.items ? current : [...current, { question: '', answer: '' }]));
  const usePreset = (preset) => setItems(preset.items.slice(0, limits.items).map((item) => ({ ...item })));
  const insertVariable = (index, token) => updateItem(index, { answer: `${items[index].answer || ''}${token}`.slice(0, limits.answer) });

  const checkLive = async () => {
    if (!selectedPage) return;
    setLive({ loading: true });
    try {
      setLive(await messengerApi.liveIceBreakers(selectedPage.id));
    } catch (err) {
      setLive({ ok: false, message: errorText(err, 'Không kiểm tra được trên Facebook.') });
    }
  };

  const save = async (nextItems) => {
    if (!selectedPage) return;
    setSaving(true);
    setError('');
    try {
      const res = await messengerApi.saveIceBreakers({
        pageIds: applyAll ? pages.map((page) => page.id) : [selectedPage.id],
        items: nextItems
      });
      await load(selectedPage.id);
      setLive(null);
      onSaved?.(res.message);
    } catch (err) {
      // Tải lại trước (máy chủ có thể đã lưu câu hỏi kèm lỗi áp dụng) rồi mới hiện lỗi, để lỗi không bị xóa
      const message = errorText(err, 'Không lưu được câu hỏi gợi ý.');
      await load(selectedPage.id).catch(() => {});
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const removeAll = () => {
    if (!confirm('Gỡ hết câu hỏi gợi ý khỏi Messenger của Fanpage này?')) return;
    save([]);
  };

  const filled = items.filter((item) => item.question.trim());

  return createPortal(
    <div className="um-modal-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="panel modal-card ar-modal" role="dialog" aria-modal="true" aria-label="Câu hỏi gợi ý trong Messenger">
        <div className="panel-heading">
          <div className="ar-title">
            <span className="ar-title-icon"><Lightbulb size={18} /></span>
            <div>
              <h2>Câu hỏi gợi ý trong Messenger</h2>
              <small className="muted">Khách mở đoạn chat với Fanpage sẽ thấy sẵn các câu này để bấm — như “Tôi muốn mua hàng”, “Tôi cần hỗ trợ”.</small>
            </div>
          </div>
          <button type="button" className="um-icon-btn" onClick={onClose} aria-label="Đóng"><X size={16} /></button>
        </div>

        {loading && !data ? (
          <div className="inbox-placeholder"><Loader2 size={18} className="spin" /> Đang tải…</div>
        ) : !pages.length ? (
          <div className="inbox-placeholder">Chưa có Fanpage nào được kết nối.</div>
        ) : (
          <div className="ar-body">
            <nav className="ar-pages" aria-label="Chọn Fanpage">
              {pages.map((page) => {
                const count = page.iceBreakers?.appliedAt ? page.iceBreakers.items.length : 0;
                return (
                  <button type="button" key={page.id} className={`ar-page${page.id === selectedId ? ' is-active' : ''}`} onClick={() => selectPage(page)}>
                    <span className="ar-page-name"><strong>{page.name}</strong></span>
                    <span className={`ar-state${count ? ' is-on' : ''}`}>{count ? `${count} câu` : 'Chưa có'}</span>
                  </button>
                );
              })}
            </nav>

            {selectedPage && (
              <div className="ar-form">
                <div className={`ib-status${config.appliedAt && config.items?.length ? ' is-on' : ''}${config.applyError ? ' is-error' : ''}`}>
                  {config.applyError
                    ? <><AlertTriangle size={15} /> <span>Lần lưu trước chưa áp dụng được lên Messenger: {config.applyError}</span></>
                    : config.appliedAt && config.items?.length
                      ? <><CheckCircle2 size={15} /> <span>Đang hiện {config.items.length} câu hỏi trên Messenger của “{selectedPage.name}” (áp dụng lúc {formatTime(config.appliedAt)}).</span></>
                      : <><Lightbulb size={15} /> <span>“{selectedPage.name}” chưa có câu hỏi gợi ý trên Messenger.</span></>}
                  <button type="button" className="button button-quiet ib-live-btn" onClick={checkLive} disabled={live?.loading}>
                    {live?.loading ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />} Kiểm tra trên Facebook
                  </button>
                </div>
                {live && !live.loading && (
                  live.ok ? (
                    <div className="ib-live">
                      <strong>Facebook đang hiện:</strong>{' '}
                      {live.questions.length ? live.questions.map((question) => <span key={question} className="ib-live-chip">{question}</span>) : 'chưa có câu hỏi gợi ý nào.'}
                      {live.hasGetStarted && <small className="ib-live-warn"><AlertTriangle size={13} /> Fanpage đang có nút “Bắt đầu” (Get Started): Facebook chỉ hiện một trong hai, có thể khách không thấy câu hỏi gợi ý.</small>}
                    </div>
                  ) : <div className="inbox-send-error"><AlertTriangle size={14} /> {live.message}</div>
                )}

                <div className="ib-presets">
                  <span className="field-label">Dùng mẫu có sẵn</span>
                  <div className="ar-chips">
                    {(data.presets || []).map((preset) => (
                      <button type="button" key={preset.key} className="ar-chip" onClick={() => usePreset(preset)}>{preset.label}</button>
                    ))}
                  </div>
                </div>

                <ol className="ib-items">
                  {items.map((item, index) => (
                    <li key={index} className="ib-item">
                      <div className="ib-item-head">
                        <label className="field-label" htmlFor={`ib-q-${index}`}>Câu hỏi {index + 1}</label>
                        <button type="button" className="um-icon-btn" onClick={() => removeItem(index)} aria-label={`Xóa câu hỏi ${index + 1}`}><Trash2 size={14} /></button>
                      </div>
                      <input
                        id={`ib-q-${index}`}
                        className="field"
                        maxLength={limits.question}
                        placeholder="VD: Tôi muốn mua hàng"
                        value={item.question}
                        onChange={(event) => updateItem(index, { question: event.target.value })}
                      />
                      <small className="ar-counter">{item.question.length}/{limits.question}</small>
                      <div className="ar-label-row">
                        <label className="field-label" htmlFor={`ib-a-${index}`}>Tool tự trả lời (không bắt buộc)</label>
                        <span className="ar-vars">
                          {VARIABLES.map((variable) => (
                            <button type="button" key={variable.token} className="ar-var" onClick={() => insertVariable(index, variable.token)} title={`Chèn ${variable.label}`}>{variable.token}</button>
                          ))}
                        </span>
                      </div>
                      <textarea
                        id={`ib-a-${index}`}
                        className="field"
                        rows={2}
                        maxLength={limits.answer}
                        placeholder="Để trống: tin của khách vào hộp thư như bình thường (nhân viên hoặc Trả lời tự động xử lý)"
                        value={item.answer}
                        onChange={(event) => updateItem(index, { answer: event.target.value })}
                      />
                    </li>
                  ))}
                </ol>
                <button type="button" className="button button-secondary ib-add" onClick={addItem} disabled={items.length >= limits.items}>
                  <Plus size={15} /> {items.length >= limits.items ? `Đã đủ ${limits.items} câu (tối đa của Facebook)` : 'Thêm câu hỏi'}
                </button>

                <ul className="ar-rules">
                  <li>Câu hỏi hiện khi khách mở đoạn chat <strong>mới</strong> với Fanpage; khách bấm câu nào thì câu đó gửi vào hộp thư như tin của khách.</li>
                  <li>Câu có “Tool tự trả lời” được trả lời ngay, kể cả khi chưa bật Trả lời tự động cho mọi tin.</li>
                  <li>Meta App đang ở chế độ <strong>Phát triển</strong> thì chỉ người có vai trò trong app mới thấy câu gợi ý — phát hành app (Live) để mọi khách đều thấy.</li>
                  <li>Facebook cho tối đa {limits.items} câu, mỗi câu tối đa {limits.question} ký tự; hiện áp dụng cho Messenger (chưa áp dụng Instagram).</li>
                </ul>

                {pages.length > 1 && (
                  <label className="ar-apply-all">
                    <input type="checkbox" checked={applyAll} onChange={(event) => setApplyAll(event.target.checked)} />
                    Áp dụng bộ câu hỏi này cho tất cả {pages.length} Fanpage
                  </label>
                )}
                {error && <div className="inbox-send-error"><AlertTriangle size={14} /> {error}</div>}
              </div>
            )}
          </div>
        )}

        <div className="ar-footer">
          <span className="muted">{filled.length ? `${filled.length}/${limits.items} câu hỏi` : ''}</span>
          <div className="ar-footer-actions">
            <button type="button" className="button button-secondary" onClick={onClose} disabled={saving}>Đóng</button>
            {(config.appliedAt || config.items?.length > 0) && (
              <button type="button" className="button button-secondary" onClick={removeAll} disabled={saving}>Gỡ khỏi Messenger</button>
            )}
            <button type="button" className="button button-primary" onClick={() => save(items)} disabled={saving || !selectedPage || !filled.length}>
              {saving ? <Loader2 size={15} className="spin" /> : <CheckCircle2 size={15} />} Lưu &amp; áp dụng lên Messenger
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
