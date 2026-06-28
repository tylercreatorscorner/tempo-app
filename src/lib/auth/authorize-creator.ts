import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import type { WorkspaceScope } from './workspace-scope';

/**
 * Confirms a creator belongs to the caller's tenant and — for scoped managers —
 * is linked to at least one of their brands. Returns `null` on success, or a
 * `NextResponse` (404/403) to return on failure.
 *
 * Use on any route that takes a creator_id and reads/writes that creator's data
 * via the SERVICE-ROLE client (which bypasses RLS), so isolation is enforced in
 * the application. Mirrors the inline check in /api/creators/[id]/* and is the
 * canonical version to reuse.
 */
export async function authorizeCreator(
  scope: WorkspaceScope,
  creatorId: string,
): Promise<NextResponse | null> {
  const supabase = await createAdminClient();

  const { data: row } = await supabase
    .from('creators_v2')
    .select('id')
    .eq('id', creatorId)
    .eq('tenant_id', scope.tenantId)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: 'Creator not found' }, { status: 404 });

  if (scope.brandScope.kind === 'scoped') {
    const ids = scope.brandScope.brandIds;
    const { data: link } = await supabase
      .from('creator_brands')
      .select('id')
      .eq('creator_id', creatorId)
      .in('brand_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])
      .limit(1);
    if (!link || link.length === 0) {
      return NextResponse.json({ error: 'Forbidden: creator not in your brands' }, { status: 403 });
    }
  }
  return null;
}
