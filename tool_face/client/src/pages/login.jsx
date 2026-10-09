import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/router';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  LogIn,
  Mail,
  Moon,
  ShieldCheck,
  Sun,
  User,
  UserPlus
} from 'lucide-react';
import authApi from '../services/authApi';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

const USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function FieldHint({ tone, children }) {
  if (!children) return null;
  const Icon = tone === 'ok' ? CheckCircle2 : tone === 'error' ? AlertCircle : Loader2;
  return (
    <small className={`auth-hint ${tone}`}>
      <Icon size={12} className={tone === 'checking' ? 'spin' : ''} aria-hidden="true" /> {children}
    </small>
  );
}

function PasswordInput({ id, value, onChange, placeholder, autoComplete, disabled, visible, onToggle, inputRef }) {
  return (
    <div className="auth-input-wrap">
      <input
        id={id}
        ref={inputRef}
        type={visible ? 'text' : 'password'}
        className="auth-input"
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        disabled={disabled}
        required
      />
      <button type="button" className="auth-eye" onClick={onToggle} aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} tabIndex={-1}>
        {visible ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const { signIn } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [activeTab, setActiveTab] = useState('login'); // 'login' | 'register'
  const loginPasswordRef = useRef(null);

  // Đăng nhập
  const [identifier, setIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [identifierStatus, setIdentifierStatus] = useState('idle'); // idle | checking | exists | missing
  const [loadingLogin, setLoadingLogin] = useState(false);

  // Đăng ký
  const [regUsername, setRegUsername] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [usernameStatus, setUsernameStatus] = useState('idle'); // idle | checking | available | taken
  const [emailStatus, setEmailStatus] = useState('idle');
  const [loadingReg, setLoadingReg] = useState(false);

  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [suggestRegister, setSuggestRegister] = useState(false);

  useEffect(() => {
    if (!router.isReady) return;
    const error = router.query.error;
    if (error === 'session_required') setErrorMessage('Vui lòng đăng nhập trước khi tiếp tục.');
    if (router.query.loggedOut === '1') setSuccessMessage('Bạn đã đăng xuất khỏi hệ thống.');
  }, [router.isReady, router.query.error, router.query.loggedOut]);

  const resetMessages = () => {
    setErrorMessage('');
    setSuccessMessage('');
    setSuggestRegister(false);
  };

  const switchTab = (tab) => {
    setActiveTab(tab);
    setShowPassword(false);
    resetMessages();
  };

  // Kiểm tra tài khoản tồn tại trước khi đăng nhập
  const checkIdentifier = async () => {
    const value = identifier.trim();
    if (value.length < 3) {
      setIdentifierStatus('idle');
      return;
    }
    setIdentifierStatus('checking');
    try {
      const res = await authApi.checkAccount(value);
      setIdentifierStatus(res.exists ? 'exists' : 'missing');
    } catch {
      setIdentifierStatus('idle');
    }
  };

  const checkRegisterField = async (value, setStatus) => {
    setStatus('checking');
    try {
      const res = await authApi.checkAccount(value);
      setStatus(res.exists ? 'taken' : 'available');
    } catch {
      setStatus('idle');
    }
  };

  const goToRegisterWith = () => {
    const value = identifier.trim().toLowerCase();
    if (value.includes('@')) setRegEmail(value);
    else setRegUsername(value);
    switchTab('register');
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    resetMessages();
    if (!identifier.trim() || !loginPassword) {
      setErrorMessage('Vui lòng nhập tên đăng nhập (hoặc Gmail) và mật khẩu.');
      return;
    }
    setLoadingLogin(true);
    try {
      const res = await authApi.login({ identifier: identifier.trim(), password: loginPassword });
      if (res.success && res.user) {
        signIn(res.user);
        setSuccessMessage(res.message || 'Đăng nhập thành công! Đang vào Dashboard...');
        const next = typeof router.query.next === 'string' && router.query.next.startsWith('/') && !router.query.next.startsWith('//')
          ? router.query.next
          : '/dashboard';
        router.replace(next);
      }
    } catch (err) {
      const code = err.response?.data?.code;
      if (code === 'account_not_found') {
        setIdentifierStatus('missing');
        setSuggestRegister(true);
      }
      if (code === 'wrong_password') {
        setLoginPassword('');
        loginPasswordRef.current?.focus();
      }
      setErrorMessage(err.response?.data?.message || err.message || 'Đăng nhập thất bại.');
    } finally {
      setLoadingLogin(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    resetMessages();
    const username = regUsername.trim().toLowerCase();
    const email = regEmail.trim().toLowerCase();
    if (!USERNAME_PATTERN.test(username)) {
      setErrorMessage('Tên đăng nhập dài 3–32 ký tự, chỉ gồm chữ thường không dấu, số và các ký tự . _ -');
      return;
    }
    if (!EMAIL_PATTERN.test(email)) {
      setErrorMessage('Gmail / Email không hợp lệ.');
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
    try {
      const res = await authApi.register({ username, email, password: regPassword, confirmPassword: regConfirmPassword });
      // Đăng ký xong chuyển sang form đăng nhập với tên đăng nhập điền sẵn
      setActiveTab('login');
      setIdentifier(username);
      setIdentifierStatus('exists');
      setLoginPassword('');
      setRegPassword('');
      setRegConfirmPassword('');
      setShowPassword(false);
      setSuccessMessage(res.message || 'Đăng ký thành công! Hãy đăng nhập để bắt đầu.');
      setTimeout(() => loginPasswordRef.current?.focus(), 50);
    } catch (err) {
      const code = err.response?.data?.code;
      if (code === 'username_taken') setUsernameStatus('taken');
      if (code === 'email_taken') setEmailStatus('taken');
      setErrorMessage(err.response?.data?.message || err.message || 'Đăng ký thất bại.');
    } finally {
      setLoadingReg(false);
    }
  };

  const usernameValue = regUsername.trim().toLowerCase();
  const usernameHint = !usernameValue ? null
    : !USERNAME_PATTERN.test(usernameValue) ? { tone: 'error', text: '3–32 ký tự: chữ thường không dấu, số, . _ -' }
      : usernameStatus === 'checking' ? { tone: 'checking', text: 'Đang kiểm tra…' }
        : usernameStatus === 'taken' ? { tone: 'error', text: 'Tên đăng nhập đã được sử dụng' }
          : usernameStatus === 'available' ? { tone: 'ok', text: 'Tên đăng nhập có thể sử dụng' } : null;

  const emailValue = regEmail.trim().toLowerCase();
  const emailHint = !emailValue ? null
    : !EMAIL_PATTERN.test(emailValue) ? { tone: 'error', text: 'Định dạng Gmail chưa đúng (ví dụ: ten@gmail.com)' }
      : emailStatus === 'checking' ? { tone: 'checking', text: 'Đang kiểm tra…' }
        : emailStatus === 'taken' ? { tone: 'error', text: 'Gmail đã được đăng ký cho tài khoản khác' }
          : emailStatus === 'available' ? { tone: 'ok', text: 'Gmail hợp lệ' } : null;

  const confirmHint = !regConfirmPassword ? null
    : regConfirmPassword === regPassword ? { tone: 'ok', text: 'Mật khẩu khớp' } : { tone: 'error', text: 'Mật khẩu xác nhận không khớp' };

  const identifierHint = identifierStatus === 'checking' ? { tone: 'checking', text: 'Đang kiểm tra tài khoản…' }
    : identifierStatus === 'exists' ? { tone: 'ok', text: 'Tài khoản hợp lệ' }
      : identifierStatus === 'missing' ? { tone: 'error', text: 'Tài khoản không tồn tại' } : null;

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
        <p className="login-intro">
          {activeTab === 'login'
            ? 'Đăng nhập bằng tài khoản đã được cấp hoặc đã đăng ký để quản lý nội dung và lịch đăng Fanpage.'
            : 'Tạo tài khoản Thành viên mới. Quản lý hoặc Quản trị viên có thể nâng quyền cho bạn sau.'}
        </p>

        {errorMessage && (
          <div className="notice login-error auth-notice-error">
            <AlertCircle size={16} />
            <span>
              {errorMessage}
              {suggestRegister && (
                <button type="button" className="auth-inline-link" onClick={goToRegisterWith}>
                  Đăng ký tài khoản mới →
                </button>
              )}
            </span>
          </div>
        )}
        {successMessage && (
          <div className="notice login-error auth-notice-success">
            <CheckCircle2 size={16} />
            <span>{successMessage}</span>
          </div>
        )}

        <div className="auth-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'login'}
            className={`auth-tab-btn ${activeTab === 'login' ? 'active' : ''}`}
            onClick={() => switchTab('login')}
          >
            <LogIn size={15} /> Đăng nhập
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'register'}
            className={`auth-tab-btn ${activeTab === 'register' ? 'active' : ''}`}
            onClick={() => switchTab('register')}
          >
            <UserPlus size={15} /> Đăng ký
          </button>
        </div>

        {activeTab === 'login' && (
          <form onSubmit={handleLogin} className="auth-form" noValidate>
            <div className="auth-field">
              <label htmlFor="login-identifier"><User size={13} /> Tên đăng nhập hoặc Gmail</label>
              <input
                id="login-identifier"
                type="text"
                className={`auth-input${identifierStatus === 'missing' ? ' is-invalid' : ''}`}
                placeholder="Ví dụ: admin hoặc ten@gmail.com"
                value={identifier}
                onChange={(e) => { setIdentifier(e.target.value); setIdentifierStatus('idle'); setSuggestRegister(false); }}
                onBlur={checkIdentifier}
                autoComplete="username"
                autoCapitalize="none"
                disabled={loadingLogin}
                required
              />
              {identifierHint && <FieldHint tone={identifierHint.tone}>{identifierHint.text}</FieldHint>}
            </div>
            <div className="auth-field">
              <label htmlFor="login-password"><Lock size={13} /> Mật khẩu</label>
              <PasswordInput
                id="login-password"
                inputRef={loginPasswordRef}
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="Nhập mật khẩu..."
                autoComplete="current-password"
                disabled={loadingLogin}
                visible={showPassword}
                onToggle={() => setShowPassword((v) => !v)}
              />
            </div>
            <button type="submit" className="auth-submit-btn" disabled={loadingLogin || identifierStatus === 'checking'}>
              {loadingLogin ? <><Loader2 size={16} className="spin" /> Đang đăng nhập...</> : <>Đăng nhập <ArrowRight size={16} /></>}
            </button>
            <p className="auth-switch">
              Chưa có tài khoản?{' '}
              <button type="button" className="auth-inline-link" onClick={() => switchTab('register')}>Đăng ký ngay</button>
            </p>
          </form>
        )}

        {activeTab === 'register' && (
          <form onSubmit={handleRegister} className="auth-form" noValidate>
            <div className="auth-field">
              <label htmlFor="reg-username"><User size={13} /> Tên đăng nhập</label>
              <input
                id="reg-username"
                type="text"
                className={`auth-input${usernameHint?.tone === 'error' ? ' is-invalid' : ''}`}
                placeholder="3–32 ký tự, ví dụ: nguyenvana"
                value={regUsername}
                onChange={(e) => { setRegUsername(e.target.value); setUsernameStatus('idle'); }}
                onBlur={() => USERNAME_PATTERN.test(usernameValue) && checkRegisterField(usernameValue, setUsernameStatus)}
                autoComplete="username"
                autoCapitalize="none"
                disabled={loadingReg}
                required
              />
              {usernameHint && <FieldHint tone={usernameHint.tone}>{usernameHint.text}</FieldHint>}
            </div>
            <div className="auth-field">
              <label htmlFor="reg-email"><Mail size={13} /> Gmail</label>
              <input
                id="reg-email"
                type="email"
                className={`auth-input${emailHint?.tone === 'error' ? ' is-invalid' : ''}`}
                placeholder="ten@gmail.com"
                value={regEmail}
                onChange={(e) => { setRegEmail(e.target.value); setEmailStatus('idle'); }}
                onBlur={() => EMAIL_PATTERN.test(emailValue) && checkRegisterField(emailValue, setEmailStatus)}
                autoComplete="email"
                disabled={loadingReg}
                required
              />
              {emailHint && <FieldHint tone={emailHint.tone}>{emailHint.text}</FieldHint>}
            </div>
            <div className="auth-field">
              <label htmlFor="reg-password"><Lock size={13} /> Mật khẩu</label>
              <PasswordInput
                id="reg-password"
                value={regPassword}
                onChange={(e) => setRegPassword(e.target.value)}
                placeholder="Tối thiểu 6 ký tự..."
                autoComplete="new-password"
                disabled={loadingReg}
                visible={showPassword}
                onToggle={() => setShowPassword((v) => !v)}
              />
              {regPassword && regPassword.length < 6 && <FieldHint tone="error">Còn thiếu {6 - regPassword.length} ký tự</FieldHint>}
            </div>
            <div className="auth-field">
              <label htmlFor="reg-confirm"><Lock size={13} /> Xác nhận mật khẩu</label>
              <PasswordInput
                id="reg-confirm"
                value={regConfirmPassword}
                onChange={(e) => setRegConfirmPassword(e.target.value)}
                placeholder="Nhập lại mật khẩu..."
                autoComplete="new-password"
                disabled={loadingReg}
                visible={showPassword}
                onToggle={() => setShowPassword((v) => !v)}
              />
              {confirmHint && <FieldHint tone={confirmHint.tone}>{confirmHint.text}</FieldHint>}
            </div>
            <button type="submit" className="auth-submit-btn" disabled={loadingReg}>
              {loadingReg ? <><Loader2 size={16} className="spin" /> Đang tạo tài khoản...</> : <>Tạo tài khoản <ArrowRight size={16} /></>}
            </button>
            <p className="auth-switch">
              Đã có tài khoản?{' '}
              <button type="button" className="auth-inline-link" onClick={() => switchTab('login')}>Đăng nhập</button>
            </p>
          </form>
        )}

        <div className="login-security">
          <ShieldCheck size={16} /> Mật khẩu được mã hóa an toàn; quyền hạn và dữ liệu được phân theo vai trò Quản trị viên, Quản lý và Thành viên.
        </div>
      </section>
    </main>
  );
}
