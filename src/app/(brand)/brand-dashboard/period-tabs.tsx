'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { PERIOD_LABELS, type BrandPortalPeriod } from '@/lib/data/brand-portal-periods';

const PERIOD_ORDER: BrandPortalPeriod[] = ['yesterday', '7d', '30d', 'this_month', 'last_month'];

interface Props {
  current: BrandPortalPeriod;
  accentColor: string;
}

export function PeriodTabs({ current, accentColor }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setPeriod(period: BrandPortalPeriod) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('period', period);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="inline-flex bg-white border border-border rounded-lg p-0.5 shadow-sm flex-wrap">
      {PERIOD_ORDER.map((p) => {
        const active = current === p;
        return (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={cn(
              'px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap',
              active ? '' : 'text-gray-500 hover:text-gray-900',
            )}
            style={
              active
                ? { backgroundColor: `${accentColor}14`, color: accentColor }
                : undefined
            }
          >
            {PERIOD_LABELS[p]}
          </button>
        );
      })}
    </div>
  );
}
