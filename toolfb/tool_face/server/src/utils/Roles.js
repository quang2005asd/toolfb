/**
 * Roles.js
 * Định nghĩa phân cấp vai trò (role) và quyền hạn của tài khoản.
 * Quy tắc: tài khoản chỉ quản lý được tài khoản có cấp (level) THẤP HƠN mình;
 * tài khoản cùng cấp hoặc cao hơn chỉ được xem, không được sửa / xóa.
 * Muốn thêm role mới: khai báo thêm một mục trong ROLES với level và permissions phù hợp.
 */

const PERMISSIONS = {
  USERS_MANAGE: 'users.manage',       // Quản lý tài khoản cấp dưới
  POSTS_TEAM: 'posts.team',           // Xem & điều phối bài đăng của tài khoản cấp dưới
  SETTINGS_SYSTEM: 'settings.system'  // Cấu hình hệ thống (AI, Telegram, lịch đăng)
};

const ROLES = {
  admin: {
    key: 'admin',
    label: 'Quản trị viên',
    shortLabel: 'Admin',
    level: 100,
    // Admin được phép cấp quyền Admin cho tài khoản khác (có thể có nhiều Admin)
    canGrantOwnLevel: true,
    description: 'Toàn quyền hệ thống: cấu hình AI / Telegram, quản lý Quản lý & Thành viên, xem toàn bộ bài đăng.',
    permissions: [PERMISSIONS.USERS_MANAGE, PERMISSIONS.POSTS_TEAM, PERMISSIONS.SETTINGS_SYSTEM]
  },
  manager: {
    key: 'manager',
    label: 'Quản lý',
    shortLabel: 'Manager',
    level: 50,
    canGrantOwnLevel: false,
    description: 'Quản lý Thành viên (tạo, sửa, khóa, xóa) và điều phối bài đăng của Thành viên.',
    permissions: [PERMISSIONS.USERS_MANAGE, PERMISSIONS.POSTS_TEAM]
  },
  user: {
    key: 'user',
    label: 'Thành viên',
    shortLabel: 'User',
    level: 10,
    canGrantOwnLevel: false,
    description: 'Sử dụng các chức năng cơ bản: viết bài, lên lịch, AI Studio, quản lý Fanpage của mình.',
    permissions: []
  }
};

const DEFAULT_ROLE = 'user';

function getRole(roleKey) {
  return ROLES[roleKey] || ROLES[DEFAULT_ROLE];
}

function isValidRole(roleKey) {
  return Object.prototype.hasOwnProperty.call(ROLES, roleKey);
}

function roleLevel(roleKey) {
  return getRole(roleKey).level;
}

function hasPermission(roleKey, permission) {
  return getRole(roleKey).permissions.includes(permission);
}

// Tài khoản có role `actorRole` có được chỉnh sửa / xóa tài khoản role `targetRole` không
function canManageRole(actorRole, targetRole) {
  return hasPermission(actorRole, PERMISSIONS.USERS_MANAGE) && roleLevel(actorRole) > roleLevel(targetRole);
}

// Danh sách role mà `actorRole` được phép gán cho tài khoản khác
function assignableRoles(actorRole) {
  if (!hasPermission(actorRole, PERMISSIONS.USERS_MANAGE)) return [];
  const actor = getRole(actorRole);
  return Object.values(ROLES)
    .filter((role) => role.level < actor.level || (actor.canGrantOwnLevel && role.level === actor.level))
    .sort((a, b) => b.level - a.level)
    .map((role) => role.key);
}

function rolesBelow(roleKey) {
  const level = roleLevel(roleKey);
  return Object.values(ROLES).filter((role) => role.level < level).map((role) => role.key);
}

function rolesAtOrAbove(roleKey) {
  const level = roleLevel(roleKey);
  return Object.values(ROLES).filter((role) => role.level >= level).map((role) => role.key);
}

function isTopRole(roleKey) {
  const level = roleLevel(roleKey);
  return Object.values(ROLES).every((role) => role.level <= level);
}

function publicRoles() {
  return Object.values(ROLES)
    .sort((a, b) => b.level - a.level)
    .map(({ key, label, shortLabel, level, description, permissions }) => ({ key, label, shortLabel, level, description, permissions }));
}

module.exports = {
  DEFAULT_ROLE,
  PERMISSIONS,
  ROLES,
  assignableRoles,
  canManageRole,
  getRole,
  hasPermission,
  isTopRole,
  isValidRole,
  publicRoles,
  roleLevel,
  rolesAtOrAbove,
  rolesBelow
};
