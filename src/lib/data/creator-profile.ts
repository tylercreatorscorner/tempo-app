/**
 * Admin-side creator profile data layer.
 *
 * Source-of-truth split (per project memory):
 *   creators_v2          — identity (id, real_name, email, phone, notes, status, role)
 *   tiktok_accounts      — creator → tiktok handles (creator_id ↔ tiktok_username)
 *   managed_creators     — per-brand contracts (retainer, post quota, tier).
 *                          Bridged via tiktok handle overlap (account_1..account_10),
 *                          NOT email.
 *   daily_video_product_stats — canonical per-video, per-product, per-day stats.
 *                                Queried by tiktok_username (+ optional brand_id of
 *                                the brand whose product was sold, NOT the creator's
 *                                brand assignment).
 *
 * GMV follows the handle. Filtering by `brand` here filters to videos that sold
 * that brand's products — independent of which brand the creator is contracted to.
 */
import { createClient } from '@/lib/supabase/server';
import { brandSlugToUuid, brandUuidToSlug } from '@/lib/utils/constants';

// --- Types ---

export interface CreatorProfile {
  id: string; // UUID
  real_name: string;
  brand: string; // primary brand slug (highest-retainer managed contract)
  role: string | null;
  status: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  retainer: number | null;
  monthly_post_requirement: number | null;
  retainer_start_date: string | null;
  accounts: CreatorAccount[];
  brands: string[]; // all brands (performance + account registrations) — slugs
  brandsWithData: string[]; // only brands with actual performance data — slugs
}

export interface CreatorAccount {
  tiktok_username: string;
  brand: string; // slug
  is_primary: boolean;
  verified: boolean;
  brands: string[]; // actual brands from performance data — slugs
}

export interface CreatorSummaryData {
  total_gmv: number;
  total_orders: number;
  total_items_sold: number;
  total_videos: number;
  total_commission: number;
  prev_gmv: number;
  prev_orders: number;
  prev_items_sold: number;
  prev_videos: number;
  prev_commission: number;
}

export interface AccountBreakdownRow {
  tiktok_username: string;
  brands: string[];
  gmv: number;
  orders: number;
  items_sold: number;
  videos: number;
}

export interface BrandBreakdownRow {
  brand: string;
  gmv: number;
  orders: number;
  items_sold: number;
  videos: number;
  commission: number;
}

export interface CreatorVideo {
  video_id: string;
  video_title: string;
  creator_name: string;
  brand: string;
  product_name: string;
  gmv: number;
  orders: number;
  items_sold: number;
  days_selling: number;
}

export interface CreatorLifetimeStats {
  total_gmv: number;
  total_orders: number;
  total_videos: number;
  total_commission: number;
  first_active_date: string | null;
  months_active: number;
}

// --- Pagination helper ---
//
// daily_video_product_stats is per-video × per-product × per-day, so a single
// creator's window can easily exceed Supabase's 1000-row default limit.

const PAGE = 1000;

type Filter =
  | { column: string; op: 'eq' | 'gte' | 'lte'; value: string | number }
  | { column: string; op: 'in'; value: readonly string[] };

async function paginated(
  table: string,
  columns: string,
  filters: Filter[]
): Promise<Record<string, unknown>[]> {
  const supabase = await createClient();
  const all: Record<string, unknown>[] = [];
  let from = 0;
  while (true) {
    let q = supabase.from(table).select(columns).range(from, from + PAGE - 1) as ReturnType<
      ReturnType<typeof supabase.from>['select']
    >;
    for (const f of filters) {
      switch (f.op) {
        case 'eq': q = q.eq(f.column, f.value); break;
        case 'in': q = q.in(f.column, f.value as readonly string[]); break;
        case 'gte': q = q.gte(f.column, f.value); break;
        case 'lte': q = q.lte(f.column, f.value); break;
      }
    }
    const { data, error } = await q;
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...(data as Record<string, unknown>[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

function brandFilters(brand?: string): Filter[] {
  if (!brand) return [];
  const uuid = brandSlugToUuid(brand);
  return uuid ? [{ column: 'brand_id', op: 'eq', value: uuid }] : [];
}

// --- Brand discovery (from product stats) ---

/** Map each handle → distinct product-brands it has sold. */
async function getBrandsByHandle(handles: string[]): Promise<Map<string, string[]>> {
  if (handles.length === 0) return new Map();
  const rows = await paginated(
    'daily_video_product_stats',
    'tiktok_username, brand_id',
    [{ column: 'tiktok_username', op: 'in', value: handles }]
  );
  const map = new Map<string, Set<string>>();
  for (const r of rows) {
    const handle = r.tiktok_username as string;
    const slug = brandUuidToSlug(r.brand_id as string);
    if (!handle || !slug) continue;
    if (!map.has(handle)) map.set(handle, new Set());
    map.get(handle)!.add(slug);
  }
  const out = new Map<string, string[]>();
  for (const [h, s] of map) out.set(h, Array.from(s));
  return out;
}

// --- Managed contract resolution ---

const MANAGED_CREATOR_COLUMNS =
  'id, brand, retainer, monthly_post_requirement, notes, status, employment_status, retainer_start_date, ' +
  'account_1, account_2, account_3, account_4, account_5, account_6, account_7, account_8, account_9, account_10';

interface ManagedRow {
  id: number;
  brand: string;
  retainer: number | null;
  monthly_post_requirement: number | null;
  notes: string | null;
  status: string | null;
  employment_status: string | null;
  retainer_start_date: string | null;
  account_1: string | null; account_2: string | null; account_3: string | null;
  account_4: string | null; account_5: string | null; account_6: string | null;
  account_7: string | null; account_8: string | null; account_9: string | null;
  account_10: string | null;
}

/**
 * Find every managed_creators row whose account_1..10 overlap with the given
 * handles. Deduped to one row per brand (most-retainer wins).
 */
async function getManagedRowsForHandles(handles: string[]): Promise<ManagedRow[]> {
  if (handles.length === 0) return [];
  const supabase = await createClient();

  const lowered = handles.map((h) => h.trim().toLowerCase()).filter(Boolean);
  if (lowered.length === 0) return [];

  const orFilter = Array.from({ length: 10 }, (_, i) =>
    `account_${i + 1}.in.(${lowered.map((h) => `"${h}"`).join(',')})`
  ).join(',');

  const { data, error } = await supabase
    .from('managed_creators')
    .select(MANAGED_CREATOR_COLUMNS)
    .or(orFilter);
  if (error) throw error;

  const handleSet = new Set(lowered);
  const byBrand = new Map<string, ManagedRow>();
  for (const row of ((data ?? []) as unknown) as ManagedRow[]) {
    const rowHandles = [
      row.account_1, row.account_2, row.account_3, row.account_4, row.account_5,
      row.account_6, row.account_7, row.account_8, row.account_9, row.account_10,
    ]
      .map((h) => (h ?? '').trim().toLowerCase())
      .filter(Boolean);
    if (!rowHandles.some((h) => handleSet.has(h))) continue;
    const existing = byBrand.get(row.brand);
    const r = (Number(row.retainer) || 0);
    if (!existing || r > (Number(existing.retainer) || 0)) {
      byBrand.set(row.brand, row);
    }
  }
  return Array.from(byBrand.values()).sort(
    (a, b) => (Number(b.retainer) || 0) - (Number(a.retainer) || 0)
  );
}

// --- Query Functions ---

/**
 * Fetch a creator profile by creators_v2 ID (UUID), including all linked accounts.
 */
export async function getCreatorProfile(creatorId: string | number): Promise<CreatorProfile | null> {
  const supabase = await createClient();
  const id = String(creatorId);

  const { data: creator, error } = await supabase
    .from('creators_v2')
    .select('*')
    .eq('id', id)
    .single();
  if (error || !creator) return null;

  const { data: accounts } = await supabase
    .from('tiktok_accounts')
    .select('tiktok_username, brand_id, is_primary, verified')
    .eq('creator_id', id);

  const accountList = (accounts ?? []).map((a: Record<string, unknown>) => ({
    tiktok_username: a.tiktok_username as string,
    brand: brandUuidToSlug(a.brand_id as string) ?? (a.brand_id as string),
    is_primary: !!a.is_primary,
    verified: !!a.verified,
    brands: [] as string[],
  }));

  const handles = accountList.map((a) => a.tiktok_username).filter(Boolean);

  // Fetch managed contracts (canonical retainer/role/status source) and
  // per-handle product-brand registrations in parallel.
  const [managedRows, brandsByHandle] = await Promise.all([
    getManagedRowsForHandles(handles),
    getBrandsByHandle(handles),
  ]);

  // Populate per-account brands
  for (const account of accountList) {
    account.brands = brandsByHandle.get(account.tiktok_username) ?? [];
  }

  const perfBrands = new Set<string>();
  for (const brands of brandsByHandle.values()) {
    for (const b of brands) perfBrands.add(b);
  }

  const accountBrands = new Set<string>();
  for (const a of accountList) {
    if (a.brand) accountBrands.add(a.brand);
  }

  // Also include managed-contract brands so a freshly-signed creator
  // shows their contract brand even before performance data lands.
  const contractBrands = new Set<string>(managedRows.map((r) => r.brand));
  const combinedBrands = new Set([...perfBrands, ...accountBrands, ...contractBrands]);

  // Primary brand = highest-retainer managed contract, else first perf brand,
  // else first registered account brand.
  const primary = managedRows[0];
  const primaryBrand =
    primary?.brand ??
    Array.from(perfBrands)[0] ??
    Array.from(accountBrands)[0] ??
    '';

  return {
    id: creator.id,
    real_name: creator.real_name ?? 'Unknown',
    brand: primaryBrand,
    role: (creator.role as string | null) ?? null,
    status: (creator.status as string | null) ?? primary?.employment_status ?? null,
    email: creator.email ?? null,
    phone: creator.phone ?? null,
    notes: creator.notes ?? null,
    retainer: primary ? Number(primary.retainer) || 0 : null,
    monthly_post_requirement: primary ? Number(primary.monthly_post_requirement) || 0 : null,
    retainer_start_date: primary?.retainer_start_date ?? null,
    accounts: accountList,
    brands: Array.from(combinedBrands),
    brandsWithData: Array.from(perfBrands),
  };
}

/**
 * Look up creator_id (UUID) from a TikTok username handle.
 */
export async function getCreatorIdByHandle(handle: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('tiktok_accounts')
    .select('creator_id')
    .ilike('tiktok_username', handle)
    .not('creator_id', 'is', null)
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data.creator_id as string;
}

/** Helper: get all TikTok usernames for a creator */
async function getHandles(creatorId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('tiktok_accounts')
    .select('tiktok_username')
    .eq('creator_id', creatorId);
  return (data ?? [])
    .map((r: Record<string, unknown>) => r.tiktok_username as string)
    .filter(Boolean);
}

/** Helper: compute date diff for prior period comparison */
function getPriorPeriod(startDate: string, endDate: string): { prevStart: string; prevEnd: string } {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffMs = end.getTime() - start.getTime();
  const prevEnd = new Date(start.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - diffMs);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { prevStart: fmt(prevStart), prevEnd: fmt(prevEnd) };
}

/**
 * Aggregate performance from daily_video_product_stats for given handles + range.
 * `videos` is COUNT(DISTINCT video_id) since the table is per-row-per-product.
 */
async function aggregatePerformance(
  handles: string[],
  startDate: string,
  endDate: string,
  brand?: string
): Promise<{ gmv: number; orders: number; items_sold: number; videos: number; commission: number }> {
  if (handles.length === 0) return { gmv: 0, orders: 0, items_sold: 0, videos: 0, commission: 0 };

  const filters: Filter[] = [
    { column: 'tiktok_username', op: 'in', value: handles },
    { column: 'report_date', op: 'gte', value: startDate },
    { column: 'report_date', op: 'lte', value: endDate },
    ...brandFilters(brand),
  ];

  const rows = await paginated(
    'daily_video_product_stats',
    'video_id, gmv, orders, items_sold, est_commission',
    filters
  );

  const videoIds = new Set<string>();
  let gmv = 0, orders = 0, items_sold = 0, commission = 0;
  for (const r of rows) {
    gmv += Number(r.gmv) || 0;
    orders += Number(r.orders) || 0;
    items_sold += Number(r.items_sold) || 0;
    commission += Number(r.est_commission) || 0;
    if (r.video_id) videoIds.add(r.video_id as string);
  }
  return { gmv, orders, items_sold, videos: videoIds.size, commission };
}

/**
 * Aggregated summary across all of a creator's accounts, with prior-period delta.
 */
export async function getCreatorSummary(
  creatorId: string | number,
  startDate: string,
  endDate: string,
  brand?: string
): Promise<CreatorSummaryData> {
  const handles = await getHandles(String(creatorId));
  const { prevStart, prevEnd } = getPriorPeriod(startDate, endDate);

  const [current, previous] = await Promise.all([
    aggregatePerformance(handles, startDate, endDate, brand),
    aggregatePerformance(handles, prevStart, prevEnd, brand),
  ]);

  return {
    total_gmv: current.gmv,
    total_orders: current.orders,
    total_items_sold: current.items_sold,
    total_videos: current.videos,
    total_commission: current.commission,
    prev_gmv: previous.gmv,
    prev_orders: previous.orders,
    prev_items_sold: previous.items_sold,
    prev_videos: previous.videos,
    prev_commission: previous.commission,
  };
}

/**
 * Per-account performance breakdown.
 */
export async function getCreatorAccountBreakdown(
  creatorId: string | number,
  startDate: string,
  endDate: string,
  brand?: string
): Promise<AccountBreakdownRow[]> {
  const supabase = await createClient();
  const id = String(creatorId);

  const { data: accounts } = await supabase
    .from('tiktok_accounts')
    .select('tiktok_username, brand_id')
    .eq('creator_id', id);
  if (!accounts || accounts.length === 0) return [];

  const handles = accounts
    .map((a: Record<string, unknown>) => a.tiktok_username as string)
    .filter(Boolean);

  const filters: Filter[] = [
    { column: 'tiktok_username', op: 'in', value: handles },
    { column: 'report_date', op: 'gte', value: startDate },
    { column: 'report_date', op: 'lte', value: endDate },
    ...brandFilters(brand),
  ];

  const rows = await paginated(
    'daily_video_product_stats',
    'tiktok_username, brand_id, video_id, gmv, orders, items_sold',
    filters
  );

  type Acc = AccountBreakdownRow & { videoIds: Set<string>; brandSet: Set<string> };
  const map = new Map<string, Acc>();
  for (const a of accounts) {
    const handle = a.tiktok_username as string;
    if (!handle) continue;
    map.set(handle, {
      tiktok_username: handle,
      brands: [],
      gmv: 0,
      orders: 0,
      items_sold: 0,
      videos: 0,
      videoIds: new Set(),
      brandSet: new Set(),
    });
  }

  for (const r of rows) {
    const acc = map.get(r.tiktok_username as string);
    if (!acc) continue;
    acc.gmv += Number(r.gmv) || 0;
    acc.orders += Number(r.orders) || 0;
    acc.items_sold += Number(r.items_sold) || 0;
    if (r.video_id) acc.videoIds.add(r.video_id as string);
    const slug = brandUuidToSlug(r.brand_id as string);
    if (slug) acc.brandSet.add(slug);
  }

  return Array.from(map.values())
    .map((a) => ({
      tiktok_username: a.tiktok_username,
      brands: Array.from(a.brandSet),
      gmv: a.gmv,
      orders: a.orders,
      items_sold: a.items_sold,
      videos: a.videoIds.size,
    }))
    .sort((a, b) => b.gmv - a.gmv);
}

/**
 * Per-brand performance breakdown (across all of a creator's handles).
 * Brand here = product brand, not contract assignment.
 */
export async function getCreatorBrandBreakdown(
  creatorId: string | number,
  startDate: string,
  endDate: string
): Promise<BrandBreakdownRow[]> {
  const handles = await getHandles(String(creatorId));
  if (handles.length === 0) return [];

  const rows = await paginated(
    'daily_video_product_stats',
    'brand_id, video_id, gmv, orders, items_sold, est_commission',
    [
      { column: 'tiktok_username', op: 'in', value: handles },
      { column: 'report_date', op: 'gte', value: startDate },
      { column: 'report_date', op: 'lte', value: endDate },
    ]
  );

  type Acc = Omit<BrandBreakdownRow, 'videos'> & { videoIds: Set<string> };
  const map = new Map<string, Acc>();
  for (const r of rows) {
    const slug = brandUuidToSlug(r.brand_id as string) ?? (r.brand_id as string);
    let acc = map.get(slug);
    if (!acc) {
      acc = {
        brand: slug,
        gmv: 0,
        orders: 0,
        items_sold: 0,
        commission: 0,
        videoIds: new Set(),
      };
      map.set(slug, acc);
    }
    acc.gmv += Number(r.gmv) || 0;
    acc.orders += Number(r.orders) || 0;
    acc.items_sold += Number(r.items_sold) || 0;
    acc.commission += Number(r.est_commission) || 0;
    if (r.video_id) acc.videoIds.add(r.video_id as string);
  }

  return Array.from(map.values())
    .map((a) => ({
      brand: a.brand,
      gmv: a.gmv,
      orders: a.orders,
      items_sold: a.items_sold,
      videos: a.videoIds.size,
      commission: a.commission,
    }))
    .sort((a, b) => b.gmv - a.gmv);
}

/**
 * Top videos across all of a creator's accounts, grouped by video_id.
 */
export async function getCreatorVideos(
  creatorId: string | number,
  startDate: string,
  endDate: string,
  limit = 20,
  brand?: string
): Promise<CreatorVideo[]> {
  const handles = await getHandles(String(creatorId));
  if (handles.length === 0) return [];

  const rows = await paginated(
    'daily_video_product_stats',
    'video_id, video_title, tiktok_username, brand_id, product_name, gmv, orders, items_sold, report_date',
    [
      { column: 'tiktok_username', op: 'in', value: handles },
      { column: 'report_date', op: 'gte', value: startDate },
      { column: 'report_date', op: 'lte', value: endDate },
      ...brandFilters(brand),
    ]
  );

  type Acc = {
    video_id: string;
    video_title: string;
    creator_name: string;
    brand: string;
    productGmv: Map<string, number>;
    gmv: number;
    orders: number;
    items_sold: number;
    dates: Set<string>;
  };
  const map = new Map<string, Acc>();
  for (const r of rows) {
    const vid = r.video_id as string;
    if (!vid) continue;
    let acc = map.get(vid);
    if (!acc) {
      acc = {
        video_id: vid,
        video_title: (r.video_title as string) || 'Untitled',
        creator_name: r.tiktok_username as string,
        brand: brandUuidToSlug(r.brand_id as string) ?? (r.brand_id as string),
        productGmv: new Map(),
        gmv: 0,
        orders: 0,
        items_sold: 0,
        dates: new Set(),
      };
      map.set(vid, acc);
    }
    const g = Number(r.gmv) || 0;
    acc.gmv += g;
    acc.orders += Number(r.orders) || 0;
    acc.items_sold += Number(r.items_sold) || 0;
    if (r.report_date) acc.dates.add(r.report_date as string);
    const pname = (r.product_name as string) || '';
    if (pname) acc.productGmv.set(pname, (acc.productGmv.get(pname) ?? 0) + g);
  }

  return Array.from(map.values())
    .sort((a, b) => b.gmv - a.gmv)
    .slice(0, limit)
    .map((v) => {
      // Pick top product by GMV for the row (a video can sell multiple products).
      let topProduct = '';
      let topGmv = -1;
      for (const [name, g] of v.productGmv) {
        if (g > topGmv) { topProduct = name; topGmv = g; }
      }
      return {
        video_id: v.video_id,
        video_title: v.video_title,
        creator_name: v.creator_name,
        brand: v.brand,
        product_name: topProduct,
        gmv: v.gmv,
        orders: v.orders,
        items_sold: v.items_sold,
        days_selling: v.dates.size,
      };
    });
}

/**
 * Distinct videos posted this calendar month — for retainer pace.
 */
export async function getPostsThisMonth(
  creatorId: string | number,
  brand?: string
): Promise<number> {
  const handles = await getHandles(String(creatorId));
  if (handles.length === 0) return 0;

  const now = new Date();
  const startOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const lastDay = String(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()).padStart(2, '0');
  const endOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${lastDay}`;

  const rows = await paginated(
    'daily_video_product_stats',
    'video_id',
    [
      { column: 'tiktok_username', op: 'in', value: handles },
      { column: 'report_date', op: 'gte', value: startOfMonth },
      { column: 'report_date', op: 'lte', value: endOfMonth },
      ...brandFilters(brand),
    ]
  );

  const ids = new Set<string>();
  for (const r of rows) if (r.video_id) ids.add(r.video_id as string);
  return ids.size;
}

/**
 * Lifetime stats for a creator (all-time, no date filter).
 * `total_videos` = COUNT(DISTINCT video_id).
 */
export async function getCreatorLifetimeStats(
  creatorId: string | number
): Promise<CreatorLifetimeStats> {
  const handles = await getHandles(String(creatorId));
  if (handles.length === 0) {
    return {
      total_gmv: 0, total_orders: 0, total_videos: 0, total_commission: 0,
      first_active_date: null, months_active: 0,
    };
  }

  const rows = await paginated(
    'daily_video_product_stats',
    'video_id, gmv, orders, est_commission, report_date',
    [{ column: 'tiktok_username', op: 'in', value: handles }]
  );

  const videoIds = new Set<string>();
  let minDate: string | null = null;
  let gmv = 0, orders = 0, commission = 0;
  for (const r of rows) {
    gmv += Number(r.gmv) || 0;
    orders += Number(r.orders) || 0;
    commission += Number(r.est_commission) || 0;
    if (r.video_id) videoIds.add(r.video_id as string);
    const d = r.report_date as string;
    if (d && (!minDate || d < minDate)) minDate = d;
  }

  let monthsActive = 0;
  if (minDate) {
    const first = new Date(minDate);
    const now = new Date();
    monthsActive =
      (now.getFullYear() - first.getFullYear()) * 12 +
      (now.getMonth() - first.getMonth()) + 1;
    if (monthsActive < 1) monthsActive = 1;
  }

  return {
    total_gmv: gmv,
    total_orders: orders,
    total_videos: videoIds.size,
    total_commission: commission,
    first_active_date: minDate,
    months_active: monthsActive,
  };
}

/**
 * Returns the creator's primary managed contract row (one per brand, highest
 * retainer wins). Scans all 10 account columns, not just account_1.
 */
export async function getManagedCreatorInfo(creatorId: string): Promise<{
  retainer: number;
  monthly_post_requirement: number;
  notes: string | null;
  status: string;
  brand: string | null;
} | null> {
  const handles = await getHandles(creatorId);
  if (handles.length === 0) return null;

  const rows = await getManagedRowsForHandles(handles);
  if (rows.length === 0) return null;

  const top = rows[0];
  return {
    retainer: Number(top.retainer) || 0,
    monthly_post_requirement: Number(top.monthly_post_requirement) || 0,
    notes: top.notes,
    status: top.status ?? top.employment_status ?? '',
    brand: top.brand ?? null,
  };
}

/**
 * Most recent report_date in the creator's performance data.
 * Used to surface data-freshness banners when the data is stale.
 */
export async function getCreatorLatestReportDate(
  creatorId: string | number
): Promise<string | null> {
  const handles = await getHandles(String(creatorId));
  if (handles.length === 0) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from('daily_video_product_stats')
    .select('report_date')
    .in('tiktok_username', handles)
    .order('report_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data?.report_date as string) ?? null;
}

