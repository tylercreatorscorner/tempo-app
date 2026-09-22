import {can} from '@/lib/auth/permissions';
import type {WorkspaceScope} from '@/lib/auth/workspace-scope';
export function canUseOperations(scope:WorkspaceScope|null,write=false){
 return !!scope && !scope.impersonating && scope.tenantId===process.env.COMMUNITY_OPS_TEMPO_TENANT_ID && scope.brandScope.kind==='all' && ['owner','admin'].includes(scope.role) && (process.env.COMMUNITY_OPS_TEMPO_USER_IDS??'').split(',').map(s=>s.trim()).filter(Boolean).includes(scope.userId) && can(scope,'messages',write?'write':'read');
}
