import type {WorkspaceScope} from '@/lib/auth/workspace-scope';
import {can} from '@/lib/auth/permissions';
export function canReadCohorts(scope:WorkspaceScope|null) {return !!scope && !scope.impersonating && ['owner','admin','manager','coach'].includes(scope.role) && can(scope,'roster','read');}
export function canWriteCohorts(scope:WorkspaceScope|null,assignedManagerId:string|null) {return canReadCohorts(scope) && can(scope!,'roster','write') && (['owner','admin'].includes(scope!.role)||(scope!.role==='manager'&&assignedManagerId===scope!.userId));}
