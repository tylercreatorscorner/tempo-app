'use client';

import dynamic from 'next/dynamic';
import type { ApexOptions } from 'apexcharts';

const ApexChart = dynamic(() => import('react-apexcharts'), { ssr: false });

interface CurrentPoint {
  /** ISO date string (YYYY-MM-DD) for the current period day. */
  date: string;
  gmv: number;
}

interface PriorPoint {
  /** ISO date string (YYYY-MM-DD) for the matching prior period day. */
  priorDate: string;
  /** GMV; null if there's no data for that prior day (renders as a gap). */
  gmv: number | null;
}

interface Props {
  /** Current-period series, ordered by day. */
  current: CurrentPoint[];
  /** Prior-period series, parallel-indexed to `current`. */
  prior?: PriorPoint[];
  color?: string;
  height?: number;
}

function fmtY(val: number) {
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1000) return `$${(val / 1000).toFixed(0)}k`;
  return `$${val.toFixed(0)}`;
}

function fmtShortDate(iso: string) {
  const [, m, d] = iso.split('-');
  return `${parseInt(m, 10)}/${parseInt(d, 10)}`;
}

function fmtLongDate(iso: string) {
  const [y, m, d] = iso.split('-');
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function GmvComparisonChart({
  current,
  prior,
  color = '#FF4D8D',
  height = 320,
}: Props) {
  if (!current || current.length === 0) return null;

  const categories = current.map((d) => fmtShortDate(d.date));
  const currentValues = current.map((d) => parseFloat(d.gmv.toFixed(2)));

  // Prior series — only show if any non-null value exists
  const priorAligned = (prior ?? []).slice(0, current.length);
  const hasPrior =
    priorAligned.length > 0 && priorAligned.some((p) => p.gmv != null && p.gmv > 0);
  const priorValues = priorAligned.map((p) => (p.gmv == null ? null : parseFloat(p.gmv.toFixed(2))));
  const priorDates = priorAligned.map((p) => p.priorDate);
  const currentDates = current.map((d) => d.date);

  const series = hasPrior
    ? [
        { name: 'Prior period', data: priorValues as (number | null)[] },
        { name: 'Current period', data: currentValues },
      ]
    : [{ name: 'Current period', data: currentValues }];

  const options: ApexOptions = {
    chart: {
      type: 'area',
      toolbar: { show: false },
      zoom: { enabled: false },
      animations: {
        enabled: true,
        speed: 700,
        animateGradually: { enabled: true, delay: 100 },
      },
      fontFamily: 'inherit',
      background: 'transparent',
    },
    colors: hasPrior ? ['#9CA3AF', color] : [color],
    stroke: hasPrior
      ? {
          curve: 'smooth',
          width: [2, 2.5],
          dashArray: [6, 0],
        }
      : { curve: 'smooth', width: 2.5 },
    fill: {
      type: 'gradient',
      gradient: {
        shadeIntensity: 1,
        type: 'vertical',
        opacityFrom: 0.28,
        opacityTo: 0.02,
      },
      // Hide prior's area fill — it's a reference line only
      opacity: hasPrior ? [0, 1] : [1],
    },
    dataLabels: { enabled: false },
    markers: { size: 0, hover: { size: 5, sizeOffset: 1 } },
    legend: hasPrior
      ? {
          show: true,
          position: 'top',
          horizontalAlign: 'right',
          fontSize: '11px',
          fontFamily: 'inherit',
          labels: { colors: '#6B7280' },
          markers: { size: 6, strokeWidth: 0 } as any,
          itemMargin: { horizontal: 10 },
        }
      : { show: false },
    xaxis: {
      type: 'category',
      categories,
      labels: {
        style: { colors: '#9CA3AF', fontSize: '11px', fontFamily: 'inherit' },
        rotate: 0,
        hideOverlappingLabels: true,
      },
      axisBorder: { show: false },
      axisTicks: { show: false },
      crosshairs: { show: true, stroke: { color: '#E5E7EB', width: 1, dashArray: 4 } },
      tooltip: { enabled: false },
    },
    yaxis: {
      labels: {
        style: { colors: '#9CA3AF', fontSize: '11px', fontFamily: 'inherit' },
        formatter: fmtY,
      },
      forceNiceScale: true,
    },
    grid: {
      borderColor: '#F3F4F6',
      strokeDashArray: 4,
      xaxis: { lines: { show: false } },
      yaxis: { lines: { show: true } },
      padding: { top: 0, right: 8, bottom: 0, left: 0 },
    },
    tooltip: {
      shared: true,
      theme: 'light',
      style: { fontSize: '12px', fontFamily: 'inherit' },
      // Custom tooltip — show real dates for both series so the user knows
      // which prior date is being compared to which current date.
      custom: ({ dataPointIndex }: { dataPointIndex: number }) => {
        const curIso = currentDates[dataPointIndex];
        const priorIso = priorDates[dataPointIndex];
        const curVal = currentValues[dataPointIndex];
        const priorVal = priorValues[dataPointIndex];
        const fmtMoney = (v: number) =>
          `$${v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
        const rows: string[] = [];
        if (priorIso) {
          rows.push(`
            <div class="flex items-center gap-2 px-3 py-1.5">
              <span class="inline-block w-2 h-2 rounded-full" style="background:#9CA3AF"></span>
              <span style="color:#6B7280;font-size:11px">${fmtLongDate(priorIso)}</span>
              <span style="margin-left:auto;font-weight:600;color:#1A1B3A">${
                priorVal == null ? '<span style="color:#D1D5DB">no data</span>' : fmtMoney(priorVal)
              }</span>
            </div>`);
        }
        rows.push(`
          <div class="flex items-center gap-2 px-3 py-1.5">
            <span class="inline-block w-2 h-2 rounded-full" style="background:${color}"></span>
            <span style="color:#1A1B3A;font-size:11px;font-weight:500">${fmtLongDate(curIso)}</span>
            <span style="margin-left:auto;font-weight:600;color:${color}">${fmtMoney(curVal)}</span>
          </div>`);
        return `<div style="background:white;border:1px solid #F3F4F6;border-radius:10px;box-shadow:0 8px 16px -4px rgba(0,0,0,0.08);min-width:220px;padding:4px 0">${rows.join('')}</div>`;
      },
    },
  };

  return (
    <ApexChart series={series as any} options={options} height={height} width="100%" />
  );
}
