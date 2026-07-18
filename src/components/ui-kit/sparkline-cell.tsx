'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Compact inline sparkline for a table row — pure SVG (no chart lib), so a page
 * of 50 rows renders instantly. Hovering shows a guide line + dot and a small
 * tooltip with that day's value (portaled to <body> so the table's overflow
 * never clips it). Use the ApexCharts SparklineChart for the larger single
 * chart in the creator detail panel, not here.
 */
interface Props {
  data?: number[] | null;
  /** ISO day labels aligned 1:1 with `data`, for the hover tooltip. */
  days?: string[];
  color?: string;
  width?: number;
  height?: number;
  /** Formats a value for the tooltip (e.g. money, "N posts"). */
  format?: (v: number) => string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtDay(iso?: string): string | null {
  if (!iso) return null;
  const [, m, d] = iso.split('-').map(Number);
  if (!m || !d) return null;
  return `${MONTHS[m - 1]} ${d}`;
}

export function SparklineCell({ data, days, color = 'var(--primary)', width = 88, height = 26, format }: Props) {
  const series = (data ?? []).filter((v) => Number.isFinite(v));
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);

  const hasData = series.length > 1 && series.some((v) => v > 0);
  // Reserve the same box the sparkline would occupy so number columns stay
  // aligned row-to-row (a bare "—" collapses to ~8px and ragged the columns).
  if (!hasData) return <span className="inline-flex items-center justify-center text-muted-foreground text-xs" style={{ width, height }}>—</span>;

  const max = Math.max(...series);
  const min = Math.min(...series, 0);
  const range = max - min || 1;
  const stepX = width / (series.length - 1);
  const yOf = (v: number) => height - ((v - min) / range) * height;
  const pts = series.map((v, i) => `${(i * stepX).toFixed(1)},${yOf(v).toFixed(1)}`);
  const line = `M ${pts.join(' L ')}`;
  const area = `${line} L ${width.toFixed(1)},${height} L 0,${height} Z`;
  const fmt = format ?? ((v: number) => v.toLocaleString());

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0) return;
    const rel = (e.clientX - rect.left) / rect.width; // 0..1
    const i = Math.max(0, Math.min(series.length - 1, Math.round(rel * (series.length - 1))));
    const px = rect.left + (i / (series.length - 1)) * rect.width;
    const py = rect.top + (yOf(series[i]) / height) * rect.height;
    setHover({ i, x: px, y: py });
  }

  const hi = hover?.i ?? null;
  const dayLabel = hi != null ? fmtDay(days?.[hi]) : null;

  return (
    <div className="relative" style={{ width, height }} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="group block overflow-visible" aria-hidden="true">
        <path d={area} fill={color} className="[fill-opacity:0.12] transition-[fill-opacity] duration-150 group-hover:[fill-opacity:0.2]" />
        <path
          d={line}
          fill="none"
          stroke={color}
          strokeLinejoin="round"
          strokeLinecap="round"
          className="[stroke-width:1.5] transition-[stroke-width] duration-150 group-hover:[stroke-width:2]"
        />
        {hi != null && (
          <g>
            <line x1={hi * stepX} y1={0} x2={hi * stepX} y2={height} stroke={color} strokeWidth={1} strokeOpacity={0.25} />
            <circle cx={hi * stepX} cy={yOf(series[hi])} r={2.5} fill="#fff" stroke={color} strokeWidth={1.5} />
          </g>
        )}
      </svg>
      {hover && typeof document !== 'undefined' && createPortal(
        <div
          className="pointer-events-none fixed z-[100] -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-[11px] font-medium text-white shadow-lg"
          style={{ left: hover.x, top: hover.y - 8 }}
        >
          {dayLabel && <span className="text-muted-foreground">{dayLabel} · </span>}
          {fmt(series[hover.i])}
        </div>,
        document.body,
      )}
    </div>
  );
}
