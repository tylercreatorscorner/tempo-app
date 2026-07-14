import { Trophy, BarChart3 } from 'lucide-react';
import { formatCurrency, formatNumber } from '@/lib/utils/format';

interface HighlightCreator {
  display_name: string;
  isManaged: boolean;
  total_gmv: number;
  total_videos: number;
  total_orders: number;
}

interface Props {
  creators: HighlightCreator[];
}

const RANK_STYLES = [
  { bg: 'from-amber-300 to-amber-500',  shadow: 'shadow-amber-200/60', text: 'text-white' },
  { bg: 'from-slate-300 to-slate-400',  shadow: 'shadow-slate-200/60', text: 'text-white' },
  { bg: 'from-amber-600 to-amber-700',  shadow: 'shadow-amber-300/40', text: 'text-white' },
];

/**
 * Top-5 creators by GMV for the current period — the dashboard's "leaderboard
 * lite." Full sortable view lives at /roster.
 */
export function CommunityHighlights({ creators }: Props) {
  const top = creators.slice(0, 5);

  return (
    <div className="rounded-2xl bg-card border border-border shadow-sm overflow-hidden">
      <div className="p-4 border-b border-border flex items-center gap-2">
        <span className="h-7 w-7 rounded-lg bg-[var(--primary)]/10 text-[var(--primary)] flex items-center justify-center">
          <Trophy className="h-4 w-4" />
        </span>
        <h3 className="text-sm font-extrabold tracking-tight text-[var(--foreground)]">Community Highlights</h3>
        <span className="text-xs text-muted-foreground ml-auto">Top creators this period</span>
      </div>
      <div className="divide-y divide-gray-50/80">
        {top.length === 0 ? (
          <div className="px-4 py-8 flex flex-col items-center gap-2 text-center text-muted-foreground text-sm">
            <BarChart3 className="h-8 w-8 text-muted-foreground" />
            No creator data available
          </div>
        ) : (
          top.map((c, i) => {
            const rank = RANK_STYLES[i];
            const initial = (c.display_name || '?')[0].toUpperCase();
            return (
              <div
                key={c.display_name + i}
                className="flex items-center gap-3 px-4 py-3 hover:bg-muted/60 transition-colors"
              >
                {rank ? (
                  <div
                    className={`h-7 w-7 rounded-full bg-gradient-to-br ${rank.bg} ${rank.shadow} shadow flex items-center justify-center text-xs font-bold tabular-nums ${rank.text} flex-shrink-0`}
                  >
                    {i + 1}
                  </div>
                ) : (
                  <span className="h-7 w-7 flex items-center justify-center text-sm font-bold tabular-nums text-muted-foreground flex-shrink-0">
                    {i + 1}
                  </span>
                )}

                <div
                  className="h-8 w-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                  style={{
                    background: c.isManaged
                      ? 'linear-gradient(135deg, var(--primary), var(--pulse-accent-2))'
                      : 'linear-gradient(135deg, #CBD5E1, #94A3B8)',
                  }}
                >
                  {initial}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-semibold text-[var(--foreground)] truncate">{c.display_name}</p>
                    {c.isManaged && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[var(--pulse-accent-2)]/10 text-[var(--pulse-accent-2)] flex-shrink-0">
                        M
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] font-mono tabular-nums text-muted-foreground">
                    {formatNumber(c.total_videos)} videos · {formatNumber(c.total_orders)} orders
                  </p>
                </div>

                <span className="text-sm font-bold font-mono tabular-nums text-[var(--foreground)] flex-shrink-0">
                  {formatCurrency(c.total_gmv)}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
