import { NextResponse } from 'next/server';
import { getWorkspaceScope } from './workspace-scope';
import { can } from './permissions';

/** Brand administration keeps its existing leadership-only policy and respects view-as. */
export async function getBrandWriteAccess() {
  const scope = await getWorkspaceScope();
  if (!scope?.tenantId || scope.impersonating || !['owner', 'admin'].includes(scope.role) || !can(scope, 'settings', 'write')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return scope;
}
