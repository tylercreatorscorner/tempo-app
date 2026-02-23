import { Suspense } from 'react';
import { getCreatorRankings } from '@/lib/data/rpc';
import { resolveDateRange } from '@/lib/data/date-utils';
import { aggregateCreatorsByRealName } from '@/lib/data/creator-aggregate';
import { classifyCreator, computeBrandGmvThresholds } from '@/lib/data/creator-status';
import { DateRangePicker } from '@/components/dashboard/date-range-picker';
import { CreatorsClient } from '@/components/dashboard/creators-client';
import { format, subDays, differenceInDays } from 'date-fns';

const BRANDS = ['jiyu', 'catakor', 'physicians_choice', 'toplux'] as const;

interface Props {
  searchParams: Promise<{ range?: string }>;
}

export default async function CreatorsPage({ searchParams }: Props) {
  const params = await searchParams;
  const { startDate, endDate } = resolveDateRange(params.range);

  // Calculate previous period
  const start = new Date(startDate);
  const end = new Date(endDate);
  const periodLength = differenceInDays(end, start) + 1;
  const prevEnd = subDays(start, 1);
  const prevStart = subDays(prevEnd, periodLength - 1);
  const prevStartDate = format(prevStart, 'yyyy-MM-dd');
  const prevEndDate = format(prevEnd, 'yyyy-MM-dd');

  const [allCreators, prevCreators] = await Promise.all([
    Promise.all(
      BRANDS.map(async (brand) => {
        try {
          const data = await getCreatorRankings(brand, startDate, endDate, 500);
          return data.map((c) => ({ ...c, brand }));
        } catch {
          return [];
        }
      })
    ).then((r) => r.flat().sort((a, b) => (b.total_gmv ?? 0) - (a.total_gmv ?? 0))),
    Promise.all(
      BRANDS.map(async (brand) => {
        try {
          const data = await getCreatorRankings(brand, prevStartDate, prevEndDate, 500);
          return data.map((c) => ({ ...c, brand }));
        } catch {
          return [];
        }
      })
    ).then((r) => r.flat()),
  ]);

  // Group by real name
  const grouped = await aggregateCreatorsByRealName(allCreators);

  // Build prev period GMV lookup
  const prevGmvMap = new Map<string, number>();
  for (const c of prevCreators) {
    const key = c.creator_name.toLowerCase();
    prevGmvMap.set(key, (prevGmvMap.get(key) ?? 0) + (c.total_gmv ?? 0));
  }

  const brandThresholds = computeBrandGmvThresholds(allCreators);

  const creatorsForClient = grouped.map((g) => {
    const prevGmv = g.handles.reduce((sum, h) => sum + (prevGmvMap.get(h.toLowerCase()) ?? 0), 0);
    const status = classifyCreator(
      { total_videos: g.total_videos, total_gmv: g.total_gmv, days_active: g.days_active, prev_gmv: prevGmv, brand: g.brand },
      brandThresholds,
    );
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
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Creators</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {creatorsForClient.length} creators across all brands
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
