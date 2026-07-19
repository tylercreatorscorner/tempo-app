import { redirect } from 'next/navigation';
import { getCreatorSession, getCurrentBrandCookie } from '@/lib/auth/creator-auth';
import {
  loadCreatorPortalProfile,
  getCreatorSummary,
  getCreatorDailySeries,
  getCreatorTopVideos,
  dateWindow,
} from '@/lib/data/creator-portal';
import { PerformanceClient } from './performance-client';
import { parseRange } from '@/lib/creator/range';

export default async function PerformancePage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const session = await getCreatorSession();
  if (!session) redirect('/creator-login');

  const brandCookie = await getCurrentBrandCookie();
  const profile = await loadCreatorPortalProfile(String(session.creatorId), brandCookie);
  if (!profile) redirect('/creator-login');

  const params = await searchParams;
  const rangeDays = parseRange(params.range, 30);
  const window = dateWindow(rangeDays);

  const [summary, daily, topVideos] = await Promise.all([
    getCreatorSummary(profile.handles, profile.currentBrand, window).catch(() => null),
    getCreatorDailySeries(profile.handles, profile.currentBrand, window).catch(() => []),
    getCreatorTopVideos(profile.handles, profile.currentBrand, window, 50).catch(() => []),
  ]);

  return (
    <PerformanceClient
      realName={profile.realName}
      currentBrand={profile.currentBrand}
      currentBrandDisplay={
        profile.currentBrand
          ? profile.contracts.find((c) => c.brandSlug === profile.currentBrand)?.brandDisplayName ?? profile.currentBrand
          : null
      }
      rangeDays={rangeDays}
      summary={summary}
      daily={daily}
      topVideos={topVideos}
    />
  );
}
