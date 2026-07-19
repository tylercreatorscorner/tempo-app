import { redirect } from 'next/navigation';
import { getCreatorSession, getCurrentBrandCookie } from '@/lib/auth/creator-auth';
import { loadCreatorPortalProfile, getInspirationVideos } from '@/lib/data/creator-portal';
import { resolveCreatorRange } from '@/lib/creator/range';
import { InspirationClient } from './inspiration-client';

export default async function InspirationPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; start?: string; end?: string }>;
}) {
  const session = await getCreatorSession();
  if (!session) redirect('/creator-login');

  const brandCookie = await getCurrentBrandCookie();
  const profile = await loadCreatorPortalProfile(String(session.creatorId), brandCookie);
  if (!profile) redirect('/creator-login');

  const { window, rangeLabel } = resolveCreatorRange(await searchParams);

  const videos = await getInspirationVideos(profile.currentBrand, window, 48).catch(() => []);

  // Mark "mine" by handle overlap.
  const myHandles = new Set(profile.handles.map((h) => h.toLowerCase()));
  const decorated = videos.map((v) => ({
    ...v,
    isMine: myHandles.has((v.tiktokUsername || '').toLowerCase()),
  }));

  return (
    <InspirationClient
      currentBrand={profile.currentBrand}
      currentBrandDisplay={
        profile.currentBrand
          ? profile.contracts.find((c) => c.brandSlug === profile.currentBrand)?.brandDisplayName ?? profile.currentBrand
          : null
      }
      rangeLabel={rangeLabel}
      videos={decorated}
    />
  );
}
