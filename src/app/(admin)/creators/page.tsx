import { Suspense } from 'react';
import { getCreatorRankings } from '@/lib/data/rpc';
import { resolveDateRange } from '@/lib/data/date-utils';
import { DateRangePicker } from '@/components/dashboard/date-range-picker';
import { CreatorsClient } from '@/components/dashboard/creators-client';

const BRANDS = ['jiyu', 'catakor', 'physicians_choice', 'toplux'] as const;

interface Props {
  searchParams: Promise<{ range?: string }>;
}

export default async function CreatorsPage({ searchParams }: Props) {
  const params = await searchParams;
  const { startDate, endDate } = resolveDateRange(params.range);

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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Creators</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {allCreators.length} creators across all brands
          </p>
        </div>
        <Suspense fallback={null}>
          <DateRangePicker />
        </Suspense>
      </div>

      <CreatorsClient creators={allCreators} />
    </div>
  );
}
