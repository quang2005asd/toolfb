import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertCircle,
  Bell,
  Bot,
  Check,
  CheckCircle2,
  Clock,
  Cpu,
  Database,
  ExternalLink,
  Eye,
  EyeOff,
  Globe2,
  HardDrive,
  KeyRound,
  LogOut,
  Palette,
  RefreshCw,
  Save,
  Send,
  Server,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  User,
  Zap
} from 'lucide-react';
import MainLayout from '../../components/layout/MainLayout';
import settingsApi from '../../services/settingsApi';
import authApi from '../../services/authApi';
import useAuth from '../../hooks/useAuth';

const tabs = [
  { id: 'account', label: 'Tài khoản & Facebook', icon: User },
  { id: 'ai', label: 'Cấu hình AI Studio', icon: Sparkles },
  { id: 'telegram', label: 'Giám sát & Bot Telegram', icon: Bell },
  { id: 'publishing', label: 'Đăng bài & Lịch trình', icon: Clock },
  { id: 'system', label: 'Hệ thống & Giao diện', icon: Cpu }
];

const aiProviders = [
  { id: 'openai', name: 'OpenAI (ChatGPT)', baseUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-4o-mini' },
  { id: 'deepseek', name: 'DeepSeek AI', baseUrl: 'https://api.deepseek.com/v1', defaultModel: 'deepseek-chat' },
  { id: 'gemini', name: 'Google Gemini (OpenAI Protocol)', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/', defaultModel: 'gemini-1.5-flash' },
  { id: 'groq', name: 'Groq (Ultra-fast LLM)', baseUrl: 'https://api.groq.com/openai/v1', defaultModel: 'openai/gpt-oss-120b' },
  { id: 'custom', name: 'Tùy chỉnh Endpoint khác', baseUrl: '', defaultModel: 'gpt-4o-mini' }
];

const tonePresets = [
  {
    name: 'Viral & Hấp dẫn',
    prompt: 'Bạn là chuyên gia sáng tạo nội dung Facebook triệu view. Sử dụng giọng văn gần gũi, cuốn hút, mở đầu bằng hook gây tò mò, kết thúc bằng lời kêu gọi tương tác (CTA) tự nhiên.'
  },
  {
    name: 'Bán hàng & Chốt đơn',
    prompt: 'Bạn là copywriter viết bài bán hàng đỉnh cao. Nêu bật lợi ích cốt lõi của sản phẩm, đánh trúng nỗi đau khách hàng, đưa ra ưu đãi thôi thúc hành động, chốt đơn mạnh mẽ.'
  },
  {
    name: 'Chuyên nghiệp & Tin tức',
    prompt: 'Bạn là biên tập viên tin tức và phân tích chuyên nghiệp. Giọng văn trang trọng, gãy gọn, khách quan, giàu thông tin giá trị và số liệu thực tế.'
  },
  {
    name: 'Hài hước & Bắt trend',
    prompt: 'Bạn là nhà sáng tạo nội dung Gen Z hài hước, dí dỏm. Khéo léo lồng ghép các câu nói hot trend, châm biếm nhẹ nhàng, tạo tiếng cười sảng khoái và kích thích chia sẻ.'
  }
];

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('account');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState({ type: '', text: '' });

  // Form states
  const [data, setData] = useState({
    settings: {
      ai_provider: 'openai',
      ai_model: 'gpt-4o-mini',
      ai_api_key_masked: '',
      ai_has_key: false,
      ai_base_url: 'https://api.openai.com/v1',
      ai_system_prompt: '',
      post_interval_minutes: 15,
      default_hashtags: '#facebook #marketing #viral',
      default_signature: '📌 Hãy bấm Theo dõi Fanpage để cập nhật bài viết mới nhất!',
      auto_retry_count: 2,
      enable_rgb_effects: true,
      telegram_bot_token_masked: '',
      telegram_has_token: false,
      telegram_chat_id: '',
      telegram_alert_enabled: true,
      telegram_alert_on_expired: true,
      telegram_alert_on_failed: true
    },
    account: {},
    system: {}
  });

  const [newApiKey, setNewApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);

  // Test AI state
  const [testingAi, setTestingAi] = useState(false);
  const [aiTestResult, setAiTestResult] = useState(null);

  // Telegram Bot state (Module 2)
  const [newTelegramToken, setNewTelegramToken] = useState('');
  const [showTelegramToken, setShowTelegramToken] = useState(false);
  const [testingTelegram, setTestingTelegram] = useState(false);
  const [telegramTestResult, setTelegramTestResult] = useState(null);

  // Token Health Check state (Module 2)
  const [runningHealthCheck, setRunningHealthCheck] = useState(false);
  const [healthCheckResult, setHealthCheckResult] = useState(null);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const res = await settingsApi.get();
      if (res.success) {
        setData(res);
      }
    } catch (err) {
      setNotice({ type: 'error', text: 'Không thể tải cài đặt từ máy chủ: ' + (err.response?.data?.message || err.message) });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleProviderChange = (e) => {
    const providerId = e.target.value;
    const provider = aiProviders.find((p) => p.id === providerId);
    setData((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        ai_provider: providerId,
        ai_base_url: provider?.baseUrl || prev.settings.ai_base_url,
        ai_model: provider?.defaultModel || prev.settings.ai_model
      }
    }));
  };

  const handleSave = async (e) => {
    if (e) e.preventDefault();
    setSaving(true);
    setNotice({ type: '', text: '' });
    try {
      const payload = {
        ai_provider: data.settings.ai_provider,
        ai_model: data.settings.ai_model,
        ai_base_url: data.settings.ai_base_url,
        ai_system_prompt: data.settings.ai_system_prompt,
        post_interval_minutes: data.settings.post_interval_minutes,
        default_hashtags: data.settings.default_hashtags,
        default_signature: data.settings.default_signature,
        auto_retry_count: data.settings.auto_retry_count,
        enable_rgb_effects: data.settings.enable_rgb_effects,
        telegram_chat_id: data.settings.telegram_chat_id,
        telegram_alert_enabled: data.settings.telegram_alert_enabled,
        telegram_alert_on_expired: data.settings.telegram_alert_on_expired,
        telegram_alert_on_failed: data.settings.telegram_alert_on_failed
      };

      if (newApiKey.trim()) {
        payload.ai_api_key = newApiKey.trim();
      }

      if (newTelegramToken.trim()) {
        payload.telegram_bot_token = newTelegramToken.trim();
      }

      const res = await settingsApi.update(payload);
      setNotice({ type: 'success', text: res.message || 'Đã lưu cấu hình thành công!' });
      setNewApiKey('');
      setNewTelegramToken('');
      await loadSettings();
    } catch (err) {
      setNotice({ type: 'error', text: 'Lưu cài đặt thất bại: ' + (err.response?.data?.message || err.message) });
    } finally {
      setSaving(false);
    }
  };

  const handleTestAi = async () => {
    setTestingAi(true);
    setAiTestResult(null);
    try {
      const res = await settingsApi.testAi({
        apiKey: newApiKey.trim() || undefined,
        model: data.settings.ai_model,
        baseUrl: data.settings.ai_base_url
      });
      setAiTestResult({ success: true, message: res.reply || 'Kết nối thành công!' });
    } catch (err) {
      setAiTestResult({
        success: false,
        message: err.response?.data?.message || err.message
      });
    } finally {
      setTestingAi(false);
    }
  };

  const handleTestTelegram = async () => {
    const hasToken = Boolean(newTelegramToken.trim() || data.settings.telegram_has_token);
    const chatId = data.settings.telegram_chat_id ? String(data.settings.telegram_chat_id).trim() : '';

    if (!hasToken) {
      setTelegramTestResult({ success: false, message: 'Vui lòng nhập Telegram Bot Token trước khi gửi test.' });
      return;
    }
    if (!chatId) {
      setTelegramTestResult({ success: false, message: 'Bạn chưa nhập Telegram Chat ID! Hãy chat với bot @userinfobot để lấy ID của bạn rồi điền vào ô "Telegram Chat ID" bên dưới.' });
      return;
    }

    setTestingTelegram(true);
    setTelegramTestResult(null);
    try {
      const res = await settingsApi.testTelegram({
        botToken: newTelegramToken.trim() || undefined,
        chatId
      });
      setTelegramTestResult({ success: true, message: res.message || 'Gửi tin nhắn thử nghiệm thành công! Hãy kiểm tra Telegram.' });
    } catch (err) {
      setTelegramTestResult({
        success: false,
        message: err.response?.data?.message || err.message
      });
    } finally {
      setTestingTelegram(false);
    }
  };

  const handleRunHealthCheck = async () => {
    setRunningHealthCheck(true);
    setHealthCheckResult(null);
    try {
      const res = await settingsApi.runTokenHealthCheck();
      if (res.success && res.summary) {
        setHealthCheckResult({ success: true, summary: res.summary });
      } else {
        setHealthCheckResult({ success: false, message: res.message || 'Quét token thất bại.' });
      }
    } catch (err) {
      setHealthCheckResult({ success: false, message: err.response?.data?.message || err.message });
    } finally {
      setRunningHealthCheck(false);
    }
  };

  return (
    <MainLayout
      title="Cài đặt hệ thống"
      actions={
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            type="button"
            className="button button-secondary"
            onClick={loadSettings}
            disabled={loading || saving}
            title="Tải lại cài đặt"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Làm mới
          </button>
          <button
            type="button"
            className="button button-primary"
            onClick={handleSave}
            disabled={saving}
          >
            <Save size={15} /> {saving ? 'Đang lưu…' : 'Lưu cài đặt'}
          </button>
        </div>
      }
    >
      {notice.text && (
        <div
          className="notice"
          style={{
            marginBottom: 20,
            borderColor: notice.type === 'error' ? 'rgba(239, 68, 68, 0.4)' : 'rgba(16, 185, 129, 0.4)',
            color: notice.type === 'error' ? '#ef4444' : '#10b981',
            background: notice.type === 'error' ? 'rgba(239, 68, 68, 0.08)' : 'rgba(16, 185, 129, 0.08)',
            display: 'flex',
            alignItems: 'center',
            gap: 10
          }}
        >
          {notice.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
          <span>{notice.text}</span>
        </div>
      )}

      {/* Tabs navigation */}
      <div className="step-strip" style={{ marginBottom: 22 }}>
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className={`step-button${activeTab === id ? ' is-current' : ''}`}
            onClick={() => setActiveTab(id)}
          >
            <Icon size={16} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }} />
            {label}
          </button>
        ))}
      </div>

      {/* ═══ TAB 1: TÀI KHOẢN & FACEBOOK ═══ */}
      {activeTab === 'account' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 380px) 1fr', gap: 20 }}>
          {/* Card hồ sơ */}
          <section className="panel" style={{ padding: 24, textAlign: 'center' }}>
            <div
              style={{
                width: 88,
                height: 88,
                borderRadius: '50%',
                margin: '0 auto 16px',
                overflow: 'hidden',
                border: '2px solid #00f2fe',
                boxShadow: '0 0 20px rgba(0, 242, 254, 0.4)',
                background: 'linear-gradient(135deg, #00f2fe, #8b5cf6)'
              }}
            >
              {user?.avatar ? (
                <img
                  src={user.avatar}
                  alt={user.name}
                  referrerPolicy="no-referrer"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', fontSize: 32, fontWeight: 900, color: '#040812' }}>
                  {user?.name?.charAt(0)?.toUpperCase() || 'U'}
                </div>
              )}
            </div>

            <h2 style={{ fontSize: 20, margin: '0 0 6px', color: 'var(--ink)', fontWeight: 900 }}>{user?.name || 'Tài khoản Facebook'}</h2>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', background: 'rgba(37, 99, 235, 0.08)', borderRadius: 99, border: '1px solid rgba(37, 99, 235, 0.25)', fontSize: 11, fontWeight: 700, color: 'var(--blue)', marginBottom: 16 }}>
              <ShieldCheck size={13} /> {user?.role === 'admin' ? 'Quản trị viên (Admin)' : 'Thành viên'}
            </div>

            <div style={{ textAlign: 'left', background: 'var(--panel)', borderRadius: 12, padding: 14, border: '1px solid var(--line)', marginBottom: 20, fontSize: 12.5 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span className="muted">Facebook User ID:</span>
                <strong style={{ color: 'var(--ink)' }}>{user?.id || '—'}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span className="muted">Trạng thái Token:</span>
                <span style={{ color: '#10b981', fontWeight: 700 }}>Đã kích hoạt dài hạn</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="muted">Fanpage quản lý:</span>
                <strong style={{ color: 'var(--blue)' }}>{data.account.connectedPagesCount || 0} Fanpage</strong>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <a
                href={authApi.facebookLoginUrl}
                className="button button-primary"
                style={{ width: '100%', textDecoration: 'none' }}
              >
                <Globe2 size={16} /> Gia hạn / Cấp lại quyền Facebook
              </a>
              <button
                type="button"
                className="button button-danger"
                style={{ width: '100%' }}
                onClick={logout}
              >
                <LogOut size={16} /> Đăng xuất khỏi hệ thống
              </button>
            </div>
          </section>

          {/* Chi tiết quyền hạn & Meta App */}
          <section className="panel">
            <div className="panel-heading">
              <h2><KeyRound size={16} style={{ verticalAlign: 'middle', marginRight: 8, color: '#00f2fe' }} />Quyền hạn Meta Graph API</h2>
              <span className="status-pill published">Sẵn sàng</span>
            </div>
            <div className="panel-body">
              <p className="muted" style={{ lineHeight: 1.6, marginTop: 0 }}>
                Hệ thống sử dụng Meta Business App và Page Access Token để đăng bài viết, lên lịch, tải ảnh/video và đọc số liệu Insights tự động.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14, marginBottom: 20 }}>
                <div style={{ padding: 14, borderRadius: 12, background: 'var(--field-bg)', border: '1px solid var(--line)' }}>
                  <strong style={{ color: 'var(--ink)', display: 'block', marginBottom: 4 }}>Meta App ID</strong>
                  <code style={{ color: 'var(--blue)', background: 'rgba(37, 99, 235, 0.08)', padding: '2px 6px', borderRadius: 4 }}>
                    {data.system.metaAppId || '1397216959190868'}
                  </code>
                </div>
                <div style={{ padding: 14, borderRadius: 12, background: 'var(--field-bg)', border: '1px solid var(--line)' }}>
                  <strong style={{ color: 'var(--ink)', display: 'block', marginBottom: 4 }}>Phiên bản Graph API</strong>
                  <code style={{ color: 'var(--blue)', background: 'rgba(37, 99, 235, 0.08)', padding: '2px 6px', borderRadius: 4 }}>v19.0</code>
                </div>
              </div>

              <strong style={{ color: 'var(--ink)', display: 'block', marginBottom: 10 }}>Danh sách quyền (Scopes) đã kết nối:</strong>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                {[
                  { name: 'pages_manage_posts', desc: 'Đăng tải nội dung, ảnh, video lên Fanpage' },
                  { name: 'pages_read_engagement', desc: 'Đọc tương tác bài viết, reaction, bình luận' },
                  { name: 'read_insights', desc: 'Lấy dữ liệu thống kê tăng trưởng Fanpage' },
                  { name: 'pages_show_list', desc: 'Hiển thị danh sách Fanpage đang sở hữu' }
                ].map((scope) => (
                  <div key={scope.name} style={{ padding: 12, borderRadius: 10, background: 'rgba(16, 185, 129, 0.04)', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                    <div style={{ color: '#10b981', fontWeight: 800, fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Check size={14} /> {scope.name}
                    </div>
                    <small className="muted" style={{ fontSize: 11, display: 'block', marginTop: 3 }}>{scope.desc}</small>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 22, paddingTop: 16, borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="muted" style={{ fontSize: 12 }}>Muốn kết nối thêm Fanpage mới bằng Token thủ công?</span>
                <Link href="/channels" className="button button-secondary" style={{ fontSize: 12, minHeight: 32 }}>
                  Quản lý Kênh Fanpage <ExternalLink size={12} />
                </Link>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* ═══ TAB 2: CẤU HÌNH AI STUDIO ═══ */}
      {activeTab === 'ai' && (
        <form onSubmit={handleSave} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(300px, 0.8fr)', gap: 20 }}>
          <section className="panel">
            <div className="panel-heading">
              <h2><Sparkles size={16} style={{ verticalAlign: 'middle', marginRight: 8, color: '#00f2fe' }} />Nhà cung cấp & Model Trí tuệ nhân tạo (AI)</h2>
              <span className={`status-pill ${data.settings.ai_has_key ? 'published' : 'pending'}`}>
                {data.settings.ai_has_key ? 'Đã kích hoạt' : 'Chưa nhập Key'}
              </span>
            </div>
            <div className="panel-body">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16, marginBottom: 18 }}>
                <div>
                  <label className="field-label" htmlFor="ai-provider">Nhà cung cấp AI (Provider)</label>
                  <select
                    id="ai-provider"
                    className="field"
                    value={data.settings.ai_provider}
                    onChange={handleProviderChange}
                  >
                    {aiProviders.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="field-label" htmlFor="ai-model">Model AI</label>
                  <input
                    id="ai-model"
                    className="field"
                    placeholder="Ví dụ: gpt-4o-mini, gemini-1.5-flash..."
                    value={data.settings.ai_model}
                    onChange={(e) => setData({ ...data, settings: { ...data.settings, ai_model: e.target.value } })}
                    required
                  />
                </div>
              </div>

              <div style={{ marginBottom: 18 }}>
                <label className="field-label" htmlFor="ai-base-url">API Base URL (Endpoint)</label>
                <input
                  id="ai-base-url"
                  className="field"
                  placeholder="https://api.openai.com/v1"
                  value={data.settings.ai_base_url}
                  onChange={(e) => setData({ ...data, settings: { ...data.settings, ai_base_url: e.target.value } })}
                  required
                />
              </div>

              <div style={{ marginBottom: 18 }}>
                <label className="field-label" htmlFor="ai-api-key">
                  AI API Key {data.settings.ai_has_key && <span style={{ color: '#10b981', fontWeight: 600 }}>({data.settings.ai_api_key_masked})</span>}
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="ai-api-key"
                    className="field"
                    type={showApiKey ? 'text' : 'password'}
                    placeholder={data.settings.ai_has_key ? 'Nhập key mới nếu bạn muốn thay đổi...' : 'sk-proj-... hoặc AIzaSy...'}
                    value={newApiKey}
                    onChange={(e) => setNewApiKey(e.target.value)}
                    style={{ paddingRight: 42 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}
                  >
                    {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <small className="muted" style={{ display: 'block', marginTop: 6, fontSize: 11.5 }}>
                  Khóa API được mã hóa an toàn trên máy chủ. Bạn có thể sử dụng API Key từ OpenAI, DeepSeek hoặc Gemini.
                </small>
              </div>

              <div style={{ marginBottom: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <label className="field-label" style={{ margin: 0 }} htmlFor="ai-prompt">Giọng văn & Chỉ dẫn AI mặc định (System Prompt)</label>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {tonePresets.map((preset) => (
                      <button
                        key={preset.name}
                        type="button"
                        className="button button-quiet"
                        style={{ fontSize: 11, minHeight: 24, padding: '0 8px' }}
                        onClick={() => setData({ ...data, settings: { ...data.settings, ai_system_prompt: preset.prompt } })}
                      >
                        {preset.name}
                      </button>
                    ))}
                  </div>
                </div>
                <textarea
                  id="ai-prompt"
                  className="field"
                  rows={4}
                  placeholder="Định hình phong cách, ngôn từ và giọng điệu mà AI sẽ áp dụng khi viết bài..."
                  value={data.settings.ai_system_prompt}
                  onChange={(e) => setData({ ...data, settings: { ...data.settings, ai_system_prompt: e.target.value } })}
                  style={{ lineHeight: 1.5 }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24 }}>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={handleTestAi}
                  disabled={testingAi || (!data.settings.ai_has_key && !newApiKey.trim())}
                >
                  <Zap size={15} style={{ color: '#00f2fe' }} /> {testingAi ? 'Đang kiểm tra AI…' : 'Kiểm tra kết nối AI'}
                </button>
                <button type="submit" className="button button-primary" disabled={saving}>
                  <Save size={15} /> {saving ? 'Đang lưu…' : 'Lưu cấu hình AI'}
                </button>
              </div>
            </div>
          </section>

          {/* Hộp thử nghiệm & Hướng dẫn */}
          <div>
            <section className="panel" style={{ marginBottom: 16 }}>
              <div className="panel-heading"><h2>Kết quả kiểm tra AI</h2></div>
              <div className="panel-body">
                {testingAi ? (
                  <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--muted)' }}>
                    <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 10px', color: '#00f2fe' }} />
                    <p style={{ margin: 0, fontSize: 13 }}>Đang gửi prompt thử nghiệm tới AI model…</p>
                  </div>
                ) : aiTestResult ? (
                  <div style={{ padding: 14, borderRadius: 10, background: aiTestResult.success ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)', border: `1px solid ${aiTestResult.success ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}` }}>
                    <div style={{ color: aiTestResult.success ? '#10b981' : '#ef4444', fontWeight: 800, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {aiTestResult.success ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                      {aiTestResult.success ? 'AI phản hồi thành công:' : 'Lỗi kết nối:'}
                    </div>
                    <div style={{ fontSize: 12.5, color: 'var(--ink)', fontStyle: 'italic', lineHeight: 1.5 }}>
                      &ldquo;{aiTestResult.message}&rdquo;
                    </div>
                  </div>
                ) : (
                  <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.6 }}>
                    Bấm nút <strong>&ldquo;Kiểm tra kết nối AI&rdquo;</strong> sau khi điền API Key để hệ thống kiểm tra xem model có hoạt động chuẩn xác hay không.
                  </div>
                )}
              </div>
            </section>

            <section className="panel">
              <div className="panel-heading"><h2>Gợi ý lấy API Key</h2></div>
              <div className="panel-body" style={{ fontSize: 12, lineHeight: 1.6 }}>
                <p style={{ margin: '0 0 10px' }} className="muted">Bạn có thể tạo API Key từ các nền tảng sau:</p>
                <ul style={{ paddingLeft: 18, margin: 0 }} className="muted">
                  <li style={{ marginBottom: 6 }}><a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer" style={{ color: '#00f2fe', textDecoration: 'underline' }}>OpenAI Platform</a> (khuyên dùng `gpt-4o-mini`)</li>
                  <li style={{ marginBottom: 6 }}><a href="https://platform.deepseek.com/" target="_blank" rel="noreferrer" style={{ color: '#00f2fe', textDecoration: 'underline' }}>DeepSeek API</a> (rẻ và viết tiếng Việt rất tốt)</li>
                  <li><a href="https://aistudio.google.com/" target="_blank" rel="noreferrer" style={{ color: '#00f2fe', textDecoration: 'underline' }}>Google AI Studio</a> (Gemini 1.5 Flash)</li>
                </ul>
              </div>
            </section>
          </div>
        </form>
      )}

      {/* ═══ TAB 3: GIÁM SÁT & BOT TELEGRAM (MODULE 2) ═══ */}
      {activeTab === 'telegram' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.25fr) minmax(340px, 0.95fr)', gap: 20 }}>
          {/* CỘT TRÁI: CẤU HÌNH BOT TELEGRAM */}
          <form onSubmit={handleSave}>
            <section className="panel" style={{ marginBottom: 20 }}>
              <div className="panel-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2><Bell size={16} style={{ verticalAlign: 'middle', marginRight: 8, color: '#00f2fe' }} />Bot Cảnh Báo Telegram Real-time</h2>
                {data.settings.telegram_has_token && data.settings.telegram_chat_id ? (
                  <span className="status-pill published" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                    <Check size={12} /> Đã kích hoạt Bot
                  </span>
                ) : (
                  <span className="status-pill draft" style={{ fontSize: 11 }}>Chưa thiết lập</span>
                )}
              </div>
              <div className="panel-body">
                {/* Switch Bật/Tắt Cảnh báo */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)', marginBottom: 20 }}>
                  <div>
                    <strong style={{ color: 'var(--ink)', fontSize: 13.5, display: 'block', marginBottom: 2 }}>Kích hoạt hệ thống cảnh báo Telegram</strong>
                    <span className="muted" style={{ fontSize: 11.5 }}>Gửi thông báo tức thì về tài khoản hoặc nhóm Telegram của bạn</span>
                  </div>
                  <label style={{ position: 'relative', display: 'inline-block', width: 44, height: 24, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={data.settings.telegram_alert_enabled}
                      onChange={(e) => setData({ ...data, settings: { ...data.settings, telegram_alert_enabled: e.target.checked } })}
                      style={{ opacity: 0, width: 0, height: 0 }}
                    />
                    <span
                      style={{
                        position: 'absolute',
                        cursor: 'pointer',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: data.settings.telegram_alert_enabled ? '#00f2fe' : 'rgba(255,255,255,0.15)',
                        borderRadius: 24,
                        transition: '.25s'
                      }}
                    >
                      <span
                        style={{
                          position: 'absolute',
                          height: 18,
                          width: 18,
                          left: data.settings.telegram_alert_enabled ? 23 : 3,
                          bottom: 3,
                          backgroundColor: data.settings.telegram_alert_enabled ? '#040812' : '#fff',
                          borderRadius: '50%',
                          transition: '.25s'
                        }}
                      />
                    </span>
                  </label>
                </div>

                {/* Telegram Bot Token */}
                <div style={{ marginBottom: 18 }}>
                  <label className="field-label">
                    Telegram Bot Token {data.settings.telegram_has_token && <span style={{ color: '#10b981', fontSize: 11 }}>• Đã lưu ({data.settings.telegram_bot_token_masked})</span>}
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      className="field"
                      type={showTelegramToken ? 'text' : 'password'}
                      value={newTelegramToken}
                      onChange={(e) => setNewTelegramToken(e.target.value)}
                      placeholder={data.settings.telegram_has_token ? 'Nhập Bot Token mới nếu muốn đổi…' : 'Ví dụ: 7894561230:AAHi98_xYz0123456789...'}
                      style={{ paddingRight: 40, width: '100%', fontFamily: newTelegramToken ? 'monospace' : 'inherit' }}
                    />
                    <button
                      type="button"
                      className="button button-quiet"
                      onClick={() => setShowTelegramToken(!showTelegramToken)}
                      style={{ position: 'absolute', right: 4, top: 4, bottom: 4, minHeight: 0, padding: '0 8px' }}
                      title={showTelegramToken ? 'Ẩn token' : 'Hiện token'}
                    >
                      {showTelegramToken ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  <small className="muted" style={{ display: 'block', marginTop: 6, fontSize: 11.5 }}>
                    Tạo Bot thông qua <strong>@BotFather</strong> trên Telegram để nhận Token này.
                  </small>
                </div>

                {/* Telegram Chat ID */}
                <div style={{ marginBottom: 20 }}>
                  <label className="field-label">Telegram Chat ID (ID cá nhân hoặc Nhóm)</label>
                  <input
                    className="field"
                    type="text"
                    value={data.settings.telegram_chat_id || ''}
                    onChange={(e) => setData({ ...data, settings: { ...data.settings, telegram_chat_id: e.target.value } })}
                    placeholder="Ví dụ: 123456789 (chat riêng) hoặc -1001234567890 (nhóm chat)..."
                    style={{ width: '100%', fontFamily: 'monospace' }}
                  />
                  <small className="muted" style={{ display: 'block', marginTop: 6, fontSize: 11.5 }}>
                    Chat với bot <strong>@userinfobot</strong> hoặc thêm bot vào nhóm và lấy Chat ID.
                  </small>
                </div>

                {/* Tùy chọn sự kiện nhận cảnh báo */}
                <div style={{ marginBottom: 22, padding: '14px', background: 'var(--field-bg)', borderRadius: 10, border: '1px solid var(--line)' }}>
                  <label className="field-label" style={{ marginBottom: 10 }}>Các sự kiện kích hoạt cảnh báo:</label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, cursor: 'pointer', fontSize: 12.5, color: 'var(--ink)' }}>
                    <input
                      type="checkbox"
                      checked={data.settings.telegram_alert_on_expired}
                      onChange={(e) => setData({ ...data, settings: { ...data.settings, telegram_alert_on_expired: e.target.checked } })}
                      style={{ accentColor: 'var(--blue)', width: 16, height: 16 }}
                    />
                    <span>🚨 Cảnh báo ngay khi <strong>Token Fanpage hết hạn / bị thu hồi quyền</strong></span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 12.5, color: 'var(--ink)' }}>
                    <input
                      type="checkbox"
                      checked={data.settings.telegram_alert_on_failed}
                      onChange={(e) => setData({ ...data, settings: { ...data.settings, telegram_alert_on_failed: e.target.checked } })}
                      style={{ accentColor: 'var(--blue)', width: 16, height: 16 }}
                    />
                    <span>⚠️ Cảnh báo khẩn cấp khi <strong>bài đăng xuất bản Facebook thất bại</strong></span>
                  </label>
                </div>

                {/* Hộp phản hồi thử nghiệm kết nối Telegram */}
                {telegramTestResult && (
                  <div style={{
                    marginBottom: 18,
                    padding: 12,
                    borderRadius: 10,
                    background: telegramTestResult.success ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                    border: `1px solid ${telegramTestResult.success ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                    fontSize: 12.5,
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8
                  }}>
                    {telegramTestResult.success ? <CheckCircle2 size={16} color="#10b981" style={{ flexShrink: 0, marginTop: 2 }} /> : <AlertCircle size={16} color="#ef4444" style={{ flexShrink: 0, marginTop: 2 }} />}
                    <div style={{ color: telegramTestResult.success ? '#10b981' : '#f87171', lineHeight: 1.5 }}>
                      <strong>{telegramTestResult.success ? 'Kết nối thành công!' : 'Lỗi kết nối:'}</strong> {telegramTestResult.message}
                    </div>
                  </div>
                )}

                {/* Hàng nút bấm Hành Động */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={handleTestTelegram}
                    disabled={testingTelegram}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <Send size={14} /> {testingTelegram ? 'Đang gửi test…' : 'Gửi tin nhắn test'}
                  </button>
                  <button type="submit" className="button button-primary" disabled={saving}>
                    <Save size={15} /> {saving ? 'Đang lưu…' : 'Lưu cấu hình Telegram'}
                  </button>
                </div>
              </div>
            </section>
          </form>

          {/* CỘT PHẢI: TRUNG TÂM GIÁM SÁT SỨC KHỎE TOKEN */}
          <div>
            <section className="panel" style={{ marginBottom: 20 }}>
              <div className="panel-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2><ShieldCheck size={16} style={{ verticalAlign: 'middle', marginRight: 8, color: '#00f2fe' }} />Sức Khỏe Token Fanpage</h2>
                <span className="status-pill published" style={{ fontSize: 11 }}>Quét mỗi 6h</span>
              </div>
              <div className="panel-body">
                <p className="muted" style={{ fontSize: 12, lineHeight: 1.6, margin: '0 0 16px' }}>
                  Hệ thống tự động kiểm tra token chạy ngầm. Khi phát hiện bất kỳ Fanpage nào bị mất quyền, bot sẽ gửi cảnh báo tức thì kèm hướng dẫn xử lý.
                </p>

                <div style={{ marginBottom: 18 }}>
                  <button
                    type="button"
                    className="button button-primary"
                    style={{ width: '100%', justifyContent: 'center', gap: 8, minHeight: 38 }}
                    onClick={handleRunHealthCheck}
                    disabled={runningHealthCheck}
                  >
                    <Activity size={16} className={runningHealthCheck ? 'animate-spin' : ''} />
                    {runningHealthCheck ? 'Đang kiểm tra toàn bộ Token…' : 'Quét kiểm tra sức khỏe Token ngay'}
                  </button>
                </div>

                {/* Kết quả quét */}
                {healthCheckResult && (
                  <div>
                    {healthCheckResult.success && healthCheckResult.summary ? (
                      <div>
                        {/* 3 Thẻ thống kê */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>
                          <div style={{ padding: '10px 8px', textAlign: 'center', background: 'var(--panel)', borderRadius: 8, border: '1px solid var(--line)' }}>
                            <div className="muted" style={{ fontSize: 10 }}>Tổng Fanpage</div>
                            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)', marginTop: 2 }}>{healthCheckResult.summary.total}</div>
                          </div>
                          <div style={{ padding: '10px 8px', textAlign: 'center', background: 'rgba(16,185,129,0.06)', borderRadius: 8, border: '1px solid rgba(16,185,129,0.2)' }}>
                            <div style={{ fontSize: 10, color: '#10b981' }}>Token Sống</div>
                            <div style={{ fontSize: 18, fontWeight: 800, color: '#10b981', marginTop: 2 }}>{healthCheckResult.summary.valid}</div>
                          </div>
                          <div style={{ padding: '10px 8px', textAlign: 'center', background: healthCheckResult.summary.expired > 0 ? 'rgba(239,68,68,0.08)' : 'var(--panel)', borderRadius: 8, border: `1px solid ${healthCheckResult.summary.expired > 0 ? 'rgba(239,68,68,0.3)' : 'var(--line)'}` }}>
                            <div style={{ fontSize: 10, color: healthCheckResult.summary.expired > 0 ? '#ef4444' : 'var(--muted)' }}>Hết hạn / Lỗi</div>
                            <div style={{ fontSize: 18, fontWeight: 800, color: healthCheckResult.summary.expired > 0 ? '#ef4444' : 'var(--ink)', marginTop: 2 }}>{healthCheckResult.summary.expired}</div>
                          </div>
                        </div>

                        {/* Danh sách Pages */}
                        <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 8, padding: 6, background: 'var(--field-bg)' }}>
                          {healthCheckResult.summary.pages?.map((p) => (
                            <div key={p.pageId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', borderBottom: '1px solid var(--line)', fontSize: 12 }}>
                              <div style={{ minWidth: 0, flex: 1, paddingRight: 8 }}>
                                <div style={{ color: 'var(--ink)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                                {p.error && <div style={{ fontSize: 10.5, color: '#f87171' }}>{p.error}</div>}
                              </div>
                              <span className={`status-pill ${p.isValid ? 'published' : 'failed'}`} style={{ fontSize: 10, padding: '2px 8px' }}>
                                {p.isValid ? 'Sống' : 'Hết hạn'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div style={{ padding: 12, borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#fca5a5', fontSize: 12 }}>
                        {healthCheckResult.message}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>

            {/* Hướng dẫn kết nối Telegram */}
            <section className="panel">
              <div className="panel-heading"><h2>3 Bước tạo Telegram Bot</h2></div>
              <div className="panel-body" style={{ fontSize: 12, lineHeight: 1.6 }}>
                <ol style={{ paddingLeft: 18, margin: 0 }} className="muted">
                  <li style={{ marginBottom: 8 }}>
                    Mở Telegram, chat với <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" style={{ color: '#00f2fe', textDecoration: 'underline' }}>@BotFather</a>, gõ lệnh <code>/newbot</code> và làm theo hướng dẫn để nhận <strong>HTTP API Token</strong>.
                  </li>
                  <li style={{ marginBottom: 8 }}>
                    Để lấy <strong>Chat ID cá nhân</strong>: Chat với <a href="https://t.me/userinfobot" target="_blank" rel="noreferrer" style={{ color: '#00f2fe', textDecoration: 'underline' }}>@userinfobot</a>. Hoặc để nhận vào nhóm: thêm Bot vào nhóm rồi thêm <a href="https://t.me/RawDataBot" target="_blank" rel="noreferrer" style={{ color: '#00f2fe', textDecoration: 'underline' }}>@RawDataBot</a> để xem Chat ID nhóm.
                  </li>
                  <li>
                    Nhập Token và Chat ID vào bảng bên cạnh, bấm <strong>&ldquo;Gửi tin nhắn test&rdquo;</strong> để xác nhận kết nối rồi bấm Lưu.
                  </li>
                </ol>
              </div>
            </section>
          </div>
        </div>
      )}

      {/* ═══ TAB 4: ĐĂNG BÀI & LỊCH TRÌNH ═══ */}
      {activeTab === 'publishing' && (
        <form onSubmit={handleSave} style={{ maxWidth: 840 }}>
          <section className="panel">
            <div className="panel-heading">
              <h2><Clock size={16} style={{ verticalAlign: 'middle', marginRight: 8, color: '#00f2fe' }} />Cấu hình Lên lịch & An toàn Fanpage</h2>
            </div>
            <div className="panel-body">
              <div style={{ marginBottom: 20 }}>
                <label className="field-label" htmlFor="safe-interval">
                  Khoảng cách tối thiểu giữa 2 bài đăng liên tiếp (Phút)
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <input
                    id="safe-interval"
                    type="number"
                    min="1"
                    max="1440"
                    className="field"
                    style={{ width: 140 }}
                    value={data.settings.post_interval_minutes}
                    onChange={(e) => setData({ ...data, settings: { ...data.settings, post_interval_minutes: parseInt(e.target.value, 10) || 15 } })}
                  />
                  <span className="muted" style={{ fontSize: 12 }}>phút giữa các bài trên cùng 1 Fanpage</span>
                </div>
                <small className="muted" style={{ display: 'block', marginTop: 6, fontSize: 11.5 }}>
                  🛡️ <em>Khuyến nghị:</em> Đặt từ 15 - 30 phút trở lên để tránh Fanpage bị Facebook đánh dấu là spam hoặc giảm tương tác.
                </small>
              </div>

              <div style={{ marginBottom: 20 }}>
                <label className="field-label" htmlFor="retry-count">
                  Số lần tự động thử lại khi đăng bài thất bại
                </label>
                <select
                  id="retry-count"
                  className="field"
                  style={{ width: 220 }}
                  value={data.settings.auto_retry_count}
                  onChange={(e) => setData({ ...data, settings: { ...data.settings, auto_retry_count: parseInt(e.target.value, 10) || 0 } })}
                >
                  <option value={0}>Không thử lại (Báo lỗi ngay)</option>
                  <option value={1}>Thử lại 1 lần sau 5 phút</option>
                  <option value={2}>Thử lại 2 lần (Khuyên nghị)</option>
                  <option value={3}>Thử lại 3 lần</option>
                </select>
              </div>

              <div style={{ marginBottom: 20 }}>
                <label className="field-label" htmlFor="default-hashtags">Hashtag mặc định</label>
                <input
                  id="default-hashtags"
                  className="field"
                  placeholder="#kinhdoanh #marketing #viral #xuhuong"
                  value={data.settings.default_hashtags}
                  onChange={(e) => setData({ ...data, settings: { ...data.settings, default_hashtags: e.target.value } })}
                />
                <small className="muted" style={{ display: 'block', marginTop: 6, fontSize: 11.5 }}>
                  Các hashtag này sẽ hiển thị sẵn khi bạn bấm chọn &ldquo;Thêm Hashtag&rdquo; trong màn hình soạn thảo.
                </small>
              </div>

              <div style={{ marginBottom: 24 }}>
                <label className="field-label" htmlFor="default-signature">Chữ ký cuối bài viết mặc định</label>
                <textarea
                  id="default-signature"
                  className="field"
                  rows={3}
                  placeholder="Ví dụ: 🌐 Website: https://... | ☎️ Hotline: 098... | 📌 Hãy Follow page để nhận thông tin mới!"
                  value={data.settings.default_signature}
                  onChange={(e) => setData({ ...data, settings: { ...data.settings, default_signature: e.target.value } })}
                />
                <small className="muted" style={{ display: 'block', marginTop: 6, fontSize: 11.5 }}>
                  Chữ ký thương hiệu giúp bạn chèn nhanh link website, hotline hoặc lời kêu gọi vào cuối mỗi bài đăng.
                </small>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                <button type="submit" className="button button-primary" disabled={saving}>
                  <Save size={15} /> {saving ? 'Đang lưu…' : 'Lưu cấu hình đăng bài'}
                </button>
              </div>
            </div>
          </section>
        </form>
      )}

      {/* ═══ TAB 4: HỆ THỐNG & GIAO DIỆN ═══ */}
      {activeTab === 'system' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(300px, 0.8fr)', gap: 20 }}>
          <section className="panel">
            <div className="panel-heading">
              <h2><Palette size={16} style={{ verticalAlign: 'middle', marginRight: 8, color: '#00f2fe' }} />Tùy chọn giao diện & Hiệu ứng</h2>
            </div>
            <div className="panel-body">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0', borderBottom: '1px solid var(--line)' }}>
                <div>
                  <strong style={{ color: 'var(--ink)', display: 'block', marginBottom: 4 }}>Hiệu ứng đèn viền LED RGB chạy tròn (spinLED)</strong>
                  <span className="muted" style={{ fontSize: 12 }}>
                    Hiển thị dải viền LED RGB xoay tròn nhiều màu ở thẻ banner, nút AI Writer và các Fanpage đã chọn.
                  </span>
                </div>
                <label style={{ position: 'relative', display: 'inline-block', width: 44, height: 24, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={data.settings.enable_rgb_effects}
                    onChange={(e) => setData({ ...data, settings: { ...data.settings, enable_rgb_effects: e.target.checked } })}
                    style={{ opacity: 0, width: 0, height: 0 }}
                  />
                  <span
                    style={{
                      position: 'absolute',
                      cursor: 'pointer',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      backgroundColor: data.settings.enable_rgb_effects ? '#00f2fe' : 'rgba(255,255,255,0.15)',
                      borderRadius: 24,
                      transition: '.25s'
                    }}
                  >
                    <span
                      style={{
                        position: 'absolute',
                        height: 18,
                        width: 18,
                        left: data.settings.enable_rgb_effects ? 23 : 3,
                        bottom: 3,
                        backgroundColor: data.settings.enable_rgb_effects ? '#040812' : '#fff',
                        borderRadius: '50%',
                        transition: '.25s'
                      }}
                    />
                  </span>
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0', borderBottom: '1px solid var(--line)' }}>
                <div>
                  <strong style={{ color: 'var(--ink)', display: 'block', marginBottom: 4 }}>Bộ nhớ đệm trình duyệt (Client Cache)</strong>
                  <span className="muted" style={{ fontSize: 12 }}>
                    Xóa cache dữ liệu tạm thời trên trình duyệt để tải lại thông tin mới nhất.
                  </span>
                </div>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => {
                    if (typeof window !== 'undefined') {
                      localStorage.clear();
                      sessionStorage.clear();
                      alert('Đã xóa bộ nhớ đệm trình duyệt thành công!');
                    }
                  }}
                >
                  Xóa bộ nhớ đệm
                </button>
              </div>

              <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end' }}>
                <button type="button" className="button button-primary" onClick={handleSave} disabled={saving}>
                  <Save size={15} /> {saving ? 'Đang lưu…' : 'Lưu tùy chọn'}
                </button>
              </div>
            </div>
          </section>

          {/* Trạng thái dịch vụ máy chủ */}
          <section className="panel">
            <div className="panel-heading">
              <h2><Server size={16} style={{ verticalAlign: 'middle', marginRight: 8, color: '#00f2fe' }} />Trạng thái hệ thống</h2>
              <span className="status-pill published">Hoạt động</span>
            </div>
            <div className="panel-body" style={{ fontSize: 12.5 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <span className="muted" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Globe2 size={14} /> Frontend UI:</span>
                <span style={{ color: '#10b981', fontWeight: 700 }}>Next.js (Port 3000)</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <span className="muted" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Server size={14} /> Backend API:</span>
                <span style={{ color: '#10b981', fontWeight: 700 }}>Express Node {data.system.nodeVersion || 'v22'} (Port 5000)</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <span className="muted" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Database size={14} /> Cơ sở dữ liệu:</span>
                <span style={{ color: '#10b981', fontWeight: 700 }}>SQL Server (tool_face_db)</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <span className="muted" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><HardDrive size={14} /> Hàng đợi đăng bài:</span>
                <span style={{ color: '#10b981', fontWeight: 700 }}>Redis & BullMQ (Port 6379)</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0' }}>
                <span className="muted" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Clock size={14} /> Giờ máy chủ:</span>
                <span style={{ color: 'var(--ink)' }}>{new Date().toLocaleTimeString('vi-VN')}</span>
              </div>
            </div>
          </section>
        </div>
      )}
    </MainLayout>
  );
}
