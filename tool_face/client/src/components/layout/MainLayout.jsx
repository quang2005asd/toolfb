import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/router';
import useAuth from '../../hooks/useAuth';
import { useTheme } from '../../context/ThemeContext';
import {
  BarChart3,
  Bell,
  CalendarDays,
  ChevronDown,
  CircleHelp,
  FileSpreadsheet,
  Home,
  LayoutDashboard,
  List,
  Moon,
  PenLine,
  Settings,
  Sparkles,
  Sun,
  UsersRound
} from 'lucide-react';

const navigation = [
  { label: 'Bảng tin', href: '/dashboard', icon: LayoutDashboard },
  { label: 'AI Studio', href: '/ai-studio', icon: Sparkles },
  { label: 'Viết bài', href: '/post-planner/compose', icon: PenLine },
  { label: 'Lịch đăng', href: '/post-planner/calendar', icon: CalendarDays },
  { label: 'Bài đăng', href: '/post-planner/list', icon: List },
  { label: 'Báo cáo', href: '/post-planner/dashboard', icon: BarChart3 },
  { label: 'Kênh', href: '/channels', icon: UsersRound }
];

export default function MainLayout({ children, title = 'Không gian làm việc', actions }) {
  const router = useRouter();
  const { user, loading, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  if (loading) {
    return (
      <div className="workspace">
        <aside className="sidebar" aria-label="Điều hướng chính">
          <Link href="/" className="brand-mark" aria-label="Về bảng tin">
            <Image src="/brand-logo.png" alt="Logo" width={43} height={43} priority />
          </Link>
          <nav className="sidebar-nav">
            {navigation.map(({ label, icon: Icon }) => (
              <div className="nav-item" key={label} style={{ opacity: 0.65 }}>
                <Icon size={20} strokeWidth={1.8} aria-hidden="true" />
                <span>{label}</span>
              </div>
            ))}
          </nav>
        </aside>
        <div className="workspace-main">
          <header className="topbar">
            <div className="topbar-spacer" />
            <div className="skeleton-shimmer skeleton-pill" style={{ width: 140, height: 36, marginRight: 10 }} />
          </header>
          <main className="page-area">
            <div className="skeleton-shimmer skeleton-box" style={{ height: 140, borderRadius: 24, marginBottom: 22 }} />
            <div className="metric-grid" style={{ marginBottom: 22 }}>
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="skeleton-shimmer skeleton-box" style={{ height: 116, borderRadius: 20 }} />
              ))}
            </div>
            <div className="home-columns">
              <div className="skeleton-shimmer skeleton-box" style={{ height: 280, borderRadius: 18 }} />
              <div className="skeleton-shimmer skeleton-box" style={{ height: 280, borderRadius: 18 }} />
            </div>
          </main>
        </div>
      </div>
    );
  }
  if (!user) return null;

  return (
    <div className="workspace">
      <aside className="sidebar" aria-label="Điều hướng chính">
        <Link href="/" className="brand-mark" aria-label="Về bảng tin">
          <Image src="/brand-logo.png" alt="Logo" width={43} height={43} priority />
        </Link>
        <nav className="sidebar-nav">
          {navigation.map(({ label, href, icon: Icon }) => {
            const active = href === '/'
              ? router.pathname === '/'
              : router.pathname === href || router.pathname.startsWith(`${href}/`);
            return (
              <Link className={`nav-item${active ? ' is-active' : ''}`} href={href} key={label} title={label} prefetch={true}>
                <Icon size={20} strokeWidth={1.8} aria-hidden="true" />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <Link
            className={`nav-item${router.pathname === '/' ? ' is-active' : ''}`}
            href="/"
            title="Quay lại Trang chủ"
            prefetch={true}
          >
            <Home size={19} strokeWidth={1.8} aria-hidden="true" /><span>Trang chủ</span>
          </Link>
          <Link className="nav-item" href="/post-planner/bulk-upload" title="Tải Excel" prefetch={true}>
            <FileSpreadsheet size={19} strokeWidth={1.8} aria-hidden="true" /><span>Tải Excel</span>
          </Link>
          <Link
            className={`nav-item${router.pathname === '/settings' ? ' is-active' : ''}`}
            href="/settings"
            title="Cài đặt"
            prefetch={true}
          >
            <Settings size={19} strokeWidth={1.8} aria-hidden="true" /><span>Cài đặt</span>
          </Link>
          <button className="profile-avatar" type="button" aria-label={`Tài khoản ${user.name}`} title={user.name}>
            {user.avatar ? (
              <img
                src={user.avatar}
                alt={user.name}
                referrerPolicy="no-referrer"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
                style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover', display: 'block' }}
              />
            ) : (
              user.name?.charAt(0)?.toUpperCase() || 'U'
            )}
          </button>
        </div>
      </aside>

      <div className="workspace-main">
        <header className="topbar">
          <div className="topbar-spacer" />
          <button
            className="theme-toggle-btn"
            type="button"
            onClick={toggleTheme}
            title={theme === 'light' ? 'Chuyển sang Dark Mode Huyền Bí' : 'Chuyển sang Tone Trắng Sang Trọng'}
            aria-label="Đổi giao diện Sáng / Tối"
          >
            {theme === 'light' ? <Moon size={17} style={{ color: '#475569' }} /> : <Sun size={17} style={{ color: '#fbbf24' }} />}
            <span className="theme-toggle-text">{theme === 'light' ? 'Giao diện Tối' : 'Tone Trắng'}</span>
          </button>
          <button className="icon-button" type="button" aria-label="Trợ giúp"><CircleHelp size={19} /></button>
          <button className="icon-button" type="button" aria-label="Thông báo"><Bell size={19} /></button>
          <button className="account-chip" type="button" onClick={logout} title={`Facebook ID: ${user.id} · Đăng xuất`}>
            {user.avatar ? (
              <img
                src={user.avatar}
                alt={user.name}
                className="account-dot"
                referrerPolicy="no-referrer"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
                style={{ objectFit: 'cover', display: 'block' }}
              />
            ) : (
              <span className="account-dot">{user.name?.charAt(0)?.toUpperCase() || 'F'}</span>
            )}
            <span>{user.name}<small className="account-role">{user.role === 'admin' ? 'Admin' : 'Thành viên'} · Đăng xuất</small></span>
            <ChevronDown size={15} />
          </button>
        </header>
        <main className="page-area">
          <div className="page-topline">
            <div>
              <span className="eyebrow">AUTO POST FANPAGE</span>
              <h1>{title}</h1>
            </div>
            {actions && <div className="page-actions">{actions}</div>}
          </div>
          <div className="page-content-flow" key={router.asPath}>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}