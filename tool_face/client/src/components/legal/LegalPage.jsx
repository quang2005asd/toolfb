import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { API_BASE_URL } from '../../services/apiBase';

// Trang pháp lý công khai (Meta yêu cầu khi duyệt app): Tiếng Việt / English, thông tin đơn vị lấy từ server
const NAV = [
  { href: '/privacy', vi: 'Chính sách quyền riêng tư', en: 'Privacy Policy' },
  { href: '/terms', vi: 'Điều khoản sử dụng', en: 'Terms of Service' },
  { href: '/data-deletion', vi: 'Xóa dữ liệu', en: 'Data Deletion' }
];
const DEFAULT_UPDATED = '2026-10-27';
const UI = {
  vi: { updated: 'Cập nhật lần cuối', contact: 'Liên hệ', noEmail: 'quản trị viên của dịch vụ', back: 'Đăng nhập' },
  en: { updated: 'Last updated', contact: 'Contact', noEmail: 'the service administrator', back: 'Sign in' }
};

const EN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function fill(text, values) {
  return String(text).replace(/\{(\w+)\}/g, (_, key) => values[key] ?? '');
}

// Định dạng cố định (không phụ thuộc locale của máy build / trình duyệt) để HTML dựng sẵn khớp khi hydrate
function formatPolicyDate(isoDate, lang) {
  const [year, month, day] = String(isoDate).split('-').map(Number);
  if (!year || !month || !day) return isoDate;
  return lang === 'en' ? `${EN_MONTHS[month - 1]} ${day}, ${year}` : `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
}

export default function LegalPage({ path, content, banner }) {
  const router = useRouter();
  const [lang, setLang] = useState('vi');
  const [site, setSite] = useState({ appName: 'Tool Face', operatorName: null, contactEmail: null, siteUrl: '', policyUpdatedAt: null });

  useEffect(() => {
    if (!router.isReady) return;
    const requested = router.query.lang;
    if (requested === 'en' || requested === 'vi') setLang(requested);
    else if (typeof navigator !== 'undefined' && navigator.language && !navigator.language.toLowerCase().startsWith('vi')) setLang('en');
  }, [router.isReady, router.query.lang]);

  useEffect(() => {
    let active = true;
    fetch(`${API_BASE_URL}/public/site-info`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (active && data) setSite((prev) => ({ ...prev, ...data })); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const ui = UI[lang];
  const page = content[lang];
  const policyDate = site.policyUpdatedAt || DEFAULT_UPDATED;
  // siteUrl lấy từ server sau khi tải trang (không đọc window lúc render để tránh lệch HTML dựng sẵn)
  const values = {
    appName: site.appName,
    operator: site.operatorName || site.appName,
    email: site.contactEmail || ui.noEmail,
    siteUrl: site.siteUrl || ''
  };

  const switchLang = (next) => {
    setLang(next);
    router.replace({ pathname: path, query: { ...router.query, lang: next } }, undefined, { shallow: true });
  };

  return (
    <div className="legal-page">
      <Head><title>{`${page.title} · ${site.appName}`}</title></Head>
      <header className="legal-header">
        <Link href="/" className="legal-brand">{site.appName}</Link>
        <div className="legal-lang" role="group" aria-label="Ngôn ngữ / Language">
          <button type="button" className={lang === 'vi' ? 'is-active' : ''} aria-pressed={lang === 'vi'} onClick={() => switchLang('vi')}>Tiếng Việt</button>
          <button type="button" className={lang === 'en' ? 'is-active' : ''} aria-pressed={lang === 'en'} onClick={() => switchLang('en')}>English</button>
        </div>
      </header>

      <nav className="legal-nav" aria-label="Legal">
        {NAV.map((item) => (
          <Link key={item.href} href={`${item.href}?lang=${lang}`} className={item.href === path ? 'is-active' : ''} aria-current={item.href === path ? 'page' : undefined}>
            {item[lang]}
          </Link>
        ))}
      </nav>

      <main className="legal-main">
        {banner?.(lang)}
        <h1>{page.title}</h1>
        <p className="legal-updated">{ui.updated}: {formatPolicyDate(policyDate, lang)}</p>
        {page.intro && <p className="legal-intro">{fill(page.intro, values)}</p>}
        {page.sections.map((section) => (
          <section key={section.h}>
            <h2>{fill(section.h, values)}</h2>
            {(section.p || []).map((text) => <p key={text}>{fill(text, values)}</p>)}
            {section.ul && <ul>{section.ul.map((text) => <li key={text}>{fill(text, values)}</li>)}</ul>}
            {section.ol && <ol>{section.ol.map((text) => <li key={text}>{fill(text, values)}</li>)}</ol>}
            {(section.note || []).map((text) => <p key={text}>{fill(text, values)}</p>)}
          </section>
        ))}
        <section className="legal-contact">
          <h2>{ui.contact}</h2>
          <p>
            {values.operator}
            {site.contactEmail ? <> · <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a></> : null}
            {values.siteUrl ? <> · {values.siteUrl}</> : null}
          </p>
        </section>
      </main>

      <footer className="legal-footer">
        <span>© {policyDate.slice(0, 4)} {values.operator}</span>
        <Link href="/login">{ui.back}</Link>
      </footer>
    </div>
  );
}
