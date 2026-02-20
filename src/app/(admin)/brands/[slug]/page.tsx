import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { getBrandSummary, getCreatorRankings, getProductSummary, getDailyTrend } from '@/lib/data/rpc';
import { resolveDateRange } from '@/lib/data/date-utils';
import { formatCurrency, formatNumber } from '@/lib/utils/format';
import { BRAND_COLORS, BRAND_DISPLAY_NAMES } from '@/lib/utils/constants';
import { StatCard } from '@/components/dashboard/stat-card';
import { GmvTrendChart } from '@/components/dashboard/gmv-trend-chart';
import { CreatorTable } from '@/components/dashboard/creator-table';
import { ProductTable } from '@/components/dashboard/product-table';
import { DateRangePicker } from '@/components/dashboard/date-range-picker';
import { format, subDays, differenceInDays } from 'date-fns';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

const VALID_BRANDS = ['jiyu', 'catakor', 'physicians_choice', 'toplux'];

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ range?: string }>;
}

export default async function BrandDetailPage({ params, searchParams }: Props) {
  const { slug } = await params;
  if (!VALID_BRANDS.includes(slug)) notFound();

  const sp = await searchParams;
  const { startDate, endDate } = resolveDateRange(sp.range);
  const color = BRAND_COLORS[slug] ?? '#6B7280';
  const displayName = BRAND_DISPLAY_NAMES[slug] ?? slug;

  // Previous period
  const start = new Date(startDate);
  const end = new Date(endDate);
  const periodLength = differenceInDays(end, start) + 1;
  const prevEnd = subDays(start, 1);
  const prevStart = subDays(prevEnd, periodLength - 1);
  const prevStartDate = format(prevStart, 'yyyy-MM-dd');
  const prevEndDate = format(prevEnd, 'yyyy-MM-dd');

  const [summaryArr, prevSummaryArr, creators, products, trendData] = await Promise.all([
    getBrandSummary(slug, startDate, endDate).catch(() => []),
    getBrandSummary(slug, prevStartDate, prevEndDate).catch(() => []),
    getCreatorRankings(slug, startDate, endDate, 50).catch(() => []),
    getProductSummary(slug, startDate, endDate, 50).catch(() => []),
    getDailyTrend(slug, startDate, endDate).catch(() => []),
  ]);

  const summary = summaryArr[0] ?? null;
  const prevSummary = prevSummaryArr[0] ?? null;

  function pctChange(c: number, p: number): number | undefined {
    if (p === 0) return c > 0 ? 100 : undefined;
    return ((c - p) / p) * 100;
  }

  const gmvTrend = pctChange(summary?.total_gmv ?? 0, prevSummary?.total_gmv ?? 0);
  const ordersTrend = pctChange(summary?.total_orders ?? 0, prevSummary?.total_orders ?? 0);
  const itemsTrend = pctChange(summary?.total_items_sold ?? 0, prevSummary?.total_items_sold ?? 0);

  const chartData = trendData
    .sort((a, b) => a.report_date.localeCompare(b.report_date))
    .map((row) => ({
      date: format(new Date(row.report_date), 'MMM d'),
      [slug]: row.daily_gmv ?? 0,
    }));

  const trendLabel = 'vs prior period';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/brands" className="p-2 rounded-lg hover:bg-muted transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div
            className="h-10 w-10 rounded-lg flex items-center justify-center text-white font-bold"
            style={{ backgroundColor: color }}
          >
            {displayName.charAt(0)}
          </div>
          <div>
            <h1 className="text-2xl font-bold">{displayName}</h1>
            <p className="text-sm text-muted-foreground">Brand performance details</p>
          </div>
        </div>
        <Suspense fallback={null}>
          <DateRangePicker />
        </Suspense>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard label="GMV" value={formatCurrency(summary?.total_gmv ?? 0)} trend={gmvTrend} trendLabel={trendLabel} />
        <StatCard label="Orders" value={formatNumber(summary?.total_orders ?? 0)} trend={ordersTrend} trendLabel={trendLabel} />
        <StatCard label="Items Sold" value={formatNumber(summary?.total_items_sold ?? 0)} trend={itemsTrend} trendLabel={trendLabel} />
        <StatCard label="Active Creators" value={formatNumber(summary?.unique_creators ?? 0)} />
        <StatCard label="Videos" value={formatNumber(summary?.total_videos ?? 0)} />
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <h3 className="text-lg font-semibold mb-4">GMV Trend</h3>
        <GmvTrendChart data={chartData} brands={[slug]} />
      </div>

      <CreatorTable creators={creators} />
      <ProductTable products={products} />
    </div>
  );
}
