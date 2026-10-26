import { useEffect, useState } from 'react';
import Head from 'next/head';
import { CheckCircle2 } from 'lucide-react';
import { publishLoginResult } from '../utils/facebookLoginBridge';

// Facebook trả về đây khi đăng nhập trong cửa sổ phụ: báo kết quả cho tab Tool Face rồi tự đóng
export default function FacebookLoginDone() {
  const [stillOpen, setStillOpen] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setQuery(params.toString());
    publishLoginResult({
      connected: params.get('connected'),
      token: params.get('token'),
      error: params.get('error'),
      reason: params.get('reason'),
      missing: params.get('missing')
    });
    const timer = setTimeout(() => setStillOpen(true), 700);
    window.close();
    return () => clearTimeout(timer);
  }, []);

  return (
    <main className="fb-login-done">
      <Head><title>Kết nối Facebook · Tool Face</title></Head>
      <section>
        <CheckCircle2 size={28} aria-hidden="true" />
        <h1>Đã gửi kết quả về Tool Face</h1>
        {stillOpen ? (
          <>
            <p>Quay lại tab Tool Face để xem kết quả. Bạn có thể đóng cửa sổ này.</p>
            <div className="fb-login-done-actions">
              <button type="button" className="button button-primary" onClick={() => window.close()}>Đóng cửa sổ này</button>
              <a className="button button-secondary" href={`/channels/${query ? `?${query}` : ''}`}>Mở trang Kênh tại đây</a>
            </div>
          </>
        ) : <p>Cửa sổ này sẽ tự đóng…</p>}
      </section>
    </main>
  );
}
