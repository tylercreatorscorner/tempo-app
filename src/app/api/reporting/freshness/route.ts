/**
 * Returns the latest report_date in our data tables for a given brand filter.
 * Used by the /reporting page's stale-data banner so users know when their
 * generated posts are reporting on data that's older than the calendar window
 * they might expect.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getLatestReportDate } from '@/lib/data/discord-posts';

export async function GET(request: NextRequest) {
  const brand = request.nextUrl.searchParams.get('brand') || 'all';
  try {
    const latest = await getLatestReportDate(brand);
    if (!latest) {
      return NextResponse.json({ latestReportDate: null, daysOld: null });
    }
    const now = new Date();
    const daysOld = Math.floor((now.getTime() - latest.getTime()) / (1000 * 60 * 60 * 24));
    return NextResponse.json({
      latestReportDate: latest.toISOString().slice(0, 10),
      daysOld,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load freshness';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
