import { useState } from 'react';
import { useRouter } from 'next/router';
import { Bot, LogIn } from 'lucide-react';
import authApi from '../services/authApi';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const router = useRouter();
  const { signIn } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await authApi.login(identifier, password);
      signIn(result.user);
      const next = typeof router.query.next === 'string' && router.query.next.startsWith('/') ? router.query.next : '/comment-ai';
      await router.replace(next);
    } catch (err) {
      setError(err.response?.data?.message || 'Không đăng nhập được. Kiểm tra kết nối máy chủ.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="page-area" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
      <section className="panel" style={{ width: 'min(440px, 100%)', padding: 28 }}>
        <h1><Bot size={24} style={{ verticalAlign: 'middle', marginRight: 8 }} />AI Bình luận</h1>
        <p className="muted">Đăng nhập bằng tài khoản đang dùng trong hệ thống.</p>
        <form onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
          <label className="field-label">Tên đăng nhập hoặc email
            <input className="field" autoComplete="username" value={identifier} onChange={(e) => setIdentifier(e.target.value)} required />
          </label>
          <label className="field-label">Mật khẩu
            <input className="field" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          {error && <div className="notice" style={{ color: '#dc2626' }}>{error}</div>}
          <button className="button button-primary" type="submit" disabled={busy}><LogIn size={16} />{busy ? 'Đang đăng nhập...' : 'Đăng nhập'}</button>
        </form>
      </section>
    </main>
  );
}
