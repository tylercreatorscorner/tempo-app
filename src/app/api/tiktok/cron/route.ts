import { NextRequest, NextResponse } from 'next/server';
import { syncAllBrands } from '@/lib/tiktok/scheduler';

/**
 * POST /api/tiktok/cron
 * Called by cron scheduler to pull data for all connected brands.
 * Protected by CRON_SECRET env var.
 * Body (optional): { start_date?: string, end_date?: string, tenant_id?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      return NextResponse.json(
        { error: 'CRON_SECRET not configured' },
        { status: 500 }
      );
    }

    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: Record<string, string> = {};
    try {
      body = await request.json();
    } catch {
      // Empty body is fine, uses defaults
    }

    const dateRange =
      body.start_date && body.end_date
        ? { start_date: body.start_date, end_date: body.end_date }
        : undefined;

    const results = await syncAllBrands(body.tenant_id, dateRange);

    const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);

    return NextResponse.json({
      success: totalErrors === 0,
      brands_synced: results.length,
      total_errors: totalErrors,
      results,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[API] /api/tiktok/cron error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
