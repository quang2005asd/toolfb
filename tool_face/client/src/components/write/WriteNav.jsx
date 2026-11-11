import Link from 'next/link';
import { BookOpen, Clapperboard, FileSpreadsheet, Images, Layers, LayoutGrid, PenLine, CircleDashed } from 'lucide-react';

// Các chức năng của trang Viết bài, từ lớn đến nhỏ
export const WRITE_MODES = [
  { id: 'single', label: 'Viết thường', href: '/post-planner/compose', icon: PenLine },
  { id: 'bulk', label: 'Viết hàng loạt', href: '/post-planner/bulk?type=short', icon: Layers },
  { id: 'blog', label: 'Viết blog', href: '/post-planner/blog', icon: BookOpen }
];

export const BULK_TYPES = [
  { id: 'short', label: 'TikTok · Reels · Shorts', short: 'Video ngắn', icon: Clapperboard, href: '/post-planner/bulk?type=short' },
  { id: 'feed', label: 'Ảnh & video thường', short: 'Ảnh & video', icon: Images, href: '/post-planner/bulk?type=feed' },
  { id: 'story', label: 'Tin (Story)', short: 'Tin', icon: CircleDashed, href: '/post-planner/bulk?type=story' }
];

/**
 * Thanh điều hướng chung cho các trang viết bài.
 * active: 'single' | 'bulk' | 'blog'; bulkType: 'short' | 'feed' | 'story' | 'excel' (khi active = 'bulk')
 */
export default function WriteNav({ active, bulkType = null }) {
  return (
    <nav className="write-nav" aria-label="Chức năng viết bài">
      <div className="write-nav-main">
        <Link href="/post-planner/write" className="write-nav-home" title="Tất cả chức năng viết bài">
          <LayoutGrid size={15} aria-hidden="true" /> <span>Viết bài</span>
        </Link>
        <div className="write-nav-tabs" role="list">
          {WRITE_MODES.map((mode) => {
            const Icon = mode.icon;
            return (
              <Link key={mode.id} href={mode.href} role="listitem" className={`write-nav-tab${active === mode.id ? ' is-active' : ''}`} aria-current={active === mode.id ? 'page' : undefined}>
                <Icon size={15} aria-hidden="true" /> {mode.label}
              </Link>
            );
          })}
        </div>
      </div>
      {active === 'bulk' && (
        <div className="write-nav-sub" role="list" aria-label="Loại bài đăng hàng loạt">
          {BULK_TYPES.map((type) => {
            const Icon = type.icon;
            return (
              <Link key={type.id} href={type.href} role="listitem" className={`write-nav-subtab${bulkType === type.id ? ' is-active' : ''}`} aria-current={bulkType === type.id ? 'page' : undefined}>
                <Icon size={14} aria-hidden="true" /> {type.label}
              </Link>
            );
          })}
          <Link href="/post-planner/bulk-upload" role="listitem" className={`write-nav-subtab is-excel${bulkType === 'excel' ? ' is-active' : ''}`} aria-current={bulkType === 'excel' ? 'page' : undefined}>
            <FileSpreadsheet size={14} aria-hidden="true" /> Nhập từ file Excel
          </Link>
        </div>
      )}
    </nav>
  );
}
