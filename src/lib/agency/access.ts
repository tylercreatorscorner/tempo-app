import type { WorkspaceScope } from '@/lib/auth/workspace-scope';
import { can } from '@/lib/auth/permissions';

/** Internal agency books require leadership access, not just visibility of all brands. */
export function canAccessAgency(scope: WorkspaceScope | null, write = false): scope is WorkspaceScope {
  return Boolean(scope?.tenantId && scope.userId && !scope.impersonating
    && (scope.role === 'owner' || (scope.role === 'admin'
      && (scope.agencyLeadership === 'owner' || scope.agencyLeadership === 'vp')))
    && scope.brandScope.kind === 'all' && scope.canViewFinance
    && can(scope, 'reporting', 'read') && can(scope, 'earnings', 'read')
    && (!write || can(scope, 'earnings', 'configure')));
}
