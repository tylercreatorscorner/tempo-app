import { redirect } from 'next/navigation';
import { getCreatorSession, getCurrentBrandCookie } from '@/lib/auth/creator-auth';
import {
  loadCreatorPortalProfile,
  getCreatorSummary,
  getCreatorLifetimeGmv,
  getCreatorStreak,
  getCreatorTopVideos,
  getCreatorTopProducts,
  getCreatorDailySeries,
  getInspirationVideos,
  getMonthVideoCount,
  getBrandStanding,
  buildActionStack,
  type BrandBreakdownRow,
  type RankChase,
} from '@/lib/data/creator-portal';
import { resolveCreatorRange } from '@/lib/creator/range';
import { HomeClient } from './home-client';

export default async function CreatorHomePage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; start?: string; end?: string }>;
}) {
  const session = await getCreatorSession();
  if (!session) redirect('/creator-login');

  const brandCookie = await getCurrentBrandCookie();
  const profile = await loadCreatorPortalProfile(String(session.creatorId), brandCookie);
  if (!profile) redirect('/creator-login');

  // Same date system as the admin (presets + custom range), defaulting to 30 days.
  const { window, rangeLabel } = resolveCreatorRange(await searchParams);

  const activeContracts = profile.contracts.filter(
    (c) => !profile.currentBrand || c.brandSlug === profile.currentBrand,
  );
  const monthlyTarget = activeContracts.reduce((s, c) => s + (c.monthlyPostRequirement || 0), 0);
  const retainerTotal = activeContracts.reduce((s, c) => s + (c.retainer || 0), 0);
  // Only the CONTRACTED brands feed the retainer-pace actions (kept light — one
  // month-count each — vs the full per-brand breakdown, so Home stays fast).
  const contractedBrands = activeContracts.filter(
    (c) => c.retainer > 0 && c.monthlyPostRequirement > 0,
  );
  // Rank chase runs for the selected brand, else the creator's top-retainer brand.
  const chaseBrand =
    profile.currentBrand ??
    [...activeContracts].sort((a, b) => b.retainer - a.retainer)[0]?.brandSlug ??
    profile.brandSlugs[0] ??
    null;

  const [summary, streak, topVideos, topProducts, inspiration, monthVideos, lifetimeGmv, dailySeries, brandStanding, contractedPosts] =
    await Promise.all([
      getCreatorSummary(profile.handles, profile.currentBrand, window).catch(() => null),
      getCreatorStreak(profile.handles, profile.currentBrand).catch(() => 0),
      getCreatorTopVideos(profile.handles, profile.currentBrand, window, 6).catch(() => []),
      getCreatorTopProducts(profile.handles, profile.currentBrand, window, 5).catch(() => []),
      getInspirationVideos(profile.currentBrand, window, 6).catch(() => []),
      getMonthVideoCount(profile.handles, profile.currentBrand).catch(() => 0),
      getCreatorLifetimeGmv(profile.handles, profile.currentBrand).catch(() => null),
      getCreatorDailySeries(profile.handles, profile.currentBrand, window).catch(() => []),
      chaseBrand
        ? getBrandStanding(profile.handles, chaseBrand, window).catch(() => null)
        : Promise.resolve(null),
      Promise.all(
        contractedBrands.map((c) => getMonthVideoCount(profile.handles, c.brandSlug).catch(() => null)),
      ),
    ]);

  // Rank-chase input for the action stack is derived from the (already-fetched)
  // brand standing — one brand scan feeds both the ladder and the "catch up" move.
  const rankChase: RankChase | null = brandStanding
    ? {
        brandSlug: chaseBrand,
        myRank: brandStanding.myRank,
        total: brandStanding.creatorCount,
        gmv: brandStanding.myGmv,
        above: brandStanding.above
          ? { name: brandStanding.above.name, gmv: brandStanding.above.gmv, gap: brandStanding.above.gap }
          : null,
      }
    : null;

  const paceRows: BrandBreakdownRow[] = contractedBrands.map((c, i) => ({
    brandSlug: c.brandSlug,
    brandDisplayName: c.brandDisplayName,
    brandColor: c.brandColor,
    retainer: c.retainer,
    monthlyPostRequirement: c.monthlyPostRequirement,
    postsThisMonth: contractedPosts[i],
    gmv: null,
    orders: null,
  }));

  const daysLeftInMonth = (() => {
    const now = new Date();
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return Math.max(0, lastDay - now.getDate());
  })();

  const actions = summary
    ? buildActionStack({
        monthVideos,
        monthlyTarget,
        streak,
        topVideo: topVideos[0] ?? null,
        summary,
        daysLeftInMonth,
        brands: paceRows,
        rankChase,
      })
    : [];

  const currentContract = profile.currentBrand
    ? profile.contracts.find((c) => c.brandSlug === profile.currentBrand) ?? null
    : null;

  return (
    <HomeClient
      realName={profile.realName}
      handles={profile.handles}
      currentBrand={profile.currentBrand}
      currentBrandDisplay={currentContract?.brandDisplayName ?? null}
      rangeLabel={rangeLabel}
      summary={summary}
      lifetimeGmv={lifetimeGmv}
      retainerTotal={retainerTotal}
      streak={streak}
      monthVideos={monthVideos}
      monthlyTarget={monthlyTarget}
      daysLeftInMonth={daysLeftInMonth}
      topVideos={topVideos}
      topProducts={topProducts}
      inspiration={inspiration}
      actions={actions}
      dailySeries={dailySeries}
      brandStanding={brandStanding}
      chaseBrandLabel={
        activeContracts.find((c) => c.brandSlug === chaseBrand)?.brandDisplayName ?? null
      }
    />
  );
}
