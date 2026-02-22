import { getBrandTopVideos, getDateRange } from '@/lib/data/creator';
import { getCreatorProfile } from '@/lib/data/creator-context';
import { DiscoverClient } from './discover-client';
import { redirect } from 'next/navigation';

export default async function DiscoverPage() {
  const profile = await getCreatorProfile();
  if (!profile) redirect('/creator-login');

  const brand = profile.current_brand ?? profile.brands[0] ?? '';
  const hot = getDateRange(14);
  const topEarners = getDateRange(30);

  const [hotVideos, earnerVideos] = await Promise.all([
    brand ? getBrandTopVideos(brand, hot.start, hot.end, 20).catch(() => []) : [],
    brand ? getBrandTopVideos(brand, topEarners.start, topEarners.end, 20).catch(() => []) : [],
  ]);

  return <DiscoverClient hotVideos={hotVideos} topEarnerVideos={earnerVideos} />;
}
