import { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import {
  CalendarDays,
  CircleAlert,
  FileSpreadsheet,
  PenLine,
  Send,
  Sparkles,
  RefreshCw,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Layers,
  ExternalLink,
  ShieldCheck,
  TrendingUp,
  Image as ImageIcon,
  Video as VideoIcon,
  Film,
  FileText,
  ArrowRight,
  Flame,
  Radio,
  Zap,
  BarChart3,
  Settings as SettingsIcon,
  UserCog,
  UsersRound
} from 'lucide-react';
import MainLayout from '../components/layout/MainLayout';
import postApi from '../services/postApi';
import channelApi from '../services/channelApi';
import useAuth from '../hooks/useAuth';
import userApi from '../services/userApi';
import RoleBadge from '../components/RoleBadge';
import { PERMISSIONS, formatDateTime } from '../utils/permissions';

// Mô tả phạm vi dữ liệu Bảng tin theo vai trò
const SCOPE_TEXT = {
  admin: 'Bạn đang xem số liệu toàn hệ thống (bài của bạn, Quản lý và Thành viên).',
  manager: 'Bạn đang xem số liệu của bạn và các Thành viên trong đội.',
  user: 'Bạn đang xem số liệu bài đăng của riêng bạn.'
};
import { resolveMediaUrl } from '../components/AiImageStudioModal';

function parseDateSafe(val) {
  if (!val) return null;
  if (typeof val === 'number') {
    const d = new Date(val);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const num = Number(val);
  if (!Number.isNaN(num) && num > 100000000000) {
    const d = new Date(num);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(val);
  if (!Number.isNaN(d.getTime())) return d;
  const d2 = new Date(String(val).replace(' ', 'T'));
  if (!Number.isNaN(d2.getTime())) return d2;
  return null;
}

function formatDateSafe(val, fallback = 'Đăng trực tiếp') {
  const d = parseDateSafe(val);
  return d ? d.toLocaleString('vi-VN') : fallback;
}

export default function DashboardHomePage() {
  const { user, can } = useAuth();
  const canManageUsers = can(PERMISSIONS.USERS_MANAGE);
  const [team, setTeam] = useState(null);
  const [stats, setStats] = useState({ total: 0, pending: 0, published: 0, failed: 0 });
  const [posts, setPosts] = useState([]);
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [actionNotice, setActionNotice] = useState('');
  const [publishingId, setPublishingId] = useState(null);
  const [previewTooltip, setPreviewTooltip] = useState(null);

  const handleShowPreview = (post, e) => {
    if (!post) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const channel = channels.find((c) => String(c.id) === String(post.page_id));
    setPreviewTooltip({ post, channel, rect });
  };

  const handleHidePreview = () => {
    setPreviewTooltip(null);
  };

  // Time-based greeting
  const [timeGreeting, setTimeGreeting] = useState('');
  const [formattedToday, setFormattedToday] = useState('');

  useEffect(() => {
    const now = new Date();
    const hour = now.getHours();
    if (hour >= 5 && hour < 12) {
      setTimeGreeting('Chào buổi sáng');
    } else if (hour >= 12 && hour < 18) {
      setTimeGreeting('Chào buổi chiều');
    } else {
      setTimeGreeting('Chào buổi tối');
    }

    setFormattedToday(
      now.toLocaleDateString('vi-VN', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })
    );
  }, []);

  const loadDashboardData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);
    setError('');

    try {
      const [statsRes, postsRes, channelsRes, teamRes] = await Promise.allSettled([
        postApi.getStats(isSilent),
        postApi.getPostsList({ limit: 8 }),
        channelApi.list(isSilent),
        canManageUsers ? userApi.list() : Promise.resolve(null)
      ]);

      if (teamRes.status === 'fulfilled' && teamRes.value?.users) {
        setTeam(teamRes.value.users);
      }

      if (statsRes.status === 'fulfilled' && statsRes.value?.stats) {
        setStats(statsRes.value.stats);
      }

      if (postsRes.status === 'fulfilled' && postsRes.value?.posts) {
        setPosts(postsRes.value.posts);
      }

      if (channelsRes.status === 'fulfilled') {
        const rawChannels = channelsRes.value?.channels || channelsRes.value || [];
        setChannels(Array.isArray(rawChannels) ? rawChannels : []);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể đồng bộ dữ liệu bảng tin.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [canManageUsers]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  // Handle instant trigger publish now
  const handlePublishNow = async (postId) => {
    if (!window.confirm('Bạn có chắc muốn kích hoạt xuất bản bài viết này ngay lập tức lên Fanpage không?')) return;
    setPublishingId(postId);
    setActionNotice('');
    try {
      const res = await postApi.triggerPostNow(postId);
      setActionNotice(`🚀 Bài viết #${postId} đã được đưa vào luồng xuất bản ngay.`);
      await loadDashboardData(true);
    } catch (err) {
      alert(err.response?.data?.message || 'Không thể xuất bản bài viết lúc này.');
    } finally {
      setPublishingId(null);
    }
  };

  // Find the next upcoming scheduled post
  const nextUpcomingPost = useMemo(() => {
    const pendings = posts.filter((p) => {
      if (!['pending', 'scheduled'].includes(p.status) || !p.scheduled_at) return false;
      const d = parseDateSafe(p.scheduled_at);
      return d && d.getTime() > Date.now();
    });
    if (!pendings.length) return null;
    return [...pendings].sort((a, b) => {
      const da = parseDateSafe(a.scheduled_at)?.getTime() || 0;
      const db = parseDateSafe(b.scheduled_at)?.getTime() || 0;
      return da - db;
    })[0];
  }, [posts]);

  // Compute 7-day distribution from posts
  const dayStats = useMemo(() => {
    const days = [
      { label: 'T2', count: 0, dayIndex: 1 },
      { label: 'T3', count: 0, dayIndex: 2 },
      { label: 'T4', count: 0, dayIndex: 3 },
      { label: 'T5', count: 0, dayIndex: 4 },
      { label: 'T6', count: 0, dayIndex: 5 },
      { label: 'T7', count: 0, dayIndex: 6 },
      { label: 'CN', count: 0, dayIndex: 0 }
    ];

    posts.forEach((p) => {
      const date = parseDateSafe(p.scheduled_at) || parseDateSafe(p.created_at);
      if (date) {
        const d = date.getDay();
        const found = days.find((item) => item.dayIndex === d);
        if (found) found.count += 1;
      }
    });

    const maxCount = Math.max(1, ...days.map((d) => d.count));
    return { days, maxCount };
  }, [posts]);

  // Success rate
  const successRate = useMemo(() => {
    const totalFinished = (stats.published || 0) + (stats.failed || 0);
    if (totalFinished === 0) return 100;
    return Math.round((stats.published / totalFinished) * 100);
  }, [stats.published, stats.failed]);

  // Helper for format badge & icon
  const getMediaMeta = (mediaType) => {
    switch (mediaType) {
      case 'image':
        return { label: 'Hình ảnh', icon: ImageIcon, color: '#38bdf8' };
      case 'video':
        return { label: 'Video', icon: VideoIcon, color: '#f59e0b' };
      case 'reel':
        return { label: 'Reel', icon: Film, color: '#ec4899' };
      case 'story':
        return { label: 'Story', icon: Flame, color: '#8b5cf6' };
      default:
        return { label: 'Văn bản', icon: FileText, color: '#00f2fe' };
    }
  };

  const [avatarError, setAvatarError] = useState(false);
  const avatarUrl = !avatarError
    ? user?.avatar || channels[0]?.picture?.data?.url || null
    : null;

  const displayName = user?.name || user?.email?.split('@')[0] || 'Chủ tịch';

  return (
    <MainLayout title="Bảng tin">
      {/* ═══ 1. COMMAND CENTER HERO BANNER ═══ */}
      <section className="dashboard-hero-banner">
        <div className="dashboard-hero-content">
          <div className="dashboard-user-greeting">
            <div className="dashboard-avatar-ring">
              <div className="dashboard-avatar-inner">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={displayName}
                    referrerPolicy="no-referrer"
                    onError={() => setAvatarError(true)}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      borderRadius: '14px',
                      display: 'block'
                    }}
                  />
                ) : (
                  displayName.charAt(0).toUpperCase()
                )}
              </div>
            </div>
            <div>
              <div className="dashboard-live-badges">
                {user && <RoleBadge role={user.role} label={user.roleLabel} size="sm" />}
                <span className="dashboard-badge-chip green">
                  <span className="float-dot green" /> BullMQ Engine: Đang chạy
                </span>
                <span className="dashboard-badge-chip">
                  <Radio size={11} /> Meta Graph API v22.0
                </span>
                <span className="dashboard-badge-chip purple">
                  <ShieldCheck size={11} /> {channels.length} Fanpage kết nối
                </span>
              </div>
              <h1 className="dashboard-title-heading">
                {timeGreeting}, {displayName}! 👋
              </h1>
              <p className="dashboard-subtitle">
                Hôm nay là <strong style={{ color: 'var(--ink)', textTransform: 'capitalize' }}>{formattedToday}</strong>.
                {' '}{SCOPE_TEXT[user?.role] || SCOPE_TEXT.user}
              </p>
            </div>
          </div>

          <div className="dashboard-banner-actions">
            <button
              type="button"
              className="button button-secondary"
              onClick={() => loadDashboardData(true)}
              disabled={refreshing}
              title="Làm mới dữ liệu"
              style={{ minHeight: 40 }}
            >
              <RefreshCw size={15} className={refreshing ? 'spin' : ''} />
              {refreshing ? 'Đang tải…' : 'Làm mới'}
            </button>
            <Link className="button button-secondary" href="/post-planner/bulk-upload">
              <FileSpreadsheet size={15} /> Tải Excel
            </Link>
            <Link className="button button-primary" href="/post-planner/compose">
              <PenLine size={15} /> Viết bài mới
            </Link>
          </div>
        </div>
      </section>

      {/* Action Notice & Error Bar */}
      {actionNotice && (
        <div className="notice" style={{ marginBottom: 18, background: 'rgba(16, 185, 129, 0.12)', borderColor: 'rgba(16, 185, 129, 0.35)', color: '#34d399' }}>
          {actionNotice}
        </div>
      )}
      {error && (
        <div className="notice" style={{ marginBottom: 18 }}>
          {error}
        </div>
      )}

      {/* ═══ TỔNG QUAN ĐỘI NHÓM (CHỈ QUẢN LÝ / QUẢN TRỊ VIÊN) ═══ */}
      {canManageUsers && (
        <section className="panel team-overview">
          <div className="panel-heading">
            <h2><UsersRound size={16} style={{ verticalAlign: 'middle', marginRight: 8, color: 'var(--blue)' }} />Tổng quan đội nhóm</h2>
            <div style={{ display: 'flex', gap: 8 }}>
              {can(PERMISSIONS.SETTINGS_SYSTEM) && (
                <Link className="button button-secondary team-overview-btn" href="/settings">
                  <SettingsIcon size={14} /> Cấu hình hệ thống
                </Link>
              )}
              <Link className="button button-primary team-overview-btn" href="/users">
                <UserCog size={14} /> Quản lý thành viên
              </Link>
            </div>
          </div>
          <div className="panel-body team-overview-body">
            <div className="team-overview-stats">
              {(user?.role === 'admin' ? ['admin', 'manager', 'user'] : ['manager', 'user']).map((role) => (
                <div key={role} className="team-overview-stat">
                  <RoleBadge role={role} size="sm" />
                  <strong>{team ? team.filter((member) => member.role === role).length : '—'}</strong>
                </div>
              ))}
              <div className="team-overview-stat">
                <span className="status-pill failed">Đã khóa</span>
                <strong>{team ? team.filter((member) => member.status === 'locked').length : '—'}</strong>
              </div>
            </div>
            <div className="team-overview-recent">
              <span className="muted">Tài khoản mới nhất bạn quản lý</span>
              {team && team.filter((member) => member.manageable).length === 0 && (
                <p className="muted" style={{ margin: '8px 0 0', fontSize: 12.5 }}>Chưa có tài khoản cấp dưới. Bấm “Quản lý thành viên” để tạo tài khoản.</p>
              )}
              <ul>
                {(team || []).filter((member) => member.manageable).slice(-4).reverse().map((member) => (
                  <li key={member.id}>
                    <span className={`um-avatar um-avatar-${member.role}`}>{member.name?.charAt(0)?.toUpperCase() || 'U'}</span>
                    <div>
                      <strong>{member.name}</strong>
                      <small>@{member.username} · {formatDateTime(member.lastLoginAt, 'Chưa đăng nhập')}</small>
                    </div>
                    <RoleBadge role={member.role} label={member.roleLabel} size="sm" />
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}

      {/* ═══ 2. SPOTLIGHT: NEXT UPCOMING POST ═══ */}
      <section className="dashboard-spotlight-card">
        <div className="dashboard-spotlight-glow" />
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, width: '100%', padding: '4px 0' }}>
            <div className="skeleton-shimmer skeleton-box" style={{ width: 48, height: 48, borderRadius: 14, flexShrink: 0 }} />
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <div className="skeleton-shimmer skeleton-box" style={{ width: 140, height: 12, marginBottom: 8 }} />
              <div className="skeleton-shimmer skeleton-box" style={{ width: '65%', height: 16, marginBottom: 8 }} />
              <div className="skeleton-shimmer skeleton-box" style={{ width: '40%', height: 12 }} />
            </div>
            <div className="skeleton-shimmer skeleton-pill" style={{ width: 90, height: 38 }} />
          </div>
        ) : (
          <>
            <div className="dashboard-spotlight-left">
              <div className="dashboard-spotlight-icon-box">
                <Clock size={24} />
              </div>
              <div style={{ overflow: 'hidden' }}>
                <div className="dashboard-spotlight-title">
                  <Zap size={13} />
                  {nextUpcomingPost ? 'Tiêu điểm bài đăng kế tiếp' : 'Hàng đợi xuất bản tự động'}
                </div>
                {nextUpcomingPost ? (
                  <>
                    <div
                      className="dashboard-spotlight-snippet"
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={(e) => handleShowPreview(nextUpcomingPost, e)}
                      onMouseLeave={handleHidePreview}
                    >
                      "{nextUpcomingPost.content || 'Bài viết đa phương tiện không có mô tả'}"
                    </div>
                    <div className="dashboard-spotlight-meta">
                      <span>
                        📅 Xuất bản lúc: <strong style={{ color: 'var(--blue)' }}>{formatDateSafe(nextUpcomingPost.scheduled_at, 'Đang chờ')}</strong>
                      </span>
                      <span>
                        📱 Fanpage:{' '}
                        <strong style={{ color: 'var(--ink)' }}>
                          {channels.find((c) => String(c.id) === String(nextUpcomingPost.page_id))?.name || nextUpcomingPost.page_id || 'Đa kênh'}
                        </strong>
                      </span>
                      {(() => {
                        const meta = getMediaMeta(nextUpcomingPost.media_type);
                        const MetaIcon = meta.icon;
                        return (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: meta.color, fontWeight: 700 }}>
                            <MetaIcon size={12} /> {meta.label}
                          </span>
                        );
                      })()}
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: 13.5, color: 'var(--muted)', marginTop: 2 }}>
                    Tất cả bài viết trong hàng đợi đều đã xuất bản thành công! Hãy tiếp tục lên lịch bài viết mới để duy trì tương tác trang.
                  </div>
                )}
              </div>
            </div>

            <div>
              {nextUpcomingPost ? (
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    type="button"
                    className="button button-primary"
                    style={{ minHeight: 38, fontSize: 12.5 }}
                    onClick={() => handlePublishNow(nextUpcomingPost.id)}
                    disabled={publishingId === nextUpcomingPost.id}
                  >
                    <Send size={14} />
                    {publishingId === nextUpcomingPost.id ? 'Đang gửi…' : 'Đăng ngay'}
                  </button>
                  <Link className="button button-secondary" href="/post-planner/list" style={{ minHeight: 38, fontSize: 12.5 }}>
                    Xem danh sách
                  </Link>
                </div>
              ) : (
                <Link className="button button-primary" href="/post-planner/compose" style={{ minHeight: 38, fontSize: 12.5 }}>
                  <PenLine size={14} /> Lên lịch ngay
                </Link>
              )}
            </div>
          </>
        )}
      </section>

      {/* ═══ 3. HIGH-TECH 4 METRIC OVERVIEW CARDS ═══ */}
      <section className="metric-grid">
        {/* Metric 1: Tổng bài */}
        <article className="metric-card-pro" style={{ borderTop: '2px solid var(--blue)' }}>
          <div className="metric-card-pro-top">
            <div className="metric-label" style={{ color: 'var(--blue)' }}>
              <Send size={16} /> Tổng bài đăng
            </div>
            <span className="metric-card-pro-trend" style={{ background: 'rgba(37, 99, 235, 0.08)', color: 'var(--blue)' }}>
              <TrendingUp size={11} /> Toàn bộ
            </span>
          </div>
          <div className="metric-card-pro-value" style={{ color: 'var(--ink)' }}>
            {loading ? (
              <div className="skeleton-shimmer skeleton-box" style={{ width: 64, height: 32, borderRadius: 8, margin: '6px 0' }} />
            ) : (
              stats.total || 0
            )}
          </div>
          <div className="metric-foot">
            Trong kho lưu trữ workspace
          </div>
          <div className="metric-card-pro-bar">
            {loading ? (
              <div className="skeleton-shimmer skeleton-box" style={{ width: '100%', height: '100%' }} />
            ) : (
              <div className="metric-card-pro-bar-fill" style={{ width: '100%', background: 'linear-gradient(90deg, #2563eb, #3b82f6)' }} />
            )}
          </div>
        </article>

        {/* Metric 2: Đang chờ */}
        <article className="metric-card-pro" style={{ borderTop: '2px solid #f59e0b' }}>
          <div className="metric-card-pro-top">
            <div className="metric-label" style={{ color: '#f59e0b' }}>
              <CalendarDays size={16} /> Chờ xuất bản
            </div>
            <span className="metric-card-pro-trend" style={{ background: 'rgba(245, 158, 11, 0.12)', color: '#fbbf24' }}>
              <span className="float-dot amber" style={{ width: 6, height: 6 }} /> Theo lịch
            </span>
          </div>
          <div className="metric-card-pro-value" style={{ color: '#fbbf24' }}>
            {loading ? (
              <div className="skeleton-shimmer skeleton-box" style={{ width: 64, height: 32, borderRadius: 8, margin: '6px 0' }} />
            ) : (
              stats.pending || 0
            )}
          </div>
          <div className="metric-foot">
            Bài viết sắp đến giờ hẹn đăng
          </div>
          <div className="metric-card-pro-bar">
            {loading ? (
              <div className="skeleton-shimmer skeleton-box" style={{ width: '100%', height: '100%' }} />
            ) : (
              <div
                className="metric-card-pro-bar-fill"
                style={{
                  width: `${stats.total ? Math.min(100, Math.round((stats.pending / stats.total) * 100)) : 0}%`,
                  background: '#f59e0b'
                }}
              />
            )}
          </div>
        </article>

        {/* Metric 3: Đã xuất bản */}
        <article className="metric-card-pro" style={{ borderTop: '2px solid #10b981' }}>
          <div className="metric-card-pro-top">
            <div className="metric-label" style={{ color: '#10b981' }}>
              <CheckCircle2 size={16} /> Đã xuất bản
            </div>
            <span className="metric-card-pro-trend" style={{ background: 'rgba(16, 185, 129, 0.12)', color: '#34d399' }}>
              {successRate}% thành công
            </span>
          </div>
          <div className="metric-card-pro-value" style={{ color: '#34d399' }}>
            {loading ? (
              <div className="skeleton-shimmer skeleton-box" style={{ width: 64, height: 32, borderRadius: 8, margin: '6px 0' }} />
            ) : (
              stats.published || 0
            )}
          </div>
          <div className="metric-foot">
            Đã đăng thành công lên Facebook
          </div>
          <div className="metric-card-pro-bar">
            {loading ? (
              <div className="skeleton-shimmer skeleton-box" style={{ width: '100%', height: '100%' }} />
            ) : (
              <div
                className="metric-card-pro-bar-fill"
                style={{
                  width: `${stats.total ? Math.min(100, Math.round((stats.published / stats.total) * 100)) : 0}%`,
                  background: '#10b981'
                }}
              />
            )}
          </div>
        </article>

        {/* Metric 4: Cần kiểm tra */}
        <article className="metric-card-pro" style={{ borderTop: '2px solid #ec4899' }}>
          <div className="metric-card-pro-top">
            <div className="metric-label" style={{ color: '#ec4899' }}>
              <CircleAlert size={16} /> Cần kiểm tra
            </div>
            <span className="metric-card-pro-trend" style={{ background: 'rgba(236, 72, 153, 0.12)', color: '#f472b6' }}>
              {stats.failed > 0 ? 'Cần xử lý' : '0 lỗi'}
            </span>
          </div>
          <div className="metric-card-pro-value" style={{ color: stats.failed > 0 ? '#f472b6' : 'var(--muted)' }}>
            {loading ? (
              <div className="skeleton-shimmer skeleton-box" style={{ width: 64, height: 32, borderRadius: 8, margin: '6px 0' }} />
            ) : (
              stats.failed || 0
            )}
          </div>
          <div className="metric-foot">
            {stats.failed > 0 ? (
              <Link href="/post-planner/list?status=failed" style={{ color: '#f472b6', textDecoration: 'underline' }}>
                Bấm vào để xem lỗi & thử lại
              </Link>
            ) : (
              'Không có bài đăng gặp sự cố'
            )}
          </div>
          <div className="metric-card-pro-bar">
            {loading ? (
              <div className="skeleton-shimmer skeleton-box" style={{ width: '100%', height: '100%' }} />
            ) : (
              <div
                className="metric-card-pro-bar-fill"
                style={{
                  width: `${stats.total ? Math.min(100, Math.round((stats.failed / stats.total) * 100)) : 0}%`,
                  background: '#ec4899'
                }}
              />
            )}
          </div>
        </article>
      </section>

      {/* ═══ 4. CONNECTED CHANNELS QUICK MONITOR STRIP ═══ */}
      {loading ? (
        <section style={{ marginBottom: 20 }}>
          <div className="skeleton-shimmer skeleton-box" style={{ width: 220, height: 16, marginBottom: 12 }} />
          <div className="dashboard-channel-strip">
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton-shimmer skeleton-box" style={{ height: 60, borderRadius: 14 }} />
            ))}
          </div>
        </section>
      ) : channels.length > 0 ? (
        <section style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h2 style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
              <Layers size={16} color="var(--blue)" /> Kênh Fanpage đang kết nối ({channels.length})
            </h2>
            <Link href="/channels" className="button button-quiet" style={{ fontSize: 12, color: 'var(--blue)' }}>
              Quản lý kênh & Token <ArrowRight size={13} style={{ marginLeft: 4 }} />
            </Link>
          </div>

          <div className="dashboard-channel-strip">
            {channels.slice(0, 4).map((chan) => (
              <div className="dashboard-channel-card" key={chan.id}>
                <div className="dashboard-channel-info">
                  <div className="dashboard-channel-avatar">
                    {chan.picture?.data?.url ? (
                      <img
                        src={chan.picture.data.url}
                        alt={chan.name}
                        style={{ width: '100%', height: '100%', borderRadius: 10, objectFit: 'cover' }}
                      />
                    ) : (
                      chan.name?.charAt(0) || 'F'
                    )}
                  </div>
                  <div style={{ overflow: 'hidden' }}>
                    <div className="dashboard-channel-name" title={chan.name}>
                      {chan.name}
                    </div>
                    <div className="dashboard-channel-sub">
                      <ShieldCheck size={12} color="#10b981" /> Token vĩnh viễn
                    </div>
                  </div>
                </div>
                <Link
                  href={`/post-planner/compose?pageId=${chan.id}`}
                  className="button button-quiet"
                  style={{ minHeight: 28, fontSize: 11, padding: '0 8px', color: 'var(--blue)' }}
                  title={`Đăng bài cho ${chan.name}`}
                >
                  <PenLine size={12} />
                </Link>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* ═══ 5. MAIN SPLIT COLUMNS: RECENT POSTS & TOOLS ═══ */}
      <div className="home-columns">
        {/* Left Column: Recent Posts Queue */}
        <section className="panel">
          <div className="panel-heading">
            <h2>
              <Send size={16} style={{ marginRight: 8, color: 'var(--blue)', verticalAlign: 'middle' }} />
              Bài đăng gần đây
            </h2>
            <div style={{ display: 'flex', gap: 8 }}>
              <Link className="button button-secondary" href="/post-planner/list">
                Xem tất cả ({stats.total || 0})
              </Link>
            </div>
          </div>

          <div className="panel-body">
            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="post-row" style={{ opacity: 0.9 }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <div className="skeleton-shimmer skeleton-box" style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div className="skeleton-shimmer skeleton-box" style={{ width: '70%', height: 13, marginBottom: 6 }} />
                        <div className="skeleton-shimmer skeleton-box" style={{ width: '40%', height: 11 }} />
                      </div>
                    </div>
                    <div className="skeleton-shimmer skeleton-pill" style={{ width: 68, height: 24 }} />
                  </div>
                ))}
              </div>
            ) : posts.length ? (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {posts.map((post) => {
                  const meta = getMediaMeta(post.media_type);
                  const FormatIcon = meta.icon;
                  const channel = channels.find((c) => String(c.id) === String(post.page_id));

                  return (
                    <div className="post-row" key={post.id}>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', overflow: 'hidden' }}>
                        {post.media_link ? (
                          <div
                            className="media-thumbnail-card"
                            style={{
                              width: 44,
                              height: 44,
                              flexShrink: 0,
                              borderRadius: 10,
                              marginTop: 2,
                              cursor: 'pointer'
                            }}
                            onMouseEnter={(e) => handleShowPreview(post, e)}
                            onMouseLeave={handleHidePreview}
                          >
                            {post.media_type === 'video' || post.media_link?.match(/\.mp4/i) ? (
                              <div style={{ width: '100%', height: '100%', background: '#000', display: 'grid', placeItems: 'center', color: '#fff' }}>
                                <VideoIcon size={18} />
                              </div>
                            ) : (
                              <img
                                src={resolveMediaUrl(post.media_link)}
                                alt={`Post #${post.id}`}
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                onError={(e) => { e.currentTarget.style.display = 'none'; }}
                              />
                            )}
                          </div>
                        ) : (
                          <div
                            style={{
                              width: 40,
                              height: 40,
                              borderRadius: 10,
                              background: 'var(--apple-glass-bg-subtle)',
                              backdropFilter: 'var(--apple-glass-blur)',
                              border: `1px solid ${meta.color}40`,
                              display: 'grid',
                              placeItems: 'center',
                              color: meta.color,
                              flexShrink: 0,
                              marginTop: 2
                            }}
                          >
                            <FormatIcon size={18} />
                          </div>
                        )}
                        <div style={{ overflow: 'hidden' }}>
                          <strong
                            style={{ cursor: 'pointer' }}
                            onMouseEnter={(e) => handleShowPreview(post, e)}
                            onMouseLeave={handleHidePreview}
                          >
                            {post.content || <span style={{ color: 'var(--muted)', fontStyle: 'italic' }}>Không có văn bản (Nội dung media)</span>}
                          </strong>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
                            <small style={{ color: 'var(--blue)', fontWeight: 700 }}>
                              #{post.id}
                            </small>
                            <small style={{ color: 'var(--muted)' }}>
                              📱 {channel?.name || post.page_id || 'Fanpage'}
                            </small>
                            <small style={{ color: 'var(--dim)' }}>
                              🕒 {formatDateSafe(post.scheduled_at, 'Đăng trực tiếp')}
                            </small>
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className={`status-pill ${post.status || 'pending'}`}>
                          {post.status === 'published'
                            ? 'Đã đăng'
                            : post.status === 'pending'
                            ? 'Chờ xuất bản'
                            : post.status === 'failed'
                            ? 'Lỗi'
                            : post.status === 'publishing'
                            ? 'Đang đăng'
                            : post.status || 'Chờ'}
                        </span>

                        {post.status === 'pending' && (
                          <button
                            type="button"
                            className="button button-quiet"
                            style={{ minHeight: 28, fontSize: 11, padding: '0 8px', color: '#00f2fe' }}
                            onClick={() => handlePublishNow(post.id)}
                            disabled={publishingId === post.id}
                            title="Xuất bản bài này ngay lập tức"
                          >
                            <Send size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="empty-state" style={{ padding: '36px 20px' }}>
                <Send size={32} style={{ color: 'var(--dim)', marginBottom: 10 }} />
                <p style={{ margin: '0 0 12px' }}>Chưa có bài đăng nào trong lịch.</p>
                <Link className="button button-primary" href="/post-planner/compose">
                  <PenLine size={14} /> Soạn bài viết đầu tiên
                </Link>
              </div>
            )}
          </div>
        </section>

        {/* Right Column: 7-Day Visual Frequency & Tools */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* 7-Day Frequency Visual */}
          <section className="panel">
            <div className="panel-heading">
              <h2>
                <BarChart3 size={16} style={{ marginRight: 8, color: '#38bdf8', verticalAlign: 'middle' }} />
                Phân bổ lịch tuần
              </h2>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>Tần suất bài đăng</span>
            </div>
            <div className="panel-body">
              <div className="dashboard-chart-box">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)' }}>Hoạt động Thứ 2 - Chủ Nhật</span>
                  <span style={{ fontSize: 11, fontWeight: 800, color: '#00f2fe' }}>
                    {loading ? 'Đang đọc…' : `${posts.length} bài đã xếp lịch`}
                  </span>
                </div>
                {loading ? (
                  <div className="dashboard-chart-cols">
                    {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((day, idx) => (
                      <div className="dashboard-chart-col" key={day}>
                        <div
                          className="skeleton-shimmer dashboard-chart-pillar"
                          style={{ height: `${25 + ((idx * 19) % 55)}%` }}
                        />
                        <span className="dashboard-chart-day" style={{ opacity: 0.35 }}>{day}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="dashboard-chart-cols">
                    {dayStats.days.map((d) => {
                      const heightPercent = d.count ? Math.max(12, Math.round((d.count / dayStats.maxCount) * 100)) : 8;
                      return (
                        <div className="dashboard-chart-col" key={d.label}>
                          {d.count > 0 && <span className="dashboard-chart-count">{d.count}</span>}
                          <div
                            className="dashboard-chart-pillar"
                            style={{
                              height: `${heightPercent}%`,
                              background: d.count > 0 ? 'linear-gradient(180deg, #00f2fe 0%, rgba(139, 92, 246, 0.4) 100%)' : 'rgba(255, 255, 255, 0.05)'
                            }}
                            title={`Thứ ${d.label}: ${d.count} bài đăng`}
                          />
                          <span className="dashboard-chart-day" style={{ color: d.count > 0 ? '#38bdf8' : 'var(--dim)' }}>
                            {d.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <p style={{ margin: '12px 0 0', fontSize: 11.5, color: 'var(--dim)', lineHeight: 1.4 }}>
                💡 <strong>Mẹo tương tác:</strong> Các khung giờ vàng <strong>09:30 - 11:30</strong> và <strong>19:30 - 21:00</strong> đạt tỷ lệ phân phối thuật toán Facebook cao nhất.
              </p>
            </div>
          </section>

          {/* Quick Tools Grid */}
          <section className="panel">
            <div className="panel-heading">
              <h2>Truy cập nhanh</h2>
            </div>
            <div className="panel-body">
              <div className="dashboard-tools-grid">
                <Link className="dashboard-tool-card" href="/post-planner/calendar">
                  <div className="dashboard-tool-icon" style={{ background: 'rgba(37, 99, 235, 0.08)', color: 'var(--blue)' }}>
                    <CalendarDays size={20} />
                  </div>
                  <div>
                    <div className="dashboard-tool-title">Lịch trực quan</div>
                    <div className="dashboard-tool-desc">Xem và kéo thả bài đăng theo ngày/tháng</div>
                  </div>
                </Link>

                <Link className="dashboard-tool-card" href="/ai-studio">
                  <div className="dashboard-tool-icon" style={{ background: 'rgba(236, 72, 153, 0.12)', color: '#ec4899' }}>
                    <Sparkles size={20} />
                  </div>
                  <div>
                    <div className="dashboard-tool-title">AI Studio</div>
                    <div className="dashboard-tool-desc">Tạo nội dung & kịch bản tự động bằng AI</div>
                  </div>
                </Link>

                <Link className="dashboard-tool-card" href="/channels">
                  <div className="dashboard-tool-icon" style={{ background: 'rgba(2, 132, 199, 0.08)', color: '#0284c7' }}>
                    <Layers size={20} />
                  </div>
                  <div>
                    <div className="dashboard-tool-title">Kênh Fanpage</div>
                    <div className="dashboard-tool-desc">Kết nối và kiểm tra sức khỏe token</div>
                  </div>
                </Link>

                <Link className="dashboard-tool-card" href="/post-planner/bulk-upload">
                  <div className="dashboard-tool-icon" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
                    <FileSpreadsheet size={20} />
                  </div>
                  <div>
                    <div className="dashboard-tool-title">Tải Excel</div>
                    <div className="dashboard-tool-desc">Nhập lịch hẹn hàng loạt qua bảng tính</div>
                  </div>
                </Link>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* ═══ CYBERPUNK GLASS HOVER POPOVER (OPTION 1) ═══ */}
      {previewTooltip && (() => {
        const { post, channel, rect } = previewTooltip;
        const meta = getMediaMeta(post.media_type);
        const FormatIcon = meta.icon;

        const tooltipWidth = 440;
        const padding = 16;
        let left = rect.left;
        if (typeof window !== 'undefined') {
          if (left + tooltipWidth > window.innerWidth - padding) {
            left = window.innerWidth - tooltipWidth - padding;
          }
          if (left < padding) {
            left = padding;
          }
        }

        const placeAbove = rect.top > 260;
        const top = placeAbove ? undefined : rect.bottom + 10;
        const bottom = placeAbove ? (typeof window !== 'undefined' ? window.innerHeight - rect.top + 10 : undefined) : undefined;

        return (
          <div
            className="custom-glass-tooltip"
            style={{
              left: `${left}px`,
              top: top !== undefined ? `${top}px` : undefined,
              bottom: bottom !== undefined ? `${bottom}px` : undefined
            }}
          >
            <div className="custom-glass-tooltip-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    fontSize: 11.5,
                    fontWeight: 800,
                    padding: '3px 8px',
                    borderRadius: 6,
                    background: `${meta.color}20`,
                    color: meta.color,
                    border: `1px solid ${meta.color}50`
                  }}
                >
                  <FormatIcon size={12} /> {meta.label}
                </span>
                <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--blue)' }}>
                  #{post.id}
                </span>
              </div>
              <span className={`status-pill ${post.status || 'pending'}`} style={{ fontSize: 11, padding: '3px 9px' }}>
                {post.status === 'published'
                  ? 'Đã đăng'
                  : post.status === 'pending'
                  ? 'Chờ xuất bản'
                  : post.status === 'failed'
                  ? 'Lỗi'
                  : post.status === 'publishing'
                  ? 'Đang gửi…'
                  : post.status}
              </span>
            </div>

            <div className="custom-glass-tooltip-meta">
              <span>📱 {channel?.name || post.page_id || 'Fanpage'}</span>
              <span>•</span>
              <span>🕒 {formatDateSafe(post.scheduled_at, 'Đăng trực tiếp')}</span>
            </div>

            <div className="custom-glass-tooltip-body">
              {post.content ? (
                post.content
              ) : (
                <em style={{ color: 'var(--muted)' }}>Bài viết đa phương tiện, không có nội dung văn bản.</em>
              )}
            </div>

            <div className="custom-glass-tooltip-foot">
              <span>✨ Xem trước nội dung bài đăng</span>
              <span>Di chuột ra ngoài để đóng</span>
            </div>
          </div>
        );
      })()}
    </MainLayout>
  );
}
