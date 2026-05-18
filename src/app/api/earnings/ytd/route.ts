/**
 * GET /api/earnings/ytd?year=YYYY
 *
 * Year-to-date earnings: returns per-month totals and per-brand
 * aggregates for the requested year. Defaults to current year.
 *
 * Built by calling getEarnings() for each month of the year in parallel —
 * returns months oldest-first up to and including the current month
 * (or all 12 if year is in the past).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { getEarnings, type EarningsResult } from '@/lib/data/earnings';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const scope = await getWorkspaceScope();
  if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const brandFilterSlugs = scope.brandScope.kind === 'scoped'
    ? scope.brandScope.brandSlugs
    : null;

  const url = req.nextUrl;
  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const currentMonthIdx = now.getUTCMonth(); // 0-based
  const yearParam = parseInt(url.searchParams.get('year') ?? String(currentYear), 10);
  const year = Number.isFinite(yearParam) ? yearParam : currentYear;

  // Sanity guard — only allow last 5 years through current year
  if (year < currentYear - 5 || year > currentYear) {
    return NextResponse.json({ error: 'Year out of range' }, { status: 400 });
  }

  // For current year: only fetch up to current month (inclusive).
  // For prior years: fetch all 12 months.
  const monthsToFetch = year === currentYear ? currentMonthIdx + 1 : 12;
  const monthList: string[] = [];
  for (let m = 1; m <= monthsToFetch; m++) {
    monthList.push(`${year}-${String(m).padStart(2, '0')}`);
  }

  const results = await Promise.all(monthList.map((m) => getEarnings(m, undefined, brandFilterSlugs)));

  // Per-month totals (compact form)
  const months = results.map((r: EarningsResult) => ({
    month: r.month,
    affiliateGmv: r.totals.affiliateGmv,
    marketingGmv: r.totals.marketingGmv,
    totalGmv: r.totals.totalGmv,
    commission: r.totals.commission,
    retainers: r.totals.retainers,
    launchFees: r.totals.launchFees,
    earnings: r.totals.earnings,
    monthlyGoal: r.totals.monthlyGoal,
  }));

  // Per-brand YTD aggregate
  interface BrandAgg {
    brand: string;
    brandLabel: string;
    affiliateGmv: number;
    marketingGmv: number;
    totalGmv: number;
    commission: number;
    retainer: number;
    productRetainer: number;
    launchFee: number;
    total: number;
  }
  const brandMap = new Map<string, BrandAgg>();
  for (const r of results) {
    for (const b of r.brands) {
      const existing = brandMap.get(b.brand);
      if (existing) {
        existing.affiliateGmv    += b.affiliateGmv;
        existing.marketingGmv    += b.marketingGmv;
        existing.totalGmv        += b.totalGmv;
        existing.commission      += b.commission;
        existing.retainer        += b.retainer;
        existing.productRetainer += b.productRetainer;
        existing.launchFee       += b.launchFee;
        existing.total           += b.total;
      } else {
        brandMap.set(b.brand, {
          brand: b.brand,
          brandLabel: b.brandLabel,
          affiliateGmv: b.affiliateGmv,
          marketingGmv: b.marketingGmv,
          totalGmv: b.totalGmv,
          commission: b.commission,
          retainer: b.retainer,
          productRetainer: b.productRetainer,
          launchFee: b.launchFee,
          total: b.total,
        });
      }
    }
  }
  const brands = Array.from(brandMap.values()).sort((a, b) => b.total - a.total);

  // Year totals
  const totals = months.reduce(
    (acc, m) => ({
      affiliateGmv: acc.affiliateGmv + m.affiliateGmv,
      marketingGmv: acc.marketingGmv + m.marketingGmv,
      totalGmv: acc.totalGmv + m.totalGmv,
      commission: acc.commission + m.commission,
      retainers: acc.retainers + m.retainers,
      launchFees: acc.launchFees + m.launchFees,
      earnings: acc.earnings + m.earnings,
      monthlyGoal: acc.monthlyGoal + m.monthlyGoal,
    }),
    { affiliateGmv: 0, marketingGmv: 0, totalGmv: 0, commission: 0, retainers: 0, launchFees: 0, earnings: 0, monthlyGoal: 0 },
  );

  return NextResponse.json({ year, months, brands, totals });
}
