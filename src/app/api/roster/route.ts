import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import {
  brandSlugToUuid,
  brandUuidToSlug,
  expandBrandToDataSlugs,
  BRAND_UUID_MAP,
} from '@/lib/utils/constants';

/**
 * Expand a brand filter (e.g. 'leefar', the umbrella) into the array of
 * data-level brand UUIDs that exist in daily_video_product_stats
 * (['leefar_nutrition', 'leefar_supplements'] → their UUIDs).
 * Non-umbrella brands return a single-element array. NULL/no-filter returns
 * null so the RPCs aggregate across all brands.
 */
function brandSlugToDataUuids(brandSlug: string | null | undefined): string[] | null {
  if (!brandSlug || brandSlug === 'all') return null;
  const dataSlugs = expandBrandToDataSlugs(brandSlug);
  const uuids = Array.from(dataSlugs)
    .map((s) => BRAND_UUID_MAP[s])
    .filter((u): u is string => !!u);
  return uuids.length > 0 ? uuids : null;
}

async function getTenantId() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = await createAdminClient();
  const { data: profile } = await admin
    .from('user_profiles')
    .select('tenant_id')
    .eq('user_id', user.id)
    .maybeSingle();

  return profile?.tenant_id || null;
}

// Column list for managed_creators selects. We still pull the account_1..5
// columns for back-compat with any caller that hasn't migrated to handles[],
// but the canonical handle list now comes from tiktok_accounts via creator_id.
// Once all consumers are on handles[], account_N can be dropped from the SELECT
// (and eventually the schema).
const COLUMNS = [
  'id', 'real_name', 'brand', 'status', 'retainer', 'monthly_post_requirement',
  'discord_name', 'discord_avatar', 'notes', 'created_at', 'creator_id',
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
  // FK to creators_v2 — the canonical identity link. Always populated post-Path-B
  // migration; remains nullable in the schema for now until other agents migrate.
  creator_id: string | null;
  // Legacy denormalized handle columns. Kept for back-compat during the
  // migration; new code reads from `handles` (built by joining tiktok_accounts).
  account_1: string | null;
  account_2: string | null;
  account_3: string | null;
  account_4: string | null;
  account_5: string | null;
}

interface PerfRow {
  tiktok_username: string;
  gmv_30d: string | number;
  posts_this_month: number;
  last_post_date: string | null;
}

interface MessageRow {
  tiktok_username: string;
  last_message_at: string | null;
  unread_count: number;
}

interface EnrichedRow extends ManagedRow {
  // Canonical handle list for this creator (from tiktok_accounts, primary first).
  // Replaces account_1..account_5 as the consumer-facing source of truth.
  handles: string[];
  gmv_30d: number;
  posts_this_month: number;
  last_post_date: string | null;
  health: CreatorHealth;
  // Convenience: trailing-30d GMV ÷ retainer (proxy for "is the contract paying off this month").
  // null when retainer is 0.
  roi_30d: number | null;
  // Messaging signals (sourced from creator_messages via discord_id bridge).
  // Both null/0 when there's no linked discord identity OR no message history.
  last_message_at: string | null;
  unread_count: number;
  // Distinguishes managed_creators rows (true) from unmanaged universe candidates
  // (false). Unmanaged rows are appended when ?include=all and have empty contract
  // fields, no health (rendered as "no_data"), and surface "+ Add to roster" in UI.
  is_managed: boolean;
}

interface UnmanagedPerfRow {
  tiktok_username: string;
  brand_id: string | null;
  real_name: string | null;
  gmv_30d: string | number;
  posts_this_month: number;
  last_post_date: string | null;
}

/**
 * Fallback handle extraction from the legacy denormalized columns.
 * Used only when a managed_creators row doesn't yet have a creator_id link
 * (shouldn't happen after the Path B backfill, but kept for safety).
 */
function legacyColumnHandles(c: ManagedRow): string[] {
  return [c.account_1, c.account_2, c.account_3, c.account_4, c.account_5]
    .map((h) => (h || '').trim().toLowerCase())
    .filter(Boolean);
}

const SORTABLE_DB = ['retainer', 'real_name', 'monthly_post_requirement', 'created_at', 'status', 'brand'] as const;
const SORTABLE_COMPUTED = ['gmv_30d', 'posts_this_month', 'last_post_date', 'health', 'roi_30d', 'last_message_at', 'unread_count'] as const;
type DbSort = typeof SORTABLE_DB[number];
type ComputedSort = typeof SORTABLE_COMPUTED[number];
type SortCol = DbSort | ComputedSort;

const HEALTH_FILTERS = ['all', 'healthy', 'behind', 'silent', 'churned', 'no_data', 'low_roi'] as const;
type HealthFilter = typeof HEALTH_FILTERS[number];

// GET /api/roster?brand=&status=&search=&page=1&limit=50&sort=&dir=&health=
export async function GET(request: NextRequest) {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const brand  = searchParams.get('brand');
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

  const supabase = await createAdminClient();

  // ── 1. Fetch ALL matching managed creators (no DB pagination yet — we need
  // the full set to compute health-aggregates and to support filtering by
  // health/computed columns).
  let baseQuery = supabase
    .from('managed_creators')
    .select(COLUMNS)
    .eq('tenant_id', tenantId)
    .is('archived_at', null);

  if (brand && brand !== 'all') baseQuery = baseQuery.eq('brand', brand);
  if (status && status !== 'all') baseQuery = baseQuery.eq('status', status);
  if (search) {
    baseQuery = baseQuery.or(
      `real_name.ilike.%${search}%,account_1.ilike.%${search}%,discord_name.ilike.%${search}%`,
    );
  }

  const { data: rawRows, error } = await baseQuery as { data: ManagedRow[] | null; error: { message: string } | null };
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const allRows: ManagedRow[] = rawRows ?? [];

  // ── 1b. Resolve handles per managed_creators row via tiktok_accounts
  // (one query for the whole page). This is now the canonical handle source;
  // the account_1..account_5 columns are only used as fallback below if a
  // managed_creators row hasn't been linked to a creators_v2 yet.
  const creatorIds = allRows.map((r) => r.creator_id).filter((v): v is string => !!v);
  const handlesByCreatorId = new Map<string, string[]>();
  if (creatorIds.length > 0) {
    const { data: taRows, error: taErr } = await supabase
      .from('tiktok_accounts')
      .select('creator_id, tiktok_username, is_primary')
      // Sort so primary handles come first; the page renders them in this order.
      .in('creator_id', creatorIds)
      .order('is_primary', { ascending: false })
      .order('id', { ascending: true });
    if (taErr) {
      console.error('[/api/roster] tiktok_accounts join failed:', taErr.message);
    } else {
      for (const row of (taRows as { creator_id: string; tiktok_username: string }[] | null) ?? []) {
        if (!row.tiktok_username) continue;
        const list = handlesByCreatorId.get(row.creator_id) ?? [];
        list.push(row.tiktok_username);
        handlesByCreatorId.set(row.creator_id, list);
      }
    }
  }

  // Per-row handle list. tiktok_accounts wins when the row has a creator_id;
  // otherwise we fall back to the legacy columns.
  const handlesByRow = new Map<string, string[]>();
  for (const r of allRows) {
    const fromAccounts = r.creator_id ? handlesByCreatorId.get(r.creator_id) : undefined;
    handlesByRow.set(r.id, fromAccounts && fromAccounts.length > 0 ? fromAccounts : legacyColumnHandles(r));
  }

  // ── 2. Bulk-fetch perf + message signals for every handle in parallel.
  const allHandles = Array.from(new Set(
    Array.from(handlesByRow.values()).flat().map((h) => h.toLowerCase()),
  ));
  const perfByHandle = new Map<string, { gmv_30d: number; posts_this_month: number; last_post_date: string | null }>();
  const msgByHandle = new Map<string, { last_message_at: string | null; unread_count: number }>();

  // Convert the brand filter (umbrella slug like 'leefar') to the array of
  // store-level UUIDs the perf table actually keys on. Null when no filter
  // is active so the RPC aggregates across all brands.
  const brandIds = brandSlugToDataUuids(brand);

  if (allHandles.length > 0) {
    const [perfRes, msgRes] = await Promise.all([
      supabase.rpc('get_creator_handle_perf', {
        handles: allHandles,
        brand_ids: brandIds,
      }),
      supabase.rpc('get_creator_message_signals', { handles: allHandles }),
    ]);

    if (perfRes.error) {
      // Don't hard-fail the page if perf is unavailable — degrade gracefully.
      console.error('[/api/roster] perf RPC failed:', perfRes.error.message);
    } else {
      for (const r of (perfRes.data as PerfRow[] | null) ?? []) {
        perfByHandle.set(r.tiktok_username.toLowerCase(), {
          gmv_30d: Number(r.gmv_30d) || 0,
          posts_this_month: Number(r.posts_this_month) || 0,
          last_post_date: r.last_post_date,
        });
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

  // ── 3. Enrich each row: sum across its handles, compute health + ROI.
  const enriched: EnrichedRow[] = allRows.map((row) => {
    const handles = handlesByRow.get(row.id) ?? [];
    const handlesLower = handles.map((h) => h.toLowerCase());
    let gmv = 0;
    let posts = 0;
    let lastPost: string | null = null;
    let lastMsg: string | null = null;
    let unread = 0;
    for (const h of handlesLower) {
      const p = perfByHandle.get(h);
      if (p) {
        gmv += p.gmv_30d;
        posts += p.posts_this_month;
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
      gmv_30d: gmv,
      posts_this_month: posts,
      last_post_date: lastPost,
      health,
      roi_30d: roi,
      last_message_at: lastMsg,
      unread_count: unread,
      is_managed: true,
    };
  });

  // ── 3b. When ?include=all, append unmanaged creators with recent GMV.
  // The RPC takes the set of currently-managed handles to exclude and
  // returns the top N by 30d GMV. We shape each result into an EnrichedRow
  // with empty contract fields + is_managed: false.
  if (includeUnmanaged) {
    // Same umbrella-aware brand expansion as the managed perf RPC.
    // Without this, filtering to LeeFar would pass the umbrella UUID
    // which doesn't exist in daily_video_product_stats → zero unmanaged
    // candidates surfaced.
    const { data: unmanagedRows, error: unmanagedErr } = await supabase.rpc(
      'get_unmanaged_top_perf',
      {
        managed_handles: allHandles,
        brand_ids: brandIds,
        limit_count: 500,
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
        const slug = brandUuidToSlug(u.brand_id ?? '') ?? null;
        enriched.push({
          // Synthetic id keyed on handle so React's key stays stable across
          // refetches and so the UI can detect "this is unmanaged" without
          // relying on the is_managed flag alone.
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
          creator_id: null,
          // Legacy column duplication. New code reads from `handles` below.
          account_1: u.tiktok_username,
          account_2: null,
          account_3: null,
          account_4: null,
          account_5: null,
          handles: [u.tiktok_username],
          gmv_30d: Number(u.gmv_30d) || 0,
          posts_this_month: Number(u.posts_this_month) || 0,
          last_post_date: u.last_post_date,
          // No contract → no derived health. Use a dedicated "unmanaged"-flavored
          // signal in the UI rather than reusing 'no_data'.
          health: 'no_data',
          roi_30d: null,
          last_message_at: null,
          unread_count: 0,
          is_managed: false,
        });
      }
    }
  }

  // ── 4. Compute aggregate counts BEFORE applying the health filter (cards
  // should always show the full picture so they remain useful as filter
  // triggers). Restrict to managed rows so "Include unmanaged" doesn't
  // inflate the action-card numbers — the cards are about MY roster's
  // health, not the universe.
  const managedRows  = enriched.filter((r) => r.is_managed);
  const total_managed = managedRows.length;
  const behind_count  = managedRows.filter((r) => r.health === 'behind').length;
  const silent_count  = managedRows.filter((r) => r.health === 'silent').length;
  const healthy_count = managedRows.filter((r) => r.health === 'healthy').length;
  // Retainer ROI < 1.0× — only meaningful for creators on retainer with stats.
  const low_roi_count = managedRows.filter(
    (r) => r.roi_30d !== null && r.roi_30d < 1 && r.health !== 'churned',
  ).length;
  // Total inbound DMs awaiting a reply across the managed roster.
  const unread_dms_total = managedRows.reduce((s, r) => s + (r.unread_count || 0), 0);

  // ── 5. Apply health filter.
  let filtered = enriched;
  if (healthFilter !== 'all') {
    if (healthFilter === 'low_roi') {
      filtered = filtered.filter((r) => r.roi_30d !== null && r.roi_30d < 1 && r.health !== 'churned');
    } else {
      filtered = filtered.filter((r) => r.health === healthFilter);
    }
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
    total_managed, // count of managed rows in unfiltered set (for the "Total managed" card)
    page,
    limit,
    // Action-oriented aggregates (managed-only — the cards filter the table)
    behind_count,
    silent_count,
    healthy_count,
    low_roi_count,
    unread_dms_total,
  });
}

// POST /api/roster — add a creator with N TikTok handles.
//
// Body shape (post-Path-B):
//   { real_name, brand, retainer, monthly_post_requirement, discord_name,
//     notes, handles: string[] }
//
// Legacy body shape (account_1 only) is still accepted for back-compat —
// it gets normalized into handles[].
export async function POST(request: NextRequest) {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const {
    brand, real_name, retainer, discord_name, notes, monthly_post_requirement,
  } = body;

  // Normalize handles: prefer body.handles[]; fall back to legacy account_1.
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

  const supabase = await createAdminClient();

  // Insert managed_creators. Dual-write account_1..account_5 from the
  // handles[] array for back-compat with any reader that hasn't migrated;
  // tiktok_accounts is still the canonical store going forward.
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

  // Auto-provision creators_v2 + tiktok_accounts so "View Full Profile" works
  // immediately for newly added creators. Step 1: resolve or create creator_id.
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
    // Step 2: link managed_creators row to creators_v2 (FK).
    await supabase
      .from('managed_creators')
      .update({ creator_id: creatorId })
      .eq('id', data.id);

    // Step 3: write one tiktok_accounts row per handle.
    const brandUuid = brand ? brandSlugToUuid(brand) : undefined;
    for (let i = 0; i < handles.length; i++) {
      await supabase
        .from('tiktok_accounts')
        .upsert({
          creator_id: creatorId,
          tenant_id: tenantId,
          tiktok_username: handles[i],
          brand_id: brandUuid ?? null,
          is_primary: i === 0,
        }, { onConflict: 'tenant_id,tiktok_username,brand_id', ignoreDuplicates: true });
    }

    // Step 4: creator_brands row for the contracted brand.
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
