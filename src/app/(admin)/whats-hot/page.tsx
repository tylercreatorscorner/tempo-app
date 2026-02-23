import { getRisingVideos, getTrendingVideos, getTopVideos, getBreakoutCreators } from '@/lib/data/whats-hot';
import { resolveDateRange } from '@/lib/data/date-utils';
import { WhatsHotGrid } from '@/components/whats-hot/whats-hot-grid';

interface Props {
  searchParams: Promise<{ range?: string }>;
}

export default async function WhatsHotPage({ searchParams }: Props) {
  const params = await searchParams;
  const { startDate, endDate } = resolveDateRange(params.range);

  const [risingVideos, trendingVideos, topVideos, breakoutCreators] = await Promise.all([
    getRisingVideos(10).catch(() => []),
    getTrendingVideos(10).catch(() => []),
    getTopVideos(startDate, endDate, 10).catch(() => []),
    getBreakoutCreators(startDate, endDate, 10).catch(() => []),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#1A1B3A]">
          🔥 What&apos;s Hot
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Rising videos, trending content, and breakout performers
        </p>
      </div>

      <WhatsHotGrid
        risingVideos={risingVideos}
        trendingVideos={trendingVideos}
        topVideos={topVideos}
        breakoutCreators={breakoutCreators}
      />
    </div>
  );
}
