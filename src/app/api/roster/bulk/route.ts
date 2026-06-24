import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import { getBrandRegistry, slugToUuid } from '@/lib/data/brand-registry';

/**
 * POST /api/roster/bulk — add many creators to the managed roster in one shot,
 * all under ONE brand. Owner/admin only (managers add single creators via the
 * brand-scoped /api/roster). tenant_id comes from the authenticated profile,
 * NEVER from the request body.
 *
 * This MIRRORS the 4-table write of the single-add (POST /api/roster) so a
 * bulk-added creator is indistinguishable from a hand-added one. Keep the two
 * in sync if either schema changes:
 *   creators_v2      — the v2 identity (created only when the handle is new)
 *   managed_creators — the legacy roster row the page reads; one per creator
 *   tiktok_accounts  — one row per (handle, brand); the canonical handle store
 *   creator_brands   — the v2 managed junction (retainer + post requirement)
 *
 * Dedup: any handle already on THIS brand's roster is SKIPPED (reported, not
 * errored), so re-running the same list is safe and idempotent.
 *
 * Body: {
 *   brand: string,                       // brand slug — required, one per batch
 *   creators: Array<{ handle: string, name?: string, retainer?: number, monthly_post_requirement?: number }>,
 *   defaults?: { retainer?: number, monthly_post_requirement?: number },  // used when a row omits its own
 * }
 */

const ACCOUNT_COLS = ['account_1', 'account_2', 'account_3', 'account_4', 'account_5'] as const;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function POST(request: NextRequest) {
  const profile = await requireAdmin();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const tenantId = profile.tenant_id;
  if (!tenantId) return NextResponse.json({ error: 'No tenant' }, { status: 400 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  const { brand, creators, defaults } = body as {
    brand?: string;
    creators?: Array<Record<string, unknown>>;
    defaults?: { retainer?: unknown; monthly_post_requirement?: unknown };
  };

  if (!brand || typeof brand !== 'string') {
    return NextResponse.json({ error: 'A brand is required for bulk add' }, { status: 400 });
  }
  if (!Array.isArray(creators) || creators.length === 0) {
    return NextResponse.json({ error: 'creators array is required' }, { status: 400 });
  }
  if (creators.length > 500) {
    return NextResponse.json({ error: 'Maximum 500 creators per bulk add' }, { status: 400 });
  }

  const reg = await getBrandRegistry();
  const brandUuid = slugToUuid(reg, brand);
  if (!brandUuid) {
    return NextResponse.json({ error: `Unknown brand: ${brand}` }, { status: 400 });
  }

  // Batch-level defaults, applied when a row doesn't carry its own value.
  const dr = Number(defaults?.retainer);
  const dm = Number(defaults?.monthly_post_requirement);
  const defRetainer = Number.isFinite(dr) && dr > 0 ? dr : 0;
  const defMpr = Number.isFinite(dm) && dm > 0 ? dm : 30;

  // ── Normalize + dedup the payload by handle (lowercased), keeping the first.
  type InRow = { handle: string; key: string; name: string | null; retainer: number; mpr: number };
  const seen = new Set<string>();
  const incoming: InRow[] = [];
  for (const c of creators) {
    const raw = String((c.handle ?? '')).trim().replace(/^@/, '');
    if (!raw) continue;
    const key = raw.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const rr = Number(c.retainer);
    const rm = Number(c.monthly_post_requirement);
    const name = c.name != null && String(c.name).trim() ? String(c.name).trim() : null;
    incoming.push({
      handle: raw,
      key,
      name,
      retainer: Number.isFinite(rr) && rr > 0 ? rr : defRetainer,
      mpr: Number.isFinite(rm) && rm > 0 ? rm : defMpr,
    });
  }
  if (incoming.length === 0) {
    return NextResponse.json({ error: 'No valid creator handles found' }, { status: 400 });
  }

  const supabase = await createAdminClient();
  const handles = incoming.map((r) => r.handle);

  // ── Dedup against the roster: which handles are already managed under this
  //    brand? Read account_1..5 of this brand's existing managed_creators.
  const { data: existingManaged } = await supabase
    .from('managed_creators')
    .select('account_1, account_2, account_3, account_4, account_5')
    .eq('tenant_id', tenantId)
    .eq('brand', brand);
  const managedHandles = new Set<string>();
  for (const m of (existingManaged ?? []) as Record<string, string | null>[]) {
    for (const col of ACCOUNT_COLS) {
      const v = m[col];
      if (v) managedHandles.add(v.toLowerCase().replace(/^@/, ''));
    }
  }

  // ── Resolve existing creators_v2 identities by handle (covers the
  //    all-creators universe rows and anyone already in the system), and note
  //    which (handle, brand) combos already exist in tiktok_accounts so we
  //    don't insert duplicate account rows.
  const { data: existingAccounts } = await supabase
    .from('tiktok_accounts')
    .select('tiktok_username, creator_id, brand_id')
    .eq('tenant_id', tenantId)
    .in('tiktok_username', handles);
  const handleToCreator = new Map<string, string>();
  const existingCombos = new Set<string>();
  for (const a of (existingAccounts ?? []) as {
    tiktok_username: string | null; creator_id: string | null; brand_id: string | null;
  }[]) {
    const h = (a.tiktok_username ?? '').toLowerCase().replace(/^@/, '');
    if (!h) continue;
    if (a.creator_id && !handleToCreator.has(h)) handleToCreator.set(h, a.creator_id);
    existingCombos.add(`${h}|${a.brand_id ?? 'null'}`);
  }

  // Partition: skip handles already on this brand's roster.
  const skipped: { handle: string; reason: string }[] = [];
  const toAdd: InRow[] = [];
  for (const r of incoming) {
    if (managedHandles.has(r.key)) skipped.push({ handle: r.handle, reason: 'already_on_roster' });
    else toAdd.push(r);
  }

  const failed: { handle: string; error: string }[] = [];

  // ── Provision creators_v2 for handles we don't yet recognize. Insert in
  //    small concurrent chunks so a large brand-new list stays responsive while
  //    still giving us a reliable handle→id mapping back.
  const needsCreator = toAdd.filter((r) => !handleToCreator.has(r.key));
  for (const group of chunk(needsCreator, 20)) {
    await Promise.all(group.map(async (r) => {
      const { data: cv, error } = await supabase
        .from('creators_v2')
        .insert({ tenant_id: tenantId, real_name: r.name || r.handle })
        .select('id')
        .single();
      if (error || !cv) { failed.push({ handle: r.handle, error: error?.message || 'creator create failed' }); return; }
      handleToCreator.set(r.key, cv.id);
    }));
  }

  // Only rows that now have a v2 identity proceed to the roster write.
  const ready = toAdd.filter((r) => handleToCreator.has(r.key));
  const warnings: string[] = [];

  if (ready.length > 0) {
    // managed_creators — one row per creator (mirrors single-add). account_1
    // holds the handle; creator_id links the v2 identity up front.
    const managedRows = ready.map((r) => ({
      brand,
      real_name: r.name,
      retainer: r.retainer,
      monthly_post_requirement: r.mpr,
      status: 'Active',
      employment_status: 'active',
      tenant_id: tenantId,
      creator_id: handleToCreator.get(r.key)!,
      account_1: r.handle,
      account_2: null, account_3: null, account_4: null, account_5: null,
    }));
    const { error: mcErr } = await supabase.from('managed_creators').insert(managedRows);
    if (mcErr) {
      return NextResponse.json({ error: `Roster insert failed: ${mcErr.message}` }, { status: 500 });
    }

    // tiktok_accounts — one (handle, brand) row, skipping combos already there.
    const taRows = ready
      .filter((r) => !existingCombos.has(`${r.key}|${brandUuid}`))
      .map((r) => ({
        creator_id: handleToCreator.get(r.key)!,
        tenant_id: tenantId,
        tiktok_username: r.handle,
        brand_id: brandUuid,
        is_primary: true,
      }));
    if (taRows.length > 0) {
      const { error: taErr } = await supabase.from('tiktok_accounts').insert(taRows);
      if (taErr) warnings.push(`Handle linking partially failed: ${taErr.message}`);
    }

    // creator_brands — the v2 managed junction (retainer + post requirement).
    const cbRows = ready.map((r) => ({
      creator_id: handleToCreator.get(r.key)!,
      brand_id: brandUuid,
      tenant_id: tenantId,
      is_managed: true,
      status: 'active',
      retainer: r.retainer,
      monthly_post_requirement: r.mpr,
    }));
    const { error: cbErr } = await supabase
      .from('creator_brands')
      .upsert(cbRows, { onConflict: 'creator_id,brand_id', ignoreDuplicates: true });
    if (cbErr) warnings.push(`Brand link partially failed: ${cbErr.message}`);
  }

  return NextResponse.json({
    added: ready.length,
    skipped,
    failed,
    warnings,
    total: incoming.length,
  }, { status: 201 });
}
