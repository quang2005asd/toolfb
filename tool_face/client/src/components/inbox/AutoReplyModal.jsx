import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { AlertTriangle, Bot, CheckCircle2, Loader2, Play, Sparkles, X } from 'lucide-react';
import messengerApi from '../../services/messengerApi';
import PlatformIcon from '../PlatformIcon';

const VARIABLES = [
  { token: '{ten_khach}', label: 'Tên khách' },
  { token: '{ten_page}', label: 'Tên Fanpage' }
];
const MAX_TEMPLATE = 1000;
const MAX_INSTRUCTION = 1500;

function errorText(err, fallback) {
  return err.response?.data?.message || err.message || fallback;
}

function formFromPage(page, defaultTemplate) {
  const settings = page?.autoReply || {};
  return {
    enabled: Boolean(settings.enabled),
    platforms: settings.platforms?.length ? settings.platforms : ['messenger', 'instagram'],
    mode: settings.mode === 'ai' ? 'ai' : 'template',
    templateText: settings.templateText || defaultTemplate || '',
    aiInstruction: settings.aiInstruction || ''
  };
}

export default function AutoReplyModal({ onClose, onSaved }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(null);
  const [applyAll, setApplyAll] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [sampleText, setSampleText] = useState('shgagdwy');
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const templateRef = useRef(null);

  const load = useCallback(async (keepSelection) => {
    setLoading(true);
    try {
      const res = await messengerApi.autoReplySettings();
      setData(res);
      const pages = res.pages || [];
      const target = pages.find((page) => page.id === keepSelection) || pages[0] || null;
      setSelectedId(target?.id || null);
      setForm(target ? formFromPage(target, res.defaultTemplate) : null);
      setError('');
    } catch (err) {
      setError(errorText(err, 'Không tải được cài đặt trả lời tự động.'));
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
  const selectedPage = pages.find((page) => page.id === selectedId) || null;
  const hasInstagram = Boolean(selectedPage?.instagram);

  const selectPage = (page) => {
    setSelectedId(page.id);
    setForm(formFromPage(page, data?.defaultTemplate));
    setPreview(null);
    setError('');
  };

  const update = (patch) => setForm((current) => ({ ...current, ...patch }));

  const togglePlatform = (platform) => {
    setForm((current) => {
      const has = current.platforms.includes(platform);
      return { ...current, platforms: has ? current.platforms.filter((item) => item !== platform) : [...current.platforms, platform] };
    });
  };

  const insertVariable = (token) => {
    const area = templateRef.current;
    const text = form.templateText || '';
    const start = area ? area.selectionStart : text.length;
    const end = area ? area.selectionEnd : text.length;
    update({ templateText: `${text.slice(0, start)}${token}${text.slice(end)}`.slice(0, MAX_TEMPLATE) });
    requestAnimationFrame(() => {
      if (!area) return;
      area.focus();
      area.selectionStart = area.selectionEnd = start + token.length;
    });
  };

  const handlePreview = async () => {
    setPreviewing(true);
    setPreview(null);
    try {
      const res = await messengerApi.previewAutoReply({
        pageId: selectedId,
        mode: form.mode,
        templateText: form.templateText,
        aiInstruction: form.aiInstruction,
        sampleText
      });
      setPreview(res);
    } catch (err) {
      setPreview({ error: errorText(err, 'Không tạo được câu trả lời thử.') });
    } finally {
      setPreviewing(false);
    }
  };

  const handleSave = async () => {
    if (!selectedPage) return;
    setSaving(true);
    setError('');
    try {
      // Fanpage chưa liên kết Instagram vẫn lưu lựa chọn Instagram để tự áp dụng khi liên kết sau này
      const res = await messengerApi.saveAutoReply({
        pageIds: applyAll ? pages.map((page) => page.id) : [selectedPage.id],
        enabled: form.enabled,
        platforms: form.platforms,
        mode: form.mode,
        templateText: form.templateText,
        aiInstruction: form.aiInstruction
      });
      await load(selectedPage.id);
      onSaved?.(res.message);
    } catch (err) {
      setError(errorText(err, 'Không lưu được cài đặt.'));
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="um-modal-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="panel modal-card ar-modal" role="dialog" aria-modal="true" aria-label="Cài đặt trả lời tự động">
        <div className="panel-heading">
          <div className="ar-title">
            <span className="ar-title-icon"><Bot size={18} /></span>
            <div>
              <h2>Tự động trả lời tin nhắn</h2>
              <small className="muted">Trả lời mọi tin nhắn mới của khách — kể cả tin vô nghĩa như “shgagdwy”.</small>
            </div>
          </div>
          <button type="button" className="um-icon-btn" onClick={onClose} aria-label="Đóng"><X size={16} /></button>
        </div>

        {loading && !data ? (
          <div className="inbox-placeholder"><Loader2 size={18} className="spin" /> Đang tải cài đặt…</div>
        ) : !pages.length ? (
          <div className="inbox-placeholder">Chưa có Fanpage nào được kết nối.</div>
        ) : (
          <div className="ar-body">
            <nav className="ar-pages" aria-label="Chọn Fanpage">
              {pages.map((page) => (
                <button
                  type="button"
                  key={page.id}
                  className={`ar-page${page.id === selectedId ? ' is-active' : ''}`}
                  onClick={() => selectPage(page)}
                >
                  <span className="ar-page-name">
                    <strong>{page.name}</strong>
                    <span className="ar-page-platforms">
                      <PlatformIcon platform="messenger" size={13} />
                      {page.instagram && <PlatformIcon platform="instagram" size={13} />}
                    </span>
                  </span>
                  <span className={`ar-state${page.autoReply?.enabled ? ' is-on' : ''}`}>{page.autoReply?.enabled ? 'Đang bật' : 'Tắt'}</span>
                </button>
              ))}
            </nav>

            {form && (
              <div className="ar-form">
                <label className={`ar-toggle${form.enabled ? ' is-on' : ''}`}>
                  <span>
                    <strong>Bật trả lời tự động</strong>
                    <small className="muted">Cho Fanpage “{selectedPage?.name}”. Chỉ trả lời tin khách gửi sau khi bật.</small>
                  </span>
                  <input type="checkbox" checked={form.enabled} onChange={(e) => update({ enabled: e.target.checked })} />
                  <span className="ar-switch" aria-hidden="true" />
                </label>

                <div>
                  <span className="field-label">Áp dụng cho</span>
                  <div className="ar-chips">
                    <label className={`ar-chip${form.platforms.includes('messenger') ? ' is-on' : ''}`}>
                      <input type="checkbox" checked={form.platforms.includes('messenger')} onChange={() => togglePlatform('messenger')} />
                      <PlatformIcon platform="messenger" size={15} /> Messenger
                    </label>
                    <label className={`ar-chip${form.platforms.includes('instagram') ? ' is-on' : ''}`} title={hasInstagram ? '' : 'Fanpage chưa liên kết Instagram — lựa chọn sẽ tự áp dụng khi liên kết'}>
                      <input type="checkbox" checked={form.platforms.includes('instagram')} onChange={() => togglePlatform('instagram')} />
                      <PlatformIcon platform="instagram" size={15} /> Instagram{hasInstagram ? ` (@${selectedPage.instagram.username})` : ' (chưa liên kết)'}
                    </label>
                  </div>
                </div>

                <div>
                  <span className="field-label">Cách trả lời</span>
                  <div className="inbox-tabs ar-mode">
                    <button type="button" className={form.mode === 'template' ? 'is-active' : ''} onClick={() => update({ mode: 'template' })}>Mẫu cố định</button>
                    <button type="button" className={form.mode === 'ai' ? 'is-active' : ''} onClick={() => update({ mode: 'ai' })}>
                      <Sparkles size={13} /> AI tự soạn
                    </button>
                  </div>
                  {form.mode === 'ai' && !data.aiConfigured && (
                    <div className="inbox-window-warning ar-note">
                      <AlertTriangle size={14} /> Chưa cấu hình AI API Key nên hệ thống sẽ dùng mẫu cố định bên dưới.
                      Quản trị viên có thể thêm key tại <Link href="/settings">Cài đặt → Cấu hình AI Studio</Link>.
                    </div>
                  )}
                </div>

                {form.mode === 'ai' && (
                  <div>
                    <label className="field-label" htmlFor="ar-instruction">Hướng dẫn cho AI (không bắt buộc)</label>
                    <textarea
                      id="ar-instruction"
                      className="field"
                      rows={3}
                      maxLength={MAX_INSTRUCTION}
                      placeholder="VD: Bạn là nhân viên shop thời trang ABC. Mở cửa 8h–22h, hotline 09xx xxx xxx, freeship đơn từ 300k."
                      value={form.aiInstruction}
                      onChange={(e) => update({ aiInstruction: e.target.value })}
                    />
                  </div>
                )}

                <div>
                  <div className="ar-label-row">
                    <label className="field-label" htmlFor="ar-template">{form.mode === 'ai' ? 'Mẫu dự phòng (dùng khi AI lỗi)' : 'Nội dung trả lời'}</label>
                    <span className="ar-vars">
                      {VARIABLES.map((variable) => (
                        <button type="button" key={variable.token} className="ar-var" onClick={() => insertVariable(variable.token)} title={`Chèn ${variable.label}`}>
                          {variable.token}
                        </button>
                      ))}
                    </span>
                  </div>
                  <textarea
                    id="ar-template"
                    ref={templateRef}
                    className="field"
                    rows={3}
                    maxLength={MAX_TEMPLATE}
                    value={form.templateText}
                    onChange={(e) => update({ templateText: e.target.value })}
                  />
                  <small className="ar-counter">{form.templateText.length}/{MAX_TEMPLATE}</small>
                </div>

                <div className="ar-test">
                  <span className="field-label">Thử với tin nhắn của khách</span>
                  <div className="ar-test-row">
                    <input className="field" value={sampleText} onChange={(e) => setSampleText(e.target.value)} maxLength={300} aria-label="Tin nhắn thử" />
                    <button type="button" className="button button-secondary" onClick={handlePreview} disabled={previewing}>
                      {previewing ? <Loader2 size={15} className="spin" /> : <Play size={15} />} Thử trả lời
                    </button>
                  </div>
                  {preview && (
                    preview.error ? (
                      <div className="inbox-send-error"><AlertTriangle size={14} /> {preview.error}</div>
                    ) : (
                      <div className="ar-preview">
                        <div className="ar-preview-customer">{sampleText || 'shgagdwy'}</div>
                        <div className="ar-preview-reply">{preview.text}</div>
                        <small className="muted">
                          {preview.modeUsed === 'ai' ? 'AI tự soạn' : preview.modeUsed === 'template_fallback' ? `Dùng mẫu dự phòng${preview.aiError ? ` (AI lỗi: ${preview.aiError})` : ''}` : 'Mẫu cố định'}
                        </small>
                      </div>
                    )
                  )}
                </div>

                <ul className="ar-rules">
                  <li>Đồng bộ mỗi vài giây: tin mới của khách được trả lời ngay sau khi về hộp thư.</li>
                  <li>Khách nhắn liên tiếp nhiều tin thì nhận một câu trả lời cho cả cụm.</li>
                  <li>Mỗi tin của khách chỉ được trả lời một lần.</li>
                  <li>Không gửi nếu nhân viên đã trả lời trước.</li>
                  <li>Facebook chỉ cho phép trả lời trong 24 giờ kể từ tin cuối của khách.</li>
                </ul>

                {pages.length > 1 && (
                  <label className="ar-apply-all">
                    <input type="checkbox" checked={applyAll} onChange={(e) => setApplyAll(e.target.checked)} />
                    Áp dụng cài đặt này cho tất cả {pages.length} Fanpage
                  </label>
                )}
                {error && <div className="inbox-send-error"><AlertTriangle size={14} /> {error}</div>}
              </div>
            )}
          </div>
        )}

        <div className="ar-footer">
          <span className="muted">
            {data?.stats ? <><CheckCircle2 size={13} /> 24 giờ qua: {data.stats.sent24h} tin đã tự động trả lời{data.stats.failed24h ? `, ${data.stats.failed24h} tin lỗi` : ''}</> : null}
          </span>
          <div className="ar-footer-actions">
            <button type="button" className="button button-secondary" onClick={onClose} disabled={saving}>Đóng</button>
            <button type="button" className="button button-primary" onClick={handleSave} disabled={saving || !form || !form.platforms.length}>
              {saving ? <Loader2 size={15} className="spin" /> : <CheckCircle2 size={15} />} Lưu cài đặt
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
