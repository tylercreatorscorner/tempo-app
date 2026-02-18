import type { UserRole, Portal, TenantPlan } from '@/types';

/** Mapping of portals to allowed roles */
const PORTAL_ROLES: Record<Portal, UserRole[]> = {
  admin: ['owner', 'admin'],
  manager: ['owner', 'admin', 'manager'],
  brand: ['owner', 'admin', 'brand'],
  creator: ['owner', 'admin', 'creator'],
};

/** Role hierarchy — higher index = more privilege */
const ROLE_HIERARCHY: UserRole[] = ['creator', 'brand', 'viewer', 'manager', 'admin', 'owner'];

/** Check if a user role has at least the required role level */
export function hasRole(userRole: UserRole, requiredRole: UserRole): boolean {
  return ROLE_HIERARCHY.indexOf(userRole) >= ROLE_HIERARCHY.indexOf(requiredRole);
}

/** Check if a role can access a specific portal */
export function canAccess(role: UserRole, portal: Portal): boolean {
  return PORTAL_ROLES[portal].includes(role);
}

/** Get the default portal for a given role */
export function getDefaultPortal(role: UserRole): Portal {
  switch (role) {
    case 'owner':
    case 'admin':
      return 'admin';
    case 'manager':
      return 'manager';
    case 'brand':
      return 'brand';
    case 'creator':
      return 'creator';
    case 'viewer':
      return 'admin';
    default:
      return 'admin';
  }
}

/** Require a role — throws if insufficient. Use in server components/actions. */
export function requireRole(userRole: UserRole, requiredRole: UserRole): void {
  if (!hasRole(userRole, requiredRole)) {
    throw new Error(`Insufficient permissions: requires ${requiredRole}, got ${userRole}`);
  }
}

/**
 * Check if a plan supports a feature.
 * Brand plan: single brand, no multi-brand features.
 * Agency+: multi-brand, manager portal, etc.
 */
export function planSupports(plan: TenantPlan, feature: 'multi_brand' | 'manager_portal' | 'api_access'): boolean {
  switch (feature) {
    case 'multi_brand':
      return plan !== 'brand';
    case 'manager_portal':
      return plan !== 'brand';
    case 'api_access':
      return plan === 'enterprise';
    default:
      return false;
  }
}
