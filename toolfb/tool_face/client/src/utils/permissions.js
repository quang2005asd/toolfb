// Khóa quyền phải khớp với server/src/utils/Roles.js
export const PERMISSIONS = {
  USERS_MANAGE: 'users.manage',
  POSTS_TEAM: 'posts.team',
  SETTINGS_SYSTEM: 'settings.system'
};

export const ROLE_LABELS = {
  admin: 'Quản trị viên',
  manager: 'Quản lý',
  user: 'Thành viên'
};

export const PERMISSION_LABELS = {
  [PERMISSIONS.USERS_MANAGE]: 'Quản lý tài khoản cấp dưới',
  [PERMISSIONS.POSTS_TEAM]: 'Xem & điều phối bài đăng của cấp dưới',
  [PERMISSIONS.SETTINGS_SYSTEM]: 'Cấu hình hệ thống (AI, Telegram, lịch đăng)'
};

export function hasPermission(user, permission) {
  return Boolean(user?.permissions?.includes(permission));
}

export function roleLabel(role, fallback) {
  return fallback || ROLE_LABELS[role] || ROLE_LABELS.user;
}

export function formatDateTime(value, fallback = '—') {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? fallback
    : date.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
