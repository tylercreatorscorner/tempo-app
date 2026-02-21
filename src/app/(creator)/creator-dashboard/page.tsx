import { getCreatorStats, getCreatorTopVideos, getCreatorStreak, getDateRange, getBrandTopVideos } from '@/lib/data/creator';
import { TodayClient } from './today-client';

// Hardcoded for now — swap when auth is wired
const CREATOR_NAME = 'testcreator';
const BRAND = 'creators_corner';

export default async function CreatorDashboardPage() {
  const { start, end } = getDateRange(7);

  const [stats, streak, topVideos, winningVideos] = await Promise.all([
    getCreatorStats(CREATOR_NAME, BRAND, start, end).catch(() => null),
    getCreatorStreak(CREATOR_NAME, BRAND).catch(() => 0),
    getCreatorTopVideos(CREATOR_NAME, BRAND, start, end, 6).catch(() => []),
    getBrandTopVideos(BRAND, start, end, 6).catch(() => []),
  ]);

  return (
    <TodayClient
      creatorName={CREATOR_NAME}
      stats={stats}
      streak={streak}
      recentVideos={topVideos}
      winningVideos={winningVideos}
    />
  );
}
