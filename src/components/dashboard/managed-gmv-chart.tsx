'use client';

import { useId, useState, type PointerEvent, type ReactNode } from 'react';
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
  coverageNote,
  totalBrands,
  controls,
  numeric = false,
  coverageUnit = 'brands',
}: {
  data: { date: string; gmv: number | null; recordedBrands?: number }[];
  trend?: number;
  label: string;
  coverageNote?: string;
  totalBrands?: number;
  controls?: ReactNode;
  numeric?: boolean;
  coverageUnit?: 'brands' | 'stores';
}) {
  const compact = numeric ? (value: number) => Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:1}).format(value) : fmtCompactCurrency;
  const detail = numeric ? (value: number) => value.toLocaleString('en-US') : formatCurrency;
  const [hi, setHi] = useState<number | null>(null);
  const isPos = trend !== undefined && trend >= 0;
  const gradientId = useId();
  const pts = data;
  const values = pts.flatMap(d => d.gmv !== null && Number.isFinite(d.gmv) ? [d.gmv] : []);
  const n = pts.length;
  const mostRecorded = Math.max(0, ...pts.map(point => point.recordedBrands ?? 0));
  const hasChart = n > 0 && values.length > 0;

  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const xPct = (i: number) => (n > 1 ? i / (n - 1) : 0.5) * 100;
  const yOf = (v: number) => H - 6 - ((v - min) / range) * (H - 12);
  const yPct = (v: number) => (yOf(v) / H) * 100;
  const segments: { line: string; area: string }[] = [];
  let segment: { index: number; value: number }[] = [];
  function flushSegment() {
    if (!segment.length) return;
    const line = segment.map((point, i) => `${i ? 'L' : 'M'}${xPct(point.index) * W / 100},${yOf(point.value)}`).join(' ');
    segments.push({ line, area: `${line} L${xPct(segment[segment.length-1].index) * W / 100},${H} L${xPct(segment[0].index) * W / 100},${H} Z` });
    segment = [];
  }
  pts.forEach((point, index) => {
    if (point.gmv === null || !Number.isFinite(point.gmv)) flushSegment();
    else segment.push({ index, value: point.gmv });
  });
  flushSegment();

  function onMove(e: PointerEvent<HTMLDivElement>) {
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
        <div className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{controls ?? label}</div>
        {trend !== undefined && (
          <span className={cn('shrink-0 text-[13px] font-bold tabular-nums', isPos ? 'text-[var(--pulse-pos)]' : 'text-[var(--pulse-neg)]')}>
            {isPos ? '▲' : '▼'}{Math.abs(trend) < 1 ? Math.abs(trend).toFixed(1) : Math.round(Math.abs(trend))}%
          </span>
        )}
      </CardHeader>
      {coverageNote && <p className="px-6 pb-3 text-xs text-muted-foreground">{coverageNote}</p>}
      <CardContent className="flex flex-1 flex-col">
        {hasChart ? (
          <div className="flex flex-1 gap-1.5">
            {/* Y axis — three ticks (max / mid / min), aligned to the plot's own
                6px vertical inset so a label lines up with its gridline.
                Width is deliberately tight to the compact labels ("$154K" ≈ 30px):
                at 52px the gutter pushed the plot 60px right of centre inside the
                card, which read as the whole chart being off-centre. */}
            <div className="flex w-[34px] flex-shrink-0 flex-col justify-between py-[6px] text-right text-[10px] tabular-nums text-muted-foreground">
              <span>{compact(max)}</span>
              <span>{compact(min + range / 2)}</span>
              <span>{compact(min)}</span>
            </div>

            <div className="flex min-w-0 flex-1 flex-col">
              {/* min-h keeps the old floor; h-full lets the plot absorb the extra
                  height from the flex parent rather than leaving dead space below. */}
              <div className="relative h-full min-h-[150px]" role="group" aria-label={`${label} by day. Use left and right arrow keys to inspect dates.`} tabIndex={0}
                onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHi(null)}
                onFocus={() => setHi(n - 1)} onBlur={() => setHi(null)}
                onKeyDown={event => {
                  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                    event.preventDefault();
                    setHi(index => Math.max(0, Math.min(n - 1, (index ?? n - 1) + (event.key === 'ArrowLeft' ? -1 : 1))));
                  }
                }}>
                <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
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
              {segments.map((path, index) => <g key={index}>
                <path d={path.area} fill={`url(#${gradientId})`} />

              </g>)}
              {pts.map((point, index) => {
                const previous = pts[index - 1];
                if (!previous || previous.gmv === null || point.gmv === null) return null;
                const lowerCoverage = (previous.recordedBrands ?? mostRecorded) < mostRecorded || (point.recordedBrands ?? mostRecorded) < mostRecorded;
                return <path key={point.date} d={`M${xPct(index - 1) * W / 100},${yOf(previous.gmv)} L${xPct(index) * W / 100},${yOf(point.gmv)}`} fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeDasharray={lowerCoverage ? '4 5' : undefined} strokeLinecap="round" vectorEffect="non-scaling-stroke" />;
              })}
              {pts.map((point, index) => point.gmv !== null && Number.isFinite(point.gmv) && <circle key={point.date} cx={xPct(index) * W / 100} cy={yOf(point.gmv)} r="2" fill="var(--primary)" />)}
            </svg>
            {/* HTML overlays — no aspect-ratio distortion */}
            {hd ? (
              <>
                <div className="pointer-events-none absolute top-0 bottom-0 w-px bg-primary/30" style={{ left: `${xPct(hi!)}%` }} />
                {hd.gmv !== null && <div
                  className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-2 ring-card"
                  style={{ left: `${xPct(hi!)}%`, top: `${yPct(hd.gmv)}%` }}
                />}
                <div
                  className="pointer-events-none absolute top-1 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-[11px] font-medium text-background shadow-lg"
                  style={{ left: `${xPct(hi!)}%`, transform: `translateX(${xPct(hi!) > 65 ? "-100%" : xPct(hi!) < 35 ? "0" : "-50%"})` }}
                >
                  <span className="text-background/60">
                    {new Date(hd.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })} ·{' '}
                  </span>
                  <span className="tabular-nums">{hd.gmv === null ? 'No recorded data' : detail(hd.gmv)}</span>
                  {totalBrands !== undefined && <span className="block text-background/70">{hd.recordedBrands ?? 0}/{totalBrands} {coverageUnit} recorded</span>}
                </div>
              </>
            ) : null}
              </div>

              <span className="sr-only" aria-live="polite">{hd ? `${fmtAxisDay(hd.date)}: ${hd.gmv === null ? "No recorded data" : detail(hd.gmv)}` : ""}</span>
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
