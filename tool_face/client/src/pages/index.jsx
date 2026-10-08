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
  Cpu,
  ChevronRight,
  Send,
  MessageCircle,
  PhoneCall,
  Flame,
  CheckCheck
} from 'lucide-react';
import useAuth from '../hooks/useAuth';

const workflowSteps = [
  {
    step: '01',
    title: 'Kết nối Fanpage & Nick Facebook',
    desc: 'Liên kết không giới hạn Fanpage qua Token dài hạn hoặc đồng bộ tự động. Quản lý và phân nhóm kênh chuyên nghiệp.',
    tag: 'ĐA KÊNH'
  },
  {
    step: '02',
    title: 'Sáng tạo nội dung với AI LPU',
    desc: 'Trợ lý AI tự động viết caption viral, tạo hashtag chuẩn SEO, điều chỉnh giọng văn và vẽ ảnh bản quyền bằng AI.',
    tag: 'AI STUDIO'
  },
  {
    step: '03',
    title: 'Đính kèm Media & Seeding mồi',
    desc: 'Hỗ trợ trọn vẹn Facebook Reels 9:16, Story 24h, Album ảnh và cài đặt sẵn bình luận mồi tự động đẩy tương tác.',
    tag: 'TỰ ĐỘNG HOÁ'
  },
  {
    step: '04',
    title: 'Lên lịch & Xuất bản 24/7',
    desc: 'Hẹn giờ chính xác từng phút. Hàng đợi BullMQ và Redis ngầm xuất bản đều đặn ngay cả khi tắt máy tính.',
    tag: 'BULLMQ 24/7'
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
    icon: Globe2
  },
  {
    type: 'tiktok',
    name: 'Kênh TikTok Official',
    handle: '@nvtq.27',
    action: 'Xem Video Hướng Dẫn',
    url: 'https://www.tiktok.com/@nvtq.27',
    color: '#000000',
    icon: Film
  },
  {
    type: 'tele',
    name: 'Cộng Đồng Telegram',
    handle: '@emquang_toolface',
    action: 'Vào Nhóm Hỗ Trợ',
    url: 'https://t.me',
    color: '#229ed9',
    icon: Send
  },
  {
    type: 'zalo',
    name: 'Hotline / Zalo Hỗ Trợ',
    handle: '0336.672.005 (24/7)',
    action: 'Chat Zalo Kỹ Thuật',
    url: 'https://zalo.me/0336672005',
    color: '#0068ff',
    icon: MessageCircle
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

  return (
    <div className="landing-modern">
      {/* ── HEADER NAVIGATION ── */}
      <header className="lm-header">
        <div className="lm-header-inner">
          <div className="lm-brand">
            <div className="lm-brand-mark">
              <Image src="/brand-logo.png" alt="Logo" width={42} height={42} priority style={{ borderRadius: 10, objectFit: 'cover' }} />
            </div>
            <div>
              <div className="lm-brand-title">Em Quang Tool Face</div>
              <div className="lm-brand-subtitle">Facebook Automation Suite</div>
            </div>
          </div>

          <nav className="lm-nav">
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
          </nav>
        </div>
      </header>

      {/* ── NOTICE TICKER (TINH TẾ & THANH LỊCH) ── */}
      <div className="lm-ticker">
        <div className="lm-ticker-inner">
          <span className="lm-ticker-badge">MỚI NHẤT</span>
          <span className="lm-ticker-text">
            Hỗ trợ toàn diện Facebook Graph API v22.0 · Đăng Reels 9:16 · Story 24h · Album ảnh · AI LPU Studio thế hệ mới
          </span>
        </div>
      </div>

      {/* ── HERO SECTION ── */}
      <section className="lm-hero">
        <div className="lm-hero-content">
          <div className="lm-badge">
            <Sparkles size={14} className="lm-badge-icon" />
            <span>Hệ sinh thái Quản lý & Lên lịch Fanpage Tự Động 2026</span>
          </div>

          <h1 className="lm-hero-title">
            Tự động hoá Fanpage<br />
            <span className="lm-hero-gradient">Đơn giản. Sang trọng. Bền bỉ.</span>
          </h1>

          <p className="lm-hero-desc">
            Nền tảng toàn diện giúp bạn quản lý hàng chục Fanpage, sáng tạo nội dung tự động bằng AI,
            lên lịch đăng bài hàng trăm bài từ file Excel và tự động đẩy tương tác bằng bình luận mồi 24/7.
          </p>

          <div className="lm-hero-actions">
            {user ? (
              <>
                <Link href="/dashboard" className="lm-btn lm-btn-lg lm-btn-primary">
                  Vào Workspace làm việc <ArrowRight size={17} />
                </Link>
                <Link href="/post-planner/compose" className="lm-btn lm-btn-lg lm-btn-secondary">
                  <Zap size={16} /> Soạn bài viết mới
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

        {/* ── LIVE INTERACTIVE MOCKUP SHOWCASE (THAY THẾ ẢNH ĐEN CŨ) ── */}
        <div className="lm-hero-preview">
          <div className="lm-preview-window">
            <div className="lm-preview-topbar">
              <div className="lm-window-dots">
                <span className="dot red" />
                <span className="dot yellow" />
                <span className="dot green" />
              </div>
              <div className="lm-window-title">
                <Globe2 size={13} /> app.toolface.local / workspace / overview
              </div>
              <div className="lm-window-status">
                <span className="lm-pulse-dot" /> Sẵn sàng
              </div>
            </div>

            {/* Inner Dashboard Simulation */}
            <div className="lm-preview-body">
              {/* Top stats in preview */}
              <div className="lm-pv-stats-row">
                <div className="lm-pv-stat-card">
                  <span className="lm-pv-stat-label">Fanpage Kết Nối</span>
                  <strong className="lm-pv-stat-num">12 Trang</strong>
                  <span className="lm-pv-stat-sub text-green">100% Token Sống</span>
                </div>
                <div className="lm-pv-stat-card">
                  <span className="lm-pv-stat-label">Hàng Đợi Xuất Bản</span>
                  <strong className="lm-pv-stat-num">48 Bài</strong>
                  <span className="lm-pv-stat-sub text-blue">Hẹn giờ chính xác</span>
                </div>
                <div className="lm-pv-stat-card">
                  <span className="lm-pv-stat-label">Trợ Lý AI Studio</span>
                  <strong className="lm-pv-stat-num">Hoạt động</strong>
                  <span className="lm-pv-stat-sub text-purple">Chip LPU siêu tốc</span>
                </div>
              </div>

              {/* Sample Post Item */}
              <div className="lm-pv-post-item">
                <div className="lm-pv-post-head">
                  <div className="lm-pv-avatar">f</div>
                  <div>
                    <div className="lm-pv-name">Thời Trang Cao Cấp Hà Nội <span className="lm-pv-badge">Đã lên lịch</span></div>
                    <div className="lm-pv-time"><Clock size={11} /> Xuất bản lúc 19:30 hôm nay · Facebook Reels</div>
                  </div>
                </div>
                <div className="lm-pv-content">
                  🔥 BST Thu Đông 2026 chính thức ra mắt! Trải nghiệm phong cách tinh giản, sang trọng vượt thời gian với chất liệu dạ lông cừu nguyên bản... #Fashion2026 #LuxuryStyle
                </div>
                <div className="lm-pv-tags">
                  <span className="lm-pv-tag">🎬 Video Reels 9:16</span>
                  <span className="lm-pv-tag">💬 3 Comment Mồi</span>
                  <span className="lm-pv-tag">⚡ AI Caption</span>
                </div>
              </div>

              {/* Interactive Module Links */}
              <div className="lm-pv-quick-grid">
                <Link href="/post-planner/compose" className="lm-pv-tile">
                  <Sparkles size={16} className="text-blue" />
                  <span>Viết bài AI</span>
                </Link>
                <Link href="/post-planner/bulk-upload" className="lm-pv-tile">
                  <FileSpreadsheet size={16} className="text-amber" />
                  <span>Tải Excel</span>
                </Link>
                <Link href="/post-planner/calendar" className="lm-pv-tile">
                  <Calendar size={16} className="text-emerald" />
                  <span>Lịch tháng</span>
                </Link>
                <Link href="/channels" className="lm-pv-tile">
                  <Users size={16} className="text-purple" />
                  <span>Quản lý Kênh</span>
                </Link>
              </div>
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

      {/* ── CORE PILLARS & FEATURES (TINH GỌN & THỰC DỤNG) ── */}
      <section className="lm-features-section">
        <div className="lm-section-head">
          <span className="lm-section-pill"><Layers size={13} /> Module Tính Năng</span>
          <h2 className="lm-section-title">Giải pháp toàn diện cho mọi Fanpage</h2>
          <p className="lm-section-desc">
            Không còn thao tác thủ công rườm rà. Tất cả công cụ bạn cần đều được tích hợp trong một bảng điều khiển duy nhất.
          </p>
        </div>

        <div className="lm-features-grid">
          {/* Feature 1: AI Content Studio */}
          <div className="lm-feature-card">
            <div className="lm-feature-icon icon-blue">
              <Sparkles size={22} />
            </div>
            <h3 className="lm-feature-title">Trợ lý AI Studio Đột Phá</h3>
            <p className="lm-feature-text">
              Tích hợp các mô hình ngôn ngữ lớn mạnh mẽ nhất (OpenAI, Gemini, DeepSeek). Tự động sinh nội dung viral, hashtag xu hướng, tối ưu giọng văn theo thương hiệu và lưu trữ lịch sử hội thoại dài hạn.
            </p>
            <ul className="lm-feature-bullets">
              <li><Check size={14} /> Tự động tạo caption theo ngành hàng</li>
              <li><Check size={14} /> Chuyển đổi giọng văn: Hài hước, chuyên gia, bán hàng</li>
              <li><Check size={14} /> Tích hợp DALL-E & Flux vẽ ảnh minh hoạ kèm watermark</li>
            </ul>
            <Link href="/ai-studio" className="lm-card-link">Khám phá AI Studio →</Link>
          </div>

          {/* Feature 2: Bulk Upload Excel */}
          <div className="lm-feature-card">
            <div className="lm-feature-icon icon-amber">
              <FileSpreadsheet size={22} />
            </div>
            <h3 className="lm-feature-title">Lên lịch hàng loạt qua Excel</h3>
            <p className="lm-feature-text">
              Chỉ cần 1 file Excel (.xlsx), bạn có thể lên lịch hàng trăm bài viết cho cả tháng chỉ trong 30 giây. Hệ thống tự động bóc tách tiêu đề, nội dung, đường dẫn media, thời gian và Fanpage chỉ định.
            </p>
            <ul className="lm-feature-bullets">
              <li><Check size={14} /> Hỗ trợ file mẫu chuẩn, tải về và dùng ngay</li>
              <li><Check size={14} /> Tự động dàn đều khung giờ vàng đăng bài</li>
              <li><Check size={14} /> Báo cáo chi tiết từng dòng dữ liệu hợp lệ / lỗi</li>
            </ul>
            <Link href="/post-planner/bulk-upload" className="lm-card-link">Thử nghiệm Tải Excel →</Link>
          </div>

          {/* Feature 3: Seeding Comment */}
          <div className="lm-feature-card">
            <div className="lm-feature-icon icon-emerald">
              <MessageSquare size={22} />
            </div>
            <h3 className="lm-feature-title">Bình luận Seeding Tự Động</h3>
            <p className="lm-feature-text">
              Tự động ghim bình luận mồi ngay sau khi bài vừa xuất bản. Kích thích tương tác tự nhiên của người đọc, đặt link mua hàng dưới bình luận để bài viết không bị bóp tương tác.
            </p>
            <ul className="lm-feature-bullets">
              <li><Check size={14} /> Hỗ trợ cài đặt lên tới 5 tầng bình luận mồi</li>
              <li><Check size={14} /> Độ trễ hẹn giờ linh hoạt từ 0 đến 60 phút</li>
              <li><Check size={14} /> Giữ bài viết sạch sẽ, tăng tỉ lệ chuyển đổi</li>
            </ul>
            <Link href="/post-planner/compose" className="lm-card-link">Cấu hình Seeding →</Link>
          </div>

          {/* Feature 4: Đa định dạng Reels, Story, Album */}
          <div className="lm-feature-card">
            <div className="lm-feature-icon icon-purple">
              <Film size={22} />
            </div>
            <h3 className="lm-feature-title">Xuất bản Đa Định Dạng Toàn Diện</h3>
            <p className="lm-feature-text">
              Bắt trọn mọi xu hướng thuật toán Facebook: Video ngắn Reels 9:16 để tiếp cận khách hàng mới, tin Story 24h giữ chân follower thân thiết và bài viết dạng Album ảnh chuyên nghiệp.
            </p>
            <ul className="lm-feature-bullets">
              <li><Check size={14} /> Facebook Reels 9:16 tối ưu độ phân giải cao</li>
              <li><Check size={14} /> Facebook Story 24h tự động biến mất</li>
              <li><Check size={14} /> Album nhiều ảnh tự động dàn khung bắt mắt</li>
            </ul>
            <Link href="/post-planner/compose" className="lm-card-link">Trải nghiệm xuất bản →</Link>
          </div>
        </div>
      </section>

      {/* ── WORKFLOW PROCESS (QUY TRÌNH 4 BƯỚC) ── */}
      <section className="lm-workflow-section">
        <div className="lm-section-head">
          <span className="lm-section-pill"><Clock size={13} /> Quy Trình Tinh Gọn</span>
          <h2 className="lm-section-title">Vận hành chuẩn chỉ trong 4 bước</h2>
          <p className="lm-section-desc">
            Quy trình làm việc được tối ưu hóa để bạn tiết kiệm 90% thời gian quản lý Fanpage mỗi ngày.
          </p>
        </div>

        <div className="lm-workflow-grid">
          {workflowSteps.map((wf, idx) => (
            <div key={idx} className="lm-workflow-card">
              <div className="lm-wf-step-num">{wf.step}</div>
              <span className="lm-wf-tag">{wf.tag}</span>
              <h4 className="lm-wf-title">{wf.title}</h4>
              <p className="lm-wf-desc">{wf.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── OFFICIAL CONTACT CHANNELS (KÊNH HỖ TRỢ TRỰC TIẾP) ── */}
      <section className="lm-contact-section">
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
                <div className="lm-contact-icon-wrap" style={{ color: c.color }}>
                  <Icon size={24} />
                </div>
                <div className="lm-contact-name">{c.name}</div>
                <div className="lm-contact-handle">{c.handle}</div>
                <div className="lm-contact-action">{c.action} →</div>
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