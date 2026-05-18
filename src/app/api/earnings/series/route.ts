import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { getEarnings, type EarningsResult } from '@/lib/data/earnings';
import { currentMonth } from '@/lib/utils/format';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * GET /api/earnings/series?endMonth=YYYY-MM&months=12
 *
 * Returns a chronological array of monthly earnings totals (oldest first).
 * Used by the trend chart on the earnings page.
 *
 * Defaults to the last 12 months ending at the current month.
 */
export async function GET(req: NextRequest) {
  const scope = await getWorkspaceScope();
  if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const brandFilterSlugs = scope.brandScope.kind === 'scoped'
    ? scope.brandScope.brandSlugs
    : null;

  const url = req.nextUrl;
  const monthsParam = parseInt(url.searchParams.get('months') ?? '12', 10);
  const months = Number.isFinite(monthsParam) ? Math.max(1, Math.min(24, monthsParam)) : 12;
  const endMonth = url.searchParams.get('endMonth') ?? currentMonth();

  if (!/^\d{4}-\d{2}$/.test(endMonth)) {
    return NextResponse.json({ error: `Invalid endMonth "${endMonth}"` }, { status: 400 });
  }

  const monthList = buildMonthList(endMonth, months);
  const results = await Promise.all(monthList.map((m) => getEarnings(m, undefined, brandFilterSlugs)));

  const series = results.map((r: EarningsResult) => ({
    month: r.month,
    totalGmv: r.totals.totalGmv,
    commission: r.totals.commission,
    retainers: r.totals.retainers,
    launchFees: r.totals.launchFees,
    earnings: r.totals.earnings,
    monthlyGoal: r.totals.monthlyGoal,
  }));

  return NextResponse.json({ series });
}

function buildMonthList(endMonth: string, count: number): string[] {
  const [y, m] = endMonth.split('-').map(Number);
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}
