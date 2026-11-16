import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { Globe2, KeyRound, Plus, RefreshCw, Trash2 } from 'lucide-react';
import CommentAiLayout from '../../components/layout/CommentAiLayout';
import useAuth from '../../hooks/useAuth';
import channelApi from '../../services/channelApi';

export default function FacebookChannelsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [channels, setChannels] = useState([]);
  const [token, setToken] = useState('');
  const [pageId, setPageId] = useState('');
  const [pageToken, setPageToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const response = await channelApi.list();
      setChannels(response.channels || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Không tải được danh sách Fanpage.');
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!router.isReady) return;
    if (router.query.connected) setNotice(`Đã kết nối Facebook. Đã đồng bộ ${router.query.connected} Fanpage.`);
    if (router.query.error) setError(`Kết nối Facebook chưa thành công (${router.query.error}).`);
  }, [router.isReady, router.query.connected, router.query.error]);

  const submit = async (action) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await action();
      setNotice(response.message || 'Đã kết nối Facebook.');
      setToken('');
      setPageId('');
      setPageToken('');
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể kết nối Fanpage.');
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async (id) => {
    if (!window.confirm('Ngắt kết nối Fanpage này?')) return;
    try {
      await channelApi.disconnect(id);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Không ngắt được Fanpage.');
    }
  };

  return (
    <CommentAiLayout title="Kết nối Facebook">
      {notice && <div className="notice" style={{ marginBottom: 14 }}>{notice}</div>}
      {error && <div className="notice" style={{ marginBottom: 14, color: '#dc2626' }}>{error}</div>}

      <section className="panel" style={{ marginBottom: 18 }}>
        <div className="panel-heading"><h2><Globe2 size={17} /> Kết nối bằng Facebook OAuth</h2></div>
        <div className="panel-body">
          <p className="muted">Đăng nhập Meta để tự đồng bộ các Fanpage bạn quản lý. Cần cấu hình Meta App ID và Secret ở máy chủ.</p>
          <a className="button button-primary" href={channelApi.facebookLoginUrl}>Tiếp tục với Facebook</a>
        </div>
      </section>

      <section className="panel" style={{ marginBottom: 18 }}>
        <div className="panel-heading"><h2><KeyRound size={17} /> Dán Facebook User Access Token</h2></div>
        <div className="panel-body" style={{ display: 'grid', gap: 10 }}>
          <p className="muted" style={{ marginTop: 0 }}>Token chỉ được gửi tới máy chủ để kiểm tra và lưu mã hóa; không lưu trong trình duyệt.</p>
          <textarea className="field" rows={3} value={token} onChange={(e) => setToken(e.target.value)} placeholder="Dán User Access Token có quyền quản lý Fanpage" autoComplete="off" />
          <div><button className="button button-primary" type="button" disabled={busy || !token.trim()} onClick={() => submit(() => channelApi.connectFacebookToken(token.trim()))}><Plus size={15} /> Đồng bộ Fanpage</button></div>
        </div>
      </section>

      <section className="panel" style={{ marginBottom: 18 }}>
        <div className="panel-heading"><h2>Kết nối Page Access Token thủ công</h2></div>
        <div className="panel-body" style={{ display: 'grid', gap: 10 }}>
          <input className="field" inputMode="numeric" value={pageId} onChange={(e) => setPageId(e.target.value)} placeholder="Facebook Page ID" />
          <textarea className="field" rows={2} value={pageToken} onChange={(e) => setPageToken(e.target.value)} placeholder="Page Access Token" autoComplete="off" />
          <div><button className="button button-secondary" type="button" disabled={busy || !pageId.trim() || !pageToken.trim()} onClick={() => submit(() => channelApi.addManual(pageId.trim(), pageToken.trim()))}><Plus size={15} /> Thêm Fanpage</button></div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <h2>Fanpage đã kết nối{user?.name ? ` · ${user.name}` : ''}</h2>
          <button className="button button-secondary" type="button" onClick={load}><RefreshCw size={15} /> Làm mới</button>
        </div>
        <div className="panel-body">
          {channels.length === 0 && <span className="muted">Chưa có Fanpage. Hãy kết nối bằng một trong các cách phía trên.</span>}
          {channels.map((channel) => (
            <div key={channel.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
              <div><strong>{channel.name}</strong><small className="muted" style={{ display: 'block' }}>ID: {channel.id}</small></div>
              <button type="button" className="button button-danger" onClick={() => disconnect(channel.id)} aria-label={`Ngắt kết nối ${channel.name}`}><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
      </section>
    </CommentAiLayout>
  );
}
