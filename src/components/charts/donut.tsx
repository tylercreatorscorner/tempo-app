import { seriesColor } from './format';

export interface DonutSegment {
  label: string;
  value: number;
  color?: string;
}

/**
 * Bespoke SVG donut — a muted track with one arc per segment (stroke-dasharray),
 * rotated -90° to start at top. Theme-aware. Renders the ring only; callers lay
 * out their own legend (or pass `centerLabel` for a single headline).
 */
export function Donut({
  segments,
  size = 112,
  thickness = 13,
  centerLabel,
  className,
}: {
  segments: DonutSegment[];
  size?: number;
  thickness?: number;
  centerLabel?: React.ReactNode;
  className?: string;
}) {
  const R = 40;
  const CIRC = 2 * Math.PI * R;
  const total = segments.reduce((s, x) => s + Math.max(0, x.value), 0);

  let offset = 0;
  const arcs = total > 0
    ? segments.map((s, i) => {
        const len = (Math.max(0, s.value) / total) * CIRC;
        const dash = { color: seriesColor(i, s.color), len, off: offset };
        offset += len;
        return dash;
      })
    : [];

  return (
    <div className={`relative inline-grid place-items-center ${className ?? ''}`} style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="50" cy="50" r={R} fill="none" stroke="var(--muted-foreground)" strokeOpacity="0.18" strokeWidth={thickness} />
        {arcs.map((a, i) => (
          <circle
            key={i}
            cx="50"
            cy="50"
            r={R}
            fill="none"
            stroke={a.color}
            strokeWidth={thickness}
            strokeDasharray={`${a.len.toFixed(2)} ${(CIRC - a.len).toFixed(2)}`}
            strokeDashoffset={`${(-a.off).toFixed(2)}`}
          />
        ))}
      </svg>
      {centerLabel != null && <div className="absolute inset-0 grid place-items-center text-center">{centerLabel}</div>}
    </div>
  );
}
