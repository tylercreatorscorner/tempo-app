import type {WorkspaceScope} from '@/lib/auth/workspace-scope';
import {can} from '@/lib/auth/permissions';
import {canUseOperations} from '@/lib/community-ops/access';
import {JIYU_ROLE} from './discord-reconciliation';
export function canReviewDiscordRoles(scope:WorkspaceScope|null,brand:string|null){
 return !!scope && brand===JIYU_ROLE.brand && scope.tenantId===JIYU_ROLE.tenantId && canUseOperations(scope) && can(scope,'roster','read');
}
