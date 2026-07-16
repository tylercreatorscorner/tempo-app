import { formatCurrency } from '@/lib/utils/format';

// Bespoke SVG donut matching the Pulse mockup: a muted track + a primary arc
// via stroke-dasharray, rotated -90° so it starts at the top. Theme-aware (SVG
// resolves the CSS-var strokes), static, zero dependencies.
const R = 40;
const CIRC = 2 * Math.PI * R; // ≈ 251.33

/**
 * Managed vs Organic split of affiliate GMV. "Organic" = brand-wide affiliate
 * GMV not attributable to a managed creator (total − managed).
 */
export function ManagedOrganicDonut({ managed, organic }: { managed: number; organic: number }) {
  const total = managed + organic;
  const managedPct = total > 0 ? Math.round((managed / total) * 100) : 0;
  const organicPct = total > 0 ? 100 - managedPct : 0;
  const managedLen = total > 0 ? (managed / total) * CIRC : 0;

  return (
    <div className="flex items-center gap-[18px]">
      <svg viewBox="0 0 100 100" className="h-[104px] w-[104px] shrink-0 -rotate-90" aria-hidden="true">
        <circle cx="50" cy="50" r={R} fill="none" stroke="var(--border)" strokeWidth="14" />
        {total > 0 && (
          <circle
            cx="50"
            cy="50"
            r={R}
            fill="none"
            stroke="var(--primary)"
            strokeWidth="14"
            strokeDasharray={`${managedLen.toFixed(2)} ${CIRC.toFixed(2)}`}
          />
        )}
      </svg>
      <div className="min-w-0 space-y-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-[3px] bg-primary" />
            <span className="text-[19px] font-extrabold tracking-tight tabular-nums text-foreground">{managedPct}%</span>
          </div>
          <p className="mt-0.5 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            Managed · <span className="font-mono tabular-nums normal-case">{formatCurrency(managed)}</span>
          </p>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-[3px] bg-border" />
            <span className="text-base font-extrabold tracking-tight tabular-nums text-foreground">{organicPct}%</span>
          </div>
          <p className="mt-0.5 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            Organic · <span className="font-mono tabular-nums normal-case">{formatCurrency(organic)}</span>
          </p>
        </div>
      </div>
    </div>
  );
}
