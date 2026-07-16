'use client';

import { useState } from 'react';
import { seriesColor, fmtCompactCurrency } from './format';

export interface BarRow {
  label: string;
  /** Single-value bar. */
  value?: number;
  /** Override color for a single-value bar (e.g. a brand color). */
  color?: string;
  /** Stacked segments (commission/retainer/… ). Segment i takes categorical slot i. */
  segments?: { name: string; value: number; color?: string }[];
}

/**
 * Horizontal bar chart — single-value (distributed colors) or stacked segments,
 * scaled to the largest row total. Hover shows a per-row/segment tooltip.
 * Theme-aware; the shared component for Tempo's horizontal bar charts.
 */
export function HorizontalBars({
  rows,
  format,
  formatFull,
  className,
  barHeight = 10,
}: {
  rows: BarRow[];
  format?: (v: number) => string;
  /** Full-precision formatter for hover tooltips (labels stay compact). Defaults to `format`. */
  formatFull?: (v: number) => string;
  className?: string;
  barHeight?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const fmt = format ?? fmtCompactCurrency;
  const fmtFull = formatFull ?? fmt;
  const rowTotal = (r: BarRow) => (r.segments ? r.segments.reduce((s, x) => s + Math.max(0, x.value), 0) : Math.max(0, r.value ?? 0));
  const max = Math.max(1, ...rows.map(rowTotal));
  const stacked = rows.some((r) => r.segments);
  const legend = stacked ? rows.find((r) => r.segments)?.segments ?? [] : [];

  return (
    <div className={className}>
      <div className="space-y-2.5">
        {rows.map((r, ri) => (
          <div key={ri} className="relative grid grid-cols-[minmax(70px,120px)_1fr_auto] items-center gap-3" onMouseEnter={() => setHover(ri)} onMouseLeave={() => setHover(null)}>
            <span className="truncate text-xs font-medium text-foreground" title={r.label}>{r.label}</span>
            <div className="relative h-[var(--bh)] w-full overflow-hidden rounded-full bg-secondary" style={{ ['--bh' as string]: `${barHeight}px` }}>
              <div className="flex h-full" style={{ width: `${(rowTotal(r) / max) * 100}%` }}>
                {r.segments
                  ? r.segments.map((s, si) => (
                      <div key={si} className="h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${rowTotal(r) > 0 ? (Math.max(0, s.value) / rowTotal(r)) * 100 : 0}%`, backgroundColor: seriesColor(si, s.color) }} />
                    ))
                  : <div className="h-full rounded-full" style={{ width: '100%', backgroundColor: r.color ?? 'var(--primary)' }} />}
              </div>
            </div>
            <span className="text-xs font-bold font-mono tabular-nums text-foreground">{fmt(rowTotal(r))}</span>
            {hover === ri && (
              <div className="pointer-events-none absolute right-4 top-full z-10 mt-1 rounded-lg border border-border bg-popover px-2.5 py-1.5 text-[11px] shadow-lg">
                <div className="mb-0.5 font-semibold text-foreground">{r.label}</div>
                {r.segments ? (
                  r.segments.map((s, si) => (
                    <div key={si} className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: seriesColor(si, s.color) }} />
                      <span className="text-muted-foreground">{s.name}</span>
                      <span className="ml-auto pl-3 font-mono tabular-nums text-foreground">{fmtFull(s.value)}</span>
                    </div>
                  ))
                ) : (
                  <div className="font-mono tabular-nums text-foreground">{fmtFull(r.value ?? 0)}</div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      {legend.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {legend.map((s, si) => (
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
