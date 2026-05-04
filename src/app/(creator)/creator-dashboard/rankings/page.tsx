import { redirect } from 'next/navigation';
import { getCreatorSession, getCurrentBrandCookie } from '@/lib/auth/creator-auth';
import {
  loadCreatorPortalProfile,
  getBrandRankings,
  dateWindow,
} from '@/lib/data/creator-portal';
import { RankingsClient } from './rankings-client';

export default async function RankingsPage({
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
  const priorWin = dateWindow(rangeDays, (() => {
    const d = new Date();
    d.setDate(d.getDate() - rangeDays);
    return d;
  })());

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
      rangeDays={rangeDays}
      rankings={decorated}
    />
  );
}

function parseRange(raw: string | undefined): number {
  const n = Number(raw);
  if ([7, 30, 90].includes(n)) return n;
  return 7;
}
