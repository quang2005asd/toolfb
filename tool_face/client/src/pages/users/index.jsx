import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  CheckCircle2,
  Crown,
  KeyRound,
  Lock,
  LockOpen,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  UserRound,
  UsersRound,
  X
} from 'lucide-react';
import MainLayout from '../../components/layout/MainLayout';
import RoleBadge from '../../components/RoleBadge';
import userApi from '../../services/userApi';
import useAuth from '../../hooks/useAuth';
import { PERMISSIONS, PERMISSION_LABELS, formatDateTime, roleLabel } from '../../utils/permissions';

const EMPTY_FORM = { username: '', email: '', displayName: '', password: '', confirmPassword: '', role: '', status: 'active' };

function errorText(err, fallback) {
  return err.response?.data?.message || err.message || fallback;
}

function Modal({ title, subtitle, onClose, children }) {
  useEffect(() => {
    const handleKey = (event) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // Portal ra body: vùng nội dung trang có transform nên position: fixed sẽ không phủ toàn màn hình
  return createPortal(
    <div className="um-modal-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="panel modal-card um-modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="panel-heading">
          <div>
            <h2>{title}</h2>
            {subtitle && <small className="muted">{subtitle}</small>}
          </div>
          <button type="button" className="um-icon-btn" onClick={onClose} aria-label="Đóng"><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}

function UserFormModal({ mode, target, assignable, onClose, onSaved }) {
  const isCreate = mode === 'create';
  const [form, setForm] = useState(() => (isCreate
    ? { ...EMPTY_FORM, role: assignable.includes('user') ? 'user' : assignable[assignable.length - 1] || 'user' }
    : { ...EMPTY_FORM, email: target.email || '', displayName: target.name || '', role: target.role, status: target.status }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));

  // Vai trò hiện tại luôn có trong danh sách để select hiển thị đúng
  const roleOptions = isCreate || assignable.includes(target.role) ? assignable : [target.role, ...assignable];

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    if (isCreate && form.password !== form.confirmPassword) {
      setError('Mật khẩu xác nhận không khớp.');
      return;
    }
    const promotingToAdmin = form.role === 'admin' && (isCreate || target.role !== 'admin');
    if (promotingToAdmin && !window.confirm('Tài khoản Admin có quyền ngang bạn. Sau khi lưu, bạn sẽ KHÔNG thể chỉnh sửa hay xóa tài khoản này nữa. Tiếp tục?')) {
      return;
    }
    setSaving(true);
    try {
      const res = isCreate
        ? await userApi.create({
          username: form.username.trim(),
          email: form.email.trim(),
          displayName: form.displayName.trim(),
          password: form.password,
          confirmPassword: form.confirmPassword,
          role: form.role
        })
        : await userApi.update(target.id, {
          displayName: form.displayName.trim(),
          email: form.email.trim(),
          role: form.role,
          status: form.status
        });
      onSaved(res.message);
    } catch (err) {
      setError(errorText(err, 'Không thể lưu tài khoản.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={isCreate ? 'Tạo tài khoản mới' : `Chỉnh sửa @${target.username}`}
      subtitle={isCreate ? 'Tài khoản được tạo sẽ đăng nhập được ngay.' : 'Thay đổi vai trò và trạng thái có hiệu lực ngay lập tức.'}
      onClose={onClose}
    >
      <form className="panel-body um-form" onSubmit={handleSubmit}>
        {error && <div className="notice um-notice-error"><AlertCircle size={15} /> {error}</div>}
        {isCreate && (
          <div className="um-grid-2">
            <div>
              <label className="field-label" htmlFor="um-username">Tên đăng nhập *</label>
              <input id="um-username" className="field" value={form.username} onChange={set('username')} placeholder="nguyenvana" autoComplete="off" required />
            </div>
            <div>
              <label className="field-label" htmlFor="um-display">Tên hiển thị</label>
              <input id="um-display" className="field" value={form.displayName} onChange={set('displayName')} placeholder="Nguyễn Văn A" />
            </div>
          </div>
        )}
        {!isCreate && (
          <div>
            <label className="field-label" htmlFor="um-display">Tên hiển thị</label>
            <input id="um-display" className="field" value={form.displayName} onChange={set('displayName')} />
          </div>
        )}
        <div>
          <label className="field-label" htmlFor="um-email">Gmail *</label>
          <input id="um-email" type="email" className="field" value={form.email} onChange={set('email')} placeholder="ten@gmail.com" required />
        </div>
        {isCreate && (
          <div className="um-grid-2">
            <div>
              <label className="field-label" htmlFor="um-password">Mật khẩu *</label>
              <input id="um-password" type="password" className="field" value={form.password} onChange={set('password')} placeholder="Tối thiểu 6 ký tự" autoComplete="new-password" required />
            </div>
            <div>
              <label className="field-label" htmlFor="um-confirm">Xác nhận mật khẩu *</label>
              <input id="um-confirm" type="password" className="field" value={form.confirmPassword} onChange={set('confirmPassword')} autoComplete="new-password" required />
            </div>
          </div>
        )}
        <div className={isCreate ? '' : 'um-grid-2'}>
          <div>
            <label className="field-label" htmlFor="um-role">Vai trò</label>
            <select id="um-role" className="field" value={form.role} onChange={set('role')}>
              {roleOptions.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}
            </select>
          </div>
          {!isCreate && (
            <div>
              <label className="field-label" htmlFor="um-status">Trạng thái</label>
              <select id="um-status" className="field" value={form.status} onChange={set('status')}>
                <option value="active">Đang hoạt động</option>
                <option value="locked">Đã khóa</option>
              </select>
            </div>
          )}
        </div>
        <div className="um-form-actions">
          <button type="button" className="button button-secondary" onClick={onClose} disabled={saving}>Hủy</button>
          <button type="submit" className="button button-primary" disabled={saving}>
            {saving ? 'Đang lưu…' : isCreate ? 'Tạo tài khoản' : 'Lưu thay đổi'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ResetPasswordModal({ target, onClose, onSaved }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError('Mật khẩu xác nhận không khớp.');
      return;
    }
    setSaving(true);
    try {
      const res = await userApi.resetPassword(target.id, { password, confirmPassword });
      onSaved(`${res.message} Hãy gửi mật khẩu mới cho @${target.username}.`);
    } catch (err) {
      setError(errorText(err, 'Không thể đặt lại mật khẩu.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={`Đặt lại mật khẩu @${target.username}`} subtitle="Người dùng sẽ đăng nhập bằng mật khẩu mới này." onClose={onClose}>
      <form className="panel-body um-form" onSubmit={handleSubmit}>
        {error && <div className="notice um-notice-error"><AlertCircle size={15} /> {error}</div>}
        <div>
          <label className="field-label" htmlFor="um-new-password">Mật khẩu mới</label>
          <input id="um-new-password" type="password" className="field" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Tối thiểu 6 ký tự" autoComplete="new-password" required />
        </div>
        <div>
          <label className="field-label" htmlFor="um-new-confirm">Xác nhận mật khẩu mới</label>
          <input id="um-new-confirm" type="password" className="field" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" required />
        </div>
        <div className="um-form-actions">
          <button type="button" className="button button-secondary" onClick={onClose} disabled={saving}>Hủy</button>
          <button type="submit" className="button button-primary" disabled={saving}>{saving ? 'Đang lưu…' : 'Đặt lại mật khẩu'}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function UsersPage() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [assignable, setAssignable] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState({ type: '', text: '' });
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [modal, setModal] = useState(null); // { type: 'create' | 'edit' | 'password', target }
  const [busyId, setBusyId] = useState(null);

  const canManageUsers = Boolean(me?.permissions?.includes(PERMISSIONS.USERS_MANAGE));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [usersRes, rolesRes] = await Promise.all([userApi.list(), userApi.roles()]);
      setUsers(usersRes.users || []);
      setAssignable(usersRes.assignable || []);
      setRoles(rolesRes.roles || []);
    } catch (err) {
      setNotice({ type: 'error', text: errorText(err, 'Không thể tải danh sách thành viên.') });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (canManageUsers) load();
  }, [canManageUsers, load]);

  const handleSaved = (message) => {
    setModal(null);
    setNotice({ type: 'success', text: message });
    load();
  };

  const toggleLock = async (target) => {
    const locking = target.status !== 'locked';
    if (locking && !window.confirm(`Khóa tài khoản @${target.username}? Người dùng sẽ bị đăng xuất và không thể đăng nhập cho đến khi được mở khóa.`)) return;
    setBusyId(target.id);
    try {
      await userApi.update(target.id, { status: locking ? 'locked' : 'active' });
      setNotice({ type: 'success', text: locking ? `Đã khóa tài khoản @${target.username}.` : `Đã mở khóa tài khoản @${target.username}.` });
      await load();
    } catch (err) {
      setNotice({ type: 'error', text: errorText(err, 'Không thể cập nhật trạng thái.') });
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (target) => {
    if (!window.confirm(`Xóa vĩnh viễn tài khoản @${target.username}? Bài đăng đã tạo vẫn được giữ lại. Thao tác này không thể hoàn tác.`)) return;
    setBusyId(target.id);
    try {
      const res = await userApi.remove(target.id);
      setNotice({ type: 'success', text: res.message });
      await load();
    } catch (err) {
      setNotice({ type: 'error', text: errorText(err, 'Không thể xóa tài khoản.') });
    } finally {
      setBusyId(null);
    }
  };

  const stats = useMemo(() => ({
    total: users.length,
    admin: users.filter((u) => u.role === 'admin').length,
    manager: users.filter((u) => u.role === 'manager').length,
    user: users.filter((u) => u.role === 'user').length,
    locked: users.filter((u) => u.status === 'locked').length,
    manageable: users.filter((u) => u.manageable).length
  }), [users]);

  const filteredUsers = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (statusFilter !== 'all' && u.status !== statusFilter) return false;
      if (!keyword) return true;
      return [u.username, u.email, u.name].some((value) => value?.toLowerCase().includes(keyword));
    });
  }, [users, search, roleFilter, statusFilter]);

  const visibleRoleKeys = roles.filter((role) => role.level <= (me?.level || 0)).map((role) => role.key);

  const metricCards = [
    { label: 'Tài khoản trong phạm vi', value: stats.total, foot: `${stats.manageable} tài khoản bạn được quản lý`, icon: UsersRound },
    ...(me?.role === 'admin' ? [{ label: 'Quản trị viên', value: stats.admin, foot: 'Ngang cấp — chỉ xem', icon: Crown }] : []),
    { label: 'Quản lý', value: stats.manager, foot: me?.role === 'admin' ? 'Bạn có thể quản lý' : 'Ngang cấp — chỉ xem', icon: ShieldCheck },
    { label: 'Thành viên', value: stats.user, foot: 'Bạn có thể quản lý', icon: UserRound },
    { label: 'Đang bị khóa', value: stats.locked, foot: stats.locked ? 'Không thể đăng nhập' : 'Không có tài khoản bị khóa', icon: Lock }
  ];

  return (
    <MainLayout
      title="Quản lý thành viên"
      requiredPermission={PERMISSIONS.USERS_MANAGE}
      actions={(
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="button button-secondary" onClick={load} disabled={loading}>
            <RefreshCw size={15} className={loading ? 'spin' : ''} /> Làm mới
          </button>
          <button type="button" className="button button-primary" onClick={() => setModal({ type: 'create' })} disabled={assignable.length === 0}>
            <Plus size={15} /> Tạo tài khoản
          </button>
        </div>
      )}
    >
      {notice.text && (
        <div className={`notice um-notice um-notice-${notice.type}`}>
          {notice.type === 'error' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
          <span>{notice.text}</span>
          <button type="button" className="um-icon-btn" onClick={() => setNotice({ type: '', text: '' })} aria-label="Đóng thông báo"><X size={14} /></button>
        </div>
      )}

      <div className="metric-grid um-metrics">
        {metricCards.map(({ label, value, foot, icon: Icon }) => (
          <div className="metric-card" key={label}>
            <div className="metric-label"><Icon size={15} /> {label}</div>
            <div className="metric-value">{loading ? '—' : value}</div>
            <div className="metric-foot">{foot}</div>
          </div>
        ))}
      </div>

      <section className="panel" style={{ marginBottom: 22 }}>
        <div className="filter-bar">
          <div className="um-search">
            <Search size={15} aria-hidden="true" />
            <input
              className="field"
              placeholder="Tìm theo tên đăng nhập, Gmail, tên hiển thị…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Tìm thành viên"
            />
          </div>
          <div className="table-tools">
            <select className="field um-filter" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} aria-label="Lọc theo vai trò">
              <option value="all">Tất cả vai trò</option>
              {visibleRoleKeys.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}
            </select>
            <select className="field um-filter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Lọc theo trạng thái">
              <option value="all">Mọi trạng thái</option>
              <option value="active">Đang hoạt động</option>
              <option value="locked">Đã khóa</option>
            </select>
          </div>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Tài khoản</th>
                <th>Gmail</th>
                <th>Vai trò</th>
                <th>Trạng thái</th>
                <th>Đăng nhập gần nhất</th>
                <th>Ngày tạo</th>
                <th style={{ textAlign: 'right' }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loading && users.length === 0 && (
                <tr><td colSpan="7"><div className="empty-state">Đang tải danh sách thành viên…</div></td></tr>
              )}
              {!loading && filteredUsers.length === 0 && (
                <tr><td colSpan="7"><div className="empty-state">Không có tài khoản phù hợp bộ lọc.</div></td></tr>
              )}
              {filteredUsers.map((u) => (
                <tr key={u.id} className={u.status === 'locked' ? 'um-row-locked' : ''}>
                  <td>
                    <div className="um-user-cell">
                      <span className={`um-avatar um-avatar-${u.role}`}>{u.name?.charAt(0)?.toUpperCase() || 'U'}</span>
                      <div>
                        <strong>{u.name}{u.isSelf && <span className="um-self-tag">Bạn</span>}</strong>
                        <small>@{u.username}</small>
                      </div>
                    </div>
                  </td>
                  <td className="muted">{u.email || '—'}</td>
                  <td><RoleBadge role={u.role} label={u.roleLabel} size="sm" /></td>
                  <td>
                    <span className={`status-pill ${u.status === 'locked' ? 'failed' : 'published'}`}>
                      {u.status === 'locked' ? 'Đã khóa' : 'Hoạt động'}
                    </span>
                  </td>
                  <td className="muted">{formatDateTime(u.lastLoginAt, 'Chưa đăng nhập')}</td>
                  <td className="muted">{formatDateTime(u.createdAt)}</td>
                  <td>
                    {u.manageable ? (
                      <div className="um-actions">
                        <button type="button" className="um-icon-btn" title="Chỉnh sửa" aria-label={`Chỉnh sửa @${u.username}`} onClick={() => setModal({ type: 'edit', target: u })} disabled={busyId === u.id}>
                          <Pencil size={15} />
                        </button>
                        <button type="button" className="um-icon-btn" title="Đặt lại mật khẩu" aria-label={`Đặt lại mật khẩu @${u.username}`} onClick={() => setModal({ type: 'password', target: u })} disabled={busyId === u.id}>
                          <KeyRound size={15} />
                        </button>
                        <button type="button" className="um-icon-btn" title={u.status === 'locked' ? 'Mở khóa' : 'Khóa tài khoản'} aria-label={u.status === 'locked' ? `Mở khóa @${u.username}` : `Khóa @${u.username}`} onClick={() => toggleLock(u)} disabled={busyId === u.id}>
                          {u.status === 'locked' ? <LockOpen size={15} /> : <Lock size={15} />}
                        </button>
                        <button type="button" className="um-icon-btn is-danger" title="Xóa tài khoản" aria-label={`Xóa @${u.username}`} onClick={() => handleDelete(u)} disabled={busyId === u.id}>
                          <Trash2 size={15} />
                        </button>
                      </div>
                    ) : (
                      <span className="um-readonly" title={u.isSelf ? 'Cập nhật thông tin của bạn tại trang Hồ sơ' : 'Không thể chỉnh sửa tài khoản cùng cấp hoặc cấp cao hơn'}>
                        {u.isSelf ? 'Sửa tại Hồ sơ' : 'Chỉ xem'}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <h2>Phân cấp vai trò & quyền hạn</h2>
          <small className="muted">Mỗi vai trò chỉ quản lý được các vai trò thấp hơn</small>
        </div>
        <div className="panel-body um-role-grid">
          {roles.map((role) => (
            <div key={role.key} className={`um-role-card${role.key === me?.role ? ' is-current' : ''}`}>
              <div className="um-role-card-head">
                <RoleBadge role={role.key} label={role.label} />
                {role.key === me?.role && <span className="um-self-tag">Vai trò của bạn</span>}
              </div>
              <p className="muted">{role.description}</p>
              <ul>
                <li>Các chức năng cơ bản: viết bài, lên lịch, AI Studio, quản lý Fanpage của mình</li>
                {role.permissions.map((permission) => <li key={permission}>{PERMISSION_LABELS[permission] || permission}</li>)}
              </ul>
              <small className="muted">
                {assignable.includes(role.key) ? '✓ Bạn có thể cấp vai trò này' : 'Bạn không thể cấp vai trò này'}
              </small>
            </div>
          ))}
        </div>
      </section>

      {modal?.type === 'create' && (
        <UserFormModal mode="create" assignable={assignable} onClose={() => setModal(null)} onSaved={handleSaved} />
      )}
      {modal?.type === 'edit' && (
        <UserFormModal mode="edit" target={modal.target} assignable={assignable} onClose={() => setModal(null)} onSaved={handleSaved} />
      )}
      {modal?.type === 'password' && (
        <ResetPasswordModal target={modal.target} onClose={() => setModal(null)} onSaved={handleSaved} />
      )}
    </MainLayout>
  );
}
