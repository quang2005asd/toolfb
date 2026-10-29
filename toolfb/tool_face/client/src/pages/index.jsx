import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowRight,
  Globe2,
  Sparkles,
  Zap,
  Shield,
  Users,
  CheckCircle2,
  FileSpreadsheet,
  MessageSquare,
  Clock,
  LayoutDashboard,
  Film,
  TrendingUp,
  Layers,
  Calendar,
  Check,
  ChevronRight,
  Send,
  MessageCircle,
  ExternalLink,
  Flame,
  CheckCheck
} from 'lucide-react';
import useAuth from '../hooks/useAuth';

const showcaseTabs = [
  { id: 'dashboard', label: 'Bảng tin Workspace', icon: LayoutDashboard, img: '/hero-dashboard.jpg', tag: 'DASHBOARD 24/7' },
  { id: 'ai', label: 'AI Studio LPU', icon: Sparkles, img: '/ai-studio-showcase.jpg', tag: 'AI GENERATOR' },
  { id: 'excel', label: 'Nhập lịch Excel', icon: FileSpreadsheet, img: '/excel-bulk-showcase.jpg', tag: 'BULK IMPORT' },
  { id: 'multiformat', label: 'Reels & Story 9:16', icon: Film, img: '/multiformat-showcase.jpg', tag: 'MULTI-FORMAT' }
];

const workflowSteps = [
  {
    step: '01',
    title: 'Kết nối Fanpage',
    desc: 'Liên kết không giới hạn Fanpage qua Token v22.0 dài hạn an toàn.',
    tag: 'ĐA KÊNH',
    img: '/step-1-multichannel.jpg'
  },
  {
    step: '02',
    title: 'Sáng tạo nội dung với AI',
    desc: 'Tự động tạo caption viral, hashtag chuẩn SEO và giọng văn đa dạng.',
    tag: 'AI STUDIO',
    img: '/step-2-ai.jpg'
  },
  {
    step: '03',
    title: 'Đính kèm Media & Seeding',
    desc: 'Hỗ trợ Reels 9:16, Story 24h, Album ảnh và bình luận mồi tự động.',
    tag: 'TỰ ĐỘNG HOÁ',
    img: '/step-3-seeding.jpg'
  },
  {
    step: '04',
    title: 'Lên lịch & Xuất bản 24/7',
    desc: 'Hẹn giờ chính xác từng phút, vận hành ngầm liên tục qua BullMQ.',
    tag: 'BULLMQ 24/7',
    img: '/step-4-scheduler.jpg'
  }
];

const features = [
  {
    title: 'Lên lịch hàng loạt qua Excel',
    desc: 'Chỉ cần 1 file Excel (.xlsx), bạn có thể lên lịch hàng trăm bài viết cho cả tháng trong 30 giây.',
    tag: 'SIÊU TỐC',
    img: '/excel-bulk-showcase.jpg',
    link: '/post-planner/bulk-upload',
    actionText: 'Tải file mẫu Excel',
    color: '#d97706',
    bullets: ['Bóc tách tiêu đề & link media tự động', 'Dàn đều khung giờ vàng thông minh', 'Báo cáo trực quan từng dòng dữ liệu']
  },
  {
    title: 'Trợ lý AI Studio Sáng Tạo',
    desc: 'Tích hợp mô hình AI siêu tốc viết caption viral, tạo hashtag xu hướng và giữ chân người xem.',
    tag: 'AI LPU CHIP',
    img: '/ai-studio-showcase.jpg',
    link: '/ai-studio',
    actionText: 'Trải nghiệm AI Studio',
    color: '#2563eb',
    bullets: ['Caption theo từng ngành hàng', 'Tối ưu độ dài bài chuẩn thuật toán', 'Bộ gợi ý prompt mẫu chuyên sâu']
  },
  {
    title: 'Bình luận Seeding Tự Động',
    desc: 'Tự động ghim bình luận mồi ngay sau khi bài vừa xuất bản để kích thích tương tác tự nhiên.',
    tag: 'TĂNG TƯƠNG TÁC',
    img: '/step-3-seeding.jpg',
    link: '/post-planner/compose',
    actionText: 'Cấu hình Seeding',
    color: '#059669',
    bullets: ['Cài đặt nhiều tầng bình luận mồi', 'Độ trễ hẹn giờ ngẫu nhiên', 'Giữ bài sạch không bị bóp reach']
  },
  {
    title: 'Xuất bản Đa Định Dạng Toàn Diện',
    desc: 'Bắt trọn mọi định dạng hot nhất: Video ngắn Reels 9:16, tin Story 24h và Album nhiều ảnh.',
    tag: 'REELS · STORY',
    img: '/multiformat-showcase.jpg',
    link: '/post-planner/compose',
    actionText: 'Soạn bài ngay',
    color: '#7c3aed',
    bullets: ['Facebook Reels 9:16 sắc nét', 'Facebook Story tự biến mất sau 24h', 'Album ảnh tự động dàn khung đẹp']
  }
];

const contacts = [
  {
    type: 'fb',
    name: 'Facebook Cá Nhân',
    handle: 'Nguyễn Việt Quang',
    action: 'Nhắn tin Messenger',
    url: 'https://web.facebook.com/nguyen.viet.quang.751589',
    color: '#1877f2',
    icon: Globe2,
    img: '/contact-fb.jpg'
  },
  {
    type: 'tiktok',
    name: 'Kênh TikTok Official',
    handle: '@nvtq.27',
    action: 'Xem Video Hướng Dẫn',
    url: 'https://www.tiktok.com/@nvtq.27',
    color: '#000000',
    icon: Film,
    img: '/contact-tiktok.jpg'
  },
  {
    type: 'tele',
    name: 'Cộng Đồng Telegram',
    handle: '@emquang_toolface',
    action: 'Vào Nhóm Hỗ Trợ',
    url: 'https://t.me',
    color: '#229ed9',
    icon: Send,
    img: '/contact-tele.jpg'
  },
  {
    type: 'zalo',
    name: 'Hotline / Zalo Hỗ Trợ',
    handle: '0336.672.005 (24/7)',
    action: 'Chat Zalo Kỹ Thuật',
    url: 'https://zalo.me/0336672005',
    color: '#0068ff',
    icon: MessageCircle,
    img: '/contact-zalo.jpg'
  }
];

const stats = [
  { value: '100+', label: 'Fanpage Quản lý', desc: 'Đồng bộ đa tài khoản an toàn' },
  { value: '10,000+', label: 'Bài đã xuất bản', desc: 'Tự động 24/7 qua hàng đợi' },
  { value: '99.9%', label: 'Tỉ lệ thành công', desc: 'Cơ chế tự động thử lại khi lỗi' },
  { value: '0.5s', label: 'Tốc độ phản hồi AI', desc: 'Tích hợp chip AI LPU siêu tốc' }
];

export default function LandingPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveTab((prev) => (prev + 1) % showcaseTabs.length);
    }, 4500);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="landing-modern">
      {/* ── HEADER NAVIGATION ── */}
      <header className="lm-header">
        <div className="lm-header-inner">
          <div className="lm-brand">
            <div className="lm-brand-mark">
              <Image src="/brand-logo.png" alt="Logo" width={40} height={40} priority style={{ borderRadius: 10, objectFit: 'cover' }} />
            </div>
            <div>
              <div className="lm-brand-title">Em Quang Tool Face</div>
              <div className="lm-brand-subtitle">Facebook Automation Suite</div>
            </div>
          </div>


          <div className="lm-nav-actions">
            {user ? (
              <div className="lm-user-group">
                <Link href="/dashboard" className="lm-user-pill" title="Workspace cá nhân">
                  {user.avatar ? (
                    <img src={user.avatar} alt={user.name} className="lm-user-avatar" referrerPolicy="no-referrer" />
                  ) : (
                    <span className="lm-user-fallback">{user.name?.charAt(0)?.toUpperCase() || 'U'}</span>
                  )}
                  <div className="lm-user-meta">
                    <span className="lm-user-name">{user.name}</span>
                    <span className="lm-user-status">● Đang hoạt động</span>
                  </div>
                </Link>
                <Link href="/dashboard" className="lm-btn lm-btn-primary">
                  <LayoutDashboard size={15} /> Vào Workspace
                </Link>
              </div>
            ) : (
              <div className="lm-auth-actions">
                <Link href="/login" className="lm-btn lm-btn-outline">
                  Đăng nhập
                </Link>
                <Link href="/login" className="lm-btn lm-btn-primary">
                  <Globe2 size={15} /> Bắt đầu ngay
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── NOTICE TICKER (FLOATING LUXURY CAPSULE) ── */}
      <div className="lm-ticker-wrap">
        <div className="lm-ticker-pill">
          <span className="lm-ticker-live-dot" />
          <span className="lm-ticker-badge">MỚI NHẤT</span>
          <span className="lm-ticker-text">
            Hỗ trợ toàn diện Facebook Graph API v22.0 · Đăng Reels 9:16 · Story 24h · Album ảnh · AI Studio LPU
          </span>
          <Link href="/post-planner/compose" className="lm-ticker-action">
            Khám phá ngay →
          </Link>
        </div>
      </div>

      {/* ── HERO SECTION ── */}
      <section className="lm-hero">
        <div className="lm-hero-content">
          <h1 className="lm-hero-title">
            Tự động hoá Fanpage <span className="lm-hero-gradient">Đa Kênh</span>
          </h1>

          <p className="lm-hero-desc">
            Vận hành đa Fanpage 24/7 · Sáng tạo nội dung với AI LPU · Lên lịch tự động chuẩn Meta Graph API v22.0.
          </p>

          <div className="lm-hero-actions">
            {user ? (
              <>
                <Link href="/dashboard" className="lm-btn lm-btn-lg lm-btn-primary">
                  Vào Workspace làm việc <ArrowRight size={17} />
                </Link>
                <Link href="/ai-studio" className="lm-btn lm-btn-lg lm-btn-secondary">
                  <Sparkles size={16} /> AI Studio LPU
                </Link>
              </>
            ) : (
              <>
                <Link href="/login" className="lm-btn lm-btn-lg lm-btn-primary">
                  Bắt đầu sử dụng ngay <ArrowRight size={17} />
                </Link>
                <Link href="/login" className="lm-btn lm-btn-lg lm-btn-secondary">
                  Đăng nhập Facebook
                </Link>
              </>
            )}
          </div>

          <div className="lm-hero-trust">
            <div className="lm-trust-item"><CheckCircle2 size={14} color="#059669" /> Miễn phí sử dụng</div>
            <div className="lm-trust-item"><CheckCircle2 size={14} color="#059669" /> Mã hoá AES-256 an toàn</div>
            <div className="lm-trust-item"><CheckCircle2 size={14} color="#059669" /> Chạy ngầm 24/7 với BullMQ</div>
          </div>
        </div>

        {/* ── HERO VISUAL SHOWCASE (CLEAN PREMIUM MAC WINDOW) ── */}
        <div className="lm-hero-preview" id="showcase">
          <div className="lm-preview-window">
            <div className="lm-preview-topbar">
              <div className="lm-window-dots">
                <span className="dot red" />
                <span className="dot yellow" />
                <span className="dot green" />
              </div>

              <div className="lm-window-status">
                <span className="lm-pulse-dot" /> Trực tuyến 24/7
              </div>
            </div>

            {/* Inner Dashboard Real Visual Screenshot with Clean Transition */}
            <div className="lm-preview-media-wrap">
              <img
                key={showcaseTabs[activeTab].id}
                src={showcaseTabs[activeTab].img}
                alt={showcaseTabs[activeTab].label}
                className="lm-preview-img lm-fade-in"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── STATS NUMBERS BAR ── */}
      <section className="lm-stats-section">
        <div className="lm-stats-grid">
          {stats.map((s, idx) => (
            <div key={idx} className="lm-stat-item">
              <div className="lm-stat-value">{s.value}</div>
              <div className="lm-stat-label">{s.label}</div>
              <div className="lm-stat-desc">{s.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── CORE PILLARS & FEATURES (BENTO CARDS KÈM ẢNH THỰC TẾ) ── */}
      <section className="lm-features-section" id="features">
        <div className="lm-section-head">
          <span className="lm-section-pill"><Layers size={13} /> Module Tính Năng</span>
          <h2 className="lm-section-title">Giải pháp hình ảnh & tự động hoá toàn diện</h2>
          <p className="lm-section-desc">
            Không còn thao tác thủ công rườm rà. Tất cả công cụ được trực quan hoá sống động.
          </p>
        </div>

        <div className="lm-features-grid">
          {features.map((f, idx) => (
            <div key={idx} className="lm-feature-card">
              <div className="lm-feature-media">
                <img src={f.img} alt={f.title} className="lm-feature-img" />
                <span className="lm-feature-tag" style={{ color: f.color }}>{f.tag}</span>
              </div>
              <div className="lm-feature-body">
                <h3 className="lm-feature-title">{f.title}</h3>
                <p className="lm-feature-text">{f.desc}</p>
                <ul className="lm-feature-bullets">
                  {f.bullets.map((b, bIdx) => (
                    <li key={bIdx}><Check size={14} /> {b}</li>
                  ))}
                </ul>
                <Link href={f.link} className="lm-card-link">
                  {f.actionText} →
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── WORKFLOW PROCESS (QUY TRÌNH 4 BƯỚC CÓ ẢNH MINH HOẠ) ── */}
      <section className="lm-workflow-section" id="workflow">
        <div className="lm-section-head">
          <span className="lm-section-pill"><Clock size={13} /> Quy Trình Tinh Gọn</span>
          <h2 className="lm-section-title">Vận hành trực quan trong 4 bước</h2>
          <p className="lm-section-desc">
            Tiết kiệm 90% thời gian quản lý Fanpage mỗi ngày với giao diện tối ưu.
          </p>
        </div>

        <div className="lm-workflow-grid">
          {workflowSteps.map((wf, idx) => (
            <div key={idx} className="lm-workflow-card">
              <div className="lm-wf-media">
                <img src={wf.img} alt={wf.title} className="lm-wf-img" />
                <span className="lm-wf-step-num">{wf.step}</span>
              </div>
              <div className="lm-wf-body">
                <span className="lm-wf-tag">{wf.tag}</span>
                <h4 className="lm-wf-title">{wf.title}</h4>
                <p className="lm-wf-desc">{wf.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── OFFICIAL CONTACT CHANNELS (KÊNH HỖ TRỢ TRỰC TIẾP) ── */}
      <section className="lm-contact-section" id="contact">
        <div className="lm-section-head">
          <span className="lm-section-pill"><Globe2 size={13} /> Hỗ Trợ Kỹ Thuật 24/7</span>
          <h2 className="lm-section-title">Kênh liên hệ chính thức</h2>
          <p className="lm-section-desc">
            Cần giải đáp thắc mắc, yêu cầu tính năng mới hoặc hỗ trợ cài đặt? Kết nối với tác giả qua các kênh bên dưới.
          </p>
        </div>

        <div className="lm-contact-grid">
          {contacts.map((c, idx) => {
            const Icon = c.icon;
            return (
              <a
                key={idx}
                href={c.url}
                target="_blank"
                rel="noreferrer"
                className="lm-contact-card"
              >
                <div className="lm-contact-media-banner">
                  <img src={c.img} alt={c.name} className="lm-contact-media-img" />
                  <div className="lm-contact-icon-badge" style={{ color: c.color }}>
                    <Icon size={18} />
                  </div>
                </div>
                <div className="lm-contact-body">
                  <div className="lm-contact-name">{c.name}</div>
                  <div className="lm-contact-handle">{c.handle}</div>
                  <div className="lm-contact-action">{c.action} →</div>
                </div>
              </a>
            );
          })}
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="lm-footer">
        <div className="lm-footer-inner">
          <div className="lm-footer-brand">
            <strong>Em Quang Tool Face</strong> — Hệ thống quản lý & lên lịch bài Fanpage tự động 2026.
          </div>
          <div className="lm-footer-copy">
            Thiết kế theo triết lý Tinh Gọn, Sang Trọng và Bền Bỉ.
          </div>
        </div>
      </footer>
    </div>
  );
}