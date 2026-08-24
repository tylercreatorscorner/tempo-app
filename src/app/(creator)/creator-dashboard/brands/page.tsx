import { redirect } from 'next/navigation';
import { getCreatorSession, getCurrentBrandCookie } from '@/lib/auth/creator-auth';
import {
  loadCreatorPortalProfile,
  getAllBrandsBreakdown,
  getBrandStanding,
  getUntappedAssignment,
  type BrandStanding,
} from '@/lib/data/creator-portal';
import { resolveCreatorRange } from '@/lib/creator/range';
import { BrandsClient } from './brands-client';

/**
 * "My Brands" — the every-brand view: all the creator's contracts at once (not
 * the one-brand switcher), each with retainer, pace, their own GMV, and their
 * slice of each brand's pie (brand GMV + share via get_brand_standing, one RPC
 * round-trip per brand, parallel). Deliberately ignores the brand cookie —
 * this page is the cross-brand rollup.
 */
export default async function MyBrandsPage({
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

  const [rows, standings, untapped] = await Promise.all([
    getAllBrandsBreakdown(profile.handles, profile.contracts, window),
    Promise.all(
      profile.contracts.map((c) =>
        getBrandStanding(profile.handles, c.brandSlug, window).catch(() => null),
      ),
    ),
    getUntappedAssignment(profile.handles, profile.contracts, window).catch(() => null),
  ]);

  const standingBySlug = new Map<string, BrandStanding>();
  profile.contracts.forEach((c, i) => {
    const s = standings[i];
    if (s) standingBySlug.set(c.brandSlug, s);
  });

  return (
    <BrandsClient
      realName={profile.realName}
      rangeLabel={rangeLabel}
      rows={rows}
      standings={Object.fromEntries(standingBySlug)}
      untapped={untapped}
    />
  );
}
