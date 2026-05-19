import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { generateReport, type ReportType, type ReportPeriod } from '@/lib/data/reports';
import { throttle } from '@/lib/rate-limit';

const VALID_TYPES: ReportType[] = ['performance-summary', 'creator-activity', 'brand-report'];
const VALID_PERIODS: ReportPeriod[] = ['7d', '30d'];

export async function GET(request: NextRequest) {
  const scope = await getWorkspaceScope();
  if (!scope) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Throttle: 1 generation per 3s per user. Reports are expensive; this stops
  // accidental click-spam from blocking the worker queue.
  if (!throttle(`reporting:${scope.userId}`, 3000)) {
    return NextResponse.json({ error: 'Too many requests, please wait a moment' }, { status: 429 });
  }

  const { searchParams } = request.nextUrl;
  const type   = searchParams.get('type')   as ReportType | null;
  const brand  = searchParams.get('brand')  || 'all';
  const period = (searchParams.get('period') || '7d') as ReportPeriod;

  if (!type || !VALID_TYPES.includes(type)) {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  }
  if (!VALID_PERIODS.includes(period)) {
    return NextResponse.json({ error: 'Invalid period' }, { status: 400 });
  }
  // Managers may only generate reports for one of their own brands (no
  // all-brands aggregate, which would span brands they don't manage).
  if (scope.brandScope.kind === 'scoped'
    && (brand === 'all' || !scope.brandScope.brandSlugs.includes(brand))) {
    return NextResponse.json(
      { error: 'Select one of your brands to generate a report' }, { status: 403 });
  }

  try {
    const text = await generateReport(type, brand, period);
    return NextResponse.json({ text });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to generate report';
    console.error('[api/reporting]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
