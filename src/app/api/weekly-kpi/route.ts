/**
 * Weekly client KPI report — generate endpoint.
 *
 * GET /api/weekly-kpi?brand=<slug>&period=7d|30d|custom[&start=&end=]
 *
 * Returns the resolved numbers plus a drafted prefill for the "creator
 * updates" section. Campaign blockers get NO prefill: nothing in the database
 * knows about them, and a drafted "none" would be a claim we can't support.
 *
 * Same scope rules as /api/discord-posts — a brand-scoped manager may only
 * generate for their own brands, never 'all'.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { throttle } from '@/lib/rate-limit';
import { getWeeklyKpiReport, type KpiPeriod } from '@/lib/data/weekly-kpi-report';
import { draftCreatorUpdates } from '@/lib/data/weekly-kpi-format';

export const runtime = 'nodejs';
export const maxDuration = 60;

const isDate = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

export async function GET(request: NextRequest) {
  const scope = await getWorkspaceScope();
  if (!scope) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  if (!throttle(`weekly-kpi:${scope.userId}`, 3000)) {
    return NextResponse.json({ error: 'Too many requests, please wait a moment' }, { status: 429 });
  }

  const { searchParams } = request.nextUrl;
  const brand = searchParams.get('brand') || 'all';
  const rawPeriod = searchParams.get('period') || '7d';

  let period: KpiPeriod;
  if (rawPeriod === 'custom') {
    const start = searchParams.get('start');
    const end = searchParams.get('end');
    if (!isDate(start) || !isDate(end) || start > end) {
      return NextResponse.json({ error: 'A custom period needs a valid start and end date' }, { status: 400 });
    }
    period = { start, end };
  } else if (rawPeriod === '7d' || rawPeriod === '30d') {
    period = rawPeriod;
  } else {
    return NextResponse.json({ error: 'Invalid period' }, { status: 400 });
  }

  // Managers may only report on one of their own brands.
  if (scope.brandScope.kind === 'scoped'
    && (brand === 'all' || !scope.brandScope.brandSlugs.includes(brand))) {
    return NextResponse.json(
      { error: 'Select one of your brands to generate this report' }, { status: 403 });
  }

  try {
    const data = await getWeeklyKpiReport(brand, period);
    return NextResponse.json({
      data,
      prefill: { creatorUpdates: draftCreatorUpdates(data) },
    });
  } catch (err: unknown) {
    console.error('Weekly KPI report error:', err);
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
