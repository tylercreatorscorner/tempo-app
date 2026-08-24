import { redirect } from 'next/navigation';
import { getCreatorSession, getCurrentBrandCookie } from '@/lib/auth/creator-auth';
import {
  loadCreatorPortalProfile,
  getBrandRankings,
  getBrandStanding,
  getInspirationVideos,
} from '@/lib/data/creator-portal';
import { resolveCreatorRange } from '@/lib/creator/range';
import { RankingsClient } from './rankings-client';

export default async function RankingsPage({
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

  // Rankings need SOME brand context; in All-Brands view fall back to the
  // creator's top-retainer brand (same rule as Home's standing band).
  const boardBrand =
    profile.currentBrand ??
    [...profile.contracts].sort((a, b) => b.retainer - a.retainer)[0]?.brandSlug ??
    profile.brandSlugs[0] ??
    null;

  // Videos posted in the last 7 days (by GMV) — the "New (7)" toggle.
  const since7 = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

  // All one-round-trip RPCs (migrations 085/086) — rank deltas come back with
  // the leaderboard, so there's no second prior-window scan.
  const [rankings, standing, topGmvVideos, newVideos] = await Promise.all([
    getBrandRankings(boardBrand, window, profile.handles, 50).catch(() => []),
    getBrandStanding(profile.handles, boardBrand, window).catch(() => null),
    getInspirationVideos(boardBrand, window, 8).catch(() => []),
    getInspirationVideos(boardBrand, window, 8, since7).catch(() => []),
  ]);

  const brandDisplay = boardBrand
    ? profile.contracts.find((c) => c.brandSlug === boardBrand)?.brandDisplayName ?? boardBrand
    : null;

  return (
    <RankingsClient
      currentBrand={profile.currentBrand}
      boardBrandDisplay={brandDisplay}
      rangeLabel={rangeLabel}
      rankings={rankings}
      standing={standing}
      topGmvVideos={topGmvVideos}
      newVideos={newVideos}
      myHandles={profile.handles}
    />
  );
}
