'use client';

import { useRef, useState } from 'react';
import { formatCurrency } from '@/lib/utils/format';
import { cn } from '@/lib/utils';

/**
 * Interactive area sparkline — pure SVG, no chart library.
 *
 * Colour rides `currentColor` (caller sets a text-* class), so it recolours
 * across light/dark automatically. On hover it shows a crosshair + a tooltip
 * with that day's value; pass `labels` (ISO dates, parallel to `data`) to label
 * the tooltip. Hit-testing + the hover dot/tooltip are positioned in the
 * container's pixel space, so the dot stays round even though the SVG paths
 * stretch to fill (preserveAspectRatio="none").
 */
interface SparklineProps {
  data: number[];
  labels?: string[];
  className?: string;
  strokeWidth?: number;
  idKey?: string;
}

const W = 600;
const H = 150;
const PAD_Y = 10;

export function Sparkline({ data, labels, className, strokeWidth = 2, idKey = 'spark' }: SparklineProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const rectRef = useRef<DOMRect | null>(null);
  const [hoverI, setHoverI] = useState<number | null>(null);

  if (!data || data.length < 2) return null;

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const x = (i: number) => (i * W) / (data.length - 1);
  const y = (v: number) => H - PAD_Y - ((v - min) / range) * (H - PAD_Y * 2);

  const pts = data.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const area = `${pts} L${W} ${H} L0 ${H} Z`;
  const gid = `spark-grad-${idKey}`;

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    rectRef.current = rect;
    const fx = (e.clientX - rect.left) / rect.width;
    setHoverI(Math.max(0, Math.min(data.length - 1, Math.round(fx * (data.length - 1)))));
  };

  const rect = rectRef.current;
  const hp =
    hoverI != null && rect
      ? { px: (x(hoverI) / W) * rect.width, py: (y(data[hoverI]) / H) * rect.height }
      : null;

  const fmtLabel = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(iso + 'T12:00:00Z');
    return isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const tipBelow = hp != null && hp.py < 42;

  return (
    <div
      ref={wrapRef}
      className={cn('relative touch-none', className)}
      onPointerMove={onMove}
      onPointerLeave={() => setHoverI(null)}
    >
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-full w-full" aria-hidden="true">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.26" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${gid})`} />
        <path
          d={pts}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {hoverI != null ? (
          <line
            x1={x(hoverI)}
            y1="0"
            x2={x(hoverI)}
            y2={H}
            stroke="currentColor"
            strokeOpacity="0.28"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        ) : (
          <circle cx={x(data.length - 1)} cy={y(data[data.length - 1])} r={strokeWidth + 1.5} fill="currentColor" vectorEffect="non-scaling-stroke" />
        )}
      </svg>

      {hp && (
        <span
          className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-current ring-2 ring-[var(--card)]"
          style={{ left: hp.px, top: hp.py }}
        />
      )}
      {hp && rect && (
        <div
          className={cn(
            'pointer-events-none absolute z-10 -translate-x-1/2 rounded-lg border border-border bg-[var(--card)] px-2 py-1 text-center shadow-[var(--pulse-elev-2)]',
            tipBelow ? 'translate-y-2' : '-translate-y-[calc(100%+8px)]',
          )}
          style={{ left: Math.min(Math.max(hp.px, 36), rect.width - 36), top: hp.py }}
        >
          <p className="font-mono text-[11px] font-bold tabular-nums text-foreground">
            {formatCurrency(data[hoverI!])}
          </p>
          {labels?.[hoverI!] && <p className="text-[10px] text-muted-foreground">{fmtLabel(labels[hoverI!])}</p>}
        </div>
      )}
    </div>
  );
}
