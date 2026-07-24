/**
 * Roster query core — the /api/roster GET logic, extracted verbatim so it can
 * be called server-side without an HTTP round-trip (the Comms hub resolves a
 * broadcast audience by replaying SegmentFilterCriteria through this exact
 * logic; the roster route is now a thin wrapper around it).
 *
 * Contract: `runRosterQuery(scope, searchParams)` behaves byte-identically to
 * the pre-extraction route handler — same query params, same response body,
 * same error statuses. The only change is shape: it returns `{ status, body }`
 * instead of a NextResponse (this module must stay importable outside a
 * request/response context, so no next/server here).
 */
import { createAdminClient } from '@/lib/supabase/server';
import { getBrandRegistry, uuidToSlug, resolveUuids, expandSlugs } from '@/lib/data/brand-registry';
import { getAnalyticsBrandTotals } from '@/lib/data/rpc';
import type { WorkspaceScope } from '@/lib/auth/workspace-scope';
import { resolveDateRange } from '@/lib/data/date-utils';
import { computeManagedGmv, buildManagedLookup, sumManagedGmvForBrands, type ManagedGmvResult } from '@/lib/data/managed-gmv';

/**
 * Sentinel returned when a real brand is selected but we couldn't resolve any
 * data-level UUID for it. Filtering on this (a UUID that exists in no row)
 * makes the RPCs return ZERO — the honest answer for a brand with no uploaded
 * data. This is deliberately NOT `null`: returning null means "no filter →
 * aggregate every brand", which would mislabel other brands' GMV as this one
 * (the COSRX bug). Unknown brand must show nothing, never everything.
 */
export const NO_MATCH_BRAND_ID = '00000000-0000-0000-0000-000000000000';


// account_1..5 stay on the wire for back-compat, but the canonical handle
// list now comes from tiktok_accounts via creator_id. Once all consumers use
// `handles`, the account_N columns can be dropped from the SELECT + schema.
const COLUMNS = [
  'id', 'real_name', 'brand', 'status', 'retainer', 'monthly_post_requirement',
  'discord_name', 'discord_avatar', 'notes', 'created_at', 'joined_at', 'creator_id',
  'account_1', 'account_2', 'account_3', 'account_4', 'account_5',
  'product_assignments',
].join(', ');

// ─── Health derivation ───────────────────────────────────────────────────────
//
// Health is computed per-row from the perf signals (GMV 30d, posts this month,
// last post date) plus the contractual post quota.
//
// It only applies to CONTRACTED creators (retainer > 0). Affiliate-only creators
// ($0 retainer) are in our brand servers and we track their GMV, but they have
// NO post commitment — so "behind pace" is a category error for them (they never
// agreed to post). They get their own neutral 'affiliate' classification. NOTE:
// ~63% of managed_creators are affiliate-only, and nearly all carry a leftover
// monthly_post_requirement=30 default, so judging them on pace flagged ~172
// phantom "behind" — over half the count. Gate health on the retainer, not the
// (meaningless-for-affiliates) post requirement.
//
//   churned   — contract status is Churned/Inactive (terminal)
//   affiliate — $0 retainer: tracked, no commitment (no health judgment)
//   silent    — contracted, last post > 14 days ago (or never)
//   behind    — contracted, posts_this_month / target < expected pace this month
//   healthy   — contracted, meeting quota AND not silent
//   no_data   — unmanaged, or contracted with no signal yet

export type CreatorHealth =
  | 'healthy'
  | 'behind'
  | 'silent'
  | 'churned'
  | 'affiliate'
  | 'no_data';

const SILENT_DAYS_THRESHOLD = 14;

// Creator level tiers (L1–L7) from trailing-30-day GMV — the Cruva-style
// "how big is this creator" badge. Thresholds are the shop-GMV bands.
function levelFromGmv(gmv: number): number {
  if (gmv >= 1_500_000) return 7;
  if (gmv >= 400_000) return 6;
  if (gmv >= 150_000) return 5;
  if (gmv >= 60_000) return 4;
  if (gmv >= 25_000) return 3;
  if (gmv >= 5_000) return 2;
  return 1;
}

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

  // Affiliate-only ($0 retainer): tracked, no post commitment. Health (pace /
  // silence-as-a-problem) doesn't apply — they never agreed to post. Classify
  // as 'affiliate' and stop, so they don't pollute the behind/silent counts.
  if (retainer <= 0) return 'affiliate';

  // From here on the creator is CONTRACTED (retainer > 0).
  // No signal at all — contracted but never posted.
  const dsince = daysSince(lastPostDate);
  if (dsince === null) {
    return 'silent';
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
  // Product tag keys (reference products.product_key) — which of the brand's
  // products this creator focuses on. Optional; empty = no specific product.
  product_assignments: string[] | null;
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

export interface EnrichedRow extends ManagedRow {
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
  // Resolved product tags (key + display name) for the row chips.
  product_tags: { key: string; name: string }[];
  // Per-day GMV series over the selected window — powers the roster sparkline.
  // Attached only to the visible page (not on CSV/Excel export).
  spark?: number[];
  // Per-day distinct-posts series over the same window (Posts sparkline).
  spark_posts?: number[];
  // Prior-period % change (period-over-period), null when the prior period was 0.
  gmv_delta?: number | null;
  posts_delta?: number | null;
  // Creator level L1–L7 from trailing-30-day GMV (managed rows only).
  level?: number | null;
  // Per-(brand-slug) posts split for the period — parallel to gmv_by_store.
  // Lets the All-Brands view rescope a row's posts to its own brand.
  posts_by_store?: Record<string, number>;
  // Posts MONTH-TO-DATE (1st-of-month → today), INDEPENDENT of the period
  // selector. This — not posts_period — is the correct basis for the "behind
  // pace" health signal, which compares progress against a MONTHLY quota at this
  // point in the month. posts_period drives the display column; these drive
  // health only. Kept per-store so the All-Brands view can rescope health to a
  // row's own brand, mirroring posts_by_store.
  posts_this_month: number;
  posts_this_month_by_store: Record<string, number>;
  // All-Brands collapse: when true this row is a per-creator PARENT and `brands`
  // holds its per-brand children (one managed contract each).
  grouped?: boolean;
  brands?: BrandChild[];
}

// One per-brand child under a collapsed creator parent (All-Brands view).
export interface BrandChild {
  brand: string | null;
  /** managed_creators.id for this contract — opens the per-brand detail drawer. */
  row_id: string;
  gmv_period: number;
  posts_period: number;
  /** Null when the caller's scope can't view finance (rendered as "—"). */
  retainer: number | null;
  roi_period: number | null;
  last_post_date: string | null;
  health: CreatorHealth;
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

const HEALTH_FILTERS = ['all', 'healthy', 'behind', 'silent', 'churned', 'affiliate', 'no_data', 'low_roi'] as const;
type HealthFilter = typeof HEALTH_FILTERS[number];

export interface RosterQueryBody {
  data: EnrichedRow[];
  spark_days: string[];
  summary?: { affiliate_gmv: number; affiliate_gmv_prev: number; managed_gmv_prev: number; managed_gmv_30d: number };
  total: number;
  total_managed: number;
  page: number;
  limit: number;
  period_days: number | null;
  period_start: string | null;
  period_end: string | null;
  behind_count: number;
  silent_count: number;
  healthy_count: number;
  affiliate_count: number;
  low_roi_count: number;
  unread_dms_total: number;
  total_gmv_period: number | undefined;
  /** Null when the caller's scope can't view finance — the client renders "—"
   *  (absence), never a fabricated $0. */
  total_retainer: number | null;
}

export type RosterQueryResult =
  | { status: 200; body: RosterQueryBody }
  | { status: 403 | 500; body: { error: string } };

// Equivalent of GET /api/roster?brand=&status=&search=&page=1&limit=50&sort=&dir=&health=
export async function runRosterQuery(
  scope: WorkspaceScope,
  searchParams: URLSearchParams,
): Promise<RosterQueryResult> {
  const tenantId = scope.tenantId;

  // Manager = brand-scoped. owner/admin/viewer = full tenant (brandScope 'all').
  const scoped = scope.brandScope.kind === 'scoped';
  const allowedSlugs = scope.brandScope.kind === 'scoped' ? scope.brandScope.brandSlugs : null;

  const brand  = searchParams.get('brand');

  // A scoped user requesting a brand outside their access gets nothing.
  if (scoped && brand && brand !== 'all' && !allowedSlugs!.includes(brand)) {
    return { status: 403, body: { error: 'Forbidden: brand not in your access' } };
  }
  const status = searchParams.get('status');
  const search = searchParams.get('search');
  // ?product=<product_key> — filter managed creators tagged with that product.
  const product = searchParams.get('product');
  // ?all=1 — return every matching row (for CSV/Excel export), not just a page.
  const exportAll = searchParams.get('all') === '1';
  // ?summary=0 — skip the KPI-summary block (step 7c). For callers that only want
  // the roster rows / health counts and would otherwise pay ~84 RPCs of
  // managed-GMV for nothing. Defaults ON so existing callers are unchanged.
  const wantSummary = searchParams.get('summary') !== '0';
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

  // Period window for GMV / ROI / posts. Preferred: ?range=<preset> (+ ?start=&end=
  // for custom), resolved via the shared resolveDateRange into an explicit
  // [start, end] window passed to the RPCs as p_start_date / p_end_date. Falls
  // back to the legacy ?period=N (days_back) when no range is given.
  // posts_this_month + health + last_post stay independent of this.
  const rangeParam = searchParams.get('range');
  let pStartDate: string | null = null;
  let pEndDate: string | null = null;
  let periodDays = 30;
  if (rangeParam) {
    const { startDate, endDate } = resolveDateRange(rangeParam, searchParams.get('start'), searchParams.get('end'));
    pStartDate = startDate;
    pEndDate = endDate;
  } else {
    const periodParam = parseInt(searchParams.get('period') || '30', 10);
    periodDays = Number.isFinite(periodParam) ? Math.max(1, Math.min(366, periodParam)) : 30;
  }

  // Month-to-date window [1st-of-month, today] for the health signal. Health is
  // a MONTHLY-quota concept ("are they on pace for their monthly posts, this far
  // into the month?") and MUST NOT move with the period selector — the promise a
  // few lines up that the old code broke by feeding deriveHealth the period post
  // count, so "Last 7 days" made quota-hitting creators read "behind". Uses local
  // date to agree with paceExpectedPct() (also local `new Date()`); both must
  // reference the same month boundaries or pace and progress disagree.
  const _now = new Date();
  const _mm = String(_now.getMonth() + 1).padStart(2, '0');
  const mtdStart = `${_now.getFullYear()}-${_mm}-01`;
  const mtdEnd = `${_now.getFullYear()}-${_mm}-${String(_now.getDate()).padStart(2, '0')}`;

  // ?store=<slug> — optional sub-filter when an umbrella brand is active.
  // Filters managed rows down to those whose period-GMV came primarily from
  // that store. Applied client-side after enrichment; null = no sub-filter.
  const storeFilter = searchParams.get('store');

  // Numeric threshold post-filters (used by saved Segments). Applied after
  // enrichment alongside health/store, since GMV/posts are computed per row.
  const parseNum = (v: string | null): number | null => {
    if (v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const minGmv = parseNum(searchParams.get('min_gmv'));
  const maxGmv = parseNum(searchParams.get('max_gmv'));
  const minPosts = parseNum(searchParams.get('min_posts'));

  const supabase = await createAdminClient();
  const reg = await getBrandRegistry();

  // ── 1. Fetch ALL matching managed creators (no DB pagination yet — we need
  // the full set to compute health-aggregates and to support filtering by
  // health/computed columns).
  const buildBaseQuery = () => {
    let q = supabase
      .from('managed_creators')
      .select(COLUMNS)
      .eq('tenant_id', tenantId)
      .is('archived_at', null)
      .order('id', { ascending: true }); // stable order so range paging is consistent
    if (brand && brand !== 'all') q = q.eq('brand', brand);
    else if (scoped) q = q.in('brand', allowedSlugs!); // [] → no rows (fail-closed)
    if (product) q = q.contains('product_assignments', [product]);
    if (status && status !== 'all') q = q.eq('status', status);
    if (search) {
      q = q.or(`real_name.ilike.%${search}%,account_1.ilike.%${search}%,discord_name.ilike.%${search}%`);
    }
    return q;
  };

  // Fetch the FULL matching set, paging past PostgREST's 1000-row cap — the
  // all-brands roster (~1.3k rows) was otherwise silently truncated, skewing the
  // health counts, KPI aggregates, and paginated table.
  const allRows: ManagedRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await buildBaseQuery().range(from, from + 999) as { data: ManagedRow[] | null; error: { message: string } | null };
    if (error) return { status: 500, body: { error: error.message } };
    if (!data || data.length === 0) break;
    allRows.push(...data);
    if (data.length < 1000) break;
  }

  // Resolve product tag keys → display names for the row chips. One small query
  // for the whole page (the products catalog is tiny).
  const productNameByKey = new Map<string, string>();
  {
    const { data: prodRows } = await supabase
      .from('products')
      .select('product_key, display_name')
      .eq('tenant_id', tenantId);
    for (const p of (prodRows ?? []) as { product_key: string; display_name: string | null }[]) {
      productNameByKey.set(p.product_key, p.display_name || p.product_key);
    }
  }

  // ── 1b. Resolve handles per row via tiktok_accounts. Canonical handle source;
  // account_1..5 are only a fallback for rows that lack a creator_id link.
  const creatorIds = Array.from(new Set(
    allRows.map((r) => r.creator_id).filter((v): v is string => !!v),
  ));
  const handlesByCreatorId = new Map<string, string[]>();
  if (creatorIds.length > 0) {
    // CHUNK the id list (a long `.in()` overflows the request URL → silent
    // PARTIAL result) AND PAGE each batch (1000-row cap). Each creator's rows
    // stay within a single batch, so the primary/oldest-first dedup is intact.
    const taRows: { creator_id: string; tiktok_username: string }[] = [];
    const TA_CHUNK = 200;
    for (let ci = 0; ci < creatorIds.length; ci += TA_CHUNK) {
      const batch = creatorIds.slice(ci, ci + TA_CHUNK);
      for (let from = 0; ; from += 1000) {
        const { data, error: taErr } = await supabase
          .from('tiktok_accounts')
          .select('creator_id, tiktok_username, is_primary')
          .in('creator_id', batch)
          .order('is_primary', { ascending: false })
          .order('id', { ascending: true })
          .range(from, from + 999);
        if (taErr) { console.error('[/api/roster] tiktok_accounts join failed:', taErr.message); break; }
        if (!data || data.length === 0) break;
        taRows.push(...(data as { creator_id: string; tiktok_username: string }[]));
        if (data.length < 1000) break;
      }
    }
    // A handle can legitimately own several rows — one per brand the creator
    // sells for (e.g. the same handle registered under catakor + jiyu). For the
    // roster's handle list we want each DISTINCT handle once; the first
    // occurrence (primary/oldest) is the one we keep.
    const seenByCreator = new Map<string, Set<string>>();
    for (const row of taRows) {
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
  // brand_id (uuid string) → { gmv, posts } for that handle on that brand, period.
  const brandGmvByHandle = new Map<string, Map<string, { gmv: number; posts: number }>>();
  // brand_id (uuid string) → posts MONTH-TO-DATE for that handle on that brand.
  // Feeds the health signal only; independent of the period selector.
  const mtdPostsByHandle = new Map<string, Map<string, number>>();
  const msgByHandle = new Map<string, { last_message_at: string | null; unread_count: number }>();

  // Resolve the brand filter to data-level UUIDs. null = no filter (all);
  // [NO_MATCH_BRAND_ID] = real brand with no data → zero (never all).
  const resolved = resolveUuids(reg, brand);
  const brandIds = resolved && resolved.length === 0 ? [NO_MATCH_BRAND_ID] : resolved;

  if (allHandles.length > 0) {
    const [perfRes, brandGmvRes, mtdRes, msgRes] = await Promise.all([
      supabase.rpc('get_creator_handle_perf', {
        handles: allHandles,
        brand_ids: brandIds,
        days_back: periodDays,
        p_start_date: pStartDate,
        p_end_date: pEndDate,
      }),
      supabase.rpc('get_creator_handle_brand_gmv', {
        handles: allHandles,
        brand_ids: brandIds,
        days_back: periodDays,
        p_start_date: pStartDate,
        p_end_date: pEndDate,
      }),
      // Month-to-date posts per (handle, brand) for the health signal — same RPC,
      // pinned to the [1st-of-month, today] window so health never moves with the
      // period selector. We read only its posts_period (= MTD post count).
      supabase.rpc('get_creator_handle_brand_gmv', {
        handles: allHandles,
        brand_ids: brandIds,
        days_back: 31,
        p_start_date: mtdStart,
        p_end_date: mtdEnd,
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
        const slot = brandGmvByHandle.get(handle) ?? new Map<string, { gmv: number; posts: number }>();
        slot.set(r.brand_id, { gmv: Number(r.gmv_period) || 0, posts: Number(r.posts_period) || 0 });
        brandGmvByHandle.set(handle, slot);
      }
    }

    if (mtdRes.error) {
      // Non-fatal: health simply falls back to the silence/terminal signals. Do
      // NOT let a month-to-date read failure blank the whole roster.
      console.error('[/api/roster] month-to-date posts RPC failed:', mtdRes.error.message);
    } else {
      for (const r of (mtdRes.data as BrandGmvRow[] | null) ?? []) {
        if (!r.brand_id) continue;
        const handle = r.tiktok_username.toLowerCase();
        const slot = mtdPostsByHandle.get(handle) ?? new Map<string, number>();
        slot.set(r.brand_id, Number(r.posts_period) || 0);
        mtdPostsByHandle.set(handle, slot);
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
    const postsByStore: Record<string, number> = {};
    // Month-to-date twins of the period post counts, for the health signal only.
    const postsThisMonthByStore: Record<string, number> = {};
    let postsThisMonth = 0;
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
        for (const [brandUuid, bv] of bg) {
          const slug = uuidToSlug(reg, brandUuid) ?? brandUuid;
          gmvByStore[slug] = (gmvByStore[slug] ?? 0) + bv.gmv;
          postsByStore[slug] = (postsByStore[slug] ?? 0) + bv.posts;
        }
      }
      const bgm = mtdPostsByHandle.get(h);
      if (bgm) {
        for (const [brandUuid, mtdPosts] of bgm) {
          const slug = uuidToSlug(reg, brandUuid) ?? brandUuid;
          postsThisMonthByStore[slug] = (postsThisMonthByStore[slug] ?? 0) + mtdPosts;
          postsThisMonth += mtdPosts;
        }
      }
    }
    const retainer = Number(row.retainer) || 0;
    const target = Number(row.monthly_post_requirement) || 0;
    // Health uses MONTH-TO-DATE posts (not `posts`, the period count) so the
    // "behind pace" flag reflects the monthly quota, not the selector window.
    const health = deriveHealth({
      status: row.status,
      retainer,
      postsThisMonth,
      monthlyTarget: target,
      lastPostDate: lastPost,
    });
    const roi = retainer > 0 ? gmv / retainer : null;
    return {
      ...row,
      handles,
      gmv_period: gmv,
      gmv_by_store: gmvByStore,
      posts_by_store: postsByStore,
      posts_period: posts,
      posts_this_month: postsThisMonth,
      posts_this_month_by_store: postsThisMonthByStore,
      posts_7d: 0,
      last_post_date: lastPost,
      health,
      roi_period: roi,
      last_message_at: lastMsg,
      unread_count: unread,
      is_managed: true,
      joined: row.joined_at ?? row.created_at,
      product_tags: (row.product_assignments ?? []).map((key) => ({
        key, name: productNameByKey.get(key) ?? key,
      })),
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
        p_start_date: pStartDate,
        p_end_date: pEndDate,
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
          product_assignments: null,
          handles: [u.tiktok_username],
          gmv_period: Number(u.gmv_period) || 0,
          gmv_by_store: unmanagedBreakdown,
          posts_period: Number(u.posts_period) || 0,
          posts_this_month: 0,
          posts_this_month_by_store: {},
          posts_7d: 0,
          last_post_date: u.last_post_date,
          health: 'no_data',
          roi_period: null,
          last_message_at: null,
          unread_count: 0,
          is_managed: false,
          joined: null,
          product_tags: [],
        });
      }
    }
  }

  // ── 4. Managed row set (for retainer). The HEALTH COUNTS are NOT computed
  // here — they're derived from the post-rescope/post-collapse `working` set
  // below (step 4c), so the triage-chip counts match the rows the table actually
  // shows. Computing them here (pre-rescope) undercounts "behind": it credits a
  // creator's cross-brand posts toward each brand's quota, hiding a creator who
  // is behind on the brand they're contracted for.
  const managedRows  = enriched.filter((r) => r.is_managed);
  // Total monthly retainer commitment across the brand-scoped managed roster.
  // NOT period-driven — retainer is a fixed monthly contract figure, so this
  // is the same whether the period selector is on Yesterday or YTD.
  // Deduped by (creator, brand) so duplicate roster rows for the same creator
  // (a re-add / merged identity) don't double-count the monthly retainer.
  const retainerByCreatorBrand = new Map<string, number>();
  let retainerUnlinked = 0;
  for (const r of managedRows) {
    const ret = Number(r.retainer) || 0;
    if (r.creator_id) {
      const k = `${r.creator_id}|${r.brand ?? ''}`;
      retainerByCreatorBrand.set(k, Math.max(retainerByCreatorBrand.get(k) ?? 0, ret));
    } else {
      retainerUnlinked += ret;
    }
  }
  const total_retainer = retainerUnlinked + Array.from(retainerByCreatorBrand.values()).reduce((s, v) => s + v, 0);
  // Managed GMV for the selected period is computed in the page-1 summary block
  // below via the canonical computeManagedGmv() — the SAME function the Earnings
  // page uses — so the "Managed GMV" card ties out to Earnings exactly. Left
  // undefined on paginated (page > 1) responses; the client persists the page-1
  // value across pagination.
  let total_gmv_period: number | undefined;

  // ── 4b. All-Brands collapse. On the owner's unscoped, managed, non-export
  // All-Brands view: (a) rescope each managed row's GMV/posts/ROI to its OWN
  // brand — enrichment summed a handle across every brand because the perf RPC
  // was unfiltered here, so a creator's brand rows all showed the same inflated
  // total; and (b) collapse a creator's brand rows into ONE expandable parent
  // carrying per-brand children. The count cards above already ran on the
  // pre-collapse rows, so their semantics are unchanged. Rows with no creator_id
  // stay as their own rows. Skipped for scoped managers, include=all, CSV export,
  // and any single-brand view (where per-row GMV is already brand-correct).
  let working: EnrichedRow[] = enriched;
  // All-Brands owner/managed view: rescope every row to its own brand (fixes the
  // cross-brand-total bug for BOTH the table and the CSV export), then — for the
  // interactive table only — collapse each creator's brands into one parent.
  const allBrandsView = resolved === null && !scoped && !includeUnmanaged;
  if (allBrandsView) {
    // (a) rescope each managed row to its own brand via the per-brand split.
    for (const r of enriched) {
      if (!r.is_managed) continue;
      const stores = r.brand ? expandSlugs(reg, r.brand) : [];
      let bg = 0;
      let bp = 0;
      let bpm = 0; // month-to-date posts rescoped to this row's own brand (health)
      for (const s of stores) {
        bg += r.gmv_by_store[s] ?? 0;
        bp += r.posts_by_store?.[s] ?? 0;
        bpm += r.posts_this_month_by_store[s] ?? 0;
      }
      const ret = Number(r.retainer) || 0;
      r.gmv_period = bg;
      r.posts_period = bp;
      r.posts_this_month = bpm;
      r.roi_period = ret > 0 ? bg / ret : null;
      r.health = deriveHealth({
        status: r.status,
        retainer: ret,
        postsThisMonth: bpm,
        monthlyTarget: Number(r.monthly_post_requirement) || 0,
        lastPostDate: r.last_post_date,
      });
    }
    // (b) collapse by creator_id — interactive table, UNFILTERED browse only.
    // When a triage chip is active we deliberately DON'T collapse: the manager
    // wants per-contract rows (creator × brand) so "behind" names the exact brand,
    // and so the row count matches the chip. CSV export also stays granular.
    if (!exportAll && healthFilter === 'all') {
    const byCreator = new Map<string, EnrichedRow[]>();
    const out: EnrichedRow[] = [];
    for (const r of enriched) {
      if (!r.creator_id || !r.is_managed) { out.push(r); continue; }
      const arr = byCreator.get(r.creator_id) ?? [];
      arr.push(r);
      byCreator.set(r.creator_id, arr);
    }
    for (const rows of byCreator.values()) {
      if (rows.length === 1) { out.push(rows[0]); continue; }
      const primary = rows[0];
      const children: BrandChild[] = [];
      const seen = new Set<string>();
      // Parent health aggregates across the creator's CONTRACTED per-brand
      // contracts only: total month-to-date posts vs the SUM of the per-brand
      // monthly quotas (the whole paid obligation). Affiliate brand-rows ($0
      // retainer) are excluded — their phantom post_requirement would otherwise
      // inflate the parent's target. If every brand-row is affiliate, totRet is 0
      // and deriveHealth classifies the parent as 'affiliate'.
      let totPostsThisMonth = 0;
      let totTarget = 0;
      for (const r of rows) {
        const b = r.brand ?? '';
        if (seen.has(b)) continue;
        seen.add(b);
        if ((Number(r.retainer) || 0) > 0) {
          totPostsThisMonth += r.posts_this_month || 0;
          totTarget += Number(r.monthly_post_requirement) || 0;
        }
        children.push({
          brand: r.brand,
          row_id: String(r.id),
          gmv_period: r.gmv_period,
          posts_period: r.posts_period,
          retainer: Number(r.retainer) || 0,
          roi_period: r.roi_period,
          last_post_date: r.last_post_date,
          health: r.health,
        });
      }
      children.sort((a, b) => b.gmv_period - a.gmv_period);
      const totGmv = children.reduce((s, c) => s + c.gmv_period, 0);
      const totPosts = children.reduce((s, c) => s + c.posts_period, 0);
      // Children are built with real numbers here; the ?? 0 only satisfies the
      // widened BrandChild type (retainer goes null at the output-scrub step).
      const totRet = children.reduce((s, c) => s + (c.retainer ?? 0), 0);
      let lastPost: string | null = null;
      for (const c of children) {
        if (c.last_post_date && (!lastPost || c.last_post_date > lastPost)) lastPost = c.last_post_date;
      }
      out.push({
        ...primary,
        gmv_period: totGmv,
        posts_period: totPosts,
        posts_this_month: totPostsThisMonth,
        retainer: totRet,
        roi_period: totRet > 0 ? totGmv / totRet : null,
        last_post_date: lastPost,
        health: deriveHealth({
          status: primary.status,
          retainer: totRet,
          postsThisMonth: totPostsThisMonth,
          monthlyTarget: totTarget,
          lastPostDate: lastPost,
        }),
        grouped: true,
        brands: children,
      });
    }
    working = out;
    }
  }

  // ── 4c. Health counts, PER-CONTRACT (creator × brand) — Tyler's call: a creator
  // can be Healthy on one brand and Behind on another, and "behind" should name
  // the specific contract. Computed on the RESCOPED enriched rows (each contract
  // judged on its OWN brand's posts vs its quota — not the pre-rescope cross-brand
  // undercount). The collapse below is SKIPPED whenever a triage chip is active,
  // so the filtered table is these same per-contract rows → chip count === filtered
  // total, exactly.
  const managedContracts = enriched.filter((r) => r.is_managed);
  // total_managed + the health counts are all PER-CONTRACT, so they share one
  // denominator (a "Behind 250 of 1,502" reads cleanly, and the dashboard's
  // composition bars don't mix contracts with creators). The unfiltered roster
  // still COLLAPSES multi-brand creators for a clean browse, so its pagination
  // total is smaller than this header figure — that's the roster's display choice,
  // not a health-count concern.
  const total_managed = managedContracts.length;
  // behind/silent/healthy are CONTRACTED-only by construction (affiliate-only rows
  // resolve to 'affiliate'); affiliate_count is the $0-retainer tracked creators.
  const behind_count    = managedContracts.filter((r) => r.health === 'behind').length;
  const silent_count    = managedContracts.filter((r) => r.health === 'silent').length;
  const healthy_count   = managedContracts.filter((r) => r.health === 'healthy').length;
  const affiliate_count = managedContracts.filter((r) => r.health === 'affiliate').length;
  // Low ROI is contracted-only too — affiliate rows have retainer 0 → roi null,
  // so already excluded, but be explicit. Matches the low_roi health-filter below.
  const low_roi_count = managedContracts.filter(
    (r) => r.roi_period !== null && r.roi_period < 1 && r.health !== 'churned' && r.health !== 'affiliate',
  ).length;
  const unread_dms_total = managedContracts.reduce((s, r) => s + (r.unread_count || 0), 0);

  // ── 5. Apply health filter.
  let filtered = working;
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

  // ── 5d. Numeric threshold filters (saved Segments). Post-enrichment, on the
  // computed period GMV / posts. No-ops unless the param is present.
  if (minGmv !== null) filtered = filtered.filter((r) => (r.gmv_period || 0) >= minGmv);
  if (maxGmv !== null) filtered = filtered.filter((r) => (r.gmv_period || 0) <= maxGmv);
  if (minPosts !== null) filtered = filtered.filter((r) => (r.posts_period || 0) >= minPosts);

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
  const slice = exportAll ? filtered.slice(0, 5000) : filtered.slice(offset, offset + limit);

  // ── 7b. Enrich the visible page (skipped for CSV/Excel export): per-row GMV +
  // posts sparklines, prior-period deltas, and the creator level (30d GMV tier).
  // All slice-scoped, so these extra RPCs stay tiny.
  let dataOut: EnrichedRow[] = slice;
  let sparkDays: string[] = [];
  if (!exportAll && slice.length > 0) {
    const sliceHandles = Array.from(new Set(
      slice.flatMap((r) => (r.handles ?? []).map((h) => h.toLowerCase())),
    ));
    if (sliceHandles.length > 0) {
      // Window day-list (bounded) for the sparklines.
      const endStr = pEndDate ?? new Date().toISOString().slice(0, 10);
      const startStr = pStartDate ?? (() => {
        const d = new Date(endStr + 'T00:00:00Z');
        d.setUTCDate(d.getUTCDate() - periodDays);
        return d.toISOString().slice(0, 10);
      })();
      const startD = new Date(startStr + 'T00:00:00Z');
      const endD = new Date(endStr + 'T00:00:00Z');
      let days: string[] = [];
      for (let d = new Date(startD); d <= endD; d.setUTCDate(d.getUTCDate() + 1)) {
        days.push(d.toISOString().slice(0, 10));
      }
      if (days.length > 45) days = days.slice(days.length - 45);

      // Prior period of equal length, immediately before the current window.
      const windowDays = Math.round((endD.getTime() - startD.getTime()) / 86400000) + 1;
      const prevEnd = new Date(startD); prevEnd.setUTCDate(prevEnd.getUTCDate() - 1);
      const prevStart = new Date(prevEnd); prevStart.setUTCDate(prevStart.getUTCDate() - (windowDays - 1));
      const prevStartStr = prevStart.toISOString().slice(0, 10);
      const prevEndStr = prevEnd.toISOString().slice(0, 10);

      const [gmvSeriesRes, postsSeriesRes, priorPerfRes, perf30Res] = await Promise.all([
        supabase.rpc('get_creator_handle_gmv_series', { handles: sliceHandles, brand_ids: brandIds, days_back: periodDays, p_start_date: pStartDate, p_end_date: pEndDate }),
        supabase.rpc('get_creator_handle_posts_series', { handles: sliceHandles, brand_ids: brandIds, days_back: periodDays, p_start_date: pStartDate, p_end_date: pEndDate }),
        supabase.rpc('get_creator_handle_perf', { handles: sliceHandles, brand_ids: brandIds, days_back: periodDays, p_start_date: prevStartStr, p_end_date: prevEndStr }),
        supabase.rpc('get_creator_handle_perf', { handles: sliceHandles, brand_ids: brandIds, days_back: 30, p_start_date: null, p_end_date: null }),
      ]);
      if (gmvSeriesRes.error) console.error('[/api/roster] gmv-series RPC failed:', gmvSeriesRes.error.message);
      if (postsSeriesRes.error) console.error('[/api/roster] posts-series RPC failed:', postsSeriesRes.error.message);
      if (priorPerfRes.error) console.error('[/api/roster] prior-perf RPC failed:', priorPerfRes.error.message);
      if (perf30Res.error) console.error('[/api/roster] 30d-perf RPC failed:', perf30Res.error.message);

      const gmvByDay = new Map<string, Map<string, number>>();
      for (const s of (gmvSeriesRes.data as { tiktok_username: string; stat_date: string; gmv: string | number }[] | null) ?? []) {
        const h = s.tiktok_username.toLowerCase();
        const day = String(s.stat_date).slice(0, 10);
        const m = gmvByDay.get(h) ?? new Map<string, number>();
        m.set(day, (m.get(day) ?? 0) + (Number(s.gmv) || 0));
        gmvByDay.set(h, m);
      }
      const postsByDay = new Map<string, Map<string, number>>();
      for (const s of (postsSeriesRes.data as { tiktok_username: string; stat_date: string; posts: number }[] | null) ?? []) {
        const h = s.tiktok_username.toLowerCase();
        const day = String(s.stat_date).slice(0, 10);
        const m = postsByDay.get(h) ?? new Map<string, number>();
        m.set(day, (m.get(day) ?? 0) + (Number(s.posts) || 0));
        postsByDay.set(h, m);
      }
      const priorByHandle = new Map<string, { gmv: number; posts: number }>();
      for (const p of (priorPerfRes.data as PerfRow[] | null) ?? []) {
        priorByHandle.set(p.tiktok_username.toLowerCase(), { gmv: Number(p.gmv_period) || 0, posts: Number(p.posts_period) || 0 });
      }
      const gmv30ByHandle = new Map<string, number>();
      for (const p of (perf30Res.data as PerfRow[] | null) ?? []) {
        gmv30ByHandle.set(p.tiktok_username.toLowerCase(), Number(p.gmv_period) || 0);
      }

      sparkDays = days; // shared day labels for the hover tooltip
      const pct = (cur: number, prev: number): number | null => (prev > 0 ? ((cur - prev) / prev) * 100 : null);

      // Sparklines run the full selected window (through the period end), trailing
      // zeros included — so the last ACTIVE point lands on the creator's real last
      // post, consistent with the "Last post" column. (The freshest ~2 days lag
      // for posts as TikTok backfills them; the Last Post column reflects the same
      // lag, so the two stay in agreement.)
      dataOut = slice.map((r) => {
        const hs = (r.handles ?? []).map((h) => h.toLowerCase());
        const priorGmv = hs.reduce((s, h) => s + (priorByHandle.get(h)?.gmv ?? 0), 0);
        const priorPosts = hs.reduce((s, h) => s + (priorByHandle.get(h)?.posts ?? 0), 0);
        const gmv30 = hs.reduce((s, h) => s + (gmv30ByHandle.get(h) ?? 0), 0);
        return {
          ...r,
          spark: days.map((day) => hs.reduce((s, h) => s + (gmvByDay.get(h)?.get(day) ?? 0), 0)),
          spark_posts: days.map((day) => hs.reduce((s, h) => s + (postsByDay.get(h)?.get(day) ?? 0), 0)),
          gmv_delta: pct(r.gmv_period, priorGmv),
          posts_delta: pct(r.posts_period, priorPosts),
          level: r.is_managed ? levelFromGmv(gmv30) : null,
        };
      });
    }
  }

  // ── 7b'. Finance scrub. A finance-blind scope (coach / walled-off manager —
  // "Finance: none") must never receive retainer dollars or the ROI derived from
  // them. Null the money fields on the OUTPUT rows only (shape stays stable;
  // null, not 0, so the UI renders "—" instead of a fabricated $0). Health,
  // sort, and the low_roi counts above already ran on the real values —
  // everything else is byte-identical.
  if (!scope.canViewFinance) {
    dataOut = dataOut.map((r) => ({
      ...r,
      retainer: null,
      roi_period: null,
      brands: r.brands?.map((c) => ({ ...c, retainer: null, roi_period: null })),
    }));
  }

  // ── 7c. KPI-card summary metrics. Computed once (page 1 only) since they're
  // period/brand-level, not page-level — keeps pagination fast. affiliate_gmv =
  // the brand's TOTAL affiliate GMV (all creators); managed_gmv_prev / _30d are
  // the roster's managed GMV over the prior period + a fixed trailing-30d window
  // (the latter powers ROI, independent of the selected period).
  //
  // `?summary=0` skips this block. The dashboard's Roster Health card calls this
  // route for FIVE counts (total_managed / healthy / behind / silent / unread
  // DMs) that are computed at step 6 from managedRows and have nothing to do
  // with GMV — but because it calls with page=1 it was also paying for this
  // block: 3x computeManagedGmv (~84 RPCs) + 2 analytics calls, every result
  // discarded. Defaults ON, so the roster client is unaffected.
  let summary: { affiliate_gmv: number; affiliate_gmv_prev: number; managed_gmv_prev: number; managed_gmv_30d: number } | undefined;
  if (!exportAll && page === 1 && wantSummary) {
    const sEnd = pEndDate ?? new Date().toISOString().slice(0, 10);
    const sStart = pStartDate ?? (() => {
      const d = new Date(sEnd + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - periodDays);
      return d.toISOString().slice(0, 10);
    })();
    const sStartD = new Date(sStart + 'T00:00:00Z');
    const sEndD = new Date(sEnd + 'T00:00:00Z');
    const winLen = Math.round((sEndD.getTime() - sStartD.getTime()) / 86400000) + 1;
    const pvEndD = new Date(sStartD); pvEndD.setUTCDate(pvEndD.getUTCDate() - 1);
    const pvStartD = new Date(pvEndD); pvStartD.setUTCDate(pvStartD.getUTCDate() - (winLen - 1));
    const pvStartStr = pvStartD.toISOString().slice(0, 10);
    const pvEndStr = pvEndD.toISOString().slice(0, 10);
    const roiEndStr = new Date().toISOString().slice(0, 10);
    const roiStartD = new Date(roiEndStr + 'T00:00:00Z'); roiStartD.setUTCDate(roiStartD.getUTCDate() - 29);
    const roiStartStr = roiStartD.toISOString().slice(0, 10);

    // Affiliate GMV needs data-level brand ids (in scope).
    let affBrandIds: string[] = [];
    if (brand && brand !== 'all') {
      affBrandIds = (brandIds ?? []).filter((id) => id !== NO_MATCH_BRAND_ID);
    } else {
      const rosterSlugs = scoped
        ? allowedSlugs!
        : reg.rows.filter((r) => r.parent_brand_id == null && !r.is_archived).map((r) => r.slug);
      affBrandIds = rosterSlugs
        .flatMap((s) => expandSlugs(reg, s))
        .map((s) => reg.bySlug.get(s)?.id)
        .filter((id): id is string => !!id);
    }

    // Canonical managed-GMV scope for this roster view, as DATA STORES. null =
    // all active stores (owner "all" / unscoped); otherwise the selected brand's
    // stores (umbrella-expanded), the store sub-filter, or the manager's stores.
    const kpiStoreSlugs: string[] | null =
      storeFilter ? [storeFilter]
      : (brand && brand !== 'all') ? expandSlugs(reg, brand)
      : scoped ? allowedSlugs!.flatMap((s) => expandSlugs(reg, s))
      : null;
    const sumMg = (r: ManagedGmvResult) =>
      kpiStoreSlugs === null
        ? Array.from(r.byStore.values()).reduce((s, v) => s + v, 0)
        : sumManagedGmvForBrands(r, reg, kpiStoreSlugs);

    // Managed GMV (period / prior period / trailing-30d) all come from the SAME
    // computeManagedGmv() the Earnings page uses, so the cards tie out exactly.
    // Affiliate GMV (brand-wide, all creators) stays on the analytics summaries.
    const kpiLookup = await buildManagedLookup(kpiStoreSlugs, reg);
    const [affCur, affPrev, mgCur, mgPrev, mg30] = await Promise.all([
      // getAnalyticsBrandTotals, not ...Summaries: this only needs total_gmv, and
      // the summaries RPC's unique_creators count made it slow enough to hit the
      // statement_timeout — which this .catch() then reported as $0 of GMV.
      affBrandIds.length
        ? getAnalyticsBrandTotals(affBrandIds, sStart, sEnd).catch((e) => {
            console.error('[roster] analytics_brand_totals (current period) failed:', e);
            return [];
          })
        : Promise.resolve([]),
      affBrandIds.length
        ? getAnalyticsBrandTotals(affBrandIds, pvStartStr, pvEndStr).catch((e) => {
            console.error('[roster] analytics_brand_totals (previous period) failed:', e);
            return [];
          })
        : Promise.resolve([]),
      // One shared managed lookup across all three windows — it's
      // date-independent, and rebuilding it per call meant 3x (brands_v2 +
      // ~1,460 paged managed_creators rows + a 5-batch tiktok_accounts loop).
      computeManagedGmv(sStart, sEnd, kpiStoreSlugs, reg, kpiLookup),
      computeManagedGmv(pvStartStr, pvEndStr, kpiStoreSlugs, reg, kpiLookup),
      computeManagedGmv(roiStartStr, roiEndStr, kpiStoreSlugs, reg, kpiLookup),
    ]);
    const sumTotalGmv = (rows: unknown) => ((rows as Array<{ total_gmv: number | string }> | null) ?? []).reduce((s, r) => s + (Number(r.total_gmv) || 0), 0);
    total_gmv_period = sumMg(mgCur);
    summary = {
      affiliate_gmv: sumTotalGmv(affCur),
      affiliate_gmv_prev: sumTotalGmv(affPrev),
      managed_gmv_prev: sumMg(mgPrev),
      managed_gmv_30d: sumMg(mg30),
    };
  }

  return {
    status: 200,
    body: {
      data: dataOut,
      spark_days: sparkDays,
      summary,
      total,
      total_managed,
      page,
      limit,
      // Period echo. In the range path the window is [period_start, period_end];
      // period_days is only meaningful on the legacy days_back fallback.
      period_days: rangeParam ? null : periodDays,
      period_start: pStartDate,
      period_end: pEndDate,
      // Action-oriented aggregates (managed-only — the cards filter the table).
      // behind/silent/healthy count CONTRACTED creators only; affiliate_count is
      // the $0-retainer tracked creators (no post commitment, not a triage state).
      behind_count,
      silent_count,
      healthy_count,
      affiliate_count,
      low_roi_count,
      unread_dms_total,
      // Total GMV across the (unfiltered) managed roster for the period.
      // Drives the "Total GMV" banner at the top of My Creators.
      total_gmv_period,
      // Total monthly retainer commitment (period-independent). Withheld (null,
      // rendered "—") from finance-blind scopes — never a fabricated $0.
      total_retainer: scope.canViewFinance ? total_retainer : null,
    },
  };
}
