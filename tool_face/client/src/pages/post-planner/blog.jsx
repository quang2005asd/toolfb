import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Copy,
  ImagePlus,
  ListTree,
  Loader2,
  Plus,
  RotateCcw,
  Send,
  Sparkles,
  Trash2,
  X
} from 'lucide-react';
import MainLayout from '../../components/layout/MainLayout';
import PlatformIcon from '../../components/PlatformIcon';
import WriteNav from '../../components/write/WriteNav';
import aiApi from '../../services/aiApi';
import postApi from '../../services/postApi';
import channelApi from '../../services/channelApi';
import { mediaUrl } from '../../services/apiBase';

const DRAFT_KEY = 'tool-social-blog-draft';
const FB_LIMIT = 63206; // giới hạn ký tự một bài Facebook
const TONES = ['Chuyên nghiệp, gần gũi', 'Chia sẻ kinh nghiệm', 'Bán hàng, thuyết phục', 'Kể chuyện, cảm xúc', 'Hài hước, trẻ trung'];
const LENGTHS = [
  { id: 'short', label: 'Ngắn (3 mục)' },
  { id: 'medium', label: 'Vừa (4 mục)' },
  { id: 'long', label: 'Dài (6 mục)' }
];

let sectionCounter = 0;
const newSection = (heading = '', body = '') => ({ id: `s-${Date.now()}-${sectionCounter += 1}`, heading, body });
const EMPTY_BLOG = () => ({ title: '', intro: '', sections: [newSection()], outro: '', hashtags: '', cover: null });

function toLocalInput(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// Facebook không hiển thị định dạng: tiêu đề viết hoa, mỗi mục bắt đầu bằng 🔹
function buildBlogText({ title, intro, sections, outro, hashtags }) {
  const parts = [];
  if (title.trim()) parts.push(title.trim().toLocaleUpperCase('vi-VN'));
  if (intro.trim()) parts.push(intro.trim());
  for (const section of sections) {
    const heading = section.heading.trim();
    const body = section.body.trim();
    if (!heading && !body) continue;
    parts.push([heading ? `🔹 ${heading}` : '', body].filter(Boolean).join('\n'));
  }
  if (outro.trim()) parts.push(outro.trim());
  if (hashtags.trim()) parts.push(hashtags.trim());
  return parts.join('\n\n');
}

export default function BlogWritePage() {
  const [blog, setBlog] = useState(EMPTY_BLOG);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [ai, setAi] = useState({ topic: '', audience: '', tone: TONES[0], length: 'medium' });
  const [aiBusy, setAiBusy] = useState(null); // 'outline' | 'full'
  const [aiError, setAiError] = useState('');
  const [coverUploading, setCoverUploading] = useState(false);
  const coverInputRef = useRef(null);

  const [channels, setChannels] = useState([]);
  const [selectedPageIds, setSelectedPageIds] = useState([]);
  const [scheduleMode, setScheduleMode] = useState('now');
  const [scheduledAt, setScheduledAt] = useState(() => toLocalInput(new Date(Date.now() + 60 * 60000)));
  const [publishing, setPublishing] = useState(false);
  const [notice, setNotice] = useState(null); // { ok, text }
  const [copied, setCopied] = useState(false);

  // Nháp lưu trên trình duyệt này (mất nếu xóa dữ liệu trình duyệt)
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
      if (saved && typeof saved === 'object') {
        setBlog({ ...EMPTY_BLOG(), ...saved, sections: Array.isArray(saved.sections) && saved.sections.length ? saved.sections.map((section) => newSection(section.heading || '', section.body || '')) : [newSection()] });
        if (saved.topic) setAi((current) => ({ ...current, topic: saved.topic }));
      }
    } catch {}
    setDraftLoaded(true);
  }, []);

  useEffect(() => {
    if (!draftLoaded) return undefined;
    const timer = setTimeout(() => {
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...blog, topic: ai.topic })); } catch {}
    }, 600);
    return () => clearTimeout(timer);
  }, [blog, ai.topic, draftLoaded]);

  useEffect(() => {
    channelApi.list().then((res) => setChannels(res.channels || [])).catch(() => {});
  }, []);

  const text = useMemo(() => buildBlogText(blog), [blog]);
  const setField = (key) => (event) => setBlog((current) => ({ ...current, [key]: event.target.value }));
  const updateSection = (id, patch) => setBlog((current) => ({ ...current, sections: current.sections.map((section) => (section.id === id ? { ...section, ...patch } : section)) }));
  const moveSection = (index, delta) => setBlog((current) => {
    const next = [...current.sections];
    const target = index + delta;
    if (target < 0 || target >= next.length) return current;
    [next[index], next[target]] = [next[target], next[index]];
    return { ...current, sections: next };
  });
  const removeSection = (id) => setBlog((current) => ({ ...current, sections: current.sections.length > 1 ? current.sections.filter((section) => section.id !== id) : [newSection()] }));

  const runAi = async (mode) => {
    if (!ai.topic.trim()) {
      setAiError('Nhập chủ đề bài blog trước.');
      return;
    }
    const hasContent = blog.intro.trim() || blog.sections.some((section) => section.body.trim());
    if (mode === 'full' && hasContent && !confirm('AI sẽ viết lại toàn bộ nội dung (giữ tiêu đề và tên các mục hiện có). Tiếp tục?')) return;
    if (mode === 'outline' && (blog.title.trim() || blog.sections.some((section) => section.heading.trim() || section.body.trim())) && !confirm('Dàn ý mới sẽ thay tiêu đề và các mục hiện có. Tiếp tục?')) return;
    setAiBusy(mode);
    setAiError('');
    try {
      const outline = mode === 'full' ? blog.sections.map((section) => section.heading.trim()).filter(Boolean) : [];
      const res = await aiApi.writeBlog({ mode, topic: ai.topic.trim(), audience: ai.audience.trim(), tone: ai.tone, length: ai.length, title: mode === 'full' ? blog.title.trim() : '', outline });
      const result = res.blog || {};
      setBlog((current) => (mode === 'outline'
        ? { ...current, title: result.title || current.title, sections: (result.sections || []).map((section) => newSection(section.heading, '')) }
        : {
            ...current,
            title: result.title || current.title,
            intro: result.intro || '',
            sections: (result.sections || []).map((section) => newSection(section.heading, section.body)),
            outro: result.outro || '',
            hashtags: (result.hashtags || []).join(' ')
          }));
    } catch (err) {
      setAiError(err.response?.data?.message || 'AI chưa viết được — thử lại sau ít giây.');
    } finally {
      setAiBusy(null);
    }
  };

  const uploadCover = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setNotice({ ok: false, text: 'Ảnh bìa phải là file ảnh.' });
      return;
    }
    setCoverUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await postApi.uploadMedia(formData);
      setBlog((current) => ({ ...current, cover: res.mediaLink }));
    } catch (err) {
      setNotice({ ok: false, text: err.response?.data?.message || 'Không tải được ảnh bìa.' });
    } finally {
      setCoverUploading(false);
    }
  };

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  const resetDraft = () => {
    if (!confirm('Xóa bản nháp hiện tại và bắt đầu bài mới?')) return;
    setBlog(EMPTY_BLOG());
    setNotice(null);
    try { localStorage.removeItem(DRAFT_KEY); } catch {}
  };

  const publish = async () => {
    setNotice(null);
    if (!text.trim()) return setNotice({ ok: false, text: 'Bài blog chưa có nội dung.' });
    if (text.length > FB_LIMIT) return setNotice({ ok: false, text: `Bài dài ${text.length.toLocaleString('vi-VN')} ký tự — Facebook chỉ cho tối đa ${FB_LIMIT.toLocaleString('vi-VN')}.` });
    if (!selectedPageIds.length) return setNotice({ ok: false, text: 'Chọn ít nhất một Fanpage.' });
    const when = scheduleMode === 'now' ? new Date() : new Date(scheduledAt);
    if (Number.isNaN(when.getTime()) || (scheduleMode === 'later' && when.getTime() < Date.now() - 60000)) return setNotice({ ok: false, text: 'Thời gian hẹn không hợp lệ hoặc đã qua.' });
    setPublishing(true);
    try {
      const res = await postApi.createPost({
        platform: 'facebook',
        pageIds: selectedPageIds,
        content: text,
        mediaType: blog.cover ? 'image' : 'text',
        mediaLinks: blog.cover ? [blog.cover] : [],
        scheduledAt: when.toISOString()
      });
      setNotice({ ok: true, text: res.message || 'Đã lưu bài blog.' });
    } catch (err) {
      setNotice({ ok: false, text: err.response?.data?.message || 'Không đăng được bài blog.' });
    } finally {
      setPublishing(false);
    }
  };

  const togglePage = (id) => setSelectedPageIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;

  return (
    <MainLayout title="Viết blog">
      <WriteNav active="blog" />

      <div className="blog-layout">
        <div className="blog-editor">
          <section className="panel blog-ai">
            <header className="bulk-step-head">
              <span className="bulk-step-num"><Sparkles size={15} aria-hidden="true" /></span>
              <div>
                <h2>AI viết blog</h2>
                <p>Lập dàn ý trước, sửa các mục cho đúng ý rồi để AI viết cả bài — hoặc viết thẳng.</p>
              </div>
            </header>
            <div className="blog-ai-fields">
              <label className="blog-ai-topic">
                <span className="field-label">Chủ đề / từ khóa</span>
                <input className="field" placeholder="VD: 5 cách bảo quản cà phê hạt luôn thơm" value={ai.topic} onChange={(event) => setAi((current) => ({ ...current, topic: event.target.value }))} maxLength={500} />
              </label>
              <label>
                <span className="field-label">Người đọc (không bắt buộc)</span>
                <input className="field" placeholder="VD: chủ quán cà phê nhỏ" value={ai.audience} onChange={(event) => setAi((current) => ({ ...current, audience: event.target.value }))} maxLength={200} />
              </label>
              <label>
                <span className="field-label">Giọng văn</span>
                <select className="field" value={ai.tone} onChange={(event) => setAi((current) => ({ ...current, tone: event.target.value }))}>
                  {TONES.map((tone) => <option key={tone} value={tone}>{tone}</option>)}
                </select>
              </label>
              <label>
                <span className="field-label">Độ dài</span>
                <select className="field" value={ai.length} onChange={(event) => setAi((current) => ({ ...current, length: event.target.value }))}>
                  {LENGTHS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
              </label>
            </div>
            {aiError && <p className="fb-own-app-result is-error" role="alert"><AlertTriangle size={14} aria-hidden="true" /> {aiError}</p>}
            <div className="blog-ai-actions">
              <button type="button" className="button button-secondary" onClick={() => runAi('outline')} disabled={Boolean(aiBusy)}>
                {aiBusy === 'outline' ? <Loader2 size={15} className="spin" /> : <ListTree size={15} />} Lập dàn ý
              </button>
              <button type="button" className="button button-primary" onClick={() => runAi('full')} disabled={Boolean(aiBusy)}>
                {aiBusy === 'full' ? <Loader2 size={15} className="spin" /> : <Sparkles size={15} />} {blog.sections.some((section) => section.heading.trim()) ? 'Viết cả bài theo dàn ý' : 'Viết cả bài'}
              </button>
            </div>
          </section>

          <section className="panel blog-content">
            <div className="blog-content-head">
              <h2>Nội dung</h2>
              <button type="button" className="button button-quiet" onClick={resetDraft}><RotateCcw size={14} /> Bài mới</button>
            </div>

            <label className="blog-field">
              <span className="field-label">Tiêu đề</span>
              <input className="field blog-title" placeholder="Tiêu đề hấp dẫn" value={blog.title} onChange={setField('title')} maxLength={200} />
            </label>

            <div className="blog-cover">
              <span className="field-label">Ảnh bìa (không bắt buộc)</span>
              {blog.cover ? (
                <div className="blog-cover-preview">
                  <img src={mediaUrl(blog.cover)} alt="Ảnh bìa" />
                  <button type="button" className="icon-button" onClick={() => setBlog((current) => ({ ...current, cover: null }))} aria-label="Bỏ ảnh bìa"><X size={15} /></button>
                </div>
              ) : (
                <button type="button" className="button button-secondary" onClick={() => coverInputRef.current?.click()} disabled={coverUploading}>
                  {coverUploading ? <Loader2 size={15} className="spin" /> : <ImagePlus size={15} />} {coverUploading ? 'Đang tải…' : 'Chọn ảnh bìa'}
                </button>
              )}
              <input ref={coverInputRef} type="file" accept="image/*" hidden onChange={uploadCover} />
            </div>

            <label className="blog-field">
              <span className="field-label">Mở bài</span>
              <textarea className="field" rows={3} placeholder="2–3 câu dẫn dắt người đọc" value={blog.intro} onChange={setField('intro')} />
            </label>

            <div className="blog-sections">
              <span className="field-label">Các mục ({blog.sections.length})</span>
              {blog.sections.map((section, index) => (
                <div key={section.id} className="blog-section">
                  <div className="blog-section-head">
                    <span className="blog-section-num">{index + 1}</span>
                    <input className="field" placeholder={`Tên mục ${index + 1}`} value={section.heading} onChange={(event) => updateSection(section.id, { heading: event.target.value })} maxLength={160} aria-label={`Tên mục ${index + 1}`} />
                    <button type="button" className="icon-button" onClick={() => moveSection(index, -1)} disabled={index === 0} aria-label="Đưa mục lên"><ArrowUp size={14} /></button>
                    <button type="button" className="icon-button" onClick={() => moveSection(index, 1)} disabled={index === blog.sections.length - 1} aria-label="Đưa mục xuống"><ArrowDown size={14} /></button>
                    <button type="button" className="icon-button" onClick={() => removeSection(section.id)} aria-label={`Xóa mục ${index + 1}`}><Trash2 size={14} /></button>
                  </div>
                  <textarea className="field" rows={4} placeholder="Nội dung mục" value={section.body} onChange={(event) => updateSection(section.id, { body: event.target.value })} aria-label={`Nội dung mục ${index + 1}`} />
                </div>
              ))}
              <button type="button" className="button button-secondary blog-add-section" onClick={() => setBlog((current) => ({ ...current, sections: [...current.sections, newSection()] }))}>
                <Plus size={15} /> Thêm mục
              </button>
            </div>

            <label className="blog-field">
              <span className="field-label">Kết bài &amp; lời kêu gọi</span>
              <textarea className="field" rows={3} placeholder="Tóm ý + mời bình luận / inbox / mua hàng" value={blog.outro} onChange={setField('outro')} />
            </label>
            <label className="blog-field">
              <span className="field-label">Hashtag</span>
              <input className="field" placeholder="#caphe #kinhnghiem" value={blog.hashtags} onChange={setField('hashtags')} />
            </label>
          </section>
        </div>

        <aside className="blog-side">
          <section className="panel blog-preview">
            <div className="blog-preview-head">
              <h2>Xem trước trên Facebook</h2>
              <button type="button" className="button button-quiet" onClick={copyText} disabled={!text}>
                {copied ? <CheckCircle2 size={14} /> : <Copy size={14} />} {copied ? 'Đã chép' : 'Sao chép'}
              </button>
            </div>
            <div className="blog-preview-card">
              {blog.cover && <img src={mediaUrl(blog.cover)} alt="" />}
              <p className={text ? '' : 'is-empty'}>{text || 'Nội dung bài blog sẽ hiện ở đây.'}</p>
            </div>
            <p className={`blog-count${text.length > FB_LIMIT ? ' is-over' : ''}`}>{wordCount.toLocaleString('vi-VN')} chữ · {text.length.toLocaleString('vi-VN')}/{FB_LIMIT.toLocaleString('vi-VN')} ký tự</p>
          </section>

          <section className="panel blog-publish">
            <h2>Đăng lên Fanpage</h2>
            {channels.length === 0 ? (
              <p className="bulk-muted">Chưa có Fanpage nào. <Link href="/channels">Kết nối Facebook</Link></p>
            ) : (
              <div className="bulk-channel-list blog-pages">
                {channels.map((page) => (
                  <label key={page.id} className={`bulk-channel${selectedPageIds.includes(page.id) ? ' is-selected' : ''}${page.isValid === false ? ' is-disabled' : ''}`}>
                    <input type="checkbox" checked={selectedPageIds.includes(page.id)} disabled={page.isValid === false} onChange={() => togglePage(page.id)} />
                    <PlatformIcon platform="facebook" size={18} />
                    <span><strong>{page.name}</strong><small>{page.isValid === false ? <span className="bulk-warn">Mất quyền</span> : page.category}</small></span>
                  </label>
                ))}
              </div>
            )}
            <div className="report-segment" role="radiogroup" aria-label="Thời điểm đăng">
              <button type="button" role="radio" aria-checked={scheduleMode === 'now'} className={scheduleMode === 'now' ? 'is-active' : ''} onClick={() => setScheduleMode('now')}>Đăng ngay</button>
              <button type="button" role="radio" aria-checked={scheduleMode === 'later'} className={scheduleMode === 'later' ? 'is-active' : ''} onClick={() => setScheduleMode('later')}>Hẹn giờ</button>
            </div>
            {scheduleMode === 'later' && (
              <input className="field" type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} aria-label="Giờ đăng" />
            )}
            {notice && (
              <p className={`fb-own-app-result ${notice.ok ? 'is-ok' : 'is-error'}`} role="status">
                {notice.ok ? <CheckCircle2 size={14} aria-hidden="true" /> : <AlertTriangle size={14} aria-hidden="true" />} {notice.text}
                {notice.ok && <> <Link href="/post-planner/list">Xem danh sách bài</Link></>}
              </p>
            )}
            <button type="button" className="button button-primary blog-submit" onClick={publish} disabled={publishing}>
              {publishing ? <Loader2 size={15} className="spin" /> : <Send size={15} />} {publishing ? 'Đang gửi…' : scheduleMode === 'now' ? `Đăng ngay${selectedPageIds.length ? ` (${selectedPageIds.length} Fanpage)` : ''}` : 'Lên lịch đăng'}
            </button>
          </section>
        </aside>
      </div>
    </MainLayout>
  );
}
