import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Bot, CheckCircle2, ChevronRight, Layers, RefreshCw, Save, Send, Sparkles, X } from 'lucide-react';
import CommentAiShell, { Notice, SENTIMENT_LABEL, formatTime } from '../../components/comment-ai/CommentAiShell';
import commentAiApi, { apiMessage } from '../../services/commentAiApi';
import useAuth from '../../hooks/useAuth';

const GROUP_LABELS = {
  tu_van_hoi_gia: 'Tư vấn / Hỏi giá',
  hoi_mua_chot_don: 'Hỏi mua / Chốt đơn',
  hoi_dia_chi_lien_he: 'Hỏi địa chỉ / Liên hệ',
  chao_hoi_tuong_tac: 'Chào hỏi / Tương tác',
  khen: 'Khen ngợi',
  tieu_cuc_phan_nan: 'Tiêu cực / Phàn nàn',
  ngan_emoji_vo_nghia: 'Ngắn / Emoji / Vô nghĩa',
  spam_quang_cao: 'Spam / Quảng cáo',
  khac: 'Khác'
};
const PAGE_VARIABLES = [
  ['ten_page', 'Tên Fanpage'],
  ['sdt_shop', 'SĐT shop'],
  ['dia_chi_shop', 'Địa chỉ shop'],
  ['website', 'Website'],
  ['gio_mo_cua', 'Giờ mở cửa']
];

function SettingsPanel({ pageId }) {
  const router = useRouter();
  const { user } = useAuth();
  const canManageApproval = user?.role === 'admin' || user?.role === 'manager';
  const [settings, setSettings] = useState(null);
  const [defaultTone, setDefaultTone] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadingStudioTone, setLoadingStudioTone] = useState(false);
  const [refreshingFacebookInfo, setRefreshingFacebookInfo] = useState(false);
  const [notice, setNotice] = useState(null);
  const [comment, setComment] = useState('');
  const [chat, setChat] = useState([]);
  const [testing, setTesting] = useState(false);

  // Đề xuất cách trả lời (quét 24 giờ)
  const [suggestions, setSuggestions] = useState([]);
  const [lastSuggestAt, setLastSuggestAt] = useState(null);
  const [scanningSuggestions, setScanningSuggestions] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      commentAiApi.getSettings(pageId),
      commentAiApi.listSuggestions(pageId).catch(() => ({ suggestions: [], lastSuggestAt: null }))
    ])
      .then(([resSettings, resSuggestions]) => {
        if (!cancelled) {
          setSettings(resSettings.settings);
          setDefaultTone(resSettings.defaults?.tone || '');
          setSuggestions(resSuggestions.suggestions || []);
          setLastSuggestAt(resSuggestions.lastSuggestAt || resSettings.settings?.lastSuggestAt || null);
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

  const refreshFacebookInfo = async () => {
    setRefreshingFacebookInfo(true);
    setNotice(null);
    try {
      const saved = await commentAiApi.saveSettings(pageId, settings);
      setSettings(saved.settings);
      const res = await commentAiApi.refreshFacebookInfo(pageId);
      setSettings(res.settings);
      setNotice(res.warning
        ? { type: 'error', text: `${res.message} ${res.warning}` }
        : { type: 'success', text: res.message });
    } catch (err) {
      setNotice({ type: 'error', text: apiMessage(err, 'Không lấy được thông tin từ Facebook.') });
    } finally {
      setRefreshingFacebookInfo(false);
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

  const scanSuggestionsNow = async () => {
    setScanningSuggestions(true);
    setNotice(null);
    try {
      const res = await commentAiApi.scanSuggestions(pageId);
      setSuggestions(res.suggestions || []);
      setLastSuggestAt(res.lastSuggestAt || new Date());
      setNotice({ type: 'success', text: 'Đã quét bình luận 24 giờ qua và cập nhật đề xuất cách trả lời.' });
    } catch (err) {
      setNotice({ type: 'error', text: apiMessage(err, 'Không quét được đề xuất.') });
    } finally {
      setScanningSuggestions(false);
    }
  };

  const applySuggestion = async (s) => {
    window.sessionStorage.setItem('commentAiPrefill', JSON.stringify({
      name: s.tenNgan,
      content: s.cachTraLoi,
      keywords: s.tuKhoa,
      mode: s.kieuGoiY === 'exact' ? 'exact' : 'guided'
    }));
    await commentAiApi.updateSuggestion(pageId, s.id, 'da_dung').catch(() => {});
    router.push('/comment-ai/templates');
  };

  const dismissSuggestion = async (s) => {
    try {
      await commentAiApi.updateSuggestion(pageId, s.id, 'bo_qua');
      setSuggestions((prev) => prev.filter((item) => item.id !== s.id));
    } catch (err) {
      setNotice({ type: 'error', text: apiMessage(err, 'Không cập nhật được.') });
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
        <div className="panel-body" style={{ display: 'grid', gap: 14 }}>
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

          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
              <label className="field-label" htmlFor="comment-ai-shop" style={{ margin: 0 }}>
                Dữ liệu cửa hàng / sản phẩm / chính sách
              </label>
              <small className="muted">{settings.shop ? settings.shop.length : 0}/3000 ký tự</small>
            </div>
            <textarea
              id="comment-ai-shop"
              className="field"
              rows={6}
              maxLength={3000}
              value={settings.shop || ''}
              onChange={(e) => update({ shop: e.target.value })}
              placeholder="Nhập thông tin sản phẩm, bảng giá niêm yết, địa chỉ cửa hàng, hotline, chính sách đổi trả/bảo hành/giao hàng... AI sẽ lấy thông tin này làm nguồn sự thật duy nhất khi trả lời khách."
            />
            <small className="muted">Nguồn sự thật duy nhất về giá, địa chỉ, chính sách và sản phẩm khi AI trả lời bình luận (tối đa 3000 ký tự).</small>
            {settings.facebookSources?.shop === 'facebook' && (
              <small className="muted" style={{ display: 'block' }}>Nguồn: tự lấy từ Facebook · hãy kiểm tra và sửa nếu cần.</small>
            )}
          </div>

          <div>
            <label className="field-label">Thông tin liên hệ dùng trong mẫu</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
              {PAGE_VARIABLES.map(([key, label]) => (
                <label key={key} style={{ display: 'grid', gap: 4 }}>
                  <span>{label}</span>
                  <input
                    className="field"
                    value={settings.vars?.[key] || ''}
                    onChange={(e) => update({ vars: { ...(settings.vars || {}), [key]: e.target.value } })}
                    aria-label={label}
                  />
                  {settings.facebookSources?.vars?.[key] === 'facebook' && (
                    <small className="muted">Tự lấy từ Facebook · bạn có thể kiểm tra và sửa.</small>
                  )}
                  {key === 'sdt_shop' && !settings.vars?.sdt_shop && (
                    <small role="status" style={{ color: 'var(--warning, #b45309)' }}>
                      Chưa có SĐT, AI sẽ mời khách nhắn tin thay vì đưa số
                    </small>
                  )}
                </label>
              ))}
            </div>
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
        <button type="button" className="button button-secondary" onClick={refreshFacebookInfo} disabled={refreshingFacebookInfo || saving}>
          <RefreshCw size={15} className={refreshingFacebookInfo ? 'spin' : ''} />
          {refreshingFacebookInfo ? 'Đang lấy thông tin...' : 'Lấy lại thông tin từ Facebook'}
        </button>
        <Link href="/comment-ai/diagnostics" className="button button-secondary">Kiểm tra hệ thống</Link>
      </div>

      {/* ═══ ĐỀ XUẤT CÁCH TRẢ LỜI (MỤC C) ═══ */}
      <section className="panel" style={{ marginBottom: 22 }}>
        <div className="panel-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h2 style={{ display: 'inline-flex', alignItems: 'center', gap: 8, margin: 0 }}>
              <Layers size={16} /> Đề xuất cách trả lời từ bình luận 24 giờ qua
            </h2>
            <small className="muted" style={{ display: 'block', marginTop: 4 }}>
              Lần quét gần nhất: {lastSuggestAt ? formatTime(lastSuggestAt) : 'Chưa quét lần nào (tự động quét 24h/lần)'}
            </small>
          </div>
          <button
            type="button"
            className="button button-secondary"
            onClick={scanSuggestionsNow}
            disabled={scanningSuggestions}
          >
            <RefreshCw size={14} className={scanningSuggestions ? 'spin' : ''} />
            {scanningSuggestions ? 'Đang phân tích 24h...' : 'Quét ngay'}
          </button>
        </div>
        <div className="panel-body">
          {suggestions.length === 0 && (
            <span className="muted">
              Chưa có cụm đề xuất nào. Bấm "Quét ngay" để AI gom cụm bình luận 24 giờ qua và gợi ý mẫu trả lời kèm từ khóa.
            </span>
          )}
          <div style={{ display: 'grid', gap: 14 }}>
            {suggestions.map((s) => (
              <div
                key={s.id}
                style={{
                  border: '1px solid var(--line)',
                  borderRadius: 8,
                  padding: 14,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: 14,
                  flexWrap: 'wrap',
                  background: s.trangThai === 'da_dung' ? 'rgba(34, 197, 94, 0.05)' : 'transparent'
                }}
              >
                <div style={{ flex: '1 1 340px' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
                    <b>{s.tenNgan}</b>
                    <span className="status-pill publishing">{GROUP_LABELS[s.nhom] || s.nhom}</span>
                    <span className="status-pill pending">{s.soLuong} bình luận</span>
                    <span className="status-pill publishing">{s.kieuGoiY === 'exact' ? 'Nguyên văn' : 'AI viết lại'}</span>
                    {s.daCoMauPhu && <span className="status-pill published"><CheckCircle2 size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />Đã có mẫu</span>}
                    {s.trangThai === 'da_dung' && <span className="status-pill published">Đã dùng</span>}
                  </div>
                  {s.tuKhoa && (
                    <small className="muted" style={{ display: 'block', marginBottom: 4 }}>
                      Từ khóa gợi ý: <code>{s.tuKhoa}</code>
                    </small>
                  )}
                  {s.viDu && s.viDu.length > 0 && (
                    <small className="muted" style={{ display: 'block', marginBottom: 6 }}>
                      Ví dụ khách hỏi: {s.viDu.map((v) => `"${v}"`).join(' · ')}
                    </small>
                  )}
                  <div style={{ background: 'rgba(148, 163, 184, 0.1)', padding: '8px 12px', borderRadius: 6, whiteSpace: 'pre-wrap', marginTop: 4 }}>
                    {s.cachTraLoi}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <button type="button" className="button button-primary" onClick={() => applySuggestion(s)}>
                    Dùng làm mẫu <ChevronRight size={14} />
                  </button>
                  <button type="button" className="button button-quiet" onClick={() => dismissSuggestion(s)} title="Bỏ qua đề xuất này">
                    <X size={14} /> Bỏ qua
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

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
                      {item.result.note ? ` (${item.result.note})` : ''}
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
