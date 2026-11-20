import { useEffect, useState } from 'react';
import { Languages } from 'lucide-react';
import { readLang, switchLang } from '../i18n/language';

// Nút chuyển ngôn ngữ Tiếng Việt / English (thanh trên cùng và trang đăng nhập)
export default function LanguageToggle() {
  const [lang, setLang] = useState('vi');
  useEffect(() => setLang(readLang()), []);

  return (
    <div className="lang-toggle" role="group" aria-label="Ngôn ngữ / Language" translate="no">
      <Languages size={15} aria-hidden="true" />
      {[['vi', 'VI', 'Tiếng Việt'], ['en', 'EN', 'English']].map(([code, short, label]) => (
        <button
          key={code}
          type="button"
          className={lang === code ? 'is-active' : ''}
          aria-pressed={lang === code}
          title={label}
          onClick={() => { if (lang !== code) switchLang(code); }}
        >
          {short}
        </button>
      ))}
    </div>
  );
}
