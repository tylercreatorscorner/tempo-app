import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ExternalLink, TrendingUp, TrendingDown } from 'lucide-react';
import { requireBrandPortalContext } from '@/lib/data/brand-portal';
import { getBrandCreatorDetail } from '@/lib/data/brand-portal-creator';
import { createAdminClient } from '@/lib/supabase/server';
import { getBrandRegistry, slugToUuid } from '@/lib/data/brand-registry';
import { resolveWatchUrl } from '@/lib/utils/format';
import { GmvComparisonChart } from '@/components/charts/gmv-comparison-chart';
import { PeriodTabs } from '../../period-tabs';
import type { BrandPortalPeriod } from '@/lib/data/brand-portal-overview';
import { readableOn } from '@/lib/utils/brand-color';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{ period?: string }>;
}

export default async function BrandCreatorDetailPage({ params, searchParams }: PageProps) {
  const ctx = await requireBrandPortalContext();
  const { handle } = await params;
  const sp = await searchParams;

  const period: BrandPortalPeriod = (() => {
    switch (sp.period) {
      case 'yesterday':
      case '30d':
      case 'this_month':
      case 'last_month':
        return sp.period;
      default:
        return '7d';
    }
  })();

  const admin = await createAdminClient();
  const reg = await getBrandRegistry();
  const brandUuid = slugToUuid(reg, ctx.activeBrand.slug) ?? ctx.activeBrand.id;
  const detail = await getBrandCreatorDetail(
    admin,
    brandUuid,
    ctx.activeBrand.slug,
    decodeURIComponent(handle).toLowerCase(),
    period,
  );

  if (!detail) notFound();

  const accent = ctx.activeBrand.color || '#FF4D8D';

  return (
    <div className="space-y-6 max-w-[1200px] mx-auto">
      {/* Back link */}
      <Link
        href="/brand-dashboard"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to overview
      </Link>

      {/* Header card */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 px-5 pt-5 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-foreground">
                @{detail.primaryHandle}
              </h1>
              <a
                href={`https://www.tiktok.com/@${detail.primaryHandle}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Open on TikTok"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {detail.realName ?? 'Managed creator'} · {detail.periodLabel}
            </p>
          </div>
          <PeriodTabs current={period} accentColor={accent} />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 border-t border-border/50">
          <CreatorStat
            label="GMV"
            value={fmtCurrency(detail.totalGmv)}
            changePct={detail.gmvChangePct}
            accent={accent}
            primary
          />
          <CreatorStat
            label="Posts"
            value={fmtNumber(detail.totalPosts)}
            changePct={detail.postsChangePct}
            accent={accent}
          />
          <CreatorStat
            label="Lifetime GMV"
            value={fmtCurrency(detail.lifetimeGmv)}
            accent={accent}
          />
          <CreatorStat
            label="Tier"
            value={detail.currentTier ?? '—'}
            accent={accent}
          />
        </div>
      </div>

      {/* Daily GMV chart */}
      {detail.dailyPerformance.length > 1 && (
        <Card>
          <CardHeader title="Daily GMV" subtitle="Compared to the prior period" />
          <div className="px-2 pb-2">
            <GmvComparisonChart
              current={detail.dailyPerformance.map((d) => ({
                date: d.date.toISOString().split('T')[0],
                gmv: d.gmv,
              }))}
              prior={detail.priorPoints.map((p) => ({
                priorDate: p.priorDate.toISOString().split('T')[0],
                gmv: p.gmv,
              }))}
              color={accent}
            />
          </div>
        </Card>
      )}

      {/* Videos by this creator */}
      <Card>
        <CardHeader
          title="Posts in this period"
          subtitle={
            detail.videos.length === 0
              ? 'No posts in this period'
              : `${detail.videos.length} post${detail.videos.length === 1 ? '' : 's'}`
          }
        />
        {detail.videos.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-muted-foreground">
            No posts from this creator in this period.
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            {detail.videos.map((v) => (
              <a
                key={v.videoId}
                // v.url is daily_video_product_stats.video_url — an expiring
                // signed CDN MEDIA link on 98% of rows. Prefer the permanent
                // derived permalink over it (mig 119 / resolveWatchUrl).
                href={resolveWatchUrl(v.url, detail.primaryHandle, v.videoId) ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate" title={v.title}>
                    {v.title}
                  </p>
                  {v.postDate && (
                    <p className="text-xs text-muted-foreground mt-0.5">{fmtDate(v.postDate)}</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold tabular-nums" style={{ color: readableOn(accent) }}>
                    {fmtCurrency(v.gmv)}
                  </p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {fmtNumber(v.orders)} orders
                  </p>
                </div>
                <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
              </a>
            ))}
          </div>
        )}
      </Card>

      {/* Contract details */}
      {(detail.retainer > 0 ||
        detail.monthlyPostRequirement != null ||
        detail.handles.length > 1) && (
        <Card>
          <CardHeader title="Contract details" />
          <dl className="divide-y divide-border/40">
            {detail.retainer > 0 && (
              <div className="flex items-center justify-between px-4 py-3">
                <dt className="text-xs text-muted-foreground">Monthly retainer</dt>
                <dd className="text-sm font-medium text-foreground tabular-nums">
                  {fmtCurrency(detail.retainer)}
                </dd>
              </div>
            )}
            {detail.monthlyPostRequirement != null && (
              <div className="flex items-center justify-between px-4 py-3">
                <dt className="text-xs text-muted-foreground">Posts per month required</dt>
                <dd className="text-sm font-medium text-foreground tabular-nums">
                  {detail.monthlyPostRequirement}
                </dd>
              </div>
            )}
            {detail.handles.length > 1 && (
              <div className="flex items-start justify-between px-4 py-3 gap-3">
                <dt className="text-xs text-muted-foreground">All TikTok accounts</dt>
                <dd className="text-sm font-medium text-foreground text-right">
                  {detail.handles.map((h) => `@${h}`).join(', ')}
                </dd>
              </div>
            )}
          </dl>
        </Card>
      )}
    </div>
  );
}

// ── Subcomponents ──

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      {children}
    </div>
  );
}

function CardHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="px-4 pt-4 pb-3 border-b border-border/50">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
    </div>
  );
}

function CreatorStat({
  label,
  value,
  changePct,
  accent,
  primary = false,
}: {
  label: string;
  value: string;
  changePct?: number | null;
  accent: string;
  primary?: boolean;
}) {
  return (
    <div className="px-5 py-4 sm:border-r border-border last:border-r-0">
      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
        {label}
      </p>
      <p
        className={`mt-1 font-bold text-foreground tabular-nums ${primary ? 'text-2xl sm:text-3xl' : 'text-xl'}`}
        style={primary ? { color: readableOn(accent) } : undefined}
      >
        {value}
      </p>
      {changePct !== undefined ? <ChangeBadge changePct={changePct} /> : null}
    </div>
  );
}

function ChangeBadge({ changePct }: { changePct: number | null | undefined }) {
  if (changePct == null) {
    return <p className="text-xs text-muted-foreground mt-1">vs prior period</p>;
  }
  if (changePct === 0) {
    return <p className="text-xs text-muted-foreground mt-1">Flat vs prior</p>;
  }
  const positive = changePct > 0;
  const Icon = positive ? TrendingUp : TrendingDown;
  return (
    <p
      className={`text-xs mt-1 flex items-center gap-1 ${
        positive ? 'text-emerald-600' : 'text-rose-600'
      }`}
    >
      <Icon className="h-3 w-3" />
      {positive ? '+' : ''}
      {changePct.toFixed(1)}%
    </p>
  );
}

// ── Formatters ──

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
