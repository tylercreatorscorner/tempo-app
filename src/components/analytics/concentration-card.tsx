import { formatCurrency, formatNumber } from '@/lib/utils/format';

export interface ConcentrationStats {
  /** Total number of creators with any GMV in the period */
  totalCreators: number;
  /** Total GMV across all creators */
  totalGmv: number;
  /** GMV from the top creator alone */
  top1Gmv: number;
  /** Cumulative GMV from the top 5 creators */
  top5Gmv: number;
  /** Cumulative GMV from the top 10 creators */
  top10Gmv: number;
  /** Cumulative GMV from the top 25 creators */
  top25Gmv: number;
}

interface Props {
  stats: ConcentrationStats;
}

/** "Where is GMV coming from?" — answers concentration risk at a glance.
 * Shows a four-segment stacked bar of (top 1, 2-5, 6-10, 11-25, rest) and
 * three pill stats. An agency cares deeply about this: high concentration
 * = single-creator dependence = a risk that one churn tanks the brand. */
export function ConcentrationCard({ stats }: Props) {
  const { totalCreators, totalGmv, top1Gmv, top5Gmv, top10Gmv, top25Gmv } = stats;
  if (totalCreators === 0 || totalGmv === 0) return null;

  // Segment shares for the stacked bar
  const seg1     = top1Gmv;                  // top 1
  const seg2to5  = Math.max(0, top5Gmv  - top1Gmv);
  const seg6to10 = Math.max(0, top10Gmv - top5Gmv);
  const seg11to25 = Math.max(0, top25Gmv - top10Gmv);
  const segRest  = Math.max(0, totalGmv - top25Gmv);

  const pct = (n: number) => (totalGmv > 0 ? (n / totalGmv) * 100 : 0);
  const top1Pct  = pct(top1Gmv);
  const top5Pct  = pct(top5Gmv);
  const top10Pct = pct(top10Gmv);

  return (
    <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-bold text-[#1A1B3A]">Creator Concentration</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {formatNumber(totalCreators)} creators contributed · {formatCurrency(totalGmv)} total
          </p>
        </div>
      </div>

      {/* Stacked bar — 5 segments, darkest first */}
      <div className="flex h-3 rounded-full overflow-hidden bg-gray-100 mb-3" role="img" aria-label="GMV concentration by creator rank">
        {seg1     > 0 && <div style={{ width: `${pct(seg1)}%`,     backgroundColor: '#1A1B3A' }} />}
        {seg2to5  > 0 && <div style={{ width: `${pct(seg2to5)}%`,  backgroundColor: '#7C5CFC' }} />}
        {seg6to10 > 0 && <div style={{ width: `${pct(seg6to10)}%`, backgroundColor: '#A78BFA' }} />}
        {seg11to25 > 0 && <div style={{ width: `${pct(seg11to25)}%`, backgroundColor: '#C4B5FD' }} />}
        {segRest  > 0 && <div style={{ width: `${pct(segRest)}%`,  backgroundColor: '#E5E7EB' }} />}
      </div>

      {/* Three pill stats */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Pill rank="Top 1" pct={top1Pct} gmv={top1Gmv} color="#1A1B3A" />
        <Pill rank="Top 5" pct={top5Pct} gmv={top5Gmv} color="#7C5CFC" />
        <Pill rank="Top 10" pct={top10Pct} gmv={top10Gmv} color="#A78BFA" />
      </div>
    </div>
  );
}

function Pill({ rank, pct, gmv, color }: { rank: string; pct: number; gmv: number; color: string }) {
  return (
    <div className="rounded-xl bg-gray-50 px-3 py-2.5">
      <div className="flex items-center gap-1.5 mb-0.5">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{rank}</span>
      </div>
      <p className="text-base font-bold text-[#1A1B3A] tabular-nums leading-tight">
        {pct.toFixed(0)}%
      </p>
      <p className="text-[10px] text-gray-400 tabular-nums">{formatCurrency(gmv)}</p>
    </div>
  );
}
