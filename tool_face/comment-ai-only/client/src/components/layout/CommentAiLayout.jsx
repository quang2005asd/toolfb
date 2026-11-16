import Link from 'next/link';
import { useRouter } from 'next/router';
import { Bot, Globe2, LogOut } from 'lucide-react';
import useAuth from '../../hooks/useAuth';

const navigation = [
  { href: '/comment-ai', label: 'Cấu hình AI' },
  { href: '/comment-ai/templates', label: 'Mẫu trả lời' },
  { href: '/comment-ai/customers', label: 'Khách hàng' },
  { href: '/comment-ai/leads', label: 'Bài từ nhóm' },
  { href: '/comment-ai/activity', label: 'Hoạt động' },
  { href: '/comment-ai/diagnostics', label: 'Chẩn đoán' }
];

export default function CommentAiLayout({ children, title, actions }) {
  const router = useRouter();
  const { user, loading, logout } = useAuth();

  if (loading || !user) {
    return <main className="page-area"><section className="panel" style={{ padding: 24 }}>Đang kiểm tra phiên đăng nhập...</section></main>;
  }

  return (
    <div className="workspace">
      <aside className="sidebar" aria-label="Điều hướng AI bình luận">
        <Link href="/comment-ai" className="brand-mark" aria-label="AI bình luận"><Bot size={24} /></Link>
        <nav className="sidebar-nav">
          {navigation.map((item) => {
            const active = router.pathname === item.href;
            return <Link key={item.href} href={item.href} className={`nav-item${active ? ' is-active' : ''}`}>{item.label}</Link>;
          })}
          <Link href="/channels" className={`nav-item${router.pathname === '/channels' ? ' is-active' : ''}`}><Globe2 size={18} /> Kết nối Facebook</Link>
        </nav>
      </aside>
      <div className="workspace-main">
        <header className="topbar">
          <div><strong>{title}</strong></div>
          <div className="topbar-actions">
            {actions}
            <span className="muted">{user.name || user.username}</span>
            <button type="button" className="button button-quiet" onClick={logout}><LogOut size={15} /> Đăng xuất</button>
          </div>
        </header>
        <main className="page-area">{children}</main>
      </div>
    </div>
  );
}
