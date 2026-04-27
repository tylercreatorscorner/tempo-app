import { NextRequest, NextResponse } from 'next/server';
import { generateReport, type ReportType, type ReportPeriod } from '@/lib/data/reports';

const VALID_TYPES: ReportType[] = ['performance-summary', 'creator-activity', 'brand-report'];
const VALID_PERIODS: ReportPeriod[] = ['7d', '30d'];

export async function GET(request: NextRequest) {
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

  try {
    const text = await generateReport(type, brand, period);
    return NextResponse.json({ text });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to generate report';
    console.error('[api/reporting]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
