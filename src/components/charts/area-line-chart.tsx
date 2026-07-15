'use client';

import { useState, type MouseEvent } from 'react';
import { seriesColor, fmtCompactCurrency } from './format';

export interface ChartSeries {
  name: string;
  /** Values aligned 1:1 with `labels`. */
  data: number[];
  /** Override color (e.g. a brand color); otherwise a categorical slot. */
  color?: string;
  /** Dashed line — for prior-period / comparison overlays. */
  dashed?: boolean;
}

interface Props {
  labels: string[];
  series: ChartSeries[];
  /** Fill under the line. Defaults on for a single series, off for multi. */
  area?: boolean;
  stacked?: boolean;
  height?: number;
  /** Formats values in the tooltip + y-axis. Defaults to compact currency. */
  format?: (v: number) => string;
  /** Show a light y-axis (a few gridlines + labels). Off by default (clean). */
  showAxis?: boolean;
  className?: string;
}

const VBW = 640;
const VBH = 200;
const PAD_T = 10;
const PAD_B = 8;

export function AreaLineChart({ labels, series, area, stacked, height = 220, format, showAxis, className }: Props) {
  const [hi, setHi] = useState<number | null>(null);
  const fmt = format ?? fmtCompactCurrency;
  const n = labels.length;
  const single = series.length === 1;
  const fill = area ?? single;

  if (n < 2 || series.length === 0) {
    return (
      <div className={className} style={{ height }}>
        <div className="grid h-full place-items-center text-sm text-muted-foreground">Not enough data for a trend</div>
      </div>
    );
  }

  // Stacked cumulative baselines (bottom of each series band).
  const baselines: number[][] = [];
  if (stacked) {
    const running = new Array(n).fill(0);
    for (const s of series) {
      baselines.push([...running]);
      for (let i = 0; i < n; i++) running[i] += s.data[i] ?? 0;
    }
  }
  const stackedTop = (si: number, i: number) => (baselines[si][i] ?? 0) + (series[si].data[i] ?? 0);

  let max = 0;
  let min = 0;
  if (stacked) {
    for (let i = 0; i < n; i++) max = Math.max(max, stackedTop(series.length - 1, i));
  } else {
    for (const s of series) for (const v of s.data) { max = Math.max(max, v); min = Math.min(min, v); }
  }
  const range = max - min || 1;
  const xOf = (i: number) => (i / (n - 1)) * VBW;
  const yOf = (v: number) => VBH - PAD_B - ((v - min) / range) * (VBH - PAD_T - PAD_B);
  const xPct = (i: number) => (i / (n - 1)) * 100;
  const yPct = (v: number) => (yOf(v) / VBH) * 100;

  const ticks = showAxis ? [0, 0.25, 0.5, 0.75, 1].map((f) => min + f * range) : [];

  function onMove(e: MouseEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    if (r.width === 0) return;
    setHi(Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left) / r.width) * (n - 1)))));
  }

  return (
    <div className={className}>
      {showAxis && (
        <div className="mb-1 flex justify-between text-[10px] tabular-nums text-muted-foreground">
          <span>{labels[0]}</span>
          <span>{labels[n - 1]}</span>
        </div>
      )}
      <div className="relative" style={{ height }} onMouseMove={onMove} onMouseLeave={() => setHi(null)}>
        <svg viewBox={`0 0 ${VBW} ${VBH}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          <defs>
            {series.map((s, i) => (
              <linearGradient key={i} id={`al-fill-${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={seriesColor(i, s.color)} stopOpacity={single ? 0.22 : 0.14} />
                <stop offset="1" stopColor={seriesColor(i, s.color)} stopOpacity="0" />
              </linearGradient>
            ))}
          </defs>
          {ticks.map((t, i) => (
            <line key={i} x1="0" y1={yOf(t)} x2={VBW} y2={yOf(t)} stroke="var(--border)" strokeWidth="1" vectorEffect="non-scaling-stroke" strokeDasharray="4 4" />
          ))}
          {series.map((s, si) => {
            const topPts = s.data.map((v, i) => [xOf(i), yOf(stacked ? stackedTop(si, i) : v)] as const);
            const line = topPts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
            let areaPath = '';
            if (fill || stacked) {
              const bottom = stacked
                ? s.data.map((_, i) => [xOf(i), yOf(baselines[si][i])] as const).reverse()
                : ([[VBW, VBH], [0, VBH]] as const);
              areaPath = `${line} ${bottom.map(([x, y]) => `L${x.toFixed(1)},${y.toFixed(1)}`).join(' ')} Z`;
            }
            return (
              <g key={si}>
                {(fill || stacked) && <path d={areaPath} fill={`url(#al-fill-${si})`} />}
                <path
                  d={line}
                  fill="none"
                  stroke={seriesColor(si, s.color)}
                  strokeWidth="2.5"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  strokeDasharray={s.dashed ? '5 4' : undefined}
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            );
          })}
        </svg>

        {showAxis &&
          ticks.map((t, i) => (
            <span key={i} className="pointer-events-none absolute left-0 -translate-y-1/2 text-[10px] tabular-nums text-muted-foreground" style={{ top: `${yPct(t)}%` }}>
              {fmt(t)}
            </span>
          ))}

        {hi != null && (
          <>
            <div className="pointer-events-none absolute top-0 bottom-0 w-px bg-foreground/15" style={{ left: `${xPct(hi)}%` }} />
            {series.map((s, si) => (
              <div
                key={si}
                className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card"
                style={{ left: `${xPct(hi)}%`, top: `${yPct(stacked ? stackedTop(si, hi) : s.data[hi])}%`, backgroundColor: seriesColor(si, s.color) }}
              />
            ))}
            <div
              className="pointer-events-none absolute top-1 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg border border-border bg-popover px-2.5 py-1.5 text-[11px] shadow-lg"
              style={{ left: `${Math.min(88, Math.max(12, xPct(hi)))}%` }}
            >
              <div className="mb-0.5 font-semibold text-foreground">{labels[hi]}</div>
              {series.map((s, si) => (
                <div key={si} className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: seriesColor(si, s.color) }} />
                  {!single && <span className="text-muted-foreground">{s.name}</span>}
                  <span className="ml-auto pl-2 font-mono tabular-nums text-foreground">{fmt(s.data[hi] ?? 0)}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {series.length > 1 && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {series.map((s, si) => (
            <span key={si} className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: seriesColor(si, s.color) }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
