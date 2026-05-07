/**
 * Creator portal data layer.
 *
 * Source-of-truth split (per project memory):
 *   creators_v2          — JWT identity (who is signed in)
 *   tiktok_accounts      — creator → tiktok handles
 *   managed_creators     — per-brand contracts (retainer, post quota, tier).
 *                          Bridged via tiktok handle overlap, NOT email
 *                          (creators_v2.email is unreliable; managed_creators
 *                           has multiple rows per creator, one per brand).
 *   daily_video_product_stats — canonical per-video, per-product, per-day stats.
 *                                Queried by tiktok_username (+ optional brand_id),
 *                                NOT by the creator's brand assignment.
 *   brands_v2            — brand display info (name, color, archived).
 *
 * Why filter stats by handle, not assignment: a creator's videos can sell any
 * brand's products. GMV follows the handle. The creator's "brand assignment"
 * in managed_creators only describes their contract obligations.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/server';
import { BRAND_UUID_MAP, BRAND_SLUG_MAP } from '@/lib/utils/constants';

// ---- Types ---------------------------------------------------------------

export interface CreatorContract {
  managedId: number;
  brandSlug: string;          // managed_creators.brand
  brandDisplayName: string;   // brands_v2.display_name (or slug fallback)
  brandColor: string;
  retainer: number;
  monthlyPostRequirement: number;
  productAssignments: string[];
  currentTier: string | null;
  employmentStatus: string | null;
  retainerStartDate: string | null;
}

export interface CreatorPortalProfile {
  creatorId: string;
  realName: string;
  email: string | null;
  handles: string[];          // all tiktok handles (lowercased)
  contracts: CreatorContract[]; // one per brand contract
  brandSlugs: string[];       // distinct contract brand slugs (for switcher)
  currentBrand: string | null;
}

export interface CreatorSummary {
  totalGmv: number;
  totalOrders: number;
  totalItemsSold: number;
  totalCommission: number;
  refunds: number;
  videoCount: number;
  productCount: number;
  bestDay: { date: string; gmv: number } | null;
  // Comparison to prior equal-length period
  priorGmv: number;
  priorOrders: number;
  priorVideoCount: number;
  gmvChangePct: number | null;
  orderChangePct: number | null;
  videoChangePct: number | null;
}

export interface CreatorVideoRow {
  videoId: string;
  videoTitle: string;
  videoUrl: string | null;
  postDate: string | null;
  tiktokUsername: string;
  brandSlug: string;
  gmv: number;
  orders: number;
  itemsSold: number;
  commission: number;
  daysActive: number;
  topProduct: string | null;
}

export interface CreatorDailyPoint {
  date: string;
  gmv: number;
  orders: number;
  videos: number; // distinct videos active that day
}

export interface RankingEntry {
  rank: number;
  tiktokUsername: string;
  realName: string | null;
  gmv: number;
  orders: number;
  videos: number;
  isMe: boolean;
}

// ---- Profile loader ------------------------------------------------------

/**
 * Load full creator profile by JWT subject (creators_v2.id).
 * Bridges via tiktok_accounts to find managed_creators contract rows.
 */
export async function loadCreatorPortalProfile(
  creatorId: string,
  currentBrandCookie: string | null
): Promise<CreatorPortalProfile | null> {
  const supabase = await createAdminClient();

  const { data: cv } = await supabase
    .from('creators_v2')
    .select('id, real_name, email')
    .eq('id', creatorId)
    .maybeSingle();
  if (!cv) return null;

  const { data: accountRows } = await supabase
    .from('tiktok_accounts')
    .select('tiktok_username')
    .eq('creator_id', creatorId);

  const handles = Array.from(
    new Set(
      (accountRows ?? [])
        .map((r: { tiktok_username: string | null }) =>
          (r.tiktok_username || '').trim().toLowerCase()
        )
        .filter(Boolean)
    )
  );

  // Find managed_creators contracts that overlap on any handle.
  // managed_creators stores up to 10 handles in account_1..account_10 (text).
  let contracts: CreatorContract[] = [];
  if (handles.length > 0) {
    const accountFilters = Array.from({ length: 10 }, (_, i) =>
      `account_${i + 1}.in.(${handles.map((h) => `"${h}"`).join(',')})`
    ).join(',');

    const { data: mcRows } = await supabase
      .from('managed_creators')
      .select(
        'id, brand, retainer, monthly_post_requirement, product_assignments, current_tier, employment_status, retainer_start_date, account_1, account_2, account_3, account_4, account_5, account_6, account_7, account_8, account_9, account_10'
      )
      .or(accountFilters);

    const handleSet = new Set(handles);
    type McRow = NonNullable<typeof mcRows>[number];
    const brandRowMap = new Map<string, McRow>();
    for (const row of mcRows ?? []) {
      const rowHandles = [
        row.account_1, row.account_2, row.account_3, row.account_4, row.account_5,
        row.account_6, row.account_7, row.account_8, row.account_9, row.account_10,
      ]
        .map((h: string | null) => (h || '').trim().toLowerCase())
        .filter(Boolean);
      const overlaps = rowHandles.some((h) => handleSet.has(h));
      if (!overlaps) continue;
      // Prefer most-recently-updated row per brand (managed_creators has dupes).
      const existing = brandRowMap.get(row.brand);
      if (!existing) brandRowMap.set(row.brand, row);
    }

    const { data: brandsData } = await supabase
      .from('brands_v2')
      .select('slug, display_name, color, is_archived');
    const brandMeta = new Map<
      string,
      { display_name: string; color: string; is_archived: boolean }
    >();
    for (const b of brandsData ?? []) {
      brandMeta.set(b.slug, {
        display_name: b.display_name || b.slug,
        color: b.color || '#888',
        is_archived: !!b.is_archived,
      });
    }

    contracts = Array.from(brandRowMap.values())
      .filter((r) => !brandMeta.get(r.brand)?.is_archived)
      .map((r) => {
        const meta = brandMeta.get(r.brand);
        return {
          managedId: r.id,
          brandSlug: r.brand,
          brandDisplayName: meta?.display_name ?? r.brand,
          brandColor: meta?.color ?? '#888',
          retainer: Number(r.retainer) || 0,
          monthlyPostRequirement: Number(r.monthly_post_requirement) || 0,
          productAssignments: Array.isArray(r.product_assignments)
            ? r.product_assignments
            : [],
          currentTier: r.current_tier ?? null,
          employmentStatus: r.employment_status ?? null,
          retainerStartDate: r.retainer_start_date ?? null,
        };
      })
      .sort((a, b) => b.retainer - a.retainer);
  }

  const brandSlugs = contracts.map((c) => c.brandSlug);
  const currentBrand =
    currentBrandCookie && brandSlugs.includes(currentBrandCookie)
      ? currentBrandCookie
      : null;

  return {
    creatorId: cv.id,
    realName: cv.real_name || handles[0] || 'Creator',
    email: cv.email ?? null,
    handles,
    contracts,
    brandSlugs,
    currentBrand,
  };
}

// ---- Stats queries -------------------------------------------------------

const PAGE = 1000;

async function paginated(
  supabase: SupabaseClient,
  table: string,
  columns: string,
  filters: { column: string; op: 'eq' | 'in' | 'gte' | 'lte'; value: any }[]
): Promise<any[]> {
  const all: any[] = [];
  let from = 0;
  while (true) {
    let q: any = supabase.from(table).select(columns).range(from, from + PAGE - 1);
    for (const f of filters) {
      switch (f.op) {
        case 'eq': q = q.eq(f.column, f.value); break;
        case 'in': q = q.in(f.column, f.value); break;
        case 'gte': q = q.gte(f.column, f.value); break;
        case 'lte': q = q.lte(f.column, f.value); break;
      }
    }
    const { data, error } = await q;
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

export interface DateWindow {
  start: string; // YYYY-MM-DD
  end: string;   // YYYY-MM-DD
}

export function dateWindow(days: number, anchor: Date = new Date()): DateWindow {
  const end = anchor.toISOString().slice(0, 10);
  const startD = new Date(anchor);
  startD.setDate(startD.getDate() - (days - 1));
  return { start: startD.toISOString().slice(0, 10), end };
}

export function priorWindow(window: DateWindow): DateWindow {
  const startD = new Date(window.start + 'T00:00:00Z');
  const endD = new Date(window.end + 'T00:00:00Z');
  const days = Math.round((endD.getTime() - startD.getTime()) / 86400000) + 1;
  const priorEnd = new Date(startD);
  priorEnd.setUTCDate(priorEnd.getUTCDate() - 1);
  const priorStart = new Date(priorEnd);
  priorStart.setUTCDate(priorStart.getUTCDate() - (days - 1));
  return {
    start: priorStart.toISOString().slice(0, 10),
    end: priorEnd.toISOString().slice(0, 10),
  };
}

function brandFilter(brandSlug: string | null) {
  if (!brandSlug) return null;
  const uuid = BRAND_UUID_MAP[brandSlug];
  return uuid || null;
}

function pctChange(curr: number, prior: number): number | null {
  if (prior === 0) return null;
  return ((curr - prior) / prior) * 100;
}

/** Aggregated summary from daily_video_product_stats. */
export async function getCreatorSummary(
  handles: string[],
  brandSlug: string | null,
  window: DateWindow
): Promise<CreatorSummary> {
  if (handles.length === 0) return emptySummary();
  const supabase = await createAdminClient();
  const brandUuid = brandFilter(brandSlug);

  const filters: { column: string; op: 'eq' | 'in' | 'gte' | 'lte'; value: any }[] = [
    { column: 'tiktok_username', op: 'in', value: handles },
    { column: 'report_date', op: 'gte', value: window.start },
    { column: 'report_date', op: 'lte', value: window.end },
  ];
  if (brandUuid) filters.push({ column: 'brand_id', op: 'eq', value: brandUuid });

  const rows = await paginated(
    supabase,
    'daily_video_product_stats',
    'report_date, video_id, product_id, gmv, orders, items_sold, est_commission, refunded_gmv',
    filters
  );

  let gmv = 0, orders = 0, items = 0, commission = 0, refunds = 0;
  const videoIds = new Set<string>();
  const productIds = new Set<string>();
  const gmvByDate = new Map<string, number>();
  for (const r of rows) {
    gmv += Number(r.gmv) || 0;
    orders += Number(r.orders) || 0;
    items += Number(r.items_sold) || 0;
    commission += Number(r.est_commission) || 0;
    refunds += Number(r.refunded_gmv) || 0;
    if (r.video_id) videoIds.add(r.video_id);
    if (r.product_id) productIds.add(r.product_id);
    gmvByDate.set(r.report_date, (gmvByDate.get(r.report_date) ?? 0) + (Number(r.gmv) || 0));
  }

  let bestDay: { date: string; gmv: number } | null = null;
  for (const [date, dayGmv] of gmvByDate) {
    if (!bestDay || dayGmv > bestDay.gmv) bestDay = { date, gmv: dayGmv };
  }

  // Prior period for comparison.
  const prior = priorWindow(window);
  const priorFilters: { column: string; op: 'eq' | 'in' | 'gte' | 'lte'; value: any }[] = [
    { column: 'tiktok_username', op: 'in', value: handles },
    { column: 'report_date', op: 'gte', value: prior.start },
    { column: 'report_date', op: 'lte', value: prior.end },
  ];
  if (brandUuid) priorFilters.push({ column: 'brand_id', op: 'eq', value: brandUuid });

  const priorRows = await paginated(
    supabase,
    'daily_video_product_stats',
    'video_id, gmv, orders',
    priorFilters
  );
  let priorGmv = 0, priorOrders = 0;
  const priorVideos = new Set<string>();
  for (const r of priorRows) {
    priorGmv += Number(r.gmv) || 0;
    priorOrders += Number(r.orders) || 0;
    if (r.video_id) priorVideos.add(r.video_id);
  }

  return {
    totalGmv: gmv,
    totalOrders: orders,
    totalItemsSold: items,
    totalCommission: commission,
    refunds,
    videoCount: videoIds.size,
    productCount: productIds.size,
    bestDay,
    priorGmv,
    priorOrders,
    priorVideoCount: priorVideos.size,
    gmvChangePct: pctChange(gmv, priorGmv),
    orderChangePct: pctChange(orders, priorOrders),
    videoChangePct: pctChange(videoIds.size, priorVideos.size),
  };
}

function emptySummary(): CreatorSummary {
  return {
    totalGmv: 0, totalOrders: 0, totalItemsSold: 0, totalCommission: 0, refunds: 0,
    videoCount: 0, productCount: 0, bestDay: null,
    priorGmv: 0, priorOrders: 0, priorVideoCount: 0,
    gmvChangePct: null, orderChangePct: null, videoChangePct: null,
  };
}

/** Daily series (GMV / orders / videos) for trend chart. */
export async function getCreatorDailySeries(
  handles: string[],
  brandSlug: string | null,
  window: DateWindow
): Promise<CreatorDailyPoint[]> {
  if (handles.length === 0) return [];
  const supabase = await createAdminClient();
  const brandUuid = brandFilter(brandSlug);

  const filters: { column: string; op: 'eq' | 'in' | 'gte' | 'lte'; value: any }[] = [
    { column: 'tiktok_username', op: 'in', value: handles },
    { column: 'report_date', op: 'gte', value: window.start },
    { column: 'report_date', op: 'lte', value: window.end },
  ];
  if (brandUuid) filters.push({ column: 'brand_id', op: 'eq', value: brandUuid });

  const rows = await paginated(
    supabase,
    'daily_video_product_stats',
    'report_date, video_id, gmv, orders',
    filters
  );

  const byDate = new Map<string, { gmv: number; orders: number; videos: Set<string> }>();
  for (const r of rows) {
    const slot = byDate.get(r.report_date) ?? { gmv: 0, orders: 0, videos: new Set() };
    slot.gmv += Number(r.gmv) || 0;
    slot.orders += Number(r.orders) || 0;
    if (r.video_id) slot.videos.add(r.video_id);
    byDate.set(r.report_date, slot);
  }

  // Fill missing dates with zeros for clean chart.
  const out: CreatorDailyPoint[] = [];
  const cursor = new Date(window.start + 'T00:00:00Z');
  const endD = new Date(window.end + 'T00:00:00Z');
  while (cursor <= endD) {
    const d = cursor.toISOString().slice(0, 10);
    const slot = byDate.get(d);
    out.push({
      date: d,
      gmv: slot?.gmv ?? 0,
      orders: slot?.orders ?? 0,
      videos: slot?.videos.size ?? 0,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

/** Top videos for a creator in a window. */
export async function getCreatorTopVideos(
  handles: string[],
  brandSlug: string | null,
  window: DateWindow,
  limit = 12
): Promise<CreatorVideoRow[]> {
  if (handles.length === 0) return [];
  const supabase = await createAdminClient();
  const brandUuid = brandFilter(brandSlug);

  const filters: { column: string; op: 'eq' | 'in' | 'gte' | 'lte'; value: any }[] = [
    { column: 'tiktok_username', op: 'in', value: handles },
    { column: 'report_date', op: 'gte', value: window.start },
    { column: 'report_date', op: 'lte', value: window.end },
  ];
  if (brandUuid) filters.push({ column: 'brand_id', op: 'eq', value: brandUuid });

  const rows = await paginated(
    supabase,
    'daily_video_product_stats',
    'report_date, video_id, video_title, video_url, post_date, tiktok_username, brand_id, product_name, gmv, orders, items_sold, est_commission',
    filters
  );

  type Acc = {
    videoId: string;
    title: string;
    url: string | null;
    postDate: string | null;
    username: string;
    brandSlug: string;
    gmv: number;
    orders: number;
    itemsSold: number;
    commission: number;
    days: Set<string>;
    productGmv: Map<string, number>;
  };
  const byVideo = new Map<string, Acc>();
  for (const r of rows) {
    if (!r.video_id) continue;
    const slot =
      byVideo.get(r.video_id) ?? ({
        videoId: r.video_id,
        title: r.video_title || '(untitled)',
        url: r.video_url || null,
        postDate: r.post_date || null,
        username: r.tiktok_username,
        brandSlug: BRAND_SLUG_MAP[r.brand_id] || r.brand_id,
        gmv: 0,
        orders: 0,
        itemsSold: 0,
        commission: 0,
        days: new Set<string>(),
        productGmv: new Map<string, number>(),
      } satisfies Acc);
    slot.gmv += Number(r.gmv) || 0;
    slot.orders += Number(r.orders) || 0;
    slot.itemsSold += Number(r.items_sold) || 0;
    slot.commission += Number(r.est_commission) || 0;
    slot.days.add(r.report_date);
    if (r.product_name) {
      slot.productGmv.set(
        r.product_name,
        (slot.productGmv.get(r.product_name) ?? 0) + (Number(r.gmv) || 0)
      );
    }
    byVideo.set(r.video_id, slot);
  }

  const out: CreatorVideoRow[] = Array.from(byVideo.values()).map((v) => {
    let topProduct: string | null = null;
    let topProductGmv = -1;
    for (const [name, g] of v.productGmv) {
      if (g > topProductGmv) {
        topProduct = name;
        topProductGmv = g;
      }
    }
    return {
      videoId: v.videoId,
      videoTitle: v.title,
      videoUrl: v.url,
      postDate: v.postDate,
      tiktokUsername: v.username,
      brandSlug: v.brandSlug,
      gmv: v.gmv,
      orders: v.orders,
      itemsSold: v.itemsSold,
      commission: v.commission,
      daysActive: v.days.size,
      topProduct,
    };
  });
  out.sort((a, b) => b.gmv - a.gmv);
  return out.slice(0, limit);
}

/** Posting streak: distinct days with at least one video in the past 90 days. */
export async function getCreatorStreak(
  handles: string[],
  brandSlug: string | null
): Promise<number> {
  if (handles.length === 0) return 0;
  const supabase = await createAdminClient();
  const brandUuid = brandFilter(brandSlug);

  const today = new Date();
  const start = new Date(today);
  start.setUTCDate(start.getUTCDate() - 90);

  const filters: { column: string; op: 'eq' | 'in' | 'gte' | 'lte'; value: any }[] = [
    { column: 'tiktok_username', op: 'in', value: handles },
    { column: 'report_date', op: 'gte', value: start.toISOString().slice(0, 10) },
  ];
  if (brandUuid) filters.push({ column: 'brand_id', op: 'eq', value: brandUuid });

  const rows = await paginated(
    supabase,
    'daily_video_product_stats',
    'report_date',
    filters
  );

  const days = new Set<string>(rows.map((r: any) => r.report_date));
  let streak = 0;
  const cursor = new Date(today);
  // Allow today OR yesterday to be the starting day (data is often 1 day behind).
  let started = false;
  for (let i = 0; i < 90; i++) {
    const d = cursor.toISOString().slice(0, 10);
    if (days.has(d)) {
      streak++;
      started = true;
    } else if (!started && i <= 1) {
      // Skip: today/yesterday tolerance before streak begins.
    } else {
      break;
    }
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

/** Distinct video IDs posted this calendar month — for retainer pace. */
export async function getMonthVideoCount(
  handles: string[],
  brandSlug: string | null
): Promise<number> {
  if (handles.length === 0) return 0;
  const supabase = await createAdminClient();
  const brandUuid = brandFilter(brandSlug);

  const now = new Date();
  const start = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
  const end = now.toISOString().slice(0, 10);

  const filters: { column: string; op: 'eq' | 'in' | 'gte' | 'lte'; value: any }[] = [
    { column: 'tiktok_username', op: 'in', value: handles },
    { column: 'report_date', op: 'gte', value: start },
    { column: 'report_date', op: 'lte', value: end },
  ];
  if (brandUuid) filters.push({ column: 'brand_id', op: 'eq', value: brandUuid });

  const rows = await paginated(
    supabase,
    'daily_video_product_stats',
    'video_id',
    filters
  );
  const ids = new Set<string>();
  for (const r of rows) if (r.video_id) ids.add(r.video_id);
  return ids.size;
}

/** Brand-level rankings: leaderboard of creators by GMV. Includes "me" flag. */
export async function getBrandRankings(
  brandSlug: string | null,
  window: DateWindow,
  myHandles: string[],
  limit = 50
): Promise<RankingEntry[]> {
  const supabase = await createAdminClient();
  const brandUuid = brandFilter(brandSlug);

  const filters: { column: string; op: 'eq' | 'in' | 'gte' | 'lte'; value: any }[] = [
    { column: 'report_date', op: 'gte', value: window.start },
    { column: 'report_date', op: 'lte', value: window.end },
  ];
  if (brandUuid) filters.push({ column: 'brand_id', op: 'eq', value: brandUuid });

  const rows = await paginated(
    supabase,
    'daily_video_product_stats',
    'tiktok_username, video_id, gmv, orders',
    filters
  );

  type Acc = { gmv: number; orders: number; videos: Set<string> };
  const byUser = new Map<string, Acc>();
  for (const r of rows) {
    const u = (r.tiktok_username || '').toLowerCase();
    if (!u) continue;
    const slot = byUser.get(u) ?? { gmv: 0, orders: 0, videos: new Set() };
    slot.gmv += Number(r.gmv) || 0;
    slot.orders += Number(r.orders) || 0;
    if (r.video_id) slot.videos.add(r.video_id);
    byUser.set(u, slot);
  }

  const ranked = Array.from(byUser.entries())
    .map(([username, acc]) => ({
      tiktokUsername: username,
      gmv: acc.gmv,
      orders: acc.orders,
      videos: acc.videos.size,
    }))
    .sort((a, b) => b.gmv - a.gmv);

  // Map handles → real names (best-effort, for the ones we'll show).
  const topUsernames = ranked.slice(0, Math.max(limit, 10)).map((r) => r.tiktokUsername);
  const myHandleSet = new Set(myHandles.map((h) => h.toLowerCase()));
  // Include all my handles so we can highlight "me" even past the limit.
  for (const h of myHandles) topUsernames.push(h.toLowerCase());

  // managed_creators stores handles in account_1..10 — need to query each col.
  // Build a name map by querying tiktok_accounts joined to creators_v2 first.
  const nameMap = new Map<string, string>();
  if (topUsernames.length > 0) {
    const { data: ta } = await supabase
      .from('tiktok_accounts')
      .select('tiktok_username, creator_id, creators_v2!inner(real_name)')
      .in('tiktok_username', Array.from(new Set(topUsernames)));
    for (const row of ta ?? []) {
      const name = (row as any).creators_v2?.real_name;
      if (name && row.tiktok_username) {
        nameMap.set(row.tiktok_username.toLowerCase(), name);
      }
    }
  }

  const myRankIdx = ranked.findIndex((r) => myHandleSet.has(r.tiktokUsername));
  const result: RankingEntry[] = ranked.slice(0, limit).map((r, i) => ({
    rank: i + 1,
    tiktokUsername: r.tiktokUsername,
    realName: nameMap.get(r.tiktokUsername) ?? null,
    gmv: r.gmv,
    orders: r.orders,
    videos: r.videos,
    isMe: myHandleSet.has(r.tiktokUsername),
  }));

  // If "me" not in top N, append my row(s) with their actual ranks.
  if (myRankIdx >= limit) {
    for (let i = 0; i < ranked.length; i++) {
      if (myHandleSet.has(ranked[i].tiktokUsername) && i >= limit) {
        result.push({
          rank: i + 1,
          tiktokUsername: ranked[i].tiktokUsername,
          realName: nameMap.get(ranked[i].tiktokUsername) ?? null,
          gmv: ranked[i].gmv,
          orders: ranked[i].orders,
          videos: ranked[i].videos,
          isMe: true,
        });
      }
    }
  }

  return result;
}

/** Network-wide top videos (for Inspiration). */
export async function getInspirationVideos(
  brandSlug: string | null,
  window: DateWindow,
  limit = 24
): Promise<(CreatorVideoRow & { isMine: boolean })[]> {
  const supabase = await createAdminClient();
  const brandUuid = brandFilter(brandSlug);

  const filters: { column: string; op: 'eq' | 'in' | 'gte' | 'lte'; value: any }[] = [
    { column: 'report_date', op: 'gte', value: window.start },
    { column: 'report_date', op: 'lte', value: window.end },
  ];
  if (brandUuid) filters.push({ column: 'brand_id', op: 'eq', value: brandUuid });

  const rows = await paginated(
    supabase,
    'daily_video_product_stats',
    'video_id, video_title, video_url, post_date, tiktok_username, brand_id, product_name, gmv, orders, items_sold, est_commission, report_date',
    filters
  );

  type Acc = {
    videoId: string;
    title: string;
    url: string | null;
    postDate: string | null;
    username: string;
    brandSlug: string;
    gmv: number;
    orders: number;
    itemsSold: number;
    commission: number;
    days: Set<string>;
    productGmv: Map<string, number>;
  };
  const byVideo = new Map<string, Acc>();
  for (const r of rows) {
    if (!r.video_id) continue;
    const slot =
      byVideo.get(r.video_id) ?? ({
        videoId: r.video_id,
        title: r.video_title || '(untitled)',
        url: r.video_url || null,
        postDate: r.post_date || null,
        username: r.tiktok_username,
        brandSlug: BRAND_SLUG_MAP[r.brand_id] || r.brand_id,
        gmv: 0,
        orders: 0,
        itemsSold: 0,
        commission: 0,
        days: new Set<string>(),
        productGmv: new Map<string, number>(),
      } satisfies Acc);
    slot.gmv += Number(r.gmv) || 0;
    slot.orders += Number(r.orders) || 0;
    slot.itemsSold += Number(r.items_sold) || 0;
    slot.commission += Number(r.est_commission) || 0;
    slot.days.add(r.report_date);
    if (r.product_name) {
      slot.productGmv.set(
        r.product_name,
        (slot.productGmv.get(r.product_name) ?? 0) + (Number(r.gmv) || 0)
      );
    }
    byVideo.set(r.video_id, slot);
  }

  const all = Array.from(byVideo.values()).sort((a, b) => b.gmv - a.gmv);

  return all.slice(0, limit).map((v) => {
    let topProduct: string | null = null;
    let topProductGmv = -1;
    for (const [name, g] of v.productGmv) {
      if (g > topProductGmv) {
        topProduct = name;
        topProductGmv = g;
      }
    }
    return {
      videoId: v.videoId,
      videoTitle: v.title,
      videoUrl: v.url,
      postDate: v.postDate,
      tiktokUsername: v.username,
      brandSlug: v.brandSlug,
      gmv: v.gmv,
      orders: v.orders,
      itemsSold: v.itemsSold,
      commission: v.commission,
      daysActive: v.days.size,
      topProduct,
      isMine: false,
    };
  });
}

// ---- Coaching nudge (Home page) ------------------------------------------

export interface CoachingNudge {
  kind: 'pace_behind' | 'top_video' | 'streak' | 'no_recent_post' | 'celebrate';
  headline: string;
  detail: string;
  cta?: { label: string; href: string };
}

export function buildCoachingNudge(args: {
  monthVideos: number;
  monthlyTarget: number;
  streak: number;
  topVideo: CreatorVideoRow | null;
  summary: CreatorSummary;
  daysLeftInMonth: number;
}): CoachingNudge | null {
  const { monthVideos, monthlyTarget, streak, topVideo, summary, daysLeftInMonth } = args;

  // 1) Behind retainer pace
  if (monthlyTarget > 0 && daysLeftInMonth > 0) {
    const behindBy = monthlyTarget - monthVideos;
    if (behindBy > 0) {
      const dailyNeeded = Math.ceil(behindBy / Math.max(1, daysLeftInMonth));
      if (dailyNeeded >= 2) {
        return {
          kind: 'pace_behind',
          headline: `You're behind retainer pace`,
          detail: `Need ${behindBy} more video${behindBy === 1 ? '' : 's'} this month — that's ${dailyNeeded}/day for the next ${daysLeftInMonth} days. Find inspiration or check what's winning.`,
          cta: { label: 'Find inspiration', href: '/creator-dashboard/discover' },
        };
      }
    }
  }

  // 2) A standout video
  if (topVideo && summary.videoCount > 0) {
    const avgPerVideo = summary.totalGmv / Math.max(1, summary.videoCount);
    if (topVideo.gmv >= avgPerVideo * 2.5 && topVideo.gmv >= 200) {
      return {
        kind: 'top_video',
        headline: `One of your videos is on fire`,
        detail: `"${truncate(topVideo.videoTitle, 60)}" did ${formatMoney(topVideo.gmv)} — ${(topVideo.gmv / avgPerVideo).toFixed(1)}× your average. Post a follow-up while it's hot.`,
      };
    }
  }

  // 3) Streak shoutout
  if (streak >= 7) {
    return {
      kind: 'streak',
      headline: `${streak}-day posting streak`,
      detail: `Consistency compounds. Keep it going — your top creators average 5+ posts/week.`,
    };
  }

  // 4) No recent activity
  if (summary.videoCount === 0) {
    return {
      kind: 'no_recent_post',
      headline: `No videos this period`,
      detail: `Get back in the loop. Browse what's winning across the network for a quick start.`,
      cta: { label: 'See what\'s winning', href: '/creator-dashboard/discover' },
    };
  }

  return null;
}

function truncate(s: string, n: number) {
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}
function formatMoney(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}
