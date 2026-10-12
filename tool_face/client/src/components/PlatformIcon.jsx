import { useId } from 'react';

// Biểu tượng nền tảng (lucide-react bản 1.x không còn icon thương hiệu)
export const PLATFORM_META = {
  facebook: { label: 'Facebook', color: '#1877f2' },
  messenger: { label: 'Messenger', color: '#0a7cff' },
  instagram: { label: 'Instagram', color: '#d62976' }
};

export default function PlatformIcon({ platform, size = 16, title }) {
  const label = title || PLATFORM_META[platform]?.label || platform;
  const gradientId = useId();
  if (platform === 'instagram') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label={label} className="platform-icon">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor="#feda75" />
            <stop offset="0.35" stopColor="#fa7e1e" />
            <stop offset="0.65" stopColor="#d62976" />
            <stop offset="1" stopColor="#4f5bd5" />
          </linearGradient>
        </defs>
        <rect x="2" y="2" width="20" height="20" rx="6" fill={`url(#${gradientId})`} />
        <circle cx="12" cy="12" r="4.4" fill="none" stroke="#fff" strokeWidth="1.9" />
        <circle cx="17.3" cy="6.7" r="1.25" fill="#fff" />
      </svg>
    );
  }
  if (platform === 'messenger') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label={label} className="platform-icon">
        <path fill="#0a7cff" d="M12 2C6.36 2 2 6.13 2 11.7c0 2.91 1.19 5.43 3.14 7.17.16.15.26.35.27.57l.05 1.78a.8.8 0 0 0 1.12.71l1.98-.87a.8.8 0 0 1 .53-.04c.91.25 1.87.38 2.91.38 5.64 0 10-4.13 10-9.7S17.64 2 12 2Z" />
        <path fill="#fff" d="m5.99 14.54 2.94-4.66a1.5 1.5 0 0 1 2.17-.4l2.34 1.75a.6.6 0 0 0 .72 0l3.16-2.4c.42-.32.97.18.69.63l-2.94 4.66a1.5 1.5 0 0 1-2.17.4l-2.34-1.75a.6.6 0 0 0-.72 0l-3.16 2.4c-.42.32-.97-.18-.69-.63Z" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label={label} className="platform-icon">
      <circle cx="12" cy="12" r="10" fill="#1877f2" />
      <path fill="#fff" d="M13.4 21.9v-7.03h2.36l.35-2.74H13.4v-1.75c0-.79.22-1.33 1.36-1.33h1.45V6.6a19.6 19.6 0 0 0-2.12-.11c-2.1 0-3.53 1.28-3.53 3.63v2.02H8.19v2.74h2.37v7.03" />
    </svg>
  );
}
