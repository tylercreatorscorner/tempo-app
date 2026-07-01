import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getWorkspaceScope, type WorkspaceScope } from '@/lib/auth/workspace-scope';
import type { SegmentFilterCriteria } from '@/lib/data/segments';

export const runtime = 'nodejs';

/**
 * Load a segment and confirm the caller may act on it. Tenant-scoped always;
 * managers may only touch segments for a brand in their access, or ones they
 * created themselves.
 */
async function authorizeSegment(
  scope: WorkspaceScope,
  admin: Awaited<ReturnType<typeof createAdminClient>>,
  id: string,
): Promise<{ brand_id: string | null; created_by: string | null } | NextResponse> {
  const { data: row } = await admin
    .from('segments')
    .select('brand_id, created_by')
    .eq('id', id)
    .eq('tenant_id', scope.tenantId)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: 'Segment not found' }, { status: 404 });
  if (scope.brandScope.kind === 'scoped') {
    const inBrand = !!row.brand_id && scope.brandScope.brandIds.includes(row.brand_id);
    const mine = row.created_by === scope.userId;
    if (!inBrand && !mine) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return row as { brand_id: string | null; created_by: string | null };
}

// PATCH /api/segments/[id] — rename / update description or filter_criteria.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scope = await getWorkspaceScope();
  if (!scope) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;

  let body: { name?: unknown; description?: unknown; filter_criteria?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const admin = await createAdminClient();
  const authz = await authorizeSegment(scope, admin, id);
  if (authz instanceof NextResponse) return authz;

  const updates: Record<string, unknown> = {};
  if (typeof body.name === 'string' && body.name.trim()) updates.name = body.name.trim();
  if ('description' in body) {
    updates.description = typeof body.description === 'string' && body.description ? body.description : null;
  }
  if (body.filter_criteria && typeof body.filter_criteria === 'object') {
    updates.filter_criteria = body.filter_criteria as SegmentFilterCriteria;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const { data, error } = await admin
    .from('segments')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', scope.tenantId)
    .select()
    .single();
  if (error) {
    if (error.code === '23505' || /duplicate/i.test(error.message)) {
      return NextResponse.json({ error: 'A segment with that name already exists.' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ segment: data });
}

// DELETE /api/segments/[id] — remove a custom segment (hard delete; it's only a saved filter).
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scope = await getWorkspaceScope();
  if (!scope) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;

  const admin = await createAdminClient();
  const authz = await authorizeSegment(scope, admin, id);
  if (authz instanceof NextResponse) return authz;

  const { error } = await admin
    .from('segments')
    .delete()
    .eq('id', id)
    .eq('tenant_id', scope.tenantId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
