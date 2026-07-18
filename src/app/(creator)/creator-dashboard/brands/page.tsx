import { redirect } from 'next/navigation';
import { getCreatorSession, getCurrentBrandCookie } from '@/lib/auth/creator-auth';
import {
  loadCreatorPortalProfile,
  getAllBrandsBreakdown,
  dateWindow,
} from '@/lib/data/creator-portal';
import { BrandsClient } from './brands-client';

/**
 * "My Brands" — the every-brand view a creator asked for: all their contracts at
 * once (not the one-brand switcher), each with retainer, posts this month, and GMV.
 * Deliberately ignores the brand cookie — this page is the cross-brand rollup.
 */
export default async function MyBrandsPage() {
  const session = await getCreatorSession();
  if (!session) redirect('/creator-login');

  const brandCookie = await getCurrentBrandCookie();
  const profile = await loadCreatorPortalProfile(String(session.creatorId), brandCookie);
  if (!profile) redirect('/creator-login');

  const rows = await getAllBrandsBreakdown(profile.handles, profile.contracts, dateWindow(30));

  return <BrandsClient realName={profile.realName} rows={rows} />;
}
