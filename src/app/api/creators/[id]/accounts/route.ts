import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getWorkspaceScope, type WorkspaceScope } from '@/lib/auth/workspace-scope';

/**
 * Confirms the creator belongs to the caller's tenant and — for scoped
 * managers — is linked to at least one of their brands. Returns the tenant
 * id on success, or a NextResponse to return on failure. The service-role
 * client bypasses RLS, so this is enforced explicitly.
 */
async function authorizeCreator(
  scope: WorkspaceScope,
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  creatorId: string,
): Promise<string | NextResponse> {
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
      return NextResponse.json(
        { error: 'Forbidden: creator not in your brands' }, { status: 403 });
    }
  }
  return scope.tenantId;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const scope = await getWorkspaceScope();
  if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const creatorId = id; // UUID string now

  const body = await request.json();
  const { tiktok_username } = body;

  if (!tiktok_username || typeof tiktok_username !== 'string') {
    return NextResponse.json({ error: 'tiktok_username is required' }, { status: 400 });
  }

  const handle = tiktok_username.replace(/^@/, '').trim().toLowerCase();
  if (!handle) {
    return NextResponse.json({ error: 'Invalid handle' }, { status: 400 });
  }

  const supabase = await createAdminClient();

  const authz = await authorizeCreator(scope, supabase, creatorId);
  if (authz instanceof NextResponse) return authz;

  // Check if already linked
  const { data: existing } = await supabase
    .from('tiktok_accounts')
    .select('id')
    .eq('creator_id', creatorId)
    .eq('tiktok_username', handle)
    .limit(1);

  if (existing && existing.length > 0) {
    return NextResponse.json({ error: 'Account already linked' }, { status: 409 });
  }

  const { error } = await supabase
    .from('tiktok_accounts')
    .insert({ creator_id: creatorId, tiktok_username: handle, tenant_id: authz });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const scope = await getWorkspaceScope();
  if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const creatorId = id; // UUID

  const body = await request.json();
  const { tiktok_username } = body;

  if (!tiktok_username) {
    return NextResponse.json({ error: 'tiktok_username is required' }, { status: 400 });
  }

  const supabase = await createAdminClient();

  const authz = await authorizeCreator(scope, supabase, creatorId);
  if (authz instanceof NextResponse) return authz;

  const { error } = await supabase
    .from('tiktok_accounts')
    .delete()
    .eq('creator_id', creatorId)
    .eq('tiktok_username', tiktok_username)
    .eq('tenant_id', scope.tenantId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
