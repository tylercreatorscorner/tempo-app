import { can } from '@/lib/auth/permissions';
import type { WorkspaceScope } from '@/lib/auth/workspace-scope';
import { createAdminClient } from '@/lib/supabase/server';

export class CreatorInviteError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

/** Claim links grant access to a creator's whole portal, across their brands. */
export function assertCreatorInviteScope(scope: WorkspaceScope | null): asserts scope is WorkspaceScope {
  if (!scope) throw new CreatorInviteError('Unauthorized', 401);
  if (!scope.tenantId || !scope.userId || scope.impersonating
    || !['owner', 'admin'].includes(scope.role) || scope.brandScope.kind !== 'all'
    || !can(scope, 'roster', 'read') || !can(scope, 'roster', 'write')) {
    throw new CreatorInviteError('Forbidden', 403);
  }
}

/** Run before signing, inserting, or sending a credential for a selected creator. */
export async function requireInviteCreator(scope: WorkspaceScope, creatorId: string) {
  assertCreatorInviteScope(scope);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(creatorId)) {
    throw new CreatorInviteError('Invalid creator id', 400);
  }
  const db = await createAdminClient();
  const { data, error } = await db.from('creators_v2').select('id, real_name')
    .eq('id', creatorId).eq('tenant_id', scope.tenantId).maybeSingle();
  if (error) throw new CreatorInviteError('Could not verify this creator. Please retry.', 503);
  if (!data) throw new CreatorInviteError('Creator not found', 404);
  return data as { id: string; real_name: string | null };
}
