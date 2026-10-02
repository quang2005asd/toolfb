import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowRight,
  CalendarRange,
  Globe2,
  Layers3,
  PenSquare,
  Sparkles,
  Zap,
  Shield,
  Users,
  ChevronRight,
  Play,
  CheckCircle2,
  FileSpreadsheet,
  MessageSquare,
  Clock,
  Cpu,
  LayoutDashboard,
  Video,
  Film,
  Send,
  MessageCircle,
  PhoneCall,
  Check
} from 'lucide-react';
import useAuth from '../hooks/useAuth';

const workflowSteps = [
  {
    step: '01',
    title: 'Chọn Fanpage đích',
    desc: 'Chọn 1 hoặc kết nối đồng thời nhiều Fanpage để xuất bản nội dung đồng bộ.',
    image: '/step-1-multichannel.jpg',
    tag: 'ĐA KÊNH'
  },
  {
    step: '02',
    title: 'Sáng tạo bài viết',
    desc: 'Tự viết, dùng AI Studio sinh caption tự động hoặc tải hàng trăm bài từ file Excel.',
    image: '/step-2-ai.jpg',
    tag: 'AI STUDIO'
  },
  {
    step: '03',
    title: 'Media & Seeding',
    desc: 'Đính kèm ảnh, video và thiết lập sẵn bình luận seeding mồi tương tác tự động.',
    image: '/step-3-seeding.jpg',
    tag: 'SEEDING'
  },
  {
    step: '04',
    title: 'Hẹn giờ & Xuất bản',
    desc: 'Đăng ngay hoặc lên lịch theo phút. Hệ thống BullMQ xếp hàng xử lý ngầm bền bỉ.',
    image: '/step-4-scheduler.jpg',
    tag: 'TỰ ĐỘNG 24/7'
  }
];

const contacts = [
  {
    type: 'fb',
    name: 'Facebook',
    handle: 'Nguyễn Việt Quang',
    action: 'Liên hệ trực tiếp',
    url: 'https://web.facebook.com/nguyen.viet.quang.751589',
    image: '/contact-fb.jpg'
  },
  {
    type: 'tiktok',
    name: 'TikTok',
    handle: '@nvtq.27',
    action: 'Xem Video Review',
    url: 'https://www.tiktok.com/@nvtq.27',
    image: '/contact-tiktok.jpg'
  },
  {
    type: 'tele',
    name: 'Telegram',
    handle: '@emquang_toolface',
    action: 'Tham gia kênh hỗ trợ',
    url: 'https://t.me',
    image: '/contact-tele.jpg'
  },
  {
    type: 'zalo',
    name: 'Zalo Hotline',
    handle: 'Hỗ trợ kỹ thuật 24/7',
    action: 'Chat Zalo Official',
    url: 'https://zalo.me/0336672005',
    image: '/contact-zalo.jpg'
  }
];

const stats = [
  { value: '100+', label: 'Fanpage', suffix: 'kết nối an toàn' },
  { value: '2.4K+', label: 'Bài/tuần', suffix: 'đăng tự động' },
  { value: '100%', label: 'Lưu trữ AI', suffix: 'nhiều phiên chat' },
  { value: '24/7', label: 'Bền bỉ', suffix: 'BullMQ Queue' }
];

const marqueeText = '⟡ ĐĂNG BÀI FANPAGE TỰ ĐỘNG ⟡ LÊN LỊCH THÔNG MINH ⟡ AI STUDIO LPU ⟡ ĐĂNG HÀNG LOẠT QUA EXCEL ⟡ SEEDING BÌNH LUẬN TỰ ĐỘNG ⟡ ĐỒNG BỘ ĐA FANPAGE ⟡ REDIS 24/7 ⟡';

export default function LandingPage() {
  const { user } = useAuth();

  return (
    <div className="landing">
      {/* ── Header: Logo + Account / CTA (Đã gỡ bỏ menu links thừa) ── */}
      <header className="l-header">
        <div className="l-brand">
          <div className="l-brand-logo-container">
            <div className="l-brand-logo-inner">
              <Image src="/brand-logo.png" alt="Logo" width={54} height={54} priority style={{ objectFit: 'cover' }} />
            </div>
          </div>
          <div>
            <div className="l-brand-name">Em Quang Tool Face</div>
            <div className="l-brand-tag">Auto Post Fanpage</div>
          </div>
        </div>

        <nav className="l-nav">
          {user ? (
            <div className="l-user-nav-group">
              <Link href="/dashboard" prefetch={true} className="l-user-badge-chip" title="Trang làm việc cá nhân">
                {user.avatar ? (
                  <img
                    src={user.avatar}
                    alt={user.name}
                    className="l-user-avatar-img"
                    referrerPolicy="no-referrer"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                ) : (
                  <span className="l-user-avatar-text">{user.name?.charAt(0)?.toUpperCase() || 'U'}</span>
                )}
                <div className="l-user-info-text">
                  <span className="l-user-name">{user.name}</span>
                  <span className="l-user-status">● Đang đăng nhập</span>
                </div>
              </Link>
              <Link href="/dashboard" prefetch={true} className="l-cta l-cta-dashboard">
                <LayoutDashboard size={16} /> Vào Workspace
              </Link>
            </div>
          ) : (
            <Link href="/login" prefetch={true} className="l-cta">
              <Globe2 size={16} /> Đăng nhập Facebook
            </Link>
          )}
        </nav>
      </header>

      {/* ── Marquee LED ── */}
      <div className="marquee-strip">
        <div className="marquee-track">
          <span className="marquee-text">{marqueeText}{marqueeText}</span>
        </div>
      </div>

      {/* ── Hero ── */}
      <section className="hero">
        <div>
          <div className="hero-badge">
            <Sparkles size={14} /> Nền tảng tự động hoá Fanpage toàn diện
          </div>
          <h1>
            Quản lý Fanpage<br />
            <span className="hero-gradient">thông minh với AI 3D.</span>
          </h1>
          <p className="hero-desc">
            Sáng tạo nội dung với AI Studio, tải hàng loạt bài viết từ Excel, hẹn giờ chính xác từng phút, seeding comment tự động và quản lý đa Fanpage từ một nơi duy nhất.
          </p>

          {user ? (
            <div className="hero-actions">
              <Link href="/dashboard" prefetch={true} className="hero-primary">
                Vào Workspace làm việc <ArrowRight size={18} />
              </Link>
              <Link href="/ai-studio" prefetch={true} className="hero-secondary">
                <Sparkles size={16} /> Mở AI Studio
              </Link>
            </div>
          ) : (
            <div className="hero-actions">
              <Link href="/login" prefetch={true} className="hero-primary">
                Bắt đầu miễn phí <ArrowRight size={18} />
              </Link>
              <Link href="/login" prefetch={true} className="hero-secondary">
                <Play size={16} /> Trải nghiệm ngay
              </Link>
            </div>
          )}

          <div className="trust-bar">
            <div className="trust-item"><span className="trust-dot" /> Miễn phí sử dụng</div>
            <div className="trust-item"><span className="trust-dot" /> Token AES-256 an toàn</div>
            <div className="trust-item"><span className="trust-dot" /> AI chip LPU siêu tốc</div>
          </div>
        </div>

        <div className="hero-visual">
          <div className="hero-float hero-float-1">
            <span className="float-dot green" />
            <span>AI Studio đã sẵn sàng</span>
          </div>
          <div className="hero-float hero-float-2">
            <span className="float-dot blue" />
            <span>Hàng đợi BullMQ 24/7</span>
          </div>

          <div className="rgb-card-border">
            <div className="hero-card-3d" style={{ padding: '16px' }}>
              {/* Window Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', padding: '0 6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444' }} />
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#f59e0b' }} />
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#10b981' }} />
                  <span style={{ fontSize: '11px', color: '#94a3b8', marginLeft: '6px', fontWeight: 600 }}>
                    Facebook Automation Hub • Meta Graph API
                  </span>
                </div>
                <span style={{ fontSize: '10.5px', background: 'rgba(0, 242, 254, 0.12)', color: '#00f2fe', padding: '2px 8px', borderRadius: 99, fontWeight: 700, border: '1px solid rgba(0, 242, 254, 0.3)' }}>
                  ● LIVE
                </span>
              </div>

              {/* Showcase Image */}
              <div style={{ position: 'relative', borderRadius: '16px', overflow: 'hidden', border: '1px solid rgba(255, 255, 255, 0.12)', background: '#070a14', boxShadow: '0 20px 50px rgba(0,0,0,0.6)' }}>
                <Image
                  src="/hero-dashboard.jpg"
                  alt="Facebook Automation Hub Dashboard"
                  width={720}
                  height={540}
                  priority
                  style={{ width: '100%', height: 'auto', display: 'block', transform: 'scale(1.01)', transition: 'transform 0.4s ease' }}
                />
              </div>

              {/* Quick Feature Badges below image */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 12 }}>
                <div style={{ background: 'rgba(0, 242, 254, 0.06)', border: '1px solid rgba(0, 242, 254, 0.2)', borderRadius: 10, padding: '8px 10px', textAlign: 'center' }}>
                  <div style={{ fontSize: '12px', fontWeight: 800, color: '#38bdf8' }}>⚡ Đa kênh</div>
                  <div style={{ fontSize: '10.5px', color: 'var(--muted)', marginTop: 2 }}>Đăng 50+ Page</div>
                </div>
                <div style={{ background: 'rgba(16, 185, 129, 0.06)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: 10, padding: '8px 10px', textAlign: 'center' }}>
                  <div style={{ fontSize: '12px', fontWeight: 800, color: '#34d399' }}>✨ AI Studio</div>
                  <div style={{ fontSize: '10.5px', color: 'var(--muted)', marginTop: 2 }}>Caption viral</div>
                </div>
                <div style={{ background: 'rgba(168, 85, 247, 0.06)', border: '1px solid rgba(168, 85, 247, 0.2)', borderRadius: 10, padding: '8px 10px', textAlign: 'center' }}>
                  <div style={{ fontSize: '12px', fontWeight: 800, color: '#c084fc' }}>🕒 BullMQ</div>
                  <div style={{ fontSize: '10.5px', color: 'var(--muted)', marginTop: 2 }}>Hẹn giờ chuẩn</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats ── */}
      <section className="stats-strip">
        <div className="stats-grid">
          {stats.map(({ value, label, suffix }) => (
            <div className="stat-card" key={label}>
              <div className="stat-value">{value}</div>
              <div className="stat-label">{label}</div>
              <div className="stat-suffix">{suffix}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── 3D QUY TRÌNH TẠO BÀI ĐĂNG (WORKFLOW MỚI) ── */}
      <section className="workflow-section">
        <div className="section-header">
          <div className="section-label"><Clock size={14} /> Quy trình chuẩn</div>
          <h2>4 Bước tạo & xuất bản bài viết tự động</h2>
          <p>Tối ưu từng thao tác, giúp bạn lên lịch hàng tuần nội dung chỉ trong vài phút.</p>
        </div>

        <div className="workflow-grid-3d">
          {workflowSteps.map((ws) => (
            <div className="workflow-card-3d" key={ws.step}>
              <div className="workflow-step-badge">BƯỚC {ws.step} • {ws.tag}</div>
              <div
                style={{
                  width: 68,
                  height: 68,
                  borderRadius: 18,
                  overflow: 'hidden',
                  marginBottom: 18,
                  border: '1.5px solid rgba(0, 242, 254, 0.25)',
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5), 0 0 16px rgba(0, 242, 254, 0.15)',
                  flexShrink: 0
                }}
              >
                <Image
                  src={ws.image}
                  alt={ws.title}
                  width={68}
                  height={68}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </div>
              <h3 className="workflow-card-title">{ws.title}</h3>
              <p className="workflow-card-desc">{ws.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── 3D BENTO SHOWCASE (CÔNG NGHỆ TỐI ƯU GỌN GÀNG) ── */}
      <section className="bento-section">
        <div className="section-header">
          <div className="section-label"><Layers3 size={14} /> Tính năng cốt lõi</div>
          <h2>Công nghệ hiện đại cho Fanpage</h2>
          <p>Thiết kế tinh gọn, trực quan và tập trung vào hiệu suất vận hành.</p>
        </div>

        <div className="bento-grid-3d">
          {/* Card 1: AI Studio */}
          <div className="bento-card-3d bento-col-8">
            <div className="bento-badge-3d bento-badge-cyan">
              <Sparkles size={13} /> Trợ lý AI Studio
            </div>
            <h3 className="bento-card-title">Viết bài siêu tốc & Lưu lịch sử hội thoại</h3>
            <p className="bento-card-desc">
              Tích hợp mô hình AI mạnh mẽ trên nền chip LPU. Sinh caption viral, kịch bản tương tác và tự động lưu trữ nhiều phiên trò chuyện để tiếp tục bất cứ lúc nào.
            </p>
            <div style={{ position: 'relative', borderRadius: '16px', overflow: 'hidden', border: '1px solid rgba(0, 242, 254, 0.25)', marginTop: '16px', background: '#070a14', boxShadow: '0 16px 40px rgba(0,0,0,0.6)' }}>
              <Image
                src="/ai-studio-showcase.jpg"
                alt="Trợ lý AI Studio viết content tự động"
                width={1200}
                height={675}
                style={{ width: '100%', height: 'auto', display: 'block' }}
              />
            </div>
          </div>

          {/* Card 2: Bảo mật Token */}
          <div className="bento-card-3d bento-col-4">
            <div className="bento-badge-3d bento-badge-purple">
              <Shield size={13} /> Bảo mật Token
            </div>
            <h3 className="bento-card-title">Mã hoá AES-256-GCM</h3>
            <p className="bento-card-desc">
              Toàn bộ User Access Token và Page Token được mã hoá cấp cao, tự động đồng bộ và bảo vệ an toàn cho Fanpage.
            </p>
            <div style={{ padding: '24px 16px', borderRadius: 16, background: 'rgba(168, 85, 247, 0.05)', border: '1px solid rgba(168, 85, 247, 0.2)', textAlign: 'center', marginTop: 24 }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>🔒</div>
              <div style={{ fontWeight: 800, color: '#fff', fontSize: 14.5 }}>Chuẩn mã hoá quân sự</div>
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Bảo mật dữ liệu tuyệt đối</div>
            </div>
          </div>

          {/* Card 3: Seeding Comment */}
          <div className="bento-card-3d bento-col-4">
            <div className="bento-badge-3d bento-badge-green">
              <MessageSquare size={13} /> Seeding tự động
            </div>
            <h3 className="bento-card-title">Đẩy bình luận mồi tức thì</h3>
            <p className="bento-card-desc">
              Tự động ghim bình luận mồi ngay khi bài vừa xuất bản để kích thích người đọc tương tác và tăng tương tác tự nhiên.
            </p>
            <div style={{ padding: '24px 16px', borderRadius: 16, background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.2)', textAlign: 'center', marginTop: 24 }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>💬</div>
              <div style={{ fontWeight: 800, color: '#fff', fontSize: 14.5 }}>5 Tầng Comment</div>
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Hẹn giờ độ trễ từng phút</div>
            </div>
          </div>

          {/* Card 4: Tải Excel hàng loạt */}
          <div className="bento-card-3d bento-col-8">
            <div className="bento-badge-3d bento-badge-amber">
              <FileSpreadsheet size={13} /> Bulk Upload Excel
            </div>
            <h3 className="bento-card-title">Lên lịch hàng trăm bài từ file Excel</h3>
            <p className="bento-card-desc">
              Kéo thả file Excel (.xlsx), hệ thống tự động bóc tách tiêu đề, nội dung, ảnh/video, thời gian hẹn giờ và phân bổ tới từng Fanpage chỉ trong vài giây.
            </p>
            <div style={{ position: 'relative', borderRadius: '16px', overflow: 'hidden', border: '1px solid rgba(245, 158, 11, 0.25)', marginTop: '16px', background: '#070a14', boxShadow: '0 16px 40px rgba(0,0,0,0.6)' }}>
              <Image
                src="/excel-bulk-showcase.jpg"
                alt="Tải file Excel lên lịch tự động"
                width={1200}
                height={675}
                style={{ width: '100%', height: 'auto', display: 'block' }}
              />
            </div>
          </div>

          {/* Card 5: Đa định dạng Reels, Story, Album */}
          <div className="bento-card-3d bento-col-12" style={{ gridColumn: 'span 12' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
              <div>
                <div className="bento-badge-3d bento-badge-cyan" style={{ background: 'rgba(236, 72, 153, 0.12)', color: '#f43f5e', border: '1px solid rgba(236, 72, 153, 0.3)' }}>
                  <Film size={13} /> Đa định dạng xuất bản
                </div>
                <h3 className="bento-card-title" style={{ fontSize: 24, marginTop: 6 }}>
                  Xuất bản toàn diện: Facebook Reels 9:16, Story 24h & Album đa ảnh
                </h3>
                <p className="bento-card-desc" style={{ maxWidth: 760, marginBottom: 0 }}>
                  Bắt trọn xu hướng video ngắn Reels với tỷ lệ dọc 9:16, tin Story biến mất sau 24h và bài viết dạng Album ghép ảnh thông minh tự động tối ưu tỉ lệ hiển thị trên bảng tin.
                </p>
              </div>
              <Link href="/post-planner/compose" prefetch={true} className="button button-primary rgb-led-chip" style={{ padding: '12px 24px', fontSize: 13.5, fontWeight: 700 }}>
                Tạo bài ngay <ArrowRight size={15} />
              </Link>
            </div>
            <div style={{ position: 'relative', borderRadius: '18px', overflow: 'hidden', border: '1px solid rgba(255, 255, 255, 0.12)', marginTop: '24px', background: '#070a14', boxShadow: '0 20px 50px rgba(0,0,0,0.7)' }}>
              <Image
                src="/multiformat-showcase.jpg"
                alt="Xuất bản Facebook Reels, Story và Album ảnh"
                width={1200}
                height={675}
                style={{ width: '100%', height: 'auto', display: 'block' }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── 3D CONTACT SECTION (FB, TIKTOK, TELE, ZALO) ── */}
      <section className="contact-section">
        <div className="section-header">
          <div className="section-label"><Globe2 size={14} /> Kết nối & Hỗ trợ</div>
          <h2>Kênh liên hệ chính thức</h2>
          <p>Cần hỗ trợ kỹ thuật, hướng dẫn sử dụng hoặc đóng góp ý kiến? Hãy kết nối với chúng tôi qua các kênh dưới đây.</p>
        </div>

        <div className="contact-grid-3d">
          {contacts.map((c) => (
            <a
              href={c.url}
              target="_blank"
              rel="noreferrer"
              key={c.type}
              className={`contact-card-3d contact-card-${c.type}`}
            >
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 16,
                  overflow: 'hidden',
                  marginBottom: 16,
                  border: '1.5px solid rgba(255, 255, 255, 0.15)',
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
                  flexShrink: 0
                }}
              >
                <Image
                  src={c.image}
                  alt={c.name}
                  width={64}
                  height={64}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </div>
              <h3 className="contact-title">{c.name}</h3>
              <div className="contact-handle">{c.handle}</div>
              <span className="contact-btn-pill">{c.action} →</span>
            </a>
          ))}
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="l-footer">
        © 2026 Em Quang Tool Face — Auto Post Fanpage. Built with
        <span className="l-footer-heart"> ❤ </span>
      </footer>
    </div>
  );
}