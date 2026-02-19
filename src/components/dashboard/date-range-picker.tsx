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
    <div className="flex flex-wrap gap-2">
      {DATE_PRESETS.map((p) => (
        <button
          key={p.value}
          onClick={() => select(p.value)}
          className={cn(
            'px-3 py-1.5 text-sm rounded-md border transition-colors',
            current === p.value
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-card border-border text-muted-foreground hover:text-foreground hover:border-foreground/20'
          )}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
