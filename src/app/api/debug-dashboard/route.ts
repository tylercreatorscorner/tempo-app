import { NextResponse } from 'next/server';
import { getBrandSummary, getCreatorRankings, getProductSummary, getVideoSummary, getDailyTrend } from '@/lib/data/rpc';
import { resolveDateRange } from '@/lib/data/date-utils';
import { format, subDays, differenceInDays } from 'date-fns';

export async function GET() {
  const results: Record<string, unknown> = {};
  
  try {
    const { startDate, endDate } = resolveDateRange(undefined);
    results.dateRange = { startDate, endDate };
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    const periodLength = differenceInDays(end, start) + 1;
    const prevEnd = subDays(start, 1);
    const prevStart = subDays(prevEnd, periodLength - 1);
    const prevStartDate = format(prevStart, 'yyyy-MM-dd');
    const prevEndDate = format(prevEnd, 'yyyy-MM-dd');
    results.prevRange = { prevStartDate, prevEndDate };

    // Test each RPC individually
    const brands = ['jiyu', 'catakor', 'physicians_choice', 'toplux'];
    
    for (const brand of brands) {
      try {
        const summary = await getBrandSummary(brand, startDate, endDate);
        results[`summary_${brand}`] = { ok: true, rows: summary.length, first: summary[0] ?? null };
      } catch (e: unknown) {
        results[`summary_${brand}`] = { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    }

    try {
      const creators = await getCreatorRankings('jiyu', startDate, endDate, 5);
      results.creators_jiyu = { ok: true, count: creators.length };
    } catch (e: unknown) {
      results.creators_jiyu = { ok: false, error: e instanceof Error ? e.message : String(e) };
    }

    try {
      const products = await getProductSummary('jiyu', startDate, endDate, 5);
      results.products_jiyu = { ok: true, count: products.length };
    } catch (e: unknown) {
      results.products_jiyu = { ok: false, error: e instanceof Error ? e.message : String(e) };
    }

    try {
      const videos = await getVideoSummary('jiyu', startDate, endDate, 5);
      results.videos_jiyu = { ok: true, count: videos.length };
    } catch (e: unknown) {
      results.videos_jiyu = { ok: false, error: e instanceof Error ? e.message : String(e) };
    }

    try {
      const trend = await getDailyTrend('jiyu', startDate, endDate);
      results.trend_jiyu = { ok: true, count: trend.length };
    } catch (e: unknown) {
      results.trend_jiyu = { ok: false, error: e instanceof Error ? e.message : String(e) };
    }

    // Test the yesterday calculation
    try {
      const yesterday = subDays(new Date(), 1);
      const yesterdayStr = format(yesterday, 'yyyy-MM-dd');
      results.yesterday = yesterdayStr;
      const ySummary = await getBrandSummary('jiyu', yesterdayStr, yesterdayStr);
      results.yesterday_summary = { ok: true, rows: ySummary.length };
    } catch (e: unknown) {
      results.yesterday_summary = { ok: false, error: e instanceof Error ? e.message : String(e) };
    }

    // Test imports that the dashboard page uses
    try {
      const { formatCurrency, formatNumber } = await import('@/lib/utils/format');
      results.formatTest = { currency: formatCurrency(12345), number: formatNumber(67890) };
    } catch (e: unknown) {
      results.formatImport = { ok: false, error: e instanceof Error ? e.message : String(e) };
    }

  } catch (e: unknown) {
    results.topLevelError = e instanceof Error ? e.message : String(e);
  }

  return NextResponse.json(results);
}
