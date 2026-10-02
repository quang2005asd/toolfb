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
  ShieldAlert
} from 'lucide-react';
import MainLayout from '../../components/layout/MainLayout';
import channelApi from '../../services/channelApi';
import channelGroupApi from '../../services/channelGroupApi';

const PRESET_COLORS = ['#00f2fe', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#3b82f6', '#f43f5e'];

export default function ChannelsPage() {
  const [activeTab, setActiveTab] = useState('channels'); // 'channels' | 'groups'
  const [channels, setChannels] = useState([]);
  const [groups, setGroups] = useState([]);
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
        channelApi.list(),
        channelGroupApi.list()
      ]);

      if (chanRes.status === 'fulfilled') {
        setChannels(chanRes.value.channels || []);
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

  useEffect(() => { loadData(); }, []);

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
          <button className="button button-quiet" type="button" onClick={handleCheckTokens} disabled={checkingTokens}>
            <ShieldCheck size={15} style={{ color: '#10b981' }} /> {checkingTokens ? 'Đang quét Token…' : 'Kiểm tra Token'}
          </button>
          <button className="button button-quiet" type="button" onClick={() => setShowManualModal(!showManualModal)}>
            <KeyRound size={15} /> Thêm qua Page Token
          </button>
          <button className="button button-quiet" type="button" onClick={openCreateGroupModal}>
            <FolderPlus size={15} style={{ color: '#00f2fe' }} /> Tạo nhóm kênh
          </button>
          <button className="button button-secondary" type="button" onClick={loadData} disabled={loading}>
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Đồng bộ từ Facebook
          </button>
        </div>
      }
    >
      {notice && <div className="notice" style={{ marginBottom: 14, borderColor: 'rgba(16, 185, 129, 0.4)', color: '#10b981' }}>{notice}</div>}
      {error && <div className="notice" style={{ marginBottom: 14, borderColor: 'rgba(239, 68, 68, 0.4)', color: '#ef4444' }}>{error}</div>}

      {/* Tabs chuyển đổi giữa Kênh và Nhóm kênh */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 18, borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: 10 }}>
        <button
          type="button"
          onClick={() => setActiveTab('channels')}
          style={{
            background: activeTab === 'channels' ? 'rgba(0, 242, 254, 0.15)' : 'transparent',
            border: activeTab === 'channels' ? '1px solid #00f2fe' : '1px solid rgba(255, 255, 255, 0.08)',
            color: activeTab === 'channels' ? '#00f2fe' : 'var(--muted)',
            borderRadius: 8,
            padding: '7px 16px',
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            transition: 'all 0.15s ease'
          }}
        >
          <Globe2 size={15} /> Tất cả Fanpage ({channels.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('groups')}
          style={{
            background: activeTab === 'groups' ? 'rgba(0, 242, 254, 0.15)' : 'transparent',
            border: activeTab === 'groups' ? '1px solid #00f2fe' : '1px solid rgba(255, 255, 255, 0.08)',
            color: activeTab === 'groups' ? '#00f2fe' : 'var(--muted)',
            borderRadius: 8,
            padding: '7px 16px',
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            transition: 'all 0.15s ease'
          }}
        >
          <Layers size={15} /> Nhóm kênh ({groups.length})
        </button>
      </div>

      {/* Form thêm Fanpage thủ công bằng Token */}
      {showManualModal && (
        <section className="panel" style={{ marginBottom: 20, borderColor: 'rgba(0, 242, 254, 0.35)', background: 'linear-gradient(135deg, rgba(8, 12, 24, 0.98), rgba(10, 16, 32, 0.98))' }}>
          <div className="panel-heading">
            <h2><KeyRound size={16} style={{ verticalAlign: 'middle', marginRight: 8, color: '#00f2fe' }} />Thêm Fanpage bằng Page Access Token</h2>
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
          <div className="panel rgb-led-card" style={{ width: '100%', maxWidth: 540, maxHeight: '90vh', overflowY: 'auto' }}>
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

                <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: 8, padding: 8, background: 'rgba(0, 0, 0, 0.2)' }}>
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
                            background: isChecked ? 'rgba(0, 242, 254, 0.1)' : 'transparent',
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
                          <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: '#fff', fontWeight: isChecked ? 700 : 400 }}>
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
                placeholder="Tìm kiếm Fanpage theo tên hoặc ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ paddingLeft: 34, width: '100%' }}
              />
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              Tổng cộng: <strong style={{ color: '#00f2fe' }}>{channels.length}</strong> Fanpage đã kết nối
            </div>
          </div>

          {/* Grid danh sách Page */}
          <div className="channel-grid">
            {channels
              .filter((ch) => !searchTerm.trim() || ch.name.toLowerCase().includes(searchTerm.toLowerCase()) || ch.id.includes(searchTerm))
              .map((channel) => {
                const assignedGroups = pageGroupMap[channel.id] || [];
                return (
                  <article className="panel channel-card rgb-led-card" key={channel.id}>
                    <div className="channel-card-head">
                      <div className="channel-avatar rgb-led-ring"><Globe2 size={23} /></div>
                      {tokenStatuses[channel.id] ? (
                        tokenStatuses[channel.id].isValid ? (
                          <span className="status-pill published" style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <ShieldCheck size={13} color="#10b981" /> Token sống
                          </span>
                        ) : (
                          <span className="status-pill failed" style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <ShieldAlert size={13} color="#ef4444" /> Mất quyền
                          </span>
                        )
                      ) : (
                        <span className="channel-connected"><span className="float-dot green" /> Đã kết nối</span>
                      )}
                    </div>
                    <h2 style={{ fontSize: 15, margin: '14px 0 4px', color: '#fff', fontWeight: 800 }}>{channel.name}</h2>
                    <div className="muted" style={{ fontSize: 11.5 }}>Facebook · {channel.category || 'Fanpage'} · ID: {channel.id}</div>

                    {/* CẢNH BÁO NẾU TOKEN BỊ HẾT HẠN HOẶC MẤT QUYỀN */}
                    {tokenStatuses[channel.id] && !tokenStatuses[channel.id].isValid && (
                      <div style={{ marginTop: 8, padding: '6px 10px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 8, fontSize: 11, color: '#fca5a5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>⚠️ Token hết hạn/mất quyền</span>
                        <button
                          type="button"
                          className="button button-quiet"
                          style={{ minHeight: 20, padding: '0 6px', fontSize: 10, color: '#00f2fe' }}
                          onClick={() => openUpdateTokenModal(channel.id)}
                        >
                          Cập nhật
                        </button>
                      </div>
                    )}

                    {/* Hiển thị nhóm mà Page này thuộc về */}
                    {assignedGroups.length > 0 && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                        {assignedGroups.map((g) => (
                          <span
                            key={g.id}
                            style={{
                              fontSize: 10.5,
                              padding: '1px 7px',
                              borderRadius: 10,
                              background: 'rgba(255, 255, 255, 0.05)',
                              border: `1px solid ${g.color}66`,
                              color: g.color,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4
                            }}
                          >
                            <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: g.color }} />
                            {g.name}
                          </span>
                        ))}
                      </div>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, paddingTop: 10, borderTop: '1px solid rgba(255, 255, 255, 0.05)', gap: 8 }}>
                      <Link
                        href={`/post-planner/compose?pageId=${channel.id}`}
                        className="button button-primary"
                        style={{ minHeight: 26, padding: '0 10px', fontSize: 11 }}
                      >
                        <PenSquare size={11} /> Viết bài
                      </Link>
                      <button className="button button-danger" type="button" style={{ minHeight: 26, padding: '0 8px', fontSize: 11 }} onClick={() => handleDisconnect(channel.id, channel.name)} title="Hủy kết nối">
                        <Trash2 size={12} /> Gỡ
                      </button>
                    </div>
                  </article>
                );
              })}

            <button className="panel channel-card channel-card-add" type="button" onClick={() => setShowManualModal(true)}>
              <Plus size={24} style={{ color: '#00f2fe' }} />
              <strong style={{ display: 'block', marginTop: 10, color: '#fff' }}>Thêm Fanpage mới</strong>
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
                  className="panel channel-card rgb-led-card"
                  key={group.id}
                  style={{ borderLeft: `3px solid ${group.color || '#00f2fe'}` }}
                >
                  <div className="channel-card-head">
                    <div
                      className="channel-avatar"
                      style={{
                        backgroundColor: `${group.color || '#00f2fe'}20`,
                        color: group.color || '#00f2fe',
                        border: `1px solid ${group.color || '#00f2fe'}66`
                      }}
                    >
                      <Layers size={22} />
                    </div>
                    <span style={{ fontSize: 11, color: group.color || '#00f2fe', background: `${group.color || '#00f2fe'}15`, padding: '2px 8px', borderRadius: 12, fontWeight: 700 }}>
                      {pageCount} Fanpage
                    </span>
                  </div>

                  <h2 style={{ fontSize: 16, margin: '14px 0 4px', color: '#fff', fontWeight: 800 }}>{group.name}</h2>
                  <div className="muted" style={{ fontSize: 11.5, marginBottom: 10 }}>
                    {pagesInGroup.length > 0
                      ? pagesInGroup.map((p) => p.name).join(', ')
                      : 'Chưa gán Fanpage nào vào nhóm này'}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, paddingTop: 10, borderTop: '1px solid rgba(255, 255, 255, 0.05)', gap: 8 }}>
                    <Link
                      href={`/post-planner/compose?groupId=${group.id}`}
                      className="button button-primary"
                      style={{ minHeight: 26, padding: '0 10px', fontSize: 11 }}
                    >
                      <PenSquare size={11} /> Đăng cho nhóm
                    </Link>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        className="button button-quiet"
                        type="button"
                        style={{ minHeight: 26, padding: '0 8px', fontSize: 11 }}
                        onClick={() => openEditGroupModal(group)}
                        title="Chỉnh sửa nhóm"
                      >
                        <Edit2 size={12} />
                      </button>
                      <button
                        className="button button-danger"
                        type="button"
                        style={{ minHeight: 26, padding: '0 8px', fontSize: 11 }}
                        onClick={() => handleDeleteGroup(group.id, group.name)}
                        title="Xóa nhóm"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}

            <button className="panel channel-card channel-card-add" type="button" onClick={openCreateGroupModal}>
              <FolderPlus size={24} style={{ color: '#00f2fe' }} />
              <strong style={{ display: 'block', marginTop: 10, color: '#fff' }}>Tạo nhóm kênh mới</strong>
              <span className="muted" style={{ fontSize: 11 }}>Gom các Page cùng phân loại</span>
            </button>
          </div>
        </>
      )}

      {loading && <section className="panel" style={{ marginTop: 16 }}><div className="panel-body muted">Đang đồng bộ thông tin từ máy chủ…</div></section>}

      {/* Hướng dẫn đồng bộ tự động */}
      <section className="panel" style={{ marginTop: 18 }}>
        <div className="panel-heading">
          <h2><CircleHelp size={16} style={{ verticalAlign: 'middle', marginRight: 8, color: '#38bdf8' }} />Hướng dẫn kết nối Fanpage</h2>
        </div>
        <div className="panel-body" style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--muted)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
            <div>
              <strong style={{ color: '#00f2fe', display: 'block', marginBottom: 6 }}>Cách 1: Đồng bộ tự động qua Facebook Login</strong>
              <p style={{ margin: '0 0 8px' }}>
                Để Facebook cho phép hệ thống tự đọc danh sách Page, trong <strong>Meta Developer Console</strong> của bạn cần thêm quyền:
              </p>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                <li><code>pages_show_list</code>: Xem danh sách Fanpage bạn quản trị</li>
                <li><code>pages_manage_posts</code>: Quyền đăng bài tự động</li>
                <li><code>pages_read_engagement</code>: Đọc báo cáo tương tác</li>
              </ul>
            </div>
            <div>
              <strong style={{ color: '#10b981', display: 'block', marginBottom: 6 }}>Cách 2: Nhập Page Access Token trực tiếp</strong>
              <p style={{ margin: '0 0 8px' }}>
                Nếu không muốn cấu hình quyền phức tạp trên Meta Developer, bạn chỉ cần bấm nút <strong>"Thêm qua Page Token"</strong> ở trên, dán Page ID và Page Access Token là có thể đăng bài ngay lập tức!
              </p>
            </div>
          </div>
        </div>
      </section>
    </MainLayout>
  );
}