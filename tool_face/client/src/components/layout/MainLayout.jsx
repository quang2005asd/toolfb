import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/router';
import useAuth from '../../hooks/useAuth';
import { useTheme } from '../../context/ThemeContext';
import RoleBadge from '../RoleBadge';
import { PERMISSIONS, hasPermission } from '../../utils/permissions';
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
  LogOut,
  Moon,
  PenLine,
  Settings,
  ShieldAlert,
  Sparkles,
  Sun,
  UserCog,
  UserRound,
  UsersRound
} from 'lucide-react';

// `permission`: chỉ hiển thị mục menu khi tài khoản có quyền tương ứng
const navigation = [
  { label: 'Bảng tin', href: '/dashboard', icon: LayoutDashboard },
  { label: 'AI Studio', href: '/ai-studio', icon: Sparkles },
  { label: 'Viết bài', href: '/post-planner/compose', icon: PenLine },
  { label: 'Lịch đăng', href: '/post-planner/calendar', icon: CalendarDays },
  { label: 'Bài đăng', href: '/post-planner/list', icon: List },
  { label: 'Báo cáo', href: '/post-planner/dashboard', icon: BarChart3 },
  { label: 'Kênh', href: '/channels', icon: UsersRound },
  { label: 'Thành viên', href: '/users', icon: UserCog, permission: PERMISSIONS.USERS_MANAGE }
];

function AccountMenu({ user, onLogout }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const handleClick = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) setOpen(false);
    };
    const handleKey = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  return (
    <div className="account-menu" ref={menuRef}>
      <button
        className="account-chip"
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`${user.name} · ${user.roleLabel || ''}`}
      >
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
          <span className="account-dot">{user.name?.charAt(0)?.toUpperCase() || 'U'}</span>
        )}
        <span>{user.name}<small className="account-role">{user.roleLabel} · @{user.username}</small></span>
        <ChevronDown size={15} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
      </button>

      {open && (
        <div className="account-dropdown" role="menu">
          <div className="account-dropdown-head">
            <strong>{user.name}</strong>
            <span>@{user.username}{user.email ? ` · ${user.email}` : ''}</span>
            <RoleBadge role={user.role} label={user.roleLabel} size="sm" />
          </div>
          <Link href="/settings" className="account-dropdown-item" role="menuitem" onClick={() => setOpen(false)}>
            <UserRound size={15} /> Hồ sơ & bảo mật
          </Link>
          {hasPermission(user, PERMISSIONS.USERS_MANAGE) && (
            <Link href="/users" className="account-dropdown-item" role="menuitem" onClick={() => setOpen(false)}>
              <UserCog size={15} /> Quản lý thành viên
            </Link>
          )}
          <button type="button" className="account-dropdown-item is-danger" role="menuitem" onClick={onLogout}>
            <LogOut size={15} /> Đăng xuất
          </button>
        </div>
      )}
    </div>
  );
}

export default function MainLayout({ children, title = 'Không gian làm việc', actions, requiredPermission }) {
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
            {navigation.filter((item) => !item.permission).map(({ label, icon: Icon }) => (
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

  const visibleNavigation = navigation.filter((item) => !item.permission || hasPermission(user, item.permission));
  const allowed = !requiredPermission || hasPermission(user, requiredPermission);

  return (
    <div className="workspace">
      <aside className="sidebar" aria-label="Điều hướng chính">
        <Link href="/" className="brand-mark" aria-label="Về bảng tin">
          <Image src="/brand-logo.png" alt="Logo" width={43} height={43} priority />
        </Link>
        <nav className="sidebar-nav">
          {visibleNavigation.map(({ label, href, icon: Icon }) => {
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
          <Link href="/settings" className={`profile-avatar profile-role-${user.role}`} aria-label={`Tài khoản ${user.name}`} title={`${user.name} · ${user.roleLabel}`}>
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
          </Link>
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
          <AccountMenu user={user} onLogout={logout} />
        </header>
        <main className="page-area">
          <div className="page-topline">
            <div>
              <span className="eyebrow">AUTO POST FANPAGE</span>
              <h1>{title}</h1>
            </div>
            {allowed && actions && <div className="page-actions">{actions}</div>}
          </div>
          <div className="page-content-flow" key={router.asPath}>
            {allowed ? children : (
              <section className="panel access-denied">
                <ShieldAlert size={36} aria-hidden="true" />
                <h2>Bạn không có quyền truy cập trang này</h2>
                <p className="muted">
                  Tài khoản <strong>@{user.username}</strong> đang ở vai trò <RoleBadge role={user.role} label={user.roleLabel} size="sm" />.
                  Liên hệ Quản lý hoặc Quản trị viên nếu bạn cần thêm quyền.
                </p>
                <Link href="/dashboard" className="button button-primary">Về Bảng tin</Link>
              </section>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
