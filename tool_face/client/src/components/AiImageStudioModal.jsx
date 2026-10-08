import { useState, useRef, useEffect } from 'react';
import {
  X,
  Sparkles,
  Wand2,
  Image as ImageIcon,
  Stamp,
  Download,
  Check,
  RefreshCw,
  Loader2,
  Sliders,
  Layers,
  Crop,
  ShieldCheck,
  UploadCloud
} from 'lucide-react';
import aiApi from '../services/aiApi';
import postApi from '../services/postApi';

const STYLE_PRESETS = [
  { id: 'photorealistic', label: '📸 Chân thực (Photo)', desc: 'Ảnh chụp máy ảnh chuyên nghiệp, ánh sáng studio' },
  { id: '3d', label: '🎨 3D Octane Render', desc: 'Đồ họa 3D hiện đại, màu sắc bóng bẩy, nổi khối' },
  { id: 'cyberpunk', label: '🌌 Cyberpunk Neon', desc: 'Đèn neon rực rỡ, tương lai viễn tưởng' },
  { id: 'food', label: '🍜 Ẩm thực Foodie', desc: 'Món ăn ngon mắt, chụp cận cảnh hấp dẫn' },
  { id: 'lifestyle', label: '☕ Đời sống & Cafe', desc: 'Phong cách sống tự nhiên, ấm cúng' },
  { id: 'sale', label: '🛍️ Banner Khuyến mãi', desc: 'Phong cách thương mại, nổi bật cho bán hàng' },
  { id: 'minimalist', label: '🌿 Tối giản Minimal', desc: 'Gọn gàng, tinh tế, nền sạch' }
];

const RATIO_PRESETS = [
  { id: '1:1', label: '1:1 Vuông', sub: 'Feed Facebook chuẩn', w: 1024, h: 1024 },
  { id: '9:16', label: '9:16 Dọc', sub: 'Reels / Story', w: 720, h: 1280 },
  { id: '16:9', label: '16:9 Ngang', sub: 'Cover / Thumbnail', w: 1280, h: 720 }
];

export function resolveMediaUrl(url) {
  if (!url) return '';
  if (typeof url !== 'string') return '';
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('blob:')) return url;
  if (url.startsWith('local://')) return `http://localhost:5000/api/media/${url.slice('local://'.length)}`;
  if (url.startsWith('/api/')) return `http://localhost:5000${url}`;
  return url;
}

export default function AiImageStudioModal({
  isOpen,
  onClose,
  initialDraft = null,
  onApplyMedia = null
}) {
  const [activeTab, setActiveTab] = useState('generate'); // 'generate' | 'watermark'
  
  // ── Generation State ──
  const [prompt, setPrompt] = useState('');
  const [style, setStyle] = useState('photorealistic');
  const [ratio, setRatio] = useState('1:1');
  const [generating, setGenerating] = useState(false);
  const [generatedResult, setGeneratedResult] = useState(null); // { mediaLink, previewUrl, ... }
  const [genError, setGenError] = useState('');

  // ── Watermark State ──
  const [sourceImage, setSourceImage] = useState(null); // Image object loaded in canvas
  const [sourceImageUrl, setSourceImageUrl] = useState('');
  const [watermarkType, setWatermarkType] = useState('text'); // 'text' | 'logo'
  const [watermarkText, setWatermarkText] = useState('🔥 Hotline: 0988.xxx.xxx');
  const [watermarkPosition, setWatermarkPosition] = useState('bottom-right'); // 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' | 'center'
  const [watermarkSize, setWatermarkSize] = useState(28); // font size in px
  const [watermarkOpacity, setWatermarkOpacity] = useState(0.85);
  const [watermarkColor, setWatermarkColor] = useState('#ffffff');
  const [enableBackdrop, setEnableBackdrop] = useState(true);
  const [logoFile, setLogoFile] = useState(null);
  const [logoImgObj, setLogoImgObj] = useState(null);
  const [logoScale, setLogoScale] = useState(20); // % of canvas width

  const [savingWatermark, setSavingWatermark] = useState(false);
  const canvasRef = useRef(null);

  // Initialize prompt from draft
  useEffect(() => {
    if (initialDraft) {
      const defaultP = initialDraft.title 
        ? `${initialDraft.title} - ${initialDraft.topic || ''}`
        : (initialDraft.topic || 'Sản phẩm kinh doanh chất lượng cao');
      setPrompt(defaultP);

      // Nếu draft đã có ảnh sẵn, load vào tab watermark
      if (initialDraft.mediaList?.length > 0) {
        const firstImg = initialDraft.mediaList.find(m => m.mediaType === 'image' || !m.mediaType?.includes('video'));
        if (firstImg?.previewUrl) {
          setSourceImageUrl(firstImg.previewUrl);
        }
      }
    }
  }, [initialDraft]);

  // Load source image into Image object
  useEffect(() => {
    if (!sourceImageUrl) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = resolveMediaUrl(sourceImageUrl);
    img.onload = () => {
      setSourceImage(img);
    };
  }, [sourceImageUrl]);

  // Render canvas whenever watermark parameters change
  useEffect(() => {
    if (!sourceImage || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    // Set canvas dimensions to match the source image natural size
    canvas.width = sourceImage.naturalWidth || 1024;
    canvas.height = sourceImage.naturalHeight || 1024;

    // 1. Draw base image
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(sourceImage, 0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.globalAlpha = watermarkOpacity;

    const padding = Math.max(20, Math.floor(canvas.width * 0.03));

    if (watermarkType === 'text' && watermarkText.trim()) {
      // Scale font size proportionally to canvas width
      const scaledFontSize = Math.max(14, Math.floor(watermarkSize * (canvas.width / 1000)));
      ctx.font = `600 ${scaledFontSize}px "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
      
      const textMetrics = ctx.measureText(watermarkText);
      const textWidth = textMetrics.width;
      const textHeight = scaledFontSize * 1.2;

      let x = 0;
      let y = 0;

      if (watermarkPosition === 'bottom-right') {
        x = canvas.width - textWidth - padding;
        y = canvas.height - padding;
      } else if (watermarkPosition === 'bottom-left') {
        x = padding;
        y = canvas.height - padding;
      } else if (watermarkPosition === 'top-right') {
        x = canvas.width - textWidth - padding;
        y = padding + textHeight;
      } else if (watermarkPosition === 'top-left') {
        x = padding;
        y = padding + textHeight;
      } else if (watermarkPosition === 'center') {
        x = (canvas.width - textWidth) / 2;
        y = canvas.height / 2 + textHeight / 3;
      }

      // Draw backdrop pill if enabled
      if (enableBackdrop) {
        const bgPadX = scaledFontSize * 0.5;
        const bgPadY = scaledFontSize * 0.25;
        const pillX = x - bgPadX;
        const pillY = y - textHeight + bgPadY;
        const pillW = textWidth + bgPadX * 2;
        const pillH = textHeight + bgPadY * 0.8;
        const radius = scaledFontSize * 0.35;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(pillX, pillY, pillW, pillH, radius);
        } else {
          ctx.rect(pillX, pillY, pillW, pillH);
        }
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Drop shadow for crisp readability
      ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetX = 1;
      ctx.shadowOffsetY = 1;

      ctx.fillStyle = watermarkColor;
      ctx.fillText(watermarkText, x, y);
    } else if (watermarkType === 'logo' && logoImgObj) {
      const logoW = Math.floor(canvas.width * (logoScale / 100));
      const aspectRatio = logoImgObj.naturalWidth / logoImgObj.naturalHeight || 1;
      const logoH = Math.floor(logoW / aspectRatio);

      let x = 0;
      let y = 0;

      if (watermarkPosition === 'bottom-right') {
        x = canvas.width - logoW - padding;
        y = canvas.height - logoH - padding;
      } else if (watermarkPosition === 'bottom-left') {
        x = padding;
        y = canvas.height - logoH - padding;
      } else if (watermarkPosition === 'top-right') {
        x = canvas.width - logoW - padding;
        y = padding;
      } else if (watermarkPosition === 'top-left') {
        x = padding;
        y = padding;
      } else if (watermarkPosition === 'center') {
        x = (canvas.width - logoW) / 2;
        y = (canvas.height - logoH) / 2;
      }

      ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
      ctx.shadowBlur = 6;
      ctx.drawImage(logoImgObj, x, y, logoW, logoH);
    }

    ctx.restore();
  }, [
    sourceImage,
    watermarkType,
    watermarkText,
    watermarkPosition,
    watermarkSize,
    watermarkOpacity,
    watermarkColor,
    enableBackdrop,
    logoImgObj,
    logoScale
  ]);

  if (!isOpen) return null;

  // ── Handle AI Generate Image ──
  const handleGenerateImage = async () => {
    if (!prompt.trim() || generating) return;
    setGenerating(true);
    setGenError('');
    try {
      const res = await aiApi.generateImage({
        prompt: prompt.trim(),
        title: initialDraft?.title || '',
        topic: initialDraft?.topic || '',
        content: initialDraft?.content || '',
        style,
        ratio
      });

      if (res.success && res.previewUrl) {
        setGeneratedResult(res);
        setSourceImageUrl(res.previewUrl);
      } else {
        setGenError(res.message || 'Không thể tạo ảnh. Vui lòng thử lại!');
      }
    } catch (err) {
      setGenError(err.response?.data?.message || err.message || 'Lỗi kết nối máy chủ tạo ảnh.');
    } finally {
      setGenerating(false);
    }
  };

  // ── Handle Logo File Upload ──
  const handleLogoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    const img = new Image();
    img.src = URL.createObjectURL(file);
    img.onload = () => {
      setLogoImgObj(img);
    };
  };

  // ── Handle Direct Custom Image Upload to Watermark Studio ──
  const handleUploadCustomSourceImage = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setSourceImageUrl(url);
  };

  // ── Handle Apply Image (Direct or Watermarked) to Draft ──
  const handleApplyToDraft = async (useWatermarked = false) => {
    if (!onApplyMedia) return;

    if (useWatermarked && canvasRef.current) {
      setSavingWatermark(true);
      try {
        const canvas = canvasRef.current;
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92));
        if (!blob) throw new Error('Không thể xuất ảnh từ canvas.');

        const formData = new FormData();
        formData.append('file', blob, `watermarked_${Date.now()}.jpg`);
        const uploaded = await postApi.uploadMedia(formData);

        if (uploaded.success) {
          const newMediaItem = {
            mediaLink: uploaded.mediaLink,
            previewUrl: uploaded.previewUrl || URL.createObjectURL(blob),
            mediaType: 'image',
            fileName: uploaded.fileName || 'watermarked.jpg',
            watermarked: true
          };
          onApplyMedia(newMediaItem);
          onClose();
        }
      } catch (err) {
        alert('Lỗi lưu ảnh đóng dấu: ' + err.message);
      } finally {
        setSavingWatermark(false);
      }
    } else if (generatedResult) {
      // Gắn trực tiếp ảnh AI nguyên bản
      const newMediaItem = {
        mediaLink: generatedResult.mediaLink,
        previewUrl: generatedResult.previewUrl,
        mediaType: 'image',
        fileName: generatedResult.fileName,
        aiGenerated: true
      };
      onApplyMedia(newMediaItem);
      onClose();
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(2, 6, 23, 0.85)',
      backdropFilter: 'blur(16px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16
    }}>
      <div className="panel-3d" style={{
        width: '100%', maxWidth: 960, maxHeight: '92vh',
        display: 'flex', flexDirection: 'column',
        borderRadius: 20, overflow: 'hidden',
        background: 'linear-gradient(135deg, rgba(13, 20, 36, 0.95), rgba(7, 11, 22, 0.98))',
        border: '1px solid rgba(0, 242, 254, 0.25)',
        boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.8), 0 0 40px rgba(0, 242, 254, 0.15)'
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 24px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'rgba(255, 255, 255, 0.02)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'linear-gradient(135deg, #00f2fe, #4facfe)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 15px rgba(0, 242, 254, 0.4)'
            }}>
              <Sparkles size={20} color="#000" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.01em' }}>
                AI Visual & Watermark Studio
              </h3>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>
                Tạo ảnh tự động bằng AI và đóng dấu bản quyền thương hiệu cho bài đăng Facebook
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Tab switch */}
            <div style={{
              display: 'flex', background: 'var(--field-bg)', borderRadius: 10, padding: 3,
              border: '1px solid var(--line)'
            }}>
              <button
                type="button"
                onClick={() => setActiveTab('generate')}
                style={{
                  padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                  border: 'none', cursor: 'pointer', transition: 'all 0.2s',
                  background: activeTab === 'generate' ? 'var(--blue)' : 'transparent',
                  color: activeTab === 'generate' ? '#ffffff' : 'var(--muted)'
                }}
              >
                🎨 AI Tạo ảnh
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('watermark')}
                style={{
                  padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                  border: 'none', cursor: 'pointer', transition: 'all 0.2s',
                  background: activeTab === 'watermark' ? 'var(--blue)' : 'transparent',
                  color: activeTab === 'watermark' ? '#ffffff' : 'var(--muted)'
                }}
              >
                💧 Đóng dấu Watermark
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'rgba(255,255,255,0.05)', border: 'none', borderRadius: 8,
                padding: 8, cursor: 'pointer', color: 'var(--muted)', display: 'flex'
              }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', gap: 24 }}>
          {activeTab === 'generate' ? (
            /* ── TAB 1: AI GENERATE IMAGE ── */
            <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 24, width: '100%' }}>
              {/* Left Controls */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
                    Yêu cầu / Mô tả hình ảnh (AI Prompt):
                  </label>
                  <textarea
                    value={prompt}
                    onChange={e => setPrompt(e.target.value)}
                    placeholder="Mô tả bức ảnh bạn muốn tạo (tiếng Việt hoặc tiếng Anh)..."
                    rows={3}
                    style={{
                      width: '100%', background: 'var(--field-bg)', border: '1px solid var(--line)',
                      borderRadius: 10, padding: 12, color: 'var(--ink)', fontSize: 13, resize: 'none',
                      outline: 'none', fontFamily: 'inherit'
                    }}
                  />
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, display: 'flex', justifyContent: 'space-between' }}>
                    <span>Hệ thống tự động dịch & tối ưu prompt chuẩn DALL-E / Flux 8K</span>
                  </div>
                </div>

                {/* Tỉ lệ ảnh */}
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
                    Tỉ lệ khung hình:
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                    {RATIO_PRESETS.map(r => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setRatio(r.id)}
                        style={{
                          padding: '10px 8px', borderRadius: 10, textAlign: 'center', cursor: 'pointer',
                          background: ratio === r.id ? 'rgba(0, 242, 254, 0.12)' : 'rgba(255,255,255,0.03)',
                          border: `1px solid ${ratio === r.id ? 'rgba(0, 242, 254, 0.4)' : 'rgba(255,255,255,0.06)'}`,
                          color: ratio === r.id ? '#00f2fe' : 'var(--fg)', transition: 'all 0.2s'
                        }}
                      >
                        <div style={{ fontSize: 13, fontWeight: 700 }}>{r.label}</div>
                        <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{r.sub}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Phong cách nghệ thuật */}
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
                    Phong cách nghệ thuật:
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, maxHeight: 220, overflowY: 'auto' }}>
                    {STYLE_PRESETS.map(s => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setStyle(s.id)}
                        style={{
                          padding: '8px 12px', borderRadius: 8, textAlign: 'left', cursor: 'pointer',
                          background: style === s.id ? 'rgba(168, 85, 247, 0.15)' : 'rgba(255,255,255,0.02)',
                          border: `1px solid ${style === s.id ? 'rgba(168, 85, 247, 0.4)' : 'rgba(255,255,255,0.05)'}`,
                          color: style === s.id ? '#c084fc' : 'var(--fg)', transition: 'all 0.2s'
                        }}
                      >
                        <div style={{ fontSize: 12, fontWeight: 600 }}>{s.label}</div>
                        <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {s.desc}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {genError && (
                  <div style={{ padding: 10, borderRadius: 8, background: 'rgba(239,68,68,0.1)', color: '#f87171', fontSize: 12 }}>
                    ⚠️ {genError}
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleGenerateImage}
                  disabled={generating || !prompt.trim()}
                  className="btn-cyber"
                  style={{
                    padding: '12px 20px', borderRadius: 10, fontSize: 14, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer'
                  }}
                >
                  {generating ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>AI đang vẽ ảnh ({style})...</span>
                    </>
                  ) : (
                    <>
                      <Wand2 size={16} />
                      <span>Tạo ảnh minh họa bằng AI</span>
                    </>
                  )}
                </button>
              </div>

              {/* Right Preview */}
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(0,0,0,0.4)', borderRadius: 16,
                border: '1px solid rgba(255,255,255,0.08)', padding: 16, minHeight: 380, position: 'relative'
              }}>
                {generating ? (
                  <div style={{ textAlign: 'center' }}>
                    <div className="quantum-orb" style={{ margin: '0 auto 16px' }} />
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#00f2fe' }}>AI đang vẽ bức ảnh của bạn...</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                      Đang xử lý ánh sáng, bố cục & chi tiết 8K (khoảng 3-8 giây)
                    </div>
                  </div>
                ) : generatedResult ? (
                  <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{
                      position: 'relative', width: '100%', minHeight: 320, maxHeight: 360,
                      borderRadius: 14, overflow: 'hidden', border: '1px solid rgba(0,242,254,0.35)',
                      boxShadow: '0 0 30px rgba(0,242,254,0.25)', background: 'rgba(2, 6, 23, 0.75)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                      <img
                        src={resolveMediaUrl(generatedResult.previewUrl)}
                        alt="AI Generated"
                        style={{ maxWidth: '100%', maxHeight: 360, objectFit: 'contain', display: 'block' }}
                      />
                      <div style={{
                        position: 'absolute', bottom: 10, left: 10,
                        background: 'rgba(4, 8, 20, 0.85)', backdropFilter: 'blur(8px)',
                        padding: '5px 12px', borderRadius: 8, fontSize: 11.5, color: '#00f2fe', fontWeight: 700,
                        border: '1px solid rgba(0,242,254,0.3)', boxShadow: '0 4px 12px rgba(0,0,0,0.6)',
                        display: 'flex', alignItems: 'center', gap: 6, zIndex: 5
                      }}>
                        <Sparkles size={12} color="#00f2fe" />
                        <span>AI Generated ({generatedResult.style})</span>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: 10, marginTop: 16, width: '100%' }}>
                      <button
                        type="button"
                        onClick={() => {
                          setSourceImageUrl(generatedResult.previewUrl);
                          setActiveTab('watermark');
                        }}
                        className="button button-quiet"
                        style={{
                          flex: 1, padding: '10px 14px', borderRadius: 10, fontSize: 12, fontWeight: 600,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                          borderColor: 'rgba(168,85,247,0.4)', color: '#c084fc'
                        }}
                      >
                        <Stamp size={14} />
                        <span>Đóng dấu Watermark</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleApplyToDraft(false)}
                        className="btn-cyber"
                        style={{
                          flex: 1, padding: '10px 14px', borderRadius: 10, fontSize: 12, fontWeight: 700,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
                        }}
                      >
                        <Check size={14} />
                        <span>Gắn vào bài đăng</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 20 }}>
                    <ImageIcon size={48} style={{ opacity: 0.3, marginBottom: 12 }} />
                    <div style={{ fontSize: 14, fontWeight: 600 }}>Chưa có hình ảnh</div>
                    <div style={{ fontSize: 12, marginTop: 4, maxWidth: 260 }}>
                      Nhập prompt bên trái và bấm "Tạo ảnh minh họa bằng AI" để bắt đầu
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* ── TAB 2: WATERMARK & BRANDING STUDIO ── */
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 24, width: '100%' }}>
              {/* Left Canvas Preview */}
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(0,0,0,0.5)', borderRadius: 16,
                border: '1px solid rgba(255,255,255,0.08)', padding: 16, minHeight: 420, position: 'relative'
              }}>
                {sourceImageUrl ? (
                  <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{
                      maxWidth: '100%', maxHeight: 360, overflow: 'hidden',
                      borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)',
                      boxShadow: '0 10px 30px rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center'
                    }}>
                      <canvas
                        ref={canvasRef}
                        style={{
                          maxWidth: '100%', maxHeight: 360, objectFit: 'contain', display: 'block'
                        }}
                      />
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>
                      💡 Bản xem trước WYSIWYG thời gian thực. Xuất bản sẽ giữ 100% độ nét gốc.
                    </div>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', color: 'var(--muted)' }}>
                    <Stamp size={48} style={{ opacity: 0.3, marginBottom: 12 }} />
                    <div style={{ fontSize: 14, fontWeight: 600 }}>Chưa chọn ảnh để đóng dấu</div>
                    <div style={{ fontSize: 12, marginTop: 4, marginBottom: 14 }}>
                      Bạn có thể tạo ảnh bằng AI ở Tab bên cạnh hoặc chọn ảnh từ máy:
                    </div>
                    <label style={{
                      padding: '8px 16px', borderRadius: 8, background: 'rgba(255,255,255,0.08)',
                      cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#00f2fe',
                      display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid rgba(0,242,254,0.3)'
                    }}>
                      <UploadCloud size={14} />
                      <span>Tải ảnh từ máy lên</span>
                      <input type="file" accept="image/*" hidden onChange={handleUploadCustomSourceImage} />
                    </label>
                  </div>
                )}
              </div>

              {/* Right Watermark Controls */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto', maxHeight: 480, paddingRight: 4 }}>
                {/* Loai Watermark */}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => setWatermarkType('text')}
                    style={{
                      flex: 1, padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                      background: watermarkType === 'text' ? 'rgba(0, 242, 254, 0.15)' : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${watermarkType === 'text' ? 'rgba(0, 242, 254, 0.4)' : 'rgba(255,255,255,0.06)'}`,
                      color: watermarkType === 'text' ? '#00f2fe' : 'var(--muted)', cursor: 'pointer'
                    }}
                  >
                    ✍️ Chữ bản quyền
                  </button>
                  <button
                    type="button"
                    onClick={() => setWatermarkType('logo')}
                    style={{
                      flex: 1, padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                      background: watermarkType === 'logo' ? 'rgba(0, 242, 254, 0.15)' : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${watermarkType === 'logo' ? 'rgba(0, 242, 254, 0.4)' : 'rgba(255,255,255,0.06)'}`,
                      color: watermarkType === 'logo' ? '#00f2fe' : 'var(--muted)', cursor: 'pointer'
                    }}
                  >
                    🏷️ Logo thương hiệu
                  </button>
                </div>

                {watermarkType === 'text' ? (
                  <>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
                        Nội dung chữ đóng dấu:
                      </label>
                      <input
                        type="text"
                        value={watermarkText}
                        onChange={e => setWatermarkText(e.target.value)}
                        placeholder="Hotline / Tên Page / Website..."
                        style={{
                          width: '100%', background: 'var(--field-bg)', border: '1px solid var(--line)',
                          borderRadius: 8, padding: '8px 12px', color: 'var(--ink)', fontSize: 13, outline: 'none'
                        }}
                      />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
                          Màu chữ:
                        </label>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {[
                            { color: '#ffffff', label: 'Trắng' },
                            { color: '#00f2fe', label: 'Cyan' },
                            { color: '#fbbf24', label: 'Vàng' },
                            { color: '#000000', label: 'Đen' }
                          ].map(c => (
                            <button
                              key={c.color}
                              type="button"
                              onClick={() => setWatermarkColor(c.color)}
                              style={{
                                width: 28, height: 28, borderRadius: 6, background: c.color,
                                border: watermarkColor === c.color ? '2px solid #00f2fe' : '1px solid rgba(255,255,255,0.2)',
                                cursor: 'pointer'
                              }}
                            />
                          ))}
                        </div>
                      </div>

                      <div>
                        <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
                          Khung nền mờ:
                        </label>
                        <button
                          type="button"
                          onClick={() => setEnableBackdrop(!enableBackdrop)}
                          style={{
                            padding: '6px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                            background: enableBackdrop ? 'rgba(0, 242, 254, 0.15)' : 'rgba(255,255,255,0.05)',
                            border: `1px solid ${enableBackdrop ? 'rgba(0, 242, 254, 0.4)' : 'rgba(255,255,255,0.1)'}`,
                            color: enableBackdrop ? '#00f2fe' : 'var(--muted)', cursor: 'pointer'
                          }}
                        >
                          {enableBackdrop ? '✓ Có nền bảo vệ' : '✕ Trong suốt'}
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
                      Tải file Logo PNG (trong suốt):
                    </label>
                    <label style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      padding: 12, borderRadius: 8, border: '1px dashed rgba(255,255,255,0.2)',
                      background: 'rgba(255,255,255,0.02)', cursor: 'pointer', fontSize: 12, color: '#00f2fe'
                    }}>
                      <UploadCloud size={16} />
                      <span>{logoFile ? logoFile.name : 'Chọn file Logo PNG từ máy tính'}</span>
                      <input type="file" accept="image/png,image/webp,image/svg+xml" hidden onChange={handleLogoUpload} />
                    </label>
                  </div>
                )}

                {/* Vị trí Watermark */}
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
                    Vị trí đặt dấu:
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                    {[
                      { id: 'top-left', label: 'Góc trên T' },
                      { id: 'center', label: 'Chính giữa' },
                      { id: 'top-right', label: 'Góc trên P' },
                      { id: 'bottom-left', label: 'Góc dưới T' },
                      { id: '', label: '' },
                      { id: 'bottom-right', label: 'Góc dưới P' }
                    ].map((p, pi) => p.id ? (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setWatermarkPosition(p.id)}
                        style={{
                          padding: '6px 4px', borderRadius: 6, fontSize: 11, fontWeight: 600, textAlign: 'center',
                          background: watermarkPosition === p.id ? 'rgba(0, 242, 254, 0.15)' : 'rgba(255,255,255,0.03)',
                          border: `1px solid ${watermarkPosition === p.id ? 'rgba(0, 242, 254, 0.4)' : 'rgba(255,255,255,0.06)'}`,
                          color: watermarkPosition === p.id ? '#00f2fe' : 'var(--muted)', cursor: 'pointer'
                        }}
                      >
                        {p.label}
                      </button>
                    ) : <div key={pi} />)}
                  </div>
                </div>

                {/* Sliders: Kích thước & Độ trong suốt */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>
                      <span>Kích thước:</span>
                      <span>{watermarkType === 'text' ? `${watermarkSize}px` : `${logoScale}%`}</span>
                    </div>
                    <input
                      type="range"
                      min={watermarkType === 'text' ? 16 : 8}
                      max={watermarkType === 'text' ? 60 : 50}
                      value={watermarkType === 'text' ? watermarkSize : logoScale}
                      onChange={e => watermarkType === 'text' ? setWatermarkSize(Number(e.target.value)) : setLogoScale(Number(e.target.value))}
                      style={{ width: '100%', accentColor: '#00f2fe' }}
                    />
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>
                      <span>Độ trong suốt (Opacity):</span>
                      <span>{Math.round(watermarkOpacity * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min={0.2}
                      max={1.0}
                      step={0.05}
                      value={watermarkOpacity}
                      onChange={e => setWatermarkOpacity(Number(e.target.value))}
                      style={{ width: '100%', accentColor: '#00f2fe' }}
                    />
                  </div>
                </div>

                {/* Apply button */}
                <div style={{ marginTop: 10 }}>
                  <button
                    type="button"
                    onClick={() => handleApplyToDraft(true)}
                    disabled={savingWatermark || !sourceImage}
                    className="btn-cyber"
                    style={{
                      width: '100%', padding: '12px 18px', borderRadius: 10, fontSize: 13, fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer'
                    }}
                  >
                    {savingWatermark ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        <span>Đang xuất & gắn vào bài đăng...</span>
                      </>
                    ) : (
                      <>
                        <Check size={16} />
                        <span>Áp dụng Watermark & Gắn vào bài</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
