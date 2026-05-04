import { redirect } from 'next/navigation';
import { getCreatorSession, getCurrentBrandCookie } from '@/lib/auth/creator-auth';
import {
  loadCreatorPortalProfile,
  getInspirationVideos,
  dateWindow,
} from '@/lib/data/creator-portal';
import { InspirationClient } from './inspiration-client';

export default async function InspirationPage({
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
  const rangeDays = parseRange(params.range);
  const window = dateWindow(rangeDays);

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
      rangeDays={rangeDays}
      videos={decorated}
    />
  );
}

function parseRange(raw: string | undefined): number {
  const n = Number(raw);
  if ([7, 14, 30].includes(n)) return n;
  return 14;
}
