/**
 * Lightweight area sparkline — pure SVG, no chart library, SSR-safe.
 *
 * Colour rides `currentColor`, so the caller sets the hue with a text-* class
 * (e.g. `text-primary`) and it recolours automatically across light/dark. The
 * line + endpoint keep a constant on-screen weight via non-scaling-stroke while
 * the area stretches to fill its box.
 */
interface SparklineProps {
  data: number[];
  className?: string;
  strokeWidth?: number;
  /** Stable id suffix for the gradient (avoid collisions when >1 on a page). */
  idKey?: string;
  showEndDot?: boolean;
}

export function Sparkline({
  data,
  className,
  strokeWidth = 2,
  idKey = 'spark',
  showEndDot = true,
}: SparklineProps) {
  if (!data || data.length < 2) return null;

  const W = 600;
  const H = 150;
  const padY = 10;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;

  const x = (i: number) => (i * W) / (data.length - 1);
  const y = (v: number) => H - padY - ((v - min) / range) * (H - padY * 2);

  const pts = data.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const area = `${pts} L${W} ${H} L0 ${H} Z`;
  const lastX = x(data.length - 1);
  const lastY = y(data[data.length - 1]);
  const gid = `spark-grad-${idKey}`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className={className}
      aria-hidden="true"
      role="presentation"
    >
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
      {showEndDot && (
        <circle cx={lastX} cy={lastY} r={strokeWidth + 1.5} fill="currentColor" vectorEffect="non-scaling-stroke" />
      )}
    </svg>
  );
}
