import { createAdminClient } from '@/lib/supabase/server';
import { ACTIVE_BRANDS } from '@/lib/utils/constants';

// --- Types ---

export interface CreatorProfile {
  id: number;
  real_name: string;
  brand: string;
  role: string | null;
  status: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  retainer: number | null;
  monthly_post_requirement: number | null;
  retainer_start_date: string | null;
  accounts: CreatorAccount[];
  brands: string[]; // all brands (performance + account registrations)
  brandsWithData: string[]; // only brands with actual performance data
}

export interface CreatorAccount {
  tiktok_username: string;
  brand: string;
  is_primary: boolean;
  verified: boolean;
  brands: string[]; // actual brands from performance data
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

// --- Query Functions ---

/**
 * Get distinct brands from creator_performance for given handles.
 */
async function getBrandsForHandles(handles: string[]): Promise<string[]> {
  if (handles.length === 0) return [];
  const supabase = await createAdminClient();
  const { data } = await supabase
    .from('creator_performance')
    .select('brand')
    .in('creator_name', handles);
  const brands = new Set<string>();
  for (const r of data ?? []) {
    if (r.brand) brands.add(r.brand as string);
  }
  return Array.from(brands);
}

/**
 * Get distinct brands per handle from creator_performance.
 */
async function getBrandsByHandle(handles: string[]): Promise<Map<string, string[]>> {
  if (handles.length === 0) return new Map();
  const supabase = await createAdminClient();
  const { data } = await supabase
    .from('creator_performance')
    .select('creator_name, brand')
    .in('creator_name', handles);

  const map = new Map<string, Set<string>>();
  for (const r of data ?? []) {
    const handle = r.creator_name as string;
    const brand = r.brand as string;
    if (!handle || !brand) continue;
    if (!map.has(handle)) map.set(handle, new Set());
    map.get(handle)!.add(brand);
  }

  const result = new Map<string, string[]>();
  for (const [handle, brands] of map) {
    result.set(handle, Array.from(brands));
  }
  return result;
}

/**
 * Fetch a creator profile by managed_creators ID, including all linked accounts.
 */
export async function getCreatorProfile(creatorId: number): Promise<CreatorProfile | null> {
  const supabase = await createAdminClient();

  const { data: creator, error } = await supabase
    .from('managed_creators')
    .select('*')
    .eq('id', creatorId)
    .single();

  if (error || !creator) return null;

  const { data: accounts } = await supabase
    .from('creator_accounts')
    .select('tiktok_username, brand, is_primary, verified')
    .eq('creator_id', creatorId);

  const accountList = (accounts ?? []).map((a: Record<string, unknown>) => ({
    tiktok_username: a.tiktok_username as string,
    brand: a.brand as string,
    is_primary: !!a.is_primary,
    verified: !!a.verified,
    brands: [] as string[],
  }));

  const handles = accountList.map((a) => a.tiktok_username).filter(Boolean);
  const brandsByHandle = await getBrandsByHandle(handles);

  // Populate per-account brands
  for (const account of accountList) {
    account.brands = brandsByHandle.get(account.tiktok_username) ?? [];
  }

  // All brands across all accounts (from performance data)
  const allBrands = new Set<string>();
  for (const brands of brandsByHandle.values()) {
    for (const b of brands) allBrands.add(b);
  }

  // Also include brands from creator_accounts (registered but maybe no perf data yet)
  const accountBrands = new Set<string>();
  for (const a of accountList) {
    if (a.brand) accountBrands.add(a.brand);
  }

  // perfBrands = brands with actual performance data, accountOnlyBrands = registered only
  const perfBrands = new Set(allBrands);
  const combinedBrands = new Set([...allBrands, ...accountBrands]);

  return {
    id: creator.id,
    real_name: creator.real_name ?? creator.brand ?? 'Unknown',
    brand: creator.brand,
    role: creator.role ?? null,
    status: creator.status ?? null,
    email: creator.email ?? null,
    phone: creator.phone ?? null,
    notes: creator.notes ?? null,
    retainer: creator.retainer ?? null,
    monthly_post_requirement: creator.monthly_post_requirement ?? null,
    retainer_start_date: creator.retainer_start_date ?? null,
    accounts: accountList,
    brands: Array.from(combinedBrands),
    brandsWithData: Array.from(perfBrands),
  };
}

/**
 * Look up creator_id from a TikTok username handle.
 */
export async function getCreatorIdByHandle(handle: string): Promise<number | null> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from('creator_accounts')
    .select('creator_id')
    .eq('tiktok_username', handle)
    .limit(1)
    .single();

  if (error || !data) return null;
  return data.creator_id as number;
}

/** Helper: get all TikTok usernames for a creator */
async function getHandles(creatorId: number): Promise<string[]> {
  const supabase = await createAdminClient();
  const { data } = await supabase
    .from('creator_accounts')
    .select('tiktok_username')
    .eq('creator_id', creatorId);
  return (data ?? []).map((r: Record<string, unknown>) => r.tiktok_username as string).filter(Boolean);
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

/** Aggregate performance from creator_performance for given handles and date range */
async function aggregatePerformance(
  handles: string[],
  startDate: string,
  endDate: string,
  brand?: string
): Promise<{ gmv: number; orders: number; items_sold: number; videos: number; commission: number }> {
  if (handles.length === 0) return { gmv: 0, orders: 0, items_sold: 0, videos: 0, commission: 0 };

  const supabase = await createAdminClient();
  let query = supabase
    .from('creator_performance')
    .select('gmv, orders, items_sold, videos, est_commission')
    .in('creator_name', handles)
    .gte('report_date', startDate)
    .lte('report_date', endDate)
    .eq('period_type', 'daily');
  if (brand) query = query.eq('brand', brand);
  const { data } = await query;

  const rows = data ?? [];
  return {
    gmv: rows.reduce((s: number, r: Record<string, unknown>) => s + (Number(r.gmv) || 0), 0),
    orders: rows.reduce((s: number, r: Record<string, unknown>) => s + (Number(r.orders) || 0), 0),
    items_sold: rows.reduce((s: number, r: Record<string, unknown>) => s + (Number(r.items_sold) || 0), 0),
    videos: rows.reduce((s: number, r: Record<string, unknown>) => s + (Number(r.videos) || 0), 0),
    commission: rows.reduce((s: number, r: Record<string, unknown>) => s + (Number(r.est_commission) || 0), 0),
  };
}

/**
 * Get aggregated summary for a creator across all accounts, with trend vs prior period.
 */
export async function getCreatorSummary(
  creatorId: number,
  startDate: string,
  endDate: string,
  brand?: string
): Promise<CreatorSummaryData> {
  const handles = await getHandles(creatorId);
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
 * Per-account performance breakdown. Brands come from creator_performance, not creator_accounts.
 */
export async function getCreatorAccountBreakdown(
  creatorId: number,
  startDate: string,
  endDate: string,
  brand?: string
): Promise<AccountBreakdownRow[]> {
  const supabase = await createAdminClient();

  // Always get ALL accounts, then filter by performance data for the brand
  const { data: accounts } = await supabase
    .from('creator_accounts')
    .select('tiktok_username, brand')
    .eq('creator_id', creatorId);

  if (!accounts || accounts.length === 0) return [];

  const handles = accounts.map((a: Record<string, unknown>) => a.tiktok_username as string).filter(Boolean);

  let perfQuery = supabase
    .from('creator_performance')
    .select('creator_name, brand, gmv, orders, items_sold, videos')
    .in('creator_name', handles)
    .gte('report_date', startDate)
    .lte('report_date', endDate)
    .eq('period_type', 'daily');
  if (brand) perfQuery = perfQuery.eq('brand', brand);
  const { data: perf } = await perfQuery;

  // Group by handle, collect brands from perf data
  const map = new Map<string, AccountBreakdownRow>();
  for (const a of accounts) {
    const handle = a.tiktok_username as string;
    if (!handle) continue;
    map.set(handle, { tiktok_username: handle, brands: [], gmv: 0, orders: 0, items_sold: 0, videos: 0 });
  }

  const brandSets = new Map<string, Set<string>>();
  for (const handle of handles) {
    brandSets.set(handle, new Set());
  }

  for (const r of perf ?? []) {
    const handle = r.creator_name as string;
    const row = map.get(handle);
    if (row) {
      row.gmv += Number(r.gmv) || 0;
      row.orders += Number(r.orders) || 0;
      row.items_sold += Number(r.items_sold) || 0;
      row.videos += Number(r.videos) || 0;
      if (r.brand) brandSets.get(handle)?.add(r.brand as string);
    }
  }

  for (const [handle, brands] of brandSets) {
    const row = map.get(handle);
    if (row) row.brands = Array.from(brands);
  }

  return Array.from(map.values()).sort((a, b) => b.gmv - a.gmv);
}

/**
 * Per-brand performance breakdown.
 */
export async function getCreatorBrandBreakdown(
  creatorId: number,
  startDate: string,
  endDate: string
): Promise<BrandBreakdownRow[]> {
  const handles = await getHandles(creatorId);
  if (handles.length === 0) return [];

  const supabase = await createAdminClient();
  const { data: perf } = await supabase
    .from('creator_performance')
    .select('brand, gmv, orders, items_sold, videos, est_commission')
    .in('creator_name', handles)
    .gte('report_date', startDate)
    .lte('report_date', endDate)
    .eq('period_type', 'daily');

  const map = new Map<string, BrandBreakdownRow>();
  for (const r of perf ?? []) {
    const brand = r.brand as string;
    const existing = map.get(brand);
    if (existing) {
      existing.gmv += Number(r.gmv) || 0;
      existing.orders += Number(r.orders) || 0;
      existing.items_sold += Number(r.items_sold) || 0;
      existing.videos += Number(r.videos) || 0;
      existing.commission += Number(r.est_commission) || 0;
    } else {
      map.set(brand, {
        brand,
        gmv: Number(r.gmv) || 0,
        orders: Number(r.orders) || 0,
        items_sold: Number(r.items_sold) || 0,
        videos: Number(r.videos) || 0,
        commission: Number(r.est_commission) || 0,
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => b.gmv - a.gmv);
}

/**
 * Top videos across all of a creator's accounts, grouped by video_id.
 * Bug fix: GROUP BY video_id, aggregate across dates.
 */
export async function getCreatorVideos(
  creatorId: number,
  startDate: string,
  endDate: string,
  limit = 20,
  brand?: string
): Promise<CreatorVideo[]> {
  const handles = await getHandles(creatorId);
  if (handles.length === 0) return [];

  const supabase = await createAdminClient();
  let query = supabase
    .from('video_performance')
    .select('video_id, video_title, creator_name, brand, product_name, gmv, orders, items_sold, report_date')
    .in('creator_name', handles)
    .gte('report_date', startDate)
    .lte('report_date', endDate);
  if (brand) query = query.eq('brand', brand);
  const { data } = await query;

  if (!data || data.length === 0) return [];

  // Group by video_id
  const map = new Map<string, {
    video_id: string;
    video_title: string;
    creator_name: string;
    brand: string;
    product_name: string;
    gmv: number;
    orders: number;
    items_sold: number;
    dates: Set<string>;
  }>();

  for (const r of data) {
    const vid = r.video_id as string;
    if (!vid) continue;
    const existing = map.get(vid);
    if (existing) {
      existing.gmv += Number(r.gmv) || 0;
      existing.orders += Number(r.orders) || 0;
      existing.items_sold += Number(r.items_sold) || 0;
      if (r.report_date) existing.dates.add(r.report_date as string);
    } else {
      map.set(vid, {
        video_id: vid,
        video_title: (r.video_title as string) || 'Untitled',
        creator_name: r.creator_name as string,
        brand: r.brand as string,
        product_name: (r.product_name as string) || '',
        gmv: Number(r.gmv) || 0,
        orders: Number(r.orders) || 0,
        items_sold: Number(r.items_sold) || 0,
        dates: new Set(r.report_date ? [r.report_date as string] : []),
      });
    }
  }

  return Array.from(map.values())
    .sort((a, b) => b.gmv - a.gmv)
    .slice(0, limit)
    .map((v) => ({
      video_id: v.video_id,
      video_title: v.video_title,
      creator_name: v.creator_name,
      brand: v.brand,
      product_name: v.product_name,
      gmv: v.gmv,
      orders: v.orders,
      items_sold: v.items_sold,
      days_selling: v.dates.size,
    }));
}

/**
 * Get posts this month for retainer tracking.
 * Sums the 'videos' column from creator_performance for current month.
 */
/**
 * Get posts this month. When brand is provided, only count posts for accounts
 * registered under that brand.
 */
export async function getPostsThisMonth(creatorId: number, brand?: string): Promise<number> {
  // Always get ALL handles for the creator, then filter by brand in the performance query
  const handles = await getHandles(creatorId);
  if (handles.length === 0) return 0;

  const now = new Date();
  const startOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const endOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()).padStart(2, '0')}`;

  const supabase = await createAdminClient();
  let query = supabase
    .from('creator_performance')
    .select('videos')
    .in('creator_name', handles)
    .gte('report_date', startOfMonth)
    .lte('report_date', endOfMonth)
    .eq('period_type', 'daily');
  if (brand) query = query.eq('brand', brand);
  const { data } = await query;

  return (data ?? []).reduce((s: number, r: Record<string, unknown>) => s + (Number(r.videos) || 0), 0);
}

/**
 * Get lifetime stats for a creator (all-time, no date filter).
 */
export async function getCreatorLifetimeStats(creatorId: number): Promise<CreatorLifetimeStats> {
  const handles = await getHandles(creatorId);
  if (handles.length === 0) {
    return { total_gmv: 0, total_orders: 0, total_videos: 0, total_commission: 0, first_active_date: null, months_active: 0 };
  }

  const supabase = await createAdminClient();
  const { data } = await supabase
    .from('creator_performance')
    .select('gmv, orders, videos, est_commission, report_date')
    .in('creator_name', handles)
    .eq('period_type', 'daily');

  const rows = data ?? [];
  let minDate: string | null = null;
  let gmv = 0, orders = 0, videos = 0, commission = 0;

  for (const r of rows) {
    gmv += Number(r.gmv) || 0;
    orders += Number(r.orders) || 0;
    videos += Number(r.videos) || 0;
    commission += Number(r.est_commission) || 0;
    const d = r.report_date as string;
    if (d && (!minDate || d < minDate)) minDate = d;
  }

  let monthsActive = 0;
  if (minDate) {
    const first = new Date(minDate);
    const now = new Date();
    monthsActive = (now.getFullYear() - first.getFullYear()) * 12 + (now.getMonth() - first.getMonth()) + 1;
    if (monthsActive < 1) monthsActive = 1;
  }

  return { total_gmv: gmv, total_orders: orders, total_videos: videos, total_commission: commission, first_active_date: minDate, months_active: monthsActive };
}
