'use client';

import { useState, type MouseEvent } from 'react';
import { formatCurrency } from '@/lib/utils/format';
import { fmtCompactCurrency } from '@/components/charts/format';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

// Bespoke SVG area chart matching the Pulse mockup: accent gradient fill + a
// clean 2.5px line. SVG resolves CSS vars, so it's fully theme-aware.
//
// Axis labels + gridlines are HTML/percent overlays, NOT SVG text: the plot uses
// preserveAspectRatio="none" and stretches horizontally, which would smear any
// text or stroke drawn in user space. Gridlines live in the SVG but carry
// vectorEffect="non-scaling-stroke" for the same reason.
//
// Axes are deliberately recessive — hairline grid, muted 10px labels. The line
// is the subject; the scale is reference.
const W = 620;
const H = 150;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "Jul 9" from an ISO day. Parsed by parts, NOT new Date(iso), which would
 *  shift the label a day for viewers behind UTC. */
function fmtAxisDay(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return m && d ? `${MONTHS[m - 1]} ${d}` : iso;
}

export function ManagedGmvChart({
  data,
  trend,
  label,
}: {
  data: { date: string; gmv: number }[];
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
    // h-full + flex: this card shares a grid row with the donut and Roster
    // Health, whose content is taller. Grid cells stretch, but a Card that isn't
    // h-full doesn't fill its cell — so this one bottom-aligned ~38px short of
    // its neighbours. The plot region grows to take up the slack.
    <Card className="flex h-full flex-col">
      <CardHeader>
        {/* Trend card — the canonical Managed GMV number lives in the KPI hero
            above; this card shows only the shape + period-over-period delta, so
            it never displays a second (source-divergent) managed total. */}
        <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
        {trend !== undefined && (
          <span className={cn('shrink-0 text-[13px] font-bold tabular-nums', isPos ? 'text-[var(--pulse-pos)]' : 'text-[var(--pulse-neg)]')}>
            {isPos ? '▲' : '▼'}{Math.abs(trend) < 1 ? Math.abs(trend).toFixed(1) : Math.round(Math.abs(trend))}%
          </span>
        )}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        {hasChart ? (
          <div className="flex flex-1 gap-1.5">
            {/* Y axis — three ticks (max / mid / min), aligned to the plot's own
                6px vertical inset so a label lines up with its gridline.
                Width is deliberately tight to the compact labels ("$154K" ≈ 30px):
                at 52px the gutter pushed the plot 60px right of centre inside the
                card, which read as the whole chart being off-centre. */}
            <div className="flex w-[34px] flex-shrink-0 flex-col justify-between py-[6px] text-right text-[10px] tabular-nums text-muted-foreground">
              <span>{fmtCompactCurrency(max)}</span>
              <span>{fmtCompactCurrency(min + range / 2)}</span>
              <span>{fmtCompactCurrency(min)}</span>
            </div>

            <div className="flex min-w-0 flex-1 flex-col">
              {/* min-h keeps the old floor; h-full lets the plot absorb the extra
                  height from the flex parent rather than leaving dead space below. */}
              <div className="relative h-full min-h-[150px]" onMouseMove={onMove} onMouseLeave={() => setHi(null)}>
                <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
              <defs>
                <linearGradient id="mgv-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="var(--primary)" stopOpacity="0.28" />
                  <stop offset="1" stopColor="var(--primary)" stopOpacity="0" />
                </linearGradient>
              </defs>
              {/* Recessive gridlines at the three ticks. non-scaling-stroke or the
                  horizontal stretch would fatten them. */}
              {[max, min + range / 2, min].map((v, i) => (
                <line
                  key={i}
                  x1={0}
                  x2={W}
                  y1={yOf(v)}
                  y2={yOf(v)}
                  stroke="var(--border)"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
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
                    {new Date(hd.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })} ·{' '}
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

              {/* X axis — first / middle / last day. Three ticks, not n: at 30d a
                  label per point is unreadable mush, and the hover tooltip already
                  names the exact day. */}
              <div className="mt-1.5 flex justify-between text-[10px] tabular-nums text-muted-foreground">
                <span>{fmtAxisDay(pts[0].date)}</span>
                {n > 2 && <span>{fmtAxisDay(pts[Math.floor((n - 1) / 2)].date)}</span>}
                <span>{fmtAxisDay(pts[n - 1].date)}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid h-[150px] place-items-center text-sm text-muted-foreground">Not enough data for a trend</div>
        )}
      </CardContent>
    </Card>
  );
}
