'use client';

import dynamic from 'next/dynamic';
import type { ApexOptions } from 'apexcharts';
import { formatCurrency } from '@/lib/utils/format';

const ApexChart = dynamic(() => import('react-apexcharts'), { ssr: false });

// Fixed hexes (ApexCharts is canvas — it can't read CSS vars) chosen to read on
// both the light and dark card grounds: managed = the Pulse blue, organic = a
// neutral gray-violet.
const MANAGED = '#5AA6FF';
const ORGANIC = '#8A8FB2';

/**
 * Managed vs Organic split of affiliate GMV. "Organic" = brand-wide affiliate
 * GMV not attributable to a managed creator (total − managed).
 */
export function ManagedOrganicDonut({ managed, organic }: { managed: number; organic: number }) {
  const total = managed + organic;
  const managedPct = total > 0 ? Math.round((managed / total) * 100) : 0;
  const organicPct = total > 0 ? 100 - managedPct : 0;

  const options: ApexOptions = {
    chart: { type: 'donut', sparkline: { enabled: true } },
    labels: ['Managed', 'Organic'],
    colors: [MANAGED, ORGANIC],
    stroke: { width: 0 },
    legend: { show: false },
    dataLabels: { enabled: false },
    tooltip: { y: { formatter: (v: number) => formatCurrency(v) } },
    plotOptions: { pie: { donut: { size: '72%' } } },
  };

  return (
    <div className="flex items-center gap-6">
      <div className="w-[140px] shrink-0">
        {total > 0 ? (
          <ApexChart options={options} series={[managed, organic]} type="donut" height={140} />
        ) : (
          <div className="grid h-[140px] place-items-center text-xs text-muted-foreground">No data</div>
        )}
      </div>
      <div className="min-w-0 space-y-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: MANAGED }} />
            <span className="text-2xl font-extrabold tracking-tight tabular-nums text-foreground">{managedPct}%</span>
          </div>
          <p className="mt-0.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
            Managed · <span className="font-mono tabular-nums normal-case">{formatCurrency(managed)}</span>
          </p>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: ORGANIC }} />
            <span className="text-2xl font-extrabold tracking-tight tabular-nums text-foreground">{organicPct}%</span>
          </div>
          <p className="mt-0.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
            Organic · <span className="font-mono tabular-nums normal-case">{formatCurrency(organic)}</span>
          </p>
        </div>
      </div>
    </div>
  );
}
