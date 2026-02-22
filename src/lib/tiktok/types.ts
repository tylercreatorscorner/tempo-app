// TikTok Shop API types and internal ingestion record types

// ============================================================
// TikTok API Response Types
// ============================================================

/** Standard TikTok API response wrapper */
export interface TikTokApiResponse<T> {
  code: number;
  message: string;
  request_id: string;
  data: T;
}

/** Pagination info in TikTok responses */
export interface TikTokPagination {
  total: number;
  next_page_token?: string;
}

// --- Video Performance ---

export interface TikTokVideoPerformanceItem {
  id: string;
  title: string;
  username: string;
  video_post_time: number; // unix timestamp
  duration: number;
  hash_tags: string[];
  gmv: number;
  gpm: number;
  customers: number;
  items_sold: number;
  click_through_rate: number;
  product_impressions: number;
  sku_orders: number;
  views: number;
  product_name?: string;
}

export interface TikTokVideoPerformanceListData {
  shop_videos: TikTokVideoPerformanceItem[];
  pagination: TikTokPagination;
}

export interface TikTokVideoPerformanceDetailInterval {
  start_date: string;
  end_date: string;
  sales: {
    overall: {
      gmv: number;
      gpm: number;
      customers: number;
      items_sold: number;
      click_through_rate: number;
      product_impressions: number;
    };
  };
}

export interface TikTokVideoPerformanceDetailData {
  intervals: TikTokVideoPerformanceDetailInterval[];
}

// --- Creator Performance ---

export interface TikTokCreatorInfo {
  creator_id: string;
  creator_name: string;
  follower_count: number;
  profile_image_url: string;
}

export interface TikTokCreatorPerformanceData {
  gmv: number;
  orders: number;
  items_sold: number;
  videos: number;
  live_streams: number;
  est_commission: number;
  refunds: number;
  items_refunded: number;
}

export interface TikTokCreatorListData {
  creators: TikTokCreatorInfo[];
  pagination: TikTokPagination;
}

export interface TikTokAffiliateCreatorPerformanceItem {
  creator_id: string;
  creator_name: string;
  gmv: number;
  orders: number;
  items_sold: number;
  videos: number;
  live_streams: number;
  est_commission: number;
  refunds: number;
  items_refunded: number;
}

export interface TikTokAffiliateCreatorPerformanceData {
  creator_performances: TikTokAffiliateCreatorPerformanceItem[];
  pagination: TikTokPagination;
}

// --- Product Performance ---

export interface TikTokProductPerformanceItem {
  product_id: string;
  product_name: string;
  gmv: number;
  items_sold: number;
  orders: number;
  customers: number;
  refunds: number;
  items_refunded: number;
  videos: number;
  live_streams: number;
  est_commission: number;
  product_category?: string;
}

export interface TikTokProductPerformanceListData {
  shop_products: TikTokProductPerformanceItem[];
  pagination: TikTokPagination;
}

// --- Shop Connection ---

export interface TikTokShopConnection {
  id: string;
  tenant_id: string;
  brand: string;
  shop_id: string;
  shop_name: string;
  access_token: string;
  refresh_token: string;
  token_expires_at: string; // ISO timestamp
  last_sync_at: string | null;
  last_sync_status: 'success' | 'error' | null;
  last_sync_error: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================
// Internal Ingestion Types
// ============================================================

export interface IngestionSummary {
  table: string;
  brand: string;
  date_start: string;
  date_end: string;
  rows_upserted: number;
  errors: string[];
  duration_ms: number;
}

export interface SyncResult {
  brand: string;
  started_at: string;
  completed_at: string;
  video_performance: IngestionSummary | null;
  creator_performance: IngestionSummary | null;
  product_performance: IngestionSummary | null;
  errors: string[];
}

export interface SyncStatus {
  brand: string;
  last_sync_at: string | null;
  last_sync_status: 'success' | 'error' | null;
  last_sync_error: string | null;
  rows_synced: {
    video_performance: number;
    creator_performance: number;
    product_performance: number;
  } | null;
}

export interface AuditDiscrepancy {
  table: string;
  report_date: string;
  field: string;
  api_value: number;
  db_value: number;
  difference: number;
  type: 'mismatch' | 'missing_in_db' | 'extra_in_db';
}

export interface AuditResult {
  brand: string;
  date_start: string;
  date_end: string;
  discrepancies: AuditDiscrepancy[];
  summary: {
    total_checked: number;
    mismatches: number;
    missing_in_db: number;
    extra_in_db: number;
  };
}

/** Options for date range queries */
export interface DateRangeOptions {
  start_date: string; // YYYY-MM-DD
  end_date: string;   // YYYY-MM-DD
}

/** Brand/shop identifier for API calls */
export interface BrandShopIdentifier {
  brand: string;
  shop_id: string;
  tenant_id: string;
  access_token: string;
}
