import { redirect } from 'next/navigation';
import { getCreatorSession, getCurrentBrandCookie } from '@/lib/auth/creator-auth';
import { loadCreatorPortalProfile, getBrandRankings } from '@/lib/data/creator-portal';
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

  const { window, rangeLabel } = resolveCreatorRange(await searchParams);
  // Prior equal-length window immediately before, for the ↑↓ rank deltas.
  const priorWin = (() => {
    const DAY = 86400000;
    const s = new Date(window.start + 'T00:00:00Z').getTime();
    const e = new Date(window.end + 'T00:00:00Z').getTime();
    const len = Math.round((e - s) / DAY) + 1;
    const priorEnd = s - DAY;
    const priorStart = priorEnd - (len - 1) * DAY;
    return {
      start: new Date(priorStart).toISOString().slice(0, 10),
      end: new Date(priorEnd).toISOString().slice(0, 10),
    };
  })();

  const [current, prior] = await Promise.all([
    getBrandRankings(profile.currentBrand, window, profile.handles, 50).catch(() => []),
    getBrandRankings(profile.currentBrand, priorWin, profile.handles, 200).catch(() => []),
  ]);

  // Merge prior ranks into current entries for ↑↓ deltas.
  const priorRankByUser = new Map(prior.map((r) => [r.tiktokUsername, r.rank]));
  const decorated = current.map((r) => ({
    ...r,
    priorRank: priorRankByUser.get(r.tiktokUsername) ?? null,
  }));

  return (
    <RankingsClient
      currentBrand={profile.currentBrand}
      currentBrandDisplay={
        profile.currentBrand
          ? profile.contracts.find((c) => c.brandSlug === profile.currentBrand)?.brandDisplayName ?? profile.currentBrand
          : null
      }
      rangeLabel={rangeLabel}
      rankings={decorated}
    />
  );
}
