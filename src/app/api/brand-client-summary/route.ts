/**
 * Brand Client Report — Slack summary endpoint.
 *
 * Returns a concise, copy-paste Slack message the operator sends to the brand
 * contact alongside the Brand Client Report PDF. Same data + window as
 * /api/brand-client-pdf (brand + 7d/30d preset OR a custom start/end range),
 * just rendered as Slack-formatted text instead of a PDF.
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  getBrandClientReportData,
  buildBrandClientSlackMessage,
  type ReportPeriod,
} from '@/lib/data/brand-client-report';
import { BRAND_DISPLAY_NAMES } from '@/lib/utils/constants';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const brand = searchParams.get('brand') || 'all';
  const startParam = searchParams.get('start');
  const endParam = searchParams.get('end');
  const isDate = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const period: ReportPeriod | { start: string; end: string } =
    isDate(startParam) && isDate(endParam)
      ? { start: startParam, end: endParam }
      : (searchParams.get('period') === '30d' ? '30d' : '7d');
  const brandName = brand === 'all'
    ? 'All Brands'
    : (searchParams.get('name') || BRAND_DISPLAY_NAMES[brand] || brand);

  try {
    const data = await getBrandClientReportData(brand, brandName, period);
    const text = buildBrandClientSlackMessage(data);
    return NextResponse.json(
      { text, periodLabel: data.periodLabel },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err: unknown) {
    console.error('Brand client summary error:', err);
    const message = err instanceof Error ? err.message : 'Failed to build summary';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
