import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import MainLayout from '../../components/layout/MainLayout';
import postApi from '../../services/postApi';
import {
  CalendarDays,
  Eye,
  FileSpreadsheet,
  Send,
  ThumbsUp,
  MessageSquare,
  Share2,
  TrendingUp,
  BarChart3,
  ExternalLink,
  RefreshCw,
  Globe2,
  Sparkles,
  ShieldAlert
} from 'lucide-react';

export default function DashboardPage() {
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    published: 0,
    failed: 0
  });
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(14);
  const [selectedPageId, setSelectedPageId] = useState('all');
  const [pagesList, setPagesList] = useState([]);
  const [chartMode, setChartMode] = useState('engagements'); // 'engagements' | 'views' | 'reactions'

  const [reportData, setReportData] = useState({
    summary: {
      totalViews: 0,
      totalEngagements: 0,
      totalReactions: 0,
      totalComments: 0,
      totalShares: 0,
      totalPosts: 0,
      avgEngagementPerPost: 0
    },
    chartData: [],
    topPosts: []
  });
  const [reportLoading, setReportLoading] = useState(true);

  // Load tổng quan trạng thái bài đăng
  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        const data = await postApi.getStats();
        setStats(data.stats);
      } catch (err) {
        console.error('Lỗi tải thông tin Dashboard:', err);
      } finally {
        setLoading(false);
      }
    };
    loadDashboardData();
  }, []);

  // Load báo cáo tương tác bài viết theo Page và chu kỳ (7D, 14D, 30D)
  const fetchReport = async () => {
    setReportLoading(true);
    try {
      const result = await postApi.getInsights(period, selectedPageId);
      if (result.success) {
        setReportData({
          summary: result.summary || {
            totalViews: 0,
            totalEngagements: 0,
            totalReactions: 0,
            totalComments: 0,
            totalShares: 0,
            totalPosts: 0,
            avgEngagementPerPost: 0
          },
          chartData: Array.isArray(result.chartData) ? result.chartData : [],
          topPosts: Array.isArray(result.topPosts) ? result.topPosts : [],
          tokenExpired: Boolean(result.tokenExpired),
          tokenErrorMessage: result.tokenErrorMessage || '',
          expiredPages: result.expiredPages || []
        });
        if (Array.isArray(result.pages) && result.pages.length > 0) {
          setPagesList(result.pages);
        }
      }
    } catch (error) {
      console.warn('Lỗi tải báo cáo bài viết:', error);
      const isTimeout = error.code === 'ECONNABORTED' || error.message?.includes('timeout');
      setReportData((prev) => ({
        ...prev,
        tokenExpired: true,
        tokenErrorMessage: isTimeout
          ? 'Kết nối tới Facebook API bị quá hạn thời gian (Timeout). Điều này xảy ra do Token của Fanpage đã hết hạn phiên hoặc mạng phản hồi chậm. Vui lòng bấm "Làm mới" hoặc cập nhật Token.'
          : (error.response?.data?.message || 'Không thể đồng bộ số liệu từ Facebook.')
      }));
    } finally {
      setReportLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [period, selectedPageId]);

  // Chuẩn bị dữ liệu cho biểu đồ cột
  const chartItems = reportData.chartData || [];
  const chartValues = chartItems.map((item) => {
    if (chartMode === 'views') return item.views || 0;
    if (chartMode === 'reactions') return item.reactions || 0;
    return item.engagements || 0;
  });
  const maxChartValue = Math.max(1, ...chartValues);
  const chartLabels = chartItems.length > 0
    ? [0, Math.floor((chartItems.length - 1) / 2), chartItems.length - 1].map((idx) => chartItems[idx]?.date || '')
    : [];

  const summary = reportData.summary;

  return (
    <MainLayout
      title="Báo cáo & Phân tích Bài viết"
      actions={
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Bộ chọn Fanpage */}
          {pagesList.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Globe2 size={15} style={{ color: '#38bdf8' }} />
              <select
                className="field"
                style={{ minHeight: 36, padding: '4px 12px', fontSize: 12.5, width: 'auto', minWidth: 160 }}
                value={selectedPageId}
                onChange={(e) => setSelectedPageId(e.target.value)}
              >
                <option value="all">Tất cả Fanpage ({pagesList.length})</option>
                {pagesList.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}

          <button
            className="button button-secondary"
            type="button"
            onClick={fetchReport}
            disabled={reportLoading}
            style={{ minHeight: 36, padding: '0 12px', fontSize: 12.5 }}
          >
            <RefreshCw size={13} className={reportLoading ? 'animate-spin' : ''} /> Làm mới
          </button>
        </div>
      }
    >
      {/* CẢNH BÁO NẾU TOKEN BỊ HẾT HẠN */}
      {reportData.tokenExpired && (
        <div style={{
          marginBottom: 20,
          padding: '16px 20px',
          borderRadius: 12,
          background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.16), rgba(185, 28, 28, 0.08))',
          border: '1px solid rgba(239, 68, 68, 0.4)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 16,
          flexWrap: 'wrap'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <ShieldAlert size={26} style={{ color: '#dc2626', flexShrink: 0 }} />
            <div>
              <strong style={{ color: 'var(--ink)', fontSize: 13.5, display: 'block', marginBottom: 3 }}>
                Token Facebook đã hết hạn phiên đăng nhập!
              </strong>
              <span style={{ color: '#b91c1c', fontSize: 12, lineHeight: 1.5 }}>
                {reportData.tokenErrorMessage || 'Facebook từ chối trả về dữ liệu tương tác vì Token của Fanpage đã hết hạn. Hãy cập nhật lại Token mới.'}
              </span>
            </div>
          </div>
          <Link
            href="/channels"
            className="button button-primary"
            style={{ textDecoration: 'none', whiteSpace: 'nowrap', fontSize: 12, padding: '0 14px', minHeight: 34 }}
          >
            Cập nhật Token ngay
          </Link>
        </div>
      )}

      {/* ═══ 4 THẺ CHỈ SỐ TỔNG HỢP BÀI VIẾT ═══ */}
      <section className="metric-grid" style={{ marginBottom: 22 }}>
        {/* Thẻ 1: Lượt xem bài viết */}
        <article className="panel metric-card" style={{ borderTop: '2px solid var(--blue)' }}>
          <div className="metric-label" style={{ color: 'var(--blue)' }}>
            <Eye size={16} /> Lượt xem bài viết
          </div>
          <div className="metric-value">
            {reportLoading ? '—' : summary.totalViews.toLocaleString('vi-VN')}
          </div>
          <div className="metric-foot">Lượt tiếp cận & hiển thị bài đăng ({period} ngày)</div>
        </article>

        {/* Thẻ 2: Tổng tương tác */}
        <article className="panel metric-card" style={{ borderTop: '2px solid #2563eb' }}>
          <div className="metric-label" style={{ color: '#2563eb' }}>
            <TrendingUp size={16} /> Tổng tương tác bài viết
          </div>
          <div className="metric-value">
            {reportLoading ? '—' : summary.totalEngagements.toLocaleString('vi-VN')}
          </div>
          <div className="metric-foot">
            Cảm xúc + Bình luận + Chia sẻ ({period} ngày)
          </div>
        </article>

        {/* Thẻ 3: Cảm xúc & Bình luận */}
        <article className="panel metric-card" style={{ borderTop: '2px solid #059669' }}>
          <div className="metric-label" style={{ color: '#059669' }}>
            <ThumbsUp size={16} /> Cảm xúc & Bình luận
          </div>
          <div className="metric-value">
            {reportLoading ? '—' : `${summary.totalReactions} / ${summary.totalComments}`}
          </div>
          <div className="metric-foot">
            {summary.totalReactions} lượt thích · {summary.totalComments} bình luận · {summary.totalShares} chia sẻ
          </div>
        </article>

        {/* Thẻ 4: Hiệu suất & Tần suất bài */}
        <article className="panel metric-card" style={{ borderTop: '2px solid #d97706' }}>
          <div className="metric-label" style={{ color: '#d97706' }}>
            <BarChart3 size={16} /> Hiệu suất trung bình
          </div>
          <div className="metric-value">
            {reportLoading ? '—' : `${summary.avgEngagementPerPost}`}
          </div>
          <div className="metric-foot">
            Tương tác trung bình / {summary.totalPosts} bài đăng đã xuất bản
          </div>
        </article>
      </section>

      {/* ═══ BIỂU ĐỒ TỔNG HỢP LƯỢT XEM & TƯƠNG TÁC BÀI VIẾT ═══ */}
      <section className="panel" style={{ marginBottom: 22 }}>
        <div className="panel-heading" style={{ flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h2>
              <BarChart3 size={17} style={{ verticalAlign: 'middle', marginRight: 6, color: '#38bdf8' }} />
              Tổng hợp Lượt xem & Tương tác bài viết
            </h2>
            {/* Chế độ xem biểu đồ */}
            <div style={{ display: 'inline-flex', background: 'rgba(0, 0, 0, 0.04)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', border: '1px solid var(--line)', borderRadius: 10, padding: 3, gap: 2 }}>
              <button
                type="button"
                onClick={() => setChartMode('engagements')}
                style={{
                  background: chartMode === 'engagements' ? 'rgba(37, 99, 235, 0.15)' : 'transparent',
                  border: chartMode === 'engagements' ? '1px solid rgba(37, 99, 235, 0.35)' : '1px solid transparent',
                  color: chartMode === 'engagements' ? 'var(--blue)' : 'var(--muted)',
                  fontSize: 11.5,
                  fontWeight: 700,
                  padding: '5px 12px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  boxShadow: chartMode === 'engagements' ? '0 2px 6px rgba(37, 99, 235, 0.12)' : 'none'
                }}
              >
                Tương tác ({summary.totalEngagements})
              </button>
              <button
                type="button"
                onClick={() => setChartMode('views')}
                style={{
                  background: chartMode === 'views' ? 'rgba(37, 99, 235, 0.15)' : 'transparent',
                  border: chartMode === 'views' ? '1px solid rgba(37, 99, 235, 0.35)' : '1px solid transparent',
                  color: chartMode === 'views' ? 'var(--blue)' : 'var(--muted)',
                  fontSize: 11.5,
                  fontWeight: 700,
                  padding: '5px 12px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  boxShadow: chartMode === 'views' ? '0 2px 6px rgba(37, 99, 235, 0.12)' : 'none'
                }}
              >
                Lượt xem ({summary.totalViews})
              </button>
              <button
                type="button"
                onClick={() => setChartMode('reactions')}
                style={{
                  background: chartMode === 'reactions' ? 'rgba(37, 99, 235, 0.15)' : 'transparent',
                  border: chartMode === 'reactions' ? '1px solid rgba(37, 99, 235, 0.35)' : '1px solid transparent',
                  color: chartMode === 'reactions' ? 'var(--blue)' : 'var(--muted)',
                  fontSize: 11.5,
                  fontWeight: 700,
                  padding: '5px 12px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  boxShadow: chartMode === 'reactions' ? '0 2px 6px rgba(37, 99, 235, 0.12)' : 'none'
                }}
              >
                Cảm xúc ({summary.totalReactions})
              </button>
            </div>
          </div>

          {/* Bộ lọc khoảng thời gian 7D, 14D, 30D */}
          <div className="report-filter">
            {[7, 14, 30].map((val) => (
              <button
                className={`segment-button${period === val ? ' is-selected' : ''}`}
                key={val}
                onClick={() => setPeriod(val)}
                type="button"
              >
                {val}D
              </button>
            ))}
          </div>
        </div>

        <div className="report-note" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>
            Dữ liệu tổng hợp từ các bài viết trên Fanpage trong {period} ngày qua · {chartItems.length} mốc ngày
          </span>
          <span style={{ color: '#38bdf8', fontWeight: 600 }}>
            {selectedPageId === 'all' ? 'Tất cả Fanpage' : (pagesList.find((p) => p.id === selectedPageId)?.name || 'Fanpage')}
          </span>
        </div>

        <div className="chart-area" style={{ padding: '20px 22px' }}>
          <div className="chart-grid" style={{ minHeight: 180, display: 'flex', alignItems: 'flex-end', gap: 6, height: 180 }}>
            {reportLoading ? (
              <div className="chart-empty" style={{ margin: 'auto' }}>Đang tổng hợp dữ liệu bài viết…</div>
            ) : chartItems.length === 0 ? (
              <div className="chart-empty" style={{ margin: 'auto' }}>Chưa có bài viết nào trong khoảng thời gian này.</div>
            ) : (
              chartItems.map((item, index) => {
                const val = chartMode === 'views' ? item.views : chartMode === 'reactions' ? item.reactions : item.engagements;
                const barHeight = Math.max(6, Math.round((val / maxChartValue) * 100));
                return (
                  <div
                    className="chart-column"
                    key={`${item.fullDate}-${index}`}
                    style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}
                    title={`Ngày ${item.date} (${item.fullDate}):\n- ${val} ${chartMode === 'views' ? 'lượt xem' : chartMode === 'reactions' ? 'cảm xúc' : 'lượt tương tác'}\n- ${item.postsCount} bài viết\n- ${item.reactions} like · ${item.comments} cmt · ${item.shares} share`}
                  >
                    <div
                      className="chart-bar"
                      style={{
                        height: `${barHeight}%`,
                        width: '100%',
                        maxWidth: 32,
                        background: val > 0 ? 'linear-gradient(180deg, #38bdf8 0%, #1e40af 100%)' : 'rgba(255, 255, 255, 0.06)',
                        borderRadius: '6px 6px 0 0',
                        boxShadow: val > 0 ? '0 0 12px rgba(56, 189, 248, 0.4)' : 'none',
                        transition: 'height .3s ease'
                      }}
                    />
                    <span style={{ fontSize: 9.5, color: 'var(--muted)', marginTop: 6, whiteSpace: 'nowrap' }}>
                      {item.date}
                    </span>
                  </div>
                );
              })
            )}
          </div>
          <div className="chart-labels" style={{ marginTop: 10 }}>
            {chartLabels.map((label, index) => (
              <span key={`${label}-${index}`}>{label}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ TOP BÀI VIẾT TƯƠNG TÁC CAO NHẤT ═══ */}
      <section className="panel" style={{ marginBottom: 22 }}>
        <div className="panel-heading">
          <h2>
            <Sparkles size={16} style={{ verticalAlign: 'middle', marginRight: 6, color: '#f59e0b' }} />
            Top bài viết hiệu quả nhất của Fanpage
          </h2>
          <span className="muted" style={{ fontSize: 12 }}>
            Sắp xếp theo lượt tương tác ({reportData.topPosts.length} bài)
          </span>
        </div>
        <div className="panel-body" style={{ padding: 0 }}>
          {reportLoading ? (
            <div className="empty-state" style={{ padding: 30 }}>Đang tải bài viết…</div>
          ) : reportData.topPosts.length === 0 ? (
            <div className="empty-state" style={{ padding: 30 }}>Chưa có bài viết nào được đăng trong chu kỳ này.</div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: 50 }}>#</th>
                    <th>Nội dung bài viết</th>
                    <th>Fanpage</th>
                    <th>Ngày đăng</th>
                    <th style={{ textAlign: 'center' }}>Lượt xem</th>
                    <th style={{ textAlign: 'center' }}>Cảm xúc</th>
                    <th style={{ textAlign: 'center' }}>Bình luận</th>
                    <th style={{ textAlign: 'center' }}>Chia sẻ</th>
                    <th style={{ textAlign: 'center' }}>Tổng tương tác</th>
                    <th style={{ textAlign: 'center' }}>Xem</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.topPosts.map((post, idx) => (
                    <tr key={post.id}>
                      <td>
                        <strong style={{ color: idx === 0 ? '#f59e0b' : idx === 1 ? '#94a3b8' : idx === 2 ? '#b45309' : '#64748b', fontSize: 13 }}>
                          #{idx + 1}
                        </strong>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, maxWidth: 360 }}>
                          {post.full_picture && (
                            <img
                              src={post.full_picture}
                              alt=""
                              style={{ width: 38, height: 38, borderRadius: 8, objectFit: 'cover', flexShrink: 0, border: '1px solid rgba(255,255,255,0.1)' }}
                            />
                          )}
                          <div style={{ overflow: 'hidden' }}>
                            <div
                              style={{
                                fontSize: 12.5,
                                color: 'var(--ink)',
                                fontWeight: 600,
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis'
                              }}
                              title={post.message}
                            >
                              {post.message}
                            </div>
                            <small className="muted" style={{ fontSize: 10.5 }}>ID: {post.id}</small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--blue)' }}>{post.pageName}</span>
                      </td>
                      <td>
                        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                          {post.created_time ? new Date(post.created_time).toLocaleDateString('vi-VN') : '—'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{ fontWeight: 700, color: 'var(--ink)', fontSize: 12.5 }}>
                          {post.views ? post.views.toLocaleString('vi-VN') : '—'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{ color: 'var(--blue)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                          <ThumbsUp size={11} /> {post.reactions}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{ color: '#059669', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                          <MessageSquare size={11} /> {post.comments}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{ color: '#7c3aed', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                          <Share2 size={11} /> {post.shares}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{
                          background: 'rgba(56, 189, 248, 0.15)',
                          border: '1px solid rgba(56, 189, 248, 0.35)',
                          color: '#38bdf8',
                          padding: '3px 10px',
                          borderRadius: 99,
                          fontWeight: 800,
                          fontSize: 12
                        }}>
                          {post.engagements}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {post.permalink_url ? (
                          <a
                            href={post.permalink_url}
                            target="_blank"
                            rel="noreferrer"
                            className="button button-quiet"
                            style={{ minHeight: 26, padding: '0 8px', fontSize: 11 }}
                            title="Xem trên Facebook"
                          >
                            <ExternalLink size={12} />
                          </a>
                        ) : (
                          <span className="muted" style={{ fontSize: 11 }}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* ═══ TRẠNG THÁI LỊCH ĐĂNG & TÁC VỤ NHANH ═══ */}
      <div className="home-columns">
        <section className="panel">
          <div className="panel-heading">
            <h2>Trạng thái lịch đăng trong hệ thống</h2>
          </div>
          <div className="panel-body">
            <div style={{ display: 'flex', height: 10, overflow: 'hidden', borderRadius: 8, background: 'rgba(255, 255, 255, 0.06)', border: '1px solid var(--line)' }}>
              <span style={{ width: `${stats.total ? (stats.published / stats.total) * 100 : 0}%`, background: 'var(--green)' }} />
              <span style={{ width: `${stats.total ? (stats.pending / stats.total) * 100 : 0}%`, background: '#f59e0b' }} />
              <span style={{ width: `${stats.total ? (stats.failed / stats.total) * 100 : 0}%`, background: 'var(--red)' }} />
            </div>
            <p className="muted" style={{ marginTop: 10, marginBottom: 0 }}>
              {stats.total ? Math.round((stats.published / stats.total) * 100) : 0}% bài đăng đã xuất bản thành công ({stats.published}/{stats.total})
            </p>
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <h2>Tác vụ nhanh</h2>
          </div>
          <div className="panel-body quick-links">
            <Link className="quick-link" href="/post-planner/compose" prefetch={true}>
              <span className="quick-icon"><Send size={17} /></span>
              <span><strong>Viết bài mới</strong><small>Tạo nội dung & lên lịch</small></span>
            </Link>
            <Link className="quick-link" href="/post-planner/bulk-upload" prefetch={true}>
              <span className="quick-icon"><FileSpreadsheet size={17} /></span>
              <span><strong>Tải Excel</strong><small>Lên lịch hàng loạt từ file</small></span>
            </Link>
          </div>
        </section>
      </div>
    </MainLayout>
  );
}