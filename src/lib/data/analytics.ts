import { getBrandSummary } from './rpc';
import type { BrandSummary } from '@/types';

/** Aggregate portfolio stats across all brands */
export async function getPortfolioSummary(
  startDate: string,
  endDate: string
): Promise<{
  totalGmv: number;
  totalOrders: number;
  totalCreators: number;
  totalVideos: number;
  brands: BrandSummary[];
}> {
  const brands = await getBrandSummary('all', startDate, endDate);

  const totalGmv = brands.reduce((sum, b) => sum + b.total_gmv, 0);
  const totalOrders = brands.reduce((sum, b) => sum + b.total_orders, 0);
  const totalCreators = brands.reduce((sum, b) => sum + b.active_creators, 0);
  const totalVideos = brands.reduce((sum, b) => sum + b.total_videos, 0);

  return { totalGmv, totalOrders, totalCreators, totalVideos, brands };
}
