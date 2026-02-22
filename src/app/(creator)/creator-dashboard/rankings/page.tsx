import { getCreatorRankingsData, getDateRange } from '@/lib/data/creator';
import { getCreatorProfile, getCreatorUsernames } from '@/lib/data/creator-context';
import { RankingsClient } from './rankings-client';
import { redirect } from 'next/navigation';

export default async function RankingsPage() {
  const profile = await getCreatorProfile();
  if (!profile) redirect('/creator-login');

  const usernames = getCreatorUsernames(profile, profile.current_brand);
  const primaryUsername = usernames[0] ?? '';
  const brand = profile.current_brand ?? profile.brands[0] ?? '';
  const { start, end } = getDateRange(7);

  const rankings = brand
    ? await getCreatorRankingsData(brand, start, end, 50).catch(() => [])
    : [];

  return <RankingsClient rankings={rankings} creatorName={primaryUsername} />;
}
