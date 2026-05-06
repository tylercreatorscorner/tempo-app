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
    <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
      <div className="p-4 border-b border-gray-100 flex items-center gap-2">
        <span className="text-lg">🏅</span>
        <h3 className="text-base font-semibold text-[#1A1B3A]">Community Highlights</h3>
        <span className="text-xs text-gray-400 ml-auto">Top creators this period</span>
      </div>
      <div className="divide-y divide-gray-50/80">
        {top.length === 0 ? (
          <div className="px-4 py-8 text-center text-gray-400 text-sm">
            No creator data available
          </div>
        ) : (
          top.map((c, i) => {
            const rank = RANK_STYLES[i];
            const initial = (c.display_name || '?')[0].toUpperCase();
            return (
              <div
                key={c.display_name + i}
                className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50/60 transition-colors"
              >
                {rank ? (
                  <div
                    className={`h-7 w-7 rounded-full bg-gradient-to-br ${rank.bg} ${rank.shadow} shadow flex items-center justify-center text-xs font-bold ${rank.text} flex-shrink-0`}
                  >
                    {i + 1}
                  </div>
                ) : (
                  <span className="h-7 w-7 flex items-center justify-center text-sm font-bold text-gray-300 flex-shrink-0">
                    {i + 1}
                  </span>
                )}

                <div
                  className="h-8 w-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                  style={{
                    background: c.isManaged
                      ? 'linear-gradient(135deg, #FF4D8D, #7C5CFC)'
                      : 'linear-gradient(135deg, #CBD5E1, #94A3B8)',
                  }}
                >
                  {initial}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-semibold text-[#1A1B3A] truncate">{c.display_name}</p>
                    {c.isManaged && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#7C5CFC]/10 text-[#7C5CFC] flex-shrink-0">
                        M
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400">
                    {formatNumber(c.total_videos)} videos · {formatNumber(c.total_orders)} orders
                  </p>
                </div>

                <span className="text-sm font-bold text-[#E91E8C] flex-shrink-0">
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
