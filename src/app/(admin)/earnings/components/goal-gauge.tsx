'use client';

import dynamic from 'next/dynamic';
import type { ApexOptions } from 'apexcharts';

const ApexChart = dynamic(() => import('react-apexcharts'), { ssr: false });

interface Props {
  /** Current GMV achieved this month */
  current: number;
  /** Target GMV for this month */
  goal: number;
  height?: number;
  label?: string;
}

function fmtCompact(val: number) {
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`;
  if (val >= 1000) return `$${(val / 1000).toFixed(0)}k`;
  return `$${Math.round(val)}`;
}

export function GoalGauge({ current, goal, height = 280, label = 'Monthly GMV Goal' }: Props) {
  const pct = goal > 0 ? Math.min(100, (current / goal) * 100) : 0;
  const reached = goal > 0 && current >= goal;
  const trackColor = reached ? '#10B981' : 'var(--primary)';

  const options: ApexOptions = {
    chart: { type: 'radialBar', toolbar: { show: false }, fontFamily: 'inherit', background: 'transparent', sparkline: { enabled: true } },
    plotOptions: {
      radialBar: {
        startAngle: -135,
        endAngle: 135,
        hollow: { size: '64%' },
        track: { background: 'var(--muted)', strokeWidth: '100%', margin: 0 },
        dataLabels: {
          name: { offsetY: -10, color: 'var(--muted-foreground)', fontSize: '12px', fontWeight: 600 },
          value: {
            color: 'var(--foreground)',
            fontSize: '28px',
            fontWeight: 800,
            offsetY: 4,
            formatter: () => `${Math.round(pct)}%`,
          },
        },
      },
    },
    fill: {
      type: 'gradient',
      gradient: {
        shade: 'light',
        type: 'horizontal',
        shadeIntensity: 0.4,
        gradientToColors: [reached ? '#34D399' : '#FF8FB6'],
        stops: [0, 100],
      },
    },
    stroke: { lineCap: 'round' },
    colors: [trackColor],
    labels: [label],
  };

  return (
    <div className="flex flex-col items-center">
      <ApexChart type="radialBar" series={[pct]} options={options} height={height} width="100%" />
      <div className="text-center -mt-2">
        <p className="text-sm font-semibold text-[var(--foreground)]">{fmtCompact(current)} <span className="text-muted-foreground font-normal">of {fmtCompact(goal)}</span></p>
        {goal > 0 && !reached && (
          <p className="text-xs text-muted-foreground mt-0.5">{fmtCompact(Math.max(0, goal - current))} to go</p>
        )}
        {reached && (
          <p className="text-xs font-semibold text-emerald-600 mt-0.5">🎯 Goal reached!</p>
        )}
      </div>
    </div>
  );
}
