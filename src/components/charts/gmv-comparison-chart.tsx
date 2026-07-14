'use client';

import dynamic from 'next/dynamic';
import type { ApexOptions } from 'apexcharts';

const ApexChart = dynamic(() => import('react-apexcharts'), { ssr: false });

interface CurrentPoint {
  date: string;
  gmv: number;
}

/**
 * Drop statistical outliers from a series (replace with null so the line
 * gaps over them) — used to handle backfill / cumulative-import artifacts
 * in `daily_creator_stats` that show up as multi-day $200k+ spikes against
 * an otherwise-$20-50k baseline. Cap = median × 5 of the combined window.
 */
function filterOutliers(
  current: number[],
  prior: (number | null)[],
): { cleanedCurrent: (number | null)[]; cleanedPrior: (number | null)[]; capped: boolean } {
  const allValues = [
    ...current.filter((v) => v > 0),
    ...prior.filter((v): v is number => v != null && v > 0),
  ].sort((a, b) => a - b);
  if (allValues.length < 4) {
    return { cleanedCurrent: current, cleanedPrior: prior, capped: false };
  }
  const median = allValues[Math.floor(allValues.length / 2)];
  const cap = median * 5;
  let capped = false;
  const cleanedCurrent = current.map((v) => {
    if (v > cap) {
      capped = true;
      return null;
    }
    return v;
  });
  const cleanedPrior = prior.map((v) => {
    if (v != null && v > cap) {
      capped = true;
      return null;
    }
    return v;
  });
  return { cleanedCurrent, cleanedPrior, capped };
}

interface PriorPoint {
  priorDate: string;
  gmv: number | null;
}

interface Props {
  current: CurrentPoint[];
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
  color = 'var(--primary)',
  height = 320,
}: Props) {
  if (!current || current.length === 0) return null;

  const categories = current.map((d) => fmtShortDate(d.date));
  const rawCurrent = current.map((d) => parseFloat(d.gmv.toFixed(2)));

  const priorAligned = (prior ?? []).slice(0, current.length);
  const hasPrior =
    priorAligned.length > 0 && priorAligned.some((p) => p.gmv != null && p.gmv > 0);
  const rawPrior = hasPrior
    ? priorAligned.map((p) => (p.gmv == null ? null : parseFloat(p.gmv.toFixed(2))))
    : [];
  const priorDates = priorAligned.map((p) => p.priorDate);
  const currentDates = current.map((d) => d.date);

  // Strip cumulative-import / backfill spikes so they don't dominate the y-axis.
  const { cleanedCurrent: currentValues, cleanedPrior: priorValues, capped } =
    filterOutliers(rawCurrent, rawPrior);

  // Two clean line series — no mixed types, no fill.opacity arrays. The
  // earlier mixed area+line config caused the lines to vanish on render.
  const series: { name: string; data: (number | null)[] }[] = hasPrior
    ? [
        { name: 'Prior period', data: priorValues },
        { name: 'Current period', data: currentValues },
      ]
    : [{ name: 'Current period', data: currentValues }];

  const options: ApexOptions = {
    chart: {
      type: 'line',
      toolbar: { show: false },
      zoom: { enabled: false },
      animations: { enabled: false },
      fontFamily: 'inherit',
      background: 'transparent',
    },
    colors: hasPrior ? ['#9CA3AF', color] : [color],
    stroke: {
      curve: 'smooth',
      width: hasPrior ? [2, 3] : 3,
      dashArray: hasPrior ? [6, 0] : 0,
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
      custom: ({ dataPointIndex }: { dataPointIndex: number }) => {
        const curIso = currentDates[dataPointIndex];
        const priorIso = priorDates[dataPointIndex];
        const curVal = currentValues[dataPointIndex];
        const priorVal = priorValues[dataPointIndex];
        const fmtMoney = (v: number) =>
          `$${v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
        const fmtCell = (v: number | null) =>
          v == null
            ? '<span style="color:#D1D5DB">no data</span>'
            : fmtMoney(v);
        const rows: string[] = [];
        if (priorIso && hasPrior) {
          rows.push(`
            <div style="display:flex;align-items:center;gap:8px;padding:6px 12px">
              <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#9CA3AF"></span>
              <span style="color:#6B7280;font-size:11px">${fmtLongDate(priorIso)}</span>
              <span style="margin-left:auto;font-weight:600;color:#1A1B3A">${fmtCell(priorVal)}</span>
            </div>`);
        }
        rows.push(`
          <div style="display:flex;align-items:center;gap:8px;padding:6px 12px">
            <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color}"></span>
            <span style="color:#1A1B3A;font-size:11px;font-weight:500">${fmtLongDate(curIso)}</span>
            <span style="margin-left:auto;font-weight:600;color:${color}">${fmtCell(curVal)}</span>
          </div>`);
        return `<div style="background:white;border:1px solid #F3F4F6;border-radius:10px;box-shadow:0 8px 16px -4px rgba(0,0,0,0.08);min-width:240px;padding:4px 0">${rows.join('')}</div>`;
      },
    },
  };

  return (
    <>
      <ApexChart series={series as any} options={options} height={height} width="100%" />
      {capped && (
        <p className="text-[11px] text-gray-400 px-3 pt-1 pb-2">
          One or more days were excluded from the chart as data anomalies
          (likely backfill spikes). Raw numbers are unchanged in the totals
          and CSV exports.
        </p>
      )}
    </>
  );
}
