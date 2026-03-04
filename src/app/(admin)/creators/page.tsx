import { Suspense } from 'react';
import { getCreatorRankings } from '@/lib/data/rpc';
import { resolveDateRange } from '@/lib/data/date-utils';
import { aggregateCreatorsByRealName } from '@/lib/data/creator-aggregate';
import { classifyCreator } from '@/lib/data/creator-status';
import { DateRangePicker } from '@/components/dashboard/date-range-picker';
import { CreatorsClient } from '@/components/dashboard/creators-client';

const ALL_BRANDS = ['jiyu', 'catakor', 'physicians_choice'] as const;

interface Props {
  searchParams: Promise<{ range?: string; brand?: string }>;
}

export default async function CreatorsPage({ searchParams }: Props) {
  const params = await searchParams;
  const { startDate, endDate } = resolveDateRange(params.range);
  const brandFilter = params.brand && ALL_BRANDS.includes(params.brand as typeof ALL_BRANDS[number])
    ? params.brand : null;
  const BRANDS = brandFilter ? [brandFilter] as const : ALL_BRANDS;

  const allCreators = await Promise.all(
    BRANDS.map(async (brand) => {
      try {
        const data = await getCreatorRankings(brand, startDate, endDate, 500);
        return data.map((c) => ({ ...c, brand }));
      } catch {
        return [];
      }
    })
  ).then((r) => r.flat().sort((a, b) => (b.total_gmv ?? 0) - (a.total_gmv ?? 0)));

  // Group by real name
  const grouped = await aggregateCreatorsByRealName(allCreators);

  const creatorsForClient = grouped.map((g) => {
    const status = classifyCreator(g.total_videos);
    return {
      creator_name: g.display_name,
      handles: g.handles,
      total_gmv: g.total_gmv,
      total_orders: g.total_orders,
      total_items_sold: g.total_items_sold,
      days_active: g.days_active,
      total_videos: g.total_videos,
      brand: g.brand ?? '',
      managed_creator_id: g.managed_creator_id,
      status,
      isManaged: g.isManaged,
      retainer: g.retainer,
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{brandFilter ? `${({'jiyu': 'JiYu', 'catakor': 'Cata-Kor', 'physicians_choice': "Physician's Choice", 'toplux': 'Toplux'} as Record<string, string>)[brandFilter] ?? brandFilter} Creators` : 'Creators'}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {creatorsForClient.length} creators{brandFilter ? '' : ' across all brands'}
          </p>
        </div>
        <Suspense fallback={null}>
          <DateRangePicker />
        </Suspense>
      </div>

      <CreatorsClient creators={creatorsForClient} />
    </div>
  );
}
