import { NextResponse } from 'next/server';
import { getWorkspaceScope } from './workspace-scope';
import { can } from './permissions';

/** Billing identities include payment instructions and remain leadership-only. */
export async function getBillingIdentityAccess(action: 'read' | 'configure') {
  const scope = await getWorkspaceScope();
  const allowed = scope && (action === 'read'
    ? can(scope, 'earnings', 'read') || can(scope, 'invoicing', 'read')
    : !scope.impersonating && can(scope, 'earnings', 'configure'));
  if (!scope?.tenantId || !['owner', 'admin'].includes(scope.role) || !allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return scope;
}
