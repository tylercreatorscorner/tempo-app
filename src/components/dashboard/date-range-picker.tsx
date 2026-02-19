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
    <div className="flex flex-wrap gap-1 bg-white/[0.04] backdrop-blur-xl p-1 rounded-full border border-white/[0.08] shadow-[0_2px_12px_rgba(0,0,0,0.2)]">
      {DATE_PRESETS.map((p) => (
        <button
          key={p.value}
          onClick={() => select(p.value)}
          className={cn(
            'px-3.5 py-1.5 text-sm rounded-full transition-all duration-300 font-medium',
            current === p.value
              ? 'bg-gradient-to-r from-primary to-primary/80 text-primary-foreground shadow-[0_2px_12px_rgba(233,30,140,0.3)]'
              : 'text-muted-foreground/70 hover:text-foreground hover:bg-white/[0.08]'
          )}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
