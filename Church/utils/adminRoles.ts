import type { AdminRole } from '../data';

export function adminRoleLabel(role: AdminRole): string {
  return role === 'owner' ? 'Owner' : 'Admin';
}
