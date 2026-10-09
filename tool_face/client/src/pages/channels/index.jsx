import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import {
  Check,
  Globe2,
  Plus,
  RefreshCw,
  Trash2,
  KeyRound,
  ExternalLink,
  CircleHelp,
  PenSquare,
  Search,
  FolderPlus,
  Layers,
  Edit2,
  X,
  Users,
  ShieldCheck,
  ShieldAlert,
  Activity,
  Radio
} from 'lucide-react';
import MainLayout from '../../components/layout/MainLayout';
import channelApi from '../../services/channelApi';
import channelGroupApi from '../../services/channelGroupApi';

const PRESET_COLORS = ['#00f2fe', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#3b82f6', '#f43f5e'];

export default function ChannelsPage() {
  const [activeTab, setActiveTab] = useState('channels'); // 'channels' | 'groups' | 'accounts'
  const [channels, setChannels] = useState([]);
  const [groups, setGroups] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [selectedFbFilter, setSelectedFbFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Token health check state
  const [tokenStatuses, setTokenStatuses] = useState({});
  const [checkingTokens, setCheckingTokens] = useState(false);

  // Manual Page Token Modal
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualPageId, setManualPageId] = useState('');
  const [manualPageToken, setManualPageToken] = useState('');
  const [manualSaving, setManualSaving] = useState(false);

  // Connect Facebook User Token (Auto load all pages)
  const [showFbAccountModal, setShowFbAccountModal] = useState(false);
  const [fbAccountToken, setFbAccountToken] = useState('');
  const [fbAccountSaving, setFbAccountSaving] = useState(false);

  // Group Create/Edit Modal
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState(null);
  const [groupName, setGroupName] = useState('');
  const [groupColor, setGroupColor] = useState('#00f2fe');
  const [groupSelectedPages, setGroupSelectedPages] = useState([]);
  const [groupSaving, setGroupSaving] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const [chanRes, groupRes] = await Promise.allSettled([
        channelApi.list(true),
        channelGroupApi.list()
      ]);

      if (chanRes.status === 'fulfilled') {
        const val = chanRes.value || {};
        setChannels(val.channels || []);
        if (Array.isArray(val.accounts)) {
          setAccounts(val.accounts);
        }
      } else {
        setError(chanRes.reason?.response?.data?.message || 'Không tải được danh sách kênh.');
      }

      if (groupRes.status === 'fulfilled') {
        setGroups(groupRes.value.groups || []);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    handleCheckTokens();
  }, []);

  // Danh sách các tài khoản Facebook (gom nhóm từ accounts hoặc từ các page)
  const accountList = useMemo(() => {
    if (accounts && accounts.length > 0) return accounts;
    const map = {};
    for (const ch of channels) {
      const accId = ch.fbAccountId || 'manual';
      if (!map[accId]) {
        map[accId] = {
          id: accId,
          name: ch.fbAccountName || (accId === 'manual' ? 'Thêm thủ công / Token riêng' : 'Nick Facebook'),
          avatar: ch.fbAccountAvatar || null,
          pageCount: 0
        };
      }
      map[accId].pageCount += 1;
    }
    return Object.values(map);
  }, [accounts, channels]);

  const handleSyncAll = async () => {
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const res = await channelApi.syncAll();
      setNotice(res.message || 'Đã đồng bộ toàn bộ Fanpage từ các tài khoản Facebook!');
      await loadData();
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể đồng bộ Fanpage.');
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnectAccount = async (accId, accName) => {
    if (!confirm(`Bạn có chắc muốn xóa tài khoản Facebook "${accName}"? Toàn bộ Fanpage thuộc tài khoản này sẽ bị xóa khỏi hệ thống.`)) return;
    setLoading(true);
    setError('');
    setNotice('');
    try {
      await channelApi.disconnectAccount(accId);
      setNotice(`Đã xóa tài khoản Facebook "${accName}" thành công.`);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể xóa tài khoản Facebook.');
    } finally {
      setLoading(false);
    }
  };

  const handleConnectFacebook = async (e) => {
    e.preventDefault();
    if (!fbAccountToken.trim()) {
      setError('Vui lòng dán Facebook Access Token.');
      return;
    }
    setFbAccountSaving(true);
    setError('');
    setNotice('');
    try {
      const res = await channelApi.connectFacebookToken(fbAccountToken.trim());
      setNotice(res.message || `Đã kết nối thành công ${res.count || 0} Fanpage!`);
      setShowFbAccountModal(false);
      setFbAccountToken('');
      await loadData();
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Lỗi kết nối tài khoản Facebook.');
    } finally {
      setFbAccountSaving(false);
    }
  };

  const handleManualAdd = async (e) => {
    e.preventDefault();
    if (!manualPageId.trim() || !manualPageToken.trim()) {
      setError('Vui lòng điền đủ Page ID và Page Access Token.');
      return;
    }
    setManualSaving(true);
    setError('');
    setNotice('');
    try {
      const res = await channelApi.addManual(manualPageId.trim(), manualPageToken.trim());
      setNotice(res.message || 'Kết nối Fanpage thành công!');
      setShowManualModal(false);
      setManualPageId('');
      setManualPageToken('');
      await loadData();
    } catch (err) {
      setError(err.response?.data?.detail || err.response?.data?.message || 'Lỗi kết nối Page.');
    } finally {
      setManualSaving(false);
    }
  };

  const handleCheckTokens = async () => {
    setCheckingTokens(true);
    setNotice('');
    setError('');
    try {
      const res = await channelApi.checkTokens();
      if (res.success && Array.isArray(res.channels)) {
        const statusObj = {};
        let activeCount = 0;
        let expiredCount = 0;
        for (const item of res.channels) {
          statusObj[item.pageId] = item;
          if (item.isValid) activeCount++;
          else expiredCount++;
        }
        setTokenStatuses(statusObj);
        if (expiredCount === 0) {
          setNotice(`✅ Tất cả ${activeCount} Fanpage đều có Token hợp lệ và hoạt động tốt!`);
        } else {
          setError(`⚠️ Phát hiện ${expiredCount} Fanpage bị hết hạn hoặc mất quyền Token. Vui lòng cập nhật lại.`);
        }
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể kiểm tra hạn Token.');
    } finally {
      setCheckingTokens(false);
    }
  };

  const openUpdateTokenModal = (pageId) => {
    setManualPageId(pageId);
    setManualPageToken('');
    setShowManualModal(true);
  };

  const handleDisconnect = async (pageId, pageName) => {
    if (!confirm(`Bạn có chắc muốn hủy kết nối Fanpage "${pageName}"?`)) return;
    try {
      await channelApi.disconnect(pageId);
      setNotice(`Đã hủy kết nối Fanpage: ${pageName}`);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể hủy kết nối Page.');
    }
  };

  const openCreateGroupModal = () => {
    setEditingGroupId(null);
    setGroupName('');
    setGroupColor('#00f2fe');
    setGroupSelectedPages([]);
    setShowGroupModal(true);
  };

  const openEditGroupModal = (grp) => {
    setEditingGroupId(grp.id);
    setGroupName(grp.name);
    setGroupColor(grp.color || '#00f2fe');
    setGroupSelectedPages(Array.isArray(grp.pageIds) ? grp.pageIds : []);
    setShowGroupModal(true);
  };

  const togglePageInGroup = (pageId) => {
    setGroupSelectedPages((prev) =>
      prev.includes(pageId) ? prev.filter((id) => id !== pageId) : [...prev, pageId]
    );
  };

  const handleSaveGroup = async (e) => {
    e.preventDefault();
    if (!groupName.trim()) {
      setError('Vui lòng nhập tên nhóm kênh.');
      return;
    }
    setGroupSaving(true);
    setError('');
    setNotice('');
    try {
      if (editingGroupId) {
        await channelGroupApi.update(editingGroupId, {
          name: groupName.trim(),
          color: groupColor,
          pageIds: groupSelectedPages
        });
        setNotice(`Đã cập nhật nhóm kênh "${groupName.trim()}".`);
      } else {
        await channelGroupApi.create({
          name: groupName.trim(),
          color: groupColor,
          pageIds: groupSelectedPages
        });
        setNotice(`Đã tạo nhóm kênh "${groupName.trim()}" thành công!`);
      }
      setShowGroupModal(false);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.message || 'Lỗi khi lưu nhóm kênh.');
    } finally {
      setGroupSaving(false);
    }
  };

  const handleDeleteGroup = async (groupId, gName) => {
    if (!confirm(`Bạn có chắc chắn muốn xóa nhóm kênh "${gName}"? (Các Fanpage bên trong vẫn được giữ nguyên)`)) return;
    try {
      await channelGroupApi.delete(groupId);
      setNotice(`Đã xóa nhóm kênh "${gName}".`);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.message || 'Lỗi khi xóa nhóm kênh.');
    }
  };

  // Map of pageId to group names for badge display
  const pageGroupMap = useMemo(() => {
    const map = {};
    for (const g of groups) {
      if (Array.isArray(g.pageIds)) {
        for (const pid of g.pageIds) {
          if (!map[pid]) map[pid] = [];
          map[pid].push({ id: g.id, name: g.name, color: g.color });
        }
      }
    }
    return map;
  }, [groups]);

  return (
    <MainLayout
      title="Quản lý Kênh & Nhóm Fanpage"
      actions={
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="button button-primary" type="button" onClick={() => setShowFbAccountModal(!showFbAccountModal)}>
            <Plus size={15} /> Kết nối Facebook Token
          </button>
          <button className="button button-quiet" type="button" onClick={handleCheckTokens} disabled={checkingTokens}>
            <ShieldCheck size={15} style={{ color: '#10b981' }} /> {checkingTokens ? 'Đang quét Token…' : 'Kiểm tra Token'}
          </button>
          <button className="button button-quiet" type="button" onClick={() => setShowManualModal(!showManualModal)}>
            <KeyRound size={15} /> Thêm qua Page Token
          </button>
          <button className="button button-quiet" type="button" onClick={openCreateGroupModal}>
            <FolderPlus size={15} style={{ color: '#38bdf8' }} /> Tạo nhóm kênh
          </button>
          <button className="button button-secondary" type="button" onClick={handleSyncAll} disabled={loading}>
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Đồng bộ từ Facebook
          </button>
        </div>
      }
    >
      {notice && <div className="notice" style={{ marginBottom: 14, borderColor: 'rgba(16, 185, 129, 0.4)', color: '#10b981' }}>{notice}</div>}
      {error && <div className="notice" style={{ marginBottom: 14, borderColor: 'rgba(239, 68, 68, 0.4)', color: '#ef4444' }}>{error}</div>}

      {/* Tabs chuyển đổi giữa Kênh, Nhóm kênh và Tài khoản Facebook (Apple Frosted Glass) */}
      <div className="step-strip" role="tablist" style={{ marginBottom: 20 }}>
        <button
          type="button"
          onClick={() => setActiveTab('channels')}
          className={`step-button${activeTab === 'channels' ? ' is-current' : ''}`}
        >
          <Globe2 size={15} style={{ marginRight: 6 }} /> Tất cả Fanpage ({channels.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('groups')}
          className={`step-button${activeTab === 'groups' ? ' is-current' : ''}`}
        >
          <Layers size={15} style={{ marginRight: 6 }} /> Nhóm kênh ({groups.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('accounts')}
          className={`step-button${activeTab === 'accounts' ? ' is-current' : ''}`}
        >
          <Users size={15} style={{ marginRight: 6 }} /> Nick Facebook đã kết nối ({accountList.length})
        </button>
      </div>

      {/* Form kết nối tài khoản Facebook bằng Access Token (Tự động nạp toàn bộ Pages) */}
      {showFbAccountModal && (
        <section className="panel" style={{ marginBottom: 20 }}>
          <div className="panel-heading">
            <h2>
              <Globe2 size={18} style={{ verticalAlign: 'middle', marginRight: 8, color: 'var(--blue)' }} />
              Kết nối tài khoản Facebook bằng Access Token
            </h2>
            <button className="button button-quiet" type="button" style={{ minHeight: 28, padding: '0 10px', fontSize: 11 }} onClick={() => setShowFbAccountModal(false)}>Đóng</button>
          </div>
          <form className="panel-body" onSubmit={handleConnectFacebook}>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 0, marginBottom: 12 }}>
              Dán mã Access Token Facebook của bạn vào đây. Hệ thống sẽ tự động xác thực và tải về toàn bộ các Fanpage mà bạn đang quản lý.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'end' }}>
              <div>
                <label className="field-label" htmlFor="fb-account-token">Facebook Access Token (EAAB... / EAAA...) *</label>
                <input
                  id="fb-account-token"
                  className="field"
                  type="password"
                  placeholder="Dán mã Token Facebook vào đây..."
                  value={fbAccountToken}
                  onChange={(e) => setFbAccountToken(e.target.value)}
                  disabled={fbAccountSaving}
                  required
                />
              </div>
              <button className="button button-primary" type="submit" disabled={fbAccountSaving} style={{ minHeight: 40, whiteSpace: 'nowrap' }}>
                {fbAccountSaving ? 'Đang quét Pages…' : 'Xác thực & Nạp Pages'}
              </button>
            </div>
            <p className="muted" style={{ fontSize: 11.5, marginTop: 12, marginBottom: 0 }}>
              💡 <em>Cách lấy Token nhanh:</em> Truy cập <a href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noreferrer" style={{ color: 'var(--blue)', textDecoration: 'underline' }}>Meta Graph API Explorer <ExternalLink size={11} style={{ display: 'inline' }} /></a> → Chọn <strong>User Token</strong> → Bấm <strong>Generate Access Token</strong> rồi copy dán vào đây.
            </p>
          </form>
        </section>
      )}

      {/* Form thêm Fanpage thủ công bằng Token */}
      {showManualModal && (
        <section className="panel" style={{ marginBottom: 20 }}>
          <div className="panel-heading">
            <h2><KeyRound size={16} style={{ verticalAlign: 'middle', marginRight: 8, color: 'var(--blue)' }} />Thêm Fanpage bằng Page Access Token</h2>
            <button className="button button-quiet" type="button" style={{ minHeight: 28, padding: '0 10px', fontSize: 11 }} onClick={() => setShowManualModal(false)}>Đóng</button>
          </div>
          <form className="panel-body" onSubmit={handleManualAdd}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 300px) 1fr auto', gap: 12, alignItems: 'end' }}>
              <div>
                <label className="field-label" htmlFor="manual-page-id">Fanpage ID *</label>
                <input id="manual-page-id" className="field" placeholder="Ví dụ: 10987654321" value={manualPageId} onChange={(e) => setManualPageId(e.target.value)} required />
              </div>
              <div>
                <label className="field-label" htmlFor="manual-page-token">Page Access Token *</label>
                <input id="manual-page-token" className="field" type="password" placeholder="EAA..." value={manualPageToken} onChange={(e) => setManualPageToken(e.target.value)} required />
              </div>
              <button className="button button-primary" type="submit" disabled={manualSaving} style={{ minHeight: 40 }}>
                {manualSaving ? 'Đang kiểm tra…' : 'Lưu kết nối'}
              </button>
            </div>
            <p className="muted" style={{ fontSize: 11.5, marginTop: 12, marginBottom: 0 }}>
              💡 <em>Mẹo:</em> Bạn có thể lấy Page Access Token dài hạn từ <a href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noreferrer" style={{ color: '#00f2fe', textDecoration: 'underline' }}>Graph API Explorer <ExternalLink size={11} style={{ display: 'inline' }} /></a> để quản lý và đăng bài ổn định nhất.
            </p>
          </form>
        </section>
      )}

      {/* Modal Tạo/Sửa Nhóm kênh */}
      {showGroupModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0, 0, 0, 0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div className="panel" style={{ width: '100%', maxWidth: 540, maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="panel-heading">
              <h2><Layers size={16} style={{ color: groupColor, marginRight: 8, verticalAlign: 'middle' }} />{editingGroupId ? 'Chỉnh sửa nhóm kênh' : 'Tạo nhóm kênh mới'}</h2>
              <button className="button button-quiet" type="button" style={{ minHeight: 28, padding: '0 8px' }} onClick={() => setShowGroupModal(false)}>
                <X size={15} />
              </button>
            </div>
            <form className="panel-body" onSubmit={handleSaveGroup}>
              <div>
                <label className="field-label" htmlFor="grp-name">Tên nhóm kênh *</label>
                <input
                  id="grp-name"
                  className="field"
                  placeholder="Ví dụ: Nhóm Bán Hàng, Nhóm Tin Tức, Fanpage Thời Trang..."
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  required
                />
              </div>

              <div style={{ marginTop: 14 }}>
                <label className="field-label">Màu sắc nhận diện</label>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 6 }}>
                  {PRESET_COLORS.map((col) => (
                    <button
                      key={col}
                      type="button"
                      onClick={() => setGroupColor(col)}
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: '50%',
                        backgroundColor: col,
                        border: groupColor === col ? '2.5px solid #fff' : '2px solid transparent',
                        cursor: 'pointer',
                        transform: groupColor === col ? 'scale(1.15)' : 'scale(1)',
                        transition: 'transform 0.15s ease'
                      }}
                      title={col}
                    />
                  ))}
                </div>
              </div>

              <div style={{ marginTop: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <label className="field-label" style={{ margin: 0 }}>Chọn các Fanpage thuộc nhóm ({groupSelectedPages.length}/{channels.length}):</label>
                  <button
                    type="button"
                    className="button button-quiet"
                    style={{ minHeight: 22, padding: '0 6px', fontSize: 11 }}
                    onClick={() => {
                      if (groupSelectedPages.length === channels.length) {
                        setGroupSelectedPages([]);
                      } else {
                        setGroupSelectedPages(channels.map((c) => c.id));
                      }
                    }}
                  >
                    {groupSelectedPages.length === channels.length ? 'Bỏ chọn hết' : 'Chọn tất cả'}
                  </button>
                </div>

                <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 8, padding: 8, background: 'var(--field-bg)' }}>
                  {channels.length === 0 ? (
                    <p className="muted" style={{ fontSize: 12, padding: 8 }}>Chưa có Fanpage nào để thêm vào nhóm.</p>
                  ) : (
                    channels.map((ch) => {
                      const isChecked = groupSelectedPages.includes(ch.id);
                      return (
                        <div
                          key={ch.id}
                          onClick={() => togglePageInGroup(ch.id)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            padding: '8px 10px',
                            borderRadius: 6,
                            cursor: 'pointer',
                            background: isChecked ? 'rgba(37, 99, 235, 0.08)' : 'transparent',
                            marginBottom: 4
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {}}
                            style={{ cursor: 'pointer', accentColor: groupColor }}
                          />
                          <Globe2 size={16} color={isChecked ? groupColor : 'var(--muted)'} />
                          <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: 'var(--ink)', fontWeight: isChecked ? 700 : 400 }}>
                            {ch.name}
                            <span className="muted" style={{ fontSize: 11, marginLeft: 8 }}>ID: {ch.id}</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
                <button className="button button-quiet" type="button" onClick={() => setShowGroupModal(false)}>
                  Hủy
                </button>
                <button className="button button-primary" type="submit" disabled={groupSaving}>
                  {groupSaving ? 'Đang lưu…' : editingGroupId ? 'Lưu thay đổi' : 'Tạo nhóm'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VIEW 1: TẤT CẢ FANPAGE */}
      {activeTab === 'channels' && (
        <>
          {/* Thanh tìm kiếm & đếm số lượng */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', width: 280, maxWidth: '100%' }}>
              <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
              <input
                className="field"
                placeholder="Tìm kiếm Fanpage theo tên, ID hoặc Nick FB..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ paddingLeft: 34, width: '100%' }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button
                type="button"
                className="button button-secondary"
                onClick={handleCheckTokens}
                disabled={checkingTokens}
                style={{ minHeight: 32, fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                title="Kiểm tra kết nối và token của tất cả Fanpage"
              >
                <Activity size={14} className={checkingTokens ? 'animate-spin' : ''} style={{ color: 'var(--blue)' }} />
                {checkingTokens ? 'Đang kiểm tra token…' : 'Kiểm tra sức khỏe Token'}
              </button>
              <div className="muted" style={{ fontSize: 12 }}>
                Tổng cộng: <strong style={{ color: 'var(--blue)' }}>{channels.length}</strong> Fanpage ({accountList.length} tài khoản FB)
              </div>
            </div>
          </div>

          {/* THANH LỌC THEO TỪNG NICK FACEBOOK */}
          {accountList.length > 0 && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 18, overflowX: 'auto', paddingBottom: 6 }}>
              <span className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
                <Users size={14} style={{ color: 'var(--blue)' }} /> Lọc theo nick FB:
              </span>
              <button
                type="button"
                onClick={() => setSelectedFbFilter('all')}
                style={{
                  background: selectedFbFilter === 'all' ? 'var(--blue)' : 'var(--panel)',
                  border: selectedFbFilter === 'all' ? '1px solid var(--blue)' : '1px solid var(--line)',
                  color: selectedFbFilter === 'all' ? '#ffffff' : 'var(--ink)',
                  borderRadius: 20,
                  padding: '5px 14px',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: selectedFbFilter === 'all' ? '0 4px 14px rgba(37, 99, 235, 0.2)' : 'none',
                  transition: 'all .2s ease',
                  whiteSpace: 'nowrap'
                }}
              >
                Tất cả ({channels.length})
              </button>
              {accountList.map((acc) => {
                const count = channels.filter((c) => (acc.id === 'manual' ? !c.fbAccountId : c.fbAccountId === acc.id)).length;
                const isActive = selectedFbFilter === acc.id;
                return (
                  <button
                    key={acc.id}
                    type="button"
                    onClick={() => setSelectedFbFilter(acc.id)}
                    style={{
                      background: isActive ? 'var(--blue)' : 'var(--panel)',
                      border: isActive ? '1px solid var(--blue)' : '1px solid var(--line)',
                      color: isActive ? '#ffffff' : 'var(--ink)',
                      borderRadius: 20,
                      padding: '5px 14px',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 7,
                      boxShadow: isActive ? '0 4px 14px rgba(37, 99, 235, 0.2)' : 'none',
                      transition: 'all .2s ease',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {acc.avatar ? (
                      <img src={acc.avatar} alt={acc.name} style={{ width: 16, height: 16, borderRadius: '50%', objectFit: 'cover' }} />
                    ) : (
                      <Users size={13} />
                    )}
                    <span>{acc.name}</span>
                    <span style={{ fontSize: 10.5, background: isActive ? 'rgba(255,255,255,0.25)' : 'var(--field-bg)', padding: '1px 7px', borderRadius: 10 }}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Grid danh sách Page */}
          <div className="channel-grid">
            {channels
              .filter((ch) => {
                const matchSearch = !searchTerm.trim() ||
                  ch.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                  ch.id.includes(searchTerm) ||
                  (ch.fbAccountName && ch.fbAccountName.toLowerCase().includes(searchTerm.toLowerCase()));
                if (!matchSearch) return false;
                if (selectedFbFilter === 'all') return true;
                if (selectedFbFilter === 'manual') return !ch.fbAccountId;
                return ch.fbAccountId === selectedFbFilter;
              })
              .map((channel) => {
                const assignedGroups = pageGroupMap[channel.id] || [];
                return (
                  <article className="channel-card" key={channel.id}>
                    <div className="channel-card-head">
                      <div className="channel-avatar"><Globe2 size={22} /></div>
                      {tokenStatuses[channel.id] ? (
                        tokenStatuses[channel.id].isValid ? (
                          <span className="status-pill published" style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                            <ShieldCheck size={13} color="#10b981" /> Token sống
                          </span>
                        ) : (
                          <span className="status-pill failed" style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                            <ShieldAlert size={13} color="#f87171" /> Mất quyền
                          </span>
                        )
                      ) : (
                        <span className="channel-connected"><span className="float-dot green" /> Đã kết nối</span>
                      )}
                    </div>
                    <h2 style={{ fontSize: 16, margin: '14px 0 4px', color: 'var(--ink)', fontWeight: 800, letterSpacing: '-0.3px', lineHeight: 1.3 }}>{channel.name}</h2>
                    <div style={{ fontSize: 11.5, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span>Facebook</span> · <span>{channel.category || 'Fanpage'}</span> · <span style={{ fontFamily: 'monospace', opacity: 0.85 }}>ID: {channel.id}</span>
                    </div>

                    {/* HUY HIỆU NICK FACEBOOK SỞ HỮU TRANG */}
                    {channel.fbAccountName ? (
                      <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        marginTop: 10,
                        padding: '4px 10px',
                        borderRadius: 10,
                        background: 'rgba(37, 99, 235, 0.08)',
                        border: '1px solid rgba(37, 99, 235, 0.25)',
                        color: 'var(--blue)',
                        fontSize: 11.5,
                        fontWeight: 600
                      }}>
                        {channel.fbAccountAvatar ? (
                          <img src={channel.fbAccountAvatar} alt="" style={{ width: 14, height: 14, borderRadius: '50%', objectFit: 'cover' }} />
                        ) : (
                          <Users size={12} style={{ color: 'var(--blue)' }} />
                        )}
                        <span>Nick FB: <strong style={{ color: 'var(--ink)' }}>{channel.fbAccountName}</strong></span>
                      </div>
                    ) : (
                      <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        marginTop: 10,
                        padding: '4px 10px',
                        borderRadius: 10,
                        background: 'var(--field-bg)',
                        border: '1px solid var(--line)',
                        color: 'var(--muted)',
                        fontSize: 11
                      }}>
                        <KeyRound size={12} style={{ color: 'var(--blue)' }} /> Token riêng
                      </div>
                    )}

                    {/* CẢNH BÁO NẾU TOKEN BỊ HẾT HẠN HOẶC MẤT QUYỀN */}
                    {tokenStatuses[channel.id] && !tokenStatuses[channel.id].isValid && (
                      <div style={{
                        marginTop: 12,
                        padding: '8px 12px',
                        background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.14), rgba(185, 28, 28, 0.08))',
                        border: '1px solid rgba(239, 68, 68, 0.35)',
                        borderRadius: 10,
                        fontSize: 11.5,
                        color: '#fca5a5',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 8
                      }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                          <ShieldAlert size={13} style={{ color: '#f87171', flexShrink: 0 }} /> Token hết hạn / mất quyền
                        </span>
                        <button
                          type="button"
                          className="button button-primary"
                          style={{ minHeight: 24, padding: '0 10px', fontSize: 10.5, borderRadius: 6, whiteSpace: 'nowrap' }}
                          onClick={() => openUpdateTokenModal(channel.id)}
                        >
                          Cập nhật
                        </button>
                      </div>
                    )}

                    {/* Hiển thị nhóm mà Page này thuộc về */}
                    {assignedGroups.length > 0 && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                        {assignedGroups.map((g) => (
                          <span
                            key={g.id}
                            style={{
                              fontSize: 11,
                              padding: '2px 8px',
                              borderRadius: 10,
                              background: 'rgba(255, 255, 255, 0.05)',
                              border: `1px solid ${g.color}66`,
                              color: g.color,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 5
                            }}
                          >
                            <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: g.color }} />
                            {g.name}
                          </span>
                        ))}
                      </div>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--line)', gap: 10 }}>
                      <Link
                        href={`/post-planner/compose?pageId=${channel.id}`}
                        className="button button-primary"
                        style={{ minHeight: 32, padding: '0 14px', fontSize: 12, borderRadius: 10 }}
                      >
                        <PenSquare size={13} /> Viết bài
                      </Link>
                      <button
                        className="button button-danger"
                        type="button"
                        style={{ minHeight: 32, padding: '0 12px', fontSize: 12, borderRadius: 10 }}
                        onClick={() => handleDisconnect(channel.id, channel.name)}
                        title="Hủy kết nối"
                      >
                        <Trash2 size={13} /> Gỡ
                      </button>
                    </div>
                  </article>
                );
              })}

            <button className="channel-card channel-card-add" type="button" onClick={() => setShowManualModal(true)}>
              <Plus size={24} style={{ color: 'var(--blue)' }} />
              <strong style={{ display: 'block', marginTop: 10, color: 'var(--ink)' }}>Thêm Fanpage mới</strong>
              <span className="muted" style={{ fontSize: 11 }}>Bằng Page ID & Token hoặc Đồng bộ</span>
            </button>
          </div>
        </>
      )}

      {/* VIEW 2: QUẢN LÝ NHÓM KÊNH */}
      {activeTab === 'groups' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <span className="muted" style={{ fontSize: 13 }}>
              Gom nhóm các Fanpage cùng ngành hàng, chủ đề hoặc khu vực để đăng bài hàng loạt trong 1 click.
            </span>
            <button className="button button-primary" type="button" onClick={openCreateGroupModal} style={{ minHeight: 32, fontSize: 12 }}>
              <FolderPlus size={14} /> Thêm nhóm mới
            </button>
          </div>

          <div className="channel-grid">
            {groups.map((group) => {
              const pageCount = Array.isArray(group.pageIds) ? group.pageIds.length : 0;
              const pagesInGroup = channels.filter((c) => (group.pageIds || []).includes(c.id));
              return (
                <article
                  className="channel-card"
                  key={group.id}
                  style={{ borderLeft: `3px solid ${group.color || '#38bdf8'}` }}
                >
                  <div className="channel-card-head">
                    <div
                      className="channel-avatar"
                      style={{
                        backgroundColor: `${group.color || '#38bdf8'}18`,
                        color: group.color || '#38bdf8',
                        border: `1.5px solid ${group.color || '#38bdf8'}55`
                      }}
                    >
                      <Layers size={22} />
                    </div>
                    <span style={{ fontSize: 11, color: group.color || 'var(--blue)', background: 'var(--field-bg)', padding: '3px 10px', borderRadius: 12, fontWeight: 700, border: `1px solid ${group.color || 'var(--blue)'}40` }}>
                      {pageCount} Fanpage
                    </span>
                  </div>

                  <h2 style={{ fontSize: 16, margin: '14px 0 4px', color: 'var(--ink)', fontWeight: 800 }}>{group.name}</h2>
                  <div className="muted" style={{ fontSize: 11.5, marginBottom: 10, minHeight: 18 }}>
                    {pagesInGroup.length > 0
                      ? pagesInGroup.map((p) => p.name).join(', ')
                      : 'Chưa gán Fanpage nào vào nhóm này'}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--line)', gap: 10 }}>
                    <Link
                      href={`/post-planner/compose?groupId=${group.id}`}
                      className="button button-primary"
                      style={{ minHeight: 32, padding: '0 12px', fontSize: 11.5, borderRadius: 10 }}
                    >
                      <PenSquare size={12} /> Đăng cho nhóm
                    </Link>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        className="button button-quiet"
                        type="button"
                        style={{ minHeight: 32, padding: '0 10px', fontSize: 11.5, borderRadius: 10 }}
                        onClick={() => openEditGroupModal(group)}
                        title="Chỉnh sửa nhóm"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        className="button button-danger"
                        type="button"
                        style={{ minHeight: 32, padding: '0 10px', fontSize: 11.5, borderRadius: 10 }}
                        onClick={() => handleDeleteGroup(group.id, group.name)}
                        title="Xóa nhóm"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}

            <button className="channel-card channel-card-add" type="button" onClick={openCreateGroupModal}>
              <FolderPlus size={24} style={{ color: 'var(--blue)' }} />
              <strong style={{ display: 'block', marginTop: 10, color: 'var(--ink)' }}>Tạo nhóm kênh mới</strong>
              <span className="muted" style={{ fontSize: 11 }}>Gom các Page cùng phân loại</span>
            </button>
          </div>
        </>
      )}

      {/* VIEW 3: QUẢN LÝ CÁC NICK FACEBOOK ĐÃ KẾT NỐI */}
      {activeTab === 'accounts' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
            <span className="muted" style={{ fontSize: 13 }}>
              Quản lý các tài khoản Facebook cá nhân đã kết nối vào tool. Mỗi tài khoản quản lý một nhóm Fanpage riêng biệt.
            </span>
            <button
              className="button button-primary"
              type="button"
              onClick={() => setShowFbAccountModal(true)}
              style={{ minHeight: 34, fontSize: 12.5 }}
            >
              <Plus size={14} /> Thêm nick Facebook
            </button>
          </div>

          <div className="channel-grid">
            {accountList.map((acc) => {
              const isManual = acc.id === 'manual';
              const pagesCount = channels.filter((c) => (isManual ? !c.fbAccountId : c.fbAccountId === acc.id)).length;
              return (
                <article className="channel-card" key={acc.id}>
                  <div className="channel-card-head">
                    <div className="channel-avatar" style={{ overflow: 'hidden', padding: 0 }}>
                      {acc.avatar ? (
                        <img src={acc.avatar} alt={acc.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <Users size={22} style={{ color: 'var(--blue)', margin: 'auto' }} />
                      )}
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--blue)', background: 'var(--field-bg)', border: '1px solid var(--line)', padding: '3px 10px', borderRadius: 12, fontWeight: 700 }}>
                      {pagesCount} Fanpage
                    </span>
                  </div>

                  <h2 style={{ fontSize: 16, margin: '14px 0 4px', color: 'var(--ink)', fontWeight: 800 }}>{acc.name}</h2>
                  <div className="muted" style={{ fontSize: 11.5, marginBottom: 10 }}>
                    {isManual ? 'Các Page kết nối bằng Token thủ công' : `Facebook ID: ${acc.id}`}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--line)', gap: 10 }}>
                    <button
                      type="button"
                      className="button button-primary"
                      style={{ minHeight: 32, padding: '0 12px', fontSize: 11.5, borderRadius: 10 }}
                      onClick={() => {
                        setSelectedFbFilter(acc.id);
                        setActiveTab('channels');
                      }}
                    >
                      <Globe2 size={12} /> Xem {pagesCount} Fanpage
                    </button>
                    {!isManual && (
                      <button
                        className="button button-danger"
                        type="button"
                        style={{ minHeight: 32, padding: '0 10px', fontSize: 11.5, borderRadius: 10 }}
                        onClick={() => handleDisconnectAccount(acc.id, acc.name)}
                        title="Xóa tài khoản Facebook này"
                      >
                        <Trash2 size={13} /> Gỡ nick
                      </button>
                    )}
                  </div>
                </article>
              );
            })}

            <button className="channel-card channel-card-add" type="button" onClick={() => setShowFbAccountModal(true)}>
              <Plus size={24} style={{ color: 'var(--blue)' }} />
              <strong style={{ display: 'block', marginTop: 10, color: 'var(--ink)' }}>Thêm nick Facebook</strong>
              <span className="muted" style={{ fontSize: 11 }}>Nạp toàn bộ Fanpage từ tài khoản</span>
            </button>
          </div>
        </>
      )}

      {loading && <section className="panel" style={{ marginTop: 16 }}><div className="panel-body muted">Đang đồng bộ thông tin từ máy chủ…</div></section>}

      {/* Hướng dẫn kết nối Fanpage - Glass Visual Cards */}
      <section className="panel" style={{ marginTop: 22 }}>
        <div className="panel-heading">
          <h2><CircleHelp size={16} style={{ verticalAlign: 'middle', marginRight: 8, color: 'var(--blue)' }} />Phương thức kết nối Fanpage</h2>
        </div>
        <div className="panel-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
            <div style={{
              background: 'var(--apple-glass-bg-subtle)',
              border: 'var(--apple-glass-border)',
              borderTop: 'var(--apple-glass-border-top)',
              borderRadius: 16, padding: '18px 20px',
              display: 'flex', flexDirection: 'column', gap: 10
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(37, 99, 235, 0.12)', display: 'grid', placeItems: 'center', color: 'var(--blue)' }}>
                  <Radio size={18} />
                </div>
                <div>
                  <strong style={{ fontSize: 13.5, color: 'var(--ink)' }}>Đồng bộ qua Facebook Login</strong>
                  <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>Tự động tải danh sách Page từ nick cá nhân</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                <span className="glass-pill-badge" style={{ fontSize: 11 }}>pages_show_list</span>
                <span className="glass-pill-badge" style={{ fontSize: 11 }}>pages_manage_posts</span>
                <span className="glass-pill-badge" style={{ fontSize: 11 }}>pages_read_engagement</span>
              </div>
            </div>

            <div style={{
              background: 'var(--apple-glass-bg-subtle)',
              border: 'var(--apple-glass-border)',
              borderTop: 'var(--apple-glass-border-top)',
              borderRadius: 16, padding: '18px 20px',
              display: 'flex', flexDirection: 'column', gap: 10
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(16, 185, 129, 0.12)', display: 'grid', placeItems: 'center', color: '#10b981' }}>
                  <ShieldCheck size={18} />
                </div>
                <div>
                  <strong style={{ fontSize: 13.5, color: 'var(--ink)' }}>Thêm qua Page Access Token</strong>
                  <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>Không cần cấp quyền Meta App phức tạp</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                <span className="glass-pill-badge" style={{ fontSize: 11, color: '#10b981' }}>⚡ 1-Click kết nối</span>
                <span className="glass-pill-badge" style={{ fontSize: 11, color: 'var(--blue)' }}>🔒 Token vĩnh viễn</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </MainLayout>
  );
}