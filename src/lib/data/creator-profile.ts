import { createAdminClient } from '@/lib/supabase/server';

// --- Types ---

export interface CreatorProfile {
  id: number;
  real_name: string;
  brand: string;
  role: string | null;
  status: string | null;
  email: string | null;
  phone: string | null;
  retainer: number | null;
  monthly_post_requirement: number | null;
  accounts: CreatorAccount[];
}

export interface CreatorAccount {
  tiktok_username: string;
  brand: string;
  is_primary: boolean;
  verified: boolean;
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
  brand: string;
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
  video_title: string;
  creator_name: string;
  brand: string;
  product_name: string;
  gmv: number;
  orders: number;
  items_sold: number;
  report_date: string;
}

// --- Query Functions ---
// TODO: Add tenant_id filtering for multi-tenant scoping.
// For now, admin view shows everything.

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

  return {
    id: creator.id,
    real_name: creator.real_name ?? creator.brand ?? 'Unknown',
    brand: creator.brand,
    role: creator.role ?? null,
    status: creator.status ?? null,
    email: creator.email ?? null,
    phone: creator.phone ?? null,
    retainer: creator.retainer ?? null,
    monthly_post_requirement: creator.monthly_post_requirement ?? null,
    accounts: (accounts ?? []).map((a: Record<string, unknown>) => ({
      tiktok_username: a.tiktok_username as string,
      brand: a.brand as string,
      is_primary: !!a.is_primary,
      verified: !!a.verified,
    })),
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
  const prevEnd = new Date(start.getTime() - 1); // day before start
  const prevStart = new Date(prevEnd.getTime() - diffMs);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { prevStart: fmt(prevStart), prevEnd: fmt(prevEnd) };
}

/** Aggregate performance from creator_performance for given handles and date range */
async function aggregatePerformance(
  handles: string[],
  startDate: string,
  endDate: string
): Promise<{ gmv: number; orders: number; items_sold: number; videos: number; commission: number }> {
  if (handles.length === 0) return { gmv: 0, orders: 0, items_sold: 0, videos: 0, commission: 0 };

  const supabase = await createAdminClient();
  const { data } = await supabase
    .from('creator_performance')
    .select('gmv, orders, items_sold, videos, est_commission')
    .in('creator_name', handles)
    .gte('report_date', startDate)
    .lte('report_date', endDate)
    .eq('period_type', 'daily');

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
  endDate: string
): Promise<CreatorSummaryData> {
  const handles = await getHandles(creatorId);
  const { prevStart, prevEnd } = getPriorPeriod(startDate, endDate);

  const [current, previous] = await Promise.all([
    aggregatePerformance(handles, startDate, endDate),
    aggregatePerformance(handles, prevStart, prevEnd),
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
  creatorId: number,
  startDate: string,
  endDate: string
): Promise<AccountBreakdownRow[]> {
  const supabase = await createAdminClient();
  const { data: accounts } = await supabase
    .from('creator_accounts')
    .select('tiktok_username, brand')
    .eq('creator_id', creatorId);

  if (!accounts || accounts.length === 0) return [];

  const handles = accounts.map((a: Record<string, unknown>) => a.tiktok_username as string).filter(Boolean);

  const { data: perf } = await supabase
    .from('creator_performance')
    .select('creator_name, gmv, orders, items_sold, videos')
    .in('creator_name', handles)
    .gte('report_date', startDate)
    .lte('report_date', endDate)
    .eq('period_type', 'daily');

  // Group by handle
  const map = new Map<string, AccountBreakdownRow>();
  for (const a of accounts) {
    const handle = a.tiktok_username as string;
    if (!handle) continue;
    map.set(handle, { tiktok_username: handle, brand: a.brand as string, gmv: 0, orders: 0, items_sold: 0, videos: 0 });
  }

  for (const r of (perf ?? [])) {
    const row = map.get(r.creator_name as string);
    if (row) {
      row.gmv += Number(r.gmv) || 0;
      row.orders += Number(r.orders) || 0;
      row.items_sold += Number(r.items_sold) || 0;
      row.videos += Number(r.videos) || 0;
    }
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
  for (const r of (perf ?? [])) {
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
 * Recent videos across all of a creator's accounts, sorted by GMV.
 */
export async function getCreatorVideos(
  creatorId: number,
  startDate: string,
  endDate: string,
  limit = 20
): Promise<CreatorVideo[]> {
  const handles = await getHandles(creatorId);
  if (handles.length === 0) return [];

  const supabase = await createAdminClient();
  const { data } = await supabase
    .from('video_performance')
    .select('video_title, creator_name, brand, product_name, gmv, orders, items_sold, report_date')
    .in('creator_name', handles)
    .gte('report_date', startDate)
    .lte('report_date', endDate)
    .order('gmv', { ascending: false })
    .limit(limit);

  return (data ?? []).map((r: Record<string, unknown>) => ({
    video_title: (r.video_title as string) || 'Untitled',
    creator_name: r.creator_name as string,
    brand: r.brand as string,
    product_name: (r.product_name as string) || '',
    gmv: Number(r.gmv) || 0,
    orders: Number(r.orders) || 0,
    items_sold: Number(r.items_sold) || 0,
    report_date: r.report_date as string,
  }));
}
