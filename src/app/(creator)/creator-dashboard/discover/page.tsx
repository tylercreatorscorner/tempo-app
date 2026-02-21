import { getBrandTopVideos, getDateRange } from '@/lib/data/creator';
import { DiscoverClient } from './discover-client';

const BRAND = 'creators_corner';

export default async function DiscoverPage() {
  const hot = getDateRange(14);
  const topEarners = getDateRange(30);

  const [hotVideos, earnerVideos] = await Promise.all([
    getBrandTopVideos(BRAND, hot.start, hot.end, 20).catch(() => []),
    getBrandTopVideos(BRAND, topEarners.start, topEarners.end, 20).catch(() => []),
  ]);

  return <DiscoverClient hotVideos={hotVideos} topEarnerVideos={earnerVideos} />;
}
