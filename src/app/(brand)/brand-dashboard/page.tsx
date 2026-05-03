import { Suspense } from 'react';
import Link from 'next/link';
import { ChevronRight, ExternalLink } from 'lucide-react';
import { requireBrandPortalContext } from '@/lib/data/brand-portal';
import {
  getBrandPortalDashboard,
  type BrandPortalPeriod,
} from '@/lib/data/brand-portal-overview';
import { createAdminClient } from '@/lib/supabase/server';
import { BRAND_UUID_MAP } from '@/lib/utils/constants';
import { StatCard } from '@/components/dashboard/stat-card';
import { GmvComparisonChart } from '@/components/charts/gmv-comparison-chart';
import { PeriodTabs } from './period-tabs';

export const dynamic = 'force-dynamic';

const TOP_CREATORS_PREVIEW = 5;
const TOP_VIDEOS_PREVIEW = 5;

interface PageProps {
  searchParams: Promise<{ period?: string }>;
}

export default async function BrandOverview({ searchParams }: PageProps) {
  const ctx = await requireBrandPortalContext();
  const params = await searchParams;
  const period: BrandPortalPeriod = (() => {
    switch (params.period) {
      case 'yesterday':
      case '30d':
      case 'this_month':
      case 'last_month':
        return params.period;
      default:
        return '7d';
    }
  })();

  const admin = await createAdminClient();
  const brandUuid = BRAND_UUID_MAP[ctx.activeBrand.slug] ?? ctx.activeBrand.id;
  const data = await getBrandPortalDashboard(
    admin,
    brandUuid,
    ctx.activeBrand.slug,
    ctx.activeBrand.display_name || ctx.activeBrand.name,
    period,
  );

  const accent = ctx.activeBrand.color || '#FF4D8D';
  const dailyGmvSparkline = data.dailyPerformance.map((d) => d.gmv);
  const dailyPostsSparkline = data.dailyPerformance.map((d) => d.posts);

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#1A1B3A]">{data.brandName}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Snapshot · {data.periodLabel}
          </p>
        </div>
        <PeriodTabs current={period} accentColor={accent} />
      </div>

      {/* KPI grid — hero GMV + standard cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          label="GMV"
          value={fmtCurrency(data.totalGmv)}
          trend={data.gmvChangePct ?? undefined}
          trendLabel="vs prior period"
          hero
          accentColor={accent}
          sparklineData={dailyGmvSparkline}
        />
        <StatCard
          label="Posts"
          value={fmtNumber(data.totalPosts)}
          trend={data.postsChangePct ?? undefined}
          trendLabel="vs prior period"
          accentColor={accent}
          sparklineData={dailyPostsSparkline}
        />
        <StatCard
          label="Managed creators"
          value={fmtNumber(data.managedCount)}
          subValue="Currently active"
          accentColor={accent}
        />
      </div>

      {/* Daily GMV chart */}
      {data.dailyPerformance.length > 1 && (
        <Card>
          <CardHeader title="Daily GMV" subtitle={`Compared to ${priorLabel(period)}`} />
          <div className="px-2 pb-2">
            <Suspense fallback={<div className="h-[280px]" />}>
              <GmvComparisonChart
                current={data.dailyPerformance.map((d) => ({
                  date: d.date.toISOString().split('T')[0],
                  gmv: d.gmv,
                }))}
                prior={data.priorPoints.map((p) => ({
                  priorDate: p.priorDate.toISOString().split('T')[0],
                  gmv: p.gmv,
                }))}
                color={accent}
              />
            </Suspense>
          </div>
        </Card>
      )}

      {/* Snapshot panes: top creators + recent videos side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top creators (compact) */}
        <Card>
          <CardHeaderWithLink
            title="Top creators"
            subtitle={`By GMV in ${PERIOD_SHORT[period]}`}
            href={`/brand-dashboard/creators?period=${period}`}
            linkLabel="View all"
          />
          <div className="divide-y divide-gray-50">
            {data.creators.length === 0 ? (
              <EmptyRow text="No managed creators yet." />
            ) : (
              data.creators.slice(0, TOP_CREATORS_PREVIEW).map((c, i) => (
                <Link
                  key={c.managedId}
                  href={`/brand-dashboard/creators/${c.primaryHandle}?period=${period}`}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50/60 transition-colors"
                >
                  <span className="text-xs text-gray-400 w-5 tabular-nums">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-sm font-medium truncate"
                      style={{ color: accent }}
                      title={c.realName ?? undefined}
                    >
                      @{c.primaryHandle}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {c.posts} post{c.posts === 1 ? '' : 's'}
                      {c.realName ? ` · ${c.realName}` : ''}
                    </p>
                  </div>
                  <p className="text-sm font-semibold tabular-nums text-[#1A1B3A]">
                    {fmtCurrency(c.gmv)}
                  </p>
                  <ChevronRight className="h-4 w-4 text-gray-300 shrink-0" />
                </Link>
              ))
            )}
          </div>
        </Card>

        {/* Top posts (compact) — sorted by period GMV desc by the RPC */}
        <Card>
          <CardHeaderWithLink
            title="Top posts"
            subtitle="Highest-grossing posts in this period"
            href={`/brand-dashboard/videos?period=${period}`}
            linkLabel="View all"
          />
          <div className="divide-y divide-gray-50">
            {data.videos.length === 0 ? (
              <EmptyRow text="No posts in this period." />
            ) : (
              data.videos.slice(0, TOP_VIDEOS_PREVIEW).map((v) => (
                <a
                  key={v.videoId}
                  href={
                    v.url ??
                    `https://www.tiktok.com/@${v.creatorHandle}/video/${v.videoId}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50/60 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#1A1B3A] truncate" title={v.title}>
                      {v.title}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      @{v.creatorHandle}
                      {v.postDate && (
                        <>
                          <span className="mx-1.5 text-gray-300">·</span>
                          {fmtDate(v.postDate)}
                        </>
                      )}
                    </p>
                  </div>
                  <p
                    className="text-sm font-semibold tabular-nums shrink-0"
                    style={{ color: accent }}
                  >
                    {fmtCurrency(v.periodGmv)}
                  </p>
                  <ExternalLink className="h-4 w-4 text-gray-300 shrink-0" />
                </a>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ── Subcomponents ──

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
      {children}
    </div>
  );
}

function CardHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="px-4 pt-4 pb-3 border-b border-gray-50">
      <h3 className="text-sm font-semibold text-[#1A1B3A]">{title}</h3>
      {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
    </div>
  );
}

function CardHeaderWithLink({
  title,
  subtitle,
  href,
  linkLabel,
}: {
  title: string;
  subtitle?: string;
  href: string;
  linkLabel: string;
}) {
  return (
    <div className="px-4 pt-4 pb-3 border-b border-gray-50 flex items-start justify-between gap-3">
      <div>
        <h3 className="text-sm font-semibold text-[#1A1B3A]">{title}</h3>
        {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      <Link
        href={href}
        className="text-xs font-medium text-gray-500 hover:text-[#1A1B3A] flex items-center gap-0.5 shrink-0"
      >
        {linkLabel}
        <ChevronRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return <p className="text-sm text-gray-400 px-4 py-8 text-center">{text}</p>;
}

// ── Helpers ──

const PERIOD_SHORT: Record<BrandPortalPeriod, string> = {
  yesterday: 'yesterday',
  '7d': 'last 7 days',
  '30d': 'last 30 days',
  this_month: 'this month',
  last_month: 'last month',
};

function priorLabel(period: BrandPortalPeriod): string {
  switch (period) {
    case 'yesterday':
      return 'the day before';
    case '7d':
      return 'the prior 7 days';
    case '30d':
      return 'the prior 30 days';
    case 'this_month':
      return 'last month (same days)';
    case 'last_month':
      return 'two months ago';
  }
}

function fmtCurrency(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function fmtNumber(n: number): string {
  return n.toLocaleString('en-US');
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
