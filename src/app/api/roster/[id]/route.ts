import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getWorkspaceScope, type WorkspaceScope } from '@/lib/auth/workspace-scope';

/**
 * Loads the managed_creators row and confirms the caller may act on it.
 * Scoped (manager) users may only touch rows whose brand is in their access.
 * Returns the row's brand on success, or a NextResponse to return on failure.
 */
async function authorizeRosterRow(
  scope: WorkspaceScope,
  admin: Awaited<ReturnType<typeof createAdminClient>>,
  id: string,
): Promise<{ brand: string | null } | NextResponse> {
  const { data: row } = await admin
    .from('managed_creators')
    .select('brand')
    .eq('id', id)
    .eq('tenant_id', scope.tenantId)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: 'Creator not found' }, { status: 404 });
  if (
    scope.brandScope.kind === 'scoped' &&
    !(row.brand && scope.brandScope.brandSlugs.includes(row.brand))
  ) {
    return NextResponse.json(
      { error: 'Forbidden: brand not in your access' }, { status: 403 });
  }
  return { brand: row.brand };
}

// PATCH /api/roster/[id] — update a managed creator.
//
// Accepts a `handles: string[]` array (unlimited) reconciled against
// tiktok_accounts (insert new, delete removed). Dual-writes the first 5 into
// the legacy account_1..5 columns for back-compat until they're dropped.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const scope = await getWorkspaceScope();
  if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const tenantId = scope.tenantId;

  const { id } = await params;
  const body = await request.json();

  const ALLOWED = [
    'real_name', 'brand', 'status', 'retainer', 'monthly_post_requirement',
    'discord_name', 'notes',
  ];
  const updates: Record<string, unknown> = {};
  for (const key of ALLOWED) {
    if (key in body) updates[key] = body[key] ?? null;
  }

  let normalizedHandles: string[] | null = null;
  if (Array.isArray(body.handles)) {
    normalizedHandles = Array.from(new Set(
      (body.handles as unknown[])
        .map((h) => (typeof h === 'string' ? h.trim().replace(/^@/, '') : ''))
        .filter((h): h is string => h.length > 0),
    ));
    for (let i = 0; i < 5; i++) updates[`account_${i + 1}`] = normalizedHandles[i] ?? null;
  } else {
    // Legacy single-slot path.
    for (let i = 1; i <= 5; i++) {
      const key = `account_${i}`;
      if (key in body) {
        const v = typeof body[key] === 'string' ? body[key].replace(/^@/, '').trim() : '';
        updates[key] = v || null;
      }
    }
  }

  // Product tag keys (reference products.product_key). Optional; [] clears them.
  if (Array.isArray(body.product_assignments)) {
    updates.product_assignments = (body.product_assignments as unknown[]).map((k) => String(k)).filter(Boolean);
  }

  if (Object.keys(updates).length === 0 && !normalizedHandles) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const supabase = await createAdminClient();

  // Scoped users may only edit rows in their brands…
  const authz = await authorizeRosterRow(scope, supabase, id);
  if (authz instanceof NextResponse) return authz;
  // …and may not move a creator into a brand outside their access.
  if (
    scope.brandScope.kind === 'scoped' &&
    'brand' in updates &&
    !(typeof updates.brand === 'string' && scope.brandScope.brandSlugs.includes(updates.brand))
  ) {
    return NextResponse.json(
      { error: 'Forbidden: target brand not in your access' }, { status: 403 });
  }

  const { data, error } = await supabase
    .from('managed_creators')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', tenantId) // tenant-scoped — never touch another tenant's row
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Reconcile tiktok_accounts when handles[] was sent.
  //
  // A handle can legitimately own several rows here — one per brand the creator
  // sells for — so we reconcile by DISTINCT handle, never by brand. The old
  // path upserted on (tenant_id, tiktok_username, brand_id) with brand_id unset
  // (null); because Postgres treats NULL as DISTINCT in a unique index, the
  // conflict target never matched and every save INSERTED a fresh duplicate row
  // (the bug where removing a handle and saving multiplied it instead). We now
  // diff against the rows that already exist: delete the handles that are gone,
  // insert only the handles that are genuinely new, and leave the rest alone.
  if (normalizedHandles && data.creator_id) {
    const creatorId = data.creator_id as string;
    const desired = Array.from(new Set(normalizedHandles.map((h) => h.toLowerCase())));

    const { data: existingRows } = await supabase
      .from('tiktok_accounts')
      .select('id, tiktok_username')
      .eq('creator_id', creatorId)
      .eq('tenant_id', tenantId);
    const existing =
      (existingRows as { id: string; tiktok_username: string | null }[] | null) ?? [];

    // Handles that already have at least one row → never re-insert.
    const existingHandles = new Set(
      existing.map((r) => (r.tiktok_username ?? '').toLowerCase()).filter(Boolean),
    );

    // Delete every row whose handle is no longer desired. Targeting by row id
    // (not a handle IN-list) sidesteps case/quoting pitfalls and removes ALL of
    // a dropped handle's brand rows in one shot.
    const idsToDelete = existing
      .filter((r) => !desired.includes((r.tiktok_username ?? '').toLowerCase()))
      .map((r) => r.id);
    if (idsToDelete.length > 0) {
      await supabase.from('tiktok_accounts').delete().in('id', idsToDelete);
    }

    // Insert only handles that don't exist yet (brand_id left null — the row is
    // brand-agnostic until a brand-scoped flow claims it).
    const firstHandle = desired[0];
    for (const lower of desired) {
      if (existingHandles.has(lower)) continue;
      const original = normalizedHandles.find((h) => h.toLowerCase() === lower) ?? lower;
      await supabase.from('tiktok_accounts').insert({
        creator_id: creatorId,
        tenant_id: tenantId,
        tiktok_username: original,
        is_primary: lower === firstHandle,
      });
    }

    // Keep is_primary in sync with the new ordering: the first handle's row(s)
    // are primary, everything else is not. Idempotent; case-insensitive.
    if (firstHandle) {
      await supabase
        .from('tiktok_accounts')
        .update({ is_primary: false })
        .eq('creator_id', creatorId)
        .eq('tenant_id', tenantId);
      await supabase
        .from('tiktok_accounts')
        .update({ is_primary: true })
        .eq('creator_id', creatorId)
        .eq('tenant_id', tenantId)
        .ilike('tiktok_username', firstHandle);
    }
  }

  return NextResponse.json({ data });
}

// DELETE /api/roster/[id] — soft-remove a managed creator from the roster.
//
// Sets archived_at instead of hard-deleting. Hard delete fails because
// creator_messages and discord_match_queue have NO ACTION FKs, and would
// orphan creator_performance (SET NULL) — which is exactly the GMV history
// we want to keep for historical earnings reports.
//
// Archived creators:
//   - disappear from the roster list, renewals, and rev-share calculations
//   - keep all their performance / messaging / audit data intact
//   - can be restored by setting archived_at = NULL
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const scope = await getWorkspaceScope();
  if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const tenantId = scope.tenantId;

  const { id } = await params;
  const supabase = await createAdminClient();

  const authz = await authorizeRosterRow(scope, supabase, id);
  if (authz instanceof NextResponse) return authz;

  const { data, error } = await supabase
    .from('managed_creators')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select('id, real_name')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data)  return NextResponse.json({ error: 'Creator not found' }, { status: 404 });

  return NextResponse.json({ ok: true, archived: data });
}
