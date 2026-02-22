import { createAdminClient } from '@/lib/supabase/server';

export interface AggregatePerformance {
  totalGmv: number;
  totalOrders: number;
  totalItemsSold: number;
  totalCommission: number;
  totalVideos: number;
}

export interface AccountPerformance extends AggregatePerformance {
  tiktok_username: string;
  brand: string;
}

export interface BrandPerformance extends AggregatePerformance {
  brand: string;
}

/**
 * Get total performance across all of a creator's accounts.
 */
export async function getCreatorTotalPerformance(
  usernames: string[],
  startDate: string,
  endDate: string
): Promise<AggregatePerformance> {
  if (usernames.length === 0) {
    return { totalGmv: 0, totalOrders: 0, totalItemsSold: 0, totalCommission: 0, totalVideos: 0 };
  }

  const supabase = await createAdminClient();

  const { data } = await supabase
    .from('creator_performance')
    .select('gmv, orders, items_sold, est_commission, videos')
    .in('creator_name', usernames)
    .eq('period_type', 'daily')
    .gte('report_date', startDate)
    .lte('report_date', endDate);

  const rows = data ?? [];
  return {
    totalGmv: rows.reduce((s, r) => s + (r.gmv || 0), 0),
    totalOrders: rows.reduce((s, r) => s + (r.orders || 0), 0),
    totalItemsSold: rows.reduce((s, r) => s + (r.items_sold || 0), 0),
    totalCommission: rows.reduce((s, r) => s + (r.est_commission || 0), 0),
    totalVideos: rows.reduce((s, r) => s + (r.videos || 0), 0),
  };
}

/**
 * Get per-account performance breakdown.
 */
export async function getCreatorAccountBreakdown(
  usernames: string[],
  startDate: string,
  endDate: string
): Promise<AccountPerformance[]> {
  if (usernames.length === 0) return [];

  const supabase = await createAdminClient();

  const { data } = await supabase
    .from('creator_performance')
    .select('creator_name, brand, gmv, orders, items_sold, est_commission, videos')
    .in('creator_name', usernames)
    .eq('period_type', 'daily')
    .gte('report_date', startDate)
    .lte('report_date', endDate);

  // Group by creator_name + brand
  const map = new Map<string, AccountPerformance>();
  for (const row of data ?? []) {
    const key = `${row.creator_name}|${row.brand}`;
    const existing = map.get(key) ?? {
      tiktok_username: row.creator_name,
      brand: row.brand,
      totalGmv: 0, totalOrders: 0, totalItemsSold: 0, totalCommission: 0, totalVideos: 0,
    };
    existing.totalGmv += row.gmv || 0;
    existing.totalOrders += row.orders || 0;
    existing.totalItemsSold += row.items_sold || 0;
    existing.totalCommission += row.est_commission || 0;
    existing.totalVideos += row.videos || 0;
    map.set(key, existing);
  }

  return [...map.values()].sort((a, b) => b.totalGmv - a.totalGmv);
}

/**
 * Get per-brand performance breakdown.
 */
export async function getCreatorBrandBreakdown(
  usernames: string[],
  startDate: string,
  endDate: string
): Promise<BrandPerformance[]> {
  const accounts = await getCreatorAccountBreakdown(usernames, startDate, endDate);

  const map = new Map<string, BrandPerformance>();
  for (const acct of accounts) {
    const existing = map.get(acct.brand) ?? {
      brand: acct.brand,
      totalGmv: 0, totalOrders: 0, totalItemsSold: 0, totalCommission: 0, totalVideos: 0,
    };
    existing.totalGmv += acct.totalGmv;
    existing.totalOrders += acct.totalOrders;
    existing.totalItemsSold += acct.totalItemsSold;
    existing.totalCommission += acct.totalCommission;
    existing.totalVideos += acct.totalVideos;
    map.set(acct.brand, existing);
  }

  return [...map.values()].sort((a, b) => b.totalGmv - a.totalGmv);
}
