import { getCreatorRankingsData, getDateRange } from '@/lib/data/creator';
import { RankingsClient } from './rankings-client';

const CREATOR_NAME = 'testcreator';
const BRAND = 'creators_corner';

export default async function RankingsPage() {
  const { start, end } = getDateRange(7);
  const rankings = await getCreatorRankingsData(BRAND, start, end, 50).catch(() => []);

  return <RankingsClient rankings={rankings} creatorName={CREATOR_NAME} />;
}
