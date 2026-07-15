import { TrendingUp } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/format';

interface Props {
  /** Day of the period currently elapsed (e.g. 7 if it's the 7th of the month) */
  daysElapsed: number;
  /** Total days in the natural period (e.g. 31 for May) */
  periodLength: number;
  /** GMV accumulated so far in the period */
  gmvToDate: number;
  /** Display label for the period — e.g. "May 2026" */
  periodLabel: string;
}

/** Linear-projection pacing tile shown when the user is looking at an
 * in-progress period (today the only such preset is "This Month").
 * Projection = run-rate × period length. Deliberately simple — agency
 * exec wants the headline answer "are we going to hit ~$X this month?". */
export function PacingTile({ daysElapsed, periodLength, gmvToDate, periodLabel }: Props) {
  const runRate = daysElapsed > 0 ? gmvToDate / daysElapsed : 0;
  const projected = runRate * periodLength;
  const daysRemaining = Math.max(0, periodLength - daysElapsed);

  return (
    <div className="rounded-xl bg-pulse-hero shadow-pulse-primary p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-white">
      <div className="flex items-start gap-3 min-w-0">
        <div className="h-9 w-9 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
          <TrendingUp className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-white/60 font-semibold">
            Pacing — {periodLabel}
          </p>
          <p className="text-2xl font-extrabold font-mono tabular-nums mt-0.5">
            {formatCurrency(projected)} projected
          </p>
          <p className="text-[11px] font-mono tabular-nums text-white/70 mt-0.5">
            {formatCurrency(runRate)}/day average · <span className="font-bold">{daysElapsed}</span> of{' '}
            <span className="font-bold">{periodLength}</span> {periodLength === 1 ? 'day' : 'days'} elapsed ·{' '}
            <span className="font-bold">{daysRemaining}</span> to go
          </p>
        </div>
      </div>
      <div className="flex flex-col sm:items-end gap-0.5 flex-shrink-0">
        <p className="text-[10px] uppercase tracking-wider text-white/60 font-semibold">Booked so far</p>
        <p className="text-lg font-bold font-mono tabular-nums">{formatCurrency(gmvToDate)}</p>
      </div>
    </div>
  );
}
