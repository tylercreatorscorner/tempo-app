import { getCreatorStats, getCreatorTopVideos, getCreatorStreak, getDateRange, getBrandTopVideos } from '@/lib/data/creator';
import { getCreatorProfile, getCreatorUsernames } from '@/lib/data/creator-context';
import { TodayClient } from './today-client';
import { redirect } from 'next/navigation';

export default async function CreatorDashboardPage() {
  const profile = await getCreatorProfile();
  if (!profile) redirect('/creator-login');

  const usernames = getCreatorUsernames(profile, profile.current_brand);
  const primaryUsername = usernames[0] ?? '';
  const brand = profile.current_brand ?? profile.brands[0] ?? '';
  const { start, end } = getDateRange(7);

  const [stats, streak, topVideos, winningVideos] = await Promise.all([
    primaryUsername ? getCreatorStats(primaryUsername, brand, start, end).catch(() => null) : null,
    primaryUsername ? getCreatorStreak(primaryUsername, brand).catch(() => 0) : 0,
    primaryUsername ? getCreatorTopVideos(primaryUsername, brand, start, end, 6).catch(() => []) : [],
    brand ? getBrandTopVideos(brand, start, end, 6).catch(() => []) : [],
  ]);

  return (
    <TodayClient
      creatorName={profile.real_name || primaryUsername}
      stats={stats}
      streak={streak}
      recentVideos={topVideos}
      winningVideos={winningVideos}
    />
  );
}
