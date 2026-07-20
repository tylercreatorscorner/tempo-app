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

import { cache } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/server';
import { getBrandRegistry, resolveUuids, uuidToSlug, type BrandRegistry } from '@/lib/data/brand-registry';

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
  /** GMV in the recent vs prior half of the window — for the cooling-winner
   *  detector (a video that was earning but is now fading). */
  recentGmv?: number;
  priorGmv?: number;
}

export interface CreatorProductRow {
  productName: string;
  gmv: number;
  orders: number;
  commission: number;
  gmvChangePct: number | null;
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
async function loadCreatorPortalProfileImpl(
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

/**
 * Request-cached: the (creator) layout and each page both call this with the same
 * (creatorId, brandCookie), so cache() collapses them into ONE handle→contract
 * bridge per request instead of two.
 */
export const loadCreatorPortalProfile = cache(loadCreatorPortalProfileImpl);

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

// Resolve a brand slug to the data-table brand_id(s). Expands the LeeFar umbrella
// to its stores and resolves from brands_v2 (DB-driven). The old version did
// BRAND_UUID_MAP[slug] with no expansion, so 'leefar' mapped to the umbrella UUID
// (which has ZERO daily_video_product_stats rows → LeeFar creators saw $0) and a
// newer brand missing from the map dropped the filter entirely (over-count).
// null = no brand filter; [] = a known-but-unresolvable brand → scope to nothing.
function brandFilter(reg: BrandRegistry, brandSlug: string | null): string[] | null {
  return resolveUuids(reg, brandSlug);
}

/** Umbrella-aware set of data-store SLUGS for a brand (creator_performance is keyed by slug). */
function brandSlugSet(reg: BrandRegistry, brandSlug: string | null): Set<string> | null {
  if (!brandSlug) return null;
  const slugs = new Set<string>([brandSlug.toLowerCase()]);
  const uuids = resolveUuids(reg, brandSlug);
  if (uuids) for (const u of uuids) { const s = uuidToSlug(reg, u); if (s) slugs.add(s.toLowerCase()); }
  return slugs;
}

interface PerfRow { brand: string; gmv: number; orders: number; items_sold: number; commission: number }

/**
 * Money (gmv/orders/items/commission) from creator_performance via the SAME RPC
 * the ADMIN creator profile uses — so the portal ties out to the admin exactly.
 * daily_video_product_stats (the portal's old source) undercounts by ~10%+.
 */
async function perfByHandles(
  supabase: SupabaseClient,
  handles: string[],
  start: string,
  end: string,
): Promise<PerfRow[]> {
  const lowered = Array.from(
    new Set(handles.map((h) => h.replace(/^@/, '').trim().toLowerCase()).filter(Boolean)),
  );
  if (lowered.length === 0) return [];
  const { data, error } = await supabase.rpc('get_creator_perf_by_handles', {
    p_handles: lowered,
    p_start_date: start,
    p_end_date: end,
  });
  if (error) throw error;
  return ((data as Record<string, unknown>[] | null) ?? []).map((r) => ({
    brand: String(r.brand),
    gmv: Number(r.gmv) || 0,
    orders: Number(r.orders) || 0,
    items_sold: Number(r.items_sold) || 0,
    commission: Number(r.commission) || 0,
  }));
}

function pctChange(curr: number, prior: number): number | null {
  if (prior === 0) return null;
  return ((curr - prior) / prior) * 100;
}

/**
 * Aggregated creator summary.
 *
 * MONEY (gmv / orders / items / commission, current + prior) comes from
 * creator_performance via the SAME RPC the admin creator profile uses
 * (get_creator_perf_by_handles) — so the portal ties out to the admin exactly.
 * daily_video_product_stats (the portal's old money source) undercounts by ~10%+.
 *
 * Video/product counts, refunds and best-day come from daily_video_product_stats
 * — the per-video granularity the money RPC doesn't expose.
 */
export async function getCreatorSummary(
  handles: string[],
  brandSlug: string | null,
  window: DateWindow
): Promise<CreatorSummary> {
  if (handles.length === 0) return emptySummary();
  const supabase = await createAdminClient();
  const reg = await getBrandRegistry();
  const brandUuid = brandFilter(reg, brandSlug); // UUIDs → daily_video_product_stats.brand_id
  const slugs = brandSlugSet(reg, brandSlug); // slugs → creator_performance.brand
  const prior = priorWindow(window);

  const dvps = (start: string, end: string, cols: string) => {
    const f: { column: string; op: 'eq' | 'in' | 'gte' | 'lte'; value: any }[] = [
      { column: 'tiktok_username', op: 'in', value: handles },
      { column: 'report_date', op: 'gte', value: start },
      { column: 'report_date', op: 'lte', value: end },
    ];
    if (brandUuid) f.push({ column: 'brand_id', op: 'in', value: brandUuid });
    return paginated(supabase, 'daily_video_product_stats', cols, f);
  };

  const [perf, priorPerf, rows, priorRows] = await Promise.all([
    perfByHandles(supabase, handles, window.start, window.end),
    perfByHandles(supabase, handles, prior.start, prior.end),
    dvps(window.start, window.end, 'report_date, video_id, product_id, gmv, refunded_gmv'),
    dvps(prior.start, prior.end, 'video_id'),
  ]);

  const sumPerf = (pr: PerfRow[]) => {
    let gmv = 0, orders = 0, items = 0, commission = 0;
    for (const p of pr) {
      if (slugs && !slugs.has(p.brand.toLowerCase())) continue;
      gmv += p.gmv; orders += p.orders; items += p.items_sold; commission += p.commission;
    }
    return { gmv, orders, items, commission };
  };
  const cur = sumPerf(perf);
  const prv = sumPerf(priorPerf);

  // Video-level context (refunds, distinct videos/products, best day).
  let refunds = 0;
  const videoIds = new Set<string>();
  const productIds = new Set<string>();
  const gmvByDate = new Map<string, number>();
  for (const r of rows) {
    refunds += Number(r.refunded_gmv) || 0;
    if (r.video_id) videoIds.add(r.video_id);
    if (r.product_id) productIds.add(r.product_id);
    gmvByDate.set(r.report_date, (gmvByDate.get(r.report_date) ?? 0) + (Number(r.gmv) || 0));
  }
  let bestDay: { date: string; gmv: number } | null = null;
  for (const [date, dayGmv] of gmvByDate) {
    if (!bestDay || dayGmv > bestDay.gmv) bestDay = { date, gmv: dayGmv };
  }
  const priorVideos = new Set<string>();
  for (const r of priorRows) if (r.video_id) priorVideos.add(r.video_id);

  return {
    totalGmv: cur.gmv,
    totalOrders: cur.orders,
    totalItemsSold: cur.items,
    totalCommission: cur.commission,
    refunds,
    videoCount: videoIds.size,
    productCount: productIds.size,
    bestDay,
    priorGmv: prv.gmv,
    priorOrders: prv.orders,
    priorVideoCount: priorVideos.size,
    gmvChangePct: pctChange(cur.gmv, prv.gmv),
    orderChangePct: pctChange(cur.orders, prv.orders),
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
  const reg = await getBrandRegistry();
  const brandUuid = brandFilter(reg, brandSlug);

  const filters: { column: string; op: 'eq' | 'in' | 'gte' | 'lte'; value: any }[] = [
    { column: 'tiktok_username', op: 'in', value: handles },
    { column: 'report_date', op: 'gte', value: window.start },
    { column: 'report_date', op: 'lte', value: window.end },
  ];
  if (brandUuid) filters.push({ column: 'brand_id', op: 'in', value: brandUuid });

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

/**
 * Lifetime GMV headline — RPC ONLY (no daily_video_product_stats scan).
 *
 * The home page only needs the all-time total, so calling getCreatorSummary()
 * with a 3650-day window was pathological: it ran two multi-year
 * daily_video_product_stats paginated scans (current + prior period) whose
 * video/best-day output was thrown away. This is a single get_creator_perf_by_handles
 * call over the same wide window — the slow part deleted.
 */
export async function getCreatorLifetimeGmv(
  handles: string[],
  brandSlug: string | null,
): Promise<number | null> {
  if (handles.length === 0) return 0;
  const supabase = await createAdminClient();
  const reg = await getBrandRegistry();
  const slugs = brandSlugSet(reg, brandSlug);
  const w = dateWindow(3650);
  const perf = await perfByHandles(supabase, handles, w.start, w.end);
  let gmv = 0;
  for (const p of perf) {
    if (slugs && !slugs.has(p.brand.toLowerCase())) continue;
    gmv += p.gmv;
  }
  return gmv;
}

/** The YYYY-MM-DD halfway between two date strings (inclusive window). */
function midpointDate(start: string, end: string): string {
  const s = new Date(start + 'T00:00:00Z').getTime();
  const e = new Date(end + 'T00:00:00Z').getTime();
  return new Date(s + (e - s) / 2).toISOString().slice(0, 10);
}

/**
 * The creator's top products by GMV over the window (their money-makers), with a
 * prior-equal-period delta. Aggregates daily_video_product_stats by product_name.
 */
export async function getCreatorTopProducts(
  handles: string[],
  brandSlug: string | null,
  window: DateWindow,
  limit = 5,
): Promise<CreatorProductRow[]> {
  if (handles.length === 0) return [];
  const supabase = await createAdminClient();
  const reg = await getBrandRegistry();
  const brandUuid = brandFilter(reg, brandSlug);
  const prior = priorWindow(window);

  const read = (start: string, end: string) => {
    const f: { column: string; op: 'eq' | 'in' | 'gte' | 'lte'; value: any }[] = [
      { column: 'tiktok_username', op: 'in', value: handles },
      { column: 'report_date', op: 'gte', value: start },
      { column: 'report_date', op: 'lte', value: end },
    ];
    if (brandUuid) f.push({ column: 'brand_id', op: 'in', value: brandUuid });
    return paginated(supabase, 'daily_video_product_stats', 'product_name, gmv, orders, est_commission', f);
  };

  const [rows, priorRows] = await Promise.all([
    read(window.start, window.end),
    read(prior.start, prior.end),
  ]);

  type Acc = { gmv: number; orders: number; commission: number };
  const cur = new Map<string, Acc>();
  for (const r of rows) {
    const name = r.product_name;
    if (!name) continue;
    const a = cur.get(name) ?? { gmv: 0, orders: 0, commission: 0 };
    a.gmv += Number(r.gmv) || 0;
    a.orders += Number(r.orders) || 0;
    a.commission += Number(r.est_commission) || 0;
    cur.set(name, a);
  }
  const priorGmv = new Map<string, number>();
  for (const r of priorRows) {
    if (!r.product_name) continue;
    priorGmv.set(r.product_name, (priorGmv.get(r.product_name) ?? 0) + (Number(r.gmv) || 0));
  }

  return Array.from(cur.entries())
    .map(([productName, a]) => ({
      productName,
      gmv: a.gmv,
      orders: a.orders,
      commission: a.commission,
      gmvChangePct: pctChange(a.gmv, priorGmv.get(productName) ?? 0),
    }))
    .sort((a, b) => b.gmv - a.gmv)
    .slice(0, limit);
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
  const reg = await getBrandRegistry();
  const brandUuid = brandFilter(reg, brandSlug);

  const filters: { column: string; op: 'eq' | 'in' | 'gte' | 'lte'; value: any }[] = [
    { column: 'tiktok_username', op: 'in', value: handles },
    { column: 'report_date', op: 'gte', value: window.start },
    { column: 'report_date', op: 'lte', value: window.end },
  ];
  if (brandUuid) filters.push({ column: 'brand_id', op: 'in', value: brandUuid });

  const rows = await paginated(
    supabase,
    'daily_video_product_stats',
    'report_date, video_id, video_title, video_url, post_date, tiktok_username, brand_id, product_name, gmv, orders, items_sold, est_commission',
    filters
  );

  // Split date: gmv on/after `mid` is "recent", before is "prior" — for cooling.
  const mid = midpointDate(window.start, window.end);

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
    recentGmv: number;
    priorGmv: number;
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
        brandSlug: uuidToSlug(reg, r.brand_id) || r.brand_id,
        gmv: 0,
        orders: 0,
        itemsSold: 0,
        commission: 0,
        recentGmv: 0,
        priorGmv: 0,
        days: new Set<string>(),
        productGmv: new Map<string, number>(),
      } satisfies Acc);
    const g = Number(r.gmv) || 0;
    slot.gmv += g;
    slot.orders += Number(r.orders) || 0;
    slot.itemsSold += Number(r.items_sold) || 0;
    slot.commission += Number(r.est_commission) || 0;
    if (r.report_date >= mid) slot.recentGmv += g;
    else slot.priorGmv += g;
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
      recentGmv: v.recentGmv,
      priorGmv: v.priorGmv,
    };
  });
  out.sort((a, b) => b.gmv - a.gmv);
  const top = out.slice(0, limit);

  // dvps.video_url is a tiktokcdn MEDIA url, not a watch URL — swap in the real
  // tiktok.com link from `videos` (one bounded .in() on ≤limit ids). Null when
  // missing, so callers never link a creator to a raw CDN file.
  if (top.length > 0) {
    const { data: vids } = await supabase
      .from('videos')
      .select('video_id, video_link')
      .in('video_id', top.map((t) => t.videoId));
    const watch = new Map<string, string>();
    for (const v of vids ?? []) {
      if (v.video_link && String(v.video_link).includes('tiktok.com')) {
        watch.set(String(v.video_id), String(v.video_link));
      }
    }
    for (const t of top) t.videoUrl = watch.get(t.videoId) ?? null;
  }
  return top;
}

/** Posting streak: distinct days with at least one video in the past 90 days. */
export async function getCreatorStreak(
  handles: string[],
  brandSlug: string | null
): Promise<number> {
  if (handles.length === 0) return 0;
  const supabase = await createAdminClient();
  const reg = await getBrandRegistry();
  const brandUuid = brandFilter(reg, brandSlug);

  const today = new Date();
  const start = new Date(today);
  start.setUTCDate(start.getUTCDate() - 90);

  const filters: { column: string; op: 'eq' | 'in' | 'gte' | 'lte'; value: any }[] = [
    { column: 'tiktok_username', op: 'in', value: handles },
    { column: 'report_date', op: 'gte', value: start.toISOString().slice(0, 10) },
  ];
  if (brandUuid) filters.push({ column: 'brand_id', op: 'in', value: brandUuid });

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
export interface BrandBreakdownRow {
  brandSlug: string;
  brandDisplayName: string;
  brandColor: string;
  retainer: number;
  monthlyPostRequirement: number;
  postsThisMonth: number | null;
  gmv: number | null;
  orders: number | null;
}

/**
 * Per-brand breakdown for the creator's "All Brands" view: their retainer + post
 * quota (from their own contracts) joined with GMV over the window and posts this
 * month, one row per contracted brand. gmv/posts come back null (rendered "—") on
 * a failed read — never a fake $0. These are only ever the creator's OWN numbers.
 */
export async function getAllBrandsBreakdown(
  handles: string[],
  contracts: CreatorContract[],
  window: DateWindow,
): Promise<BrandBreakdownRow[]> {
  return Promise.all(
    contracts.map(async (c) => {
      const [summary, posts] = await Promise.all([
        getCreatorSummary(handles, c.brandSlug, window).catch(() => null),
        getMonthVideoCount(handles, c.brandSlug).catch(() => null),
      ]);
      return {
        brandSlug: c.brandSlug,
        brandDisplayName: c.brandDisplayName,
        brandColor: c.brandColor,
        retainer: c.retainer,
        monthlyPostRequirement: c.monthlyPostRequirement,
        postsThisMonth: posts,
        gmv: summary ? summary.totalGmv : null,
        orders: summary ? summary.totalOrders : null,
      };
    }),
  );
}

export async function getMonthVideoCount(
  handles: string[],
  brandSlug: string | null
): Promise<number> {
  if (handles.length === 0) return 0;
  const supabase = await createAdminClient();
  const reg = await getBrandRegistry();
  const brandUuid = brandFilter(reg, brandSlug);

  const now = new Date();
  const start = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
  const end = now.toISOString().slice(0, 10);

  const filters: { column: string; op: 'eq' | 'in' | 'gte' | 'lte'; value: any }[] = [
    { column: 'tiktok_username', op: 'in', value: handles },
    { column: 'report_date', op: 'gte', value: start },
    { column: 'report_date', op: 'lte', value: end },
  ];
  if (brandUuid) filters.push({ column: 'brand_id', op: 'in', value: brandUuid });

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

/**
 * Brand-level leaderboard with CURRENT + PRIOR-window ranks, in one RPC
 * round-trip (get_brand_rankings, migration 086). The old TS version paginated
 * the whole brand window TWICE (current + prior ≈ 2×95 round-trips on LeeFar
 * 30d) and ranked client-side. Rows beyond `limit` are included when they're
 * the caller's own handles, so "me" always shows with a true rank.
 */
export async function getBrandRankings(
  brandSlug: string | null,
  window: DateWindow,
  myHandles: string[],
  limit = 50,
): Promise<(RankingEntry & { priorRank: number | null })[]> {
  const supabase = await createAdminClient();
  const reg = await getBrandRegistry();
  const brandUuid = brandFilter(reg, brandSlug);
  if (brandUuid !== null && brandUuid.length === 0) return []; // unresolvable brand
  const prior = priorWindow(window);

  const lowered = Array.from(
    new Set(myHandles.map((h) => h.replace(/^@/, '').trim().toLowerCase()).filter(Boolean)),
  );
  const { data, error } = await supabase.rpc('get_brand_rankings', {
    p_handles: lowered,
    p_brand_ids: brandUuid,
    p_start: window.start,
    p_end: window.end,
    p_prior_start: prior.start,
    p_prior_end: prior.end,
    p_limit: limit,
  });
  if (error) throw error;

  const rows = ((data as Record<string, unknown>[] | null) ?? []).map((r) => ({
    rank: Number(r.rank) || 0,
    tiktokUsername: String(r.tiktok_username || ''),
    gmv: Number(r.gmv) || 0,
    orders: Number(r.orders) || 0,
    videos: Number(r.videos) || 0,
    priorRank: r.prior_rank == null ? null : Number(r.prior_rank),
    isMe: !!r.is_me,
  }));

  // Resolve display names for the rows we'll actually show (one bounded read).
  const nameMap = new Map<string, string>();
  const usernames = Array.from(new Set(rows.map((r) => r.tiktokUsername).filter(Boolean)));
  if (usernames.length > 0) {
    const { data: ta } = await supabase
      .from('tiktok_accounts')
      .select('tiktok_username, creator_id, creators_v2!inner(real_name)')
      .in('tiktok_username', usernames);
    for (const row of ta ?? []) {
      const name = (row as any).creators_v2?.real_name;
      if (name && row.tiktok_username) {
        nameMap.set(row.tiktok_username.toLowerCase(), name);
      }
    }
  }

  return rows.map((r) => ({ ...r, realName: nameMap.get(r.tiktokUsername) ?? null }));
}

export interface RankChase {
  brandSlug: string | null;
  myRank: number;
  total: number; // size of the ranked pool
  gmv: number;
  /** The creator one spot above (null if the creator is #1). */
  above: { name: string; gmv: number; gap: number } | null;
}
// NOTE: the old getRankChase() is gone — Home derives RankChase from
// getBrandStanding (one RPC), which also powers the standing band + ladder.

export interface BrandStanding {
  brandSlug: string;
  brandGmv: number;
  brandOrders: number;
  creatorCount: number; // distinct creators with GMV > 0 (the ranked pool)
  postCount: number;    // distinct videos across the brand in the window
  myRank: number;
  myGmv: number;
  myShare: number;      // myGmv / brandGmv, 0..1
  above: { name: string; handle: string; gmv: number; gap: number } | null;
  below: { name: string; handle: string; gmv: number } | null;
}

/**
 * The creator's standing within ONE brand: brand-wide totals (GMV / orders /
 * creators / posts), the creator's share + rank, and the neighbours one rung up
 * and down. Powers BOTH the "where you stand" band and the rank ladder on Home.
 *
 * Backed by the get_brand_standing RPC (migration 085) — ONE round-trip. The
 * previous TS version paginated the whole brand window out of
 * daily_video_product_stats (94k rows ≈ 95 sequential round-trips on LeeFar
 * 30d), which alone made Home take ~10s. Count round-trips, not SQL.
 * Returns null when the creator has no GMV on the brand — never a fake zero.
 */
export async function getBrandStanding(
  handles: string[],
  brandSlug: string | null,
  window: DateWindow,
): Promise<BrandStanding | null> {
  if (handles.length === 0 || !brandSlug) return null;
  const supabase = await createAdminClient();
  const reg = await getBrandRegistry();
  const brandUuid = brandFilter(reg, brandSlug);
  if (brandUuid !== null && brandUuid.length === 0) return null; // unresolvable brand

  const lowered = Array.from(
    new Set(handles.map((h) => h.replace(/^@/, '').trim().toLowerCase()).filter(Boolean)),
  );
  const { data, error } = await supabase.rpc('get_brand_standing', {
    p_handles: lowered,
    p_brand_ids: brandUuid, // null = no filter
    p_start: window.start,
    p_end: window.end,
  });
  if (error) throw error;
  const row = (data as Record<string, unknown>[] | null)?.[0];
  if (!row || row.my_rank == null) return null; // no standing without GMV

  const brandGmv = Number(row.brand_gmv) || 0;
  const myGmv = Number(row.my_gmv) || 0;
  const aboveHandle = (row.above_handle as string | null) ?? null;
  const belowHandle = (row.below_handle as string | null) ?? null;

  // Resolve display names for just the two neighbours we'll render.
  const nameMap = new Map<string, string>();
  const needNames = [aboveHandle, belowHandle].filter(Boolean) as string[];
  if (needNames.length > 0) {
    const { data: ta } = await supabase
      .from('tiktok_accounts')
      .select('tiktok_username, creators_v2!inner(real_name)')
      .in('tiktok_username', needNames);
    for (const r of ta ?? []) {
      const name = (r as any).creators_v2?.real_name;
      if (name && r.tiktok_username) nameMap.set(r.tiktok_username.toLowerCase(), name);
    }
  }

  return {
    brandSlug,
    brandGmv,
    brandOrders: Number(row.brand_orders) || 0,
    creatorCount: Number(row.creator_count) || 0,
    postCount: Number(row.post_count) || 0,
    myRank: Number(row.my_rank) || 0,
    myGmv,
    myShare: brandGmv > 0 ? myGmv / brandGmv : 0,
    above: aboveHandle
      ? {
          name: nameMap.get(aboveHandle) || `@${aboveHandle}`,
          handle: aboveHandle,
          gmv: Number(row.above_gmv) || 0,
          gap: Math.max(0, (Number(row.above_gmv) || 0) - myGmv),
        }
      : null,
    below: belowHandle
      ? {
          name: nameMap.get(belowHandle) || `@${belowHandle}`,
          handle: belowHandle,
          gmv: Number(row.below_gmv) || 0,
        }
      : null,
  };
}

/**
 * Network-wide top videos (for Inspiration). Backed by the
 * get_inspiration_videos RPC (migration 085) — one round-trip. The previous TS
 * version paginated the ENTIRE brand window (94k rows ≈ 95 round-trips on
 * LeeFar 30d) just to keep the top N after aggregating client-side.
 */
export async function getInspirationVideos(
  brandSlug: string | null,
  window: DateWindow,
  limit = 24,
  /** Only videos POSTED on/after this date (YYYY-MM-DD) — the "New (7)" view. */
  postedSince?: string,
): Promise<(CreatorVideoRow & { isMine: boolean })[]> {
  const supabase = await createAdminClient();
  const reg = await getBrandRegistry();
  const brandUuid = brandFilter(reg, brandSlug);
  if (brandUuid !== null && brandUuid.length === 0) return []; // unresolvable brand

  const { data, error } = await supabase.rpc('get_inspiration_videos', {
    p_brand_ids: brandUuid, // null = no filter
    p_start: window.start,
    p_end: window.end,
    p_limit: limit,
    p_posted_since: postedSince ?? null,
  });
  if (error) throw error;

  return ((data as Record<string, unknown>[] | null) ?? []).map((r) => ({
    videoId: String(r.video_id),
    videoTitle: (r.video_title as string) || '(untitled)',
    videoUrl: (r.video_url as string) || null,
    postDate: (r.post_date as string) || null,
    tiktokUsername: String(r.tiktok_username || ''),
    brandSlug: uuidToSlug(reg, String(r.brand_id)) || String(r.brand_id),
    gmv: Number(r.gmv) || 0,
    orders: Number(r.orders) || 0,
    itemsSold: Number(r.items_sold) || 0,
    commission: Number(r.commission) || 0,
    daysActive: Number(r.days_active) || 0,
    topProduct: (r.top_product as string) || null,
    isMine: false,
  }));
}

// ---- Network flex + untapped assignment (Home) ---------------------------

export interface NetworkFlex {
  networkGmv: number;
  creatorCount: number;
  myGmv: number;
  myRank: number;
  percentile: number; // myRank / creatorCount, 0..1
}

/**
 * Network-scale context for the Home hero band: total network GMV, how many
 * creators drove GMV, and the creator's rank across the whole network in the
 * window. Backed by get_creator_network_flex (migration 084) on the small
 * daily_creator_stats rollup — one RPC round-trip, streamed behind Suspense so
 * it never blocks Home. Returns null with no standing (no GMV) → band hidden.
 */
export async function getNetworkFlex(
  handles: string[],
  window: DateWindow,
): Promise<NetworkFlex | null> {
  if (handles.length === 0) return null;
  const supabase = await createAdminClient();
  const lowered = Array.from(
    new Set(handles.map((h) => h.replace(/^@/, '').trim().toLowerCase()).filter(Boolean)),
  );
  if (lowered.length === 0) return null;
  const { data, error } = await supabase.rpc('get_creator_network_flex', {
    p_handles: lowered,
    p_start: window.start,
    p_end: window.end,
  });
  if (error) throw error;
  const row = (data as Record<string, unknown>[] | null)?.[0];
  if (!row) return null;
  const networkGmv = Number(row.network_gmv) || 0;
  const creatorCount = Number(row.creator_count) || 0;
  const myGmv = Number(row.my_gmv) || 0;
  const myRank = Number(row.my_rank) || 0;
  if (myGmv <= 0 || creatorCount === 0 || myRank === 0) return null;
  return { networkGmv, creatorCount, myGmv, myRank, percentile: myRank / creatorCount };
}

export interface UntappedProduct {
  productKey: string;
  displayName: string;
  brandSlug: string;
}

/**
 * One product the creator is ASSIGNED (managed_creators.product_assignments,
 * catalog product_keys) but has NOT sold in the window — a "you're leaving this
 * on the table" nudge for the money-makers list. Resolves keys → the products
 * catalog (display_name + product_ids) and checks the creator's sold product_ids.
 * Returns null when the creator has no assignments (cost-free for them) or has
 * sold everything they're assigned.
 */
export async function getUntappedAssignment(
  handles: string[],
  contracts: CreatorContract[],
  window: DateWindow,
): Promise<UntappedProduct | null> {
  const assignedKeys = Array.from(
    new Set(contracts.flatMap((c) => c.productAssignments || []).filter(Boolean)),
  );
  if (assignedKeys.length === 0 || handles.length === 0) return null;

  const supabase = await createAdminClient();
  const { data: cat } = await supabase
    .from('products')
    .select('product_key, display_name, brand, product_ids, status')
    .in('product_key', assignedKeys);

  type CatRow = {
    product_key: string;
    display_name: string | null;
    brand: string;
    product_ids: string[] | null;
    status: string | null;
  };
  const catalog = ((cat ?? []) as CatRow[]).filter(
    (p) => p.status !== 'archived' && Array.isArray(p.product_ids) && p.product_ids.length > 0,
  );
  if (catalog.length === 0) return null;

  // The creator's own sold product_ids in the window (their rows only — bounded).
  const soldRows = await paginated(supabase, 'daily_video_product_stats', 'product_id', [
    { column: 'tiktok_username', op: 'in', value: handles },
    { column: 'report_date', op: 'gte', value: window.start },
    { column: 'report_date', op: 'lte', value: window.end },
  ]);
  const sold = new Set<string>();
  for (const r of soldRows) if (r.product_id) sold.add(String(r.product_id));

  const untapped = catalog.find((p) => !(p.product_ids ?? []).some((id) => sold.has(String(id))));
  if (!untapped) return null;
  return {
    productKey: untapped.product_key,
    displayName: untapped.display_name || untapped.product_key,
    brandSlug: untapped.brand,
  };
}

// ---- Action stack (Home page) --------------------------------------------

export interface CreatorAction {
  kind: 'no_post' | 'pace_behind' | 'rank_gap' | 'hot_video' | 'streak';
  tone: 'urgent' | 'opportunity' | 'positive';
  headline: string;
  detail: string;
  cta?: { label: string; href: string };
  /** Higher = surfaced first. Roughly "dollars / retainer at stake". */
  score: number;
}

/**
 * "Your next moves" — a scored, deduped stack of up to 3 concrete, data-backed
 * actions, each with a real CTA. Replaces the single-nudge engine: instead of
 * showing one of four hardcoded rules, it scores every applicable signal by
 * dollars/retainer at stake and returns the top few. Every branch has a
 * destination — no dead-ends.
 */
export function buildActionStack(args: {
  monthVideos: number;
  monthlyTarget: number;
  streak: number;
  topVideo: CreatorVideoRow | null;
  summary: CreatorSummary;
  daysLeftInMonth: number;
  brands: BrandBreakdownRow[];
  rankChase: RankChase | null;
}): CreatorAction[] {
  const { monthVideos, monthlyTarget, streak, topVideo, summary, daysLeftInMonth, brands, rankChase } = args;
  const actions: CreatorAction[] = [];
  const DISCOVER = '/creator-dashboard/discover';

  // Hasn't posted at all in the window — the most urgent state.
  if (summary.videoCount === 0) {
    actions.push({
      kind: 'no_post',
      tone: 'urgent',
      headline: `You haven't posted this period`,
      detail: `Momentum fades fast. Browse what's winning across the network and get one up today.`,
      cta: { label: 'Find something to post', href: DISCOVER },
      score: 1000,
    });
  }

  // Per-brand retainer pace — specific to the brand whose retainer is at risk.
  const contracted = brands.filter((b) => b.retainer > 0 && b.monthlyPostRequirement > 0);
  for (const b of contracted) {
    const posted = b.postsThisMonth ?? 0;
    const behind = b.monthlyPostRequirement - posted;
    if (behind <= 0) continue;
    const perDay = daysLeftInMonth > 0 ? Math.ceil(behind / daysLeftInMonth) : behind;
    actions.push({
      kind: 'pace_behind',
      tone: 'urgent',
      headline: `Protect your ${b.brandDisplayName} retainer`,
      detail: `${behind} more post${behind === 1 ? '' : 's'} this month fully earns your ${formatMoney(b.retainer)}/mo${daysLeftInMonth > 0 ? `, about ${perDay}/day for ${daysLeftInMonth} day${daysLeftInMonth === 1 ? '' : 's'}` : ''}.`,
      cta: { label: 'Find inspiration', href: DISCOVER },
      // Dollars at stake = the retainer; nudged up as the gap widens.
      score: b.retainer + behind * 15,
    });
  }
  // Aggregate fallback if we have a target but no per-brand rows resolved.
  if (contracted.length === 0 && monthlyTarget > 0) {
    const behind = monthlyTarget - monthVideos;
    if (behind > 0) {
      const perDay = daysLeftInMonth > 0 ? Math.ceil(behind / daysLeftInMonth) : behind;
      actions.push({
        kind: 'pace_behind',
        tone: 'urgent',
        headline: `You're behind retainer pace`,
        detail: `${behind} more post${behind === 1 ? '' : 's'} this month${daysLeftInMonth > 0 ? `, about ${perDay}/day for ${daysLeftInMonth} day${daysLeftInMonth === 1 ? '' : 's'}` : ''}.`,
        cta: { label: 'Find inspiration', href: DISCOVER },
        score: 500 + behind * 15,
      });
    }
  }

  // Catch the creator one rank above — competitive pull.
  if (rankChase?.above && rankChase.above.gap > 0) {
    const avgPerVideo = summary.totalGmv / Math.max(1, summary.videoCount);
    const vids = avgPerVideo > 0 ? Math.max(1, Math.ceil(rankChase.above.gap / avgPerVideo)) : null;
    actions.push({
      kind: 'rank_gap',
      tone: 'opportunity',
      headline: `Catch ${rankChase.above.name} for #${rankChase.myRank - 1}`,
      detail: `You're ${formatMoney(rankChase.above.gap)} behind${vids ? `, about ${vids} video${vids === 1 ? '' : 's'} at your average` : ''}. You're currently #${rankChase.myRank}.`,
      cta: { label: 'See the leaderboard', href: '/creator-dashboard/rankings' },
      // Closer gaps score higher (more beatable).
      score: 350 + Math.max(0, 150 - rankChase.above.gap / 20),
    });
  }

  // A proven winner — re-hit it while the audience/algorithm still favor it.
  // If it's actively COOLING (recent-half GMV well below the prior half), that's
  // more urgent: catch the residual demand before it dies.
  if (topVideo && summary.videoCount > 0) {
    const avgPerVideo = summary.totalGmv / Math.max(1, summary.videoCount);
    if (topVideo.gmv >= avgPerVideo * 2.5 && topVideo.gmv >= 200) {
      const mult = (topVideo.gmv / Math.max(1, avgPerVideo)).toFixed(1);
      const subject = topVideo.topProduct || `"${truncate(topVideo.videoTitle, 44)}"`;
      const cooling =
        topVideo.priorGmv != null &&
        topVideo.recentGmv != null &&
        topVideo.priorGmv >= 200 &&
        topVideo.recentGmv < topVideo.priorGmv * 0.5;
      const cta = topVideo.videoUrl
        ? { label: 'Rewatch it', href: topVideo.videoUrl }
        : { label: 'Find inspiration', href: DISCOVER };
      if (cooling) {
        const drop = Math.round((1 - topVideo.recentGmv! / topVideo.priorGmv!) * 100);
        actions.push({
          kind: 'hot_video',
          tone: 'urgent',
          headline: `Your ${subject} winner is cooling`,
          detail: `"${truncate(topVideo.videoTitle, 50)}" did ${formatMoney(topVideo.gmv)} but has slowed ${drop}%. Shoot a v2 now to catch the last of the demand.`,
          cta,
          score: 420 + topVideo.gmv / 20,
        });
      } else {
        actions.push({
          kind: 'hot_video',
          tone: 'opportunity',
          headline: `Re-hit ${subject}`,
          detail: `Your "${truncate(topVideo.videoTitle, 50)}" did ${formatMoney(topVideo.gmv)}, ${mult}× your average. A follow-up is your highest-odds next post.`,
          cta,
          score: Math.min(300, topVideo.gmv / 10),
        });
      }
    }
  }

  // Positive reinforcement — lowest priority, only if nothing more urgent fills the slot.
  if (streak >= 7) {
    actions.push({
      kind: 'streak',
      tone: 'positive',
      headline: `${streak}-day posting streak`,
      detail: `Consistency compounds. Every post keeps you in the algorithm, so don't break it today.`,
      score: 40,
    });
  }

  return actions.sort((a, b) => b.score - a.score).slice(0, 3);
}

function truncate(s: string, n: number) {
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}
// Whole dollars, never compact rounding — owner call ("not rounded like $80K").
function formatMoney(n: number) {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}
