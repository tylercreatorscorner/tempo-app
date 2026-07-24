import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getBrandRegistry, slugToUuid } from '@/lib/data/brand-registry';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { runRosterQuery } from '@/lib/data/roster-query';

/**
 * GET /api/roster?brand=&status=&search=&page=1&limit=50&sort=&dir=&health=
 *
 * Thin wrapper around the extracted roster query core (lib/data/roster-query),
 * which holds the entire enrichment/filter/sort/summary pipeline — behavior is
 * identical to when the pipeline lived inline here. This route only resolves
 * the auth scope and adapts the result to a NextResponse; the Comms hub
 * audience resolver calls the same core directly (no HTTP round-trip).
 */
export async function GET(request: NextRequest) {
  const scope = await getWorkspaceScope();
  if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const result = await runRosterQuery(scope, searchParams);
  return NextResponse.json(result.body, { status: result.status });
}

// POST /api/roster — add a creator with N TikTok handles.
//
// Body: { real_name, brand, retainer, monthly_post_requirement, discord_name,
//         notes, handles: string[] }. Legacy account_1-only body still works.
export async function POST(request: NextRequest) {
  const scope = await getWorkspaceScope();
  if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const tenantId = scope.tenantId;

  const body = await request.json();
  const { brand, real_name, discord_name, notes, monthly_post_requirement } = body;
  // A finance-blind user (coach / walled-off manager) must not set retainers —
  // force any submitted value to 0 before it reaches the insert/restore paths.
  const retainer = scope.canViewFinance ? body.retainer : 0;

  const rawHandles: string[] = Array.isArray(body.handles)
    ? body.handles
    : (body.account_1 ? [body.account_1] : []);
  const handles: string[] = Array.from(new Set(
    rawHandles
      // lowercase: handles are case-insensitive and tiktok_accounts is stored
      // lowercase, so this both matches existing creators on resolve and keeps
      // the dual-written account_1..5 columns consistent.
      .map((h: unknown) => (typeof h === 'string' ? h.trim().replace(/^@/, '').toLowerCase() : ''))
      .filter(Boolean),
  ));

  if (!real_name && handles.length === 0) {
    return NextResponse.json({ error: 'real_name or at least one handle is required' }, { status: 400 });
  }

  // A scoped user may only add creators to brands they have access to.
  if (scope.brandScope.kind === 'scoped') {
    if (!brand || !scope.brandScope.brandSlugs.includes(brand)) {
      return NextResponse.json(
        { error: 'Forbidden: brand not in your access' }, { status: 403 });
    }
  }

  const supabase = await createAdminClient();
  const reg = await getBrandRegistry();

  // Dual-write account_1..5 from handles[] for back-compat with readers still
  // on the legacy columns. tiktok_accounts is the canonical store.
  const accountColumns: Record<string, string | null> = {};
  for (let i = 0; i < 5; i++) accountColumns[`account_${i + 1}`] = handles[i] ?? null;

  // Product tag keys (reference products.product_key). Optional.
  const productAssignments: string[] = Array.isArray(body.product_assignments)
    ? body.product_assignments.map((k: unknown) => String(k)).filter(Boolean)
    : [];

  // Resolve the creator identity from the handles BEFORE writing, so we dedup by
  // the PERSON (creator_id), not just account_1. Re-adding a creator under a
  // DIFFERENT one of their handles must reuse their existing row for this brand —
  // never mint a second one. The DB's UNIQUE(brand, lower(account_1)) can't tell
  // it's the same person when the primary handle differs (this is exactly how a
  // duplicate LeeFar row for Brittni King slipped in, 2026-07-05).
  // Optional strong identifiers, used to resolve a RETURNING creator to their
  // existing identity before falling back to a handle. All three are UNIQUE on
  // creators_v2 (migrations 068/069), so matching on them stops a re-add under a
  // brand-new handle from minting a duplicate person. Priority: discord_id >
  // email > phone > known handle.
  const discordId = typeof body.discord_id === 'string' ? body.discord_id.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';

  let creatorId: string | null = null;
  if (!creatorId && discordId) {
    const { data } = await supabase.from('creators_v2').select('id')
      .eq('tenant_id', tenantId).eq('discord_id', discordId).limit(1).maybeSingle();
    creatorId = data?.id ?? null;
  }
  if (!creatorId && email) {
    const { data } = await supabase.from('creators_v2').select('id')
      .eq('tenant_id', tenantId).ilike('email', email).limit(1).maybeSingle();
    creatorId = data?.id ?? null;
  }
  if (!creatorId && phone) {
    const { data } = await supabase.from('creators_v2').select('id')
      .eq('tenant_id', tenantId).eq('phone', phone).limit(1).maybeSingle();
    creatorId = data?.id ?? null;
  }
  if (!creatorId && handles.length > 0) {
    const { data: existing } = await supabase
      .from('tiktok_accounts')
      .select('creator_id')
      .in('tiktok_username', handles)
      .eq('tenant_id', tenantId)
      .not('creator_id', 'is', null)
      .limit(1)
      .maybeSingle();
    creatorId = existing?.creator_id ?? null;
  }

  // If this creator already has a row for this brand, reuse it instead of
  // inserting a duplicate: an ACTIVE row → leave it as-is (already managed;
  // change terms via the edit flow, not a re-add); an ARCHIVED row → un-archive
  // and refresh its terms in place.
  let data: Record<string, unknown> | null = null;
  let deduped: 'active' | 'restored' | null = null;
  if (creatorId && brand) {
    const { data: dupes } = await supabase
      .from('managed_creators')
      .select('*')
      .eq('creator_id', creatorId)
      .eq('brand', brand);
    const rows = (dupes as Record<string, unknown>[] | null) ?? [];
    const active = rows.find((r) => r.archived_at == null);
    if (active) {
      data = active;
      deduped = 'active';
    } else if (rows.length > 0) {
      const { data: restored, error: rErr } = await supabase
        .from('managed_creators')
        .update({
          archived_at: null,
          status: 'Active',
          employment_status: 'active',
          retainer: retainer || 0,
          monthly_post_requirement: monthly_post_requirement || 30,
          ...(real_name ? { real_name } : {}),
          ...(notes != null ? { notes } : {}),
          ...(productAssignments.length ? { product_assignments: productAssignments } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq('id', rows[0].id as number)
        .select()
        .single();
      if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });
      data = restored;
      deduped = 'restored';
    }
  }

  // No existing row for this creator+brand → insert a fresh managed_creators row.
  if (!data) {
    const { data: inserted, error } = await supabase
      .from('managed_creators')
      .insert({
        brand: brand || null,
        real_name: real_name || null,
        retainer: retainer || 0,
        discord_name: discord_name || null,
        notes: notes || null,
        monthly_post_requirement: monthly_post_requirement || 30,
        status: 'Active',
        employment_status: 'active',
        tenant_id: tenantId,
        product_assignments: productAssignments,
        ...accountColumns,
      })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    data = inserted;
  }
  if (!data) return NextResponse.json({ error: 'Failed to create roster row' }, { status: 500 });

  // Create the v2 identity if the handles didn't resolve to one, then link it.
  if (!creatorId) {
    const { data: cv } = await supabase
      .from('creators_v2')
      .insert({
        tenant_id: tenantId,
        real_name: real_name || handles[0] || 'Unnamed Creator',
        notes: notes || null,
        discord_username: discord_name || null,
        // Persist the strong identifiers so a future re-add resolves to this same
        // person (only set on create — none matched above, so no unique collision).
        discord_id: discordId || null,
        email: email || null,
        phone: phone || null,
      })
      .select('id')
      .single();
    creatorId = cv?.id ?? null;
  }

  if (creatorId) {
    // Link managed_creators → creators_v2 (only when not already linked).
    if (data.creator_id !== creatorId) {
      await supabase
        .from('managed_creators')
        .update({ creator_id: creatorId })
        .eq('id', data.id as number);
    }

    // One tiktok_accounts row per (handle, brand) — but only for combos that
    // don't already exist. The old onConflict target (tenant, username,
    // brand_id) can't dedupe a null brand_id (NULL is DISTINCT in a Postgres
    // unique index), so re-adding a handle that was already registered inserted
    // a fresh duplicate row. We diff in JS, treating null == null, to prevent
    // that while still allowing the same handle under a genuinely new brand.
    const brandUuid = brand ? slugToUuid(reg, brand) : undefined;
    const { data: existingForCreator } = await supabase
      .from('tiktok_accounts')
      .select('tiktok_username, brand_id')
      .eq('creator_id', creatorId)
      .eq('tenant_id', tenantId);
    const existingCombos = new Set(
      ((existingForCreator as { tiktok_username: string | null; brand_id: string | null }[] | null) ?? [])
        .map((r) => `${(r.tiktok_username ?? '').toLowerCase()}|${r.brand_id ?? 'null'}`),
    );
    for (let i = 0; i < handles.length; i++) {
      const combo = `${handles[i].toLowerCase()}|${brandUuid ?? 'null'}`;
      if (existingCombos.has(combo)) continue;
      existingCombos.add(combo);
      await supabase
        .from('tiktok_accounts')
        .insert({
          creator_id: creatorId,
          tenant_id: tenantId,
          tiktok_username: handles[i],
          brand_id: brandUuid ?? null,
          is_primary: i === 0,
        });
    }

    if (brandUuid) {
      await supabase
        .from('creator_brands')
        .upsert({
          creator_id: creatorId,
          brand_id: brandUuid,
          tenant_id: tenantId,
          is_managed: true,
          status: 'active',
          retainer: retainer || 0,
          monthly_post_requirement: monthly_post_requirement || 30,
        }, { onConflict: 'creator_id,brand_id', ignoreDuplicates: true });
    }
  }

  return NextResponse.json({ data: { ...data, creator_id: creatorId }, deduped }, { status: 201 });
}
