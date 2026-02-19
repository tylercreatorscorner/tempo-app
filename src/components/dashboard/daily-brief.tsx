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

  // Top story: highest GMV creator or video
  const topStoryIsCreator = (topCreator?.total_gmv ?? 0) >= (topVideo?.total_gmv ?? 0);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Newspaper className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-bold tracking-widest uppercase">
            The Daily Brief
          </h2>
        </div>
        <span className="text-sm text-muted-foreground">{today}</span>
      </div>

      <div className="p-6">
        {/* Top Story + Quick Hits */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* Top Story */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Top Story</p>
            {topStoryIsCreator && topCreator ? (
              <div>
                <p className="text-lg font-bold">
                  {topCreator.creator_name}&apos;s sales hit {formatCurrency(topCreator.total_gmv)}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  @{topCreator.creator_name} delivers standout performance this period
                </p>
              </div>
            ) : topVideo ? (
              <div>
                <p className="text-lg font-bold">
                  Top video hits {formatCurrency(topVideo.total_gmv)} in sales
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  &quot;{topVideo.video_title?.slice(0, 60) || 'Untitled'}&quot; by @{topVideo.creator_name}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No standout performance yet</p>
            )}
          </div>

          {/* Quick Hits */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Quick Hits</p>
            <ul className="space-y-1.5 text-sm">
              <li>Yesterday: <span className="font-semibold">{formatCurrency(yesterdayGmv)}</span> GMV</li>
              {bestBrand && (
                <li>
                  {BRAND_DISPLAY_NAMES[bestBrand.brand] ?? bestBrand.brand}{' '}
                  <span className={bestBrand.trend >= 0 ? 'text-green-500' : 'text-red-500'}>
                    {bestBrand.trend >= 0 ? '+' : ''}{bestBrand.trend.toFixed(1)}% WoW
                  </span>
                </li>
              )}
              {topVideo && (
                <li>Top video: <span className="font-semibold">{formatCurrency(topVideo.total_gmv)}</span> by @{topVideo.creator_name}</li>
              )}
              <li><span className="font-semibold">{formatNumber(totalCreators)}</span> creators active</li>
            </ul>
          </div>
        </div>

        {/* Insight Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Trending Up */}
          <div className="rounded-lg border border-border bg-muted/20 p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4 text-green-500" />
              <span className="text-xs font-semibold uppercase text-muted-foreground">Trending Up</span>
            </div>
            {bestBrand ? (
              <>
                <p className="font-semibold">{BRAND_DISPLAY_NAMES[bestBrand.brand] ?? bestBrand.brand}</p>
                <div className="flex items-center gap-1 text-sm mt-1">
                  {bestBrand.trend >= 0 ? (
                    <ArrowUpRight className="h-3 w-3 text-green-500" />
                  ) : (
                    <ArrowDownRight className="h-3 w-3 text-red-500" />
                  )}
                  <span className={bestBrand.trend >= 0 ? 'text-green-500' : 'text-red-500'}>
                    {bestBrand.trend >= 0 ? '+' : ''}{bestBrand.trend.toFixed(1)}%
                  </span>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No data</p>
            )}
          </div>

          {/* Top Performer */}
          <div className="rounded-lg border border-border bg-muted/20 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Star className="h-4 w-4 text-yellow-500" />
              <span className="text-xs font-semibold uppercase text-muted-foreground">Top Performer</span>
            </div>
            {topCreator ? (
              <>
                <p className="font-semibold">@{topCreator.creator_name}</p>
                <p className="text-sm text-muted-foreground mt-1">{formatCurrency(topCreator.total_gmv)}</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No data</p>
            )}
          </div>

          {/* Hot Content */}
          <div className="rounded-lg border border-border bg-muted/20 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Flame className="h-4 w-4 text-orange-500" />
              <span className="text-xs font-semibold uppercase text-muted-foreground">Hot Content</span>
            </div>
            {topVideo ? (
              <>
                <p className="font-semibold truncate">{topVideo.video_title?.slice(0, 40) || 'Untitled'}</p>
                <p className="text-sm text-muted-foreground mt-1">{formatCurrency(topVideo.total_gmv)}</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No data</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
