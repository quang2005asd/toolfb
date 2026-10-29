import { Crown, ShieldCheck, UserRound } from 'lucide-react';
import { roleLabel } from '../utils/permissions';

const ROLE_ICONS = {
  admin: Crown,
  manager: ShieldCheck,
  user: UserRound
};

export default function RoleBadge({ role, label, size = 'md' }) {
  const Icon = ROLE_ICONS[role] || UserRound;
  return (
    <span className={`role-badge role-${ROLE_ICONS[role] ? role : 'user'}${size === 'sm' ? ' role-badge-sm' : ''}`}>
      <Icon size={size === 'sm' ? 11 : 13} aria-hidden="true" />
      {roleLabel(role, label)}
    </span>
  );
}
