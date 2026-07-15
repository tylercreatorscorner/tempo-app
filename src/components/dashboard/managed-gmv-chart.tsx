'use client';

import { useState, type MouseEvent } from 'react';
import { formatCurrency } from '@/lib/utils/format';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

// Bespoke SVG area chart matching the Pulse mockup: accent gradient fill + a
// clean 2.5px line, no axes/gridlines. SVG resolves CSS vars, so it's fully
// theme-aware. Dots/guide/tooltip are HTML overlays (positioned by %) so the
// preserveAspectRatio="none" stretch never distorts them.
const W = 620;
const H = 150;

export function ManagedGmvChart({
  data,
  total,
  trend,
  label,
}: {
  data: { date: string; gmv: number }[];
  total: number;
  trend?: number;
  label: string;
}) {
  const [hi, setHi] = useState<number | null>(null);
  const isPos = trend !== undefined && trend >= 0;
  const pts = data.filter((d) => Number.isFinite(d.gmv));
  const n = pts.length;
  const hasChart = n > 1;

  const max = Math.max(...pts.map((d) => d.gmv), 1);
  const min = Math.min(...pts.map((d) => d.gmv), 0);
  const range = max - min || 1;
  const xPct = (i: number) => (i / (n - 1)) * 100;
  const yOf = (v: number) => H - 6 - ((v - min) / range) * (H - 12);
  const yPct = (v: number) => (yOf(v) / H) * 100;
  const line = pts.map((d, i) => `${i === 0 ? 'M' : 'L'}${((i / (n - 1)) * W).toFixed(1)},${yOf(d.gmv).toFixed(1)}`).join(' ');
  const area = hasChart ? `${line} L${W},${H} L0,${H} Z` : '';

  function onMove(e: MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0) return;
    const rel = (e.clientX - rect.left) / rect.width;
    setHi(Math.max(0, Math.min(n - 1, Math.round(rel * (n - 1)))));
  }

  const hd = hi != null ? pts[hi] : null;

  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-extrabold tracking-tight tabular-nums text-foreground">{formatCurrency(total)}</p>
        </div>
        {trend !== undefined && (
          <span className={cn('shrink-0 text-[13px] font-bold tabular-nums', isPos ? 'text-[var(--pulse-pos)]' : 'text-[var(--pulse-neg)]')}>
            {isPos ? '▲' : '▼'}{Math.round(Math.abs(trend))}%
          </span>
        )}
      </CardHeader>
      <CardContent>
        {hasChart ? (
          <div className="relative h-[150px]" onMouseMove={onMove} onMouseLeave={() => setHi(null)}>
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
              <defs>
                <linearGradient id="mgv-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="var(--primary)" stopOpacity="0.28" />
                  <stop offset="1" stopColor="var(--primary)" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={area} fill="url(#mgv-fill)" />
              <path
                d={line}
                fill="none"
                stroke="var(--primary)"
                strokeWidth="2.5"
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            {/* HTML overlays — no aspect-ratio distortion */}
            {hd ? (
              <>
                <div className="pointer-events-none absolute top-0 bottom-0 w-px bg-primary/30" style={{ left: `${xPct(hi!)}%` }} />
                <div
                  className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-2 ring-card"
                  style={{ left: `${xPct(hi!)}%`, top: `${yPct(hd.gmv)}%` }}
                />
                <div
                  className="pointer-events-none absolute top-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-[11px] font-medium text-background shadow-lg"
                  style={{ left: `${Math.min(92, Math.max(8, xPct(hi!)))}%` }}
                >
                  <span className="text-background/60">
                    {new Date(hd.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ·{' '}
                  </span>
                  <span className="tabular-nums">{formatCurrency(hd.gmv)}</span>
                </div>
              </>
            ) : (
              <div
                className="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary"
                style={{ left: '100%', top: `${yPct(pts[n - 1].gmv)}%` }}
              />
            )}
          </div>
        ) : (
          <div className="grid h-[150px] place-items-center text-sm text-muted-foreground">Not enough data for a trend</div>
        )}
      </CardContent>
    </Card>
  );
}
