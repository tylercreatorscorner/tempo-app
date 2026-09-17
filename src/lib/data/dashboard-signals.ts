export interface SignalBrand {
  slug: string;
  currentGmv: number;
  prevGmv: number;
  recordedDays: number;
  previousRecordedDays: number;
}

export interface DashboardSignal {
  slug: string;
  kind: 'decline' | 'growth' | 'new-activity' | 'coverage';
  current: number;
  previous: number;
  delta: number;
  percent: number | null;
  noData?: boolean;
}

/** Evidence to investigate, not a health score or a profitability prediction.
 * Missing recorded days suppress movement claims; a missing import is not $0.
 * Inputs must already be restricted to the viewer's authorized brand scope.
 */
export function buildDashboardSignals(brands: SignalBrand[], days: number, available: boolean) {
  const attention: DashboardSignal[] = [];
  const opportunities: DashboardSignal[] = [];
  if (!available || days < 1) return { attention, opportunities, available: false };
  for (const brand of brands) {
    const { currentGmv: current, prevGmv: previous } = brand;
    if (![current, previous].every(Number.isFinite) || current < 0 || previous < 0) continue;
    const delta = current - previous;
    const percent = previous > 0 ? delta / previous * 100 : null;
    const base = { slug: brand.slug, current, previous, delta, percent };
    if (brand.recordedDays < days || brand.previousRecordedDays < days) {
      attention.push({ ...base, kind: 'coverage', percent: null, noData: brand.recordedDays === 0 && brand.previousRecordedDays === 0 });
    } else if (delta <= -100 && percent !== null && percent <= -10) {
      attention.push({ ...base, kind: 'decline' });
    } else if (delta >= 100 && (previous === 0 || (percent !== null && percent >= 10))) {
      opportunities.push({ ...base, kind: previous === 0 ? 'new-activity' : 'growth' });
    }
  }
  attention.sort((a, b) => Number(a.kind === 'coverage') - Number(b.kind === 'coverage') || Math.abs(b.delta) - Math.abs(a.delta));
  opportunities.sort((a, b) => b.delta - a.delta);
  return { attention, opportunities, available: true };
}
