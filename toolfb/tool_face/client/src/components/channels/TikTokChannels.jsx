import { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  RefreshCw,
  Trash2,
  ShieldCheck,
  ShieldAlert,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  HelpCircle,
  X,
  KeyRound
} from 'lucide-react';
import channelApi from '../../services/channelApi';
import PlatformIcon from '../PlatformIcon';

export default function TikTokChannels({ onCountChange }) {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState(null);

  // Modal thêm tài khoản
  const [showAddModal, setShowAddModal] = useState(false);
  const [cookiesInput, setCookiesInput] = useState('');
  const [nicknameInput, setNicknameInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Kiểm tra tài khoản
  const [checkingId, setCheckingId] = useState(null);

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await channelApi.tiktokAccounts();
      const list = res.accounts || [];
      setAccounts(list);
      onCountChange?.(list.length);
    } catch (err) {
      setNotice({
        tone: 'error',
        text: err.response?.data?.message || 'Không thể tải danh sách tài khoản TikTok.'
      });
    } finally {
      setLoading(false);
    }
  }, [onCountChange]);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  const handleAddAccount = async (e) => {
    e.preventDefault();
    if (!cookiesInput.trim()) {
      setNotice({ tone: 'error', text: 'Vui lòng dán Cookie hoặc Session ID của tài khoản TikTok.' });
      return;
    }

    setSubmitting(true);
    setNotice(null);
    try {
      const res = await channelApi.addTikTokAccount(cookiesInput.trim(), nicknameInput.trim());
      setNotice({ tone: 'ok', text: res.message || 'Liên kết tài khoản TikTok thành công!' });
      setShowAddModal(false);
      setCookiesInput('');
      setNicknameInput('');
      loadAccounts();
    } catch (err) {
      setNotice({
        tone: 'error',
        text: err.response?.data?.message || err.message || 'Không thể liên kết tài khoản TikTok.'
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCheckAccount = async (id) => {
    setCheckingId(id);
    setNotice(null);
    try {
      const res = await channelApi.checkTikTokAccount(id);
      setNotice({ tone: res.status === 'active' ? 'ok' : 'error', text: res.message });
      loadAccounts();
    } catch (err) {
      setNotice({
        tone: 'error',
        text: err.response?.data?.message || 'Không thể kiểm tra trạng thái tài khoản.'
      });
    } finally {
      setCheckingId(null);
    }
  };

  const handleDeleteAccount = async (id, name) => {
    if (!window.confirm(`Bạn có chắc chắn muốn ngắt kết nối tài khoản TikTok "${name}"?`)) {
      return;
    }
    try {
      await channelApi.deleteTikTokAccount(id);
      setNotice({ tone: 'ok', text: 'Đã xóa tài khoản TikTok thành công.' });
      loadAccounts();
    } catch (err) {
      setNotice({
        tone: 'error',
        text: err.response?.data?.message || 'Không thể xóa tài khoản.'
      });
    }
  };

  return (
    <div className="tiktok-channels">
      {/* Thanh công cụ */}
      <div className="channels-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <strong style={{ fontSize: 16 }}>{accounts.length} tài khoản TikTok</strong>
          <span className="muted" style={{ marginLeft: 8, fontSize: 13.5 }}>
            Liên kết bằng Cookie / SessionID (Cách 2) để tự động hóa đăng video qua Puppeteer.
          </span>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            className="button button-secondary"
            onClick={loadAccounts}
            disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <RefreshCw size={15} className={loading ? 'spin' : ''} /> Làm mới
          </button>
          <button
            type="button"
            className="button button-primary"
            onClick={() => setShowAddModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#FE2C55', borderColor: '#FE2C55', color: '#fff' }}
          >
            <Plus size={16} /> Thêm tài khoản TikTok
          </button>
        </div>
      </div>

      {notice && (
        <div
          className={`notice settings-inline-notice ${notice.tone === 'error' ? 'is-error' : 'is-success'}`}
          style={{ marginBottom: 18 }}
        >
          {notice.tone === 'error' ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
          <span>{notice.text}</span>
        </div>
      )}

      {/* Danh sách tài khoản */}
      {loading ? (
        <div className="inbox-placeholder" style={{ padding: 40, textAlign: 'center' }}>
          <Loader2 size={24} className="spin" style={{ margin: '0 auto 10px' }} />
          <span>Đang tải danh sách tài khoản TikTok…</span>
        </div>
      ) : accounts.length === 0 ? (
        <section className="panel" style={{ padding: 48, textAlign: 'center', borderRadius: 16, border: '1px dashed rgba(255,255,255,0.15)' }}>
          <div style={{ margin: '0 auto 16px', display: 'inline-block' }}>
            <PlatformIcon platform="tiktok" size={54} />
          </div>
          <h3 style={{ fontSize: 18, marginBottom: 8 }}>Chưa có tài khoản TikTok nào được liên kết</h3>
          <p className="muted" style={{ maxWidth: 520, margin: '0 auto 20px', lineHeight: 1.6 }}>
            Hệ thống hỗ trợ tự động tải video lên kênh TikTok của bạn thông qua trình duyệt ngầm Puppeteer. Bạn chỉ cần dán Cookie đăng nhập một lần duy nhất.
          </p>
          <button
            type="button"
            className="button button-primary"
            onClick={() => setShowAddModal(true)}
            style={{ background: '#FE2C55', borderColor: '#FE2C55', color: '#fff', padding: '10px 22px' }}
          >
            <Plus size={16} /> Thêm tài khoản ngay
          </button>
        </section>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {accounts.map((acc) => {
            const isActive = acc.status === 'active';
            const isChecking = checkingId === acc.id;
            return (
              <div
                key={acc.id}
                className="panel"
                style={{
                  padding: '18px 20px',
                  borderRadius: 14,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 14,
                  position: 'relative',
                  border: isActive ? '1px solid rgba(37,244,238,0.2)' : '1px solid rgba(239,68,68,0.25)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ position: 'relative' }}>
                    {acc.avatar_url ? (
                      <img
                        src={acc.avatar_url}
                        alt={acc.nickname || acc.username}
                        style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover' }}
                      />
                    ) : (
                      <div
                        style={{
                          width: 48,
                          height: 48,
                          borderRadius: '50%',
                          background: '#111',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        <PlatformIcon platform="tiktok" size={24} />
                      </div>
                    )}
                    <span
                      style={{
                        position: 'absolute',
                        bottom: -2,
                        right: -2,
                        width: 14,
                        height: 14,
                        borderRadius: '50%',
                        backgroundColor: isActive ? '#10b981' : '#ef4444',
                        border: '2px solid #1a1a24'
                      }}
                      title={isActive ? 'Đang hoạt động' : 'Hết hạn Cookie'}
                    />
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {acc.nickname || acc.username}
                    </div>
                    <div className="muted" style={{ fontSize: 13 }}>
                      @{acc.username}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: isActive ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
                    fontSize: 12.5
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: isActive ? '#34d399' : '#f87171' }}>
                    {isActive ? <ShieldCheck size={14} /> : <ShieldAlert size={14} />}
                    {isActive ? 'Cookie hoạt động' : 'Cookie hết hạn / lỗi'}
                  </span>
                  <span className="muted" style={{ fontSize: 11.5 }}>
                    ID: #{acc.id}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 6 }}>
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => handleCheckAccount(acc.id)}
                    disabled={isChecking}
                    style={{ flex: 1, fontSize: 12.5, padding: '7px 10px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6 }}
                  >
                    <RefreshCw size={13} className={isChecking ? 'spin' : ''} />
                    {isChecking ? 'Đang test…' : 'Kiểm tra'}
                  </button>
                  <button
                    type="button"
                    className="button button-danger"
                    onClick={() => handleDeleteAccount(acc.id, acc.nickname || acc.username)}
                    style={{ padding: '7px 12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    title="Xóa tài khoản"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Thêm tài khoản TikTok */}
      {showAddModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.75)',
            backdropFilter: 'blur(4px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16
          }}
        >
          <div
            className="panel"
            style={{
              width: '100%',
              maxWidth: 580,
              borderRadius: 18,
              padding: 24,
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
              position: 'relative'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <PlatformIcon platform="tiktok" size={24} />
                <h3 style={{ margin: 0, fontSize: 17 }}>Liên kết tài khoản TikTok bằng Cookie</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Hướng dẫn lấy cookie */}
            <div
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 12,
                padding: '14px 16px',
                marginBottom: 20,
                fontSize: 13,
                lineHeight: 1.6
              }}
            >
              <div style={{ fontWeight: 600, color: '#25F4EE', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <HelpCircle size={15} /> Cách lấy Cookie TikTok nhanh nhất:
              </div>
              <ol style={{ margin: 0, paddingLeft: 18 }}>
                <li>Mở trình duyệt (Chrome/Edge) và đăng nhập vào <strong>tiktok.com</strong>.</li>
                <li>Cài tiện ích <strong>Cookie-Editor</strong> trên Chrome Web Store.</li>
                <li>Bấm vào icon Cookie-Editor trên thanh trình duyệt → Bấm nút <strong>Export</strong> (sao chép JSON hoặc Header String).</li>
                <li>Dán nội dung vừa sao chép vào khung bên dưới.</li>
              </ol>
            </div>

            <form onSubmit={handleAddAccount}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
                  Cookie hoặc Session ID <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <textarea
                  rows={5}
                  value={cookiesInput}
                  onChange={(e) => setCookiesInput(e.target.value)}
                  placeholder='Dán chuỗi cookie (ví dụ: sessionid=xxxx; ttwid=yyyy...) hoặc mảng JSON xuất từ Cookie-Editor...'
                  required
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: 10,
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    color: '#fff',
                    fontFamily: 'monospace',
                    fontSize: 12,
                    resize: 'vertical'
                  }}
                />
              </div>

              <div style={{ marginBottom: 22 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
                  Tên gợi nhớ cho kênh (Tùy chọn)
                </label>
                <input
                  type="text"
                  value={nicknameInput}
                  onChange={(e) => setNicknameInput(e.target.value)}
                  placeholder="Ví dụ: Kênh Bán Hàng, Review Công Nghệ..."
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: 10,
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    color: '#fff',
                    fontSize: 13.5
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setShowAddModal(false)}
                  disabled={submitting}
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="button button-primary"
                  disabled={submitting}
                  style={{ background: '#FE2C55', borderColor: '#FE2C55', color: '#fff', display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  {submitting ? (
                    <>
                      <Loader2 size={16} className="spin" /> Đang kiểm tra…
                    </>
                  ) : (
                    <>
                      <KeyRound size={16} /> Xác nhận liên kết
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
