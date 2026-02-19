import { formatCurrency, formatNumber } from '@/lib/utils/format';
import { BRAND_DISPLAY_NAMES } from '@/lib/utils/constants';
import { format } from 'date-fns';
import { ArrowUpRight, ArrowDownRight, Newspaper, TrendingUp, Star, Flame } from 'lucide-react';

interface BrandTrend {
  brand: string;
  gmv: number;
  trend: number;
}

interface TopCreator {
  creator_name: string;
  total_gmv: number;
}

interface TopVideo {
  video_title: string;
  creator_name: string;
  total_gmv: number;
}

interface Props {
  yesterdayGmv: number;
  totalCreators: number;
  brandTrends: BrandTrend[];
  topCreator: TopCreator | null;
  topVideo: TopVideo | null;
}

export function DailyBrief({ yesterdayGmv, totalCreators, brandTrends, topCreator, topVideo }: Props) {
  const bestBrand = brandTrends.length > 0
    ? brandTrends.reduce((best, b) => (b.trend > best.trend ? b : best), brandTrends[0])
    : null;

  const today = format(new Date(), 'EEEE, MMMM d yyyy');
  const topStoryIsCreator = (topCreator?.total_gmv ?? 0) >= (topVideo?.total_gmv ?? 0);

  return (
    <div className="rounded-2xl overflow-hidden bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] shadow-[0_4px_24px_rgba(0,0,0,0.2)]">
      {/* Header */}
      <div className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary/25 to-primary/5 flex items-center justify-center">
            <Newspaper className="h-4 w-4 text-primary" />
          </div>
          <h2 className="text-base font-bold tracking-[0.15em] uppercase text-white/90">
            The Daily Brief
          </h2>
        </div>
        <span className="text-xs text-muted-foreground/50 font-medium">{today}</span>
      </div>

      <div className="p-6">
        {/* Top Story + Quick Hits */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div>
            <p className="text-[10px] font-semibold text-primary/60 uppercase tracking-[0.2em] mb-2">Top Story</p>
            {topStoryIsCreator && topCreator ? (
              <div>
                <p className="text-lg font-bold leading-tight">
                  {topCreator.creator_name}&apos;s sales hit {formatCurrency(topCreator.total_gmv)}
                </p>
                <p className="text-sm text-muted-foreground/60 mt-1.5">
                  @{topCreator.creator_name} delivers standout performance this period
                </p>
              </div>
            ) : topVideo ? (
              <div>
                <p className="text-lg font-bold leading-tight">
                  Top video hits {formatCurrency(topVideo.total_gmv)} in sales
                </p>
                <p className="text-sm text-muted-foreground/60 mt-1.5">
                  &quot;{topVideo.video_title?.slice(0, 60) || 'Untitled'}&quot; by @{topVideo.creator_name}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground/50">No standout performance yet</p>
            )}
          </div>

          <div>
            <p className="text-[10px] font-semibold text-primary/60 uppercase tracking-[0.2em] mb-2">Quick Hits</p>
            <ul className="space-y-1.5 text-sm text-white/70">
              <li>Yesterday: <span className="font-semibold text-white">{formatCurrency(yesterdayGmv)}</span> GMV</li>
              {bestBrand && (
                <li>
                  {BRAND_DISPLAY_NAMES[bestBrand.brand] ?? bestBrand.brand}{' '}
                  <span className={`font-semibold ${bestBrand.trend >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {bestBrand.trend >= 0 ? '+' : ''}{bestBrand.trend.toFixed(1)}% WoW
                  </span>
                </li>
              )}
              {topVideo && (
                <li>Top video: <span className="font-semibold text-white">{formatCurrency(topVideo.total_gmv)}</span> by @{topVideo.creator_name}</li>
              )}
              <li><span className="font-semibold text-white">{formatNumber(totalCreators)}</span> creators active</li>
            </ul>
          </div>
        </div>

        {/* Insight Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4 hover:bg-white/[0.06] transition-all duration-300">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4 text-green-400" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/50">Trending Up</span>
            </div>
            {bestBrand ? (
              <>
                <p className="font-semibold">{BRAND_DISPLAY_NAMES[bestBrand.brand] ?? bestBrand.brand}</p>
                <div className="flex items-center gap-1 text-sm mt-1">
                  {bestBrand.trend >= 0 ? <ArrowUpRight className="h-3 w-3 text-green-400" /> : <ArrowDownRight className="h-3 w-3 text-red-400" />}
                  <span className={bestBrand.trend >= 0 ? 'text-green-400 font-semibold' : 'text-red-400 font-semibold'}>
                    {bestBrand.trend >= 0 ? '+' : ''}{bestBrand.trend.toFixed(1)}%
                  </span>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground/50">No data</p>
            )}
          </div>

          <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4 hover:bg-white/[0.06] transition-all duration-300">
            <div className="flex items-center gap-2 mb-2">
              <Star className="h-4 w-4 text-yellow-400" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/50">Top Performer</span>
            </div>
            {topCreator ? (
              <>
                <p className="font-semibold">@{topCreator.creator_name}</p>
                <p className="text-sm text-muted-foreground/60 mt-1">{formatCurrency(topCreator.total_gmv)}</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground/50">No data</p>
            )}
          </div>

          <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4 hover:bg-white/[0.06] transition-all duration-300">
            <div className="flex items-center gap-2 mb-2">
              <Flame className="h-4 w-4 text-orange-400" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/50">Hot Content</span>
            </div>
            {topVideo ? (
              <>
                <p className="font-semibold truncate">{topVideo.video_title?.slice(0, 40) || 'Untitled'}</p>
                <p className="text-sm text-muted-foreground/60 mt-1">{formatCurrency(topVideo.total_gmv)}</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground/50">No data</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
