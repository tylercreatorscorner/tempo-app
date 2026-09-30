/** Date math for a frozen agency report. All dates are calendar dates in UTC. */
export function agencyPeriod(start: string, end: string, kind: 'mtd' | 'complete-month' | 'weekly') {
  const s = new Date(`${start}T00:00:00Z`);
  const e = new Date(`${end}T00:00:00Z`);
  const days = Math.round((e.getTime() - s.getTime()) / 86_400_000) + 1;
  const priorMonthStart = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth() - 1, 1));
  const priorMonthLastDay = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), 0)).getUTCDate();
  const priorEnd = kind === 'mtd'
    ? new Date(Date.UTC(priorMonthStart.getUTCFullYear(), priorMonthStart.getUTCMonth(), Math.min(e.getUTCDate(), priorMonthLastDay)))
    : new Date(s.getTime() - 86_400_000);
  const priorStart = kind === 'mtd' ? priorMonthStart : new Date(priorEnd.getTime() - (days - 1) * 86_400_000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const label = (d: Date) => d.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const rangeLabel = (d: Date) => `${d.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' })} 1–${d.getUTCDate()}, ${d.getUTCFullYear()}`;
  const weekLabel = (a: Date, b: Date) => {
    const startLabel = a.toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' });
    const endLabel = a.getUTCMonth() === b.getUTCMonth() && a.getUTCFullYear() === b.getUTCFullYear()
      ? `${b.getUTCDate()}, ${b.getUTCFullYear()}`
      : b.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
    return `${startLabel}–${endLabel}`;
  };
  return {
    priorStart: iso(priorStart),
    priorEnd: iso(priorEnd),
    periodLabel: kind === 'mtd' ? `${rangeLabel(e)} · month to date` : kind === 'weekly' ? weekLabel(s, e) : label(e),
    priorLabel: kind === 'mtd' ? rangeLabel(priorEnd) : kind === 'weekly' ? weekLabel(priorStart, priorEnd) : label(priorEnd),
    shorterPrior: kind === 'mtd' && days !== priorEnd.getUTCDate(),
  };
}
