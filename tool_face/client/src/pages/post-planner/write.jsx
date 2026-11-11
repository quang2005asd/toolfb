import Link from 'next/link';
import { ArrowRight, BookOpen, CalendarDays, FileSpreadsheet, Layers, List, PenLine, Sparkles } from 'lucide-react';
import MainLayout from '../../components/layout/MainLayout';
import { BULK_TYPES } from '../../components/write/WriteNav';

const BULK_HINTS = {
  short: 'Nhiều video dọc → TikTok và Reels Facebook',
  feed: 'Nhiều ảnh / video → bài thường trên Fanpage',
  story: 'Nhiều ảnh / video → Tin 24 giờ trên Fanpage'
};

/**
 * Trang Viết bài: chọn chức năng từ lớn đến nhỏ
 *   Viết thường · Viết hàng loạt (Video ngắn / Ảnh & video / Tin, hoặc nhập Excel) · Viết blog
 */
export default function WriteHubPage() {
  return (
    <MainLayout title="Viết bài">
      <div className="write-hub">
        <p className="write-hub-lead">Chọn cách bạn muốn tạo nội dung. Mọi bài đều có thể đăng ngay hoặc hẹn giờ lên nhiều Fanpage / tài khoản TikTok cùng lúc.</p>

        <div className="write-hub-grid">
          <article className="write-card">
            <div className="write-card-icon" aria-hidden="true"><PenLine size={22} /></div>
            <h2>Viết thường</h2>
            <p>Soạn một bài, xem trước như trên Facebook / TikTok, thêm bình luận mồi, đăng ngay hoặc hẹn giờ.</p>
            <ul className="write-card-points">
              <li>Chữ, ảnh, album, video, Reels, Tin</li>
              <li>AI viết hộ theo giọng văn</li>
              <li>Facebook &amp; TikTok</li>
            </ul>
            <Link href="/post-planner/compose" className="button button-primary write-card-cta">Bắt đầu viết <ArrowRight size={15} /></Link>
          </article>

          <article className="write-card is-featured">
            <div className="write-card-icon" aria-hidden="true"><Layers size={22} /></div>
            <h2>Viết hàng loạt</h2>
            <p>Tải nhiều file một lần — mỗi file thành một bài, tool tự giãn giờ đăng. Chọn loại nội dung:</p>
            <div className="write-card-options">
              {BULK_TYPES.map((type) => {
                const Icon = type.icon;
                return (
                  <Link key={type.id} href={type.href} className="write-option">
                    <Icon size={18} aria-hidden="true" />
                    <span>
                      <strong>{type.label}</strong>
                      <small>{BULK_HINTS[type.id]}</small>
                    </span>
                    <ArrowRight size={15} aria-hidden="true" />
                  </Link>
                );
              })}
            </div>
            <Link href="/post-planner/bulk-upload" className="write-card-link"><FileSpreadsheet size={14} aria-hidden="true" /> Hoặc nhập nhiều bài từ file Excel</Link>
          </article>

          <article className="write-card">
            <div className="write-card-icon" aria-hidden="true"><BookOpen size={22} /></div>
            <h2>Viết blog</h2>
            <p>Bài dài có tiêu đề, mở bài, các mục và ảnh bìa — AI lập dàn ý rồi viết từng phần, đăng lên Fanpage.</p>
            <ul className="write-card-points">
              <li>AI lập dàn ý &amp; viết cả bài</li>
              <li>Sửa, thêm, đổi thứ tự từng mục</li>
              <li>Tự lưu nháp trên máy</li>
            </ul>
            <Link href="/post-planner/blog" className="button button-primary write-card-cta">Viết blog <ArrowRight size={15} /></Link>
          </article>
        </div>

        <section className="write-hub-more" aria-label="Công cụ liên quan">
          <h2>Công cụ liên quan</h2>
          <div className="write-hub-links">
            <Link href="/ai-studio/generate"><Sparkles size={15} aria-hidden="true" /> AI tạo nhiều bài theo chủ đề</Link>
            <Link href="/post-planner/calendar"><CalendarDays size={15} aria-hidden="true" /> Lịch đăng</Link>
            <Link href="/post-planner/list"><List size={15} aria-hidden="true" /> Danh sách bài đăng</Link>
          </div>
        </section>
      </div>
    </MainLayout>
  );
}
