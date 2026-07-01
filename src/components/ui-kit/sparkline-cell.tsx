/**
 * Compact inline sparkline for a table row — pure SVG (no chart lib), so a
 * page of 50 rows renders instantly. Use the ApexCharts SparklineChart for the
 * larger single chart in the creator detail panel, not here.
 */
export function SparklineCell({
  data,
  color = '#E91E8C',
  width = 88,
  height = 26,
}: {
  data?: number[] | null;
  color?: string;
  width?: number;
  height?: number;
}) {
  const series = (data ?? []).filter((v) => Number.isFinite(v));
  const hasData = series.length > 1 && series.some((v) => v > 0);
  if (!hasData) return <span className="text-gray-300 text-xs">—</span>;

  const max = Math.max(...series);
  const min = Math.min(...series, 0);
  const range = max - min || 1;
  const stepX = width / (series.length - 1);
  const pts = series.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / range) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const line = `M ${pts.join(' L ')}`;
  const area = `${line} L ${width.toFixed(1)},${height} L 0,${height} Z`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block" aria-hidden="true">
      <path d={area} fill={color} fillOpacity={0.12} />
      <path d={line} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
