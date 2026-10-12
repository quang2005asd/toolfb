import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { CheckCircle2, ChevronLeft, ChevronRight, List, Plus, X } from 'lucide-react';
import MainLayout from '../../components/layout/MainLayout';
import postApi from '../../services/postApi';

const weekdays = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];
const REFRESH_MS = 20000;

// Thông báo sau khi trang soạn bài chuyển sang (query: created, posts, failed, date, mode)
function buildCreatedNotice({ created, posts, failed, date, mode }) {
  const rows = Number(created) || 0;
  const postCount = Number(posts) || 1;
  const failedCount = Number(failed) || 0;
  const day = date ? new Date(`${date}T00:00:00`).toLocaleDateString('vi-VN') : '';
  let text;
  if (postCount > 1) {
    text = mode === 'now'
      ? `Đã gửi đăng ngay ${postCount} bài riêng lẻ (${rows} lượt đăng trên các Fanpage).`
      : `Đã lên lịch ${postCount} bài riêng lẻ (${rows} lượt đăng), bắt đầu từ ngày ${day}.`;
  } else {
    text = mode === 'now'
      ? `Đã gửi yêu cầu đăng ngay lên ${rows} Fanpage. Trạng thái sẽ tự cập nhật trên lịch.`
      : `Đã lên lịch bài viết cho ${rows} Fanpage vào ngày ${day}.`;
  }
  if (failedCount > 0) text += ` ${failedCount} bài không lên lịch được, hãy kiểm tra lại Fanpage.`;
  return text;
}

export default function CalendarPage() {
  const router = useRouter();
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [posts, setPosts] = useState([]);
  const [error, setError] = useState('');
  const [createdNotice, setCreatedNotice] = useState('');
  const [highlightDay, setHighlightDay] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = () => postApi.getPostsList({ limit: 100 })
      .then((data) => { if (!cancelled) { setPosts(data.posts || []); setError(''); } })
      .catch((requestError) => { if (!cancelled) setError(requestError.response?.data?.message || 'Không thể tải lịch đăng.'); });
    load();
    // Tự làm mới để thấy bài chuyển từ "chờ đăng" sang "đã đăng"
    const timer = setInterval(() => { if (document.visibilityState === 'visible') load(); }, REFRESH_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (!router.isReady || !router.query.created) return;
    const { date } = router.query;
    setCreatedNotice(buildCreatedNotice(router.query));
    if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const target = new Date(`${date}T00:00:00`);
      if (!Number.isNaN(target.getTime())) {
        setCurrentMonth(new Date(target.getFullYear(), target.getMonth(), 1));
        setHighlightDay(date);
      }
    }
    // Xóa query để tải lại trang không hiện lại thông báo
    router.replace('/post-planner/calendar', undefined, { shallow: true });
  }, [router.isReady, router.query.created]);

  const cells = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const offset = (firstDay.getDay() + 6) % 7;
    const dayCount = new Date(year, month + 1, 0).getDate();
    const totalCells = Math.ceil((offset + dayCount) / 7) * 7;
    return Array.from({ length: totalCells }, (_, index) => {
      const date = new Date(year, month, index - offset + 1);
      return { date, inMonth: date.getMonth() === month };
    });
  }, [currentMonth]);

  const postsByDay = useMemo(() => posts.reduce((groups, post) => {
    if (!post.scheduled_at) return groups;
    const num = Number(post.scheduled_at);
    const d = (!Number.isNaN(num) && num > 100000000000) ? new Date(num) : new Date(post.scheduled_at);
    if (Number.isNaN(d.getTime())) return groups;
    const key = d.toLocaleDateString('en-CA');
    groups[key] = [...(groups[key] || []), post];
    return groups;
  }, {}), [posts]);

  const shiftMonth = (amount) => setCurrentMonth((date) => new Date(date.getFullYear(), date.getMonth() + amount, 1));
  const monthLabel = currentMonth.toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' });

  return (
    <MainLayout title="Lịch đăng" actions={<><Link href="/post-planner/list" className="button button-secondary"><List size={15} /> Danh sách</Link><Link href="/post-planner/compose" className="button button-primary"><Plus size={15} /> Tạo bài</Link></>}>
      {createdNotice && (
        <div className="notice um-notice-success calendar-created-notice" role="status">
          <CheckCircle2 size={16} />
          <span>{createdNotice}</span>
          <button className="icon-button" type="button" aria-label="Đóng thông báo" onClick={() => { setCreatedNotice(''); setHighlightDay(''); }}><X size={14} /></button>
        </div>
      )}
      <section className="panel calendar-panel">
        <div className="filter-bar"><div className="calendar-switch"><button className="segment-button is-selected" type="button">Lịch thủ công</button><button className="segment-button" type="button">Tự động SOS</button></div><div className="calendar-controls"><button className="icon-button" onClick={() => shiftMonth(-1)} type="button" aria-label="Tháng trước"><ChevronLeft size={17} /></button><strong>{monthLabel}</strong><button className="icon-button" onClick={() => shiftMonth(1)} type="button" aria-label="Tháng sau"><ChevronRight size={17} /></button><button className="button button-secondary" onClick={() => setCurrentMonth(new Date())} type="button">Hôm nay</button></div></div>
        {error && <div className="notice" style={{ margin: 12 }}>{error}</div>}
        <div className="calendar-grid">{weekdays.map((day) => <div className="calendar-weekday" key={day}>{day}</div>)}{cells.map(({ date, inMonth }, index) => {
          const key = date.toLocaleDateString('en-CA');
          const dayPosts = postsByDay[key] || [];
          const today = date.toDateString() === new Date().toDateString();
          const highlighted = inMonth && key === highlightDay;
          return <div className={`calendar-cell${inMonth ? '' : ' is-outside'}${today ? ' is-today-cell' : ''}${highlighted ? ' is-just-created' : ''}`} key={`${key}-${index}`}><span className={`calendar-day${today ? ' is-today' : ''}`}>{date.getDate()}</span>{dayPosts.slice(0, 3).map((post) => <div className={`calendar-event ${post.status || 'pending'}`} key={post.id} title={post.content}>{post.content || `Bài #${post.id}`}</div>)}{dayPosts.length > 3 && <small className="muted">+{dayPosts.length - 3} bài khác</small>}</div>;
        })}</div>
      </section>
    </MainLayout>
  );
}
