export const dynamic = 'force-dynamic';

import { Suspense } from 'react';
import { getBrandRegistry, expandSlugs, brandLabel } from '@/lib/data/brand-registry';
import { createClient } from '@/lib/supabase/server';
import { getActiveTenantId } from '@/lib/auth/platform-admin';
import { resolveDateRange } from '@/lib/data/date-utils';
import { getAffiliateLeaderboard } from '@/lib/data/affiliate-leaderboard';
import { DateRangePicker } from '@/components/dashboard/date-range-picker';
import { AffiliateLeaderboard } from '@/components/affiliates/affiliate-leaderboard';
import { formatCurrency } from '@/lib/utils/format';

interface Props {
  searchParams: Promise<{ range?: string; brand?: string; start?: string; end?: string }>;
}

export const metadata = { title: 'Top Affiliates — Tempo' };

export default async function AffiliatesPage({ searchParams }: Props) {
  const params = await searchParams;
  const { startDate, endDate } = resolveDateRange(params.range, params.start, params.end);

  // Brand/workspace scope — mirrors the dashboard/retention pages (owner → all,
  // manager → their brands, ?brand= drill-in).
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

  const result = await getAffiliateLeaderboard(activeBrands, startDate, endDate, 100);

  // Umbrella brand name → color, for the breakdown pills / overlap dots.
  const brandColors: Record<string, string> = {};
  for (const r of reg.rows) if (r.name && r.color) brandColors[r.name] = r.color;

  const scopeLabel = brandFilter ? brandLabel(reg, brandFilter) : 'all brands';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--foreground)]">Top Affiliates</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Highest-grossing creators across {scopeLabel} — and how many of your brands each one spans.
          </p>
          {result.hasData && (
            <p className="text-xs text-muted-foreground mt-1 tabular-nums">
              Top {result.rows.length} · {formatCurrency(result.totalGmv)} agency GMV shown
            </p>
          )}
        </div>
        <Suspense fallback={null}>
          <DateRangePicker />
        </Suspense>
      </div>

      <AffiliateLeaderboard rows={result.rows} brandColors={brandColors} />
    </div>
  );
}
