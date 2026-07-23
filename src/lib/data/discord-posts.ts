import { createClient } from '@/lib/supabase/server';
import { getBrandRegistry, resolveUuids, expandSlugs } from '@/lib/data/brand-registry';

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

export interface WhosCookingData {
  leaderboard: (CreatorEntry & { breakoutPct: number; priorGmv: number; daysPosted: number })[];
  mostProlific: (CreatorEntry & { daysPosted: number }) | null;
  ironChef: (CreatorEntry & { daysPosted: number }) | null;
  breakoutStar: (CreatorEntry & { breakoutPct: number; priorGmv: number }) | null;
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
      const row = reg.bySlug.get(brandFilter);
      // Include the parent umbrella slug when a store slug was selected —
      // roster rows live at the umbrella grain.
      const parentSlug = row?.parent_brand_id ? reg.byId.get(row.parent_brand_id)?.slug : undefined;
      mcBrands = parentSlug ? [brandFilter, parentSlug] : [brandFilter];
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
  const supabase = await createClient();
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
  const supabase = await createClient();
  const brandUuids = await getBrandUuids(supabase, brandFilter);

  const today = await resolveAnchorToday(supabase, brandUuids);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const endDate = formatDate(yesterday);

  let currentStart: string;
  let priorStart: string;
  let priorEnd: string;

  if (period === '30d') {
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(today.getDate() - 30);
    const sixtyDaysAgo = new Date(today);
    sixtyDaysAgo.setDate(today.getDate() - 60);

    currentStart = formatDate(thirtyDaysAgo);
    priorStart = formatDate(sixtyDaysAgo);
    priorEnd = formatDate(thirtyDaysAgo);
  } else {
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 7);
    const fourteenDaysAgo = new Date(today);
    fourteenDaysAgo.setDate(today.getDate() - 14);

    currentStart = formatDate(sevenDaysAgo);
    priorStart = formatDate(fourteenDaysAgo);
    priorEnd = formatDate(sevenDaysAgo);
  }

  const ironChefMinDays = period === '30d' ? 20 : 5;

  // Aggregation runs in Postgres (whos_cooking_agg): leaderboard (top 10), the
  // three shoutout candidates, and totals — NOT the full current+prior window of
  // creator-day rows, which for a high-volume / umbrella / all-brands selection
  // timed the function out.
  const { data: agg, error } = await supabase.rpc('whos_cooking_agg', {
    p_brand_ids: brandUuids,
    p_current_start: currentStart,
    p_end: endDate,
    p_prior_start: priorStart,
    p_prior_end: priorEnd,
    p_iron_chef_min: ironChefMinDays,
  });
  if (error) throw error;
  const a = (agg ?? {}) as {
    totalGmv?: number; creatorCount?: number; videoCount?: number;
    leaderboard?: any[]; mostProlific?: any; ironChef?: any; breakoutStar?: any;
  };

  // Discord mention map stays in JS — it isn't brand-volume-dependent. Attach
  // the mention id/name to each creator by handle.
  const discordMap = await getDiscordMap(supabase, brandFilter);
  const attach = (c: any) => {
    const handle = (c.tiktok_username || '').toLowerCase().replace('@', '');
    const d = discordMap.get(handle);
    return {
      tiktok_username: c.tiktok_username,
      gmv: Number(c.gmv) || 0,
      orders: Number(c.orders) || 0,
      items_sold: Number(c.items_sold) || 0,
      videos: Number(c.videos) || 0,
      brand_id: c.brand_id,
      discord_id: d?.discord_id ?? null,
      discord_name: d?.discord_name ?? null,
      daysPosted: Number(c.daysPosted) || 0,
      priorGmv: Number(c.priorGmv) || 0,
      breakoutPct: Number(c.breakoutPct) || 0,
    };
  };

  return {
    leaderboard: (a.leaderboard ?? []).map(attach),
    mostProlific: a.mostProlific ? attach(a.mostProlific) : null,
    ironChef: a.ironChef ? attach(a.ironChef) : null,
    breakoutStar: a.breakoutStar ? attach(a.breakoutStar) : null,
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

export interface DailyDropData {
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
  const supabase = await createClient();
  const reg = await getBrandRegistry();
  const brandUuids = brandFilter && brandFilter !== 'all' ? resolveUuids(reg, brandFilter) : null;
  // video_performance is keyed by brand SLUG (store grain) — umbrellas expand.
  const vpBrandSlugs = brandFilter && brandFilter !== 'all' ? expandSlugs(reg, brandFilter) : null;

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

  const [aggRes, mtdSumRes, vpRes, goalInfo, discordMap] = await Promise.all([
    supabase.rpc('get_daily_drop_agg', {
      p_brand_ids: brandUuids,
      p_yesterday: yesterdayStr,
      p_day_before: dayBeforeStr,
      p_product_day: productYesterdayStr,
    }),
    supabase.rpc('dcs_gmv_sum', { p_brand_ids: brandUuids, p_start: monthStartStr, p_end: yesterdayStr }),
    vpQuery,
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

function formatGmv(gmv: number): string {
  return gmv % 1 === 0
    ? gmv.toLocaleString()
    : gmv.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

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

export function formatWhosCookingDiscord(
  data: WhosCookingData,
  brandName: string,
  period: '7d' | '30d'
): string {
  const today = data.endDate;
  const periodDays = period === '30d' ? 30 : 7;
  const periodStart = new Date(today);
  periodStart.setDate(today.getDate() - periodDays);

  const headerLabel = period === '30d' ? 'MONTHLY' : 'WEEKLY';
  const rangeLabel = `${periodStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${today.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  const comparisonLabel = period === '30d' ? 'vs last month' : 'vs last week';
  const totalDays = period === '30d' ? 30 : 7;

  const subtitle = period === '30d' ? 'Top performers this month' : 'Top performers from the last 7 days';
  let text = `👨‍🍳 **Who's Cooking?** | ${brandName} | ${headerLabel}\n`;
  text += `*${subtitle}*\n\n`;
  text += `📊 *${rangeLabel}* — **${formatCurrency(data.totalGmv)}** GMV across **${data.creatorCount}** creators (${data.videoCount} videos)\n\n`;

  // Leaderboard — top 10 with podium medals on first three
  text += `**__👑 LEADERBOARD__**\n`;
  if (data.leaderboard.length === 0) {
    text += `> No creator activity in this window.\n`;
  } else {
    data.leaderboard.forEach((c, i) => {
      const medal = i === 0 ? ' 🥇' : i === 1 ? ' 🥈' : i === 2 ? ' 🥉' : '';
      const handle = c.tiktok_username.replace('@', '');
      const tiktokUrl = `https://www.tiktok.com/@${handle}`;
      const mention = getMention(handle, c.discord_id, c.discord_name);
      text += `> ${i + 1}. ${mention} — [**${formatCurrency(c.gmv)}**](${tiktokUrl})${medal}\n`;
    });
  }

  // Special Shoutouts — only if we have at least one to surface
  const shoutouts: string[] = [];
  if (data.mostProlific && data.mostProlific.videos >= 3) {
    const m = data.mostProlific;
    const mention = getMention(m.tiktok_username.replace('@', ''), m.discord_id, m.discord_name);
    shoutouts.push(`> 🎬 **Most Prolific**: ${mention} dropped **${m.videos}** videos this ${period === '30d' ? 'month' : 'week'}!`);
  }
  if (data.ironChef) {
    const ic = data.ironChef;
    const mention = getMention(ic.tiktok_username.replace('@', ''), ic.discord_id, ic.discord_name);
    const dayText = ic.daysPosted >= totalDays ? '**every single day**' : `**${ic.daysPosted} of ${totalDays}** days`;
    shoutouts.push(`> 📅 **Iron Chef**: ${mention} posted ${dayText}!`);
  }
  if (data.breakoutStar) {
    const bs = data.breakoutStar;
    const mention = getMention(bs.tiktok_username.replace('@', ''), bs.discord_id, bs.discord_name);
    shoutouts.push(`> 📈 **Breakout Star**: ${mention} up **${Math.round(bs.breakoutPct)}%** ${comparisonLabel}!`);
  }

  if (shoutouts.length > 0) {
    text += `\n**__⭐ SPECIAL SHOUTOUTS__**\n`;
    text += shoutouts.join('\n') + '\n';
  }

  text += `\n@everyone`;
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

export function formatDailyDropDiscord(data: DailyDropData, brandName: string): string {
  const yesterdayDate = new Date(data.yesterdayDate);
  const dateFull = yesterdayDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const monthName = yesterdayDate.toLocaleDateString('en-US', { month: 'long' }).toUpperCase();

  // Day-over-day change
  let dodChange = '';
  if (data.dayBeforeGmv > 0) {
    const changePercent = Math.round(((data.yesterdayGmv - data.dayBeforeGmv) / data.dayBeforeGmv) * 100);
    const changeArrow = changePercent >= 0 ? '↑' : '↓';
    const dayBeforeName = new Date(data.dayBeforeDate).toLocaleDateString('en-US', { weekday: 'short' });
    dodChange = ` (${changeArrow}${Math.abs(changePercent)}% vs ${dayBeforeName})`;
  }

  // Goal / progress / pacing block — only when we have BOTH a configured goal
  // (brands_v2.monthly_gmv_goal) and a successful MTD read. A null goal or a
  // failed dcs_gmv_sum omits the block honestly instead of posting a fabricated
  // target or a fake $0 MTD.
  let goalBlock = '';
  if (data.monthlyGoal !== null && data.monthlyGoal > 0 && data.mtdGmv !== null) {
    const mtdGmv = data.mtdGmv;
    const monthlyGoal = data.monthlyGoal;
    const progressPercent = Math.round((mtdGmv / monthlyGoal) * 100);
    const progressBar = generateProgressBar(progressPercent);

    // Goal pacing — anchor month math to the yesterday date so we project against
    // the correct month even when data is stale (otherwise we'd compare MTD against
    // the wrong month's day count)
    const daysInMonth = new Date(yesterdayDate.getFullYear(), yesterdayDate.getMonth() + 1, 0).getDate();
    const dayOfMonth = yesterdayDate.getDate();
    const daysRemaining = daysInMonth - dayOfMonth;
    const dailyAverage = dayOfMonth > 0 ? mtdGmv / dayOfMonth : 0;
    const projectedTotal = mtdGmv + (dailyAverage * daysRemaining);
    let pacingNote = '';
    if (projectedTotal >= monthlyGoal) {
      pacingNote = `📈 On pace to hit **${formatCurrency(projectedTotal)}** by month end`;
    } else {
      const neededPerDay = daysRemaining > 0 ? (monthlyGoal - mtdGmv) / daysRemaining : 0;
      pacingNote = `⚡ Need **${formatCurrency(neededPerDay)}/day** to hit goal`;
    }

    const goalScope = data.goalBrandCount > 1
      ? ` _(across ${data.goalBrandCount} brands with goals set)_`
      : '';
    goalBlock = `📊 ${monthName} GOAL: **${formatCurrency(monthlyGoal)}**${goalScope}\n`
      + `🔥 PROGRESS: ${progressBar} **${progressPercent}%** (${formatCurrency(mtdGmv)})\n`
      + `${pacingNote}\n`;
  }

  const DIV = `━━━━━━━━━━━━━━━━━━━━━━━━`;

  // Header — brand kept in the title; old divider framing restored.
  let msg = `# 📈 DAILY DROP | ${brandName} | ${dateFull}\n\n`;
  msg += `${DIV}\n\n`;
  msg += `💰 YESTERDAY'S GMV: **${formatCurrency(data.yesterdayGmv)}**${dodChange}\n`;
  msg += goalBlock;
  msg += `\n${DIV}\n\n`;

  // Top 5 Creators — @handle linked to their TikTok profile (clean, no mass-ping)
  msg += `**__👑 TOP 5 CREATORS (Yesterday)__**\n`;
  if (data.topCreators.length === 0) {
    msg += `> No creator data available\n`;
  } else {
    data.topCreators.slice(0, 5).forEach((c, i) => {
      const handle = (c.tiktok_username || '').replace('@', '');
      msg += `> ${i + 1}. [@${handle}](https://www.tiktok.com/@${handle}) — **${formatCurrency(c.gmv)}**\n`;
    });
  }
  msg += `\n━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

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
        msg += `> ${i + 1}. [@${handle}](${url}) — **${formatCurrency(v.gmv)}**\n`;
      } else {
        msg += `> ${i + 1}. @${handle} — **${formatCurrency(v.gmv)}**\n`;
      }
    });
  }
  msg += `\n━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

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
      msg += `> ${i + 1}. ${p.name} — **${formatCurrency(p.gmv)}**\n`;
    });
  }
  msg += `\n━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  // One to Watch — two-line narrative with the naked link (Discord shows a preview)
  msg += `**__👀 ONE TO WATCH__**\n`;
  if (data.oneToWatch) {
    const handle = (data.oneToWatch.tiktok_username || '').replace('@', '');
    const url = data.oneToWatch.video_url
      || getTikTokUrl(data.oneToWatch.tiktok_username, data.oneToWatch.video_id);
    msg += `> @${handle} — ${url || 'Link unavailable'}\n`;
    msg += `> Posted ${data.oneToWatch.hoursAgo} hours ago. Already at **${formatCurrency(data.oneToWatch.gmv)}** and climbing.\n`;
  } else {
    msg += `> No trending videos to highlight today.\n`;
  }

  msg += `\n${DIV}\n\n`;
  msg += `Let's get it today. 🔥`;

  return msg;
}

