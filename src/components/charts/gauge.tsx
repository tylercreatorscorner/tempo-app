/**
 * Radial progress-to-goal gauge — a 270° SVG arc (track + value fill), rounded
 * caps, gap at the bottom. Theme-aware. Converges the old ApexCharts radialBar
 * (GoalGauge) and the hand-rolled ring (PaceRing).
 */
const R = 42;
const CIRC = 2 * Math.PI * R;
const SWEEP = 0.75; // 270° of the circle is drawn; the 90° gap sits at the bottom.

export function Gauge({
  fraction,
  size = 160,
  thickness = 12,
  color = 'var(--primary)',
  label,
  sublabel,
  className,
}: {
  /** 0..1 (clamped). */
  fraction: number;
  size?: number;
  thickness?: number;
  color?: string;
  label?: React.ReactNode;
  sublabel?: React.ReactNode;
  className?: string;
}) {
  const f = Math.max(0, Math.min(1, fraction));
  const trackLen = SWEEP * CIRC;
  const valueLen = f * SWEEP * CIRC;

  return (
    <div className={`relative inline-grid place-items-center ${className ?? ''}`} style={{ width: size, height: size }}>
      {/* rotate 135° so the 270° arc opens at the bottom */}
      <svg viewBox="0 0 100 100" className="h-full w-full" style={{ transform: 'rotate(135deg)' }} aria-hidden="true">
        <circle cx="50" cy="50" r={R} fill="none" stroke="var(--secondary)" strokeWidth={thickness} strokeLinecap="round" strokeDasharray={`${trackLen.toFixed(2)} ${CIRC.toFixed(2)}`} />
        <circle cx="50" cy="50" r={R} fill="none" stroke={color} strokeWidth={thickness} strokeLinecap="round" strokeDasharray={`${valueLen.toFixed(2)} ${CIRC.toFixed(2)}`} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          {label != null && <div className="text-2xl font-extrabold tracking-tight tabular-nums text-foreground">{label}</div>}
          {sublabel != null && <div className="mt-0.5 text-[11px] font-medium text-muted-foreground">{sublabel}</div>}
        </div>
      </div>
    </div>
  );
}
