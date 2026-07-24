import { createAdminClient, createClient } from '@/lib/supabase/server';
import { getBrandRegistry, resolveUuids, expandSlugs, type BrandRegistry } from '@/lib/data/brand-registry';

// ─── Types ──────────────────────────────────────────────────────

interface VideoEntry {
  video_id: string;
  video_url: string | null;
  video_title: string | null;
  tiktok_username: string;
  gmv: number;
  orders: number;
  post_date: string | null;
  brand_id: string;
}

interface CreatorEntry {
  tiktok_username: string;
  gmv: number;
  orders: number;
  items_sold: number;
  videos: number;
  brand_id: string;
  discord_id: string | null;
  discord_name: string | null;
}

export interface WhatsCookingData {
  hotVideos: VideoEntry[];
  risingVideos: VideoEntry[];
  topVideos: VideoEntry[];
  discordMap: Map<string, { discord_id: string | null; discord_name: string | null }>;
  totalGmv: number;
  videoCount: number;
  creatorCount: number;
  /** Last day of the data window (latest report_date). Use for display headers. */
  endDate: Date;
}

/** One Who's Cooking leaderboard/shoutout entry (agg row + JS-attached fields). */
export interface WhosCookingEntry extends CreatorEntry {
  breakoutPct: number;
  priorGmv: number;
  daysPosted: number;
  /** Rank in the PRIOR same-length window's leaderboard (top 10); null = not in
   *  the prior top 10. Use priorGmv to tell "climbed in from rank 11+" apart
   *  from genuinely new (zero prior-window GMV). */
  priorRank: number | null;
}

/** v3 mockup formats for the Who's Cooking post. */
export type WhosCookingFormat = 'highlights' | 'classic';

export interface WhosCookingData {
  leaderboard: WhosCookingEntry[];
  mostProlific: WhosCookingEntry | null;
  ironChef: WhosCookingEntry | null;
  breakoutStar: WhosCookingEntry | null;
  /** false = the prior-window agg call failed; formatters omit delta markers
   *  entirely rather than mislabel everyone "(new)". */
  priorRanksAvailable: boolean;
  /** Rookie of the Week (get_roster_rookie). null = none found / RPC failed. */
  rookie: { handle: string; gmv: number } | null;
  /** Highest-ranked creator OUTSIDE the top 10 (rank 11+), from
   *  whos_cooking_agg_v2's 15-row leaderboard (mig 099). */
  soClose: { handle: string; gmv: number; gap: number } | null;
  discordMap: Map<string, { discord_id: string | null; discord_name: string | null }>;
  totalGmv: number;
  creatorCount: number;
  videoCount: number;
  /** Last day of the data window (latest report_date). Use for display headers. */
  endDate: Date;
}

// ─── Helpers ────────────────────────────────────────────────────

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

// Resolve a roster brand slug to the brand_id UUIDs the daily_* tables are keyed
// by. DB-driven (reads brands_v2) so ANY brand with a row resolves. The old
// hardcoded BRAND_UUID_MAP silently returned null for newer brands (cosrx,
// neurogum, m3, …), and callers treat null as "no brand filter" — so the queries
// scanned every brand and statement-timed-out on the big daily_creator_stats
// table (e.g. cosrx's MTD was a 259k-row all-brands scan instead of 84k scoped).
// 'all'/empty → null (no filter). An unknown specific brand → [] so it scopes to
// nothing rather than widening to all brands.
async function getBrandUuids(_supabase: any, brandFilter: string): Promise<string[] | null> {
  if (!brandFilter || brandFilter === 'all') return null;
  const reg = await getBrandRegistry();
  return resolveUuids(reg, brandFilter);
}

// Umbrella-grain slug list for tables keyed the way managed_creators/roster
// rollups are (brand slug at umbrella grain): a store slug also includes its
// parent umbrella slug; 'all'/empty = null (no filter).
function rosterBrandSlugs(reg: BrandRegistry, brandFilter: string): string[] | null {
  if (!brandFilter || brandFilter === 'all') return null;
  const row = reg.bySlug.get(brandFilter);
  const parentSlug = row?.parent_brand_id ? reg.byId.get(row.parent_brand_id)?.slug : undefined;
  return parentSlug ? [brandFilter, parentSlug] : [brandFilter];
}

/**
 * The data tables only have data through whatever the most recent CSV upload
 * processed. Anchoring period windows to "today" produces empty results when
 * uploads are stale (e.g. today is Apr 28 but data ends Apr 13 → 7-day window
 * Apr 21–28 returns nothing).
 *
 * This returns a synthetic "today" that is one day after the latest data point
 * we have for the brand IN THE GIVEN TABLE, so `yesterday = latest data date`
 * and all existing "today minus N days" math windows over real data automatically.
 *
 * IMPORTANT: each table can have its own latest upload date — for JiYu,
 * daily_creator_stats is current through Apr but daily_video_stats/daily_product_stats
 * stopped updating in March. Pass the table you're querying so each section
 * shows the freshest data in that source.
 *
 * Falls back to real `new Date()` if the table has zero data for this brand.
 */
async function resolveAnchorToday(
  supabase: any,
  brandUuids: string[] | null,
  table: 'daily_creator_stats' | 'daily_video_product_stats' = 'daily_creator_stats'
): Promise<Date> {
  let query = supabase
    .from(table)
    .select('report_date')
    .order('report_date', { ascending: false })
    .limit(1);
  if (brandUuids) query = query.in('brand_id', brandUuids);
  const { data } = await query;
  if (!data || data.length === 0) return new Date();
  // Build a Date from the latest report_date (UTC noon to avoid TZ slips), then add 1 day so
  // "yesterday" math = the actual latest data date.
  const latest = new Date(data[0].report_date + 'T12:00:00Z');
  latest.setUTCDate(latest.getUTCDate() + 1);
  return latest;
}

/**
 * Returns the latest report_date in the data tables (or null if none exist).
 * Used by the freshness banner so the UI can warn the user when data is stale.
 */
export async function getLatestReportDate(brandFilter: string): Promise<Date | null> {
  const supabase = await createClient();
  const brandUuids = await getBrandUuids(supabase, brandFilter);
  let query = supabase
    .from('daily_creator_stats')
    .select('report_date')
    .order('report_date', { ascending: false })
    .limit(1);
  if (brandUuids) query = query.in('brand_id', brandUuids);
  const { data } = await query;
  if (!data || data.length === 0) return null;
  return new Date(data[0].report_date + 'T12:00:00Z');
}

/**
 * Fetch EVERY row of a table query, paging past PostgREST's silent 1000-row
 * cap. `makeQuery` must return a FRESH builder each call (builders are
 * single-use) carrying a stable `.order()` so successive range windows line
 * up. Same idiom as fetchAllRows in managed-gmv.ts.
 */
async function fetchAllRows<T>(
  makeQuery: () => { range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }> },
): Promise<T[]> {
  const PAGE = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await makeQuery().range(from, from + PAGE - 1);
    if (error) throw new Error(`[discord-posts] paged fetch failed: ${error.message}`);
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < PAGE) break;
  }
  return out;
}

async function getDiscordMap(supabase: any, brandFilter: string): Promise<Map<string, { discord_id: string | null; discord_name: string | null }>> {
  const map = new Map<string, { discord_id: string | null; discord_name: string | null }>();

  // Mentions must degrade gracefully — a failed lookup falls back to plain
  // @handle text, never a crashed post and never a silent unfiltered read.
  let mcBrands: string[] | null = null;   // managed_creators is keyed at umbrella grain
  try {
    if (brandFilter && brandFilter !== 'all') {
      const reg = await getBrandRegistry();
      // Include the parent umbrella slug when a store slug was selected —
      // roster rows live at the umbrella grain.
      mcBrands = rosterBrandSlugs(reg, brandFilter);
    }
  } catch (err) {
    console.error('[discord-posts] getDiscordMap: brand registry read failed - mentions will fall back to @handle:', err);
    return map;
  }

  // Primary source: managed_creators (has the most discord IDs — 650+).
  // Paged: the table is over PostgREST's 1000-row cap, an un-paged read
  // silently dropped the tail of the roster.
  try {
    const mcData = await fetchAllRows<any>(() => {
      let q = supabase
        .from('managed_creators')
        .select('account_1, account_2, account_3, account_4, account_5, discord_id, discord_name')
        .not('discord_id', 'is', null)
        .order('id');
      if (mcBrands) q = q.in('brand', mcBrands);
      return q;
    });
    mcData.forEach((mc: any) => {
      if (!mc.discord_id) return;
      const accounts = [mc.account_1, mc.account_2, mc.account_3, mc.account_4, mc.account_5].filter(Boolean);
      accounts.forEach((acc: string) => {
        const handle = acc.toLowerCase().replace('@', '').trim();
        if (handle && !map.has(handle)) {
          map.set(handle, {
            discord_id: mc.discord_id,
            discord_name: mc.discord_name,
          });
        }
      });
    });
  } catch (err) {
    console.error('[discord-posts] getDiscordMap: managed_creators read failed - mentions will fall back to @handle:', err);
  }

  // Secondary source: creators_v2 via tiktok_accounts (for newer creators not
  // in managed_creators). Also paged — tiktok_accounts is over the 1000 cap.
  // Deliberately NOT scoped by brand_id: the column's write-grain is
  // inconsistent — rows carry the umbrella's OWN uuid, a child-store uuid, or
  // NULL (creator-linked rows) — so an .in('brand_id', childStoreUuids) filter
  // silently dropped real Discord mappings. The table is small and the map is
  // keyed by handle, so over-fetching is harmless.
  try {
    const v2Data = await fetchAllRows<any>(() =>
      supabase
        .from('tiktok_accounts')
        .select('tiktok_username, creator:creators_v2!inner(discord_id, discord_username)')
        .not('creator_id', 'is', null)
        .order('id'),
    );
    v2Data.forEach((row: any) => {
      const handle = (row.tiktok_username || '').toLowerCase().replace('@', '');
      if (handle && row.creator?.discord_id && !map.has(handle)) {
        map.set(handle, {
          discord_id: row.creator.discord_id,
          discord_name: row.creator.discord_username,
        });
      }
    });
  } catch (err) {
    console.error('[discord-posts] getDiscordMap: tiktok_accounts read failed - mentions will fall back to @handle:', err);
  }

  return map;
}

// ─── What's Cooking Data ────────────────────────────────────────

export async function getWhatsCookingData(brandFilter: string, period: '7d' | '30d'): Promise<WhatsCookingData> {
  // Service-role client: the cron schedule runner calls this with NO session
  // (cookie client = anon), and the admin/manager-only RPCs are being revoked
  // from anon (mig 100). Authz lives in the callers — /api/discord-posts
  // scope-guards the requester, /api/cron/run-schedules is secret-gated.
  const supabase = await createAdminClient();
  const brandUuids = await getBrandUuids(supabase, brandFilter);

  // What's Cooking queries daily_video_stats — anchor to that table specifically
  // so we always show the most recent video data we have (may lag creator data).
  const today = await resolveAnchorToday(supabase, brandUuids, 'daily_video_product_stats');
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  let hotStartDate: string;
  let risingStartDate: string;
  let risingEndDate: string;
  let fullStartDate: string;
  const endDate = formatDate(yesterday);

  if (period === '30d') {
    // Monthly: "Hot" = last 7 days of month, "Rising" = 7-14 days ago, "Top" = full month
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(today.getDate() - 30);
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 7);
    const fourteenDaysAgo = new Date(today);
    fourteenDaysAgo.setDate(today.getDate() - 14);

    hotStartDate = formatDate(sevenDaysAgo);
    risingStartDate = formatDate(fourteenDaysAgo);
    risingEndDate = formatDate(sevenDaysAgo);
    fullStartDate = formatDate(thirtyDaysAgo);
  } else {
    // 7-day: standard lookback
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 7);
    const fourteenDaysAgo = new Date(today);
    fourteenDaysAgo.setDate(today.getDate() - 14);

    hotStartDate = formatDate(sevenDaysAgo);
    risingStartDate = formatDate(fourteenDaysAgo);
    risingEndDate = formatDate(sevenDaysAgo);
    fullStartDate = formatDate(fourteenDaysAgo);
  }

  // Hot/Rising GMV thresholds (constant across periods).
  const hotThreshold = 100;
  const risingThreshold = 50;

  // Aggregation runs in Postgres (whats_cooking_agg) and returns only the top
  // videos per tier + totals — NOT the full 14-30 day window of rows, which for
  // a high-volume / umbrella / all-brands selection timed the function out.
  const { data: agg, error } = await supabase.rpc('whats_cooking_agg', {
    p_brand_ids: brandUuids,
    p_full_start: fullStartDate,
    p_end: endDate,
    p_hot_start: hotStartDate,
    p_rising_start: risingStartDate,
    p_rising_end: risingEndDate,
    p_hot_threshold: hotThreshold,
    p_rising_threshold: risingThreshold,
  });
  if (error) throw error;
  const a = (agg ?? {}) as {
    totalGmv?: number; videoCount?: number; creatorCount?: number;
    hotVideos?: VideoEntry[]; risingVideos?: VideoEntry[]; topVideos?: VideoEntry[];
  };

  // Discord mention map stays in JS — it isn't brand-volume-dependent.
  const discordMap = await getDiscordMap(supabase, brandFilter);

  return {
    hotVideos: a.hotVideos ?? [],
    risingVideos: a.risingVideos ?? [],
    topVideos: a.topVideos ?? [],
    discordMap,
    totalGmv: Number(a.totalGmv ?? 0),
    videoCount: Number(a.videoCount ?? 0),
    creatorCount: Number(a.creatorCount ?? 0),
    endDate: yesterday,
  };
}

// ─── Who's Cooking Data ─────────────────────────────────────────

export async function getWhosCookingData(brandFilter: string, period: '7d' | '30d'): Promise<WhosCookingData> {
  // Service-role client — see getWhatsCookingData; whos_cooking_agg_v2 and
  // get_roster_rookie are anon-revoked and the cron path has no session.
  const supabase = await createAdminClient();
  const reg = await getBrandRegistry();
  const brandUuids = brandFilter && brandFilter !== 'all' ? resolveUuids(reg, brandFilter) : null;

  const today = await resolveAnchorToday(supabase, brandUuids);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const endDate = formatDate(yesterday);

  const periodDays = period === '30d' ? 30 : 7;

  const currentStartD = new Date(today);
  currentStartD.setDate(today.getDate() - periodDays);
  const priorStartD = new Date(today);
  priorStartD.setDate(today.getDate() - periodDays * 2);

  const currentStart = formatDate(currentStartD);
  const priorStart = formatDate(priorStartD);
  // The RPC's prior window is half-open: [p_prior_start, p_prior_end).
  const priorEnd = currentStart;

  // For rank deltas the prior window is re-run through the agg as a *current*
  // window, whose ends are inclusive: [priorStart, currentStart - 1] covers
  // exactly the same days as the half-open [priorStart, currentStart).
  const priorEndInclusiveD = new Date(currentStartD);
  priorEndInclusiveD.setDate(currentStartD.getDate() - 1);
  const priorEndInclusive = formatDate(priorEndInclusiveD);
  const prior2StartD = new Date(priorStartD);
  prior2StartD.setDate(priorStartD.getDate() - periodDays);
  const prior2Start = formatDate(prior2StartD);

  const ironChefMinDays = period === '30d' ? 20 : 5;
  const rosterSlugs = rosterBrandSlugs(reg, brandFilter);

  // Aggregation runs in Postgres (whos_cooking_agg_v2, mig 099: same shape as
  // mig 055's whos_cooking_agg but the leaderboard carries 15 rows — top 10
  // renders, rows 11+ feed "So close"; the v1 function stays untouched for
  // the deployed formatter). NOT the full current+prior window of creator-day
  // rows, which for a high-volume / umbrella / all-brands selection timed the
  // function out. Called twice: once for the current window and once for the
  // window immediately before it, so both v3 formats can show each handle's
  // rank delta. Rookie of the Week is one cheap RPC on the roster rollups
  // (get_roster_rookie, mig 097).
  const [curRes, priorRes, rookieRes, discordMap] = await Promise.all([
    supabase.rpc('whos_cooking_agg_v2', {
      p_brand_ids: brandUuids,
      p_current_start: currentStart,
      p_end: endDate,
      p_prior_start: priorStart,
      p_prior_end: priorEnd,
      p_iron_chef_min: ironChefMinDays,
    }),
    supabase.rpc('whos_cooking_agg_v2', {
      p_brand_ids: brandUuids,
      p_current_start: priorStart,
      p_end: priorEndInclusive,
      p_prior_start: prior2Start,
      p_prior_end: priorStart,
      p_iron_chef_min: ironChefMinDays,
    }),
    supabase.rpc('get_roster_rookie', {
      p_brand_slugs: rosterSlugs,
      p_start: currentStart,
      p_end: endDate,
      p_max_age_days: 21,
    }),
    getDiscordMap(supabase, brandFilter),
  ]);

  interface AggCreatorRow {
    tiktok_username?: string;
    gmv?: number | string;
    orders?: number | string;
    items_sold?: number | string;
    videos?: number | string;
    brand_id?: string;
    daysPosted?: number | string;
    priorGmv?: number | string;
    breakoutPct?: number | string;
  }

  if (curRes.error) throw curRes.error;
  const a = (curRes.data ?? {}) as {
    totalGmv?: number; creatorCount?: number; videoCount?: number;
    leaderboard?: AggCreatorRow[];
    mostProlific?: AggCreatorRow | null;
    ironChef?: AggCreatorRow | null;
    breakoutStar?: AggCreatorRow | null;
  };

  // Prior ranks (handle -> rank 1..15 in the prior window). A failed prior call
  // DEGRADES delta markers (omitted), never fakes "(new)" for everyone.
  let priorRanks: Map<string, number> | null = null;
  if (priorRes.error) {
    console.error('[discord-posts] whos_cooking_agg (prior window) failed - omitting rank deltas:', priorRes.error.message);
  } else {
    const p = (priorRes.data ?? {}) as { leaderboard?: AggCreatorRow[] };
    const ranks = new Map<string, number>();
    (p.leaderboard ?? []).forEach((c, i) => {
      const h = String(c.tiktok_username || '').toLowerCase().replace('@', '');
      if (h && !ranks.has(h)) ranks.set(h, i + 1);
    });
    priorRanks = ranks;
  }

  // Rookie of the Week — degrade on error, omit when the RPC finds nobody.
  let rookie: WhosCookingData['rookie'] = null;
  if (rookieRes.error) {
    console.error('[discord-posts] get_roster_rookie failed - omitting rookie section:', rookieRes.error.message);
  } else if (rookieRes.data && typeof rookieRes.data === 'object') {
    const r = rookieRes.data as { handle?: string; gmv?: number | string };
    const gmv = Number(r.gmv) || 0;
    if (r.handle && gmv > 0) rookie = { handle: String(r.handle), gmv };
  }

  // SO CLOSE — highest-ranked creator outside the top 10 (rows 11+ of the
  // v2 leaderboard). Omitted when nobody ranks 11+.
  let soClose: WhosCookingData['soClose'] = null;
  const rawBoard = a.leaderboard ?? [];
  if (rawBoard.length > 10) {
    const tenthGmv = Number(rawBoard[9]?.gmv) || 0;
    const eleventh = rawBoard[10];
    const gmv = Number(eleventh?.gmv) || 0;
    const handle = String(eleventh?.tiktok_username || '').replace('@', '');
    if (handle) soClose = { handle, gmv, gap: Math.max(0, Math.round(tenthGmv - gmv)) };
  }

  // Discord mention map stays in JS — it isn't brand-volume-dependent. Attach
  // the mention id/name to each creator by handle.
  const attach = (c: AggCreatorRow): WhosCookingEntry => {
    const handle = (c.tiktok_username || '').toLowerCase().replace('@', '');
    const d = discordMap.get(handle);
    return {
      tiktok_username: c.tiktok_username ?? '',
      gmv: Number(c.gmv) || 0,
      orders: Number(c.orders) || 0,
      items_sold: Number(c.items_sold) || 0,
      videos: Number(c.videos) || 0,
      brand_id: c.brand_id ?? '',
      discord_id: d?.discord_id ?? null,
      discord_name: d?.discord_name ?? null,
      daysPosted: Number(c.daysPosted) || 0,
      priorGmv: Number(c.priorGmv) || 0,
      breakoutPct: Number(c.breakoutPct) || 0,
      priorRank: priorRanks?.get(handle) ?? null,
    };
  };

  return {
    leaderboard: rawBoard.map(attach),
    mostProlific: a.mostProlific ? attach(a.mostProlific) : null,
    ironChef: a.ironChef ? attach(a.ironChef) : null,
    breakoutStar: a.breakoutStar ? attach(a.breakoutStar) : null,
    priorRanksAvailable: priorRanks !== null,
    rookie,
    soClose,
    discordMap,
    totalGmv: Number(a.totalGmv ?? 0),
    creatorCount: Number(a.creatorCount ?? 0),
    videoCount: Number(a.videoCount ?? 0),
    endDate: yesterday,
  };
}

// ─── Monthly Goal (DB-driven: brands_v2.monthly_gmv_goal) ───────

interface MonthlyGoalInfo {
  /** null = no goal configured (or the read failed) — the Daily Drop omits its
   *  goal/pacing block instead of fabricating one. */
  goal: number | null;
  /** How many brands the goal covers (>1 only for the all-brands drop). */
  brandCount: number;
}

async function getMonthlyGoalInfo(supabase: any, brandFilter: string): Promise<MonthlyGoalInfo> {
  try {
    if (brandFilter && brandFilter !== 'all') {
      const { data, error } = await supabase
        .from('brands_v2')
        .select('monthly_gmv_goal')
        .eq('slug', brandFilter)
        .limit(1);
      if (error) throw new Error(error.message);
      const raw = data?.[0]?.monthly_gmv_goal;
      const goal = raw === null || raw === undefined ? NaN : Number(raw);
      return Number.isFinite(goal) && goal > 0
        ? { goal, brandCount: 1 }
        : { goal: null, brandCount: 0 };
    }
    // All-brands: sum only the brands that HAVE a goal and report how many that
    // is. Skip child stores whose parent umbrella also carries a goal so an
    // umbrella and its stores never double count.
    const { data, error } = await supabase
      .from('brands_v2')
      .select('id, parent_brand_id, monthly_gmv_goal')
      .eq('is_archived', false)
      .not('monthly_gmv_goal', 'is', null);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as { id: string; parent_brand_id: string | null; monthly_gmv_goal: number | string }[];
    const idsWithGoal = new Set(rows.map((r) => r.id));
    let sum = 0;
    let count = 0;
    for (const r of rows) {
      if (r.parent_brand_id && idsWithGoal.has(r.parent_brand_id)) continue;
      const g = Number(r.monthly_gmv_goal);
      if (!Number.isFinite(g) || g <= 0) continue;
      sum += g;
      count += 1;
    }
    return count > 0 ? { goal: sum, brandCount: count } : { goal: null, brandCount: 0 };
  } catch (err) {
    console.error('[discord-posts] monthly goal read failed - omitting goal block:', err);
    return { goal: null, brandCount: 0 };
  }
}

// ─── Daily Drop Types & Data ────────────────────────────────────

/** Game mechanics from get_daily_drop_extras (mig 097, roster rollups). */
export interface DailyDropExtras {
  /** Lifetime-GMV threshold crossings yesterday (up to 3, biggest first). */
  milestones: { handle: string; threshold: number }[];
  /** First-ever sale yesterday (RPC returns up to 5; formatters show 3). */
  firstSales: { handle: string; gmv: number }[];
  /** Longest posting streak ending yesterday (RPC looks back 60 days). */
  streak: { handle: string; days: number } | null;
  /** Biggest daily-rank climber, yesterday vs day before. */
  climber: { handle: string; rank: number; delta: number; gmv: number } | null;
}

export interface DailyDropData {
  /** null = get_daily_drop_extras FAILED — the formatter omits the climber and
   *  milestone sections rather than posting fake celebrations. */
  extras: DailyDropExtras | null;
  yesterdayGmv: number;
  dayBeforeGmv: number;
  /** null = the MTD aggregate (dcs_gmv_sum) FAILED — the formatter omits the
   *  goal/pacing block rather than posting a fake $0 MTD to Discord. */
  mtdGmv: number | null;
  /** null = no goal configured in brands_v2.monthly_gmv_goal — the formatter
   *  omits the goal/pacing block rather than fabricating a target. */
  monthlyGoal: number | null;
  /** How many brands the goal covers (>1 only for the all-brands drop). */
  goalBrandCount: number;
  yesterdayDate: Date;
  dayBeforeDate: Date;
  /** Date the video/OTW data is reporting on (may lag yesterdayDate when video uploads are stale). */
  videoAsOf: Date;
  /** Date the product data is reporting on (may lag yesterdayDate when product uploads are stale). */
  productAsOf: Date;
  topCreators: { tiktok_username: string; gmv: number }[];
  topVideos: { video_id: string; tiktok_username: string; gmv: number; video_url: string | null }[];
  topProducts: { name: string; gmv: number }[];
  oneToWatch: { video_id: string; tiktok_username: string; gmv: number; hoursAgo: number; video_url: string | null } | null;
  discordMap: Map<string, { discord_id: string | null; discord_name: string | null }>;
}

/**
 * Latest report_date in video_performance (period_type='daily'), plus one day —
 * the anchor for the Daily Drop's video sections, which read video_performance
 * (real TikTok video ids), not daily_video_product_stats (whose video_id is a
 * reused PRODUCT id). Falls back to real now() when the table has no data.
 */
async function resolveVideoPerfAnchor(supabase: any, brandSlugs: string[] | null): Promise<Date> {
  let query = supabase
    .from('video_performance')
    .select('report_date')
    .eq('period_type', 'daily')
    .order('report_date', { ascending: false })
    .limit(1);
  if (brandSlugs) query = query.in('brand', brandSlugs);
  const { data } = await query;
  if (!data || data.length === 0) return new Date();
  const latest = new Date(data[0].report_date + 'T12:00:00Z');
  latest.setUTCDate(latest.getUTCDate() + 1);
  return latest;
}

export async function getDailyDropData(brandFilter: string): Promise<DailyDropData> {
  // Service-role client — see getWhatsCookingData; get_daily_drop_extras is
  // anon-revoked and the cron path has no session.
  const supabase = await createAdminClient();
  const reg = await getBrandRegistry();
  const brandUuids = brandFilter && brandFilter !== 'all' ? resolveUuids(reg, brandFilter) : null;
  // video_performance is keyed by brand SLUG (store grain) — umbrellas expand.
  const vpBrandSlugs = brandFilter && brandFilter !== 'all' ? expandSlugs(reg, brandFilter) : null;
  // Roster rollups are keyed at umbrella grain (store slug + its parent).
  const rosterSlugs = rosterBrandSlugs(reg, brandFilter);

  // Each table can have its own latest upload date. Anchor each section's
  // queries to its own table so video/product sections still show the freshest
  // data they have, instead of empty results.
  const [creatorAnchor, videoAnchor, productAnchor] = await Promise.all([
    resolveAnchorToday(supabase, brandUuids, 'daily_creator_stats'),
    resolveVideoPerfAnchor(supabase, vpBrandSlugs),
    resolveAnchorToday(supabase, brandUuids, 'daily_video_product_stats'),
  ]);

  // Header date / "yesterday" math uses the creator anchor (most authoritative
  // for headline GMV and pacing). Video/product sections use their own anchors.
  const today = creatorAnchor;
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const dayBefore = new Date(today);
  dayBefore.setDate(today.getDate() - 2);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  const videoYesterday = new Date(videoAnchor);
  videoYesterday.setDate(videoAnchor.getDate() - 1);
  const videoThreeDaysAgo = new Date(videoAnchor);
  videoThreeDaysAgo.setDate(videoAnchor.getDate() - 3);

  const productYesterday = new Date(productAnchor);
  productYesterday.setDate(productAnchor.getDate() - 1);

  const yesterdayStr = formatDate(yesterday);
  const dayBeforeStr = formatDate(dayBefore);
  const monthStartStr = formatDate(monthStart);
  const videoYesterdayStr = formatDate(videoYesterday);
  const productYesterdayStr = formatDate(productYesterday);

  // All queries below run in parallel and are ALL aggregate RPCs. The old
  // paginated table pulls ran through per-row RLS policy evaluation - one
  // page of the yesterday-creators read measured 5,128ms under the
  // authenticated role (the report_date index visits ~40k rows and evaluates
  // get_tenant_id()/get_user_role()/is_platform_admin() on every one) - and
  // three of them in parallel blew the authenticator's 8s statement_timeout.
  // get_daily_drop_agg (mig 093) returns yesterday total + top-5 creators +
  // day-before total + top-5 products in one 93ms call.

  // MTD GMV is a single SQL aggregate (dcs_gmv_sum RPC), NOT a paginate-every-row
  // sum. For a multi-store umbrella (LeeFar ~47k MTD rows) or the all-brands drop
  // (~259k) the old paginated sum was dozens/hundreds of deep-offset round-trips
  // and timed the function out (504). brandUuids null = all brands.

  // Video sections (Top 5 Videos + One to Watch) come from ONE RPC
  // (get_video_day_leaders, mig 092) over video_performance — the table whose
  // video_id is a REAL TikTok id. daily_video_product_stats.video_id is a
  // reused PRODUCT id, so grouping/linking on it mis-attributed GMV and posted
  // dead tiktok.com links. The RPC runs the mig-079 dedup + per-video
  // aggregation + watch-URL resolution in SQL under its own 30s timeout — a
  // raw PostgREST select over the 3-day all-brands window died on the
  // authenticator role's 8s statement_timeout (57014). 179ms measured.
  const videoThreeDaysAgoStr = formatDate(videoThreeDaysAgo);
  const vpQuery = supabase.rpc('get_video_day_leaders', {
    p_brand_slugs: vpBrandSlugs,          // null = all brands
    p_day: videoYesterdayStr,
    p_window_start: videoThreeDaysAgoStr,
    p_limit: 5,
    p_min_gmv: 25,
  });

  const [aggRes, mtdSumRes, vpRes, extrasRes, goalInfo, discordMap] = await Promise.all([
    supabase.rpc('get_daily_drop_agg', {
      p_brand_ids: brandUuids,
      p_yesterday: yesterdayStr,
      p_day_before: dayBeforeStr,
      p_product_day: productYesterdayStr,
    }),
    supabase.rpc('dcs_gmv_sum', { p_brand_ids: brandUuids, p_start: monthStartStr, p_end: yesterdayStr }),
    vpQuery,
    // Game mechanics (milestones / streak / first sales / biggest climber) —
    // one cheap RPC over the pg_cron-refreshed roster rollups (mig 097).
    supabase.rpc('get_daily_drop_extras', {
      p_brand_slugs: rosterSlugs,
      p_yesterday: yesterdayStr,
      p_day_before: dayBeforeStr,
    }),
    getMonthlyGoalInfo(supabase, brandFilter),
    getDiscordMap(supabase, brandFilter),
  ]);

  if (aggRes.error) throw new Error(`[discord-posts] get_daily_drop_agg failed: ${aggRes.error.message}`);
  const agg = (aggRes.data ?? {}) as {
    yesterday_gmv?: number | string;
    day_before_gmv?: number | string;
    top_creators?: Array<{ handle: string; gmv: number | string }>;
    top_products?: Array<{ name: string; gmv: number | string }>;
  };

  if (vpRes.error) throw new Error(`[discord-posts] get_video_day_leaders failed: ${vpRes.error.message}`);
  interface LeaderRow {
    section: 'day' | 'new';
    video_id: string;
    creator_handle: string | null;
    gmv: number | string;
    post_date: string | null;
    video_url: string | null;
  }
  const leaderRows = (vpRes.data ?? []) as LeaderRow[];
  // section='day': GMV earned yesterday, summed per real video, top 5.
  const topVideos = leaderRows
    .filter(r => r.section === 'day')
    .map(r => ({
      video_id: r.video_id,
      tiktok_username: r.creator_handle ?? '',
      gmv: parseFloat(String(r.gmv)) || 0,
      video_url: r.video_url,
    }))
    .sort((a, b) => b.gmv - a.gmv)
    .slice(0, 5);
  // section='new': 3-day-window GMV for videos POSTED in the window (>= $25).
  const otwBest = leaderRows
    .filter(r => r.section === 'new' && r.post_date)
    .map(r => ({
      video_id: r.video_id,
      tiktok_username: r.creator_handle ?? '',
      gmv: parseFloat(String(r.gmv)) || 0,
      post_date: r.post_date!,
      video_url: r.video_url,
    }))
    .sort((a, b) => b.gmv - a.gmv)[0] ?? null;

  // Products come pre-aggregated from the RPC (summed per product_name over
  // the product-anchor day, top 5).
  const topProducts = (agg.top_products ?? []).map(p => ({
    name: p.name || 'Unknown Product',
    gmv: parseFloat(String(p.gmv)) || 0,
  }));

  let oneToWatch: DailyDropData['oneToWatch'] = null;
  if (otwBest) {
    const postDate = new Date(otwBest.post_date + 'T12:00:00');
    // hoursAgo is relative to the video table's anchor — when comparing to
    // creator's "today" we'd get nonsensical numbers when the tables diverge.
    const hoursAgo = Math.round((videoAnchor.getTime() - postDate.getTime()) / (1000 * 60 * 60));
    oneToWatch = {
      video_id: otwBest.video_id,
      tiktok_username: otwBest.tiktok_username,
      gmv: otwBest.gmv,
      hoursAgo,
      video_url: otwBest.video_url,
    };
  }

  // Creators come pre-aggregated from the RPC (summed per handle, top 5).
  const topCreators = (agg.top_creators ?? []).map(c => ({
    tiktok_username: c.handle,
    gmv: parseFloat(String(c.gmv)) || 0,
  }));

  const yesterdayGmv = parseFloat(String(agg.yesterday_gmv ?? 0)) || 0;
  const dayBeforeGmv = parseFloat(String(agg.day_before_gmv ?? 0)) || 0;

  // Extras degrade as a unit: a failed get_daily_drop_extras omits the climber
  // and milestone sections (post still generates), never invents celebrations.
  let extras: DailyDropExtras | null = null;
  if (extrasRes.error) {
    console.error('[discord-posts] get_daily_drop_extras failed - omitting climber/milestone sections:', extrasRes.error.message);
  } else if (extrasRes.data && typeof extrasRes.data === 'object') {
    const raw = extrasRes.data as {
      milestones?: Array<{ handle?: string; threshold?: number | string }>;
      first_sales?: Array<{ handle?: string; gmv?: number | string }>;
      streak?: { handle?: string; days?: number | string } | null;
      climber?: { handle?: string; rank?: number | string; delta?: number | string; gmv?: number | string } | null;
    };
    const climber = raw.climber && raw.climber.handle
      ? {
          handle: String(raw.climber.handle),
          rank: Number(raw.climber.rank) || 0,
          delta: Number(raw.climber.delta) || 0,
          gmv: Number(raw.climber.gmv) || 0,
        }
      : null;
    extras = {
      milestones: (raw.milestones ?? [])
        .map(m => ({ handle: String(m.handle ?? ''), threshold: Number(m.threshold) || 0 }))
        .filter(m => m.handle && m.threshold > 0),
      firstSales: (raw.first_sales ?? [])
        .map(f => ({ handle: String(f.handle ?? ''), gmv: Number(f.gmv) || 0 }))
        .filter(f => f.handle),
      streak: raw.streak?.handle
        ? { handle: String(raw.streak.handle), days: Number(raw.streak.days) || 0 }
        : null,
      // The RPC guarantees delta >= 1 and rank <= 50; drop anything malformed.
      climber: climber && climber.delta > 0 && climber.rank > 0 ? climber : null,
    };
  }

  // Silent-zero rule: a failed dcs_gmv_sum must NOT post $0 MTD + bogus pacing
  // to Discord. null → the formatter omits the goal/pacing block entirely; the
  // rest of the post still generates.
  const mtdRes = mtdSumRes as { data?: number | string | null; error?: { message?: string } | null };
  let mtdGmv: number | null;
  if (mtdRes?.error) {
    console.error('[discord-posts] dcs_gmv_sum failed - omitting goal/pacing block:', mtdRes.error.message ?? mtdRes.error);
    mtdGmv = null;
  } else {
    mtdGmv = Number(mtdRes?.data ?? 0) || 0;
  }

  return {
    extras,
    yesterdayGmv,
    dayBeforeGmv,
    mtdGmv,
    monthlyGoal: goalInfo.goal,
    goalBrandCount: goalInfo.brandCount,
    yesterdayDate: yesterday,
    dayBeforeDate: dayBefore,
    videoAsOf: videoYesterday,
    productAsOf: productYesterday,
    topCreators,
    topVideos,
    topProducts,
    oneToWatch,
    discordMap,
  };
}

// ─── Discord Formatters ─────────────────────────────────────────

function getMention(handle: string, discordId: string | null, discordName: string | null): string {
  if (discordId) return `<@${discordId}>`;
  if (discordName) return `@${discordName}`;
  return `@${handle.replace('@', '')}`;
}

export function formatWhatsCookingDiscord(
  data: WhatsCookingData,
  brandName: string,
  period: '7d' | '30d'
): string {
  const today = data.endDate;
  const periodDays = period === '30d' ? 30 : 7;
  const periodStart = new Date(today);
  periodStart.setDate(today.getDate() - periodDays);

  const headerLabel = period === '30d' ? 'MONTHLY' : 'WEEKLY';
  const rangeLabel = `${periodStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${today.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

  const formatVideo = (v: VideoEntry, i: number) => {
    const handle = v.tiktok_username.replace('@', '');
    const discord = data.discordMap.get(handle.toLowerCase());
    const mention = getMention(handle, discord?.discord_id || null, discord?.discord_name || null);
    const url = v.video_id && handle
      ? `https://www.tiktok.com/@${handle}/video/${v.video_id}`
      : '';
    return url
      ? `> ${i + 1}. ${mention} — [**${formatCurrency(v.gmv)}**](${url})`
      : `> ${i + 1}. ${mention} — **${formatCurrency(v.gmv)}**`;
  };

  const subtitle = period === '30d' ? "Top performers this month" : 'Performance from the last 7 days';
  let text = `🍳 **What's Cooking?** | ${brandName} | ${headerLabel}\n`;
  text += `*${subtitle}*\n\n`;
  text += `📊 *${rangeLabel}* — **${formatCurrency(data.totalGmv)}** GMV from **${data.videoCount}** videos and **${data.creatorCount}** creators\n\n`;

  // Hot — videos posted within the most recent 7 days, regardless of period
  text += `**__🔥 HOT VIDEOS (posted last 7 days)__**\n`;
  if (data.hotVideos.length === 0) {
    text += `> No hot posts crossed the threshold yet.\n`;
  } else {
    data.hotVideos.slice(0, 10).forEach((v, i) => { text += formatVideo(v, i) + '\n'; });
  }
  text += `\n`;

  // Rising — posted 7–14 days ago and still pulling sales
  text += `**__📈 RISING (posted 7–14 days ago)__**\n`;
  if (data.risingVideos.length === 0) {
    text += `> Nothing rising in this window — keep cooking 🔥\n`;
  } else {
    data.risingVideos.slice(0, 10).forEach((v, i) => { text += formatVideo(v, i) + '\n'; });
  }
  text += `\n`;

  // All-time leaders within window — money printers regardless of post date
  text += `**__🏆 TOP PERFORMERS (highest GMV)__**\n`;
  if (data.topVideos.length === 0) {
    text += `> No standout performers yet.\n`;
  } else {
    data.topVideos.slice(0, 10).forEach((v, i) => { text += formatVideo(v, i) + '\n'; });
  }
  text += `\n@everyone`;

  return text;
}

// v3 mockup formats. Both carry rank-delta markers vs the prior same-length
// window; 'highlights' adds Rookie of the Week and So Close.

const PORTAL_RANKINGS_URL = 'https://app.tempoapp.ai/creator-dashboard/rankings';

/** Rank-delta marker: up N / down N / climbed in from 11+ / (new) / unchanged. */
function deltaMarker(
  currentRank: number,
  entry: { priorRank: number | null; priorGmv: number },
  priorRanksAvailable: boolean,
): string {
  if (!priorRanksAvailable) return '';
  if (entry.priorRank !== null) {
    const d = entry.priorRank - currentRank;
    if (d > 0) return `▲${d}`;
    if (d < 0) return `▼${Math.abs(d)}`;
    return '-';
  }
  // Not in the prior 15-row board but had prior-window sales: climbed in from
  // 16+, so they moved up AT LEAST (16 - currentRank) spots. Never faked "new".
  if (entry.priorGmv > 0) return `▲${Math.max(1, 16 - currentRank)}+`;
  return '(new)';
}

function whosCookingLabels(data: WhosCookingData, period: '7d' | '30d') {
  const end = data.endDate;
  const periodDays = period === '30d' ? 30 : 7;
  const start = new Date(end);
  start.setDate(end.getDate() - (periodDays - 1));
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return {
    rangeLabel: `${fmt(start)} – ${fmt(end)}`,
    editionLabel: period === '30d' ? 'Monthly' : `Week of ${fmt(start)}`,
    totalLabel: period === '30d' ? '30-day total' : 'Week total',
  };
}

/** Plain-text handle for Slack posts (no Discord mention markup). */
function slackHandle(handle: string): string {
  return `@${(handle || '').replace('@', '')}`;
}

function whosCookingMention(data: WhosCookingData, handle: string): string {
  const clean = (handle || '').replace('@', '');
  const d = data.discordMap.get(clean.toLowerCase());
  return getMention(clean, d?.discord_id ?? null, d?.discord_name ?? null);
}

export function formatWhosCookingDiscord(
  data: WhosCookingData,
  brandName: string,
  period: '7d' | '30d',
  format: WhosCookingFormat = 'highlights'
): string {
  const { rangeLabel, editionLabel, totalLabel } = whosCookingLabels(data, period);

  const boardLine = (c: WhosCookingEntry, i: number) => {
    const handle = c.tiktok_username.replace('@', '');
    const mention = getMention(handle, c.discord_id, c.discord_name);
    const marker = deltaMarker(i + 1, c, data.priorRanksAvailable);
    return `> ${i + 1}. ${mention} · **${formatCurrency(c.gmv)}**${marker ? `  ${marker}` : ''}\n`;
  };

  const footer = () => {
    const countPart = data.creatorCount > 0 ? ` across **${data.creatorCount}** creators` : '';
    return `\n💰 ${totalLabel}: **${formatCurrency(data.totalGmv)}**${countPart}\n`
      + `🏆 See where you rank: <${PORTAL_RANKINGS_URL}>`;
  };

  if (format === 'classic') {
    let text = `👨‍🍳 **WHO'S COOKING · THE BOARD** · ${brandName} · ${editionLabel}\n`;
    text += `*Top 10 by GMV · ${rangeLabel}*\n\n`;
    if (data.leaderboard.length === 0) {
      text += `> No creator activity in this window.\n`;
    } else {
      data.leaderboard.slice(0, 10).forEach((c, i) => { text += boardLine(c, i); });
    }
    text += footer();
    return text;
  }

  // Highlights — top 5, then Rookie of the Week, then So Close.
  let text = `👨‍🍳 **WHO'S COOKING** · ${brandName} · ${editionLabel}\n`;
  text += `*The highlight reel · ${rangeLabel}*\n\n`;

  text += `**__👑 TOP 5__**\n`;
  if (data.leaderboard.length === 0) {
    text += `> No creator activity in this window.\n`;
  } else {
    data.leaderboard.slice(0, 5).forEach((c, i) => { text += boardLine(c, i); });
  }

  if (data.rookie) {
    text += `\n**__🌱 ROOKIE OF THE WEEK__**\n`;
    text += `> ${whosCookingMention(data, data.rookie.handle)} earned **${formatCurrency(data.rookie.gmv)}** in their first 3 weeks\n`;
  }

  if (data.soClose) {
    text += `\n**__⚡ SO CLOSE__**\n`;
    text += `> ${whosCookingMention(data, data.soClose.handle)} is **${formatCurrency(data.soClose.gap)}** from the top 10. One post.\n`;
  }

  text += footer();
  return text;
}

export function formatWhosCookingSlack(
  data: WhosCookingData,
  brandName: string,
  period: '7d' | '30d',
  format: WhosCookingFormat = 'highlights'
): string {
  const { rangeLabel, editionLabel, totalLabel } = whosCookingLabels(data, period);

  const boardLine = (c: WhosCookingEntry, i: number) => {
    const marker = deltaMarker(i + 1, c, data.priorRanksAvailable);
    return `> ${i + 1}. ${slackHandle(c.tiktok_username)} · *${formatCurrency(c.gmv)}*${marker ? `  ${marker}` : ''}\n`;
  };

  const footer = () => {
    const countPart = data.creatorCount > 0 ? ` across *${data.creatorCount}* creators` : '';
    return `\n💰 ${totalLabel}: *${formatCurrency(data.totalGmv)}*${countPart}\n`
      + `🏆 See where you rank: ${PORTAL_RANKINGS_URL}`;
  };

  if (format === 'classic') {
    let text = `👨‍🍳 *WHO'S COOKING · THE BOARD* · ${brandName} · ${editionLabel}\n`;
    text += `_Top 10 by GMV · ${rangeLabel}_\n\n`;
    if (data.leaderboard.length === 0) {
      text += `> No creator activity in this window.\n`;
    } else {
      data.leaderboard.slice(0, 10).forEach((c, i) => { text += boardLine(c, i); });
    }
    text += footer();
    return text;
  }

  let text = `👨‍🍳 *WHO'S COOKING* · ${brandName} · ${editionLabel}\n`;
  text += `_The highlight reel · ${rangeLabel}_\n\n`;

  text += `*👑 TOP 5*\n`;
  if (data.leaderboard.length === 0) {
    text += `> No creator activity in this window.\n`;
  } else {
    data.leaderboard.slice(0, 5).forEach((c, i) => { text += boardLine(c, i); });
  }

  if (data.rookie) {
    text += `\n*🌱 ROOKIE OF THE WEEK*\n`;
    text += `> ${slackHandle(data.rookie.handle)} earned *${formatCurrency(data.rookie.gmv)}* in their first 3 weeks\n`;
  }

  if (data.soClose) {
    text += `\n*⚡ SO CLOSE*\n`;
    text += `> ${slackHandle(data.soClose.handle)} is *${formatCurrency(data.soClose.gap)}* from the top 10. One post.\n`;
  }

  text += footer();
  return text;
}

// ─── Daily Drop Formatter ───────────────────────────────────────

function formatCurrency(num: number): string {
  return '$' + Math.round(num || 0).toLocaleString();
}

function generateProgressBar(percent: number): string {
  const filled = Math.min(15, Math.round((percent / 100) * 15));
  const empty = 15 - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

function getTikTokUrl(creatorName: string, videoId: string): string | null {
  const handle = (creatorName || '').replace('@', '').trim();
  if (!handle || !videoId) return null;
  return `https://www.tiktok.com/@${handle}/video/${videoId}`;
}

function getDailyDropMention(handle: string, discordMap: Map<string, { discord_id: string | null; discord_name: string | null }>): string {
  const clean = handle.replace('@', '').toLowerCase();
  const discord = discordMap.get(clean);
  if (discord?.discord_id) return `<@${discord.discord_id}>`;
  return `@${handle.replace('@', '')}`;
}

// Day-over-day change suffix for the headline GMV line (platform-neutral).
function dailyDropDodChange(data: DailyDropData): string {
  if (data.dayBeforeGmv <= 0) return '';
  const changePercent = Math.round(((data.yesterdayGmv - data.dayBeforeGmv) / data.dayBeforeGmv) * 100);
  const changeArrow = changePercent >= 0 ? '↑' : '↓';
  const dayBeforeName = new Date(data.dayBeforeDate).toLocaleDateString('en-US', { weekday: 'short' });
  return ` (${changeArrow}${Math.abs(changePercent)}% vs ${dayBeforeName})`;
}

// Goal / progress / pacing numbers — only when we have BOTH a configured goal
// (brands_v2.monthly_gmv_goal) and a successful MTD read. A null goal or a
// failed dcs_gmv_sum omits the block honestly instead of posting a fabricated
// target or a fake $0 MTD. Month math anchors to the yesterday date so we
// project against the correct month even when data is stale.
function dailyDropGoalNumbers(data: DailyDropData): {
  monthName: string;
  monthlyGoal: number;
  mtdGmv: number;
  progressPercent: number;
  progressBar: string;
  onPace: boolean;
  projectedTotal: number;
  neededPerDay: number;
} | null {
  if (data.monthlyGoal === null || data.monthlyGoal <= 0 || data.mtdGmv === null) return null;
  const yesterdayDate = new Date(data.yesterdayDate);
  const mtdGmv = data.mtdGmv;
  const monthlyGoal = data.monthlyGoal;
  const progressPercent = Math.round((mtdGmv / monthlyGoal) * 100);
  const daysInMonth = new Date(yesterdayDate.getFullYear(), yesterdayDate.getMonth() + 1, 0).getDate();
  const dayOfMonth = yesterdayDate.getDate();
  const daysRemaining = daysInMonth - dayOfMonth;
  const dailyAverage = dayOfMonth > 0 ? mtdGmv / dayOfMonth : 0;
  const projectedTotal = mtdGmv + (dailyAverage * daysRemaining);
  const neededPerDay = daysRemaining > 0 ? (monthlyGoal - mtdGmv) / daysRemaining : 0;
  return {
    monthName: yesterdayDate.toLocaleDateString('en-US', { month: 'long' }).toUpperCase(),
    monthlyGoal,
    mtdGmv,
    progressPercent,
    progressBar: generateProgressBar(progressPercent),
    onPace: projectedTotal >= monthlyGoal,
    projectedTotal,
    neededPerDay,
  };
}

// Climber + milestone lines shared by the Discord and Slack variants; only the
// mention and bold renderers differ per platform.
function dailyDropClimberLine(
  climber: NonNullable<DailyDropExtras['climber']>,
  mention: (handle: string) => string,
  bold: (s: string) => string,
): string {
  const noun = climber.delta === 1 ? 'spot' : 'spots';
  return `> 🚀 ${mention(climber.handle)} jumped UP ${bold(String(climber.delta))} ${noun} to ${bold(`#${climber.rank}`)} with ${bold(formatCurrency(climber.gmv))} yesterday`;
}

function dailyDropMilestoneLines(
  extras: DailyDropExtras | null,
  mention: (handle: string) => string,
  bold: (s: string) => string,
): string[] {
  if (!extras) return [];
  const lines: string[] = [];
  extras.milestones.forEach((m) => {
    lines.push(`> 💰 ${mention(m.handle)} just crossed ${bold('$' + m.threshold.toLocaleString())} lifetime`);
  });
  if (extras.streak) {
    // The RPC only looks back 60 days — a 60-day run means "60 or more".
    const days = extras.streak.days >= 60 ? '60+ day' : `${extras.streak.days}-day`;
    lines.push(`> 🔥 ${mention(extras.streak.handle)} is on a ${bold(days)} posting streak`);
  }
  extras.firstSales.slice(0, 3).forEach((f) => {
    lines.push(`> 🎊 FIRST SALE: ${mention(f.handle)} is on the board. Welcome.`);
  });
  return lines;
}

export function formatDailyDropDiscord(data: DailyDropData, brandName: string): string {
  const yesterdayDate = new Date(data.yesterdayDate);
  const dateFull = yesterdayDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const dodChange = dailyDropDodChange(data);
  const mention = (handle: string) => getDailyDropMention(handle, data.discordMap);
  const bold = (s: string) => `**${s}**`;

  const goal = dailyDropGoalNumbers(data);
  let goalBlock = '';
  if (goal) {
    const pacingNote = goal.onPace
      ? `📈 On pace to hit **${formatCurrency(goal.projectedTotal)}** by month end`
      : `⚡ Need **${formatCurrency(goal.neededPerDay)}/day** to hit goal`;
    const goalScope = data.goalBrandCount > 1
      ? ` _(across ${data.goalBrandCount} brands with goals set)_`
      : '';
    goalBlock = `📊 ${goal.monthName} GOAL: **${formatCurrency(goal.monthlyGoal)}**${goalScope}\n`
      + `🔥 PROGRESS: ${goal.progressBar} **${goal.progressPercent}%** (${formatCurrency(goal.mtdGmv)})\n`
      + `${pacingNote}\n`;
  }

  const DIV = `━━━━━━━━━━━━━━━━━━━━━━━━`;

  // Header — brand kept in the title; old divider framing restored.
  let msg = `# 📈 DAILY DROP | ${brandName} | ${dateFull}\n\n`;
  msg += `${DIV}\n\n`;
  msg += `💰 YESTERDAY'S GMV: **${formatCurrency(data.yesterdayGmv)}**${dodChange}\n`;
  msg += goalBlock;
  msg += `\n${DIV}\n\n`;

  // Top 3 Creators — mentions via the Discord map (falls back to @handle).
  msg += `**__👑 TOP 3 CREATORS (Yesterday)__**\n`;
  if (data.topCreators.length === 0) {
    msg += `> No creator data available\n`;
  } else {
    data.topCreators.slice(0, 3).forEach((c, i) => {
      msg += `> ${i + 1}. ${mention(c.tiktok_username || '')} · **${formatCurrency(c.gmv)}**\n`;
    });
  }

  // Biggest Climber — from get_daily_drop_extras; omitted when null.
  if (data.extras?.climber) {
    msg += `\n**__🚀 BIGGEST CLIMBER__**\n`;
    msg += dailyDropClimberLine(data.extras.climber, mention, bold) + '\n';
  }
  msg += `\n${DIV}\n\n`;

  // Top 5 Videos — use markdown links rather than naked URLs.
  // Label the section's "as of" date when video data lags creator data.
  const videoAsOfStr = data.videoAsOf.toISOString().slice(0, 10);
  const yesterdayStr2 = yesterdayDate.toISOString().slice(0, 10);
  const videoStaleLabel = videoAsOfStr !== yesterdayStr2
    ? ` _(as of ${data.videoAsOf.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})_`
    : '';
  msg += `**__🎬 TOP 5 VIDEOS (Yesterday)__**${videoStaleLabel}\n`;
  if (data.topVideos.length === 0) {
    msg += `> No video data available\n`;
  } else {
    data.topVideos.slice(0, 5).forEach((v, i) => {
      const handle = (v.tiktok_username || '').replace('@', '');
      const url = v.video_url || getTikTokUrl(v.tiktok_username, v.video_id);
      if (url) {
        msg += `> ${i + 1}. [@${handle}](${url}) · **${formatCurrency(v.gmv)}**\n`;
      } else {
        msg += `> ${i + 1}. @${handle} · **${formatCurrency(v.gmv)}**\n`;
      }
    });
  }
  msg += `\n${DIV}\n\n`;

  // Top 5 Products — label the section's "as of" date when product data lags.
  const productAsOfStr = data.productAsOf.toISOString().slice(0, 10);
  const productStaleLabel = productAsOfStr !== yesterdayStr2
    ? ` _(as of ${data.productAsOf.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})_`
    : '';
  msg += `**__📦 TOP 5 PRODUCTS (Yesterday)__**${productStaleLabel}\n`;
  if (data.topProducts.length === 0) {
    msg += `> No product data available\n`;
  } else {
    data.topProducts.slice(0, 5).forEach((p, i) => {
      msg += `> ${i + 1}. ${p.name} · **${formatCurrency(p.gmv)}**\n`;
    });
  }
  msg += `\n${DIV}\n\n`;

  // One to Watch — two-line narrative with the naked link (Discord shows a preview)
  msg += `**__👀 ONE TO WATCH__**\n`;
  if (data.oneToWatch) {
    const handle = (data.oneToWatch.tiktok_username || '').replace('@', '');
    const url = data.oneToWatch.video_url
      || getTikTokUrl(data.oneToWatch.tiktok_username, data.oneToWatch.video_id);
    msg += `> @${handle} · ${url || 'Link unavailable'}\n`;
    msg += `> Posted ${data.oneToWatch.hoursAgo} hours ago. Already at **${formatCurrency(data.oneToWatch.gmv)}** and climbing.\n`;
  } else {
    msg += `> No trending videos to highlight today.\n`;
  }
  msg += `\n${DIV}\n\n`;

  // Milestones — crossings, streak, first sales; whole section omitted when
  // everything is empty (or the extras RPC failed).
  const milestones = dailyDropMilestoneLines(data.extras, mention, bold);
  if (milestones.length > 0) {
    msg += `**__🎉 MILESTONES__**\n`;
    msg += milestones.join('\n') + '\n';
    msg += `\n${DIV}\n\n`;
  }

  msg += `🏆 See where you rank: <${PORTAL_RANKINGS_URL}>\n`;
  msg += `Let's get it today. 🔥`;

  return msg;
}

export function formatDailyDropSlack(data: DailyDropData, brandName: string): string {
  const yesterdayDate = new Date(data.yesterdayDate);
  const dateFull = yesterdayDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const dodChange = dailyDropDodChange(data);
  const mention = (handle: string) => slackHandle(handle);
  const bold = (s: string) => `*${s}*`;

  let msg = `📈 *DAILY DROP · ${brandName} · ${dateFull}*\n\n`;
  msg += `💰 YESTERDAY'S GMV: *${formatCurrency(data.yesterdayGmv)}*${dodChange}\n`;

  const goal = dailyDropGoalNumbers(data);
  if (goal) {
    const pacingNote = goal.onPace
      ? `📈 On pace to hit *${formatCurrency(goal.projectedTotal)}* by month end`
      : `⚡ Need *${formatCurrency(goal.neededPerDay)}/day* to hit goal`;
    const goalScope = data.goalBrandCount > 1
      ? ` (across ${data.goalBrandCount} brands with goals set)`
      : '';
    msg += `📊 ${goal.monthName} GOAL: *${formatCurrency(goal.monthlyGoal)}*${goalScope}\n`;
    msg += `🔥 PROGRESS: ${goal.progressBar} *${goal.progressPercent}%* (${formatCurrency(goal.mtdGmv)})\n`;
    msg += `${pacingNote}\n`;
  }
  msg += `\n`;

  msg += `*👑 TOP 3 CREATORS (Yesterday)*\n`;
  if (data.topCreators.length === 0) {
    msg += `> No creator data available\n`;
  } else {
    data.topCreators.slice(0, 3).forEach((c, i) => {
      msg += `> ${i + 1}. ${mention(c.tiktok_username || '')} · *${formatCurrency(c.gmv)}*\n`;
    });
  }

  if (data.extras?.climber) {
    msg += `\n*🚀 BIGGEST CLIMBER*\n`;
    msg += dailyDropClimberLine(data.extras.climber, mention, bold) + '\n';
  }
  msg += `\n`;

  const videoAsOfStr = data.videoAsOf.toISOString().slice(0, 10);
  const yesterdayStr2 = yesterdayDate.toISOString().slice(0, 10);
  const videoStaleLabel = videoAsOfStr !== yesterdayStr2
    ? ` (as of ${data.videoAsOf.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})`
    : '';
  msg += `*🎬 TOP 5 VIDEOS (Yesterday)*${videoStaleLabel}\n`;
  if (data.topVideos.length === 0) {
    msg += `> No video data available\n`;
  } else {
    data.topVideos.slice(0, 5).forEach((v, i) => {
      const handle = (v.tiktok_username || '').replace('@', '');
      const url = v.video_url || getTikTokUrl(v.tiktok_username, v.video_id);
      // Slack link syntax: <url|label>
      const who = url ? `<${url}|@${handle}>` : `@${handle}`;
      msg += `> ${i + 1}. ${who} · *${formatCurrency(v.gmv)}*\n`;
    });
  }
  msg += `\n`;

  const productAsOfStr = data.productAsOf.toISOString().slice(0, 10);
  const productStaleLabel = productAsOfStr !== yesterdayStr2
    ? ` (as of ${data.productAsOf.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})`
    : '';
  msg += `*📦 TOP 5 PRODUCTS (Yesterday)*${productStaleLabel}\n`;
  if (data.topProducts.length === 0) {
    msg += `> No product data available\n`;
  } else {
    data.topProducts.slice(0, 5).forEach((p, i) => {
      msg += `> ${i + 1}. ${p.name} · *${formatCurrency(p.gmv)}*\n`;
    });
  }
  msg += `\n`;

  msg += `*👀 ONE TO WATCH*\n`;
  if (data.oneToWatch) {
    const handle = (data.oneToWatch.tiktok_username || '').replace('@', '');
    const url = data.oneToWatch.video_url
      || getTikTokUrl(data.oneToWatch.tiktok_username, data.oneToWatch.video_id);
    msg += `> @${handle} · ${url || 'Link unavailable'}\n`;
    msg += `> Posted ${data.oneToWatch.hoursAgo} hours ago. Already at *${formatCurrency(data.oneToWatch.gmv)}* and climbing.\n`;
  } else {
    msg += `> No trending videos to highlight today.\n`;
  }

  const milestones = dailyDropMilestoneLines(data.extras, mention, bold);
  if (milestones.length > 0) {
    msg += `\n*🎉 MILESTONES*\n`;
    msg += milestones.join('\n') + '\n';
  }

  msg += `\n🏆 See where you rank: ${PORTAL_RANKINGS_URL}\n`;
  msg += `Let's get it today. 🔥`;

  return msg;
}

