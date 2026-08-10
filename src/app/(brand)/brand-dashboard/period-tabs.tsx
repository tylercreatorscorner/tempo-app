'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { PERIOD_LABELS, type BrandPortalPeriod } from '@/lib/data/brand-portal-periods';
import { readableOn } from '@/lib/utils/brand-color';

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
    <div className="inline-flex bg-card border border-border rounded-lg p-0.5 shadow-sm flex-wrap">
      {PERIOD_ORDER.map((p) => {
        const active = current === p;
        return (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={cn(
              'px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap',
              active ? '' : 'text-muted-foreground hover:text-foreground',
            )}
            style={
              active
                ? { backgroundColor: `${accentColor}14`, color: readableOn(accentColor) }
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
