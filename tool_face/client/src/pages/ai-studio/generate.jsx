import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import {
  MessageSquare,
  Sparkles,
  Wand2,
  Send,
  RefreshCw,
  Trash2,
  CheckCircle2,
  Clock,
  Hash,
  Smile,
  ChevronRight,
  ChevronLeft,
  Loader2,
  Copy,
  Check,
  Zap,
  PenLine,
  CalendarDays,
  ArrowRight,
  RotateCcw,
  X,
  FileText,
  Plus,
  Stamp
} from 'lucide-react';
import MainLayout from '../../components/layout/MainLayout';
import AiImageStudioModal, { resolveMediaUrl } from '../../components/AiImageStudioModal';
import aiApi from '../../services/aiApi';
import channelApi from '../../services/channelApi';
import postApi from '../../services/postApi';

/* ── Quick Templates ── */
const quickTemplates = [
  { label: '3 bài bán hàng', prompt: 'Tạo 3 bài đăng Facebook bán hàng hấp dẫn cho 3 sản phẩm khác nhau: áo thun, giày sneaker, và balo laptop. Mỗi bài có phong cách khác nhau.', icon: '🛍️' },
  { label: '5 bài viral', prompt: 'Tạo 5 bài đăng Facebook viral dễ chia sẻ về các chủ đề: mẹo sống khỏe, công nghệ, tình yêu, sự nghiệp, và du lịch. Mỗi bài phải gây cảm xúc mạnh.', icon: '🔥' },
  { label: 'Lịch 7 ngày', prompt: 'Tạo 7 bài đăng Facebook cho 7 ngày trong tuần, mỗi ngày 1 chủ đề khác nhau: Thứ 2 motivation, Thứ 3 chia sẻ kiến thức, Thứ 4 hài hước, Thứ 5 bán hàng, Thứ 6 review, Thứ 7 giải trí, Chủ nhật cảm ơn.', icon: '📅' },
  { label: '3 bài review', prompt: 'Tạo 3 bài review sản phẩm chân thực, tự nhiên như khách hàng thật cho: điện thoại, tai nghe bluetooth, và kem chống nắng. Có ưu nhược điểm.', icon: '⭐' },
  { label: '3 bài seeding', prompt: 'Tạo 3 bài đăng dạng seeding tự nhiên, giả như chia sẻ cá nhân về 3 trải nghiệm: dùng mỹ phẩm, ăn quán mới, và mua đồ online.', icon: '💬' },
  { label: '2 bài event', prompt: 'Tạo 2 bài đăng thông báo sự kiện hấp dẫn: 1 bài sale cuối tuần và 1 bài workshop miễn phí.', icon: '🎉' }
];

const toneOptions = [
  { value: '', label: 'Tự động' },
  { value: 'chuyên nghiệp, trang trọng', label: '💼 Chuyên nghiệp' },
  { value: 'vui vẻ, trẻ trung, Gen Z', label: '🎉 Gen Z' },
  { value: 'thân thiện, gần gũi', label: '😊 Thân thiện' },
  { value: 'bán hàng, thuyết phục, kêu gọi hành động', label: '🛒 Bán hàng' },
  { value: 'hài hước, dí dỏm', label: '😂 Hài hước' },
  { value: 'cảm xúc, storytelling', label: '💖 Cảm xúc' }
];

export default function AIGeneratePage() {
  // Step state: 1 = Input, 2 = Edit drafts, 3 = Confirm publish
  const [step, setStep] = useState(1);

  // Step 1 state
  const [prompt, setPrompt] = useState('');
  const [tone, setTone] = useState('');
  const [includeEmoji, setIncludeEmoji] = useState(true);
  const [includeHashtags, setIncludeHashtags] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  // Step 2 state
  const [drafts, setDrafts] = useState([]);
  const [batchId, setBatchId] = useState(null);
  const [channels, setChannels] = useState([]);
  const [regeneratingId, setRegeneratingId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  // Step 3 state
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState(null);

  const [channelsLoading, setChannelsLoading] = useState(false);
  const textareaRef = useRef(null);

  // Load channels with force refresh
  const loadChannels = async (force = true) => {
    setChannelsLoading(true);
    try {
      const res = await channelApi.list(force);
      const list = res?.channels || res?.pages || [];
      if (Array.isArray(list)) {
        setChannels(list);
      }
    } catch (err) {
      console.error('Error loading channels:', err);
    } finally {
      setChannelsLoading(false);
    }
  };

  useEffect(() => {
    loadChannels(true);
  }, []);

  // When channels become available, auto-assign to drafts that have no pages selected
  useEffect(() => {
    if (channels.length > 0 && drafts.length > 0) {
      setDrafts(prev => prev.map(d => {
        if (!d.selected_page_ids || d.selected_page_ids.length === 0) {
          return { ...d, selected_page_ids: channels.map(c => c.id) };
        }
        return d;
      }));
    }
  }, [channels]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px';
    }
  }, [prompt]);

  // ── Step 1: Generate ──
  const handleGenerate = async () => {
    if (!prompt.trim() || generating) return;
    setGenerating(true);
    setError('');
    try {
      const res = await aiApi.generatePosts({ prompt, tone, includeHashtags, includeEmoji });
      if (res.success && res.drafts?.length > 0) {
        // Initialize each draft with all connected channels by default
        const defaultPages = channels.length > 0 ? channels.map(c => c.id) : [];
        const initializedDrafts = res.drafts.map(d => ({
          ...d,
          selected_page_ids: d.selected_page_ids?.length ? d.selected_page_ids : defaultPages,
          scheduled_at: null,
          editing: false
        }));
        setDrafts(initializedDrafts);
        setBatchId(res.batchId);
        setStep(2);
      } else {
        setError(res.message || 'Không tạo được bài viết. Thử lại nhé!');
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Lỗi kết nối server.');
    } finally {
      setGenerating(false);
    }
  };

  const handleTemplateClick = (tmpl) => {
    setPrompt(tmpl.prompt);
    if (textareaRef.current) textareaRef.current.focus();
  };

  // ── Step 2: Edit Drafts ──
  const handleUpdateDraftField = (index, field, value) => {
    setDrafts(prev => prev.map((d, i) => i === index ? { ...d, [field]: value } : d));
  };

  const handleRegenerate = async (draftId, index) => {
    setRegeneratingId(draftId);
    try {
      const res = await aiApi.regenerateDraft(draftId);
      if (res.success && res.draft) {
        setDrafts(prev => prev.map((d, i) => i === index ? { ...res.draft, selected_page_ids: d.selected_page_ids, scheduled_at: d.scheduled_at } : d));
      }
    } catch (err) {
      console.error('Regenerate failed:', err);
    } finally {
      setRegeneratingId(null);
    }
  };

  const handleDeleteDraft = async (draftId, index) => {
    try {
      await aiApi.deleteDraft(draftId);
      setDrafts(prev => prev.filter((_, i) => i !== index));
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  const handleCopyContent = (content, id) => {
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleTogglePage = (draftIndex, pageId) => {
    setDrafts(prev => prev.map((d, i) => {
      if (i !== draftIndex) return d;
      const current = d.selected_page_ids || [];
      const next = current.includes(pageId)
        ? current.filter(id => id !== pageId)
        : [...current, pageId];
      return { ...d, selected_page_ids: next };
    }));
  };

  const handleToggleAllPagesForDraft = (draftIndex) => {
    const allPageIds = channels.map(c => c.id);
    setDrafts(prev => prev.map((d, i) => {
      if (i !== draftIndex) return d;
      const current = d.selected_page_ids || [];
      const isAll = current.length === allPageIds.length;
      return { ...d, selected_page_ids: isAll ? [] : allPageIds };
    }));
  };

  const handleApplyPagesToAll = (pageIds) => {
    setDrafts(prev => prev.map(d => ({ ...d, selected_page_ids: [...pageIds] })));
  };

  const handleApplyScheduleToAll = (scheduledAt) => {
    setDrafts(prev => prev.map(d => ({ ...d, scheduled_at: scheduledAt })));
  };

  const handleSetQuickSchedule = (index, minutesFromNow) => {
    if (minutesFromNow === null) {
      handleUpdateDraftField(index, 'scheduled_at', null);
      return;
    }
    const target = new Date(Date.now() + minutesFromNow * 60 * 1000);
    handleUpdateDraftField(index, 'scheduled_at', target.toISOString());
  };

  const handleDistributeSchedule = (intervalMinutes = 30) => {
    // Bắt đầu từ 15 phút sau để đảm bảo hợp lệ cho Facebook Cloud (> 11 phút)
    const baseTime = Date.now() + 15 * 60 * 1000;
    setDrafts(prev => prev.map((d, i) => {
      const target = new Date(baseTime + i * intervalMinutes * 60 * 1000);
      return { ...d, scheduled_at: target.toISOString() };
    }));
  };

  const handleMediaChange = async (index, event, postType = 'feed') => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    setDrafts(prev => prev.map((d, i) => i === index ? { ...d, uploadingMedia: true } : d));

    const newMediaList = [];

    try {
      if (postType === 'reel') {
        const file = files[0];
        if (!file.type.startsWith('video/')) throw new Error('Facebook Reels chỉ hỗ trợ Video (tỷ lệ 9:16), không hỗ trợ ảnh tĩnh.');
        if (file.size > 50 * 1024 * 1024) throw new Error(`Video vượt quá dung lượng tối đa 50MB.`);
        
        const formData = new FormData();
        formData.append('file', file);
        const uploaded = await postApi.uploadMedia(formData);
        newMediaList.push({ ...uploaded, file, mediaType: 'video', previewUrl: URL.createObjectURL(file) });
      } else if (postType === 'story') {
        const file = files[0];
        if (file.type.startsWith('image/') && file.size > 1024 * 1024) throw new Error(`Ảnh Story vượt quá dung lượng tối đa 1MB.`);
        if (file.type.startsWith('video/') && file.size > 50 * 1024 * 1024) throw new Error(`Video Story vượt quá dung lượng tối đa 50MB.`);
        
        const formData = new FormData();
        formData.append('file', file);
        const uploaded = await postApi.uploadMedia(formData);
        newMediaList.push({ ...uploaded, file, mediaType: file.type.startsWith('video/') ? 'video' : 'image', previewUrl: URL.createObjectURL(file) });
      } else {
        const hasVideo = files.some(f => f.type.startsWith('video/'));
        if (hasVideo) {
          const videoFile = files.find(f => f.type.startsWith('video/'));
          if (videoFile.size > 50 * 1024 * 1024) throw new Error(`Video vượt quá dung lượng tối đa 50MB.`);
          const formData = new FormData();
          formData.append('file', videoFile);
          const uploaded = await postApi.uploadMedia(formData);
          newMediaList.push({ ...uploaded, file: videoFile, mediaType: 'video', previewUrl: URL.createObjectURL(videoFile) });
        } else {
          for (const img of files) {
            if (img.size > 1024 * 1024) continue;
            const formData = new FormData();
            formData.append('file', img);
            const uploaded = await postApi.uploadMedia(formData);
            newMediaList.push({ ...uploaded, file: img, mediaType: 'image', previewUrl: URL.createObjectURL(img) });
          }
        }
      }

      setDrafts(prev => prev.map((d, i) => {
        if (i !== index) return d;
        const currentMedia = d.mediaList || [];
        const combined = [...currentMedia, ...newMediaList];
        const mediaType = postType === 'feed' ? (combined.some(m => m.mediaType === 'video') ? 'video' : (combined.length > 0 ? 'image' : null)) : postType;
        const mediaLinks = combined.map(m => m.mediaLink);
        return { ...d, uploadingMedia: false, mediaList: combined, media_type: mediaType, media_links: mediaLinks, postType };
      }));
    } catch (err) {
      alert(err.message || 'Lỗi tải file');
      setDrafts(prev => prev.map((d, i) => i === index ? { ...d, uploadingMedia: false } : d));
    }
    
    event.target.value = '';
  };
  
  const handleRemoveMedia = (draftIndex, mediaIndex) => {
    setDrafts(prev => prev.map((d, i) => {
      if (i !== draftIndex) return d;
      const newList = [...(d.mediaList || [])];
      newList.splice(mediaIndex, 1);
      const mediaType = d.postType === 'feed' ? (newList.some(m => m.mediaType === 'video') ? 'video' : (newList.length > 0 ? 'image' : null)) : (newList.length > 0 ? d.postType : null);
      const mediaLinks = newList.map(m => m.mediaLink);
      return { ...d, mediaList: newList, media_type: mediaType, media_links: mediaLinks };
    }));
  };

  // ── AI Image & Watermark Studio State & Handlers ──
  const [imageStudioOpen, setImageStudioOpen] = useState(false);
  const [activeStudioDraftIndex, setActiveStudioDraftIndex] = useState(null);
  const [batchImageGenerating, setBatchImageGenerating] = useState(false);

  const handleOpenImageStudio = (draftIndex) => {
    setActiveStudioDraftIndex(draftIndex);
    setImageStudioOpen(true);
  };

  const handleApplyImageFromStudio = (mediaItem) => {
    if (activeStudioDraftIndex === null) return;
    setDrafts(prev => prev.map((d, i) => {
      if (i !== activeStudioDraftIndex) return d;
      const currentMedia = d.mediaList || [];
      const updatedMedia = [...currentMedia, mediaItem];
      const mediaType = d.postType === 'reel' ? 'reel' : (d.postType === 'story' ? 'story' : 'image');
      const mediaLinks = updatedMedia.map(m => m.mediaLink);
      return {
        ...d,
        mediaList: updatedMedia,
        media_type: mediaType,
        media_links: mediaLinks,
        postType: d.postType || 'feed'
      };
    }));
  };

  const handleBatchGenerateImages = async () => {
    if (batchImageGenerating || drafts.length === 0) return;
    setBatchImageGenerating(true);
    try {
      const draftsToGen = drafts.map((d, idx) => ({
        draftId: d.id || idx,
        title: d.title,
        topic: d.topic,
        content: d.content
      }));
      const res = await aiApi.batchGenerateImages({ drafts: draftsToGen });
      if (res.success && Array.isArray(res.results)) {
        setDrafts(prev => prev.map((d, i) => {
          const match = res.results.find(r => r.draftId === (d.id || i));
          if (match && match.success) {
            const newMediaItem = {
              mediaLink: match.mediaLink,
              previewUrl: match.previewUrl,
              mediaType: 'image',
              fileName: match.fileName,
              aiGenerated: true
            };
            const currentMedia = d.mediaList || [];
            const updatedMedia = [...currentMedia, newMediaItem];
            return {
              ...d,
              mediaList: updatedMedia,
              media_type: d.postType === 'reel' ? 'reel' : (d.postType === 'story' ? 'story' : 'image'),
              media_links: updatedMedia.map(m => m.mediaLink),
              postType: d.postType || 'feed'
            };
          }
          return d;
        }));
      }
    } catch (err) {
      alert('Lỗi tạo ảnh hàng loạt: ' + err.message);
    } finally {
      setBatchImageGenerating(false);
    }
  };

  // ── Step 3: Publish ──
  const canPublish = drafts.length > 0 && drafts.every(d => d.selected_page_ids?.length > 0);

  const handlePublish = async () => {
    if (publishing) return;
    setPublishing(true);
    setPublishResult(null);
    try {
      const draftItems = drafts.map(d => ({
        draftId: d.id,
        content: d.content,
        pageIds: d.selected_page_ids,
        scheduledAt: d.scheduled_at || null,
        hashtags: d.hashtags,
        mediaType: d.media_type || null,
        mediaLinks: d.media_links || []
      }));
      const res = await aiApi.publishDrafts(draftItems);
      setPublishResult(res);
      if (res.success) {
        setStep(3);
      }
    } catch (err) {
      setPublishResult({ success: false, message: err.response?.data?.message || err.message });
    } finally {
      setPublishing(false);
    }
  };

  const handleStartOver = () => {
    setStep(1);
    setDrafts([]);
    setBatchId(null);
    setPrompt('');
    setError('');
    setPublishResult(null);
  };

  // ── Render ──
  return (
    <MainLayout
      title="AI Tạo bài hàng loạt"
      actions={
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Link
            href="/ai-studio"
            className="button button-quiet"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}
          >
            <MessageSquare size={15} /> Chat Trợ lý AI
          </Link>
          {step === 2 && (
            <button className="button button-quiet" type="button" onClick={handleStartOver}>
              <RotateCcw size={15} /> Bắt đầu lại
            </button>
          )}
        </div>
      }
    >
      {/* ── Progress Steps (Apple Frosted Crystal Glass) ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28, padding: '14px 22px',
        background: 'var(--apple-glass-bg)',
        backdropFilter: 'var(--apple-glass-blur)',
        WebkitBackdropFilter: 'var(--apple-glass-blur)',
        borderRadius: 20,
        border: 'var(--apple-glass-border)',
        borderTop: 'var(--apple-glass-border-top)',
        boxShadow: 'var(--apple-glass-shadow)'
      }}>
        {[
          { num: 1, label: 'Nhập yêu cầu', icon: Wand2 },
          { num: 2, label: 'Chỉnh sửa bài', icon: PenLine },
          { num: 3, label: 'Hoàn tất', icon: CheckCircle2 }
        ].map((s, idx) => {
          const isActive = step === s.num;
          const isDone = step > s.num;
          return (
            <div key={s.num} style={{ display: 'flex', alignItems: 'center', gap: 10, flex: idx < 2 ? 1 : 'none' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', borderRadius: 14,
                background: isActive
                  ? 'rgba(37, 99, 235, 0.12)'
                  : isDone
                    ? 'rgba(16, 185, 129, 0.12)'
                    : 'var(--apple-glass-bg-subtle)',
                border: `1px solid ${isActive ? 'rgba(37, 99, 235, 0.35)' : isDone ? 'rgba(16, 185, 129, 0.3)' : 'rgba(255, 255, 255, 0.55)'}`,
                borderTop: `1px solid ${isActive ? 'rgba(37, 99, 235, 0.6)' : isDone ? 'rgba(16, 185, 129, 0.6)' : 'rgba(255, 255, 255, 0.95)'}`,
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                boxShadow: isActive ? '0 4px 14px rgba(37, 99, 235, 0.15)' : 'none',
                transition: 'all 0.22s cubic-bezier(0.16, 1, 0.3, 1)'
              }}>
                <div style={{
                  width: 30, height: 30, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: isActive ? 'linear-gradient(135deg, #2563eb, #1d4ed8)' : isDone ? 'linear-gradient(135deg, #10b981, #059669)' : 'rgba(0, 0, 0, 0.06)',
                  fontSize: 13, fontWeight: 800, color: step >= s.num ? '#ffffff' : 'var(--muted)',
                  boxShadow: isActive ? '0 2px 8px rgba(37, 99, 235, 0.35)' : 'none'
                }}>
                  {isDone ? <Check size={15} color="#fff" strokeWidth={3} /> : s.num}
                </div>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: step >= s.num ? 'var(--ink)' : 'var(--muted)', whiteSpace: 'nowrap' }}>
                  {s.label}
                </span>
              </div>
              {idx < 2 && (
                <div style={{ flex: 1, height: 2, background: isDone ? '#10b981' : 'rgba(100, 116, 139, 0.22)', borderRadius: 2, margin: '0 6px', transition: 'background 0.3s' }} />
              )}
            </div>
          );
        })}
      </div>

      {/* ═══ STEP 1: Input Prompt ═══ */}
      {step === 1 && (
        <div style={{ maxWidth: 840, margin: '0 auto' }}>
          {/* Hero */}
          <div style={{
            textAlign: 'center', marginBottom: 28, padding: '30px 24px',
            background: 'var(--apple-glass-bg)',
            backdropFilter: 'var(--apple-glass-blur)',
            WebkitBackdropFilter: 'var(--apple-glass-blur)',
            borderRadius: 24,
            border: 'var(--apple-glass-border)',
            borderTop: 'var(--apple-glass-border-top)',
            boxShadow: 'var(--apple-glass-shadow)',
            position: 'relative', overflow: 'hidden'
          }}>
            <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900, letterSpacing: '-0.3px', color: 'var(--ink)' }}>AI Tạo bài hàng loạt</h2>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
              <span className="glass-pill-badge" style={{ color: 'var(--blue)' }}>
                <Sparkles size={13} color="var(--blue)" /> Tạo cùng lúc 3-10 bài
              </span>
              <span className="glass-pill-badge" style={{ color: '#ec4899' }}>
                <Wand2 size={13} color="#ec4899" /> Tự động vẽ ảnh AI
              </span>
              <span className="glass-pill-badge" style={{ color: '#10b981' }}>
                <Clock size={13} color="#10b981" /> Hẹn giờ Meta Cloud
              </span>
            </div>
          </div>

          {/* Quick Templates */}
          <div style={{ marginBottom: 22 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Zap size={14} color="var(--blue)" /> Mẫu gợi ý nhanh:
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {quickTemplates.map((tmpl, idx) => (
                <button key={idx} type="button" onClick={() => handleTemplateClick(tmpl)} style={{
                  background: 'var(--apple-glass-bg)',
                  backdropFilter: 'blur(16px)',
                  WebkitBackdropFilter: 'blur(16px)',
                  border: 'var(--apple-glass-border)',
                  borderTop: 'var(--apple-glass-border-top)',
                  borderRadius: 12, padding: '9px 16px', cursor: 'pointer', color: 'var(--ink)',
                  fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8,
                  transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                  boxShadow: '0 2px 8px rgba(70, 55, 40, 0.03)'
                }}
                  onMouseOver={e => {
                    e.currentTarget.style.borderColor = 'var(--blue)';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 6px 16px rgba(37, 99, 235, 0.12)';
                  }}
                  onMouseOut={e => {
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.65)';
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 2px 8px rgba(70, 55, 40, 0.03)';
                  }}
                >
                  <span style={{ fontSize: 16 }}>{tmpl.icon}</span> {tmpl.label}
                </button>
              ))}
            </div>
          </div>

          {/* Prompt Input Box */}
          <div style={{
            background: 'var(--apple-glass-bg)',
            backdropFilter: 'var(--apple-glass-blur)',
            WebkitBackdropFilter: 'var(--apple-glass-blur)',
            borderRadius: 18,
            border: 'var(--apple-glass-border)',
            borderTop: 'var(--apple-glass-border-top)',
            padding: 22, marginBottom: 18,
            boxShadow: 'var(--apple-glass-shadow)'
          }}>
            <textarea
              ref={textareaRef}
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="Mô tả yêu cầu tạo bài... VD: Tạo cho tao 3 bài về 3 chủ đề khác nhau: bán quần áo, review đồ ăn, và mẹo làm đẹp"
              style={{
                width: '100%', minHeight: 110, background: 'transparent', border: 'none', outline: 'none',
                color: 'var(--ink)', fontSize: 15, lineHeight: 1.7, resize: 'none', fontFamily: 'inherit'
              }}
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleGenerate();
              }}
            />
          </div>

          {/* Options */}
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20, alignItems: 'center'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>Giọng văn:</label>
              <select
                value={tone}
                onChange={e => setTone(e.target.value)}
                style={{
                  background: 'var(--apple-glass-bg)',
                  border: 'var(--apple-glass-border)',
                  borderTop: 'var(--apple-glass-border-top)',
                  backdropFilter: 'var(--apple-glass-blur)',
                  WebkitBackdropFilter: 'var(--apple-glass-blur)',
                  borderRadius: 10, padding: '8px 14px', color: 'var(--ink)', fontSize: 13, cursor: 'pointer', outline: 'none',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
                }}
              >
                {toneOptions.map(t => <option key={t.value} value={t.value} style={{ background: 'var(--panel)', color: 'var(--ink)' }}>{t.label}</option>)}
              </select>
            </div>

            <button type="button" onClick={() => setIncludeEmoji(!includeEmoji)} style={{
              background: includeEmoji ? 'rgba(37, 99, 235, 0.12)' : 'var(--apple-glass-bg)',
              border: includeEmoji ? '1px solid rgba(37, 99, 235, 0.4)' : 'var(--apple-glass-border)',
              borderTop: includeEmoji ? '1px solid rgba(37, 99, 235, 0.6)' : 'var(--apple-glass-border-top)',
              borderRadius: 10, padding: '8px 14px', cursor: 'pointer',
              color: includeEmoji ? 'var(--blue)' : 'var(--muted)', fontSize: 13, fontWeight: 700,
              display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.2s',
              boxShadow: includeEmoji ? '0 2px 8px rgba(37, 99, 235, 0.15)' : '0 1px 3px rgba(0,0,0,0.02)'
            }}>
              <Smile size={15} color={includeEmoji ? 'var(--blue)' : 'currentColor'} /> Emoji {includeEmoji ? 'BẬT' : 'TẮT'}
            </button>

            <button type="button" onClick={() => setIncludeHashtags(!includeHashtags)} style={{
              background: includeHashtags ? 'rgba(124, 58, 237, 0.12)' : 'var(--apple-glass-bg)',
              border: includeHashtags ? '1px solid rgba(124, 58, 237, 0.4)' : 'var(--apple-glass-border)',
              borderTop: includeHashtags ? '1px solid rgba(124, 58, 237, 0.6)' : 'var(--apple-glass-border-top)',
              borderRadius: 10, padding: '8px 14px', cursor: 'pointer',
              color: includeHashtags ? 'var(--purple)' : 'var(--muted)', fontSize: 13, fontWeight: 700,
              display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.2s',
              boxShadow: includeHashtags ? '0 2px 8px rgba(124, 58, 237, 0.15)' : '0 1px 3px rgba(0,0,0,0.02)'
            }}>
              <Hash size={15} color={includeHashtags ? 'var(--purple)' : 'currentColor'} /> Hashtag {includeHashtags ? 'BẬT' : 'TẮT'}
            </button>
          </div>

          {/* Error */}
          {error && (
            <div style={{
              padding: '12px 16px', borderRadius: 12, marginBottom: 16,
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', fontSize: 13, fontWeight: 600
            }}>
              {error}
            </div>
          )}

          {/* Generate Button */}
          <button
            type="button"
            onClick={handleGenerate}
            disabled={!prompt.trim() || generating}
            className={`ai-generate-main-btn ${prompt.trim() && !generating ? 'is-ready' : 'is-disabled'}`}
          >
            {generating ? (
              <><Loader2 size={18} className="animate-spin" /> AI đang tạo bài...</>
            ) : (
              <><Sparkles size={18} /> Tạo bài viết</>
            )}
          </button>
          <div style={{ textAlign: 'center', marginTop: 10, fontSize: 12, color: 'var(--muted)' }}>
            Ctrl+Enter để tạo nhanh
          </div>
        </div>
      )}

      {/* ═══ STEP 2: Edit Drafts ═══ */}
      {step === 2 && (
        <div>
          {/* Batch info bar */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: 20, padding: '14px 20px',
            background: 'var(--apple-glass-bg)',
            backdropFilter: 'var(--apple-glass-blur)',
            WebkitBackdropFilter: 'var(--apple-glass-blur)',
            borderRadius: 16,
            border: 'var(--apple-glass-border)',
            borderTop: 'var(--apple-glass-border-top)',
            boxShadow: 'var(--apple-glass-shadow)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
              <FileText size={16} style={{ color: '#2563eb' }} />
              <span style={{ fontWeight: 700, color: 'var(--ink)' }}>AI đã tạo {drafts.length} bài</span>
              <span style={{ color: 'var(--muted)' }}>· Chỉnh sửa & chọn Fanpage trước khi đăng</span>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                type="button"
                className="button button-quiet"
                onClick={() => loadChannels(true)}
                disabled={channelsLoading}
                style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}
                title="Tải lại danh sách Fanpage từ hệ thống"
              >
                <RefreshCw size={12} className={channelsLoading ? 'animate-spin' : ''} />
                Làm mới kênh
              </button>
              {channels.length > 0 && (
                <>
                  <button
                    type="button"
                    className="button button-quiet"
                    onClick={() => handleApplyPagesToAll(channels.map(c => c.id))}
                    style={{ fontSize: 12, color: 'var(--blue)' }}
                  >
                    Chọn tất cả {channels.length} Fanpage cho mọi bài
                  </button>
                  <button
                    type="button"
                    className="button button-quiet"
                    onClick={handleBatchGenerateImages}
                    disabled={batchImageGenerating}
                    style={{ fontSize: 12, color: '#ec4899', borderColor: 'rgba(236,72,153,0.3)', display: 'flex', alignItems: 'center', gap: 5 }}
                    title="AI tự động phân tích chủ đề từng bài viết và vẽ ảnh minh họa chất lượng cao"
                  >
                    {batchImageGenerating ? (
                      <><Loader2 size={12} className="animate-spin" /> Đang vẽ ảnh hàng loạt...</>
                    ) : (
                      <><Wand2 size={12} /> 🎨 AI Tự vẽ ảnh cho tất cả bài</>
                    )}
                  </button>
                  <button
                    type="button"
                    className="button button-quiet"
                    onClick={() => handleDistributeSchedule(30)}
                    style={{ fontSize: 12, color: '#10b981' }}
                    title="Tự động đặt lịch đăng cho từng bài cách nhau 30 phút, bắt đầu sau 15 phút để lên lịch thẳng Facebook Cloud"
                  >
                    📅 Giãn cách lịch tự động (+30p/bài)
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Draft Cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {drafts.map((draft, index) => (
              <div key={draft.id} className="hologram-card-3d" style={{
                overflow: 'hidden',
                background: 'var(--apple-glass-bg)',
                backdropFilter: 'var(--apple-glass-blur)',
                WebkitBackdropFilter: 'var(--apple-glass-blur)',
                borderRadius: 20,
                border: 'var(--apple-glass-border)',
                borderTop: 'var(--apple-glass-border-top)',
                boxShadow: 'var(--apple-glass-shadow)'
              }}>
                {/* Card Header */}
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '14px 20px',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.45)',
                  background: 'var(--apple-glass-bg-subtle)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: '#eff6ff', fontSize: 13, fontWeight: 800, color: '#2563eb',
                      border: '1px solid #bfdbfe',
                      boxShadow: '0 1px 3px rgba(37, 99, 235, 0.1)'
                    }}>
                      #{index + 1}
                    </div>
                    <span style={{
                      padding: '4px 12px', borderRadius: 8, fontSize: 11.5, fontWeight: 700,
                      background: 'rgba(168,85,247,0.12)', color: '#7c3aed', letterSpacing: '0.02em',
                      border: '1px solid rgba(168,85,247,0.25)', boxShadow: '0 2px 8px rgba(168,85,247,0.1)'
                    }}>
                      {draft.topic || 'Bài viết'}
                    </span>
                    {draft.suggested_time && (
                      <span style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Clock size={13} color="var(--blue)" /> Gợi ý: {draft.suggested_time}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" onClick={() => handleCopyContent(draft.content, draft.id)} style={{
                      background: 'var(--apple-glass-bg-subtle)', border: '1px solid rgba(255,255,255,0.5)',
                      borderRadius: 8, padding: '5px 8px', cursor: 'pointer', color: 'var(--ink)',
                      display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, transition: 'all 0.2s'
                    }} title="Copy nội dung">
                      {copiedId === draft.id ? <><Check size={13} color="#10b981" /> Đã copy</> : <><Copy size={13} /> Copy</>}
                    </button>
                    <button type="button" onClick={() => handleRegenerate(draft.id, index)} disabled={regeneratingId === draft.id} style={{
                      background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
                      borderRadius: 8, padding: '5px 8px', cursor: 'pointer', color: '#f59e0b',
                      display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, transition: 'all 0.2s',
                      opacity: regeneratingId === draft.id ? 0.6 : 1
                    }} title="Tạo lại bài này">
                      {regeneratingId === draft.id ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                      Tạo lại
                    </button>
                    <button type="button" onClick={() => handleDeleteDraft(draft.id, index)} style={{
                      background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                      borderRadius: 8, padding: '5px 8px', cursor: 'pointer', color: '#ef4444',
                      display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, transition: 'all 0.2s'
                    }} title="Xóa bài này">
                      <Trash2 size={13} /> Xóa
                    </button>
                  </div>
                </div>

                {/* Card Body */}
                <div style={{ padding: 18 }}>
                  {/* Content editor */}
                  <textarea
                    value={draft.content}
                    onChange={e => handleUpdateDraftField(index, 'content', e.target.value)}
                    style={{
                      width: '100%', minHeight: 120,
                      background: 'var(--apple-glass-bg-subtle)',
                      border: 'var(--apple-glass-border)',
                      borderTop: 'var(--apple-glass-border-top)',
                      borderRadius: 12, padding: 14,
                      color: 'var(--ink)', fontSize: 14, lineHeight: 1.7, resize: 'vertical',
                      outline: 'none', fontFamily: 'inherit', transition: 'border-color 0.2s'
                    }}
                    onFocus={e => e.target.style.borderColor = 'var(--blue)'}
                    onBlur={e => e.target.style.borderColor = 'rgba(255, 255, 255, 0.65)'}
                  />

                  {/* Hashtags */}
                  {draft.hashtags?.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                      {draft.hashtags.map((tag, ti) => (
                        <span key={ti} style={{
                          padding: '3px 10px', borderRadius: 6, fontSize: 12, fontWeight: 500,
                          background: 'rgba(168,85,247,0.08)', color: '#a855f7', border: '1px solid rgba(168,85,247,0.15)'
                        }}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Media Section */}
                  <div style={{ marginTop: 14 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 8 }}>
                      Đính kèm Media:
                    </div>
                    
                    <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                      <button
                        type="button"
                        onClick={() => handleOpenImageStudio(index)}
                        style={{
                          padding: '6px 14px', fontSize: 12, borderRadius: 8, height: 'auto',
                          display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                          background: 'rgba(37, 99, 235, 0.08)',
                          border: '1px solid rgba(37, 99, 235, 0.25)',
                          color: 'var(--blue)', fontWeight: 700
                        }}
                        title="Tự động vẽ ảnh minh họa theo nội dung bài và đóng dấu bản quyền thương hiệu"
                      >
                        <Sparkles size={13} color="var(--blue)" />
                        <span>✨ AI Tạo ảnh & Watermark</span>
                      </button>

                      <label style={{ cursor: 'pointer', padding: '6px 12px', background: 'var(--apple-glass-bg-subtle)', borderRadius: 8, fontSize: 12, border: '1px dashed rgba(255,255,255,0.45)', color: 'var(--ink)' }}>
                        <input type="file" multiple accept="image/*,video/*" hidden onChange={(e) => handleMediaChange(index, e, 'feed')} disabled={draft.uploadingMedia} />
                        Feed (Ảnh/Video)
                      </label>
                      <label style={{ cursor: 'pointer', padding: '6px 12px', background: 'var(--apple-glass-bg-subtle)', borderRadius: 8, fontSize: 12, border: '1px dashed rgba(255,255,255,0.45)', color: 'var(--ink)' }}>
                        <input type="file" accept="video/*" hidden onChange={(e) => handleMediaChange(index, e, 'reel')} disabled={draft.uploadingMedia} />
                        Reels
                      </label>
                      <label style={{ cursor: 'pointer', padding: '6px 12px', background: 'var(--apple-glass-bg-subtle)', borderRadius: 8, fontSize: 12, border: '1px dashed rgba(255,255,255,0.45)', color: 'var(--ink)' }}>
                        <input type="file" accept="image/*,video/*" hidden onChange={(e) => handleMediaChange(index, e, 'story')} disabled={draft.uploadingMedia} />
                        Story
                      </label>
                      {draft.uploadingMedia && <span style={{ fontSize: 12, color: 'var(--blue)', display: 'flex', alignItems: 'center' }}><Loader2 size={12} className="animate-spin" style={{marginRight: 4}}/> Đang tải...</span>}
                    </div>

                    {/* Media Gallery / Empty visual slot */}
                    {draft.mediaList?.length > 0 ? (
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
                        {draft.mediaList.map((m, mi) => (
                          <div key={mi} className="media-thumbnail-card" style={{ width: 96, height: 96 }}>
                            {m.mediaType === 'video' || m.previewUrl?.match(/\.mp4|blob/i) ? (
                              <video src={resolveMediaUrl(m.previewUrl)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                              <img src={resolveMediaUrl(m.previewUrl || m.mediaLink)} alt="media" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            )}
                            <button
                              type="button"
                              onClick={() => handleRemoveMedia(index, mi)}
                              style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.65)', border: 'none', borderRadius: '50%', padding: 4, cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}
                            >
                              <X size={12} />
                            </button>
                            {m.mediaType !== 'video' && (
                              <button
                                type="button"
                                title="Đóng dấu watermark cho ảnh này"
                                onClick={() => handleOpenImageStudio(index)}
                                style={{ position: 'absolute', top: 4, left: 4, background: 'rgba(0,0,0,0.7)', border: 'none', borderRadius: 4, padding: '2px 4px', cursor: 'pointer', color: '#00f2fe', display: 'flex', alignItems: 'center', gap: 2, fontSize: 9, fontWeight: 700, zIndex: 2 }}
                              >
                                <Stamp size={10} /> Dấu
                              </button>
                            )}
                            <div style={{ position: 'absolute', bottom: 4, left: 4, fontSize: 10, background: 'rgba(0,0,0,0.7)', padding: '2px 5px', borderRadius: 4, color: '#fff', textTransform: 'uppercase', fontWeight: 600, zIndex: 2 }}>
                              {m.watermarked ? '💧 DAU' : (m.aiGenerated ? '✨ AI' : (draft.postType || 'feed'))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{
                        marginTop: 8, padding: '12px 16px', borderRadius: 12,
                        background: 'var(--apple-glass-bg-subtle)',
                        border: '1px dashed rgba(37, 99, 235, 0.35)',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)', fontSize: 12 }}>
                          <ImageIcon size={15} color="var(--blue)" />
                          <span>Chưa có ảnh/video — Bấm các nút trên để đính kèm hoặc tạo ảnh AI</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleOpenImageStudio(index)}
                          style={{
                            padding: '4px 10px', borderRadius: 8, fontSize: 11.5, fontWeight: 700,
                            background: 'rgba(37, 99, 235, 0.1)', border: '1px solid rgba(37, 99, 235, 0.3)',
                            color: 'var(--blue)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4
                          }}
                        >
                          <Sparkles size={11} /> Tạo ảnh
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Page selection */}
                  <div style={{ marginTop: 14 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span>Chọn Fanpage đăng bài:</span>
                        <button
                          type="button"
                          onClick={() => loadChannels(true)}
                          disabled={channelsLoading}
                          title="Tải lại danh sách Fanpage từ hệ thống"
                          style={{
                            background: 'none', border: 'none', color: 'var(--blue)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 2
                          }}
                        >
                          <RefreshCw size={12} className={channelsLoading ? 'animate-spin' : ''} />
                        </button>
                      </div>
                      {channels.length > 0 && (
                        <button type="button" onClick={() => handleToggleAllPagesForDraft(index)} style={{
                          background: 'none', border: 'none', color: 'var(--blue)', cursor: 'pointer', fontSize: 11, fontWeight: 600
                        }}>
                          {draft.selected_page_ids?.length === channels.length ? 'Bỏ chọn hết' : 'Chọn tất cả'}
                        </button>
                      )}
                    </div>
                    {channels.length === 0 ? (
                      <div style={{
                        fontSize: 12, color: 'var(--muted)', padding: '10px 14px',
                        background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)',
                        borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8
                      }}>
                        <span>⚠️ Chưa tìm thấy Fanpage nào. Bạn đã liên kết nick/token ở mục <strong>Kênh</strong> chưa?</span>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <button
                            type="button"
                            onClick={() => loadChannels(true)}
                            className="button button-quiet"
                            style={{ padding: '3px 10px', fontSize: 11, height: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}
                          >
                            <RefreshCw size={11} className={channelsLoading ? 'animate-spin' : ''} /> Tải lại
                          </button>
                          <Link
                            href="/channels"
                            className="button button-quiet"
                            style={{ padding: '3px 10px', fontSize: 11, height: 'auto', textDecoration: 'none', color: 'var(--blue)' }}
                          >
                            Đến trang Kênh
                          </Link>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {channels.map(ch => {
                          const selected = draft.selected_page_ids?.includes(ch.id);
                          return (
                            <button key={ch.id} type="button" onClick={() => handleTogglePage(index, ch.id)} style={{
                              padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                              background: selected ? 'rgba(37, 99, 235, 0.12)' : 'var(--apple-glass-bg-subtle)',
                              border: `1px solid ${selected ? 'rgba(37, 99, 235, 0.4)' : 'rgba(255,255,255,0.45)'}`,
                              color: selected ? 'var(--blue)' : 'var(--ink)', transition: 'all 0.2s',
                              display: 'flex', alignItems: 'center', gap: 6
                            }}>
                              {selected && <Check size={12} />}
                              <span>{ch.name || ch.id}</span>
                              {ch.fbAccountName && (
                                <span style={{ fontSize: 10, opacity: 0.6 }}>({ch.fbAccountName})</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Schedule */}
                  <div style={{ marginTop: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <CalendarDays size={14} style={{ color: 'var(--muted)' }} />
                        <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>Lịch đăng:</label>
                      </div>
                      <input
                        type="datetime-local"
                        value={draft.scheduled_at ? new Date(new Date(draft.scheduled_at).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ''}
                        onChange={e => handleUpdateDraftField(index, 'scheduled_at', e.target.value ? new Date(e.target.value).toISOString() : null)}
                        style={{
                          background: 'var(--apple-glass-bg-subtle)', border: '1px solid rgba(255,255,255,0.5)',
                          borderRadius: 8, padding: '5px 10px', color: 'var(--ink)', fontSize: 12, outline: 'none'
                        }}
                      />
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button type="button" onClick={() => handleSetQuickSchedule(index, 15)} style={{ fontSize: 11, padding: '4px 8px', borderRadius: 6, background: 'var(--apple-glass-bg-subtle)', border: '1px solid rgba(255,255,255,0.45)', color: 'var(--ink)', cursor: 'pointer' }}>+15 phút (FB Cloud)</button>
                        <button type="button" onClick={() => handleSetQuickSchedule(index, 60)} style={{ fontSize: 11, padding: '4px 8px', borderRadius: 6, background: 'var(--apple-glass-bg-subtle)', border: '1px solid rgba(255,255,255,0.45)', color: 'var(--ink)', cursor: 'pointer' }}>+1 giờ</button>
                        <button type="button" onClick={() => handleSetQuickSchedule(index, 180)} style={{ fontSize: 11, padding: '4px 8px', borderRadius: 6, background: 'var(--apple-glass-bg-subtle)', border: '1px solid rgba(255,255,255,0.45)', color: 'var(--ink)', cursor: 'pointer' }}>+3 giờ</button>
                        {draft.scheduled_at && (
                          <button type="button" onClick={() => handleSetQuickSchedule(index, null)} style={{ fontSize: 11, padding: '4px 8px', borderRadius: 6, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', cursor: 'pointer' }}>Đăng ngay</button>
                        )}
                      </div>
                    </div>

                    {/* Schedule mode explanation badge */}
                    {(() => {
                      if (!draft.scheduled_at) {
                        return (
                          <div className="glass-pill-badge" style={{ color: 'var(--muted)', fontSize: 11.5, marginTop: 4 }}>
                            ⚡ Đăng ngay lập tức
                          </div>
                        );
                      }
                      const diffMins = (new Date(draft.scheduled_at).getTime() - Date.now()) / 60000;
                      if (draft.postType === 'reel' || draft.postType === 'story') {
                        return (
                          <div className="glass-pill-badge" style={{ color: '#f59e0b', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', fontSize: 11.5, marginTop: 4 }}>
                            ⚡ Hàng đợi máy tính (Cần mở app khi đến giờ)
                          </div>
                        );
                      }
                      if (diffMins >= 11 && diffMins <= 29 * 24 * 60) {
                        return (
                          <div className="glass-pill-badge" style={{ color: '#10b981', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)', fontSize: 11.5, marginTop: 4 }}>
                            ☁️ Meta Cloud Planner (Tắt máy/app vẫn tự đăng)
                          </div>
                        );
                      }
                      return (
                        <div className="glass-pill-badge" style={{ color: '#f59e0b', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', fontSize: 11.5, marginTop: 4 }}>
                          ⚠️ Hàng đợi máy (&lt; 11 phút)
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Bottom Actions - Sticky Crystal Glass Dock */}
          {drafts.length > 0 && (
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginTop: 24, padding: '16px 24px',
              position: 'sticky', bottom: 18, zIndex: 40,
              background: 'var(--apple-glass-bg)',
              backdropFilter: 'var(--apple-glass-blur)',
              WebkitBackdropFilter: 'var(--apple-glass-blur)',
              borderRadius: 20,
              border: 'var(--apple-glass-border)',
              borderTop: 'var(--apple-glass-border-top)',
              boxShadow: 'var(--apple-glass-shadow)'
            }}>
              <div style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>
                <span style={{ color: 'var(--blue)', fontWeight: 800 }}>{drafts.length}</span> bài viết · <span style={{ color: '#10b981', fontWeight: 800 }}>{drafts.filter(d => d.selected_page_ids?.length > 0).length}</span> đã chọn Fanpage
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  style={{
                    padding: '10px 18px', borderRadius: 12, cursor: 'pointer',
                    background: 'var(--apple-glass-bg-subtle)',
                    backdropFilter: 'var(--apple-glass-blur)',
                    WebkitBackdropFilter: 'var(--apple-glass-blur)',
                    border: 'var(--apple-glass-border)',
                    borderTop: 'var(--apple-glass-border-top)',
                    color: 'var(--ink)', fontSize: 13, fontWeight: 600,
                    display: 'flex', alignItems: 'center', gap: 6,
                    transition: 'all 0.2s'
                  }}
                >
                  <ChevronLeft size={15} /> Quay lại
                </button>
                <button
                  type="button"
                  onClick={handlePublish}
                  disabled={!canPublish || publishing}
                  style={{
                    padding: '11px 26px', borderRadius: 12, cursor: canPublish && !publishing ? 'pointer' : 'not-allowed',
                    background: canPublish && !publishing
                      ? 'linear-gradient(135deg, #10b981, #059669)'
                      : 'var(--apple-glass-bg-subtle)',
                    border: canPublish && !publishing
                      ? '1px solid rgba(16, 185, 129, 0.4)'
                      : 'var(--apple-glass-border)',
                    borderTop: canPublish && !publishing
                      ? '1px solid rgba(255, 255, 255, 0.5)'
                      : 'var(--apple-glass-border-top)',
                    color: canPublish && !publishing ? '#fff' : 'var(--muted)',
                    fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8,
                    boxShadow: canPublish && !publishing ? '0 4px 18px rgba(16, 185, 129, 0.35)' : 'none',
                    opacity: canPublish && !publishing ? 1 : 0.65,
                    transition: 'all 0.3s'
                  }}
                >
                  {publishing ? (
                    <><Loader2 size={16} className="animate-spin" /> Đang lên lịch...</>
                  ) : (
                    <><Send size={16} /> Đăng {drafts.length} bài viết</>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Publish error */}
          {publishResult && !publishResult.success && (
            <div style={{
              marginTop: 14, padding: '14px 18px', borderRadius: 14,
              background: 'rgba(239,68,68,0.10)',
              backdropFilter: 'var(--apple-glass-blur)',
              WebkitBackdropFilter: 'var(--apple-glass-blur)',
              border: '1px solid rgba(239,68,68,0.3)',
              color: '#ef4444', fontSize: 13, fontWeight: 600,
              boxShadow: '0 4px 14px rgba(239,68,68,0.1)'
            }}>
              ❌ {publishResult.message}
            </div>
          )}
        </div>
      )}

      {/* ═══ STEP 3: Hoàn tất & Xuất bản thành công ═══ */}
      {step === 3 && (
        <div style={{
          maxWidth: 720, margin: '30px auto', textAlign: 'center',
          padding: '40px 36px',
          background: 'var(--apple-glass-bg)',
          backdropFilter: 'var(--apple-glass-blur)',
          WebkitBackdropFilter: 'var(--apple-glass-blur)',
          borderRadius: 24,
          border: 'var(--apple-glass-border)',
          borderTop: 'var(--apple-glass-border-top)',
          boxShadow: 'var(--apple-glass-shadow)'
        }}>
          {publishResult?.success ? (
            <>
              <div style={{
                width: 80, height: 80, borderRadius: 24, margin: '0 auto 20px',
                background: 'linear-gradient(135deg, rgba(16,185,129,0.22), rgba(5,150,105,0.15))',
                backdropFilter: 'var(--apple-glass-blur)',
                WebkitBackdropFilter: 'var(--apple-glass-blur)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '2px solid rgba(16,185,129,0.4)',
                boxShadow: '0 8px 28px rgba(16, 185, 129, 0.25)'
              }}>
                <CheckCircle2 size={44} color="#10b981" />
              </div>
              <h2 style={{ margin: '0 0 8px', fontSize: 26, fontWeight: 800, color: 'var(--ink)' }}>Hoàn tất thành công! 🎉</h2>
              <p style={{ color: 'var(--muted)', fontSize: 15, lineHeight: 1.6, marginBottom: 26 }}>
                {publishResult.message || 'Các bài viết đã được xử lý và phân phối thành công theo kế hoạch.'}
              </p>

              {/* Results summary */}
              <div style={{
                background: 'var(--apple-glass-bg-subtle)',
                backdropFilter: 'var(--apple-glass-blur)',
                WebkitBackdropFilter: 'var(--apple-glass-blur)',
                borderRadius: 18,
                border: 'var(--apple-glass-border)',
                borderTop: 'var(--apple-glass-border-top)',
                padding: 22, marginBottom: 28, textAlign: 'left',
                boxShadow: 'var(--apple-glass-shadow)'
              }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14, color: 'var(--ink)' }}>Chi tiết kết quả xuất bản:</div>
                {publishResult.results?.map((r, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0',
                    borderBottom: i < publishResult.results.length - 1 ? '1px solid var(--line)' : 'none'
                  }}>
                    {r.success ? (
                      <CheckCircle2 size={16} color="#10b981" />
                    ) : (
                      <X size={16} color="#ef4444" />
                    )}
                    <div style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600, color: 'var(--ink)' }}>Bài #{i + 1}: {r.success ? `Đã tạo ${r.postIds?.length || 0} bài đăng` : `❌ ${r.message}`}</span>
                      {r.isFbCloud && (
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: 'rgba(16,185,129,0.15)', color: '#10b981', fontWeight: 700, border: '1px solid rgba(16,185,129,0.3)' }}>
                          ☁️ Đã đồng bộ lên lịch Facebook Cloud
                        </span>
                      )}
                      {r.success && !r.isFbCloud && (
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: 'rgba(245,158,11,0.15)', color: '#f59e0b', fontWeight: 700, border: '1px solid rgba(245,158,11,0.3)' }}>
                          ⚡ Đang chờ trong hàng đợi máy
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <div style={{
                width: 80, height: 80, borderRadius: 24, margin: '0 auto 20px',
                background: 'linear-gradient(135deg, rgba(239,68,68,0.2), rgba(220,38,38,0.12))',
                backdropFilter: 'var(--apple-glass-blur)',
                WebkitBackdropFilter: 'var(--apple-glass-blur)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '2px solid rgba(239,68,68,0.4)',
                boxShadow: '0 8px 28px rgba(239, 68, 68, 0.25)'
              }}>
                <X size={44} color="#ef4444" />
              </div>
              <h2 style={{ margin: '0 0 8px', fontSize: 24, fontWeight: 800, color: 'var(--ink)' }}>Chưa hoàn tất</h2>
              <p style={{ color: 'var(--muted)', fontSize: 15, lineHeight: 1.6, marginBottom: 26 }}>
                {publishResult?.message || 'Có lỗi xảy ra hoặc các bài viết chưa được đăng.'}
              </p>
            </>
          )}

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handleStartOver}
              style={{
                padding: '11px 22px', borderRadius: 12, cursor: 'pointer',
                background: 'var(--apple-glass-bg-subtle)',
                backdropFilter: 'var(--apple-glass-blur)',
                WebkitBackdropFilter: 'var(--apple-glass-blur)',
                border: 'var(--apple-glass-border)',
                borderTop: 'var(--apple-glass-border-top)',
                color: 'var(--ink)', fontSize: 14, fontWeight: 700,
                display: 'inline-flex', alignItems: 'center', gap: 8,
                transition: 'all 0.2s'
              }}
            >
              <Plus size={15} /> Tạo batch mới
            </button>
            <Link href="/post-planner/list" style={{
              padding: '11px 24px', borderRadius: 12, border: 'none', cursor: 'pointer',
              background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', color: '#fff',
              fontSize: 14, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 8,
              textDecoration: 'none', boxShadow: '0 4px 16px rgba(37, 99, 235, 0.35)',
              transition: 'all 0.2s'
            }}>
              Xem danh sách bài đăng <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      )}

      {/* ═══ AI IMAGE & WATERMARK STUDIO MODAL ═══ */}
      <AiImageStudioModal
        isOpen={imageStudioOpen}
        onClose={() => {
          setImageStudioOpen(false);
          setActiveStudioDraftIndex(null);
        }}
        initialDraft={activeStudioDraftIndex !== null ? drafts[activeStudioDraftIndex] : null}
        onApplyMedia={handleApplyImageFromStudio}
      />
    </MainLayout>
  );
}
