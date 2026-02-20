/** Core database types for Supabase tables */

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: TenantPlan;
  max_brands: number;
  onboarding_complete: boolean;
  created_at: string;
}

/** Pricing tiers: brand (1 brand), agency (multi), enterprise (unlimited + support) */
export type TenantPlan = 'brand' | 'agency' | 'enterprise';

/** Plan configuration defaults */
export const PLAN_DEFAULTS: Record<TenantPlan, { maxBrands: number; label: string }> = {
  brand: { maxBrands: 1, label: 'Brand' },
  agency: { maxBrands: 25, label: 'Agency' },
  enterprise: { maxBrands: 9999, label: 'Enterprise' },
};

export interface UserProfile {
  id: string;
  email: string;
  role: UserRole;
  tenant_id: string;
  display_name: string | null;
  created_at: string;
}

export type UserRole = 'owner' | 'admin' | 'manager' | 'viewer' | 'brand' | 'creator';

export interface Brand {
  id: string;
  name: string;
  display_name: string;
  tenant_id: string;
  color?: string;
  created_at: string;
}

export interface CreatorPerformance {
  id: string;
  creator_name: string;
  brand: string;
  report_date: string;
  gmv: number;
  orders: number;
  items_sold: number;
  period_type: 'daily' | 'weekly' | 'monthly';
  tenant_id: string;
}

export interface VideoPerformance {
  id: string;
  video_id: string;
  creator_name: string;
  brand: string;
  product_name: string;
  gmv: number;
  views: number;
  report_date: string;
  tenant_id: string;
}

export interface ManagedCreator {
  id: string;
  brand: string;
  account_1: string | null;
  account_2: string | null;
  account_3: string | null;
  account_4: string | null;
  account_5: string | null;
  tenant_id: string;
  created_at: string;
}

/** RPC response types */

/** RPC response types — match actual Supabase RPC return columns */

export interface BrandSummary {
  total_gmv: number;
  total_orders: number;
  total_items_sold: number;
  total_refunds: number;
  total_videos: number;
  total_live_streams: number;
  total_est_commission: number;
  unique_creators: number;
  unique_videos: number;
  avg_aov: number;
}

export interface CreatorRanking {
  creator_name: string;
  total_gmv: number;
  total_orders: number;
  total_items_sold: number;
  video_count: number;
}

export interface ProductSummary {
  product_name: string;
  total_gmv: number;
  total_orders: number;
  total_items_sold: number;
}

export interface VideoSummaryItem {
  video_title: string;
  creator_name: string;
  total_gmv: number;
  total_views: number;
  total_orders: number;
}

export interface DailyTrend {
  report_date: string;
  daily_gmv: number;
  daily_orders: number;
  daily_items_sold: number;
}
