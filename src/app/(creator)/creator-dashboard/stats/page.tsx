import { getCreatorStats, getCreatorDailyData, getCreatorTopVideos, getDateRange, getAllTimeRange } from '@/lib/data/creator';
import { StatsClient } from './stats-client';

const CREATOR_NAME = 'testcreator';
const BRAND = 'creators_corner';

export default async function StatsPage() {
  // Prefetch 7d data; client will re-fetch on period change
  const ranges = {
    '7': getDateRange(7),
    '30': getDateRange(30),
    '90': getDateRange(90),
    'all': getAllTimeRange(),
  };

  const r = ranges['7'];

  const [stats, prevStats, dailyData, topVideos] = await Promise.all([
    getCreatorStats(CREATOR_NAME, BRAND, r.start, r.end).catch(() => null),
    getCreatorStats(CREATOR_NAME, BRAND, getDateRange(14).start, getDateRange(14).end).catch(() => null),
    getCreatorDailyData(CREATOR_NAME, BRAND, r.start, r.end).catch(() => []),
    getCreatorTopVideos(CREATOR_NAME, BRAND, r.start, r.end, 10).catch(() => []),
  ]);

  return (
    <StatsClient
      stats={stats}
      dailyData={dailyData}
      topVideos={topVideos}
    />
  );
}
