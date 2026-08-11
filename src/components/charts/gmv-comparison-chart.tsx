'use client';

import dynamic from 'next/dynamic';
import { useTheme } from 'next-themes';
import { readableOn } from '@/lib/utils/brand-color';
import type { ApexOptions } from 'apexcharts';

const ApexChart = dynamic(() => import('react-apexcharts'), { ssr: false });

/**
 * One grey used to do two jobs and only cleared the bar for one of them.
 *
 * #8A8FB2 measures 3.16:1 on a light card: fine for the prior-period LINE and
 * the crosshair, which are graphics and need 3:1, and a fail for the legend,
 * axis and tooltip TEXT, which need 4.5:1. Measured on the live brand portal,
 * that is exactly where 'Prior period' and 'Current period' were sitting.
 *
 * So: keep the stroke, and take the text ink from the --muted-foreground pair
 * (5.14:1 light, 7.18:1 dark). ApexCharts wants literal colours, not var().
 */
const GRID_STROKE = '#8A8FB2';
const INK = { light: '#6D6A8B', dark: '#A0A4CC' };

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
  color = '#6D5EFC',
  height = 320,
}: Props) {
  // Before the early return — hooks cannot sit behind a conditional.
  const { resolvedTheme } = useTheme();
  const ink = resolvedTheme === 'dark' ? INK.dark : INK.light;
  // The tooltip body is hardcoded white in BOTH themes (see its markup), so
  // everything inside it measures against white and must use the light ink —
  // `ink` would be #A0A4CC at 2.42:1 there whenever the page is dark.
  const tipInk = INK.light;
  // ...and the value is painted in the brand's own colour, which fails AA on
  // white for 22 of the 29 brands in the roster.
  const tipAccent = readableOn(color);

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
    colors: hasPrior ? [GRID_STROKE, color] : [color],
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
          labels: { colors: ink },
          markers: { size: 6, strokeWidth: 0 } as any,
          itemMargin: { horizontal: 10 },
        }
      : { show: false },
    xaxis: {
      type: 'category',
      categories,
      labels: {
        style: { colors: ink, fontSize: '11px', fontFamily: 'inherit' },
        rotate: 0,
        hideOverlappingLabels: true,
      },
      axisBorder: { show: false },
      axisTicks: { show: false },
      crosshairs: { show: true, stroke: { color: GRID_STROKE, width: 1, dashArray: 4 } },
      tooltip: { enabled: false },
    },
    yaxis: {
      labels: {
        style: { colors: ink, fontSize: '11px', fontFamily: 'inherit' },
        formatter: fmtY,
      },
      forceNiceScale: true,
    },
    grid: {
      borderColor: 'var(--muted)',
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
            ? '<span style="color:${tipInk}">no data</span>'
            : fmtMoney(v);
        const rows: string[] = [];
        if (priorIso && hasPrior) {
          rows.push(`
            <div style="display:flex;align-items:center;gap:8px;padding:6px 12px">
              <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${GRID_STROKE}"></span>
              <span style="color:${tipInk};font-size:11px">${fmtLongDate(priorIso)}</span>
              <span style="margin-left:auto;font-weight:600;color:${tipInk}">${fmtCell(priorVal)}</span>
            </div>`);
        }
        rows.push(`
          <div style="display:flex;align-items:center;gap:8px;padding:6px 12px">
            <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color}"></span>
            <span style="color:${tipInk};font-size:11px;font-weight:500">${fmtLongDate(curIso)}</span>
            <span style="margin-left:auto;font-weight:600;color:${tipAccent}">${fmtCell(curVal)}</span>
          </div>`);
        return `<div style="background:white;border:1px solid var(--muted);border-radius:10px;box-shadow:0 8px 16px -4px rgba(0,0,0,0.08);min-width:240px;padding:4px 0">${rows.join('')}</div>`;
      },
    },
  };

  return (
    <>
      <ApexChart series={series as any} options={options} height={height} width="100%" />
      {capped && (
        <p className="text-[11px] text-muted-foreground px-3 pt-1 pb-2">
          One or more days were excluded from the chart as data anomalies
          (likely backfill spikes). Raw numbers are unchanged in the totals
          and CSV exports.
        </p>
      )}
    </>
  );
}
