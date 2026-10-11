import type { WorkspaceScope } from '@/lib/auth/workspace-scope';
import { isBrandInScope } from '@/lib/auth/workspace-scope';
export function canOpenBrandSetup(scope:WorkspaceScope|null){
 return !!scope?.tenantId && !scope.impersonating && ['owner','admin','manager'].includes(scope.role);
}
export function canManageBrandSetup(scope:WorkspaceScope|null){
 return canOpenBrandSetup(scope) && ['owner','admin'].includes(scope!.role);
}
export function canReadBrandSetup(scope:WorkspaceScope|null,brand:{id:string;slug:string;tenant_id:string}){
 return canOpenBrandSetup(scope) && brand.tenant_id===scope!.tenantId && isBrandInScope(scope!,brand);
}
