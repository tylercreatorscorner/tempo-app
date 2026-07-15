'use client';

import { Gauge } from '@/components/charts/gauge';
import { fmtCompactCurrency } from '@/components/charts/format';

interface Props {
  /** Current GMV achieved this month */
  current: number;
  /** Target GMV for this month */
  goal: number;
  height?: number;
  label?: string;
}

export function GoalGauge({ current, goal, height = 280, label = 'Monthly GMV Goal' }: Props) {
  const pct = goal > 0 ? Math.min(100, (current / goal) * 100) : 0;
  const reached = goal > 0 && current >= goal;

  return (
    <div className="flex flex-col items-center">
      <Gauge
        fraction={pct / 100}
        size={height}
        color={reached ? 'var(--pulse-pos)' : 'var(--primary)'}
        label={`${Math.round(pct)}%`}
        sublabel={label}
      />
      <div className="text-center -mt-2">
        <p className="text-sm font-semibold text-muted-foreground">{fmtCompactCurrency(current)} <span className="text-muted-foreground font-normal">of {fmtCompactCurrency(goal)}</span></p>
        {goal > 0 && !reached && (
          <p className="text-xs text-muted-foreground mt-0.5">{fmtCompactCurrency(Math.max(0, goal - current))} to go</p>
        )}
        {reached && (
          <p className="text-xs font-semibold text-[var(--pulse-pos)] mt-0.5">🎯 Goal reached!</p>
        )}
      </div>
    </div>
  );
}
