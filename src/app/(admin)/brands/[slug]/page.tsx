export const dynamic = 'force-dynamic';

import { PageHeader } from '@/components/ui/page-header';
import { BrandIdentity } from '@/components/creators/brand-identity';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { getBrandSummary, getCreatorRankings, getProductSummary, getDailyTrend } from '@/lib/data/rpc';
import { resolveDateRange } from '@/lib/data/date-utils';
import { getDataAnchorDate } from '@/lib/data/data-anchor';
import { formatCurrency, formatNumber } from '@/lib/utils/format';
import { StatCard } from '@/components/dashboard/stat-card';
import { GmvTrendChart } from '@/components/dashboard/gmv-trend-chart';
import { CreatorTable } from '@/components/dashboard/creator-table';
import { ProductTable } from '@/components/dashboard/product-table';
import { DateRangePicker } from '@/components/dashboard/date-range-picker';
import { aggregateCreatorsByRealName } from '@/lib/data/creator-aggregate';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { getAllowedBrandsForUser } from '@/lib/data/brands';
import { format, subDays, differenceInDays } from 'date-fns';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { BrandTabs } from './brand-tabs';
import { AmNoteEditor } from './am-note-editor';
import styles from '../brands.module.css';

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ range?: string; start?: string; end?: string }>;
}

export default async function BrandDetailPage({ params, searchParams }: Props) {
  const { slug } = await params;

  // Scoped (manager) users may only open brands in their access. null =
  // owner/admin (no restriction). Treat out-of-scope as not-found so the
  // page doesn't even confirm the brand exists.
  const allowedBrands = await getAllowedBrandsForUser();
  if (allowedBrands && !allowedBrands.includes(slug)) notFound();

  // Validate brand exists in tenant's brands (RLS-scoped)
  const supabase = await createClient();
  const { data: brand } = await supabase
    .from('brands_v2')
    .select('slug, name, display_name, color')
    .eq('slug', slug)
    .single();
  if (!brand) notFound();

  const sp = await searchParams;
  // Rolling presets end at the last day with data, not calendar yesterday.
  // Scoped to what this page is showing, never per brand inside a total.
  // See the note on resolveDateRange.
  const dataThrough = await getDataAnchorDate([slug]);
  const { startDate, endDate, lagDays, anchorDate } = resolveDateRange(sp.range, sp.start, sp.end, dataThrough);
  // Non-null only when the window actually moved; see DateRangePicker.
  const staleThrough = lagDays > 0 ? anchorDate : null;
  const displayName = brand.display_name || brand.name || slug;

  // Previous period
  const start = new Date(startDate);
  const end = new Date(endDate);
  const periodLength = differenceInDays(end, start) + 1;
  const prevEnd = subDays(start, 1);
  const prevStart = subDays(prevEnd, periodLength - 1);
  const prevStartDate = format(prevStart, 'yyyy-MM-dd');
  const prevEndDate = format(prevEnd, 'yyyy-MM-dd');

  const [summaryArr, prevSummaryArr, creators, products, trendData, settingsRes] = await Promise.all([
    getBrandSummary(slug, startDate, endDate).catch(() => []),
    getBrandSummary(slug, prevStartDate, prevEndDate).catch(() => []),
    getCreatorRankings(slug, startDate, endDate, 50).catch(() => []),
    getProductSummary(slug, startDate, endDate, 50).catch(() => []),
    getDailyTrend(slug, startDate, endDate).catch(() => []),
    // Admin client: mig 106 makes brand_settings service-role only (the
    // finance lockdown). Access is already gated above via allowedBrands.
    (await createAdminClient())
      .from('brand_settings')
      .select('brand_overview_note, brand_overview_note_updated_at, brand_overview_note_updated_by')
      .eq('brand', slug)
      .maybeSingle(),
  ]);

  const noteRow = settingsRes.data as {
    brand_overview_note: string | null;
    brand_overview_note_updated_at: string | null;
    brand_overview_note_updated_by: string | null;
  } | null;
  let noteAuthor: string | null = null;
  if (noteRow?.brand_overview_note_updated_by) {
    const { data: author } = await supabase
      .from('user_profiles')
      .select('name')
      .eq('user_id', noteRow.brand_overview_note_updated_by)
      .maybeSingle();
    noteAuthor = author?.name ?? null;
  }

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
    <div className={styles.page}>
      <PageHeader eyebrow="Brands" title={<BrandIdentity brand={slug} label={displayName} />} subtitle="Brand performance details" actions={<div className="flex flex-wrap items-center gap-2"><Link href="/brands" className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs"><ArrowLeft size={14} />All brands</Link><Suspense fallback={null}><DateRangePicker staleThrough={staleThrough} /></Suspense></div>} />

      <div className={styles.context}><strong>{startDate} – {endDate}</strong><span>{periodLength} days</span><span>Compared with {prevStartDate} – {prevEndDate}</span></div>
      <div className={`${styles.metrics} ${styles.detailMetrics}`}>
        <StatCard label="GMV" value={formatCurrency(summary?.total_gmv ?? 0)} trend={gmvTrend} trendLabel={trendLabel} />
        <StatCard label="Orders" value={formatNumber(summary?.total_orders ?? 0)} trend={ordersTrend} trendLabel={trendLabel} />
        <StatCard label="Items Sold" value={formatNumber(summary?.total_items_sold ?? 0)} trend={itemsTrend} trendLabel={trendLabel} />
        <StatCard label="Active Creators" value={formatNumber(summary?.unique_creators ?? 0)} />
        <StatCard label="Videos" value={formatNumber(summary?.total_videos ?? 0)} />
      </div>

      {/* Tabbed sections — Overview / Creators / Products. The standalone
          /products page was dropped — per-brand product analytics now lives
          inside each brand's drill-down where it has the most context. */}
      <BrandTabs
        overview={
          <div className={styles.overview}>
            <section className={`${styles.panel} ${styles.trend}`} aria-label="Brand GMV trend">
              <header className={styles.panelHeader}><h2>GMV by day</h2><p>{startDate} – {endDate}</p></header>
              <div className={styles.trendBody}><GmvTrendChart data={chartData} brands={[slug]} /></div>
            </section>
            <aside className={styles.contextColumn} aria-label="Brand context and client note">
              <AmNoteEditor
              brandSlug={slug}
              initialNote={noteRow?.brand_overview_note ?? ''}
              initialUpdatedAt={noteRow?.brand_overview_note_updated_at ?? null}
              initialAuthorName={noteAuthor}
              />
              <section className={styles.panel}>
                <header className={styles.panelHeader}><h2>Period context</h2></header>
                <dl className="grid gap-3 px-4 py-3 text-xs"><div className="flex justify-between gap-3"><dt className="text-muted-foreground">Selected dates</dt><dd className="text-right tabular-nums">{startDate}<br/>{endDate}</dd></div><div className="flex justify-between gap-3"><dt className="text-muted-foreground">Comparison</dt><dd className="text-right tabular-nums">{prevStartDate}<br/>{prevEndDate}</dd></div><div className="border-t border-border pt-3 text-muted-foreground"><dt className="sr-only">Breakdowns</dt><dd>Use Creators and Products for the ranked breakdown of this period.</dd></div></dl>
              </section>
            </aside>
          </div>
        }
        creators={<CreatorTable creators={await aggregateCreatorsByRealName(creators)} />}
        products={<ProductTable products={products} />}
      />
    </div>
  );
}
