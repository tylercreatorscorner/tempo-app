/**
 * Responsive, static sparkline strip — fills its container width (viewBox +
 * preserveAspectRatio="none"), area + line, no axes/hover. For the flush strip
 * inside StatCards and Brand-Performance rows. Theme-aware (CSS-var stroke),
 * server-renderable. (For a fixed-width sparkline WITH hover, use `Sparkline`.)
 */
export function SparklineStrip({
  data,
  color = 'var(--primary)',
  height = 40,
  area = true,
}: {
  data?: number[] | null;
  color?: string;
  height?: number;
  area?: boolean;
}) {
  const s = (data ?? []).filter((v) => Number.isFinite(v));
  if (s.length < 2 || !s.some((v) => v > 0)) return <div style={{ height }} />;

  const W = 100;
  const H = height;
  const max = Math.max(...s);
  const min = Math.min(...s, 0);
  const range = max - min || 1;
  const yOf = (v: number) => H - ((v - min) / range) * (H - 3) - 1.5;
  const line = s.map((v, i) => `${i === 0 ? 'M' : 'L'}${((i / (s.length - 1)) * W).toFixed(2)},${yOf(v).toFixed(2)}`).join(' ');
  const areaPath = `${line} L${W},${H} L0,${H} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height }} className="block" aria-hidden="true">
      {area && <path d={areaPath} fill={color} fillOpacity={0.14} />}
      <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
