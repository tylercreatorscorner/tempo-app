export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { Activity, TrendingDown, ArrowRight } from 'lucide-react';

import { getBrandRegistry, expandSlugs, brandLabel } from '@/lib/data/brand-registry';
import { createClient } from '@/lib/supabase/server';
import { getActiveTenantId } from '@/lib/auth/platform-admin';
import { getCohortRetention } from '@/lib/data/cohort-retention';
import { StatCard } from '@/components/dashboard/stat-card';
import { CohortHeatmap } from '@/components/retention/cohort-heatmap';
import { PageHeader } from '@/components/ui/page-header';

interface Props {
  searchParams: Promise<{ brand?: string }>;
}

export default async function RetentionPage({ searchParams }: Props) {
  const params = await searchParams;

  // ── Brand/workspace scope — mirrors the dashboard so the ?brand= filter and
  //    manager scoping behave identically (managers see only their brands). ────
  const supabase = await createClient();
  const reg = await getBrandRegistry();
  const activeTenantId = await getActiveTenantId();
  const { getAllowedBrandsForUser } = await import('@/lib/data/brands');
  const allowedBrands = await getAllowedBrandsForUser();

  let brandsQuery = supabase.from('brands_v2').select('slug').eq('is_archived', false).order('name');
  if (activeTenantId) brandsQuery = brandsQuery.eq('tenant_id', activeTenantId);
  if (allowedBrands) brandsQuery = brandsQuery.in('slug', allowedBrands);
  const { data: dbBrands } = await brandsQuery;
  const hiddenSlugs = new Set(reg.rows.filter((r) => r.parent_brand_id != null).map((r) => r.slug));
  const ALL_BRANDS = (dbBrands ?? []).map((b) => b.slug).filter((s) => !hiddenSlugs.has(s));

  const brandFilter = params.brand && ALL_BRANDS.includes(params.brand) ? params.brand : null;
  const activeRosterBrands = brandFilter ? [brandFilter] : ALL_BRANDS;
  const activeBrands = activeRosterBrands.flatMap((b) => expandSlugs(reg, b)); // data-store slugs

  const result = await getCohortRetention(activeBrands);
  const ins = result.insights;

  const activeBrandName = brandFilter ? brandLabel(reg, brandFilter) : null;
  const scopeLabel = activeBrandName ?? 'All brands';
  const reengageHref = brandFilter ? `/segments?brand=${brandFilter}` : '/segments';

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Creators"
        title="Retention"
        subtitle={
          <>
            <p>Creator cohort retention · <span className="font-medium text-foreground">{scopeLabel}</span></p>
            {result.hasData && result.frontierLabel && (
              <p className="mt-0.5 text-xs tabular-nums">
                {ins.cohortCount} cohorts · {ins.totalCreators.toLocaleString()} creators · complete months through {result.frontierLabel}
              </p>
            )}
          </>
        }
      />

      {!result.hasData ? (
        <div className="rounded-2xl border border-border bg-card shadow-sm">
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <Activity className="h-8 w-8 text-muted-foreground mb-3" />
            <h3 className="text-lg font-bold text-[var(--foreground)]">Not enough posting history yet</h3>
            <p className="text-sm text-muted-foreground mt-2 max-w-sm">
              {activeBrandName
                ? `Once ${activeBrandName}'s managed creators have posted across a few months, their retention cohorts will appear here.`
                : 'Once your managed creators have posted across a few months, their retention cohorts will appear here.'}
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Insight cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stagger-children">
            <StatCard
              label="Drop-off by month 1"
              value={ins.avgM1DropoffPct != null ? `${ins.avgM1DropoffPct.toFixed(0)}%` : '—'}
              subValue="leave after their first month"
              accentColor="#F59E0B"
            />
            <StatCard
              label="Best cohort"
              value={ins.best?.label ?? '—'}
              subValue={ins.best ? `${ins.best.pct.toFixed(0)}% still active at M1` : undefined}
              accentColor="#059669"
            />
            <StatCard
              label="Weakest cohort"
              value={ins.weakest?.label ?? '—'}
              subValue={ins.weakest ? `${ins.weakest.pct.toFixed(0)}% active at M1` : undefined}
              accentColor="#EF4444"
            />
            <StatCard
              label="Month-1 retention"
              value={ins.recentM1Pct != null ? `${ins.recentM1Pct.toFixed(0)}%` : '—'}
              trend={ins.trendPp ?? undefined}
              trendLabel="recent vs older cohorts"
              accentColor="var(--pulse-accent-2)"
            />
          </div>

          {/* Cohort heatmap */}
          <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-extrabold tracking-tight text-[var(--foreground)]">Cohort retention</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Share of each cohort still posting, by months since their first managed post
                </p>
              </div>
              <span className="h-8 w-8 rounded-lg bg-[var(--primary)]/10 text-[var(--primary)] flex items-center justify-center shrink-0">
                <Activity className="h-4 w-4" />
              </span>
            </div>
            <CohortHeatmap rows={result.rows} maxMonthIndex={result.maxMonthIndex} />
            <div className="px-5 py-3 border-t border-border">
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                A cohort is the month of a creator&apos;s first managed post; each cell is the share of that cohort that posted
                at least one video in month N. The earliest cohort{result.rows[0] ? ` (${result.rows[0].label})` : ''} includes
                creators already active when tracking began, so its curve reads high. The current in-progress month is excluded.
              </p>
            </div>
          </div>

          {/* Re-engage hook → the "Going silent" segment */}
          <div className="rounded-2xl border border-border bg-card shadow-sm p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-start gap-3">
              <span className="h-9 w-9 rounded-lg bg-[var(--primary)]/10 text-[var(--primary)] flex items-center justify-center shrink-0">
                <TrendingDown className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-bold text-[var(--foreground)]">Creators drift off over time</p>
                <p className="text-xs text-muted-foreground mt-0.5 max-w-md">
                  Catch the ones who&apos;ve gone quiet before they churn — the Going silent segment lists every managed creator
                  with no post in 14+ days.
                </p>
              </div>
            </div>
            <Link
              href={reengageHref}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--primary)] text-white text-sm font-semibold hover:brightness-[1.07] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]/40 focus-visible:ring-offset-1 shrink-0"
            >
              Re-engage silent creators <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
