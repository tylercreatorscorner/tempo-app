/**
 * GET /api/cron/shadow-ingest?brand=jiyu&date=2026-07-24&limit=40
 *
 * Build ONE brand-day from the API into the api_shadow_* tables, so it can be
 * diffed column-by-column against what was uploaded by hand.
 *
 * ⚠️ WRITES NOTHING TO A FACT TABLE. creator_performance, video_performance and
 * product_performance are untouched by this route and by everything it calls.
 * That is the entire premise of a shadow run: if it could write to them, a bad
 * run would corrupt the thing it exists to check.
 *
 * Behind the cron bearer token rather than a session, because proving this needs
 * many runs at different dates and caps, and one browser click per iteration is
 * not a workable loop.
 */
import { NextRequest, NextResponse } from 'next/server';
import { runShadowIngest } from '@/lib/tiktok/shadow-ingest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  // FAIL CLOSED — an unset CRON_SECRET must mean "nobody", not "everybody".
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const brand = (url.searchParams.get('brand') ?? '').trim();
  const date = (url.searchParams.get('date') ?? '').trim();
  const limitRaw = Number(url.searchParams.get('limit') ?? '40');

  if (!brand) return NextResponse.json({ error: 'Missing brand' }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });
  }
  // Bounded so a typo cannot launch thousands of calls at someone else's rate
  // limiter — the failure that would actually cost this app its access.
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(1, limitRaw), 500) : 40;

  const result = await runShadowIngest(brand, date, limit);
  // 'partial' is a 200: the run completed and did what it was asked, it just
  // hit the cap. Only a genuine failure is a 500.
  return NextResponse.json(result, { status: result.status === 'failed' ? 500 : 200 });
}
