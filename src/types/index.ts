export type { 
  Tenant, TenantPlan, UserProfile, UserRole, Brand,
  CreatorPerformance, VideoPerformance, ManagedCreator,
  BrandSummary, CreatorRanking, ProductSummary, VideoSummaryItem, DailyTrend
} from './database';
export { PLAN_DEFAULTS } from './database';

/** Portal types */
export type Portal = 'admin' | 'brand' | 'creator' | 'manager';

/** Date range preset */
export type DateRangePreset = 'today' | 'yesterday' | 'last7' | 'last14' | 'last30' | 'thisMonth' | 'lastMonth' | 'thisQuarter';

export interface DateRange {
  start: Date;
  end: Date;
  label: string;
}

/** Stat card display */
export interface StatCardData {
  label: string;
  value: string;
  trend?: number;
  trendLabel?: string;
}
