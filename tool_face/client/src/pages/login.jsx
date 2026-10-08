import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { LogIn, UserPlus, ShieldCheck, KeyRound, Loader2, ArrowRight, User, Lock, ChevronDown, ChevronUp, Sun, Moon } from 'lucide-react';
import authApi from '../services/authApi';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

export default function LoginPage() {
  const router = useRouter();
  const { setUser } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [activeTab, setActiveTab] = useState('login'); // 'login' | 'register'
  
  // Login form state
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loadingLogin, setLoadingLogin] = useState(false);

  // Register form state
  const [regName, setRegName] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [loadingReg, setLoadingReg] = useState(false);

  // Direct Token state (optional fallback)
  const [showTokenLogin, setShowTokenLogin] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [loadingToken, setLoadingToken] = useState(false);

  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    if (!router.isReady) return;
    const error = router.query.error;
    const loggedOut = router.query.loggedOut === '1';
    if (error === 'oauth_state_invalid') setErrorMessage('Phiên đăng nhập hết hạn hoặc không hợp lệ. Hãy thử lại.');
    if (error === 'oauth_failed') setErrorMessage('Facebook không hoàn tất đăng nhập. Kiểm tra Meta App và callback URL.');
    if (loggedOut) setErrorMessage('Bạn đã đăng xuất khỏi hệ thống.');
  }, [router.isReady, router.query.error, router.query.loggedOut]);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!loginUsername.trim() || !loginPassword) {
      setErrorMessage('Vui lòng nhập tên đăng nhập và mật khẩu.');
      return;
    }
    setLoadingLogin(true);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      const res = await authApi.login({
        username: loginUsername.trim(),
        password: loginPassword
      });
      if (res.success && res.user) {
        setUser(res.user);
        setSuccessMessage(`Đăng nhập thành công! Đang vào Dashboard...`);
        const next = typeof router.query.next === 'string' && router.query.next.startsWith('/') && !router.query.next.startsWith('//')
          ? router.query.next
          : '/dashboard';
        router.replace(next);
      }
    } catch (err) {
      setErrorMessage(err.response?.data?.message || err.message || 'Đăng nhập thất bại.');
    } finally {
      setLoadingLogin(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!regUsername.trim() || !regPassword) {
      setErrorMessage('Vui lòng điền đầy đủ tên đăng nhập và mật khẩu.');
      return;
    }
    if (regPassword.length < 6) {
      setErrorMessage('Mật khẩu phải có ít nhất 6 ký tự.');
      return;
    }
    if (regPassword !== regConfirmPassword) {
      setErrorMessage('Mật khẩu xác nhận không khớp.');
      return;
    }
    setLoadingReg(true);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      const res = await authApi.register({
        displayName: regName.trim() || regUsername.trim(),
        username: regUsername.trim(),
        password: regPassword
      });
      if (res.success && res.user) {
        setUser(res.user);
        setSuccessMessage('Đăng ký tài khoản thành công! Đang chuyển hướng...');
        const next = typeof router.query.next === 'string' && router.query.next.startsWith('/') && !router.query.next.startsWith('//')
          ? router.query.next
          : '/dashboard';
        router.replace(next);
      }
    } catch (err) {
      setErrorMessage(err.response?.data?.message || err.message || 'Đăng ký thất bại.');
    } finally {
      setLoadingReg(false);
    }
  };

  const handleTokenLogin = async (e) => {
    e.preventDefault();
    const token = tokenInput.trim();
    if (!token) {
      setErrorMessage('Vui lòng dán Facebook Access Token.');
      return;
    }
    setLoadingToken(true);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      const res = await authApi.loginWithToken(token);
      if (res.success && res.user) {
        setUser(res.user);
        setSuccessMessage(`Đăng nhập thành công (${res.user.name})! Đang chuyển hướng...`);
        const next = typeof router.query.next === 'string' && router.query.next.startsWith('/') && !router.query.next.startsWith('//')
          ? router.query.next
          : '/dashboard';
        router.replace(next);
      }
    } catch (err) {
      setErrorMessage(err.response?.data?.message || err.message || 'Không thể xác thực Facebook Token.');
    } finally {
      setLoadingToken(false);
    }
  };

  return (
    <main className="login-shell">
      <div style={{ position: 'fixed', top: 20, right: 24, zIndex: 100 }}>
        <button
          className="theme-toggle-btn"
          type="button"
          onClick={toggleTheme}
          title={theme === 'light' ? 'Chuyển sang Dark Mode' : 'Chuyển sang Tone Trắng'}
          aria-label="Đổi giao diện Sáng / Tối"
        >
          {theme === 'light' ? <Moon size={16} style={{ color: '#475569' }} /> : <Sun size={16} style={{ color: '#fbbf24' }} />}
          <span className="theme-toggle-text">{theme === 'light' ? 'Giao diện Tối' : 'Tone Trắng'}</span>
        </button>
      </div>
      <section className="login-card">
        <div className="login-brand">
          <Image src="/brand-logo.png" alt="Logo" width={52} height={52} priority />
          <div>
            <span className="eyebrow">AUTO POST FANPAGE</span>
            <h1>Hệ Thống Quản Lý</h1>
          </div>
        </div>
        <p className="login-intro">Đăng nhập tài khoản để quản lý nội dung và lịch đăng Fanpage tự động.</p>
        
        {errorMessage && <div className="notice login-error">{errorMessage}</div>}
        {successMessage && <div className="notice login-success" style={{ borderColor: 'rgba(34, 197, 94, 0.4)', background: 'rgba(34, 197, 94, 0.1)', color: '#4ade80', marginBottom: 16, padding: '10px 14px', borderRadius: 10, fontSize: 13 }}>{successMessage}</div>}

        {/* Tab Switcher: Đăng nhập / Đăng ký */}
        <div className="auth-tabs">
          <button
            type="button"
            className={`auth-tab-btn ${activeTab === 'login' ? 'active' : ''}`}
            onClick={() => { setActiveTab('login'); setErrorMessage(''); setSuccessMessage(''); }}
          >
            <LogIn size={15} /> Đăng nhập
          </button>
          <button
            type="button"
            className={`auth-tab-btn ${activeTab === 'register' ? 'active' : ''}`}
            onClick={() => { setActiveTab('register'); setErrorMessage(''); setSuccessMessage(''); }}
          >
            <UserPlus size={15} /> Đăng ký tài khoản
          </button>
        </div>

        {/* Form Đăng nhập */}
        {activeTab === 'login' && (
          <form onSubmit={handleLogin} className="auth-form">
            <div className="auth-field">
              <label><User size={13} /> Tên đăng nhập</label>
              <input
                type="text"
                className="auth-input"
                placeholder="Nhập tên đăng nhập của bạn..."
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
                autoComplete="username"
                disabled={loadingLogin}
                required
              />
            </div>
            <div className="auth-field">
              <label><Lock size={13} /> Mật khẩu</label>
              <input
                type="password"
                className="auth-input"
                placeholder="Nhập mật khẩu..."
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                autoComplete="current-password"
                disabled={loadingLogin}
                required
              />
            </div>
            <button type="submit" className="auth-submit-btn" disabled={loadingLogin}>
              {loadingLogin ? <><Loader2 size={16} className="spin" /> Đang đăng nhập...</> : <>Đăng nhập vào Tool <ArrowRight size={16} /></>}
            </button>
          </form>
        )}

        {/* Form Đăng ký */}
        {activeTab === 'register' && (
          <form onSubmit={handleRegister} className="auth-form">
            <div className="auth-field">
              <label><User size={13} /> Họ và tên (Hiển thị)</label>
              <input
                type="text"
                className="auth-input"
                placeholder="Ví dụ: Nguyễn Văn A"
                value={regName}
                onChange={(e) => setRegName(e.target.value)}
                disabled={loadingReg}
              />
            </div>
            <div className="auth-field">
              <label><User size={13} /> Tên đăng nhập</label>
              <input
                type="text"
                className="auth-input"
                placeholder="Tên đăng nhập (tối thiểu 3 ký tự)..."
                value={regUsername}
                onChange={(e) => setRegUsername(e.target.value)}
                autoComplete="username"
                disabled={loadingReg}
                required
              />
            </div>
            <div className="auth-field">
              <label><Lock size={13} /> Mật khẩu</label>
              <input
                type="password"
                className="auth-input"
                placeholder="Tối thiểu 6 ký tự..."
                value={regPassword}
                onChange={(e) => setRegPassword(e.target.value)}
                autoComplete="new-password"
                disabled={loadingReg}
                required
              />
            </div>
            <div className="auth-field">
              <label><Lock size={13} /> Xác nhận mật khẩu</label>
              <input
                type="password"
                className="auth-input"
                placeholder="Nhập lại mật khẩu..."
                value={regConfirmPassword}
                onChange={(e) => setRegConfirmPassword(e.target.value)}
                autoComplete="new-password"
                disabled={loadingReg}
                required
              />
            </div>
            <button type="submit" className="auth-submit-btn" disabled={loadingReg}>
              {loadingReg ? <><Loader2 size={16} className="spin" /> Đang tạo tài khoản...</> : <>Tạo tài khoản ngay <ArrowRight size={16} /></>}
            </button>
          </form>
        )}

        {/* Tuỳ chọn Đăng nhập nhanh bằng Facebook Access Token */}
        <div style={{ marginTop: 20 }}>
          <button
            type="button"
            onClick={() => setShowTokenLogin(!showTokenLogin)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--dim)',
              fontSize: 12,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              margin: '0 auto',
              padding: '6px 10px'
            }}
          >
            <KeyRound size={13} />
            <span>Đăng nhập nhanh bằng Facebook Access Token</span>
            {showTokenLogin ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>

          {showTokenLogin && (
            <form onSubmit={handleTokenLogin} className="login-token-box" style={{ marginTop: 10 }}>
              <textarea
                className="login-token-input"
                rows={2}
                placeholder="Dán mã Access Token Facebook (EAAB... / EAAA...) vào đây..."
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                disabled={loadingToken}
              />
              <button
                type="submit"
                className="login-token-btn"
                disabled={loadingToken || !tokenInput.trim()}
              >
                {loadingToken ? (
                  <><Loader2 size={15} className="spin" /> Đang xác thực Token...</>
                ) : (
                  <>Vào Dashboard bằng Token <ArrowRight size={15} /></>
                )}
              </button>
            </form>
          )}
        </div>

        <div className="login-security">
          <ShieldCheck size={16} /> Mật khẩu được mã hóa an toàn; dữ liệu Fanpage được phân vùng riêng theo từng tài khoản.
        </div>
      </section>
    </main>
  );
}
