'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Inline SVG sparkline — area + line + end dot, no axes. Lightweight enough for
 * tables of many rows; hover shows a guide + dot + portaled tooltip. Theme-aware
 * (stroke uses a CSS var by default). Replaces both the ApexCharts SparklineChart
 * and the bespoke SparklineCell.
 */
interface Props {
  data?: number[] | null;
  /** ISO day labels aligned 1:1 with `data`, for the hover tooltip. */
  days?: string[];
  color?: string;
  width?: number;
  height?: number;
  format?: (v: number) => string;
  /** Fill the area under the line (default true). */
  area?: boolean;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtDay(iso?: string): string | null {
  if (!iso) return null;
  const [, m, d] = iso.split('-').map(Number);
  if (!m || !d) return null;
  return `${MONTHS[m - 1]} ${d}`;
}

export function Sparkline({ data, days, color = 'var(--primary)', width = 88, height = 28, format, area = true }: Props) {
  // Keep each day aligned with its value while dropping non-finite points, so a
  // hover label can't slide out of sync with the value it describes.
  const kept = (data ?? []).map((v, i) => ({ v, day: days?.[i] })).filter((p) => Number.isFinite(p.v));
  const series = kept.map((p) => p.v);
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);

  const hasData = series.length > 1 && series.some((v) => v > 0);
  if (!hasData) return <span className="text-xs text-muted-foreground">—</span>;

  const max = Math.max(...series);
  const min = Math.min(...series, 0);
  const range = max - min || 1;
  const stepX = width / (series.length - 1);
  const yOf = (v: number) => height - ((v - min) / range) * (height - 3) - 1.5;
  const pts = series.map((v, i) => `${(i * stepX).toFixed(1)},${yOf(v).toFixed(1)}`);
  const line = `M ${pts.join(' L ')}`;
  const areaPath = `${line} L ${width.toFixed(1)},${height} L 0,${height} Z`;
  const fmt = format ?? ((v: number) => v.toLocaleString());

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0) return;
    const rel = (e.clientX - rect.left) / rect.width;
    const i = Math.max(0, Math.min(series.length - 1, Math.round(rel * (series.length - 1))));
    setHover({ i, x: rect.left + (i / (series.length - 1)) * rect.width, y: rect.top + (yOf(series[i]) / height) * rect.height });
  }

  const hi = hover?.i ?? null;
  const dayLabel = hi != null ? fmtDay(kept[hi]?.day) : null;

  return (
    <div className="relative" style={{ width, height }} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="group block overflow-visible" aria-hidden="true">
        {area && <path d={areaPath} fill={color} className="[fill-opacity:0.12] transition-[fill-opacity] duration-150 group-hover:[fill-opacity:0.2]" />}
        <path d={line} fill="none" stroke={color} strokeLinejoin="round" strokeLinecap="round" className="[stroke-width:1.5] transition-[stroke-width] duration-150 group-hover:[stroke-width:2]" />
        {hi != null && (
          <g>
            <line x1={hi * stepX} y1={0} x2={hi * stepX} y2={height} stroke={color} strokeWidth={1} strokeOpacity={0.25} />
            <circle cx={hi * stepX} cy={yOf(series[hi])} r={2.5} fill="var(--card)" stroke={color} strokeWidth={1.5} />
          </g>
        )}
      </svg>
      {hover && typeof document !== 'undefined' &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[100] -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-[11px] font-medium text-background shadow-lg"
            style={{ left: hover.x, top: hover.y - 8 }}
          >
            {dayLabel && <span className="text-background/60">{dayLabel} · </span>}
            {fmt(series[hover.i])}
          </div>,
          document.body,
        )}
    </div>
  );
}
