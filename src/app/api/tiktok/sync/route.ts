import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { syncBrand } from '@/lib/tiktok/scheduler';
import { DATA_ENABLED_BRANDS } from '@/lib/utils/constants';
import type { TikTokShopConnection } from '@/lib/tiktok/types';

const COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

/**
 * POST /api/tiktok/sync
 * Trigger a manual sync for a specific brand.
 * Body: { brand: string, start_date?: string, end_date?: string }
 * Protected by service role or admin auth.
 */
export async function POST(request: NextRequest) {
  try {
    // Auth: check for service role key or admin session
    const authHeader = request.headers.get('authorization');
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!authHeader || !serviceKey || authHeader !== `Bearer ${serviceKey}`) {
      // Check for authenticated admin user
      const supabase = await createAdminClient();
      const sessionToken = request.headers.get('x-session-token');
      if (!sessionToken) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      // For now, service role bearer token is the only auth method
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { brand, start_date, end_date } = body;

    if (!brand) {
      return NextResponse.json(
        { error: 'Missing required field: brand' },
        { status: 400 }
      );
    }

    // Guard: only data-enabled brands can sync
    if (!DATA_ENABLED_BRANDS.includes(brand)) {
      console.error(`[SYNC BLOCKED] Attempted sync for non-data-enabled brand: ${brand}`);
      return NextResponse.json(
        { error: `Brand "${brand}" is not enabled for data sync.` },
        { status: 403 }
      );
    }

    const supabase = await createAdminClient();

    // Fetch the connection for this brand
    const { data: connection, error: connError } = await supabase
      .from('tiktok_shop_connections')
      .select('*')
      .eq('brand', brand)
      .single();

    if (connError || !connection) {
      return NextResponse.json(
        { error: `No TikTok connection found for brand: ${brand}` },
        { status: 404 }
      );
    }

    const conn = connection as TikTokShopConnection;

    // Check cooldown (1 hour per brand)
    if (conn.last_sync_at) {
      const lastSync = new Date(conn.last_sync_at).getTime();
      const elapsed = Date.now() - lastSync;
      if (elapsed < COOLDOWN_MS) {
        const remainingMin = Math.ceil((COOLDOWN_MS - elapsed) / 60000);
        return NextResponse.json(
          {
            error: `Sync cooldown active. Try again in ${remainingMin} minutes.`,
            last_sync_at: conn.last_sync_at,
          },
          { status: 429 }
        );
      }
    }

    const dateRange =
      start_date && end_date ? { start_date, end_date } : undefined;

    const result = await syncBrand(conn, dateRange);

    return NextResponse.json({ success: true, result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[API] /api/tiktok/sync error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
