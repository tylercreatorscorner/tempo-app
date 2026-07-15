import type { CSSProperties } from 'react';
import type { CohortRow } from '@/lib/data/cohort-retention';

/** Retention % → sequential primary-hue ramp (one hue, light→dark, theme-aware). */
function cellStyle(pct: number): CSSProperties {
  const t = Math.min(1, Math.max(0, pct / 100));
  const mix = (10 + 80 * t).toFixed(1); // 10% → 90% of --primary, over transparent
  return { backgroundColor: `color-mix(in srgb, var(--primary) ${mix}%, transparent)` };
}

/**
 * Cohort-retention heatmap — a triangular grid: rows = cohorts (oldest first),
 * columns = months since first managed post, cells = share of the cohort still
 * posting. Purely presentational; server-renderable (tooltips via title attr).
 */
export function CohortHeatmap({ rows, maxMonthIndex }: { rows: CohortRow[]; maxMonthIndex: number }) {
  const cols = Array.from({ length: maxMonthIndex + 1 }, (_, i) => i);
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="text-muted-foreground">
            <th className="sticky left-0 z-10 bg-card text-left font-semibold uppercase tracking-wider px-4 py-2 whitespace-nowrap">
              Cohort
            </th>
            <th className="text-right font-semibold uppercase tracking-wider px-2 py-2 whitespace-nowrap">Size</th>
            {cols.map((i) => (
              <th key={i} className="text-center font-semibold px-2 py-2 tabular-nums whitespace-nowrap">
                M{i}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.cohortMonth} className="border-t border-border">
              <td className="sticky left-0 z-10 bg-card px-4 py-1.5 font-semibold text-[var(--foreground)] whitespace-nowrap">
                {row.label}
              </td>
              <td className="text-right px-2 py-1.5 font-mono tabular-nums text-muted-foreground">{row.size}</td>
              {cols.map((i) => {
                const cell = row.cells[i];
                if (!cell) return <td key={i} className="px-2 py-1.5" aria-hidden="true" />;
                const light = cell.pct >= 55;
                return (
                  <td key={i} className="px-1 py-1">
                    <div
                      className="rounded-md text-center py-1.5 font-mono tabular-nums font-semibold"
                      style={{ ...cellStyle(cell.pct), color: light ? '#ffffff' : 'var(--foreground)' }}
                      title={`${row.label} · M${i}: ${cell.active} of ${row.size} still active (${Math.round(cell.pct)}%)`}
                    >
                      {Math.round(cell.pct)}%
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
