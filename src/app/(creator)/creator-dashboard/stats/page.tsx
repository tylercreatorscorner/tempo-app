import { redirect } from 'next/navigation';
import { getCreatorSession, getCurrentBrandCookie } from '@/lib/auth/creator-auth';
import {
  loadCreatorPortalProfile,
  getCreatorSummary,
  getCreatorDailySeries,
  getCreatorTopVideos,
} from '@/lib/data/creator-portal';
import { PerformanceClient } from './performance-client';
import { resolveCreatorRange } from '@/lib/creator/range';

export default async function PerformancePage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; start?: string; end?: string }>;
}) {
  const session = await getCreatorSession();
  if (!session) redirect('/creator-login');

  const brandCookie = await getCurrentBrandCookie();
  const profile = await loadCreatorPortalProfile(String(session.creatorId), brandCookie);
  if (!profile) redirect('/creator-login');

  const { window, rangeLabel } = await resolveCreatorRange(await searchParams);

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
      rangeLabel={rangeLabel}
      summary={summary}
      daily={daily}
      topVideos={topVideos}
    />
  );
}
