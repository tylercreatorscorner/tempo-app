import { TikTokClient } from './client';
import { createAdminClient } from '@/lib/supabase/server';
import type {
  AuditDiscrepancy,
  AuditResult,
  BrandShopIdentifier,
  DateRangeOptions,
  TikTokVideoPerformanceListData,
  TikTokAffiliateCreatorPerformanceData,
} from './types';

/**
 * Compare API-pulled data vs existing data in Supabase for a date range.
 * Returns discrepancies: GMV mismatches, missing rows, extra rows.
 * Used for one-time verification when switching from CSV to API.
 */
export async function auditBrandData(
  shop: BrandShopIdentifier,
  dateRange: DateRangeOptions
): Promise<AuditResult> {
  const discrepancies: AuditDiscrepancy[] = [];
  const client = TikTokClient.fromEnv(shop.access_token, shop.shop_id);
  const supabase = await createAdminClient();

  // --- Audit Video Performance ---
  try {
    // Fetch all video data from API for the date range
    const apiVideos = new Map<string, { gmv: number; orders: number; items_sold: number }>();
    let pageToken: string | undefined;

    do {
      const params: Record<string, string> = {
        start_date: dateRange.start_date.replace(/-/g, ''),
        end_date: dateRange.end_date.replace(/-/g, ''),
        page_size: '50',
      };
      if (pageToken) params.page_token = pageToken;

      const response = await client.get<TikTokVideoPerformanceListData>(
        '/analytics/202509/shop_videos/performance',
        params
      );

      for (const v of response.data.shop_videos || []) {
        apiVideos.set(v.id, {
          gmv: v.gmv || 0,
          orders: v.sku_orders || 0,
          items_sold: v.items_sold || 0,
        });
      }

      pageToken = response.data.pagination?.next_page_token;
    } while (pageToken);

    // Fetch existing DB data
    const { data: dbVideos } = await supabase
      .from('video_performance')
      .select('video_id, gmv, orders, items_sold, report_date')
      .eq('brand', shop.brand)
      .eq('period_type', 'daily')
      .gte('report_date', dateRange.start_date)
      .lte('report_date', dateRange.end_date);

    const dbVideoMap = new Map<string, { gmv: number; orders: number; items_sold: number }>();
    for (const row of dbVideos || []) {
      // Aggregate by video_id (may have multiple daily rows across dates)
      const existing = dbVideoMap.get(row.video_id) || { gmv: 0, orders: 0, items_sold: 0 };
      existing.gmv += parseFloat(String(row.gmv)) || 0;
      existing.orders += row.orders || 0;
      existing.items_sold += row.items_sold || 0;
      dbVideoMap.set(row.video_id, existing);
    }

    // Compare
    for (const [videoId, apiData] of apiVideos) {
      const dbData = dbVideoMap.get(videoId);
      if (!dbData) {
        discrepancies.push({
          table: 'video_performance',
          report_date: dateRange.start_date,
          field: 'gmv',
          api_value: apiData.gmv,
          db_value: 0,
          difference: apiData.gmv,
          type: 'missing_in_db',
        });
        continue;
      }

      const gmvDiff = Math.abs(apiData.gmv - dbData.gmv);
      if (gmvDiff > 0.01) {
        discrepancies.push({
          table: 'video_performance',
          report_date: dateRange.start_date,
          field: `gmv (video ${videoId})`,
          api_value: apiData.gmv,
          db_value: dbData.gmv,
          difference: apiData.gmv - dbData.gmv,
          type: 'mismatch',
        });
      }
    }

    // Check for extra rows in DB not in API
    for (const [videoId] of dbVideoMap) {
      if (!apiVideos.has(videoId)) {
        const dbData = dbVideoMap.get(videoId)!;
        discrepancies.push({
          table: 'video_performance',
          report_date: dateRange.start_date,
          field: `gmv (video ${videoId})`,
          api_value: 0,
          db_value: dbData.gmv,
          difference: -dbData.gmv,
          type: 'extra_in_db',
        });
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    discrepancies.push({
      table: 'video_performance',
      report_date: dateRange.start_date,
      field: 'AUDIT_ERROR',
      api_value: 0,
      db_value: 0,
      difference: 0,
      type: 'mismatch',
    });
    console.error('[Audit] Video audit error:', msg);
  }

  // --- Audit Creator Performance ---
  try {
    const apiCreators = new Map<string, { gmv: number; orders: number }>();
    let pageToken: string | undefined;

    do {
      const params: Record<string, string> = {
        start_date: dateRange.start_date.replace(/-/g, ''),
        end_date: dateRange.end_date.replace(/-/g, ''),
        page_size: '50',
      };
      if (pageToken) params.page_token = pageToken;

      const response = await client.get<TikTokAffiliateCreatorPerformanceData>(
        '/affiliate/202405/seller_affiliate/creator_performance',
        params
      );

      for (const c of response.data.creator_performances || []) {
        const name = c.creator_name?.toLowerCase().replace(/^@/, '') || c.creator_id;
        apiCreators.set(name, { gmv: c.gmv || 0, orders: c.orders || 0 });
      }

      pageToken = response.data.pagination?.next_page_token;
    } while (pageToken);

    const { data: dbCreators } = await supabase
      .from('creator_performance')
      .select('creator_name, gmv, orders, report_date')
      .eq('brand', shop.brand)
      .eq('period_type', 'daily')
      .gte('report_date', dateRange.start_date)
      .lte('report_date', dateRange.end_date);

    const dbCreatorMap = new Map<string, { gmv: number; orders: number }>();
    for (const row of dbCreators || []) {
      const name = row.creator_name?.toLowerCase().replace(/^@/, '') || '';
      const existing = dbCreatorMap.get(name) || { gmv: 0, orders: 0 };
      existing.gmv += parseFloat(String(row.gmv)) || 0;
      existing.orders += row.orders || 0;
      dbCreatorMap.set(name, existing);
    }

    for (const [name, apiData] of apiCreators) {
      const dbData = dbCreatorMap.get(name);
      if (!dbData) {
        discrepancies.push({
          table: 'creator_performance',
          report_date: dateRange.start_date,
          field: `gmv (creator ${name})`,
          api_value: apiData.gmv,
          db_value: 0,
          difference: apiData.gmv,
          type: 'missing_in_db',
        });
        continue;
      }

      const gmvDiff = Math.abs(apiData.gmv - dbData.gmv);
      if (gmvDiff > 0.01) {
        discrepancies.push({
          table: 'creator_performance',
          report_date: dateRange.start_date,
          field: `gmv (creator ${name})`,
          api_value: apiData.gmv,
          db_value: dbData.gmv,
          difference: apiData.gmv - dbData.gmv,
          type: 'mismatch',
        });
      }
    }
  } catch (err) {
    console.error('[Audit] Creator audit error:', err instanceof Error ? err.message : err);
  }

  return {
    brand: shop.brand,
    date_start: dateRange.start_date,
    date_end: dateRange.end_date,
    discrepancies,
    summary: {
      total_checked: discrepancies.length,
      mismatches: discrepancies.filter((d) => d.type === 'mismatch').length,
      missing_in_db: discrepancies.filter((d) => d.type === 'missing_in_db').length,
      extra_in_db: discrepancies.filter((d) => d.type === 'extra_in_db').length,
    },
  };
}
