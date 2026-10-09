import { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import {
  ArrowLeft,
  ArrowRight,
  AtSign,
  Check,
  CheckCircle2,
  CheckSquare,
  Hash,
  ImagePlus,
  MapPin,
  MessageCircle,
  Plus,
  Send,
  Smile,
  Sparkles,
  Square,
  Trash2,
  Type,
  X,
  XCircle,
  Film,
  Clock,
  Globe,
  Layers,
  ThumbsUp,
  Share2,
  Upload,
  Zap,
  AlertCircle,
  Eye,
  Play,
  Users
} from 'lucide-react';
import MainLayout from '../../components/layout/MainLayout';
import postApi from '../../services/postApi';
import aiApi from '../../services/aiApi';
import channelGroupApi from '../../services/channelGroupApi';

// ── Toast popup (fixed top-right, auto-dismiss) ──────────────────────────
function Toast({ toast, onClose }) {
  if (!toast) return null;
  const ok = toast.type === 'success';
  return (
    <div
      style={{
        position: 'fixed',
        top: 24,
        right: 24,
        zIndex: 9999,
        maxWidth: 420,
        minWidth: 280,
        background: ok ? 'rgba(4,20,10,0.97)' : 'rgba(20,4,4,0.97)',
        border: `1.5px solid ${ok ? 'rgba(16,185,129,0.6)' : 'rgba(239,68,68,0.6)'}`,
        borderRadius: 14,
        padding: '14px 18px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        boxShadow: `0 8px 36px ${ok ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.22)'}`,
        animation: 'toastIn 0.3s cubic-bezier(.22,.68,0,1.2)',
      }}
    >
      <div style={{ flexShrink: 0, marginTop: 2 }}>
        {ok ? <CheckCircle2 size={20} color="#10b981" /> : <XCircle size={20} color="#ef4444" />}
      </div>
      <span style={{ flex: 1, fontSize: 13.5, lineHeight: 1.55, color: ok ? '#6ee7b7' : '#fca5a5', fontWeight: 500 }}>
        {toast.message}
      </span>
      <button type="button" onClick={onClose}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'rgba(255,255,255,0.35)', flexShrink: 0 }}
      >
        <X size={15} />
      </button>
    </div>
  );
}

// ── Realistic Facebook Mockup Component ───────────────────────────────────
function FacebookMockupPreview({
  postType,
  pageName,
  content,
  title,
  mediaPreviewUrl,
  uploadedMedia,
  mediaList = [],
  scheduledAt,
  comments = []
}) {
  const renderFormattedContent = (text) => {
    if (!text) return 'Chưa nhập nội dung bài viết.';
    const parts = text.split(/(#[\w\p{L}]+)/gu);
    return parts.map((part, i) =>
      part.startsWith('#') ? (
        <span key={i} className="fb-hashtag">{part}</span>
      ) : (
        part
      )
    );
  };

  const formattedTime = scheduledAt
    ? `Lên lịch: ${new Date(scheduledAt).toLocaleString('vi-VN')}`
    : 'Vừa xong';

  if (postType === 'reel') {
    return (
      <div className="fb-reels-mockup">
        {/* Top Overlay */}
        <div className="fb-reels-overlay-top">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Film size={15} color="#00f2fe" /> Thước phim Reels
            </span>
          </div>
          <span style={{ fontSize: 11, background: 'rgba(0,0,0,0.6)', padding: '2px 8px', borderRadius: 10, color: '#fff' }}>
            9:16 HD
          </span>
        </div>

        {/* Media */}
        {mediaPreviewUrl ? (
          <video
            src={mediaPreviewUrl}
            className="fb-reels-media"
            controls
            loop
            muted
            playsInline
          />
        ) : (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#888', gap: 8, padding: 20, textAlign: 'center' }}>
            <Film size={42} color="#555" />
            <span style={{ fontSize: 12 }}>Đính kèm video dọc (9:16) để xem trước Reels</span>
          </div>
        )}

        {/* Right Side Buttons */}
        <div className="fb-reels-overlay-side">
          <div className="fb-reels-side-btn">
            <span style={{ fontSize: 22 }}>❤️</span>
            <span>24.5K</span>
          </div>
          <div className="fb-reels-side-btn">
            <span style={{ fontSize: 20 }}>💬</span>
            <span>890</span>
          </div>
          <div className="fb-reels-side-btn">
            <span style={{ fontSize: 20 }}>↗️</span>
            <span>120</span>
          </div>
          <div className="fb-reels-side-btn">
            <span style={{ fontSize: 20 }}>🎵</span>
          </div>
        </div>

        {/* Bottom Overlay */}
        <div className="fb-reels-overlay-bottom">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div className="fb-mockup-avatar" style={{ width: 30, height: 30, fontSize: 13 }}>
              f
            </div>
            <strong style={{ fontSize: 13, color: '#fff' }}>{pageName}</strong>
            <span style={{ fontSize: 11, background: '#1877f2', color: '#fff', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>
              Theo dõi
            </span>
          </div>
          <p style={{ fontSize: 12.5, lineHeight: 1.4, margin: '0 0 6px', maxHeight: 42, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {content || 'Mô tả thước phim Reels...'}
          </p>
          <div style={{ fontSize: 11, opacity: 0.85, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span>🎵 Âm thanh gốc - {pageName}</span>
          </div>
        </div>
      </div>
    );
  }

  if (postType === 'story') {
    return (
      <div className="fb-story-mockup">
        {/* Story Progress */}
        <div className="fb-story-progress">
          <div className="fb-story-bar active" />
          <div className="fb-story-bar" />
        </div>

        {/* Header */}
        <div style={{ position: 'relative', zIndex: 2, padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className="fb-mockup-avatar" style={{ width: 32, height: 32, fontSize: 14 }}>
            f
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{pageName}</div>
            <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.7)' }}>Tin 24 giờ · 🌐 Công khai</div>
          </div>
        </div>

        {/* Media or Text Content */}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          {mediaPreviewUrl ? (
            uploadedMedia?.mediaType === 'video' ? (
              <video src={mediaPreviewUrl} className="fb-reels-media" controls autoPlay loop muted />
            ) : (
              <img src={mediaPreviewUrl} alt="Story Media" className="fb-reels-media" />
            )
          ) : (
            <div style={{ textAlign: 'center', color: '#fff', fontSize: 16, fontWeight: 600, padding: 20 }}>
              {content || 'Tin 24h của Fanpage'}
            </div>
          )}
        </div>

        {/* Bottom Reply Bar */}
        <div style={{ position: 'relative', zIndex: 2, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 20, padding: '8px 14px', fontSize: 12, color: 'rgba(255,255,255,0.8)' }}>
            Gửi tin nhắn…
          </div>
          <span style={{ fontSize: 18 }}>❤️</span>
          <span style={{ fontSize: 18 }}>👍</span>
        </div>
      </div>
    );
  }

  // Default: Feed Post
  return (
    <div className="fb-mockup">
      <div className="fb-mockup-header">
        <div className="fb-mockup-avatar">f</div>
        <div className="fb-mockup-user-info">
          <div className="fb-mockup-author">
            {pageName}
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 14, height: 14, borderRadius: '50%', backgroundColor: '#1877f2', color: '#fff', fontSize: 9 }}>
              ✓
            </span>
          </div>
          <div className="fb-mockup-meta">
            <span>{formattedTime}</span>
            <span>·</span>
            <Globe size={11} />
            <span>·</span>
            <span style={{ color: 'var(--blue)' }}>Bài viết</span>
          </div>
        </div>
      </div>

      <div className="fb-mockup-content">
        {title && <div style={{ fontWeight: 700, color: 'var(--blue)', marginBottom: 6 }}>{title}</div>}
        {renderFormattedContent(content)}
      </div>

      {mediaList.length > 1 ? (
        <div style={{ borderRadius: 8, overflow: 'hidden', margin: '8px 0', border: '1px solid rgba(255,255,255,0.08)' }}>
          {mediaList.length === 2 ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, height: 240 }}>
              <img src={mediaList[0]?.previewUrl} alt="Album 1" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <img src={mediaList[1]?.previewUrl} alt="Album 2" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          ) : mediaList.length === 3 ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 2, height: 260 }}>
              <img src={mediaList[0]?.previewUrl} alt="Album 1" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <div style={{ display: 'grid', gridTemplateRows: '1fr 1fr', gap: 2, height: '100%' }}>
                <img src={mediaList[1]?.previewUrl} alt="Album 2" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <img src={mediaList[2]?.previewUrl} alt="Album 3" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 2, height: 270 }}>
              <img src={mediaList[0]?.previewUrl} alt="Album 1" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <div style={{ display: 'grid', gridTemplateRows: 'repeat(3, 1fr)', gap: 2, height: '100%' }}>
                <img src={mediaList[1]?.previewUrl} alt="Album 2" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <img src={mediaList[2]?.previewUrl} alt="Album 3" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                  <img src={mediaList[3]?.previewUrl} alt="Album 4" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  {mediaList.length > 4 && (
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.65)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 800 }}>
                      +{mediaList.length - 3}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          <div style={{ padding: '6px 12px', background: 'rgba(0,0,0,0.4)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: '#60a5fa' }}>
            <span>📸 Album Facebook ({mediaList.length} ảnh)</span>
            <span className="muted" style={{ fontSize: 10 }}>Tự động ghép layout</span>
          </div>
        </div>
      ) : mediaPreviewUrl ? (
        <div className="fb-mockup-media-container">
          {uploadedMedia?.mediaType === 'video' ? (
            <video src={mediaPreviewUrl} controls />
          ) : (
            <img src={mediaPreviewUrl} alt="Facebook Post Media" />
          )}
        </div>
      ) : null}

      <div className="fb-mockup-stats">
        <div className="fb-mockup-reactions-icons">
          <span style={{ fontSize: 15 }}>👍</span>
          <span style={{ fontSize: 15, marginLeft: -5 }}>❤️</span>
          <span style={{ fontSize: 15, marginLeft: -5 }}>😮</span>
          <span style={{ marginLeft: 4, fontWeight: 500 }}>1.4K</span>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <span>48 bình luận</span>
          <span>·</span>
          <span>12 lượt chia sẻ</span>
        </div>
      </div>

      <div className="fb-mockup-action-bar">
        <button type="button" className="fb-mockup-btn">
          <ThumbsUp size={16} /> Thích
        </button>
        <button type="button" className="fb-mockup-btn">
          <MessageCircle size={16} /> Bình luận
        </button>
        <button type="button" className="fb-mockup-btn">
          <Share2 size={16} /> Chia sẻ
        </button>
      </div>

      {Array.isArray(comments) && comments.filter((c) => c && c.content && c.content.trim()).length > 0 && (
        <div style={{ borderTop: '1px solid var(--line)', padding: '10px 14px', background: 'var(--panel-alt, rgba(0,0,0,0.02))' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--blue)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
            <Sparkles size={12} color="var(--blue)" /> Comment mồi tự động ({comments.filter((c) => c && c.content && c.content.trim()).length}):
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {comments.filter((c) => c && c.content && c.content.trim()).map((c, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#1877f2', color: '#fff', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  f
                </div>
                <div style={{ background: 'var(--field-bg)', borderRadius: 12, padding: '6px 12px', flex: 1, border: '1px solid var(--line)' }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{pageName || 'Fanpage'}</span>
                    <span style={{ fontSize: 10, color: 'var(--dim)', fontWeight: 400 }}>
                      {Number(c.delayMinutes) > 0 ? `Sau ${c.delayMinutes} phút` : 'Đăng cùng bài'}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ink)', marginTop: 2, lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>
                    {c.content}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const steps = ['Viết bài', 'Chọn kênh', 'Xem lại & xuất bản'];

const popularEmojis = ['🔥', '✨', '❤️', '👍', '🚀', '📌', '💡', '🎉', '👇', '👉', '📢', '🎯', '⭐', '💥', '✅', '💯', '😍', '👏', '🎁', '⚡', '☕', '🌟', '💪', '💬'];

const popularHashtags = ['#kinhdoanh', '#viral', '#facebook', '#marketing', '#xuhuong', '#contentcreator', '#story'];

export default function ComposePage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [postType, setPostType] = useState('feed'); // 'feed' | 'reel' | 'story'
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [channels, setChannels] = useState([]);
  const [groups, setGroups] = useState([]);
  const [selectedPageIds, setSelectedPageIds] = useState([]);
  const [channelLoading, setChannelLoading] = useState(true);
  const [channelError, setChannelError] = useState('');
  const [isPublishNow, setIsPublishNow] = useState(false);
  const [scheduledAt, setScheduledAt] = useState(() => {
    const date = new Date(Date.now() + 60 * 60 * 1000);
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().slice(0, 16);
  });
  const [uploadedMedia, setUploadedMedia] = useState(null);
  const [mediaList, setMediaList] = useState([]);
  const [comments, setComments] = useState([]);
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState('');
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [createdPostIds, setCreatedPostIds] = useState([]);

  // Toast
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);
  const showToast = useCallback((type, message) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ type, message });
    toastTimerRef.current = setTimeout(() => setToast(null), 6000);
  }, []);

  // Emoji / AI state
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiTone, setAiTone] = useState('Bán hàng hấp dẫn');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiResult, setAiResult] = useState('');
  const [aiError, setAiError] = useState('');
  const [aiWebSearch, setAiWebSearch] = useState(true);
  const [aiEventDetails, setAiEventDetails] = useState('');

  const contentRef = useRef(null);

  useEffect(() => () => {
    if (mediaPreviewUrl) URL.revokeObjectURL(mediaPreviewUrl);
    mediaList.forEach((m) => m.previewUrl && URL.revokeObjectURL(m.previewUrl));
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }, [mediaPreviewUrl, mediaList]);

  useEffect(() => {
    Promise.allSettled([
      postApi.getChannels(),
      channelGroupApi.list()
    ])
      .then(([chanRes, groupRes]) => {
        let availableChannels = [];
        let availableGroups = [];

        if (chanRes.status === 'fulfilled') {
          availableChannels = chanRes.value.channels || [];
          setChannels(availableChannels);
        } else {
          setChannelError(chanRes.reason?.response?.data?.message || 'Không tải được kênh Facebook.');
        }

        if (groupRes.status === 'fulfilled') {
          availableGroups = groupRes.value.groups || [];
          setGroups(availableGroups);
        }

        // Pre-select group or page from URL query
        const queryGroupId = router.query.groupId;
        const queryPageId = router.query.pageId;

        if (queryGroupId) {
          const matchedGroup = availableGroups.find((g) => g.id === queryGroupId);
          if (matchedGroup && Array.isArray(matchedGroup.pageIds) && matchedGroup.pageIds.length > 0) {
            setSelectedPageIds(matchedGroup.pageIds);
            return;
          }
        }

        if (queryPageId && availableChannels.some((c) => c.id === queryPageId)) {
          setSelectedPageIds([queryPageId]);
        } else if (availableChannels.length > 0) {
          setSelectedPageIds([availableChannels[0].id]);
        }
      })
      .finally(() => setChannelLoading(false));
  }, [router.query.pageId, router.query.groupId]);


  useEffect(() => {
    if (router.query.content && typeof router.query.content === 'string') {
      setContent(router.query.content);
    }
    if (router.query.mediaLink && typeof router.query.mediaLink === 'string') {
      const link = router.query.mediaLink;
      const preview = (typeof router.query.previewUrl === 'string' && router.query.previewUrl)
        ? router.query.previewUrl
        : (link.startsWith('local://') ? `http://localhost:5000/api/media/${link.slice(8)}` : link);
      const mediaItem = {
        mediaLink: link,
        previewUrl: preview,
        mediaType: 'image'
      };
      setMediaList([mediaItem]);
      setUploadedMedia(mediaItem);
      setMediaPreviewUrl(preview);
      setPostType('feed');
    }
  }, [router.query.content, router.query.mediaLink, router.query.previewUrl]);

  const togglePageSelection = (pageId) => {
    setSelectedPageIds((prev) =>
      prev.includes(pageId) ? prev.filter((id) => id !== pageId) : [...prev, pageId]
    );
  };

  const selectAllPages = () => {
    setSelectedPageIds(channels.map((c) => c.id));
  };

  const deselectAllPages = () => {
    setSelectedPageIds([]);
  };

  const insertEmoji = (emoji) => {
    setContent((prev) => prev + emoji);
  };

  const insertHashtag = (tag) => {
    setContent((prev) => (prev ? `${prev} ${tag}` : tag));
  };

  const removeMedia = () => {
    if (mediaPreviewUrl) URL.revokeObjectURL(mediaPreviewUrl);
    mediaList.forEach((m) => m.previewUrl && URL.revokeObjectURL(m.previewUrl));
    setMediaPreviewUrl('');
    setUploadedMedia(null);
    setMediaList([]);
  };

  const removeImageFromAlbum = (index) => {
    setMediaList((prev) => {
      const target = prev[index];
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      const updated = prev.filter((_, i) => i !== index);
      if (updated.length === 0) {
        setMediaPreviewUrl('');
        setUploadedMedia(null);
      } else {
        setMediaPreviewUrl(updated[0].previewUrl);
        setUploadedMedia(updated[0]);
      }
      return updated;
    });
  };

  const setQuickPresetTime = (preset) => {
    const now = new Date();
    let target = new Date();
    if (preset === 'now') {
      setIsPublishNow(true);
      target = new Date(now.getTime());
      showToast('info', '⚡ Chế độ: Đăng ngay lập tức sau khi lưu');
    } else {
      setIsPublishNow(false);
      if (preset === 'plus1h') {
        target = new Date(now.getTime() + 60 * 60 * 1000);
      } else if (preset === 'tonight') {
        target.setHours(20, 0, 0, 0);
        if (target <= now) {
          target.setDate(target.getDate() + 1);
        }
      } else if (preset === 'tomorrowMorning') {
        target.setDate(target.getDate() + 1);
        target.setHours(8, 0, 0, 0);
      }
    }
    target.setMinutes(target.getMinutes() - target.getTimezoneOffset());
    setScheduledAt(target.toISOString().slice(0, 16));
  };

  const handleGenerateAi = async () => {
    if (!aiPrompt.trim()) {
      setAiError('Vui lòng nhập chủ đề bài viết.');
      return;
    }
    setAiGenerating(true);
    setAiError('');
    setAiResult('');
    try {
      const fullPrompt = `Hãy viết một bài đăng Facebook hấp dẫn theo phong cách "${aiTone}".\nChủ đề: ${aiPrompt.trim()}\nYêu cầu: Có tiêu đề ngắn gọn thu hút, nội dung chia đoạn dễ đọc, chèn emoji phù hợp và kèm 3-5 hashtag ở cuối.`;
      const res = await aiApi.chat(fullPrompt, [], null, {
        enableWebSearch: aiWebSearch,
        eventDetails: aiEventDetails.trim()
      });
      if (res.reply) {
        setAiResult(res.reply);
      } else {
        setAiError('Không nhận được nội dung từ AI.');
      }
    } catch (err) {
      setAiError(err.response?.data?.message || 'Lỗi khi gọi AI. Hãy kiểm tra cấu hình AI_API_KEY trong server/.env.');
    } finally {
      setAiGenerating(false);
    }
  };

  const applyAiResult = () => {
    if (aiResult) {
      setContent(aiResult);
      setShowAiModal(false);
      setAiResult('');
      setAiPrompt('');
      setAiEventDetails('');
    }
  };

  // ── Auto Seeding AI State & Handlers ──
  const [aiSeedingLoading, setAiSeedingLoading] = useState(false);

  const handleGenerateAiSeeding = async () => {
    if (!content.trim()) {
      showToast('error', 'Vui lòng nhập nội dung bài viết trước để AI phân tích và viết comment mồi phù hợp!');
      return;
    }
    setAiSeedingLoading(true);
    try {
      showToast('info', '🤖 AI đang phân tích bài viết để gợi ý 3 bình luận mồi tương tác...');
      const res = await aiApi.generateSeedingComments({
        postContent: content.trim(),
        count: 3
      });
      if (res.success && Array.isArray(res.comments) && res.comments.length > 0) {
        setComments(res.comments);
        showToast('success', `✨ AI đã tạo xong ${res.comments.length} comment seeding! Bạn có thể chỉnh sửa nội dung hoặc phút trễ.`);
      } else {
        showToast('error', 'AI không sinh được comment seeding. Vui lòng thử lại.');
      }
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Lỗi khi gọi AI seeding.';
      showToast('error', msg);
    } finally {
      setAiSeedingLoading(false);
    }
  };

  const addQuickTemplate = (templateType) => {
    if (comments.length >= 5) {
      showToast('error', 'Tối đa 5 comment seeding cho mỗi bài đăng.');
      return;
    }
    let newComment = { content: '', delayMinutes: 0 };
    if (templateType === 'hotline') {
      newComment = {
        content: 'Anh/chị cần tư vấn nhanh hoặc nhận báo giá ưu đãi độc quyền vui lòng inbox Fanpage hoặc liên hệ Hotline/Zalo: 09xx.xxx.xxx nhé ạ! 📞✨',
        delayMinutes: 0
      };
    } else if (templateType === 'inbox') {
      newComment = {
        content: 'Mọi người để lại dấu chấm (.) hoặc bình luận bên dưới để Ad gửi thông tin chi tiết qua tin nhắn ngay nha! 🎁💬',
        delayMinutes: 2
      };
    } else if (templateType === 'feedback') {
      newComment = {
        content: 'Chương trình ưu đãi còn áp dụng trong hôm nay không shop ơi? -> Dạ ưu đãi vẫn còn áp dụng đến hết tuần này nhé bạn ơi! Nhanh tay inbox ad giữ suất nhé ạ 🥰',
        delayMinutes: 5
      };
    }
    setComments((prev) => [...prev, newComment]);
    showToast('success', 'Đã thêm mẫu comment seeding! Bạn có thể sửa lại nội dung.');
  };

  const createScheduledPost = async () => {
    if (!content.trim()) {
      showToast('error', 'Nội dung bài đăng không được để trống.');
      return;
    }
    if (selectedPageIds.length === 0) {
      showToast('error', 'Vui lòng chọn ít nhất một Fanpage trước khi đăng.');
      return;
    }
    if (uploadingMedia) {
      showToast('error', 'Đợi ảnh/video tải lên xong trước khi lưu bài.');
      return;
    }
    if (postType === 'reel' && (!uploadedMedia || uploadedMedia.mediaType !== 'video')) {
      showToast('error', 'Facebook Reels bắt buộc phải đính kèm tệp Video (tỷ lệ chuẩn 9:16).');
      return;
    }
    const parsedDate = scheduledAt ? new Date(scheduledAt) : new Date();
    if (!isPublishNow && Number.isNaN(parsedDate.getTime())) {
      showToast('error', 'Thời gian đăng bài không hợp lệ, vui lòng kiểm tra lại.');
      return;
    }

    setSaving(true);
    setNotice('');
    try {
      const finalMediaType = postType === 'reel'
        ? 'reel'
        : postType === 'story'
        ? 'story'
        : mediaList.length > 0
        ? 'image'
        : (uploadedMedia?.mediaType || 'text');

      const finalMediaLinks = mediaList.length > 0
        ? mediaList.map((m) => m.mediaLink)
        : (uploadedMedia ? [uploadedMedia.mediaLink] : []);

      const scheduledTimeToSend = isPublishNow ? new Date().toISOString() : parsedDate.toISOString();

      const result = await postApi.createPost({
        pageIds: selectedPageIds,
        content: content.trim(),
        mediaType: finalMediaType,
        mediaLinks: finalMediaLinks,
        comments,
        scheduledAt: scheduledTimeToSend
      });

      if (!result.success) throw new Error(result.message || 'Máy chủ trả về lỗi không xác định.');

      const ids = Array.isArray(result.postIds) && result.postIds.length > 0
        ? result.postIds
        : [result.postId].filter(Boolean);

      setCreatedPostIds(ids);
      const msg = result.message || (isPublishNow ? `Đã gửi yêu cầu đăng ngay cho ${ids.length} Fanpage!` : `Đã lên lịch thành công cho ${ids.length} Fanpage!`);
      setNotice(msg);
      showToast('success', msg);
    } catch (error) {
      const errMsg = error.response?.data?.message || error.message || 'Không thể tạo bài đăng. Vui lòng thử lại.';
      setNotice(errMsg);
      showToast('error', errMsg);
    } finally {
      setSaving(false);
    }
  };

  const uploadSingleFile = async (file) => {
    if (mediaPreviewUrl) URL.revokeObjectURL(mediaPreviewUrl);
    mediaList.forEach((m) => m.previewUrl && URL.revokeObjectURL(m.previewUrl));
    setMediaList([]);

    const previewUrl = URL.createObjectURL(file);
    setMediaPreviewUrl(previewUrl);
    setUploadedMedia(null);
    setUploadingMedia(true);
    setNotice('');

    const formData = new FormData();
    formData.append('file', file);
    try {
      const uploaded = await postApi.uploadMedia(formData);
      setUploadedMedia({ ...uploaded, previewUrl });
      const uploadMsg = `Đã tải lên ${uploaded.fileName} thành công.`;
      setNotice(uploadMsg);
      showToast('success', uploadMsg);
    } catch (error) {
      const errMsg = error.response?.data?.message || 'Không tải được tệp media lên máy chủ.';
      setNotice(errMsg);
      showToast('error', errMsg);
      setMediaPreviewUrl('');
    } finally {
      setUploadingMedia(false);
    }
  };

  const handleMediaChange = async (event) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    // Reels mode
    if (postType === 'reel') {
      const file = files[0];
      if (!file.type.startsWith('video/')) {
        showToast('error', 'Facebook Reels chỉ hỗ trợ Video (tỷ lệ 9:16), không hỗ trợ ảnh tĩnh.');
        event.target.value = '';
        return;
      }
      if (file.size > 50 * 1024 * 1024) {
        showToast('error', `Video vượt quá dung lượng tối đa 50MB (${(file.size / (1024 * 1024)).toFixed(2)}MB).`);
        event.target.value = '';
        return;
      }
      uploadSingleFile(file);
      event.target.value = '';
      return;
    }

    // Story mode
    if (postType === 'story') {
      const file = files[0];
      if (file.type.startsWith('image/') && file.size > 1024 * 1024) {
        showToast('error', `Ảnh Story vượt quá dung lượng tối đa 1MB (${(file.size / (1024 * 1024)).toFixed(2)}MB).`);
        event.target.value = '';
        return;
      }
      if (file.type.startsWith('video/') && file.size > 50 * 1024 * 1024) {
        showToast('error', `Video Story vượt quá dung lượng tối đa 50MB (${(file.size / (1024 * 1024)).toFixed(2)}MB).`);
        event.target.value = '';
        return;
      }
      uploadSingleFile(file);
      event.target.value = '';
      return;
    }

    // Feed mode:
    const hasVideo = files.some((f) => f.type.startsWith('video/'));
    if (hasVideo) {
      const videoFile = files.find((f) => f.type.startsWith('video/'));
      if (videoFile.size > 50 * 1024 * 1024) {
        showToast('error', `Video vượt quá dung lượng tối đa 50MB (${(videoFile.size / (1024 * 1024)).toFixed(2)}MB).`);
        event.target.value = '';
        return;
      }
      if (files.length > 1 || mediaList.length > 0) {
        showToast('error', 'Không thể kết hợp Video với Album ảnh. Chuyển sang chế độ đăng Video.');
      }
      uploadSingleFile(videoFile);
      event.target.value = '';
      return;
    }

    // Upload các ảnh vào Album
    const validImages = [];
    for (const f of files) {
      if (f.size > 1024 * 1024) {
        showToast('error', `Ảnh "${f.name}" vượt quá 1MB (${(f.size / (1024 * 1024)).toFixed(2)}MB). Bỏ qua ảnh này.`);
      } else {
        validImages.push(f);
      }
    }
    if (validImages.length === 0) {
      event.target.value = '';
      return;
    }

    setUploadingMedia(true);
    setNotice('');
    const newItems = [];
    for (const img of validImages) {
      const previewUrl = URL.createObjectURL(img);
      const formData = new FormData();
      formData.append('file', img);
      try {
        const uploaded = await postApi.uploadMedia(formData);
        newItems.push({
          file: img,
          previewUrl,
          mediaLink: uploaded.mediaLink,
          fileName: uploaded.fileName,
          mediaType: 'image'
        });
      } catch (err) {
        URL.revokeObjectURL(previewUrl);
        showToast('error', `Không thể tải lên ảnh "${img.name}": ` + (err.response?.data?.message || err.message));
      }
    }

    if (newItems.length > 0) {
      setMediaList((prev) => {
        const combined = [...prev, ...newItems];
        setMediaPreviewUrl(combined[0]?.previewUrl || '');
        setUploadedMedia(combined[0] || null);
        return combined;
      });
      showToast('success', `Đã tải lên ${newItems.length} ảnh vào Album.`);
    }
    setUploadingMedia(false);
    event.target.value = '';
  };


  return (
    <MainLayout title="Viết bài">
      <Toast toast={toast} onClose={() => setToast(null)} />
      <div className="step-strip" role="tablist" aria-label="Các bước tạo bài">
        {steps.map((label, index) => (
          <button
            className={`step-button${step === index ? ' is-current' : ''}${step > index ? ' is-done' : ''}`}
            key={label}
            onClick={() => setStep(index)}
            role="tab"
            aria-selected={step === index}
            disabled={index > step}
            type="button"
          >
            <span className="step-number">{index + 1}</span>
            {label}
          </button>
        ))}
      </div>

      {/* BƯỚC 1: VIẾT BÀI - BỐ CỤC SPLIT GRID 2 CỘT TƯƠNG TÁC THỜI GIAN THỰC */}
      {step === 0 && (
        <div className="compose-split-grid">
          {/* CỘT TRÁI: WORKSPACE SOẠN BÀI CHUYÊN BIỆT */}
          <div className="panel" style={{ margin: 0 }}>
            <div className="panel-heading">
              <div>
                <h2>Soạn nội dung</h2>
                <p className="muted" style={{ fontSize: 12, margin: '2px 0 0' }}>
                  Thiết lập nội dung và định dạng xuất bản lên Fanpage
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="tool-chip rgb-led-chip"
                  type="button"
                  style={{ minHeight: 30, padding: '0 12px', fontSize: 12 }}
                  onClick={() => setShowAiModal(true)}
                >
                  <Sparkles size={13} style={{ marginRight: 4, color: '#00f2fe' }} /> Viết bằng AI
                </button>
              </div>
            </div>

            <div className="panel-body">
              {/* LỰA CHỌN ĐỊNH DẠNG XUẤT BẢN */}
              <div style={{ marginBottom: 20 }}>
                <label className="field-label" style={{ marginBottom: 8, display: 'block' }}>
                  1. Chọn hình thức đăng Facebook *
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => setPostType('feed')}
                    className={`compose-type-pill${postType === 'feed' ? ' is-active' : ''}`}
                  >
                    <Globe size={20} />
                    <span style={{ fontSize: 13, fontWeight: 700 }}>Bảng tin (Feed)</span>
                    <span style={{ fontSize: 11, opacity: 0.75, fontWeight: 400 }}>Chữ + Ảnh/Video</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPostType('reel')}
                    className={`compose-type-pill${postType === 'reel' ? ' is-active' : ''}`}
                  >
                    <Film size={20} />
                    <span style={{ fontSize: 13, fontWeight: 700 }}>Facebook Reels</span>
                    <span style={{ fontSize: 11, opacity: 0.75, fontWeight: 400 }}>Video ngắn dọc 9:16</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPostType('story')}
                    className={`compose-type-pill${postType === 'story' ? ' is-active' : ''}`}
                  >
                    <Clock size={20} />
                    <span style={{ fontSize: 13, fontWeight: 700 }}>Tin (Story 24h)</span>
                    <span style={{ fontSize: 11, opacity: 0.75, fontWeight: 400 }}>Đầu trang trong 24 giờ</span>
                  </button>
                </div>

                {/* BANNER HƯỚNG DẪN THEO TỪNG ĐỊNH DẠNG */}
                {postType === 'reel' && (
                  <div style={{ marginTop: 10, fontSize: 12.5, color: '#38bdf8', background: 'rgba(0, 242, 254, 0.08)', padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(0, 242, 254, 0.25)', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Play size={18} style={{ flexShrink: 0, color: '#00f2fe' }} />
                    <div>
                      <strong>Chuẩn Facebook Reels:</strong> Bắt buộc đính kèm Video dọc tỷ lệ 9:16 (1080x1920), dung lượng &lt; 50MB, thời lượng khuyến nghị dưới 60 giây để cắn xu hướng tự nhiên.
                    </div>
                  </div>
                )}
                {postType === 'story' && (
                  <div style={{ marginTop: 10, fontSize: 12.5, color: '#10b981', background: 'rgba(16, 185, 129, 0.08)', padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(16, 185, 129, 0.25)', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Clock size={18} style={{ flexShrink: 0, color: '#10b981' }} />
                    <div>
                      <strong>Chuẩn Facebook Story:</strong> Tin sẽ nổi bật ở thanh đầu trang trong 24 giờ. Hỗ trợ ảnh 9:16 (dung lượng &lt; 1MB) hoặc video ngắn &lt; 50MB.
                    </div>
                  </div>
                )}
                {postType === 'feed' && (
                  <div style={{ marginTop: 10, fontSize: 12, color: 'var(--muted)', background: 'rgba(255, 255, 255, 0.03)', padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                    💡 <strong>Bài viết thường:</strong> Hiển thị trên Newsfeed và Dòng thời gian của Fanpage. Có thể đăng chỉ văn bản, hoặc đính kèm ảnh (&lt;1MB) / video (&lt;50MB).
                  </div>
                )}
              </div>

              {/* ────────────────── 1. ĐỊNH DẠNG REELS ────────────────── */}
              {postType === 'reel' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* HERO VIDEO UPLOAD CARD CHO REELS */}
                  <div>
                    <label className="field-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>2. Tải lên Video Reels 9:16 * (Bắt buộc)</span>
                      <span className="muted" style={{ fontSize: 11 }}>Dung lượng &lt; 50MB · Tỷ lệ 9:16</span>
                    </label>

                    {!uploadedMedia && !mediaPreviewUrl ? (
                      <label className="compose-media-dropzone" style={{ marginTop: 6 }}>
                        <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(0, 242, 254, 0.1)', display: 'grid', placeItems: 'center', color: '#00f2fe', marginBottom: 4 }}>
                          <Film size={24} />
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>
                          {uploadingMedia ? 'Đang tải lên máy chủ…' : 'Bấm để chọn hoặc kéo thả Video Reels'}
                        </div>
                        <div className="muted" style={{ fontSize: 12 }}>
                          Định dạng MP4, MOV dọc (9:16) · Dung lượng tối đa 50MB
                        </div>
                        <input type="file" accept="video/*" hidden onChange={handleMediaChange} disabled={uploadingMedia} />
                      </label>
                    ) : (
                      <div style={{ marginTop: 6, padding: '12px 14px', background: 'rgba(37, 99, 235, 0.05)', border: '1px solid rgba(37, 99, 235, 0.25)', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 44, height: 44, borderRadius: 8, background: '#000', display: 'grid', placeItems: 'center', color: '#60a5fa', flexShrink: 0 }}>
                          <Play size={22} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {uploadedMedia?.fileName || 'Video Reels đã chọn'}
                          </div>
                          <div style={{ fontSize: 11.5, color: 'var(--blue)' }}>
                            {uploadingMedia ? 'Đang tải lên…' : '✅ Video Reels đã sẵn sàng xuất bản'}
                          </div>
                        </div>
                        <label className="button button-secondary" style={{ minHeight: 28, fontSize: 11.5, padding: '0 10px' }}>
                          Đổi video
                          <input type="file" accept="video/*" hidden onChange={handleMediaChange} disabled={uploadingMedia} />
                        </label>
                        <button type="button" className="button button-danger" style={{ minHeight: 28, padding: '0 8px' }} onClick={removeMedia} title="Xóa video">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* CAPTION CHO REELS */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <label className="field-label" htmlFor="post-content" style={{ margin: 0 }}>
                        3. Mô tả Reels (Caption ngắn gọn & Hashtag) *
                      </label>
                      <div className="compose-toolbar" style={{ margin: 0, padding: 0, background: 'none' }}>
                        <button
                          className={`tool-chip${showEmojiPicker ? ' is-active' : ''}`}
                          type="button"
                          title="Chèn biểu tượng Emoji"
                          onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                          style={{ minHeight: 26, fontSize: 11.5 }}
                        >
                          <Smile size={13} /> Emoji
                        </button>
                        <button
                          className="tool-chip rgb-led-chip"
                          type="button"
                          title="Trợ lý AI viết Caption"
                          onClick={() => setShowAiModal(true)}
                          style={{ minHeight: 26, fontSize: 11.5 }}
                        >
                          <Sparkles size={13} style={{ color: '#00f2fe' }} /> AI Caption
                        </button>
                      </div>
                    </div>

                    {showEmojiPicker && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '8px 10px', background: 'rgba(10, 16, 32, 0.95)', border: '1px solid rgba(0, 242, 254, 0.25)', borderRadius: 8, marginBottom: 8 }}>
                        {popularEmojis.map((emoji) => (
                          <button key={emoji} type="button" onClick={() => insertEmoji(emoji)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', padding: 4 }} title={`Chèn ${emoji}`}>
                            {emoji}
                          </button>
                        ))}
                      </div>
                    )}

                    <textarea
                      id="post-content"
                      ref={contentRef}
                      className="compose-editor"
                      placeholder="Nhập mô tả cuốn hút cho thước phim Reels... Kèm các hashtag xu hướng phía dưới 👇"
                      value={content}
                      onChange={(event) => setContent(event.target.value)}
                      rows={4}
                    />

                    {/* CHIP HASHTAG THỊNH HÀNH REELS */}
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
                      <span className="muted" style={{ fontSize: 11 }}>🔥 Gợi ý hashtag viral:</span>
                      {['#reels', '#viral', '#xuhuong', '#trending', '#fyp', '#fb_reels', '#video'].map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => insertHashtag(tag)}
                          className="button button-quiet"
                          style={{ minHeight: 22, padding: '0 8px', fontSize: 11, borderRadius: 12 }}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ────────────────── 2. ĐỊNH DẠNG STORY (TIN 24H) ────────────────── */}
              {postType === 'story' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* MEDIA UPLOAD CHO STORY */}
                  <div>
                    <label className="field-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>2. Tải lên Ảnh hoặc Video Story 9:16 *</span>
                      <span className="muted" style={{ fontSize: 11 }}>Ảnh &lt; 1MB · Video &lt; 50MB</span>
                    </label>

                    {!uploadedMedia && !mediaPreviewUrl ? (
                      <label className="compose-media-dropzone" style={{ marginTop: 6 }}>
                        <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(16, 185, 129, 0.1)', display: 'grid', placeItems: 'center', color: '#10b981', marginBottom: 4 }}>
                          <Clock size={24} />
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>
                          {uploadingMedia ? 'Đang tải lên máy chủ…' : 'Bấm để chọn Ảnh hoặc Video Story 24h'}
                        </div>
                        <div className="muted" style={{ fontSize: 12 }}>
                          Tỷ lệ khuyến nghị 9:16 (1080x1920) · Ảnh &lt; 1MB · Video &lt; 50MB
                        </div>
                        <input type="file" accept="image/*,video/*" hidden onChange={handleMediaChange} disabled={uploadingMedia} />
                      </label>
                    ) : (
                      <div style={{ marginTop: 6, padding: '12px 14px', background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 44, height: 44, borderRadius: 8, background: '#000', display: 'grid', placeItems: 'center', color: '#10b981', flexShrink: 0 }}>
                          {uploadedMedia?.mediaType === 'video' ? <Film size={22} /> : <ImagePlus size={22} />}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {uploadedMedia?.fileName || 'Tệp Story đã chọn'}
                          </div>
                          <div style={{ fontSize: 11.5, color: '#34d399' }}>
                            {uploadingMedia ? 'Đang tải lên…' : '✅ Tệp Story đã sẵn sàng đăng'}
                          </div>
                        </div>
                        <label className="button button-secondary" style={{ minHeight: 28, fontSize: 11.5, padding: '0 10px' }}>
                          Đổi tệp
                          <input type="file" accept="image/*,video/*" hidden onChange={handleMediaChange} disabled={uploadingMedia} />
                        </label>
                        <button type="button" className="button button-danger" style={{ minHeight: 28, padding: '0 8px' }} onClick={removeMedia} title="Xóa tệp">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* NỘI DUNG / GHI CHÚ TRÊN STORY */}
                  <div>
                    <label className="field-label" htmlFor="post-content">
                      3. Nội dung văn bản hoặc ghi chú Story (tùy chọn)
                    </label>
                    <textarea
                      id="post-content"
                      ref={contentRef}
                      className="compose-editor"
                      placeholder="Nhập thông điệp hiển thị trên Story hoặc ghi chú quản lý..."
                      value={content}
                      onChange={(event) => setContent(event.target.value)}
                      rows={3}
                    />
                  </div>
                </div>
              )}

              {/* ────────────────── 3. ĐỊNH DẠNG BẢNG TIN (FEED) ────────────────── */}
              {postType === 'feed' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* TIÊU ĐỀ BÀI VIẾT */}
                  <div>
                    <label className="field-label" htmlFor="post-title">2. Tiêu đề bài viết (quản lý nội bộ)</label>
                    <input
                      id="post-title"
                      className="field"
                      placeholder="Nhập tiêu đề hoặc ghi chú phân biệt bài viết..."
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                    />
                  </div>

                  {/* NỘI DUNG BÀI ĐĂNG */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <label className="field-label" htmlFor="post-content" style={{ margin: 0 }}>
                        3. Nội dung bài đăng Facebook *
                      </label>
                      <div className="compose-toolbar" style={{ margin: 0, padding: 0, background: 'none' }}>
                        <button
                          className={`tool-chip${showEmojiPicker ? ' is-active' : ''}`}
                          type="button"
                          title="Chèn biểu tượng Emoji"
                          onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                          style={{ minHeight: 26, fontSize: 11.5 }}
                        >
                          <Smile size={13} /> Emoji
                        </button>
                        <button
                          className="tool-chip"
                          type="button"
                          title="Gợi ý Hashtag"
                          onClick={() => insertHashtag('#viral')}
                          style={{ minHeight: 26, fontSize: 11.5 }}
                        >
                          <Hash size={13} /> Hashtag
                        </button>
                        <button
                          className="tool-chip rgb-led-chip"
                          type="button"
                          title="Trợ lý AI viết Content"
                          onClick={() => setShowAiModal(true)}
                          style={{ minHeight: 26, fontSize: 11.5 }}
                        >
                          <Sparkles size={13} style={{ color: '#00f2fe' }} /> AI Writer
                        </button>
                      </div>
                    </div>

                    {showEmojiPicker && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '8px 10px', background: 'var(--panel)', border: '1px solid var(--border-subtle)', borderRadius: 10, marginBottom: 8, boxShadow: 'var(--shadow-md)' }}>
                        {popularEmojis.map((emoji) => (
                          <button key={emoji} type="button" onClick={() => insertEmoji(emoji)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', padding: 4 }} title={`Chèn ${emoji}`}>
                            {emoji}
                          </button>
                        ))}
                        <div style={{ width: '100%', borderTop: '1px solid var(--line)', paddingTop: 6, marginTop: 4, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <span className="muted" style={{ fontSize: 11, alignSelf: 'center' }}>Tag nhanh:</span>
                          {popularHashtags.map((tag) => (
                            <button key={tag} type="button" onClick={() => insertHashtag(tag)} className="button button-quiet" style={{ minHeight: 20, padding: '0 6px', fontSize: 10.5 }}>
                              {tag}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <textarea
                      id="post-content"
                      ref={contentRef}
                      className="compose-editor"
                      placeholder="Bạn đang muốn chia sẻ điều gì lên các Fanpage hôm nay? Nhập nội dung bài viết..."
                      value={content}
                      onChange={(event) => setContent(event.target.value)}
                      rows={6}
                    />

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                      <span className="muted" style={{ fontSize: 11.5 }}>{content.length} ký tự</span>
                      <span className="muted" style={{ fontSize: 11 }}>Hỗ trợ format xuống dòng và hashtag #</span>
                    </div>
                  </div>

                  {/* ĐÍNH KÈM ẢNH HOẶC VIDEO */}
                  <div>
                    <label className="field-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>4. Đính kèm Ảnh hoặc Video (tùy chọn)</span>
                      <span className="muted" style={{ fontSize: 11 }}>Ảnh &lt; 1MB · Video &lt; 50MB</span>
                    </label>

                    {mediaList.length > 0 ? (
                      /* GIAO DIỆN QUẢN LÝ ALBUM ẢNH */
                      <div style={{ marginTop: 8, background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(0, 242, 254, 0.25)', borderRadius: 12, padding: 14 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                          <div>
                            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 6 }}>
                              📸 Album ảnh ({mediaList.length} ảnh)
                            </span>
                            <span className="muted" style={{ fontSize: 11 }}>
                              Hệ thống sẽ tạo bài đăng Album đa ảnh lên Fanpage
                            </span>
                          </div>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <label className="button button-secondary" style={{ minHeight: 26, fontSize: 11, padding: '0 10px', cursor: 'pointer' }}>
                              + Thêm ảnh
                              <input type="file" accept="image/*" multiple hidden onChange={handleMediaChange} disabled={uploadingMedia} />
                            </label>
                            <button type="button" className="button button-quiet" style={{ minHeight: 26, padding: '0 8px', fontSize: 11, color: '#fca5a5' }} onClick={removeMedia} title="Xóa toàn bộ album">
                              Xóa tất cả
                            </button>
                          </div>
                        </div>

                        {/* Danh sách ảnh trong album */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: 10 }}>
                          {mediaList.map((item, idx) => (
                            <div key={idx} style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)', background: '#000', aspectRatio: '1/1' }}>
                              <img src={item.previewUrl} alt={`Ảnh ${idx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              <span style={{ position: 'absolute', top: 4, left: 4, background: 'rgba(0,0,0,0.7)', color: '#fff', fontSize: 10, padding: '1px 5px', borderRadius: 4, fontWeight: 700 }}>
                                #{idx + 1}
                              </span>
                              <button
                                type="button"
                                onClick={() => removeImageFromAlbum(idx)}
                                style={{
                                  position: 'absolute',
                                  top: 4,
                                  right: 4,
                                  width: 20,
                                  height: 20,
                                  borderRadius: '50%',
                                  background: 'rgba(239, 68, 68, 0.85)',
                                  border: 'none',
                                  color: '#fff',
                                  display: 'grid',
                                  placeItems: 'center',
                                  cursor: 'pointer',
                                  padding: 0
                                }}
                                title="Xóa ảnh này"
                              >
                                <X size={12} />
                              </button>
                            </div>
                          ))}
                        </div>
                        {uploadingMedia && (
                          <div style={{ fontSize: 11.5, color: 'var(--blue)', marginTop: 10, textAlign: 'center' }}>
                            Đang tải thêm ảnh lên máy chủ…
                          </div>
                        )}
                      </div>
                    ) : !uploadedMedia && !mediaPreviewUrl ? (
                      <label className="compose-media-dropzone" style={{ marginTop: 6, padding: '16px 14px' }}>
                        <ImagePlus size={24} style={{ color: 'var(--muted)' }} />
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
                          {uploadingMedia ? 'Đang tải lên máy chủ…' : 'Bấm để thêm Ảnh (chọn nhiều để tạo Album) hoặc Video'}
                        </div>
                        <span className="muted" style={{ fontSize: 11 }}>
                          Hỗ trợ tải lên cùng lúc nhiều ảnh để xuất bản dạng Album Facebook
                        </span>
                        <input type="file" accept="image/*,video/*" multiple hidden onChange={handleMediaChange} disabled={uploadingMedia} />
                      </label>
                    ) : (
                      <div style={{ marginTop: 6, padding: '10px 14px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 38, height: 38, borderRadius: 6, background: '#000', display: 'grid', placeItems: 'center', color: '#60a5fa', flexShrink: 0 }}>
                          {uploadedMedia?.mediaType === 'video' ? <Film size={18} /> : <ImagePlus size={18} />}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {uploadedMedia?.fileName || 'Tệp đính kèm'}
                          </div>
                          <div style={{ fontSize: 11, color: '#10b981' }}>
                            {uploadingMedia ? 'Đang tải lên…' : '✅ Đã tải lên máy chủ'}
                          </div>
                        </div>
                        <label className="button button-secondary" style={{ minHeight: 26, fontSize: 11, padding: '0 8px' }}>
                          Đổi tệp
                          <input type="file" accept="image/*,video/*" multiple hidden onChange={handleMediaChange} disabled={uploadingMedia} />
                        </label>
                        <button type="button" className="button button-danger" style={{ minHeight: 26, padding: '0 8px' }} onClick={removeMedia} title="Xóa tệp">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* CỘT PHẢI: LIVE FACEBOOK MOCKUP PREVIEW THỜI GIAN THỰC */}
          <div className="compose-preview-sticky">
            <div className="panel" style={{ margin: 0 }}>
              <div className="panel-heading" style={{ padding: '12px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 8px #10b981' }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
                    Xem trước thực tế trên Facebook
                  </span>
                </div>
                <span style={{ fontSize: 11, background: 'rgba(37, 99, 235, 0.08)', color: 'var(--blue)', padding: '2px 8px', borderRadius: 99, fontWeight: 700 }}>
                  {postType === 'reel' ? 'REELS 9:16' : postType === 'story' ? 'STORY 24H' : 'BẢNG TIN'}
                </span>
              </div>
              <div className="panel-body" style={{ padding: '14px 16px' }}>
                <div style={{ maxWidth: postType === 'feed' ? '100%' : 310, margin: '0 auto' }}>
                  <FacebookMockupPreview
                    postType={postType}
                    pageName={channels.find((c) => selectedPageIds.includes(c.id))?.name || 'Fanpage của bạn'}
                    content={content}
                    title={title}
                    mediaPreviewUrl={mediaPreviewUrl}
                    uploadedMedia={uploadedMedia}
                    mediaList={mediaList}
                    scheduledAt={scheduledAt}
                    comments={comments}
                  />
                </div>
                <div style={{ textAlign: 'center', marginTop: 12 }}>
                  <span className="muted" style={{ fontSize: 11 }}>
                    ⚡ Mockup phản hồi trực tiếp theo thời gian thực (0ms độ trễ)
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* BƯỚC 2: CHỌN KÊNH ĐĂNG (HỖ TRỢ ĐĂNG NHIỀU FANPAGE CÙNG LÚC & THEO NHÓM KÊNH) */}
      {step === 1 && (
        <div className="compose-grid">
          {/* Cột chọn kênh */}
          <section className="panel compose-panel">
            <div className="panel-heading">
              <h2>Chọn Fanpage đăng bài</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="muted" style={{ fontSize: 12 }}>
                  Đã chọn: <strong style={{ color: '#00f2fe' }}>{selectedPageIds.length}</strong>/{channels.length}
                </span>
                <button
                  className="button button-quiet"
                  type="button"
                  style={{ minHeight: 24, padding: '0 8px', fontSize: 11 }}
                  onClick={selectedPageIds.length === channels.length ? deselectAllPages : selectAllPages}
                >
                  {selectedPageIds.length === channels.length ? 'Bỏ chọn hết' : 'Chọn tất cả'}
                </button>
              </div>
            </div>
            <div className="panel-body">
              {/* CHỌN NHANH THEO NHÓM KÊNH */}
              {groups.length > 0 && (
                <div style={{ marginBottom: 14, padding: '10px 12px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: 10, border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                  <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Layers size={13} style={{ color: '#00f2fe' }} /> Chọn nhanh theo Nhóm kênh ({groups.length} nhóm):
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {groups.map((grp) => {
                      const pIds = Array.isArray(grp.pageIds) ? grp.pageIds : [];
                      const isAllInGroup = pIds.length > 0 && pIds.every((id) => selectedPageIds.includes(id));
                      return (
                        <button
                          key={grp.id}
                          type="button"
                          onClick={() => {
                            if (isAllInGroup) {
                              setSelectedPageIds((prev) => prev.filter((id) => !pIds.includes(id)));
                            } else {
                              setSelectedPageIds((prev) => [...new Set([...prev, ...pIds])]);
                            }
                          }}
                          style={{
                            background: isAllInGroup ? `${grp.color || 'var(--blue)'}18` : 'var(--field-bg)',
                            border: `1px solid ${isAllInGroup ? (grp.color || 'var(--blue)') : 'var(--line)'}`,
                            color: isAllInGroup ? (grp.color || 'var(--blue)') : 'var(--ink)',
                            borderRadius: 16,
                            padding: '4px 12px',
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: grp.color || 'var(--blue)' }} />
                          {grp.name} ({pIds.length})
                          {isAllInGroup && <Check size={12} />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* CHỌN NHANH THEO NICK FACEBOOK */}
              {(() => {
                const fbAccounts = [];
                const map = {};
                for (const c of channels) {
                  if (c.fbAccountId && !map[c.fbAccountId]) {
                    map[c.fbAccountId] = true;
                    fbAccounts.push({
                      id: c.fbAccountId,
                      name: c.fbAccountName || 'Nick Facebook',
                      avatar: c.fbAccountAvatar || null
                    });
                  }
                }
                if (fbAccounts.length <= 1) return null;
                return (
                  <div style={{ marginBottom: 14, padding: '10px 12px', background: 'rgba(37, 99, 235, 0.05)', borderRadius: 10, border: '1px solid rgba(37, 99, 235, 0.18)' }}>
                    <div style={{ fontSize: 11.5, color: 'var(--blue)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
                      <Users size={13} style={{ color: 'var(--blue)' }} /> Chọn nhanh theo Nick Facebook ({fbAccounts.length} nick):
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {fbAccounts.map((acc) => {
                        const accPages = channels.filter((c) => c.fbAccountId === acc.id).map((c) => c.id);
                        const isAllSelected = accPages.length > 0 && accPages.every((pid) => selectedPageIds.includes(pid));
                        return (
                          <button
                            key={acc.id}
                            type="button"
                            onClick={() => {
                              if (isAllSelected) {
                                setSelectedPageIds((prev) => prev.filter((id) => !accPages.includes(id)));
                              } else {
                                setSelectedPageIds((prev) => [...new Set([...prev, ...accPages])]);
                              }
                            }}
                            style={{
                              background: isAllSelected ? 'var(--blue)' : 'var(--field-bg)',
                              border: `1px solid ${isAllSelected ? 'var(--blue)' : 'var(--line)'}`,
                              color: isAllSelected ? '#ffffff' : 'var(--ink)',
                              borderRadius: 16,
                              padding: '4px 12px',
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              transition: 'all 0.15s ease'
                            }}
                          >
                            {acc.avatar ? (
                              <img src={acc.avatar} alt="" style={{ width: 14, height: 14, borderRadius: '50%' }} />
                            ) : (
                              <Users size={12} />
                            )}
                            <span>{acc.name} ({accPages.length})</span>
                            {isAllSelected && <Check size={12} />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {channelLoading && <p className="muted">Đang tải danh sách Fanpage…</p>}
              {channelError && <div className="notice">{channelError}</div>}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {channels.map((channel) => {
                  const isChecked = selectedPageIds.includes(channel.id);
                  return (
                    <div
                      key={channel.id}
                      onClick={() => togglePageSelection(channel.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '12px 14px',
                        borderRadius: 12,
                        cursor: 'pointer',
                        background: isChecked ? 'linear-gradient(135deg, rgba(14, 165, 233, 0.16), rgba(37, 99, 235, 0.16))' : 'rgba(255, 255, 255, 0.02)',
                        border: isChecked ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.08)',
                        boxShadow: isChecked ? '0 4px 14px rgba(14, 165, 233, 0.18)' : 'none',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{ color: isChecked ? '#00f2fe' : 'var(--muted)', display: 'flex', alignItems: 'center' }}>
                        {isChecked ? <CheckSquare size={18} /> : <Square size={18} />}
                      </div>
                      <span className="fb-mark">f</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 700, color: 'var(--ink)', fontSize: 13.5 }}>{channel.name}</span>
                          {channel.fbAccountName && (
                            <span style={{
                              fontSize: 10.5,
                              color: '#93c5fd',
                              background: 'rgba(59, 130, 246, 0.15)',
                              border: '1px solid rgba(59, 130, 246, 0.3)',
                              borderRadius: 10,
                              padding: '1px 7px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4
                            }}>
                              {channel.fbAccountAvatar && (
                                <img src={channel.fbAccountAvatar} alt="" style={{ width: 12, height: 12, borderRadius: '50%' }} />
                              )}
                              Nick: {channel.fbAccountName}
                            </span>
                          )}
                        </div>
                        <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>Facebook · {channel.category || 'Fanpage'} · ID: {channel.id}</div>
                      </div>
                      {isChecked && (
                        <span style={{ fontSize: 11, color: '#00f2fe', background: 'rgba(0, 242, 254, 0.15)', padding: '2px 8px', borderRadius: 10 }}>
                          Sẵn sàng đăng
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {!channelLoading && channels.length === 0 && !channelError && (
                <p className="muted">Chưa có Fanpage nào được đồng bộ. Vui lòng vào trang Kênh để kết nối lại.</p>
              )}
            </div>
          </section>

          {/* Cột lịch đăng & comment seeding */}
          <section className="panel compose-panel">
            <div className="panel-heading">
              <h2>Thời gian & Comment Seeding</h2>
            </div>
            <div className="panel-body">
              <div style={{ marginBottom: 16 }}>
                <label className="field-label" style={{ marginBottom: 8, display: 'block' }}>Chế độ xuất bản *</label>

                {/* 2 LỰA CHỌN CHẾ ĐỘ RÕ RÀNG */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                  <button
                    type="button"
                    onClick={() => {
                      setIsPublishNow(true);
                      const now = new Date();
                      const localNow = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
                      setScheduledAt(localNow.toISOString().slice(0, 16));
                      showToast('info', '⚡ Đã chọn: Đăng ngay lập tức lên Facebook');
                    }}
                    style={{
                      padding: '12px 14px',
                      borderRadius: 10,
                      cursor: 'pointer',
                      border: isPublishNow ? '2px solid #f59e0b' : '1px solid rgba(255,255,255,0.12)',
                      background: isPublishNow ? 'rgba(245, 158, 11, 0.16)' : 'rgba(255,255,255,0.03)',
                      color: isPublishNow ? '#fbbf24' : 'var(--muted)',
                      textAlign: 'left',
                      transition: 'all 0.2s ease',
                      boxShadow: isPublishNow ? '0 0 16px rgba(245, 158, 11, 0.3)' : 'none'
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, color: isPublishNow ? '#fbbf24' : '#fff' }}>
                      ⚡ Đăng ngay lập tức
                    </div>
                    <div style={{ fontSize: 11, marginTop: 4, opacity: 0.85, lineHeight: 1.3 }}>
                      Xuất bản trực tiếp lên Facebook ngay khi bạn bấm nút
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsPublishNow(false);
                      showToast('info', '⏰ Đã chọn: Lên lịch hẹn giờ tự động');
                    }}
                    style={{
                      padding: '12px 14px',
                      borderRadius: 10,
                      cursor: 'pointer',
                      border: !isPublishNow ? '2px solid #00f2fe' : '1px solid rgba(255,255,255,0.12)',
                      background: !isPublishNow ? 'rgba(0, 242, 254, 0.12)' : 'rgba(255,255,255,0.03)',
                      color: !isPublishNow ? '#00f2fe' : 'var(--muted)',
                      textAlign: 'left',
                      transition: 'all 0.2s ease',
                      boxShadow: !isPublishNow ? '0 0 16px rgba(0, 242, 254, 0.25)' : 'none'
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, color: !isPublishNow ? '#00f2fe' : '#fff' }}>
                      ⏰ Lên lịch hẹn giờ
                    </div>
                    <div style={{ fontSize: 11, marginTop: 4, opacity: 0.85, lineHeight: 1.3 }}>
                      Chọn ngày giờ vàng để hệ thống tự động xuất bản
                    </div>
                  </button>
                </div>

                {isPublishNow ? (
                  <div style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(245, 158, 11, 0.08)', border: '1px dashed rgba(245, 158, 11, 0.35)', color: '#fcd34d', fontSize: 12.5, lineHeight: 1.4 }}>
                    🚀 <strong>Chế độ Đăng ngay đang bật:</strong> Bài viết sẽ được gửi lập tức đến Facebook Graph API và xuất bản lên <strong>{selectedPageIds.length} Fanpage</strong> đã chọn ngay sau khi bạn bấm xác nhận.
                  </div>
                ) : (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <label className="field-label" htmlFor="scheduled-at" style={{ margin: 0 }}>Thời gian lên lịch *</label>
                      <span className="muted" style={{ fontSize: 11 }}>Chọn giờ vàng tương tác cao</span>
                    </div>

                    {/* HÀNG NÚT CHỌN NHANH THỜI GIAN HẸN GIỜ */}
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                      <button
                        type="button"
                        className="time-preset-pill"
                        onClick={() => setQuickPresetTime('plus1h')}
                        title="Lên lịch sau 1 tiếng nữa"
                      >
                        ⏰ Sau 1 giờ
                      </button>
                      <button
                        type="button"
                        className="time-preset-pill"
                        onClick={() => setQuickPresetTime('tonight')}
                        title="Lên lịch vào khung giờ vàng 20:00 tối"
                      >
                        🌙 Tối nay (20:00)
                      </button>
                      <button
                        type="button"
                        className="time-preset-pill"
                        onClick={() => setQuickPresetTime('tomorrowMorning')}
                        title="Lên lịch vào 08:00 sáng mai"
                      >
                        ☀️ Sáng mai (08:00)
                      </button>
                    </div>

                    <input
                      id="scheduled-at"
                      className="field"
                      type="datetime-local"
                      value={scheduledAt}
                      onChange={(event) => {
                        setScheduledAt(event.target.value);
                        setIsPublishNow(false);
                      }}
                    />
                    <p className="muted" style={{ fontSize: 11, marginTop: 4, marginBottom: 0 }}>
                      💡 Khuyến nghị hẹn trước ít nhất 15 phút để Facebook đồng bộ lịch đăng chuẩn xác nhất.
                    </p>
                  </div>
                )}
              </div>

              {/* Comment Seeding Boost */}
              <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <span style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <MessageCircle size={15} style={{ color: 'var(--blue)' }} />
                      Comment Seeding Boost ({comments.length}/5)
                    </span>
                    <span className="muted" style={{ fontSize: 11, display: 'block', marginTop: 2 }}>
                      Tự động bình luận mồi sau khi đăng để kích thích thuật toán Facebook đẩy Reach & Feed
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      className="button button-secondary"
                      type="button"
                      style={{
                        minHeight: 28,
                        padding: '0 10px',
                        fontSize: 11.5,
                        background: 'linear-gradient(135deg, rgba(0, 242, 254, 0.15), rgba(79, 70, 229, 0.2))',
                        border: '1px solid #00f2fe',
                        color: '#00f2fe',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                      onClick={handleGenerateAiSeeding}
                      disabled={aiSeedingLoading || !content.trim()}
                      title="AI đọc bài viết và tự động gợi ý 3 comment mồi chốt đơn"
                    >
                      <Sparkles size={13} style={{ marginRight: 4 }} />
                      {aiSeedingLoading ? 'AI đang viết…' : '✨ AI Gợi ý Seeding'}
                    </button>
                    <button
                      className="button button-quiet"
                      type="button"
                      style={{ minHeight: 28, padding: '0 8px', fontSize: 11.5 }}
                      onClick={() => setComments((items) => items.length < 5 ? [...items, { content: '', delayMinutes: 0 }] : items)}
                      disabled={comments.length >= 5}
                    >
                      <Plus size={13} style={{ marginRight: 2 }} /> Thêm ô
                    </button>
                  </div>
                </div>

                {/* Quick Templates Bar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 12, marginTop: 8, padding: '8px 10px', background: 'rgba(255, 255, 255, 0.02)', borderRadius: 8, border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                  <span className="muted" style={{ fontSize: 11, fontWeight: 500 }}>Mẫu nhanh:</span>
                  <button
                    type="button"
                    onClick={() => addQuickTemplate('hotline')}
                    className="button button-quiet"
                    style={{ minHeight: 22, padding: '0 8px', fontSize: 11, borderRadius: 12, background: 'rgba(0, 242, 254, 0.08)', color: '#38bdf8' }}
                  >
                    📞 Hotline / Zalo
                  </button>
                  <button
                    type="button"
                    onClick={() => addQuickTemplate('inbox')}
                    className="button button-quiet"
                    style={{ minHeight: 22, padding: '0 8px', fontSize: 11, borderRadius: 12, background: 'rgba(245, 158, 11, 0.08)', color: '#fbbf24' }}
                  >
                    💬 Kêu gọi Inbox (chấm)
                  </button>
                  <button
                    type="button"
                    onClick={() => addQuickTemplate('feedback')}
                    className="button button-quiet"
                    style={{ minHeight: 22, padding: '0 8px', fontSize: 11, borderRadius: 12, background: 'rgba(16, 185, 129, 0.08)', color: '#34d399' }}
                  >
                    ⭐ Feedback mồi Q&A
                  </button>
                  {comments.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setComments([])}
                      className="button button-quiet"
                      style={{ minHeight: 22, padding: '0 8px', fontSize: 10.5, marginLeft: 'auto', color: '#f87171' }}
                    >
                      Xóa tất cả
                    </button>
                  )}
                </div>

                {/* Danh sách Comment */}
                {comments.length === 0 ? (
                  <div style={{ padding: '16px 14px', borderRadius: 10, background: 'rgba(255, 255, 255, 0.02)', border: '1px dashed rgba(255, 255, 255, 0.12)', textAlign: 'center' }}>
                    <p className="muted" style={{ fontSize: 12, margin: 0 }}>
                      Chưa có comment seeding nào. Bấm <strong>"✨ AI Gợi ý Seeding"</strong> để AI tự động phân tích bài viết và tạo 3 bình luận mồi, hoặc chọn <strong>Mẫu nhanh</strong> phía trên.
                    </p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {comments.map((comment, index) => (
                      <div
                        key={index}
                        style={{
                          background: 'rgba(255, 255, 255, 0.03)',
                          border: '1px solid rgba(255, 255, 255, 0.08)',
                          borderRadius: 10,
                          padding: '10px 12px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 8
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 11.5, fontWeight: 700, color: '#00f2fe' }}>
                            Comment #{index + 1}
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11.5 }}>
                              <span className="muted">Đăng sau:</span>
                              <input
                                className="field"
                                type="number"
                                min="0"
                                max="1440"
                                style={{ width: 60, minHeight: 24, padding: '2px 6px', fontSize: 11.5, textAlign: 'center' }}
                                value={comment.delayMinutes}
                                onChange={(event) =>
                                  setComments((items) =>
                                    items.map((item, itemIndex) =>
                                      itemIndex === index ? { ...item, delayMinutes: Math.max(0, Number(event.target.value) || 0) } : item
                                    )
                                  )
                                }
                              />
                              <span className="muted">phút</span>
                            </div>
                            <button
                              className="button button-danger"
                              type="button"
                              style={{ minHeight: 24, padding: '0 6px' }}
                              aria-label={`Xóa comment ${index + 1}`}
                              onClick={() => setComments((items) => items.filter((_, itemIndex) => itemIndex !== index))}
                              title="Xóa comment này"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>

                        <textarea
                          className="field"
                          rows={2}
                          placeholder={`Nội dung comment seeding #${index + 1} (chỉnh sửa tùy ý)...`}
                          value={comment.content}
                          onChange={(event) =>
                            setComments((items) =>
                              items.map((item, itemIndex) =>
                                itemIndex === index ? { ...item, content: event.target.value } : item
                              )
                            )
                          }
                          style={{ resize: 'vertical', minHeight: 46, fontSize: 12.5 }}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      )}

      {/* BƯỚC 3: XEM LẠI & XUẤT BẢN */}
      {step === 2 && (
        <section className="panel">
          <div className="panel-heading">
            <h2>{isPublishNow ? '⚡ Xác nhận xuất bản bài viết ngay lập tức' : 'Kiểm tra bài viết trước khi lên lịch'}</h2>
          </div>
          <div className="panel-body" style={{ maxWidth: 820 }}>
            {/* Danh sách các page sẽ nhận bài */}
            <div style={{ marginBottom: 16 }}>
              <span className="muted" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
                Các Fanpage sẽ đăng ({selectedPageIds.length} Page):
              </span>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {selectedPageIds.map((id) => {
                  const channel = channels.find((c) => c.id === id);
                  return (
                    <span
                      key={id}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        background: 'rgba(37, 99, 235, 0.08)',
                        border: '1px solid rgba(37, 99, 235, 0.25)',
                        borderRadius: 16,
                        padding: '4px 12px',
                        fontSize: 12.5,
                        color: 'var(--blue)',
                        fontWeight: 600
                      }}
                    >
                      <span className="fb-mark" style={{ width: 16, height: 16, fontSize: 10 }}>f</span>
                      {channel?.name || id}
                    </span>
                  );
                })}
              </div>
            </div>

            {/* Mô phỏng bài đăng Facebook */}
            <div style={{ maxWidth: postType === 'feed' ? 620 : 330, margin: '0 auto 16px' }}>
              <FacebookMockupPreview
                postType={postType}
                pageName={channels.find((c) => selectedPageIds.includes(c.id))?.name || 'Fanpage của bạn'}
                content={content}
                title={title}
                mediaPreviewUrl={mediaPreviewUrl}
                uploadedMedia={uploadedMedia}
                mediaList={mediaList}
                scheduledAt={scheduledAt}
                comments={comments}
              />
            </div>


            {notice && (
              <div
                className="notice"
                style={{
                  marginTop: 18,
                  padding: '14px 18px',
                  borderRadius: 14,
                  background: createdPostIds.length > 0 ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.10)',
                  backdropFilter: 'var(--apple-glass-blur)',
                  WebkitBackdropFilter: 'var(--apple-glass-blur)',
                  border: createdPostIds.length > 0 ? '1px solid rgba(16, 185, 129, 0.35)' : '1px solid rgba(239, 68, 68, 0.35)',
                  color: createdPostIds.length > 0 ? '#10b981' : '#ef4444',
                  fontWeight: 700,
                  fontSize: 13.5,
                  boxShadow: createdPostIds.length > 0 ? '0 4px 16px rgba(16, 185, 129, 0.15)' : 'none'
                }}
              >
                {createdPostIds.length > 0 ? '🎉 ' : '⚠️ '}{notice}
              </div>
            )}

            {createdPostIds.length > 0 && (
              <div style={{ marginTop: 18, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <Link
                  href="/post-planner/list"
                  className="button button-primary"
                  style={{
                    background: 'linear-gradient(135deg, #10b981, #059669)',
                    border: '1px solid rgba(16, 185, 129, 0.5)',
                    boxShadow: '0 4px 16px rgba(16, 185, 129, 0.35)',
                    padding: '10px 20px',
                    fontWeight: 700
                  }}
                >
                  <Check size={16} /> Xem danh sách bài đã tạo ({createdPostIds.length})
                </Link>
                <Link
                  href="/post-planner/calendar"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '10px 18px',
                    borderRadius: 12,
                    background: 'var(--apple-glass-bg-subtle)',
                    backdropFilter: 'var(--apple-glass-blur)',
                    WebkitBackdropFilter: 'var(--apple-glass-blur)',
                    border: 'var(--apple-glass-border)',
                    borderTop: 'var(--apple-glass-border-top)',
                    color: 'var(--ink)',
                    textDecoration: 'none',
                    fontWeight: 600,
                    fontSize: 13
                  }}
                >
                  <CalendarDays size={15} /> Xem lịch Calendar
                </Link>
              </div>
            )}
          </div>
        </section>
      )}

      {/* NÚT ĐIỀU HƯỚNG BƯỚC */}
      <div className="compose-footer">
        {notice && step !== 2 && <span className="notice">{notice}</span>}
        <button
          className="button button-secondary"
          type="button"
          onClick={() => {
            setStep(Math.max(0, step - 1));
            setNotice('');
          }}
          disabled={step === 0}
        >
          <ArrowLeft size={15} /> Quay lại
        </button>

        {step < 2 && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {step === 1 && isPublishNow && selectedPageIds.length > 0 && (
              <button
                className="button button-primary"
                type="button"
                onClick={createScheduledPost}
                disabled={saving || uploadingMedia || selectedPageIds.length === 0}
                style={{
                  background: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)',
                  borderColor: '#f59e0b',
                  boxShadow: '0 0 16px rgba(245, 158, 11, 0.4)',
                  fontWeight: 700
                }}
              >
                {saving ? '⚡ Đang xuất bản…' : `⚡ Đăng ngay (${selectedPageIds.length} Page)`} <Send size={15} />
              </button>
            )}
            <button
              className={step === 1 && isPublishNow ? "button button-secondary" : "button button-primary"}
              type="button"
              onClick={() => {
                if (step === 0 && !content.trim()) {
                  setNotice('Nhập nội dung bài viết trước khi tiếp tục.');
                  return;
                }
                if (step === 1 && selectedPageIds.length === 0) {
                  setNotice('Vui lòng chọn ít nhất một Fanpage đăng bài.');
                  return;
                }
                setNotice('');
                setStep(step + 1);
              }}
              disabled={step === 1 && (channelLoading || selectedPageIds.length === 0)}
            >
              {step === 1 ? 'Xem trước & xác nhận' : 'Tiếp tục'} <ArrowRight size={15} />
            </button>
          </div>
        )}

        {step === 2 && createdPostIds.length === 0 && (
          <button
            className="button button-primary"
            type="button"
            onClick={createScheduledPost}
            disabled={saving || uploadingMedia || selectedPageIds.length === 0}
            style={isPublishNow ? {
              background: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)',
              borderColor: '#f59e0b',
              boxShadow: '0 0 20px rgba(245, 158, 11, 0.45)',
              fontWeight: 700
            } : undefined}
          >
            {saving
              ? (isPublishNow ? '⚡ Đang xuất bản lên Facebook…' : 'Đang lưu lịch…')
              : (isPublishNow ? `⚡ Đăng ngay lập tức (${selectedPageIds.length} Page)` : `Lên lịch đăng (${selectedPageIds.length} Page)`)} <Send size={15} />
          </button>
        )}

        {step === 2 && createdPostIds.length > 0 && (
          <Link className="button button-primary" href="/post-planner/list">
            Mở lịch đăng <ArrowRight size={15} />
          </Link>
        )}
      </div>

      {/* MODAL TRỢ LÝ AI VIẾT CONTENT */}
      {showAiModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 20
          }}
        >
          <div
            className="panel"
            style={{
              width: '100%',
              maxWidth: 580,
              maxHeight: '90vh',
              overflowY: 'auto'
            }}
          >
            <div className="panel-heading">
              <h2><Sparkles size={16} style={{ color: '#00f2fe', marginRight: 6, verticalAlign: 'middle' }} />Trợ lý AI viết bài Facebook</h2>
              <button
                className="button button-quiet"
                type="button"
                style={{ minHeight: 28, padding: '0 8px' }}
                onClick={() => setShowAiModal(false)}
              >
                <X size={15} />
              </button>
            </div>
            <div className="panel-body">
              <label className="field-label">Chủ đề bài viết *</label>
              <textarea
                className="field"
                placeholder="Ví dụ: Giới thiệu sản phẩm mới giảm giá 30%, hoặc câu chuyện truyền cảm hứng khởi nghiệp..."
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                rows={3}
                style={{ width: '100%', resize: 'vertical' }}
              />

              <label className="field-label" style={{ marginTop: 12 }}>Phong cách viết</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                {['Bán hàng hấp dẫn', 'Kể chuyện viral', 'Tin tức giật tít', 'Chia sẻ kiến thức', 'Hài hước hóm hỉnh'].map((tone) => (
                  <button
                    key={tone}
                    type="button"
                    className={`button ${aiTone === tone ? 'button-primary' : 'button-secondary'}`}
                    style={{ minHeight: 28, fontSize: 11.5, padding: '0 10px' }}
                    onClick={() => setAiTone(tone)}
                  >
                    {tone}
                  </button>
                ))}
              </div>

              {/* Tùy chọn Tra cứu tin tức Live */}
              <div style={{ marginBottom: 12, display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', background: 'rgba(0, 242, 254, 0.06)', borderRadius: 10, border: '1px solid rgba(0, 242, 254, 0.25)' }}>
                <input
                  type="checkbox"
                  id="ai-web-search-toggle"
                  checked={aiWebSearch}
                  onChange={(e) => setAiWebSearch(e.target.checked)}
                  style={{ accentColor: 'var(--blue)', width: 17, height: 17, marginTop: 2, cursor: 'pointer' }}
                />
                <label htmlFor="ai-web-search-toggle" style={{ fontSize: 12, color: 'var(--ink)', cursor: 'pointer', margin: 0, lineHeight: 1.45 }}>
                  🌐 <strong style={{ color: 'var(--blue)' }}>Tự động tra cứu tin tức thời sự trên mạng (Google News)</strong>: Khi viết về sự kiện "hôm nay", tin mới hoặc drama, hệ thống sẽ tự cập nhật tin tức báo chí mới nhất để AI viết chuẩn 100%, chống bịa đặt.
                </label>
              </div>

              {/* Chi tiết sự kiện tùy chọn */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <label className="field-label" htmlFor="ai-event-details" style={{ margin: 0, fontSize: 12 }}>
                    Chi tiết sự kiện / Tin vắn nguồn (Tùy chọn)
                  </label>
                  <span className="muted" style={{ fontSize: 11 }}>Dán link hoặc tóm tắt sự kiện</span>
                </div>
                <input
                  id="ai-event-details"
                  className="field"
                  placeholder="Ví dụ: Messi đá trận chia tay tuyển QG, Ronaldo đăng tâm thư xin lỗi..."
                  value={aiEventDetails}
                  onChange={(e) => setAiEventDetails(e.target.value)}
                  style={{ width: '100%', fontSize: 12.5 }}
                />
              </div>

              <button
                className="button button-primary"
                type="button"
                style={{ width: '100%', minHeight: 38 }}
                onClick={handleGenerateAi}
                disabled={aiGenerating || !aiPrompt.trim()}
              >
                <Sparkles size={15} /> {aiGenerating ? 'AI đang viết bài…' : 'Bắt đầu tạo nội dung'}
              </button>

              {aiError && (
                <div className="notice" style={{ marginTop: 12, borderColor: 'rgba(239, 68, 68, 0.4)', color: '#ef4444' }}>
                  {aiError}
                </div>
              )}

              {aiResult && (
                <div style={{ marginTop: 14 }}>
                  <label className="field-label">Kết quả từ AI:</label>
                  <div
                    style={{
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(0, 242, 254, 0.25)',
                      borderRadius: 8,
                      padding: 12,
                      whiteSpace: 'pre-wrap',
                      fontSize: 13,
                      lineHeight: 1.6,
                      maxHeight: 220,
                      overflowY: 'auto'
                    }}
                  >
                    {aiResult}
                  </div>
                  <div style={{ display: 'flex', gap: 10, marginTop: 10, justifyContent: 'flex-end' }}>
                    <button className="button button-secondary" type="button" onClick={() => setAiResult('')}>
                      Viết lại
                    </button>
                    <button className="button button-primary" type="button" onClick={applyAiResult}>
                      <Check size={14} /> Dán vào bài viết
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </MainLayout>
  );
}