import { getCreatorStats, getCreatorDailyData, getCreatorTopVideos, getDateRange, getAllTimeRange } from '@/lib/data/creator';
import { getCreatorProfile, getCreatorUsernames } from '@/lib/data/creator-context';
import { StatsClient } from './stats-client';
import { redirect } from 'next/navigation';

export default async function StatsPage() {
  const profile = await getCreatorProfile();
  if (!profile) redirect('/creator-login');

  const usernames = getCreatorUsernames(profile, profile.current_brand);
  const primaryUsername = usernames[0] ?? '';
  const brand = profile.current_brand ?? profile.brands[0] ?? '';
  const r = getDateRange(7);

  const [stats, prevStats, dailyData, topVideos] = await Promise.all([
    primaryUsername ? getCreatorStats(primaryUsername, brand, r.start, r.end).catch(() => null) : null,
    primaryUsername ? getCreatorStats(primaryUsername, brand, getDateRange(14).start, getDateRange(14).end).catch(() => null) : null,
    primaryUsername ? getCreatorDailyData(primaryUsername, brand, r.start, r.end).catch(() => []) : [],
    primaryUsername ? getCreatorTopVideos(primaryUsername, brand, r.start, r.end, 10).catch(() => []) : [],
  ]);

  return (
    <StatsClient
      stats={stats}
      dailyData={dailyData}
      topVideos={topVideos}
    />
  );
}
