import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  Clock,
  ExternalLink,
  Eye,
  Info,
  MessageSquare,
  Minus,
  RefreshCw,
  Share2,
  Table2,
  ThumbsUp,
  UserPlus,
  Users
} from 'lucide-react';
import MainLayout from '../../components/layout/MainLayout';
import PlatformIcon from '../../components/PlatformIcon';
import { Legend, StackedColumnChart, TrendLineChart2, formatDay, formatNumber } from '../../components/charts/ReportCharts';
import postApi from '../../services/postApi';

const RANGES = [7, 14, 30];
const PLATFORMS = [
  { id: 'facebook', label: 'Facebook' },
  { id: 'tiktok', label: 'TikTok' }
];
// Hai cách tách lượt xem (mỗi cách: 2 phần chồng nhau, cộng lại = tổng lượt xem)
const BREAKDOWNS = {
  ads: {
    label: 'Tự nhiên / Trả phí',
    series: [
      { key: 'organic', label: 'Lượt xem tự nhiên', color: 'var(--viz-1)' },
      { key: 'paid', label: 'Lượt xem trả phí', color: 'var(--viz-2)' }
    ]
  },
  followers: {
    label: 'Người theo dõi / Người lạ',
    series: [
      { key: 'fromFollowers', label: 'Từ người theo dõi', color: 'var(--viz-1)' },
      { key: 'fromNonFollowers', label: 'Từ người lạ', color: 'var(--viz-2)' }
    ]
  }
};
const VIEW_TILES = [
  { key: 'views', label: 'Lượt xem', hint: 'Số lần nội dung của Fanpage được xem (chỉ số “Lượt xem” mới của Meta).' },
  { key: 'paid', label: 'Lượt xem trả phí', hint: 'Lượt xem đến từ quảng cáo.' },
  { key: 'organic', label: 'Lượt xem tự nhiên', hint: 'Lượt xem không đến từ quảng cáo.' },
  { key: 'fromFollowers', label: 'Từ người theo dõi', hint: 'Lượt xem của người đang theo dõi Fanpage.' },
  { key: 'fromNonFollowers', label: 'Từ người lạ', hint: 'Lượt xem của người chưa theo dõi Fanpage.' }
];

function formatTime(iso) {
  if (!iso) return '—';
  const date = new Date(iso);
  return `${date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}, ${date.toLocaleDateString('vi-VN')}`;
}

// % thay đổi so với kỳ trước: { text, dir: 'up' | 'down' | 'flat' } hoặc null khi không so được
function changeOf(current, previous) {
  if (current === null || current === undefined || previous === null || previous === undefined) return null;
  if (previous === 0) return current > 0 ? { text: 'mới', dir: 'up' } : { text: '0%', dir: 'flat' };
  const percent = ((current - previous) / previous) * 100;
  const rounded = Math.abs(percent) < 10 ? percent.toFixed(1) : Math.round(percent).toString();
  return { text: `${percent > 0 ? '+' : ''}${rounded.replace('.', ',')}%`, dir: percent > 0.05 ? 'up' : percent < -0.05 ? 'down' : 'flat' };
}

function Change({ change, days }) {
  if (!change) return null;
  const Icon = change.dir === 'up' ? ArrowUpRight : change.dir === 'down' ? ArrowDownRight : Minus;
  return (
    <span className={`report-change is-${change.dir}`} title={`So với ${days} ngày trước đó`}>
      <Icon size={13} aria-hidden="true" /> {change.text}
    </span>
  );
}

function StatTile({ label, hint, value, previous, days, unavailable }) {
  return (
    <div className="report-tile">
      <span className="report-tile-label">
        {label}
        {hint && <span className="report-hint" title={hint} aria-label={hint} role="img"><Info size={12} aria-hidden="true" /></span>}
      </span>
      <strong className="report-tile-value">{unavailable ? '—' : formatNumber(value)}</strong>
      {unavailable
        ? <small className="report-tile-note">Chưa có số liệu</small>
        : <Change change={changeOf(value, previous)} days={days} />}
    </div>
  );
}

function MiniCard({ icon: Icon, title, value, previous, days, data, valueKey, available, note, kind = 'line' }) {
  return (
    <section className="panel report-mini">
      <div className="report-mini-head">
        <h3><Icon size={15} aria-hidden="true" /> {title}</h3>
        {available && <Change change={changeOf(value, previous)} days={days} />}
      </div>
      <strong className="report-mini-value">{available ? formatNumber(value) : '—'}</strong>
      {note && <p className="report-mini-note">{note}</p>}
      {available ? (
        kind === 'column'
          ? <StackedColumnChart data={data} series={[{ key: valueKey, label: title, color: 'var(--viz-1)' }]} height={170} ariaLabel={`${title} theo ngày`} />
          : <TrendLineChart2 data={data} valueKey={valueKey} label={title} height={170} ariaLabel={`${title} theo ngày`} />
      ) : (
        <p className="report-empty">Facebook chưa trả số liệu này cho Fanpage đã chọn.</p>
      )}
    </section>
  );
}

function TopPosts({ posts, loading }) {
  if (loading) return <p className="report-empty">Đang tải bài viết…</p>;
  if (!posts.length) return <p className="report-empty">Chưa có bài viết nào trong khoảng thời gian này.</p>;
  return (
    <div className="report-table-wrap">
      <table className="report-table">
        <thead>
          <tr>
            <th scope="col">Bài viết</th>
            <th scope="col">Fanpage</th>
            <th scope="col">Ngày đăng</th>
            <th scope="col" className="num">Lượt xem</th>
            <th scope="col" className="num">Tương tác</th>
            <th scope="col"><span className="fb-sr-only">Mở bài</span></th>
          </tr>
        </thead>
        <tbody>
          {posts.slice(0, 10).map((post) => (
            <tr key={post.id}>
              <td>
                <div className="report-post">
                  {post.full_picture ? <img src={post.full_picture} alt="" width={40} height={40} /> : <span className="report-post-thumb" aria-hidden="true" />}
                  <span title={post.message}>{post.message || '(Không có nội dung chữ)'}</span>
                </div>
              </td>
              <td>{post.pageName}</td>
              <td>{post.created_time ? new Date(post.created_time).toLocaleDateString('vi-VN') : '—'}</td>
              <td className="num">{post.platform === 'tiktok' || !post.views ? '—' : formatNumber(post.views)}</td>
              <td className="num">
                <span className="report-engage" title={`${post.reactions || 0} cảm xúc · ${post.comments || 0} bình luận · ${post.shares || 0} chia sẻ`}>
                  <ThumbsUp size={12} aria-hidden="true" /> {post.reactions || 0}
                  <MessageSquare size={12} aria-hidden="true" /> {post.comments || 0}
                  <Share2 size={12} aria-hidden="true" /> {post.shares || 0}
                </span>
              </td>
              <td>{post.permalink_url && <a href={post.permalink_url} target="_blank" rel="noreferrer" className="icon-button" aria-label="Mở bài trên Facebook"><ExternalLink size={14} /></a>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ReportPage() {
  const [platform, setPlatform] = useState('facebook');
  const [days, setDays] = useState(14);
  const [pageId, setPageId] = useState('all');
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [breakdown, setBreakdown] = useState('ads');
  const [showTable, setShowTable] = useState(false);
  const [insights, setInsights] = useState({ topPosts: [], tiktok: null });
  const [insightsLoading, setInsightsLoading] = useState(true);
  const [stats, setStats] = useState(null);

  const load = async (refresh = false) => {
    setLoading(true);
    setError('');
    try {
      const res = await postApi.getOverview(days, pageId, refresh);
      setOverview(res);
    } catch (err) {
      setError(err.response?.data?.message || (err.code === 'ECONNABORTED' ? 'Facebook phản hồi quá lâu — thử lại sau ít phút.' : 'Không tải được báo cáo.'));
    } finally {
      setLoading(false);
    }
  };

  const loadInsights = async () => {
    setInsightsLoading(true);
    try {
      const res = await postApi.getInsights(days, pageId);
      setInsights({ topPosts: Array.isArray(res.topPosts) ? res.topPosts : [], tiktok: res.summary?.tiktok || null });
    } catch {
      setInsights({ topPosts: [], tiktok: null });
    } finally {
      setInsightsLoading(false);
    }
  };

  useEffect(() => {
    load();
    loadInsights();
  }, [days, pageId]);

  useEffect(() => {
    postApi.getStats().then((res) => setStats(res.stats || null)).catch(() => {});
  }, []);

  const available = overview?.available || {};
  const totals = overview?.totals || {};
  const previous = overview?.previous || {};
  const series = overview?.series || [];
  const pagesList = overview?.pagesList || [];
  const pageResults = overview?.pages || [];
  const okPages = pageResults.filter((page) => page.ok).length;
  const failedPages = pageResults.filter((page) => !page.ok);

  // Biểu đồ chính: tách theo nguồn nếu Facebook trả số liệu theo ngày, không thì cột tổng lượt xem
  const breakdownReady = (key) => BREAKDOWNS[key].series.every((item) => available[item.key] === true);
  const activeBreakdown = breakdownReady(breakdown) ? breakdown : (breakdownReady('ads') ? 'ads' : breakdownReady('followers') ? 'followers' : null);
  const chartSeries = activeBreakdown ? BREAKDOWNS[activeBreakdown].series : [{ key: 'views', label: 'Lượt xem', color: 'var(--viz-1)' }];
  const tableRows = useMemo(() => [...series].reverse(), [series]);

  const rangeText = overview?.range ? `${formatDay(overview.range.since, true)} – ${formatDay(overview.range.until, true)}` : '';

  return (
    <MainLayout
      title="Báo cáo kênh"
      actions={
        <div className="report-toolbar">
          {platform === 'facebook' && pagesList.length > 0 && (
            <select className="field report-select" value={pageId} onChange={(event) => setPageId(event.target.value)} aria-label="Chọn Fanpage">
              <option value="all">Tất cả Fanpage ({pagesList.length})</option>
              {pagesList.map((page) => <option key={page.id} value={page.id}>{page.name}</option>)}
            </select>
          )}
          <div className="report-range" role="radiogroup" aria-label="Khoảng thời gian">
            <CalendarDays size={14} aria-hidden="true" />
            {RANGES.map((range) => (
              <button key={range} type="button" role="radio" aria-checked={days === range} className={days === range ? 'is-active' : ''} onClick={() => setDays(range)}>
                {range}D
              </button>
            ))}
          </div>
          <button type="button" className="button button-secondary" onClick={() => { load(true); loadInsights(); }} disabled={loading} title="Lấy số liệu mới nhất từ Facebook">
            <RefreshCw size={14} className={loading ? 'spin' : ''} /> Làm mới
          </button>
        </div>
      }
    >
      <div className="report-page">
        <div className="report-platforms" role="tablist" aria-label="Nền tảng">
          {PLATFORMS.map((item) => (
            <button key={item.id} type="button" role="tab" aria-selected={platform === item.id} className={platform === item.id ? 'is-active' : ''} onClick={() => setPlatform(item.id)}>
              <PlatformIcon platform={item.id} size={20} />
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        {platform === 'tiktok' ? (
          <section className="panel report-section">
            <h2 className="report-section-title">TikTok</h2>
            <div className="report-tiles report-tiles-2">
              <StatTile label="Video TikTok đã đăng" value={insights.tiktok?.totalPosts ?? null} days={days} unavailable={insightsLoading || !insights.tiktok} />
              <StatTile label="Tài khoản TikTok" value={insights.tiktok?.totalAccounts ?? null} days={days} unavailable={insightsLoading || !insights.tiktok} />
            </div>
            <p className="report-note">
              <Info size={14} aria-hidden="true" /> Tool đăng TikTok bằng trình duyệt tự động (không qua API chính thức) nên chưa đọc được lượt xem TikTok. Số liệu trên là video tool đã đăng trong {days} ngày.
            </p>
          </section>
        ) : (
          <>
            {overview?.available === false ? (
              <section className="panel report-section report-empty-state">
                <p>{overview.message || 'Chưa có Fanpage nào được kết nối.'}</p>
                <Link href="/channels" className="button button-primary">Kết nối Facebook</Link>
              </section>
            ) : (
              <>
                <div className="report-status" aria-live="polite">
                  <span><Clock size={13} aria-hidden="true" /> Cập nhật lần cuối: <strong>{loading && !overview ? 'đang tải…' : formatTime(overview?.updatedAt)}</strong></span>
                  {pageResults.length > 0 && (
                    <span className={`report-status-pill ${failedPages.length ? 'is-warn' : 'is-ok'}`}>
                      <i aria-hidden="true" /> {okPages}/{pageResults.length} Fanpage cập nhật thành công
                    </span>
                  )}
                  {rangeText && <span>{rangeText}</span>}
                  <span className="report-status-next">Lần cập nhật tiếp theo: <strong>{formatTime(overview?.nextUpdateAt)}</strong></span>
                </div>

                {error && <div className="notice channel-error" role="alert"><AlertTriangle size={15} /> <span>{error}</span></div>}
                {failedPages.length > 0 && (
                  <details className="report-warning">
                    <summary><AlertTriangle size={14} aria-hidden="true" /> {failedPages.length} Fanpage chưa lấy được số liệu — bấm để xem lý do</summary>
                    <ul>
                      {failedPages.map((page) => <li key={page.id}><strong>{page.name}</strong>: {page.error}</li>)}
                    </ul>
                    <p>Thường do token Fanpage hết hạn hoặc thiếu quyền <code>read_insights</code> — vào <Link href="/channels">Kênh</Link> bấm “Cấp thêm quyền” / “Kết nối lại Facebook”.</p>
                  </details>
                )}

                <section className="panel report-section">
                  <div className="report-section-head">
                    <h2 className="report-section-title"><Eye size={16} aria-hidden="true" /> Lượt xem</h2>
                    <div className="report-section-tools">
                      {(breakdownReady('ads') || breakdownReady('followers')) && (
                        <div className="report-segment" role="radiogroup" aria-label="Tách lượt xem theo">
                          {Object.entries(BREAKDOWNS).map(([key, item]) => (
                            <button key={key} type="button" role="radio" aria-checked={activeBreakdown === key} disabled={!breakdownReady(key)} className={activeBreakdown === key ? 'is-active' : ''} onClick={() => setBreakdown(key)}>
                              {item.label}
                            </button>
                          ))}
                        </div>
                      )}
                      <button type="button" className="button button-quiet report-table-toggle" onClick={() => setShowTable((value) => !value)} aria-pressed={showTable}>
                        <Table2 size={14} /> {showTable ? 'Xem biểu đồ' : 'Xem bảng số liệu'}
                      </button>
                    </div>
                  </div>

                  <div className="report-tiles">
                    {VIEW_TILES.map((tile) => (
                      <StatTile
                        key={tile.key}
                        label={tile.label}
                        hint={tile.hint}
                        value={totals[tile.key]}
                        previous={previous[tile.key]}
                        days={days}
                        unavailable={loading && !overview ? true : !available[tile.key]}
                      />
                    ))}
                  </div>

                  {loading && !overview ? (
                    <div className="report-skeleton" aria-hidden="true" />
                  ) : !available.views ? (
                    <p className="report-empty">Facebook chưa trả số liệu lượt xem. Kiểm tra token Fanpage có quyền <code>read_insights</code>.</p>
                  ) : showTable ? (
                    <div className="report-table-wrap">
                      <table className="report-table">
                        <thead>
                          <tr>
                            <th scope="col">Ngày</th>
                            <th scope="col" className="num">Lượt xem</th>
                            {chartSeries.length > 1 && chartSeries.map((item) => <th key={item.key} scope="col" className="num">{item.label}</th>)}
                            <th scope="col" className="num">Người xem</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tableRows.map((row) => (
                            <tr key={row.date}>
                              <td>{formatDay(row.date, true)}</td>
                              <td className="num">{formatNumber(row.views)}</td>
                              {chartSeries.length > 1 && chartSeries.map((item) => <td key={item.key} className="num">{formatNumber(row[item.key])}</td>)}
                              <td className="num">{formatNumber(row.viewers)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <>
                      <Legend series={chartSeries} />
                      <StackedColumnChart data={series} series={chartSeries} height={280} totalLabel="Tổng lượt xem" ariaLabel={`Lượt xem theo ngày, ${rangeText}`} />
                      {!activeBreakdown && (
                        <p className="report-note"><Info size={14} aria-hidden="true" /> Facebook chưa trả số liệu tách theo nguồn theo từng ngày cho Fanpage này — biểu đồ hiện tổng lượt xem.</p>
                      )}
                    </>
                  )}
                </section>

                <div className="report-grid">
                  <MiniCard icon={Users} title="Người xem" value={totals.viewers} previous={previous.viewers} days={days} data={series} valueKey="viewers" available={available.viewers === true}
                    note={pageId === 'all' && pagesList.length > 1 ? 'Cộng số người xem của từng Fanpage (một người xem nhiều Fanpage được tính nhiều lần).' : null} />
                  <MiniCard icon={ThumbsUp} title="Tương tác" value={totals.engagements} previous={previous.engagements} days={days} data={series} valueKey="engagements" available={available.engagements === true} />
                  <MiniCard icon={UserPlus} title="Người theo dõi mới" value={totals.newFollows} previous={previous.newFollows} days={days} data={series} valueKey="newFollows" available={available.newFollows === true} kind="column"
                    note={available.followers ? `Tổng người theo dõi: ${formatNumber(totals.followers)}` : null} />
                  <MiniCard icon={CalendarDays} title="Bài đã đăng qua tool" value={totals.posts} previous={previous.posts} days={days} data={series} valueKey="posts" available={available.posts === true} kind="column" />
                </div>

                <section className="panel report-section">
                  <div className="report-section-head">
                    <h2 className="report-section-title">Bài viết nổi bật</h2>
                    <Link href="/post-planner/list" className="button button-quiet">Tất cả bài đăng</Link>
                  </div>
                  <TopPosts posts={insights.topPosts} loading={insightsLoading} />
                </section>
              </>
            )}
          </>
        )}

        {stats && (
          <section className="report-system">
            <span>Bài trong hệ thống:</span>
            <span className="status-pill">{formatNumber(stats.total)} tổng</span>
            <span className="status-pill pending">{formatNumber(stats.pending)} chờ đăng</span>
            <span className="status-pill published">{formatNumber(stats.published)} đã đăng</span>
            <span className="status-pill failed">{formatNumber(stats.failed)} lỗi</span>
          </section>
        )}
      </div>
    </MainLayout>
  );
}
