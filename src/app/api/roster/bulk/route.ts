import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { getBrandRegistry, slugToUuid } from '@/lib/data/brand-registry';

/**
 * POST /api/roster/bulk — add many creators to the managed roster in one shot,
 * all under ONE brand. Brand-scoped just like the single-add (POST /api/roster):
 * owner/admin (full tenant) can target any brand; a manager can bulk-add only to
 * brands in their access. tenant_id comes from the authenticated SESSION, never
 * the request body.
 *
 * This MIRRORS the 4-table write of the single-add (POST /api/roster) so a
 * bulk-added creator is indistinguishable from a hand-added one. Keep the two
 * in sync if either schema changes:
 *   creators_v2      — the v2 identity (created only when the handle is new)
 *   managed_creators — the legacy roster row the page reads; one per creator
 *   tiktok_accounts  — one row per (handle, brand); the canonical handle store
 *   creator_brands   — the v2 managed junction (retainer + post requirement)
 *
 * Dedup is three-way, so re-running a list is safe and idempotent:
 *   - handle already ACTIVE on this brand's roster  → skipped (reported)
 *   - handle on an ARCHIVED row for this brand       → un-archived in place
 *     (restored). A fresh insert would violate the UNIQUE(brand, lower(
 *     account_1)) index, which has no archived predicate — so we must reuse
 *     the existing row rather than insert a new one.
 *   - otherwise                                      → added
 *
 * Body: {
 *   brand: string,                       // brand slug — required, one per batch
 *   creators: Array<{ handle: string, extraHandles?: string[], name?: string,
 *                     retainer?: number, monthly_post_requirement?: number }>,
 *     — extraHandles are the SAME person's other accounts → account_2..5.
 *   defaults?: { retainer?: number, monthly_post_requirement?: number },  // used when a row omits its own
 * }
 */

const ACCOUNT_COLS = ['account_1', 'account_2', 'account_3', 'account_4', 'account_5'] as const;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Fetch every row of a query, paging past PostgREST's default 1000-row cap.
 *  `make` must return a FRESH builder each call carrying a stable `.order()`. */
async function pageAll<T>(
  make: () => { range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }> },
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await make().range(from, from + 999);
    if (error || !data || data.length === 0) break;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

/** Fetch every row matching a (possibly long) `.in()` list: chunk the list so a
 *  long URL can't overflow into a silent PARTIAL result, then page each chunk
 *  past the 1000-row cap. Both truncations here would leave a real handle looking
 *  "new" and mint a DUPLICATE creators_v2 identity. */
async function fetchInAll<T>(
  make: (batch: string[]) => { range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }> },
  values: string[],
): Promise<T[]> {
  const out: T[] = [];
  for (const batch of chunk(values, 200)) out.push(...(await pageAll<T>(() => make(batch))));
  return out;
}

const norm = (s: string) => s.toLowerCase().replace(/^@/, '');

export async function POST(request: NextRequest) {
  const scope = await getWorkspaceScope();
  if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const tenantId = scope.tenantId;

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
  // A scoped manager may only bulk-add to brands in their access — mirrors the
  // single-add. Owner/admin (brandScope 'all') can target any brand. (Previously
  // this route was owner/admin-only, so managers got a bare 403 even for their
  // own brands.)
  if (scope.brandScope.kind === 'scoped' && !scope.brandScope.brandSlugs.includes(brand)) {
    return NextResponse.json({ error: 'Forbidden: brand not in your access' }, { status: 403 });
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

  // Batch-level defaults, applied when a row doesn't carry its own value. A
  // value of 0 is intentional (e.g. a $0 retainer), so the guard is >= 0.
  const dr = Number(defaults?.retainer);
  const dm = Number(defaults?.monthly_post_requirement);
  const defRetainer = Number.isFinite(dr) && dr >= 0 ? dr : 0;
  const defMpr = Number.isFinite(dm) && dm >= 0 ? dm : 30;

  // ── Normalize + dedup the payload by handle (lowercased), keeping the first.
  //
  // `key` is the primary handle; `allKeys` is every handle this ONE person has
  // (account_1..5). A sheet writes them in one cell — "supplementbestie,
  // newtiktokshopcreator, supplementfairy" — and the parser splits them, but
  // they are one creator and must be deduped, looked up and written as one.
  type InRow = {
    handle: string; key: string; allKeys: string[];
    name: string | null; retainer: number; mpr: number; products: string[];
  };
  const seen = new Set<string>();
  const incoming: InRow[] = [];
  for (const c of creators) {
    const raw = String((c.handle ?? '')).trim().replace(/^@/, '');
    if (!raw) continue;
    const key = raw.toLowerCase();
    if (seen.has(key)) continue;
    // Extra handles are normalised the same way and deduped against the whole
    // batch, so the same handle cannot arrive twice under two people.
    const extras = (Array.isArray(c.extraHandles) ? c.extraHandles : [])
      .map((h) => String(h ?? '').trim().replace(/^@/, '').toLowerCase())
      .filter((h) => h && h !== key && !seen.has(h));
    const allKeys = [key, ...Array.from(new Set(extras))].slice(0, 5);
    for (const k of allKeys) seen.add(k);
    const rr = Number(c.retainer);
    const rm = Number(c.monthly_post_requirement);
    const name = c.name != null && String(c.name).trim() ? String(c.name).trim() : null;
    const products = Array.isArray(c.product_assignments)
      ? (c.product_assignments as unknown[]).map((k) => String(k)).filter(Boolean)
      : [];
    incoming.push({
      handle: raw,
      key,
      allKeys,
      name,
      retainer: Number.isFinite(rr) && rr >= 0 ? rr : defRetainer,
      mpr: Number.isFinite(rm) && rm >= 0 ? rm : defMpr,
      products,
    });
  }
  if (incoming.length === 0) {
    return NextResponse.json({ error: 'No valid creator handles found' }, { status: 400 });
  }

  const supabase = await createAdminClient();
  // r.key is the lowercased handle. tiktok_accounts IS stored lowercase — but by
  // a database trigger (trg_tiktok_accounts_lower_username), not by this route,
  // which used to write r.handle in whatever case the spreadsheet had. The
  // trigger covered for it there; managed_creators has no such trigger, and 59
  // of its account_1 values are mixed case as a result. Everything below now
  // writes the lowercased key, so the invariant holds without the trigger
  // having to save it.
  //
  // EVERY handle is looked up, not just the primary: if "newtiktokshopcreator"
  // is already on this brand's roster under someone else, adding it as person
  // B's account_2 would silently create a second owner for the same handle.
  const handles = incoming.flatMap((r) => r.allKeys);

  // ── Read this brand's existing managed_creators (active AND archived) so we
  //    can three-way partition. archived rows still carry their handle in
  //    account_1..5, so they must be matched — re-adding one un-archives it.
  const existingManaged = await pageAll<Record<string, unknown>>(() =>
    supabase
      .from('managed_creators')
      .select('id, creator_id, archived_at, account_1, account_2, account_3, account_4, account_5')
      .eq('tenant_id', tenantId)
      .eq('brand', brand)
      .order('id', { ascending: true }));
  const activeHandles = new Set<string>();
  const archivedByHandle = new Map<string, { rowId: string; creatorId: string | null }>();
  // Also index by creator_id: a person's OTHER handles aren't in this brand's
  // account_1..5, so handle-only dedup misses them and mints a duplicate for a
  // creator already managed here. Dedup by the PERSON too.
  const activeCreatorIds = new Set<string>();
  const archivedByCreator = new Map<string, { rowId: string }>();
  for (const m of existingManaged) {
    const isArchived = m.archived_at != null;
    const cid = (m.creator_id as string | null) ?? null;
    if (isArchived) {
      if (cid && !archivedByCreator.has(cid)) archivedByCreator.set(cid, { rowId: m.id as string });
    } else if (cid) {
      activeCreatorIds.add(cid);
    }
    for (const col of ACCOUNT_COLS) {
      const v = m[col] as string | null;
      if (!v) continue;
      const h = norm(v);
      if (isArchived) {
        if (!archivedByHandle.has(h)) archivedByHandle.set(h, { rowId: m.id as string, creatorId: cid });
      } else {
        activeHandles.add(h);
      }
    }
  }

  // ── Resolve existing creators_v2 identities by handle (covers the
  //    all-creators universe rows and anyone already in the system).
  const existingAccounts = await fetchInAll<{ tiktok_username: string | null; creator_id: string | null }>(
    (batch) => supabase
      .from('tiktok_accounts')
      .select('tiktok_username, creator_id')
      .eq('tenant_id', tenantId)
      .in('tiktok_username', batch)
      .order('id', { ascending: true }),
    handles,
  );
  const handleToCreator = new Map<string, string>();
  for (const a of existingAccounts) {
    const h = norm(a.tiktok_username ?? '');
    if (h && a.creator_id && !handleToCreator.has(h)) handleToCreator.set(h, a.creator_id);
  }

  // ── Three-way partition.
  const skipped: { handle: string; reason: string }[] = [];
  const toRestore: { rowId: string; creatorId: string | null; row: InRow }[] = [];
  const toAdd: InRow[] = [];
  // Track creator_ids already claimed this batch so two DIFFERENT handles of the
  // same person (both new to this brand) can't each mint a row.
  const claimedCreators = new Set<string>();
  for (const r of incoming) {
    const cid = handleToCreator.get(r.key) ?? null;
    if ((cid && activeCreatorIds.has(cid)) || activeHandles.has(r.key)) {
      skipped.push({ handle: r.handle, reason: 'already_on_roster' });
    } else if (cid && claimedCreators.has(cid)) {
      skipped.push({ handle: r.handle, reason: 'duplicate_of_same_creator' });
    } else if (cid && archivedByCreator.has(cid)) {
      toRestore.push({ rowId: archivedByCreator.get(cid)!.rowId, creatorId: cid, row: r });
      claimedCreators.add(cid);
    } else if (archivedByHandle.has(r.key)) {
      const a = archivedByHandle.get(r.key)!;
      toRestore.push({ rowId: a.rowId, creatorId: a.creatorId, row: r });
      if (a.creatorId) claimedCreators.add(a.creatorId);
    } else {
      toAdd.push(r);
      if (cid) claimedCreators.add(cid);
    }
  }

  const failed: { handle: string; error: string }[] = [];
  const warnings: string[] = [];

  // ── Provision creators_v2 for brand-new handles. Track the ids we create so
  //    we can roll them back if the managed_creators write fails — otherwise a
  //    failed batch + retry would leak a fresh orphan identity each time.
  const createdCreatorIds: string[] = [];
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
      createdCreatorIds.push(cv.id);
    }));
  }

  // Only rows that now have a v2 identity proceed to the roster write.
  const ready = toAdd.filter((r) => handleToCreator.has(r.key));

  // ── Combo dedup for tiktok_accounts, fetched by creator_id (NOT by the
  //    case-sensitive username we just queried) so a stored "Foo" is caught
  //    when re-adding "foo" — mirrors the single-add's per-creator check and
  //    avoids a duplicate (handle, brand) account row.
  const existingCombos = new Set<string>();
  const readyCreatorIds = [...new Set(ready.map((r) => handleToCreator.get(r.key)!))];
  if (readyCreatorIds.length > 0) {
    const comboRows = await fetchInAll<{ tiktok_username: string | null; brand_id: string | null }>(
      (batch) => supabase
        .from('tiktok_accounts')
        .select('tiktok_username, brand_id')
        .eq('tenant_id', tenantId)
        .in('creator_id', batch)
        .order('id', { ascending: true }),
      readyCreatorIds,
    );
    for (const a of comboRows) {
      const h = norm(a.tiktok_username ?? '');
      if (h) existingCombos.add(`${h}|${a.brand_id ?? 'null'}`);
    }
  }

  let added = 0;
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
      // Bulk add mirrors single-add, and that includes the actor: without it a
      // 500-row import lands in the change log attributed to nobody.
      created_by: scope.email,
      updated_by: scope.email,
      // Lowercased, and account_2..5 actually populated — these columns have
      // existed since the legacy schema and nothing could fill them until now.
      account_1: r.allKeys[0] ?? r.key,
      account_2: r.allKeys[1] ?? null,
      account_3: r.allKeys[2] ?? null,
      account_4: r.allKeys[3] ?? null,
      account_5: r.allKeys[4] ?? null,
      product_assignments: r.products,
    }));
    const { error: mcErr } = await supabase.from('managed_creators').insert(managedRows);
    if (mcErr) {
      // Roll back the creators_v2 identities we just minted so a retry doesn't
      // accumulate orphans (resolution would treat the handles as brand-new).
      if (createdCreatorIds.length > 0) {
        await supabase.from('creators_v2').delete().in('id', createdCreatorIds);
      }
      return NextResponse.json({ error: `Roster insert failed: ${mcErr.message}` }, { status: 500 });
    }
    added = ready.length;

    // tiktok_accounts — one (handle, brand) row, skipping combos already there.
    // One row per (handle, brand) — for EVERY handle the person has, not just
    // the primary, or their other accounts' GMV never resolves back to them.
    const taRows = ready.flatMap((r) =>
      r.allKeys
        .filter((k) => !existingCombos.has(`${k}|${brandUuid}`))
        .map((k, i) => ({
          creator_id: handleToCreator.get(r.key)!,
          tenant_id: tenantId,
          tiktok_username: k,
          brand_id: brandUuid,
          is_primary: i === 0,
        })),
    );
    if (taRows.length > 0) {
      const { error: taErr } = await supabase.from('tiktok_accounts').insert(taRows);
      if (taErr) warnings.push(`Handle linking partially failed: ${taErr.message}`);
    }
  }

  // ── Un-archive (restore) creators that were soft-removed from this brand.
  //    A fresh insert would hit UNIQUE(brand, lower(account_1)), so we reuse
  //    the existing row and refresh its terms from the incoming/default values.
  let restored = 0;
  if (toRestore.length > 0) {
    for (const group of chunk(toRestore, 20)) {
      await Promise.all(group.map(async (t) => {
        const { error } = await supabase
          .from('managed_creators')
          .update({
            archived_at: null,
            status: 'Active',
            employment_status: 'active',
            retainer: t.row.retainer,
            monthly_post_requirement: t.row.mpr,
            updated_by: scope.email,
          })
          .eq('id', t.rowId);
        if (error) failed.push({ handle: t.row.handle, error: error.message });
        else restored++;
      }));
    }
  }

  // ── creator_brands — the v2 managed junction (retainer + post requirement)
  //    for everyone we added or restored that has a v2 identity.
  const cbRows = [
    ...ready.map((r) => ({ creatorId: handleToCreator.get(r.key)!, retainer: r.retainer, mpr: r.mpr })),
    ...toRestore.filter((t) => t.creatorId).map((t) => ({ creatorId: t.creatorId!, retainer: t.row.retainer, mpr: t.row.mpr })),
  ].map((x) => ({
    creator_id: x.creatorId,
    brand_id: brandUuid,
    tenant_id: tenantId,
    is_managed: true,
    status: 'active',
    retainer: x.retainer,
    monthly_post_requirement: x.mpr,
  }));
  if (cbRows.length > 0) {
    const { error: cbErr } = await supabase
      .from('creator_brands')
      .upsert(cbRows, { onConflict: 'creator_id,brand_id', ignoreDuplicates: true });
    if (cbErr) warnings.push(`Brand link partially failed: ${cbErr.message}`);
  }

  return NextResponse.json({
    added,
    restored,
    skipped,
    failed,
    warnings,
    total: incoming.length,
  }, { status: 201 });
}
