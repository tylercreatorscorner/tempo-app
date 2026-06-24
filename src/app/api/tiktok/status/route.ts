import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import type { SyncStatus } from '@/lib/tiktok/types';

/**
 * GET /api/tiktok/status
 * Returns last sync time, rows synced, and any errors per brand.
 */
export async function GET() {
  try {
    const supabase = await createAdminClient();

    const { data: connections, error } = await supabase
      .from('tiktok_shop_connections')
      .select('brand, last_sync_at, last_sync_status, last_sync_error');

    if (error) {
      return NextResponse.json(
        { error: `Failed to fetch connections: ${error.message}` },
        { status: 500 }
      );
    }

    if (!connections || connections.length === 0) {
      return NextResponse.json({
        brands: [],
        message: 'No TikTok shop connections configured',
      });
    }

    // For each brand, get row counts from the last sync date
    const statuses: SyncStatus[] = [];

    const { getBrandRegistry, slugToUuid } = await import('@/lib/data/brand-registry');
    const reg = await getBrandRegistry();

    for (const conn of connections) {
      let rowsSynced = null;

      if (conn.last_sync_at) {
        const syncDate = conn.last_sync_at.split('T')[0];

        const brandUuid = slugToUuid(reg, conn.brand);
        const [videoCount, creatorCount, productCount] = await Promise.all([
          supabase
            .from('daily_video_product_stats')
            .select('id', { count: 'exact', head: true })
            .eq('brand_id', brandUuid)
            .eq('data_source', 'api')
            .gte('created_at', syncDate),
          supabase
            .from('daily_creator_stats')
            .select('id', { count: 'exact', head: true })
            .eq('brand_id', brandUuid)
            .eq('data_source', 'api')
            .gte('created_at', syncDate),
          supabase
            .from('daily_product_stats')
            .select('id', { count: 'exact', head: true })
            .eq('brand_id', brandUuid)
            .eq('data_source', 'api')
            .gte('created_at', syncDate),
        ]);

        rowsSynced = {
          video_performance: videoCount.count ?? 0,
          creator_performance: creatorCount.count ?? 0,
          product_performance: productCount.count ?? 0,
        };
      }

      statuses.push({
        brand: conn.brand,
        last_sync_at: conn.last_sync_at,
        last_sync_status: conn.last_sync_status,
        last_sync_error: conn.last_sync_error,
        rows_synced: rowsSynced,
      });
    }

    return NextResponse.json({ brands: statuses });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[API] /api/tiktok/status error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
