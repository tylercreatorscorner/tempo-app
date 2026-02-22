import { TikTokClient } from './client';
import { createAdminClient } from '@/lib/supabase/server';
import type {
  BrandShopIdentifier,
  DateRangeOptions,
  IngestionSummary,
  TikTokVideoPerformanceListData,
  TikTokAffiliateCreatorPerformanceData,
  TikTokCreatorListData,
  TikTokProductPerformanceListData,
} from './types';

// ============================================================
// Video Performance Ingestion
// ============================================================

/**
 * Fetch video performance data from TikTok and upsert into video_performance table.
 * Uses GET /analytics/202509/shop_videos/performance
 */
export async function ingestVideoPerformance(
  shop: BrandShopIdentifier,
  dateRange: DateRangeOptions
): Promise<IngestionSummary> {
  const startTime = Date.now();
  const errors: string[] = [];
  let totalUpserted = 0;

  const client = TikTokClient.fromEnv(shop.access_token, shop.shop_id);
  const supabase = await createAdminClient();

  let pageToken: string | undefined;

  do {
    try {
      const params: Record<string, string> = {
        start_date: dateRange.start_date.replace(/-/g, ''),
        end_date: dateRange.end_date.replace(/-/g, ''),
        page_size: '50',
      };
      if (pageToken) {
        params.page_token = pageToken;
      }

      const response = await client.get<TikTokVideoPerformanceListData>(
        '/analytics/202509/shop_videos/performance',
        params
      );

      const videos = response.data.shop_videos || [];
      if (videos.length === 0) break;

      // Map API response to our table schema
      const rows = videos.map((v) => ({
        tenant_id: shop.tenant_id,
        brand: shop.brand,
        video_id: v.id,
        video_title: v.title,
        creator_name: v.username?.toLowerCase().replace(/^@/, '') || '',
        report_date: dateRange.start_date,
        gmv: v.gmv || 0,
        orders: v.sku_orders || 0,
        items_sold: v.items_sold || 0,
        est_commission: 0, // Not directly in this endpoint; filled from affiliate data
        aov: v.sku_orders > 0 ? (v.gmv || 0) / v.sku_orders : 0,
        period_type: 'daily' as const,
        post_date: v.video_post_time
          ? new Date(v.video_post_time * 1000).toISOString().split('T')[0]
          : null,
        product_name: v.product_name || null,
        data_source: 'api',
      }));

      // Upsert: use brand + video_id + report_date + period_type + product_name as unique key
      // (same video can have multiple products via multi-product links)
      const { error, count } = await supabase
        .from('video_performance')
        .upsert(rows, {
          onConflict: 'brand,video_id,report_date,period_type,product_name',
          ignoreDuplicates: false,
        })
        .select('id');

      if (error) {
        errors.push(`Video upsert error: ${error.message}`);
        console.error('[Ingest] Video upsert error:', error);
      } else {
        totalUpserted += count ?? rows.length;
      }

      pageToken = response.data.pagination?.next_page_token;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Video fetch error: ${msg}`);
      console.error('[Ingest] Video fetch error:', msg);
      break;
    }
  } while (pageToken);

  const summary: IngestionSummary = {
    table: 'video_performance',
    brand: shop.brand,
    date_start: dateRange.start_date,
    date_end: dateRange.end_date,
    rows_upserted: totalUpserted,
    errors,
    duration_ms: Date.now() - startTime,
  };

  console.log(
    `[Ingest] Video performance for ${shop.brand}: ${totalUpserted} rows upserted, ${errors.length} errors, ${summary.duration_ms}ms`
  );

  return summary;
}

// ============================================================
// Creator Performance Ingestion
// ============================================================

/**
 * Fetch creator performance data from TikTok and upsert into creator_performance table.
 * Uses GET /affiliate/202405/seller_affiliate/creator_performance
 * and GET /affiliate/202405/seller_affiliate/creators for creator info.
 */
export async function ingestCreatorPerformance(
  shop: BrandShopIdentifier,
  dateRange: DateRangeOptions
): Promise<IngestionSummary> {
  const startTime = Date.now();
  const errors: string[] = [];
  let totalUpserted = 0;

  const client = TikTokClient.fromEnv(shop.access_token, shop.shop_id);
  const supabase = await createAdminClient();

  // First, build a creator_id -> creator_name lookup
  const creatorNames = new Map<string, string>();
  let creatorPageToken: string | undefined;

  do {
    try {
      const params: Record<string, string> = { page_size: '50' };
      if (creatorPageToken) params.page_token = creatorPageToken;

      const creatorsResponse = await client.get<TikTokCreatorListData>(
        '/affiliate/202405/seller_affiliate/creators',
        params
      );

      for (const c of creatorsResponse.data.creators || []) {
        creatorNames.set(
          c.creator_id,
          c.creator_name?.toLowerCase().replace(/^@/, '') || c.creator_id
        );
      }

      creatorPageToken = creatorsResponse.data.pagination?.next_page_token;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Creator list fetch error: ${msg}`);
      break;
    }
  } while (creatorPageToken);

  // Now fetch performance data
  let perfPageToken: string | undefined;

  do {
    try {
      const params: Record<string, string> = {
        start_date: dateRange.start_date.replace(/-/g, ''),
        end_date: dateRange.end_date.replace(/-/g, ''),
        page_size: '50',
      };
      if (perfPageToken) params.page_token = perfPageToken;

      const response = await client.get<TikTokAffiliateCreatorPerformanceData>(
        '/affiliate/202405/seller_affiliate/creator_performance',
        params
      );

      const performances = response.data.creator_performances || [];
      if (performances.length === 0) break;

      const rows = performances.map((p) => ({
        tenant_id: shop.tenant_id,
        brand: shop.brand,
        creator_name:
          creatorNames.get(p.creator_id) ||
          p.creator_name?.toLowerCase().replace(/^@/, '') ||
          p.creator_id,
        report_date: dateRange.start_date,
        gmv: p.gmv || 0,
        orders: p.orders || 0,
        items_sold: p.items_sold || 0,
        videos: p.videos || 0,
        live_streams: p.live_streams || 0,
        est_commission: p.est_commission || 0,
        refunds: p.refunds || 0,
        items_refunded: p.items_refunded || 0,
        aov: p.orders > 0 ? (p.gmv || 0) / p.orders : 0,
        period_type: 'daily' as const,
        data_source: 'api',
      }));

      const { error, count } = await supabase
        .from('creator_performance')
        .upsert(rows, {
          onConflict: 'brand,creator_name,report_date,period_type',
          ignoreDuplicates: false,
        })
        .select('id');

      if (error) {
        errors.push(`Creator upsert error: ${error.message}`);
        console.error('[Ingest] Creator upsert error:', error);
      } else {
        totalUpserted += count ?? rows.length;
      }

      perfPageToken = response.data.pagination?.next_page_token;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Creator performance fetch error: ${msg}`);
      break;
    }
  } while (perfPageToken);

  const summary: IngestionSummary = {
    table: 'creator_performance',
    brand: shop.brand,
    date_start: dateRange.start_date,
    date_end: dateRange.end_date,
    rows_upserted: totalUpserted,
    errors,
    duration_ms: Date.now() - startTime,
  };

  console.log(
    `[Ingest] Creator performance for ${shop.brand}: ${totalUpserted} rows upserted, ${errors.length} errors, ${summary.duration_ms}ms`
  );

  return summary;
}

// ============================================================
// Product Performance Ingestion
// ============================================================

/**
 * Fetch product performance data from TikTok and upsert into product_performance table.
 * Uses GET /analytics/202509/shop_products/performance
 */
export async function ingestProductPerformance(
  shop: BrandShopIdentifier,
  dateRange: DateRangeOptions
): Promise<IngestionSummary> {
  const startTime = Date.now();
  const errors: string[] = [];
  let totalUpserted = 0;

  const client = TikTokClient.fromEnv(shop.access_token, shop.shop_id);
  const supabase = await createAdminClient();

  let pageToken: string | undefined;

  do {
    try {
      const params: Record<string, string> = {
        start_date: dateRange.start_date.replace(/-/g, ''),
        end_date: dateRange.end_date.replace(/-/g, ''),
        page_size: '50',
      };
      if (pageToken) params.page_token = pageToken;

      const response = await client.get<TikTokProductPerformanceListData>(
        '/analytics/202509/shop_products/performance',
        params
      );

      const products = response.data.shop_products || [];
      if (products.length === 0) break;

      const rows = products.map((p) => ({
        tenant_id: shop.tenant_id,
        brand: shop.brand,
        product_id: p.product_id,
        product_name: p.product_name,
        report_date: dateRange.start_date,
        gmv: p.gmv || 0,
        items_sold: p.items_sold || 0,
        orders: p.orders || 0,
        est_commission: p.est_commission || 0,
        refunds: p.refunds || 0,
        items_refunded: p.items_refunded || 0,
        videos: p.videos || 0,
        live_streams: p.live_streams || 0,
        product_category: p.product_category || null,
        period_type: 'daily' as const,
        data_source: 'api',
      }));

      const { error, count } = await supabase
        .from('product_performance')
        .upsert(rows, {
          onConflict: 'brand,product_id,report_date,period_type',
          ignoreDuplicates: false,
        })
        .select('id');

      if (error) {
        errors.push(`Product upsert error: ${error.message}`);
        console.error('[Ingest] Product upsert error:', error);
      } else {
        totalUpserted += count ?? rows.length;
      }

      pageToken = response.data.pagination?.next_page_token;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Product fetch error: ${msg}`);
      break;
    }
  } while (pageToken);

  const summary: IngestionSummary = {
    table: 'product_performance',
    brand: shop.brand,
    date_start: dateRange.start_date,
    date_end: dateRange.end_date,
    rows_upserted: totalUpserted,
    errors,
    duration_ms: Date.now() - startTime,
  };

  console.log(
    `[Ingest] Product performance for ${shop.brand}: ${totalUpserted} rows upserted, ${errors.length} errors, ${summary.duration_ms}ms`
  );

  return summary;
}
