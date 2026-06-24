import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getBrandRegistry, slugToUuid, uuidToSlug, resolveUuids } from '@/lib/data/brand-registry';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';

/**
 * Sentinel returned when a real brand is selected but we couldn't resolve any
 * data-level UUID for it. Filtering on this (a UUID that exists in no row)
 * makes the RPCs return ZERO — the honest answer for a brand with no uploaded
 * data. This is deliberately NOT `null`: returning null means "no filter →
 * aggregate every brand", which would mislabel other brands' GMV as this one
 * (the COSRX bug). Unknown brand must show nothing, never everything.
 */
const NO_MATCH_BRAND_ID = '00000000-0000-0000-0000-000000000000';


// account_1..5 stay on the wire for back-compat, but the canonical handle
// list now comes from tiktok_accounts via creator_id. Once all consumers use
// `handles`, the account_N columns can be dropped from the SELECT + schema.
const COLUMNS = [
  'id', 'real_name', 'brand', 'status', 'retainer', 'monthly_post_requirement',
  'discord_name', 'discord_avatar', 'notes', 'created_at', 'joined_at', 'creator_id',
  'account_1', 'account_2', 'account_3', 'account_4', 'account_5',
].join(', ');

// ─── Health derivation ───────────────────────────────────────────────────────
//
// Health is computed per-row from the perf signals (GMV 30d, posts this month,
// last post date) plus the contractual post quota.
//
//   churned  — contract status is Churned/Inactive (terminal)
//   silent   — last post > 14 days ago (or never, with retainer > 0)
//   behind   — posts_this_month / target < expected pace at this point in month
//   healthy  — meeting quota AND not silent
//   no_data  — unmanaged or no signal yet (newly added, no posts ever)

export type CreatorHealth =
  | 'healthy'
  | 'behind'
  | 'silent'
  | 'churned'
  | 'no_data';

const SILENT_DAYS_THRESHOLD = 14;

function daysSince(date: string | null): number | null {
  if (!date) return null;
  const ms = Date.now() - new Date(date + 'T00:00:00Z').getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function paceExpectedPct(): number {
  // Fraction of the way through the current month.
  const now = new Date();
  const dayOfMonth = now.getDate();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return dayOfMonth / lastDay;
}

function deriveHealth(opts: {
  status: string | null;
  retainer: number;
  postsThisMonth: number;
  monthlyTarget: number;
  lastPostDate: string | null;
}): CreatorHealth {
  const { status, retainer, postsThisMonth, monthlyTarget, lastPostDate } = opts;

  // Terminal contract states win.
  if (status === 'Churned' || status === 'Inactive') return 'churned';

  // No signal at all — only meaningful if they're on a retainer (otherwise
  // we don't really care).
  const dsince = daysSince(lastPostDate);
  if (dsince === null) {
    return retainer > 0 ? 'silent' : 'no_data';
  }

  // Silent gate: last post older than threshold.
  if (dsince > SILENT_DAYS_THRESHOLD) return 'silent';

  // Behind pace: only meaningful if there's a contractual quota.
  if (monthlyTarget > 0) {
    const pace = postsThisMonth / monthlyTarget;
    const expected = paceExpectedPct();
    // 10% slack so a creator running slightly behind pace doesn't flip flags
    // every day from a single missed post.
    if (pace < expected - 0.1) return 'behind';
  }

  return 'healthy';
}

interface ManagedRow {
  id: string;
  real_name: string | null;
  brand: string | null;
  status: string | null;
  retainer: number | null;
  monthly_post_requirement: number | null;
  discord_name: string | null;
  discord_avatar: string | null;
  notes: string | null;
  created_at: string | null;
  // When the creator joined the managed roster / campaign. Falls back to
  // created_at when null. Surfaced as the "Joined" column.
  joined_at: string | null;
  // FK to creators_v2 — canonical identity link (Path-B backfill populated it
  // for every row; nullable in schema until other agents migrate).
  creator_id: string | null;
  // Legacy denormalized handle columns; kept for back-compat during the
  // migration. New code reads from `handles` (built via tiktok_accounts).
  account_1: string | null;
  account_2: string | null;
  account_3: string | null;
  account_4: string | null;
  account_5: string | null;
}

interface PerfRow {
  tiktok_username: string;
  gmv_period: string | number;
  posts_period: number;
  last_post_date: string | null;
}

interface BrandGmvRow {
  tiktok_username: string;
  brand_id: string | null;
  gmv_period: string | number;
  posts_period: number;
}

interface MessageRow {
  tiktok_username: string;
  last_message_at: string | null;
  unread_count: number;
}

interface EnrichedRow extends ManagedRow {
  // Canonical handle list (from tiktok_accounts, primary first, unlimited).
  // account_1..5 above stay for back-compat; consumers should read `handles`.
  handles: string[];
  // Period-driven (selector controls these)
  gmv_period: number;
  // Per-(brand-slug) GMV split for the same period — used by the side-panel
  // "Revenue by store" section, the row's store-mix indicator, and the
  // store sub-pill filter. Keys are data-level brand slugs (e.g.
  // 'leefar_nutrition'). Empty object when there's no data.
  gmv_by_store: Record<string, number>;
  // Distinct posts over the selected period (days_back). Drives the "Posts"
  // column on the simplified reference page.
  posts_period: number;
  // Rolling 7-day post count (legacy; retained, unused by the simple page).
  posts_7d: number;
  // Independent of period — most recent post in last 365d (or null)
  last_post_date: string | null;
  // When the creator joined the roster (joined_at ?? created_at). Null for
  // unmanaged universe rows. Surfaced as the "Joined" column.
  joined: string | null;
  health: CreatorHealth;
  // Period gmv ÷ retainer (proxy for "is the contract paying off in this window").
  // null when retainer is 0.
  roi_period: number | null;
  last_message_at: string | null;
  unread_count: number;
  is_managed: boolean;
}

interface UnmanagedPerfRow {
  tiktok_username: string;
  brand_id: string | null;
  real_name: string | null;
  gmv_period: string | number;
  posts_period: number;
  last_post_date: string | null;
}

/**
 * Fallback handle extraction from the legacy denormalized columns. Used only
 * when a managed_creators row has no creator_id link (shouldn't happen after
 * the Path-B backfill, but kept defensive).
 */
function legacyColumnHandles(c: ManagedRow): string[] {
  return [c.account_1, c.account_2, c.account_3, c.account_4, c.account_5]
    .map((h) => (h || '').trim().toLowerCase())
    .filter(Boolean);
}

const SORTABLE_DB = ['retainer', 'real_name', 'monthly_post_requirement', 'created_at', 'status', 'brand'] as const;
const SORTABLE_COMPUTED = ['gmv_period', 'posts_period', 'posts_7d', 'last_post_date', 'health', 'roi_period', 'last_message_at', 'unread_count', 'joined'] as const;
type DbSort = typeof SORTABLE_DB[number];
type ComputedSort = typeof SORTABLE_COMPUTED[number];
type SortCol = DbSort | ComputedSort;

const HEALTH_FILTERS = ['all', 'healthy', 'behind', 'silent', 'churned', 'no_data', 'low_roi'] as const;
type HealthFilter = typeof HEALTH_FILTERS[number];

// GET /api/roster?brand=&status=&search=&page=1&limit=50&sort=&dir=&health=
export async function GET(request: NextRequest) {
  const scope = await getWorkspaceScope();
  if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const tenantId = scope.tenantId;

  // Manager = brand-scoped. owner/admin/viewer = full tenant (brandScope 'all').
  const scoped = scope.brandScope.kind === 'scoped';
  const allowedSlugs = scope.brandScope.kind === 'scoped' ? scope.brandScope.brandSlugs : null;

  const { searchParams } = new URL(request.url);
  const brand  = searchParams.get('brand');

  // A scoped user requesting a brand outside their access gets nothing.
  if (scoped && brand && brand !== 'all' && !allowedSlugs!.includes(brand)) {
    return NextResponse.json({ error: 'Forbidden: brand not in your access' }, { status: 403 });
  }
  const status = searchParams.get('status');
  const search = searchParams.get('search');
  const page   = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit  = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));

  const sortParam = (searchParams.get('sort') || 'retainer') as SortCol;
  const dirParam  = searchParams.get('dir')  || 'desc';
  const ascending = dirParam === 'asc';

  const isComputedSort = (SORTABLE_COMPUTED as readonly string[]).includes(sortParam);
  const dbSortCol: DbSort = (SORTABLE_DB as readonly string[]).includes(sortParam)
    ? (sortParam as DbSort)
    : 'retainer';

  const healthParam = (searchParams.get('health') || 'all') as HealthFilter;
  const healthFilter: HealthFilter = (HEALTH_FILTERS as readonly string[]).includes(healthParam)
    ? healthParam
    : 'all';

  // ?include=managed (default) or ?include=all to also surface unmanaged
  // creators with recent GMV (sourcing-while-triaging). The unmanaged rows
  // come from the get_unmanaged_top_perf RPC; managed rows use the normal
  // roster path.
  const includeParam = searchParams.get('include') || 'managed';
  const includeUnmanaged = includeParam === 'all';

  // ?period=N — number of days back for GMV / ROI / total GMV computations.
  // Defaults to 30 (back-compat). Clamped to [1, 366] to keep RPCs bounded.
  // posts_this_month + health + last_post stay independent of this.
  const periodParam = parseInt(searchParams.get('period') || '30', 10);
  const periodDays = Number.isFinite(periodParam)
    ? Math.max(1, Math.min(366, periodParam))
    : 30;

  // ?store=<slug> — optional sub-filter when an umbrella brand is active.
  // Filters managed rows down to those whose period-GMV came primarily from
  // that store. Applied client-side after enrichment; null = no sub-filter.
  const storeFilter = searchParams.get('store');

  const supabase = await createAdminClient();
  const reg = await getBrandRegistry();

  // ── 1. Fetch ALL matching managed creators (no DB pagination yet — we need
  // the full set to compute health-aggregates and to support filtering by
  // health/computed columns).
  let baseQuery = supabase
    .from('managed_creators')
    .select(COLUMNS)
    .eq('tenant_id', tenantId)
    .is('archived_at', null);

  if (brand && brand !== 'all') baseQuery = baseQuery.eq('brand', brand);
  else if (scoped) baseQuery = baseQuery.in('brand', allowedSlugs!); // [] → no rows (fail-closed)
  if (status && status !== 'all') baseQuery = baseQuery.eq('status', status);
  if (search) {
    baseQuery = baseQuery.or(
      `real_name.ilike.%${search}%,account_1.ilike.%${search}%,discord_name.ilike.%${search}%`,
    );
  }

  const { data: rawRows, error } = await baseQuery as { data: ManagedRow[] | null; error: { message: string } | null };
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const allRows: ManagedRow[] = rawRows ?? [];

  // ── 1b. Resolve handles per row via tiktok_accounts (one query for the
  // page). Canonical handle source post-Path-B; account_1..5 are only a
  // fallback for rows that somehow lack a creator_id link.
  const creatorIds = allRows.map((r) => r.creator_id).filter((v): v is string => !!v);
  const handlesByCreatorId = new Map<string, string[]>();
  if (creatorIds.length > 0) {
    const { data: taRows, error: taErr } = await supabase
      .from('tiktok_accounts')
      .select('creator_id, tiktok_username, is_primary')
      .in('creator_id', creatorIds)
      .order('is_primary', { ascending: false })
      .order('id', { ascending: true });
    if (taErr) {
      console.error('[/api/roster] tiktok_accounts join failed:', taErr.message);
    } else {
      // A handle can legitimately own several rows — one per brand the creator
      // sells for (e.g. the same handle registered under catakor + jiyu). For
      // the roster's handle list we want each DISTINCT handle once. taRows is
      // ordered is_primary DESC, id ASC, so the first occurrence is the
      // primary/oldest row — the one we keep.
      const seenByCreator = new Map<string, Set<string>>();
      for (const row of (taRows as { creator_id: string; tiktok_username: string }[] | null) ?? []) {
        if (!row.tiktok_username) continue;
        const key = row.tiktok_username.toLowerCase();
        const seen = seenByCreator.get(row.creator_id) ?? new Set<string>();
        if (seen.has(key)) continue;
        seen.add(key);
        seenByCreator.set(row.creator_id, seen);
        const list = handlesByCreatorId.get(row.creator_id) ?? [];
        list.push(row.tiktok_username);
        handlesByCreatorId.set(row.creator_id, list);
      }
    }
  }
  const handlesByRow = new Map<string, string[]>();
  for (const r of allRows) {
    const fromAccounts = r.creator_id ? handlesByCreatorId.get(r.creator_id) : undefined;
    handlesByRow.set(r.id, fromAccounts && fromAccounts.length > 0 ? fromAccounts : legacyColumnHandles(r));
  }

  // ── 2. Bulk-fetch perf + per-brand-GMV + message signals in parallel.
  const allHandles = Array.from(new Set(
    Array.from(handlesByRow.values()).flat().map((h) => h.toLowerCase()),
  ));
  const perfByHandle = new Map<string, { gmv_period: number; posts_period: number; last_post_date: string | null }>();
  // brand_id (uuid string) → gmv for that handle on that brand, for the period
  const brandGmvByHandle = new Map<string, Map<string, number>>();
  const msgByHandle = new Map<string, { last_message_at: string | null; unread_count: number }>();

  // Resolve the brand filter to data-level UUIDs. null = no filter (all);
  // [NO_MATCH_BRAND_ID] = real brand with no data → zero (never all).
  const resolved = resolveUuids(reg, brand);
  const brandIds = resolved && resolved.length === 0 ? [NO_MATCH_BRAND_ID] : resolved;

  if (allHandles.length > 0) {
    const [perfRes, brandGmvRes, msgRes] = await Promise.all([
      supabase.rpc('get_creator_handle_perf', {
        handles: allHandles,
        brand_ids: brandIds,
        days_back: periodDays,
      }),
      supabase.rpc('get_creator_handle_brand_gmv', {
        handles: allHandles,
        brand_ids: brandIds,
        days_back: periodDays,
      }),
      supabase.rpc('get_creator_message_signals', { handles: allHandles }),
    ]);

    if (perfRes.error) {
      console.error('[/api/roster] perf RPC failed:', perfRes.error.message);
    } else {
      for (const r of (perfRes.data as PerfRow[] | null) ?? []) {
        perfByHandle.set(r.tiktok_username.toLowerCase(), {
          gmv_period: Number(r.gmv_period) || 0,
          posts_period: Number(r.posts_period) || 0,
          last_post_date: r.last_post_date,
        });
      }
    }

    if (brandGmvRes.error) {
      console.error('[/api/roster] brand-gmv RPC failed:', brandGmvRes.error.message);
    } else {
      for (const r of (brandGmvRes.data as BrandGmvRow[] | null) ?? []) {
        if (!r.brand_id) continue;
        const handle = r.tiktok_username.toLowerCase();
        const slot = brandGmvByHandle.get(handle) ?? new Map<string, number>();
        slot.set(r.brand_id, Number(r.gmv_period) || 0);
        brandGmvByHandle.set(handle, slot);
      }
    }

    if (msgRes.error) {
      console.error('[/api/roster] message-signals RPC failed:', msgRes.error.message);
    } else {
      for (const r of (msgRes.data as MessageRow[] | null) ?? []) {
        msgByHandle.set(r.tiktok_username.toLowerCase(), {
          last_message_at: r.last_message_at,
          unread_count: Number(r.unread_count) || 0,
        });
      }
    }
  }

  // ── 3. Enrich each row: sum across its handles, compute health + ROI,
  // build per-store GMV breakdown (keyed by data-level brand slug).
  const enriched: EnrichedRow[] = allRows.map((row) => {
    const handles = handlesByRow.get(row.id) ?? [];
    const hs = handles.map((h) => h.toLowerCase());
    let gmv = 0;
    let posts = 0;
    let lastPost: string | null = null;
    let lastMsg: string | null = null;
    let unread = 0;
    // Per-(data brand slug) GMV split for the row. Sums per brand across
    // all of the row's handles. Renders in the side panel "Revenue by store"
    // section and drives the row's store-mix indicator.
    const gmvByStore: Record<string, number> = {};
    for (const h of hs) {
      const p = perfByHandle.get(h);
      if (p) {
        gmv += p.gmv_period;
        posts += p.posts_period;
        if (p.last_post_date && (!lastPost || p.last_post_date > lastPost)) {
          lastPost = p.last_post_date;
        }
      }
      const m = msgByHandle.get(h);
      if (m) {
        unread += m.unread_count;
        if (m.last_message_at && (!lastMsg || m.last_message_at > lastMsg)) {
          lastMsg = m.last_message_at;
        }
      }
      const bg = brandGmvByHandle.get(h);
      if (bg) {
        for (const [brandUuid, brandGmv] of bg) {
          const slug = uuidToSlug(reg, brandUuid) ?? brandUuid;
          gmvByStore[slug] = (gmvByStore[slug] ?? 0) + brandGmv;
        }
      }
    }
    const retainer = Number(row.retainer) || 0;
    const target = Number(row.monthly_post_requirement) || 0;
    const health = deriveHealth({
      status: row.status,
      retainer,
      postsThisMonth: posts,
      monthlyTarget: target,
      lastPostDate: lastPost,
    });
    const roi = retainer > 0 ? gmv / retainer : null;
    return {
      ...row,
      handles,
      gmv_period: gmv,
      gmv_by_store: gmvByStore,
      posts_period: posts,
      posts_7d: 0,
      last_post_date: lastPost,
      health,
      roi_period: roi,
      last_message_at: lastMsg,
      unread_count: unread,
      is_managed: true,
      joined: row.joined_at ?? row.created_at,
    };
  });

  // ── 3b. When ?include=all, append unmanaged creators with recent GMV.
  // The RPC takes the set of currently-managed handles to exclude and
  // returns the top N by 30d GMV. We shape each result into an EnrichedRow
  // with empty contract fields + is_managed: false.
  // Brand expansion to data-level UUIDs is handled by `brandIds`
  // (resolveUuids) shared with the managed perf RPC. For scoped
  // (manager) users the unmanaged RPC is only brand_ids-filtered, so with no
  // specific brand selected it would surface all-brand top performers — only
  // run it for an explicit in-scope brand.
  const unmanagedAllowed = includeUnmanaged && !(scoped && (!brand || brand === 'all'));
  if (unmanagedAllowed) {
    const { data: unmanagedRows, error: unmanagedErr } = await supabase.rpc(
      'get_unmanaged_top_perf',
      {
        managed_handles: allHandles,
        brand_ids: brandIds,
        limit_count: 500,
        days_back: periodDays,
      },
    );
    if (unmanagedErr) {
      console.error('[/api/roster] unmanaged RPC failed:', unmanagedErr.message);
    } else {
      for (const u of (unmanagedRows as UnmanagedPerfRow[] | null) ?? []) {
        // Optional client-side search: same shape as managed rows so we don't
        // surprise the caller. We don't push search down to the RPC because
        // it'd complicate the SQL — the population is small (≤500) so a
        // post-filter here is fine.
        if (search) {
          const q = search.toLowerCase();
          const hayName = (u.real_name ?? '').toLowerCase();
          const hayHandle = (u.tiktok_username ?? '').toLowerCase();
          if (!hayName.includes(q) && !hayHandle.includes(q)) continue;
        }
        const slug = uuidToSlug(reg, u.brand_id ?? '') ?? null;
        // Build per-store breakdown from the same brand-gmv map used by managed
        // rows. Unmanaged rows' single handle was included in the bulk RPC fetch
        // earlier — wait, actually no: unmanaged handles weren't in `allHandles`
        // (which was built from managed_creators only). So we'd have no
        // breakdown for them. We fall back to a single-store breakdown using
        // their representative brand_id from the universe RPC.
        const unmanagedBreakdown: Record<string, number> = {};
        if (slug) unmanagedBreakdown[slug] = Number(u.gmv_period) || 0;
        enriched.push({
          id: `unmanaged:${u.tiktok_username}`,
          real_name: u.real_name,
          brand: slug,
          status: null,
          retainer: 0,
          monthly_post_requirement: 0,
          discord_name: null,
          discord_avatar: null,
          notes: null,
          created_at: null,
          joined_at: null,
          creator_id: null,
          account_1: u.tiktok_username,
          account_2: null,
          account_3: null,
          account_4: null,
          account_5: null,
          handles: [u.tiktok_username],
          gmv_period: Number(u.gmv_period) || 0,
          gmv_by_store: unmanagedBreakdown,
          posts_period: Number(u.posts_period) || 0,
          posts_7d: 0,
          last_post_date: u.last_post_date,
          health: 'no_data',
          roi_period: null,
          last_message_at: null,
          unread_count: 0,
          is_managed: false,
          joined: null,
        });
      }
    }
  }

  // ── 4. Aggregate counts BEFORE filters (so cards stay useful as triggers).
  // Managed-only — the cards are about MY roster, not the universe.
  const managedRows  = enriched.filter((r) => r.is_managed);
  const total_managed = managedRows.length;
  const behind_count  = managedRows.filter((r) => r.health === 'behind').length;
  const silent_count  = managedRows.filter((r) => r.health === 'silent').length;
  const healthy_count = managedRows.filter((r) => r.health === 'healthy').length;
  const low_roi_count = managedRows.filter(
    (r) => r.roi_period !== null && r.roi_period < 1 && r.health !== 'churned',
  ).length;
  const unread_dms_total = managedRows.reduce((s, r) => s + (r.unread_count || 0), 0);
  // Total monthly retainer commitment across the brand-scoped managed roster.
  // NOT period-driven — retainer is a fixed monthly contract figure, so this
  // is the same whether the period selector is on Yesterday or YTD.
  const total_retainer = managedRows.reduce((s, r) => s + (Number(r.retainer) || 0), 0);
  // Total GMV in the selected period for the banner. Brand + store-sub-filter
  // are *scope* changes, so they affect this. The health filter is *triage*
  // (not scope) so it doesn't.
  const total_gmv_period = storeFilter
    ? managedRows.reduce((s, r) => s + (r.gmv_by_store?.[storeFilter] ?? 0), 0)
    : managedRows.reduce((s, r) => s + (r.gmv_period || 0), 0);

  // ── 5. Apply health filter.
  let filtered = enriched;
  if (healthFilter !== 'all') {
    if (healthFilter === 'low_roi') {
      filtered = filtered.filter((r) => r.roi_period !== null && r.roi_period < 1 && r.health !== 'churned');
    } else {
      filtered = filtered.filter((r) => r.health === healthFilter);
    }
  }

  // ── 5b. Apply store sub-filter (e.g. LeeFar → Nutrition-only). Keeps a row
  // if the period GMV for that store is the dominant share (>= 50% of the
  // row's umbrella-scoped GMV, OR the only store with GMV at all). Skips
  // unmanaged rows since they only have a representative-brand breakdown.
  if (storeFilter) {
    filtered = filtered.filter((r) => {
      if (!r.is_managed) return false;
      const storeGmv = r.gmv_by_store[storeFilter] ?? 0;
      const totalForRow = Object.values(r.gmv_by_store).reduce((a, b) => a + b, 0);
      if (totalForRow === 0) return false;
      return storeGmv > 0 && storeGmv >= totalForRow * 0.5;
    });
  }

  // ── 5c. Managed-view filter for the My Creators All/Managed/Unmanaged
  // toggle. 'managed' is already the default (no include flag). 'unmanaged'
  // narrows the include=all set to just the candidates.
  if (searchParams.get('managed') === 'unmanaged') {
    filtered = filtered.filter((r) => !r.is_managed);
  }

  // ── 6. Sort. DB-column sorts use the original field; computed sorts use
  // the derived field. Nulls go last in both directions for usability.
  const sortField: SortCol = sortParam;
  const cmp = (a: EnrichedRow, b: EnrichedRow): number => {
    const get = (r: EnrichedRow): unknown => {
      if (isComputedSort) return (r as unknown as Record<string, unknown>)[sortField];
      return (r as unknown as Record<string, unknown>)[dbSortCol];
    };
    const av = get(a);
    const bv = get(b);
    const aNull = av === null || av === undefined || av === '';
    const bNull = bv === null || bv === undefined || bv === '';
    if (aNull && bNull) return 0;
    if (aNull) return 1; // nulls last
    if (bNull) return -1;
    if (typeof av === 'number' && typeof bv === 'number') {
      return ascending ? av - bv : bv - av;
    }
    const as = String(av).toLowerCase();
    const bs = String(bv).toLowerCase();
    if (as === bs) return 0;
    return ascending ? (as < bs ? -1 : 1) : (as > bs ? -1 : 1);
  };
  filtered.sort(cmp);

  // ── 7. Paginate the filtered set.
  const total = filtered.length;
  const offset = (page - 1) * limit;
  const slice = filtered.slice(offset, offset + limit);

  return NextResponse.json({
    data: slice,
    total,
    total_managed,
    page,
    limit,
    // Period echo so the UI can label "GMV (7d)" etc. without re-deriving
    period_days: periodDays,
    // Action-oriented aggregates (managed-only — the cards filter the table)
    behind_count,
    silent_count,
    healthy_count,
    low_roi_count,
    unread_dms_total,
    // Total GMV across the (unfiltered) managed roster for the period.
    // Drives the "Total GMV" banner at the top of My Creators.
    total_gmv_period,
    // Total monthly retainer commitment (period-independent).
    total_retainer,
  });
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
  const { brand, real_name, retainer, discord_name, notes, monthly_post_requirement } = body;

  const rawHandles: string[] = Array.isArray(body.handles)
    ? body.handles
    : (body.account_1 ? [body.account_1] : []);
  const handles: string[] = Array.from(new Set(
    rawHandles
      .map((h: unknown) => (typeof h === 'string' ? h.trim().replace(/^@/, '') : ''))
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

  const { data, error } = await supabase
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
      ...accountColumns,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Resolve or create the creators_v2 identity, then link + provision.
  let creatorId: string | null = null;
  if (handles.length > 0) {
    const { data: existing } = await supabase
      .from('tiktok_accounts')
      .select('creator_id')
      .in('tiktok_username', handles)
      .eq('tenant_id', tenantId)
      .limit(1)
      .maybeSingle();
    creatorId = existing?.creator_id ?? null;
  }

  if (!creatorId) {
    const { data: cv } = await supabase
      .from('creators_v2')
      .insert({
        tenant_id: tenantId,
        real_name: real_name || handles[0] || 'Unnamed Creator',
        notes: notes || null,
        discord_username: discord_name || null,
      })
      .select('id')
      .single();
    creatorId = cv?.id ?? null;
  }

  if (creatorId) {
    // Link managed_creators → creators_v2.
    await supabase
      .from('managed_creators')
      .update({ creator_id: creatorId })
      .eq('id', data.id);

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

  return NextResponse.json({ data: { ...data, creator_id: creatorId } }, { status: 201 });
}
