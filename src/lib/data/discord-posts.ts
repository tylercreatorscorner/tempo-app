import { createAdminClient, createClient } from '@/lib/supabase/server';
import { getBrandRegistry, resolveUuids, expandSlugs, type BrandRegistry } from '@/lib/data/brand-registry';
import { canonicalVideoUrl } from '@/lib/utils/format';

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

// ─── Biggest Movers ─────────────────────────────────────────────────────
//
// Ranked by GROWTH, not absolute GMV. That is the entire point: What's Cooking
// and Who's Cooking both rank by absolute GMV, so the same ten names win every
// week and the drop reads stale. Changing the ranking function is what makes a
// different set of people winnable.

export interface MoversEntry {
  tiktok_username: string;
  gmv: number;
  priorGmv: number;
  delta: number;
  growthPct: number;
  discord_id: string | null;
  discord_name: string | null;
}

export interface MoversData {
  movers: MoversEntry[];
  /** How many creators cleared the floors — the pool the top N came from. */
  eligibleCount: number;
  /** Every creator with GMV in the window, floors ignored. Context for the above. */
  poolCount: number;
  discordMap: Map<string, { discord_id: string | null; discord_name: string | null }>;
  endDate: Date;
  periodDays: number;
}

// ─── Month-to-date leaderboard ──────────────────────────────────────────

export interface MtdEntry {
  tiktok_username: string;
  gmv: number;
  orders: number;
  videos: number;
  rank: number;
  /** Rank at the SAME POINT of the previous month, or null if absent then. */
  prevRank: number | null;
  /** Positive = climbed. null when there is no prior rank to compare. */
  rankDelta: number | null;
  discord_id: string | null;
  discord_name: string | null;
}

export interface MtdData {
  leaderboard: MtdEntry[];
  totalGmv: number;
  prevGmv: number;
  creatorCount: number;
  videoCount: number;
  monthLabel: string;
  daysElapsed: number;
  daysInMonth: number;
  discordMap: Map<string, { discord_id: string | null; discord_name: string | null }>;
  endDate: Date;
}

// ─── Rookie Watch ───────────────────────────────────────────────────────
//
// Can only be won by someone new, which is the point — the flagship formats
// rank by absolute GMV and the same ten creators take every board.
//
// ROSTER-SCOPED, unlike get_roster_rookie (mig 097) which backs Who's Cooking:
// roster_creator_daily carries 402,061 handles, ~1,066 of whom are under
// contract. Congratulating an affiliate who has never been in the server is
// worse than posting nothing.

export interface RookieEntry {
  handle: string;
  gmv: number;
  firstActive: string;
  daysSinceFirst: number;
  daysActive: number;
  discord_id: string | null;
  discord_name: string | null;
}

export interface RookieData {
  rookies: RookieEntry[];
  rookieCount: number;
  maxAgeDays: number;
  discordMap: Map<string, { discord_id: string | null; discord_name: string | null }>;
  endDate: Date;
}

// ─── Milestones ─────────────────────────────────────────────────────────
//
// Reaches most of the roster over time, so it is the best antidote to "the
// same ten people win everything". Backed by creator_milestones (mig 035),
// reused rather than rebuilt — a second milestones table would give the
// concept two sources of truth.

export interface MilestoneEntry {
  handle: string;
  brandSlug: string;
  threshold: number;
  valueAt: number;
  achievedOn: string;
  discord_id: string | null;
  discord_name: string | null;
}

export interface MilestoneData {
  milestones: MilestoneEntry[];
  sinceDays: number;
  discordMap: Map<string, { discord_id: string | null; discord_name: string | null }>;
  endDate: Date;
}

// ─── What's Cooking Data ────────────────────────────────────────

// ─── Custom windows ─────────────────────────────────────────────
//
// The period-based generators all derive their dates the same way: resolve an
// anchor `today` from the data, then walk back `periodDays` for the start and
// one day for the end. So a custom range needs no new date math anywhere —
// synthesise a `today` one day AFTER the range ends, and every existing
// `today - periodDays` / `today - 1` expression lands exactly on the range.
//
// Only formats whose window is a free choice accept one. Daily Drop is
// yesterday, Month to Date is a calendar month, and Milestones is "recently
// crossed" — a range would be meaningless for those three, so they don't take
// one and the UI labels their own window instead.

/** Inclusive yyyy-mm-dd range. */
export interface DropWindow {
  start: string;
  end: string;
}

function windowToAnchor(w: DropWindow): { today: Date; periodDays: number } {
  const start = new Date(w.start + 'T12:00:00Z');
  const end = new Date(w.end + 'T12:00:00Z');
  const periodDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
  const today = new Date(end);
  today.setDate(end.getDate() + 1);
  return { today, periodDays };
}

/**
 * Window copy for the four formats that accept a custom range.
 *
 * WARNING: `period` IS NOT THE WINDOW. Every one of these formatters used to
 * rebuild its own date range from the preset alone:
 *
 *     const periodDays = period === '30d' ? 30 : 7;
 *     periodStart.setDate(today.getDate() - periodDays);
 *
 * The route collapses a custom range onto the NEARER preset so the sub-tier
 * thresholds inside the generators still branch sensibly
 * (`days >= 20 ? '30d' : '7d'` in /api/drops), which means a custom Aug 1-18
 * arrives here as '7d'. The data was correct for Aug 1-18 and the header said
 * "WEEKLY, Aug 13 to Aug 20". Right numbers under a wrong date is worse than
 * being visibly broken, because it is postable to Discord without anyone
 * noticing.
 *
 * `endDate` is the generator's own last day of data, so it stays the anchor
 * for the preset path and nothing about preset output changes.
 */
function dropWindowLabels(endDate: Date, period: '7d' | '30d', window?: DropWindow) {
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  if (window) {
    const start = new Date(window.start + 'T12:00:00Z');
    const end = new Date(window.end + 'T12:00:00Z');
    const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
    const range = `${fmt(start)} to ${fmt(end)}`;
    return {
      days,
      isCustom: true,
      /** Uppercase banner slot. */
      headerLabel: range.toUpperCase(),
      /** Sentence-case edition slot. */
      editionLabel: range,
      /** The dated range itself. */
      rangeLabel: range,
      totalLabel: `${days}-day total`,
      /** Reads inside a sentence: "No creator produced <inPhrase>." */
      inPhrase: `between ${fmt(start)} and ${fmt(end)}`,
      comparisonLabel: `${range} vs the ${days} days before`,
    };
  }

  const days = period === '30d' ? 30 : 7;
  const start = new Date(endDate);
  start.setDate(endDate.getDate() - (days - 1));
  return {
    days,
    isCustom: false,
    headerLabel: period === '30d' ? 'MONTHLY' : 'WEEKLY',
    editionLabel: period === '30d' ? 'Monthly' : `Week of ${fmt(start)}`,
    rangeLabel: `${fmt(start)} to ${fmt(endDate)}`,
    totalLabel: period === '30d' ? '30-day total' : 'Week total',
    inPhrase: period === '30d' ? 'in the last 30 days' : 'in the last 7 days',
    comparisonLabel: period === '30d'
      ? 'last 30 days vs the 30 before'
      : 'last 7 days vs the 7 before',
  };
}

export async function getWhatsCookingData(
  brandFilter: string,
  period: '7d' | '30d',
  window?: DropWindow,
): Promise<WhatsCookingData> {
  // Service-role client: the cron schedule runner calls this with NO session
  // (cookie client = anon), and the admin/manager-only RPCs are being revoked
  // from anon (mig 100). Authz lives in the callers: /api/drops scope-guards
  // the requester, /api/cron/run-schedules is secret-gated.
  const supabase = await createAdminClient();
  const brandUuids = await getBrandUuids(supabase, brandFilter);

  // What's Cooking queries daily_video_stats — anchor to that table specifically
  // so we always show the most recent video data we have (may lag creator data).
  const wcAnchor = window ? windowToAnchor(window) : null;
  const today = wcAnchor ? wcAnchor.today : await resolveAnchorToday(supabase, brandUuids, 'daily_video_product_stats');
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  let hotStartDate: string;
  let risingStartDate: string;
  let risingEndDate: string;
  let fullStartDate: string;
  const endDate = formatDate(yesterday);

  if (wcAnchor) {
    // Custom range: "Top" covers the whole range the operator picked, while
    // Hot/Rising keep their 7-day and 7-to-14-day meaning inside it.
    const rangeStart = new Date(today);
    rangeStart.setDate(today.getDate() - wcAnchor.periodDays);
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 7);
    const fourteenDaysAgo = new Date(today);
    fourteenDaysAgo.setDate(today.getDate() - 14);

    fullStartDate = formatDate(rangeStart);
    // Never let the sub-tiers reach outside the chosen range.
    hotStartDate = formatDate(sevenDaysAgo < rangeStart ? rangeStart : sevenDaysAgo);
    risingStartDate = formatDate(fourteenDaysAgo < rangeStart ? rangeStart : fourteenDaysAgo);
    risingEndDate = hotStartDate;
  } else if (period === '30d') {
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

export async function getWhosCookingData(
  brandFilter: string,
  period: '7d' | '30d',
  window?: DropWindow,
): Promise<WhosCookingData> {
  // Service-role client — see getWhatsCookingData; whos_cooking_agg_v2 and
  // get_roster_rookie are anon-revoked and the cron path has no session.
  const supabase = await createAdminClient();
  const reg = await getBrandRegistry();
  const brandUuids = brandFilter && brandFilter !== 'all' ? resolveUuids(reg, brandFilter) : null;

  const anchor = window ? windowToAnchor(window) : null;
  const today = anchor ? anchor.today : await resolveAnchorToday(supabase, brandUuids);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const endDate = formatDate(yesterday);

  const periodDays = anchor ? anchor.periodDays : (period === '30d' ? 30 : 7);

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

  // Driven off periodDays so a custom range scales too. Reproduces the old
  // rule exactly at the presets: 30d -> 20, 7d -> 5.
  const ironChefMinDays = periodDays >= 20 ? 20 : 5;
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

// ─── Biggest Movers Data ────────────────────────────────────────

export async function getMoversData(
  brandFilter: string,
  period: '7d' | '30d',
  window?: DropWindow,
): Promise<MoversData> {
  // Service-role: get_creator_movers is anon-revoked (mig 126) and the cron
  // path has no session — same reasoning as getWhosCookingData.
  const supabase = await createAdminClient();
  const reg = await getBrandRegistry();
  const brandUuids = brandFilter && brandFilter !== 'all' ? resolveUuids(reg, brandFilter) : null;

  const anchor = window ? windowToAnchor(window) : null;
  const today = anchor ? anchor.today : await resolveAnchorToday(supabase, brandUuids);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const periodDays = anchor ? anchor.periodDays : (period === '30d' ? 30 : 7);
  const curStart = new Date(today); curStart.setDate(today.getDate() - periodDays);
  const priStart = new Date(today); priStart.setDate(today.getDate() - periodDays * 2);

  const [res, discordMap] = await Promise.all([
    supabase.rpc('get_creator_movers', {
      p_brand_ids: brandUuids,
      p_current_start: formatDate(curStart),
      p_end: formatDate(yesterday),
      p_prior_start: formatDate(priStart),
      p_prior_end: formatDate(curStart),   // half-open, matches whos_cooking_agg_v2
      p_min_prior: 250,
      p_min_current: 500,
      p_limit: 10,
    }),
    getDiscordMap(supabase, brandFilter),
  ]);
  if (res.error) throw res.error;

  const raw = (res.data ?? {}) as {
    movers?: { tiktok_username?: string; gmv?: number | string; priorGmv?: number | string;
               delta?: number | string; growthPct?: number | string }[];
    eligibleCount?: number; poolCount?: number;
  };

  const movers: MoversEntry[] = (raw.movers ?? []).map((m) => {
    const handle = (m.tiktok_username || '').toLowerCase().replace('@', '');
    const d = discordMap.get(handle);
    return {
      tiktok_username: m.tiktok_username ?? '',
      gmv: Number(m.gmv) || 0,
      priorGmv: Number(m.priorGmv) || 0,
      delta: Number(m.delta) || 0,
      growthPct: Number(m.growthPct) || 0,
      discord_id: d?.discord_id ?? null,
      discord_name: d?.discord_name ?? null,
    };
  });

  return {
    movers,
    eligibleCount: Number(raw.eligibleCount ?? 0),
    poolCount: Number(raw.poolCount ?? 0),
    discordMap,
    endDate: yesterday,
    periodDays,
  };
}

// ─── Month-to-Date Data ─────────────────────────────────────────

export async function getMtdData(brandFilter: string): Promise<MtdData> {
  const supabase = await createAdminClient();
  const reg = await getBrandRegistry();
  const brandUuids = brandFilter && brandFilter !== 'all' ? resolveUuids(reg, brandFilter) : null;

  const today = await resolveAnchorToday(supabase, brandUuids);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  // The month the DATA is in, not the wall-clock month — on the 1st and 2nd,
  // yesterday still belongs to the month that just closed, and anchoring on
  // today would render an empty board.
  const monthStart = new Date(yesterday.getFullYear(), yesterday.getMonth(), 1);
  const daysElapsed = yesterday.getDate();
  const daysInMonth = new Date(yesterday.getFullYear(), yesterday.getMonth() + 1, 0).getDate();

  // Compare against the SAME POINT of the previous month. Comparing a part-month
  // against a finished month would show the whole roster collapsing every time.
  const prevStart = new Date(yesterday.getFullYear(), yesterday.getMonth() - 1, 1);
  const prevMonthDays = new Date(yesterday.getFullYear(), yesterday.getMonth(), 0).getDate();
  const prevEnd = new Date(
    prevStart.getFullYear(), prevStart.getMonth(),
    Math.min(daysElapsed, prevMonthDays),   // 31 -> 30 when the prior month is shorter
  );

  const [res, discordMap] = await Promise.all([
    supabase.rpc('get_creator_mtd', {
      p_brand_ids: brandUuids,
      p_month_start: formatDate(monthStart),
      p_end: formatDate(yesterday),
      p_prev_start: formatDate(prevStart),
      p_prev_end: formatDate(prevEnd),
      p_limit: 10,
    }),
    getDiscordMap(supabase, brandFilter),
  ]);
  if (res.error) throw res.error;

  const raw = (res.data ?? {}) as {
    leaderboard?: { tiktok_username?: string; gmv?: number | string; orders?: number | string;
                    videos?: number | string; rank?: number; prevRank?: number | null;
                    rankDelta?: number | null }[];
    totalGmv?: number; prevGmv?: number; creatorCount?: number; videoCount?: number;
  };

  const leaderboard: MtdEntry[] = (raw.leaderboard ?? []).map((r) => {
    const handle = (r.tiktok_username || '').toLowerCase().replace('@', '');
    const d = discordMap.get(handle);
    return {
      tiktok_username: r.tiktok_username ?? '',
      gmv: Number(r.gmv) || 0,
      orders: Number(r.orders) || 0,
      videos: Number(r.videos) || 0,
      rank: Number(r.rank) || 0,
      prevRank: r.prevRank == null ? null : Number(r.prevRank),
      rankDelta: r.rankDelta == null ? null : Number(r.rankDelta),
      discord_id: d?.discord_id ?? null,
      discord_name: d?.discord_name ?? null,
    };
  });

  return {
    leaderboard,
    totalGmv: Number(raw.totalGmv ?? 0),
    prevGmv: Number(raw.prevGmv ?? 0),
    creatorCount: Number(raw.creatorCount ?? 0),
    videoCount: Number(raw.videoCount ?? 0),
    monthLabel: yesterday.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    daysElapsed,
    daysInMonth,
    discordMap,
    endDate: yesterday,
  };
}

// ─── Rookie Watch Data ──────────────────────────────────────────────

export async function getRookieData(
  brandFilter: string,
  period: '7d' | '30d',
  window?: DropWindow,
): Promise<RookieData> {
  const supabase = await createAdminClient();
  const reg = await getBrandRegistry();
  const brandUuids = brandFilter && brandFilter !== 'all' ? resolveUuids(reg, brandFilter) : null;

  const anchor = window ? windowToAnchor(window) : null;
  const today = anchor ? anchor.today : await resolveAnchorToday(supabase, brandUuids);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const periodDays = anchor ? anchor.periodDays : (period === '30d' ? 30 : 7);
  const start = new Date(today);
  start.setDate(today.getDate() - periodDays);

  // Roster grain (text slugs), not brand uuids — get_roster_rookies reads
  // managed_creators.brand and roster_creator_daily.brand_slug.
  const rosterSlugs = rosterBrandSlugs(reg, brandFilter);

  const [res, discordMap] = await Promise.all([
    supabase.rpc('get_roster_rookies', {
      p_brand_slugs: rosterSlugs,
      p_start: formatDate(start),
      p_end: formatDate(yesterday),
      // A "rookie" is someone whose FIRST EVER active day is recent. 30 days
      // rather than the 21 Who's Cooking uses, because this format needs a
      // list, not a single winner, and a 21-day cut runs dry on quiet weeks.
      p_max_age_days: 30,
      p_limit: 8,
    }),
    getDiscordMap(supabase, brandFilter),
  ]);
  if (res.error) throw res.error;

  const raw = (res.data ?? {}) as {
    rookies?: { handle?: string; gmv?: number | string; firstActive?: string;
                daysSinceFirst?: number | string; daysActive?: number | string }[];
    rookieCount?: number; maxAgeDays?: number;
  };

  const mapped: RookieEntry[] = (raw.rookies ?? []).map((r) => {
    const handle = (r.handle || '').toLowerCase().replace('@', '');
    const d = discordMap.get(handle);
    return {
      handle: r.handle ?? '',
      gmv: Number(r.gmv) || 0,
      firstActive: String(r.firstActive ?? ''),
      daysSinceFirst: Number(r.daysSinceFirst) || 0,
      daysActive: Number(r.daysActive) || 0,
      discord_id: d?.discord_id ?? null,
      discord_name: d?.discord_name ?? null,
    };
  });

  // DEDUPE BY PERSON, not by handle. The RPC groups by roster handle, and a
  // creator running several TikTok accounts has one row per account — so the
  // same human appeared twice in a list of five, tagged twice, with two
  // different "day N" numbers. Collapse on the Discord id where we have one
  // (that IS the person), and keep their strongest handle.
  const byPerson = new Map<string, RookieEntry>();
  for (const r of mapped) {
    const key = r.discord_id ?? `handle:${r.handle.toLowerCase()}`;
    const seen = byPerson.get(key);
    if (!seen || r.gmv > seen.gmv) {
      // Keep the earliest first-sale across their accounts — that is when the
      // PERSON started, which is what the post is celebrating.
      byPerson.set(key, seen
        ? { ...r, daysSinceFirst: Math.max(r.daysSinceFirst, seen.daysSinceFirst) }
        : r);
    } else if (r.daysSinceFirst > seen.daysSinceFirst) {
      byPerson.set(key, { ...seen, daysSinceFirst: r.daysSinceFirst });
    }
  }
  const rookies = [...byPerson.values()].sort((a, b) => b.gmv - a.gmv);

  return {
    rookies,
    rookieCount: Number(raw.rookieCount ?? 0),
    maxAgeDays: Number(raw.maxAgeDays ?? 30),
    discordMap,
    endDate: yesterday,
  };
}

// ─── Milestones Data ────────────────────────────────────────────────

export async function getMilestoneData(brandFilter: string): Promise<MilestoneData> {
  const supabase = await createAdminClient();
  const reg = await getBrandRegistry();
  const brandUuids = brandFilter && brandFilter !== 'all' ? resolveUuids(reg, brandFilter) : null;

  const today = await resolveAnchorToday(supabase, brandUuids);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  // Detect first, then read — so a milestone crossed in data that landed this
  // morning is celebrated today rather than whenever a cron next fires. The
  // detector is idempotent (ON CONFLICT DO NOTHING) so this is cheap to repeat.
  const detect = await supabase.rpc('detect_creator_milestones', { p_brand_ids: brandUuids });
  if (detect.error) {
    // Degrade: show what is already recorded rather than failing the post.
    console.error('[discord-posts] detect_creator_milestones failed:', detect.error.message);
  }

  const [res, discordMap] = await Promise.all([
    supabase.rpc('get_creator_milestones', {
      p_brand_ids: brandUuids,
      p_end: formatDate(yesterday),
      p_since_days: 10,
      p_limit: 12,
    }),
    getDiscordMap(supabase, brandFilter),
  ]);
  if (res.error) throw res.error;

  const raw = (res.data ?? {}) as {
    milestones?: { handle?: string; brandSlug?: string; threshold?: number | string;
                   valueAt?: number | string; achievedOn?: string }[];
    sinceDays?: number;
  };

  const milestones: MilestoneEntry[] = (raw.milestones ?? []).map((m) => {
    const handle = (m.handle || '').toLowerCase().replace('@', '');
    const d = discordMap.get(handle);
    return {
      handle: m.handle ?? '',
      brandSlug: m.brandSlug ?? '',
      threshold: Number(m.threshold) || 0,
      valueAt: Number(m.valueAt) || 0,
      achievedOn: String(m.achievedOn ?? ''),
      discord_id: d?.discord_id ?? null,
      discord_name: d?.discord_name ?? null,
    };
  });

  return {
    milestones,
    sinceDays: Number(raw.sinceDays ?? 10),
    discordMap,
    endDate: yesterday,
  };
}

// ─── Discord Formatters ─────────────────────────────────────────

function getMention(handle: string, discordId: string | null, discordName: string | null): string {
  if (discordId) return `<@${discordId}>`;
  if (discordName) return `@${discordName}`;
  return `@${handle.replace('@', '')}`;
}

/**
 * A creator's TikTok profile, as a link that survives being PASTED BY A HUMAN.
 *
 * ⚠️ Markdown masked links (`[text](url)`) are deliberately NOT used. Discord
 * only renders those for bot and webhook messages; pasted from a person's own
 * account they show as literal `[@handle](https://...)`. The drops board is
 * copy-only (the bot has been down since March), so every post here is
 * hand-pasted by Tyler. A bare URL is the only form that linkifies for everyone.
 *
 * ⚠️ Wrapped in angle brackets to SUPPRESS the embed preview. Without them a
 * ten-creator leaderboard would drag ten TikTok preview cards in behind it and
 * bury the post.
 *
 * Returns '' for a missing handle so callers can concatenate unconditionally.
 */
function profileLink(handle: string | null | undefined): string {
  const h = (handle ?? '').replace(/^@/, '').trim();
  if (!h) return '';
  return ` <https://www.tiktok.com/@${h}>`;
}

/**
 * BIGGEST MOVERS — the growth board.
 *
 * Deliberately shows prior -> current alongside the percentage. A bare "+674%"
 * invites the reader to assume it is noise off a tiny base; showing $1,791 ->
 * $13,858 proves it is not, and it is the number the creator will screenshot.
 *
 * Video counts are NOT shown. daily_creator_stats.videos counts videos POSTED
 * that day, and GMV routinely arrives from videos posted earlier — several real
 * movers show 0 videos against four figures of GMV, which reads as a bug to
 * anyone looking at it.
 */
export function formatMoversDiscord(
  data: MoversData,
  brandName: string,
  period: '7d' | '30d',
  window?: DropWindow
): string {
  const w = dropWindowLabels(data.endDate, period, window);
  const label = w.isCustom ? w.headerLabel : period === '30d' ? 'THIS MONTH' : 'THIS WEEK';
  const windowLabel = w.comparisonLabel;
  const L: string[] = [];

  L.push(`# 📈 BIGGEST MOVERS — ${brandName.toUpperCase()} · ${label}`);
  L.push(`_Ranked by growth, not total. ${windowLabel}._`);
  L.push('');

  if (data.movers.length === 0) {
    L.push('No creator cleared the growth bar this period. Nothing to celebrate — that itself is the signal.');
    return L.join('\n');
  }

  const medals = ['🥇', '🥈', '🥉'];
  data.movers.forEach((m, i) => {
    const badge = medals[i] ?? `**${i + 1}.**`;
    const mention = getMention(m.tiktok_username, m.discord_id, m.discord_name);
    const pct = Math.round(m.growthPct);
    L.push(
      `${badge} ${mention} — **+${pct.toLocaleString()}%**  ` +
      `(${formatCurrency(m.priorGmv)} → **${formatCurrency(m.gmv)}**, +${formatCurrency(m.delta)})` +
      profileLink(m.tiktok_username),
    );
  });

  L.push('');
  L.push(
    `_${data.eligibleCount.toLocaleString()} creators grew this period out of ` +
    `${data.poolCount.toLocaleString()} selling. Top ten shown._`,
  );
  return L.join('\n');
}

/**
 * MONTH-TO-DATE LEADERBOARD.
 *
 * The rank delta is the reason this format exists — an absolute board shows the
 * same faces, but "#58 → #3" is a story, and it is still early enough in the
 * month for someone to do something about their own line.
 */
export function formatMtdDiscord(data: MtdData, brandName: string): string {
  const L: string[] = [];
  const pctOfMonth = Math.round((data.daysElapsed / data.daysInMonth) * 100);

  L.push(`# 🗓️ ${data.monthLabel.toUpperCase()} LEADERBOARD — ${brandName.toUpperCase()}`);
  L.push(`_Day ${data.daysElapsed} of ${data.daysInMonth} · ${pctOfMonth}% through the month_`);
  L.push('');

  if (data.leaderboard.length === 0) {
    L.push('No GMV recorded this month yet.');
    return L.join('\n');
  }

  // Pace vs the same point last month — the headline everyone reads first.
  if (data.prevGmv > 0) {
    const diff = data.totalGmv - data.prevGmv;
    const pct = Math.round((diff / data.prevGmv) * 100);
    const arrow = diff >= 0 ? '↑' : '↓';
    L.push(
      `**${formatCurrency(data.totalGmv)}** so far — ${arrow}${Math.abs(pct)}% vs the same point last month ` +
      `(${formatCurrency(data.prevGmv)})`,
    );
  } else {
    L.push(`**${formatCurrency(data.totalGmv)}** so far this month`);
  }
  L.push('');

  const medals = ['🥇', '🥈', '🥉'];
  data.leaderboard.forEach((c, i) => {
    const badge = medals[i] ?? `**${c.rank}.**`;
    const mention = getMention(c.tiktok_username, c.discord_id, c.discord_name);
    // A climb is only interesting if it is a real climb; ±2 is noise.
    //
    // Deep climbs are shown as "from #1,381", never as "▲1374". A four-digit
    // delta is arithmetically true and reads as a broken number — and it is not
    // even the interesting fact. Where someone came FROM is the story; the
    // subtraction is noise once the starting rank is off the board.
    let move = '';
    if (c.prevRank == null) move = '  🆕';
    else if (c.rankDelta != null && c.rankDelta >= 3) {
      move = c.prevRank > 99
        ? `  ▲ from #${c.prevRank.toLocaleString()}`
        : `  ▲${c.rankDelta}`;
    } else if (c.rankDelta != null && c.rankDelta <= -3) {
      move = c.prevRank > 99 ? '' : `  ▼${Math.abs(c.rankDelta)}`;
    }
    // The profile link goes last so the money stays scannable down the left.
    L.push(`${badge} ${mention} — **${formatCurrency(c.gmv)}**${move}${profileLink(c.tiktok_username)}`);
  });

  L.push('');
  L.push(
    `_${data.creatorCount.toLocaleString()} creators selling · ` +
    `${data.videoCount.toLocaleString()} videos this month._`,
  );
  return L.join('\n');
}

/**
 * ROOKIE WATCH — creators whose first-ever active day is recent.
 *
 * Leads with GMV but shows "day N" alongside it, because a rookie doing $900 in
 * their first 6 days is a better story than one doing $1,400 in 29 — and the
 * raw number alone hides that.
 */
export function formatRookieDiscord(
  data: RookieData,
  brandName: string,
  period: '7d' | '30d',
  window?: DropWindow
): string {
  const L: string[] = [];
  const w = dropWindowLabels(data.endDate, period, window);

  L.push(`# 🌱 ROOKIE WATCH — ${brandName.toUpperCase()}`);
  L.push(`_First-timers. Everyone here posted their very first sale within the last ${data.maxAgeDays} days._`);
  L.push('');

  if (data.rookies.length === 0) {
    L.push(`No new creators produced ${w.inPhrase}. Worth asking why the top of the funnel is quiet.`);
    return L.join('\n');
  }

  data.rookies.forEach((r, i) => {
    const mention = getMention(r.handle, r.discord_id, r.discord_name);
    const day = r.daysSinceFirst <= 0 ? 'day 1' : `day ${r.daysSinceFirst}`;
    L.push(
      `**${i + 1}.** ${mention} — **${formatCurrency(r.gmv)}** ${w.inPhrase}  ·  ${day}` +
      profileLink(r.handle),
    );
  });

  L.push('');
  if (data.rookieCount > data.rookies.length) {
    L.push(`_${data.rookieCount} creators made their first sale in the last ${data.maxAgeDays} days. Top ${data.rookies.length} shown._`);
  } else {
    L.push(`_${data.rookieCount} ${data.rookieCount === 1 ? 'creator' : 'creators'} made their first sale in the last ${data.maxAgeDays} days._`);
  }
  L.push('Say hi 👋');
  return L.join('\n');
}

/**
 * MILESTONES — threshold crossings, celebrated once.
 *
 * The only format here that most of the roster can eventually appear in, which
 * is exactly why it exists: a leaderboard has ten slots and the same people
 * hold them.
 *
 * Deliberately says "with <brand>" and never "all time". These totals come from
 * roster/daily stats that begin 2025-05-01, so an all-time claim would be false
 * for anyone who was selling before that.
 */
export function formatMilestonesDiscord(data: MilestoneData, brandName: string): string {
  const L: string[] = [];

  L.push(`# 🏆 MILESTONES — ${brandName.toUpperCase()}`);
  L.push(`_Crossed in the last ${data.sinceDays} days._`);
  L.push('');

  if (data.milestones.length === 0) {
    L.push('No new milestones this week. The next one is always closer than it looks.');
    return L.join('\n');
  }

  // Biggest first — the RPC orders by threshold desc, and the badge escalates
  // so a $100k crossing does not read the same as a $1k one.
  const badge = (t: number) =>
    t >= 1000000 ? '💎' : t >= 250000 ? '👑' : t >= 100000 ? '🥇' : t >= 25000 ? '⭐' : '🎉';

  for (const m of data.milestones) {
    const mention = getMention(m.handle, m.discord_id, m.discord_name);
    L.push(
      `${badge(m.threshold)} ${mention} just crossed **${formatCurrency(m.threshold)}** with ${m.brandSlug}` +
      profileLink(m.handle),
    );
  }

  L.push('');
  L.push('_Totals are since we started tracking, per brand._');
  return L.join('\n');
}

export function formatWhatsCookingDiscord(
  data: WhatsCookingData,
  brandName: string,
  period: '7d' | '30d',
  window?: DropWindow
): string {
  const { headerLabel, rangeLabel } = dropWindowLabels(data.endDate, period, window);

  const formatVideo = (v: VideoEntry, i: number) => {
    const handle = v.tiktok_username.replace('@', '');
    const discord = data.discordMap.get(handle.toLowerCase());
    const mention = getMention(handle, discord?.discord_id || null, discord?.discord_name || null);
    const url = canonicalVideoUrl(handle, v.video_id) ?? '';
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

function whosCookingLabels(data: WhosCookingData, period: '7d' | '30d', window?: DropWindow) {
  const { rangeLabel, editionLabel, totalLabel } = dropWindowLabels(data.endDate, period, window);
  return { rangeLabel, editionLabel, totalLabel };
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
  format: WhosCookingFormat = 'highlights',
  window?: DropWindow
): string {
  const { rangeLabel, editionLabel, totalLabel } = whosCookingLabels(data, period, window);

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

// ─── Daily Drop Formatter ───────────────────────────────────────

function formatCurrency(num: number): string {
  return '$' + Math.round(num || 0).toLocaleString();
}

function generateProgressBar(percent: number): string {
  const filled = Math.min(15, Math.round((percent / 100) * 15));
  const empty = 15 - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

/** Thin alias — the canonical format lives in one place (mig 119 mirrors it). */
function getTikTokUrl(creatorName: string, videoId: string): string | null {
  return canonicalVideoUrl(creatorName, videoId);
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

