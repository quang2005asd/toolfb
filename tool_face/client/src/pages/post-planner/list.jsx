import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import MainLayout from '../../components/layout/MainLayout';
import postApi from '../../services/postApi';
import channelApi from '../../services/channelApi';
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  Eye,
  X,
  ExternalLink,
  ThumbsUp,
  MessageCircle,
  Share2,
  AlertCircle,
  CheckCircle2,
  Ban,
  Image as ImageIcon,
  Film,
  FileText
} from 'lucide-react';
import { resolveMediaUrl } from '../../components/AiImageStudioModal';

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

function formatDateTime(val, fallback = 'Đăng ngay') {
  const d = parseDateSafe(val);
  return d ? d.toLocaleString('vi-VN') : fallback;
}

function PostDetailModal({ postId, onClose, onRefresh, channelName }) {
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [analyticsError, setAnalyticsError] = useState('');
  const [instantComment, setInstantComment] = useState('');
  const [sendingInstant, setSendingInstant] = useState(false);
  const [instantMessage, setInstantMessage] = useState({ text: '', type: '' });

  useEffect(() => {
    if (!postId) return;
    setLoading(true);
    postApi.getPostDetail(postId)
      .then((res) => {
        if (res.success && res.post) {
          setPost(res.post);
        }
      })
      .catch((err) => console.error('Lỗi lấy chi tiết:', err))
      .finally(() => setLoading(false));
  }, [postId]);

  const handleFetchAnalytics = async () => {
    setLoadingAnalytics(true);
    setAnalyticsError('');
    try {
      const res = await postApi.getPostAnalytics(postId);
      if (res.success && res.analytics) {
        setAnalytics(res.analytics);
      }
    } catch (err) {
      setAnalyticsError(err.response?.data?.message || 'Không thể lấy dữ liệu tương tác từ Facebook.');
    } finally {
      setLoadingAnalytics(false);
    }
  };

  const handleSendInstantComment = async () => {
    if (!instantComment.trim()) return;
    setSendingInstant(true);
    setInstantMessage({ text: '', type: '' });
    try {
      const res = await postApi.postInstantComment(postId, instantComment.trim());
      if (res.success) {
        setInstantMessage({ text: '✅ Đã gửi comment lên Facebook thành công!', type: 'success' });
        setInstantComment('');
        const updated = await postApi.getPostDetail(postId);
        if (updated.success && updated.post) setPost(updated.post);
        if (onRefresh) onRefresh();
      }
    } catch (err) {
      setInstantMessage({ text: err.response?.data?.message || err.message || 'Lỗi gửi comment.', type: 'error' });
    } finally {
      setSendingInstant(false);
    }
  };

  if (!postId) return null;

  let mediaLinks = [];
  if (post?.media_links) {
    try {
      const parsed = JSON.parse(post.media_links);
      mediaLinks = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      mediaLinks = [post.media_links];
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.45)',
        backdropFilter: 'blur(24px) saturate(190%)',
        WebkitBackdropFilter: 'blur(24px) saturate(190%)',
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
          maxWidth: 680,
          maxHeight: '90vh',
          overflowY: 'auto',
          borderRadius: 24,
          boxShadow: '0 32px 80px -10px rgba(15, 23, 42, 0.28), inset 0 1px 2px rgba(255, 255, 255, 1)',
          border: '1px solid rgba(220, 214, 202, 0.65)',
          borderTop: '1px solid rgba(255, 255, 255, 0.98)'
        }}
      >
        <div className="panel-heading">
          <div>
            <h2>Chi tiết bài đăng #{postId}</h2>
            <span className="muted" style={{ fontSize: 12 }}>
              Kênh: <strong style={{ color: '#00f2fe' }}>{channelName}</strong>
            </span>
          </div>
          <button className="button button-quiet" type="button" style={{ minHeight: 28, padding: '0 8px' }} onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="panel-body">
          {loading ? (
            <p className="muted" style={{ textAlign: 'center', padding: 30 }}>Đang tải chi tiết bài viết…</p>
          ) : !post ? (
            <p className="muted" style={{ textAlign: 'center', padding: 30 }}>Không tìm thấy bài viết.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Thông tin Meta */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, background: 'var(--panel)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', padding: 14, borderRadius: 14, border: '1px solid var(--line)', borderTop: '1px solid rgba(255, 255, 255, 0.8)', boxShadow: '0 2px 8px rgba(70, 55, 40, 0.02)' }}>
                <div>
                  <span className="muted" style={{ fontSize: 11 }}>Trạng thái:</span>
                  <div style={{ fontWeight: 700, marginTop: 2 }}>{post.status}</div>
                </div>
                <div>
                  <span className="muted" style={{ fontSize: 11 }}>Định dạng:</span>
                  <div style={{ fontWeight: 700, marginTop: 2, textTransform: 'uppercase' }}>{post.media_type || 'TEXT'}</div>
                </div>
                <div>
                  <span className="muted" style={{ fontSize: 11 }}>Lịch đăng:</span>
                  <div style={{ fontWeight: 600, marginTop: 2, fontSize: 12.5 }}>
                    {formatDateTime(post.scheduled_at, 'Đăng ngay')}
                  </div>
                </div>
                <div>
                  <span className="muted" style={{ fontSize: 11 }}>Tạo lúc:</span>
                  <div style={{ fontWeight: 600, marginTop: 2, fontSize: 12.5 }}>
                    {formatDateTime(post.created_at, '—')}
                  </div>
                </div>
              </div>

              {/* Nội dung bài đăng */}
              <div>
                <label className="field-label">Nội dung bài viết:</label>
                <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: 12, fontSize: 13.5, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                  {post.content}
                </div>
              </div>

              {/* Tệp đính kèm (Album / Video) */}
              {mediaLinks.length > 0 && (
                <div>
                  <label className="field-label">Tệp đính kèm ({mediaLinks.length} tệp):</label>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {mediaLinks.map((link, idx) => (
                      <div key={idx} style={{ padding: '6px 10px', background: 'rgba(0, 242, 254, 0.08)', border: '1px solid rgba(0, 242, 254, 0.2)', borderRadius: 8, fontSize: 12, color: '#38bdf8' }}>
                        Tệp #{idx + 1}: {link.replace(/^local:\/\//, '')}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Liên kết Facebook & Analytics (Nếu đã đăng) */}
              {post.status === 'published' && post.facebook_post_id && (
                <div style={{ background: 'linear-gradient(135deg, rgba(24, 119, 242, 0.12), rgba(0, 242, 254, 0.08))', border: '1px solid rgba(24, 119, 242, 0.3)', borderRadius: 12, padding: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <CheckCircle2 size={16} color="#10b981" /> Đã xuất bản lên Facebook (ID: {post.facebook_post_id})
                    </span>
                    <a
                      href={`https://facebook.com/${post.facebook_post_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="button button-quiet"
                      style={{ minHeight: 26, fontSize: 11.5, padding: '0 8px', color: '#00f2fe' }}
                    >
                      Mở trên FB <ExternalLink size={13} style={{ marginLeft: 4 }} />
                    </a>
                  </div>

                  {/* THỐNG KÊ TƯƠNG TÁC THỜI GIAN THỰC (ANALYTICS) */}
                  <div style={{ marginTop: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span className="muted" style={{ fontSize: 12 }}>Hiệu quả tương tác thực tế:</span>
                      <button
                        type="button"
                        className="button button-secondary"
                        style={{ minHeight: 24, fontSize: 11, padding: '0 8px' }}
                        onClick={handleFetchAnalytics}
                        disabled={loadingAnalytics}
                      >
                        <RefreshCw size={12} style={{ marginRight: 4 }} />
                        {loadingAnalytics ? 'Đang đọc số liệu…' : 'Cập nhật tương tác FB'}
                      </button>
                    </div>

                    {analytics ? (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, textAlign: 'center' }}>
                        <div style={{ background: 'var(--panel)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', padding: '12px 8px', borderRadius: 12, border: '1px solid var(--line)', borderTop: '1px solid rgba(255, 255, 255, 0.8)', boxShadow: '0 2px 6px rgba(70, 55, 40, 0.02)' }}>
                          <span style={{ fontSize: 18, color: '#38bdf8', fontWeight: 800 }}>❤️ {analytics.likes}</span>
                          <span className="muted" style={{ display: 'block', fontSize: 11, marginTop: 2 }}>Lượt thích</span>
                        </div>
                        <div style={{ background: 'var(--panel)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', padding: '12px 8px', borderRadius: 12, border: '1px solid var(--line)', borderTop: '1px solid rgba(255, 255, 255, 0.8)', boxShadow: '0 2px 6px rgba(70, 55, 40, 0.02)' }}>
                          <span style={{ fontSize: 18, color: '#10b981', fontWeight: 800 }}>💬 {analytics.comments}</span>
                          <span className="muted" style={{ display: 'block', fontSize: 11, marginTop: 2 }}>Bình luận</span>
                        </div>
                        <div style={{ background: 'var(--panel)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', padding: '12px 8px', borderRadius: 12, border: '1px solid var(--line)', borderTop: '1px solid rgba(255, 255, 255, 0.8)', boxShadow: '0 2px 6px rgba(70, 55, 40, 0.02)' }}>
                          <span style={{ fontSize: 18, color: '#f59e0b', fontWeight: 800 }}>↗️ {analytics.shares}</span>
                          <span className="muted" style={{ display: 'block', fontSize: 11, marginTop: 2 }}>Lượt chia sẻ</span>
                        </div>
                      </div>
                    ) : analyticsError ? (
                      <div style={{ fontSize: 11.5, color: '#fca5a5' }}>{analyticsError}</div>
                    ) : (
                      <span className="muted" style={{ fontSize: 11.5 }}>
                        Bấm "Cập nhật tương tác FB" để lấy lượt thích, bình luận, chia sẻ từ Graph API.
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Seeding Comments */}
              {Array.isArray(post.comments) && post.comments.length > 0 && (
                <div>
                  <label className="field-label">Seeding Comments ({post.comments.length}):</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {post.comments.map((cm, idx) => (
                      <div key={idx} style={{ padding: '8px 12px', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: 8, fontSize: 12.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>#{idx + 1}: {cm.content}</span>
                        <span className="muted" style={{ fontSize: 11 }}>Sau {cm.delay_minutes} phút ({cm.status})</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Đăng Seeding Ngay Cho Bài Đã Xuất Bản */}
              {post.status === 'published' && post.facebook_post_id && (
                <div style={{ background: 'rgba(0, 242, 254, 0.04)', border: '1px solid rgba(0, 242, 254, 0.25)', borderRadius: 10, padding: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#00f2fe', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <MessageCircle size={15} /> Gửi Comment Seeding tức thì lên Facebook
                    </span>
                    <span className="muted" style={{ fontSize: 11 }}>Bình luận trực tiếp bằng quyền Page</span>
                  </div>

                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                    <span className="muted" style={{ fontSize: 11, alignSelf: 'center' }}>Mẫu nhanh:</span>
                    <button
                      type="button"
                      className="button button-quiet"
                      style={{ minHeight: 22, padding: '0 8px', fontSize: 11, borderRadius: 12, background: 'rgba(0, 242, 254, 0.08)', color: '#38bdf8' }}
                      onClick={() => setInstantComment('Anh/chị cần tư vấn hoặc báo giá nhanh vui lòng inbox Page hoặc liên hệ Hotline/Zalo nhé ạ! 📞✨')}
                    >
                      Hotline/Zalo
                    </button>
                    <button
                      type="button"
                      className="button button-quiet"
                      style={{ minHeight: 22, padding: '0 8px', fontSize: 11, borderRadius: 12, background: 'rgba(245, 158, 11, 0.08)', color: '#fbbf24' }}
                      onClick={() => setInstantComment('Mọi người để lại bình luận để Ad gửi thông tin chi tiết qua inbox ngay nhé! 🎁💬')}
                    >
                      Kêu gọi Inbox
                    </button>
                  </div>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      className="field"
                      placeholder="Nhập nội dung bình luận muốn đăng ngay lên Facebook..."
                      value={instantComment}
                      onChange={(e) => setInstantComment(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSendInstantComment(); }}
                    />
                    <button
                      className="button button-primary"
                      type="button"
                      style={{ minHeight: 36, whiteSpace: 'nowrap' }}
                      disabled={sendingInstant || !instantComment.trim()}
                      onClick={handleSendInstantComment}
                    >
                      {sendingInstant ? 'Đang gửi…' : 'Gửi lên FB'}
                    </button>
                  </div>

                  {instantMessage.text && (
                    <div style={{ marginTop: 8, fontSize: 12, color: instantMessage.type === 'success' ? '#10b981' : '#f87171' }}>
                      {instantMessage.text}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PostListPage() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [pageIdFilter, setPageIdFilter] = useState('all');
  const [channels, setChannels] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedPostId, setSelectedPostId] = useState(null);
  const [publishingId, setPublishingId] = useState(null);
  const [toastNotice, setToastNotice] = useState('');
  const pageSize = 10;

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await postApi.getPostsList({ page, limit: pageSize, status: statusFilter, pageId: pageIdFilter });
      setPosts(data.posts || data.data || []);
      setTotal(data.total || 0);
    } catch (err) {
      console.error("Lỗi tải danh sách bài viết:", err);
      setError(err.response?.data?.message || 'Không thể kết nối tới Server API.');
    } finally {
      setLoading(false);
    }
  }, [page, pageIdFilter, pageSize, statusFilter]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  useEffect(() => {
    channelApi.list().then((result) => setChannels(result.channels || [])).catch(() => setChannels([]));
  }, []);

  // Hàm xử lý kích hoạt đăng ngay / Thử lại
  const handlePublishNow = async (id) => {
    if (!confirm("Bạn có chắc chắn muốn đăng bài viết này lên Fanpage ngay lập tức?")) return;
    setPublishingId(id);
    setToastNotice('');
    try {
      await postApi.triggerPostNow(id);
      setToastNotice(`🚀 Đã gửi yêu cầu đăng ngay bài viết #${id}! Đang xử lý xuất bản lên Facebook...`);
      // Đợi 1.5 giây để worker hoàn tất và tự làm mới danh sách
      setTimeout(async () => {
        await fetchPosts();
        setPublishingId(null);
        setToastNotice(`✅ Bài viết #${id} đã được xuất bản lên Facebook thành công!`);
        setTimeout(() => setToastNotice(''), 5000);
      }, 1500);
    } catch (err) {
      alert("Lỗi khi đăng bài: " + (err.response?.data?.message || err.message));
      setPublishingId(null);
    }
  };

  // Hàm xử lý hủy lịch bài đăng
  const handleCancelPost = async (id) => {
    if (!confirm('Bạn có chắc chắn muốn hủy lịch bài đăng này?')) return;
    try {
      await postApi.cancelPost(id);
      alert('Đã hủy lịch đăng bài thành công.');
      fetchPosts();
    } catch (err) {
      alert('Lỗi khi hủy lịch: ' + (err.response?.data?.message || err.message));
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Bạn có chắc chắn muốn xóa bài đăng này khỏi hệ thống?')) return;
    try {
      await postApi.deletePost(id);
      if (posts.length === 1 && page > 1) setPage((current) => current - 1);
      else await fetchPosts();
    } catch (err) {
      alert('Lỗi khi xóa bài: ' + (err.response?.data?.message || err.message));
    }
  };

  // Trả về badge màu cho từng trạng thái
  const renderStatusBadge = (post) => {
    const status = post.status;
    const parsedSched = parseDateSafe(post.scheduled_at);
    const isFuture = parsedSched && parsedSched.getTime() > Date.now();
    if (status === 'scheduled' || (post.facebook_post_id && isFuture)) {
      return (
        <span
          className="status-pill"
          style={{ background: 'rgba(0, 242, 254, 0.15)', color: '#00f2fe', border: '1px solid rgba(0, 242, 254, 0.4)' }}
          title="Đã lên lịch hẹn giờ trực tiếp trên Facebook"
        >
          Đã lên lịch
        </span>
      );
    }
    switch (status) {
      case 'published':
        return <span className="status-pill published">Đã đăng</span>;
      case 'publishing':
        return <span className="status-pill publishing">Đang đăng</span>;
      case 'failed':
        return <span className="status-pill failed">Thất bại</span>;
      case 'cancelled':
        return <span className="status-pill" style={{ background: 'rgba(234, 179, 8, 0.15)', color: '#eab308', border: '1px solid rgba(234, 179, 8, 0.3)' }}>Đã hủy</span>;
      default:
        return <span className="status-pill pending">Chờ đăng</span>;
    }
  };

  return (
    <MainLayout
      title="Lịch đăng bài"
      actions={
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="button button-secondary" onClick={fetchPosts} type="button">
            <RefreshCw size={15} /> Làm mới
          </button>
          <Link href="/post-planner/compose" className="button button-primary">
            <Plus size={15} /> Tạo bài
          </Link>
        </div>
      }
    >
      {selectedPostId && (
        <PostDetailModal
          postId={selectedPostId}
          onClose={() => setSelectedPostId(null)}
          onRefresh={fetchPosts}
          channelName={channels.find((c) => c.id === String(posts.find((p) => p.id === selectedPostId)?.page_id))?.name || 'Fanpage'}
        />
      )}

      <section className="panel">
        <div className="filter-bar">
          <div><strong>Danh sách bài đăng</strong><span className="muted"> · {total} mục</span></div>
          <div className="table-tools">
            <select className="field" style={{ width: 180 }} aria-label="Lọc trạng thái" value={statusFilter} onChange={(e) => { setPage(1); setStatusFilter(e.target.value); }}>
              <option value="all">Tất cả trạng thái</option>
              <option value="pending">Chờ đăng</option>
              <option value="publishing">Đang đăng</option>
              <option value="published">Đã đăng</option>
              <option value="failed">Thất bại</option>
              <option value="cancelled">Đã hủy</option>
            </select>
            <select className="field" style={{ width: 180 }} aria-label="Lọc Fanpage" value={pageIdFilter} onChange={(e) => { setPage(1); setPageIdFilter(e.target.value); }}>
              <option value="all">Tất cả Fanpage</option>
              {channels.map((channel) => <option value={channel.id} key={channel.id}>{channel.name}</option>)}
            </select>
          </div>
        </div>
        {toastNotice && (
          <div className="notice" style={{ margin: 14, background: 'rgba(16, 185, 129, 0.15)', borderColor: 'rgba(16, 185, 129, 0.4)', color: '#34d399' }}>
            {toastNotice}
          </div>
        )}
        {error && <div className="notice" style={{ margin: 14 }}>{error}</div>}
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Nội dung bài đăng</th>
                <th>Kênh</th>
                <th>Media</th>
                <th>Lịch đăng</th>
                <th>Trạng thái</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="7"><div className="empty-state">Đang tải lịch đăng…</div></td></tr>
              ) : posts.length === 0 ? (
                <tr><td colSpan="7"><div className="empty-state">Chưa có bài đăng phù hợp.</div></td></tr>
              ) : posts.map((post) => (
                <tr key={post.id}>
                  <td>
                    <strong style={{ color: '#00f2fe', fontSize: 13 }}>#{post.id}</strong>
                    {post.created_at && (
                      <span className="muted" style={{ display: 'block', fontSize: 10 }}>
                        {new Date(post.created_at).toLocaleDateString('vi-VN')}
                      </span>
                    )}
                  </td>

                  <td>
                    <div
                      className="table-content"
                      title={post.content}
                      style={{ cursor: 'pointer' }}
                      onClick={() => setSelectedPostId(post.id)}
                    >
                      {post.content || 'Chưa có nội dung'}
                    </div>
                  </td>
                  <td>
                    <span style={{ fontWeight: 600, color: 'var(--ink)' }}>
                      {channels.find((c) => c.id === String(post.page_id))?.name || post.page_id || 'Fanpage'}
                    </span>
                  </td>
                  <td>
                    {post.media_link ? (
                      <div
                        className="media-thumbnail-card"
                        style={{ width: 44, height: 44, cursor: 'pointer' }}
                        onClick={() => setSelectedPostId(post.id)}
                        title="Bấm để xem ảnh chi tiết"
                      >
                        {post.media_type === 'video' || post.media_link?.match(/\.mp4/i) ? (
                          <div style={{ width: '100%', height: '100%', background: '#000', display: 'grid', placeItems: 'center', color: '#fff' }}>
                            <Film size={18} />
                          </div>
                        ) : (
                          <img
                            src={resolveMediaUrl(post.media_link)}
                            alt="thumb"
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                          />
                        )}
                      </div>
                    ) : (
                      <span className="glass-pill-badge" style={{ fontSize: 11, color: 'var(--muted)' }}>
                        <FileText size={12} /> Text
                      </span>
                    )}
                  </td>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
                      <CalendarClock size={14} />
                      {formatDateTime(post.scheduled_at, 'Đăng ngay')}
                    </span>
                  </td>
                  <td>{renderStatusBadge(post)}</td>
                  <td>
                    <div className="table-tools">
                      {/* NÚT XEM CHI TIẾT */}
                      <button
                        className="button button-secondary"
                        style={{ minHeight: 28, padding: '0 8px' }}
                        onClick={() => setSelectedPostId(post.id)}
                        type="button"
                        title="Xem chi tiết & Thống kê"
                      >
                        <Eye size={13} />
                      </button>

                      {/* NÚT HỦY LỊCH (NẾU ĐANG PENDING HOẶC SCHEDULED) */}
                      {['pending', 'scheduled'].includes(post.status) && (
                        <button
                          className="button button-quiet"
                          style={{ minHeight: 28, padding: '0 8px', color: '#eab308' }}
                          onClick={() => handleCancelPost(post.id)}
                          type="button"
                          title="Hủy lịch bài đăng này"
                        >
                          <Ban size={13} />
                        </button>
                      )}

                      {/* NÚT ĐĂNG NGAY / THỬ LẠI (CHO PENDING / FAILED / CANCELLED / SCHEDULED) */}
                      {['pending', 'scheduled', 'failed', 'cancelled'].includes(post.status) && (
                        <button
                          className="button button-primary"
                          style={{ minHeight: 28, padding: '0 10px', fontSize: 11 }}
                          onClick={() => handlePublishNow(post.id)}
                          disabled={publishingId === post.id}
                          type="button"
                          title="Đưa vào hàng đợi đăng ngay"
                        >
                          <Send size={12} className={publishingId === post.id ? 'spin' : ''} />
                          {publishingId === post.id ? ' Đang gửi…' : (post.status === 'failed' ? ' Thử lại' : ' Đăng ngay')}
                        </button>
                      )}

                      {/* NÚT XÓA BÀI */}
                      {['pending', 'scheduled', 'failed', 'cancelled'].includes(post.status) && (
                        <button
                          className="button button-danger"
                          style={{ minHeight: 28, padding: '0 8px' }}
                          onClick={() => handleDelete(post.id)}
                          type="button"
                          title={`Xóa bài #${post.id}`}
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="pagination-bar">
          <span className="muted">Trang {page} / {Math.max(1, Math.ceil(total / pageSize))}</span>
          <div className="table-tools">
            <button className="button button-secondary" type="button" aria-label="Trang trước" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1 || loading}><ChevronLeft size={15} /></button>
            <button className="button button-secondary" type="button" aria-label="Trang sau" onClick={() => setPage((current) => current + 1)} disabled={page >= Math.ceil(total / pageSize) || loading}><ChevronRight size={15} /></button>
          </div>
        </div>
      </section>
    </MainLayout>
  );
}