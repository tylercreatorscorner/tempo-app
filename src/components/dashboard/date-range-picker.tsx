'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { DATE_PRESETS, type DatePreset } from '@/lib/data/date-utils';
import { cn } from '@/lib/utils';

export function DateRangePicker() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = (searchParams.get('range') as DatePreset) || 'last7';

  function select(preset: DatePreset) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('range', preset);
    router.push(`?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap gap-1.5 bg-muted/30 p-1 rounded-full border border-border">
      {DATE_PRESETS.map((p) => (
        <button
          key={p.value}
          onClick={() => select(p.value)}
          className={cn(
            'px-3.5 py-1.5 text-sm rounded-full transition-all duration-200 font-medium',
            current === p.value
              ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/20'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
          )}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
