import { redirect } from 'next/navigation';
import { getCreatorSession, getCurrentBrandCookie } from '@/lib/auth/creator-auth';
import {
  loadCreatorPortalProfile,
  getCreatorSummary,
  getCreatorStreak,
  getCreatorTopVideos,
  getInspirationVideos,
  getMonthVideoCount,
  buildCoachingNudge,
  dateWindow,
} from '@/lib/data/creator-portal';
import { HomeClient } from './home-client';
import { parseRange } from '@/lib/creator/range';

export default async function CreatorHomePage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const session = await getCreatorSession();
  if (!session) redirect('/creator-login');

  const brandCookie = await getCurrentBrandCookie();
  const profile = await loadCreatorPortalProfile(String(session.creatorId), brandCookie);
  if (!profile) redirect('/creator-login');

  // Home defaults to a 30-day window (representative recent activity, aligned with
  // the monthly retainer) plus a lifetime GMV headline — a 7-day default made big
  // creators with a slow week read as ~$0, which looks broken and is demoralizing.
  // A period selector (?range=) lets the creator widen/narrow it, like the admin.
  const rangeDays = parseRange((await searchParams).range, 30);
  const window = dateWindow(rangeDays);
  const monthlyTarget = profile.contracts
    .filter((c) => !profile.currentBrand || c.brandSlug === profile.currentBrand)
    .reduce((sum, c) => sum + (c.monthlyPostRequirement || 0), 0);

  const [summary, streak, topVideos, inspiration, monthVideos, lifetime] = await Promise.all([
    getCreatorSummary(profile.handles, profile.currentBrand, window).catch(() => null),
    getCreatorStreak(profile.handles, profile.currentBrand).catch(() => 0),
    getCreatorTopVideos(profile.handles, profile.currentBrand, window, 6).catch(() => []),
    getInspirationVideos(profile.currentBrand, window, 6).catch(() => []),
    getMonthVideoCount(profile.handles, profile.currentBrand).catch(() => 0),
    getCreatorSummary(profile.handles, profile.currentBrand, dateWindow(3650)).catch(() => null),
  ]);
  const lifetimeGmv = lifetime ? lifetime.totalGmv : null;

  const daysLeftInMonth = (() => {
    const now = new Date();
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return Math.max(0, lastDay - now.getDate());
  })();

  const nudge = summary
    ? buildCoachingNudge({
        monthVideos,
        monthlyTarget,
        streak,
        topVideo: topVideos[0] ?? null,
        summary,
        daysLeftInMonth,
      })
    : null;

  const currentContract = profile.currentBrand
    ? profile.contracts.find((c) => c.brandSlug === profile.currentBrand) ?? null
    : null;

  return (
    <HomeClient
      realName={profile.realName}
      handles={profile.handles}
      currentBrand={profile.currentBrand}
      currentBrandDisplay={currentContract?.brandDisplayName ?? null}
      rangeDays={rangeDays}
      summary={summary}
      lifetimeGmv={lifetimeGmv}
      streak={streak}
      monthVideos={monthVideos}
      monthlyTarget={monthlyTarget}
      daysLeftInMonth={daysLeftInMonth}
      topVideos={topVideos}
      inspiration={inspiration}
      nudge={nudge}
    />
  );
}
