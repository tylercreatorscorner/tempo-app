'use client';

import { useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { DATE_PRESETS, type DatePreset } from '@/lib/data/date-utils';
import { cn } from '@/lib/utils';

export function DateRangePicker() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const current = (searchParams.get('range') as DatePreset) || 'last7';

  function select(preset: DatePreset) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('range', preset);
    startTransition(() => {
      router.push(`?${params.toString()}`);
    });
  }

  return (
    <div
      className={cn(
        'flex flex-wrap gap-1 bg-white p-1 rounded-full border border-gray-200 shadow-sm transition-opacity',
        isPending && 'opacity-70 pointer-events-none'
      )}
    >
      {DATE_PRESETS.map((p) => {
        const isCurrent = current === p.value;
        return (
          <button
            key={p.value}
            onClick={() => select(p.value)}
            disabled={isPending}
            className={cn(
              'relative px-3.5 py-1.5 text-sm rounded-full transition-all duration-200 font-medium',
              isCurrent
                ? 'bg-gradient-to-r from-[#FF4D8D] to-[#7C5CFC] text-white shadow-md'
                : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
            )}
          >
            {p.label}
            {isCurrent && isPending && (
              <span className="absolute inset-0 flex items-center justify-center rounded-full bg-white/20">
                <span className="h-3 w-3 rounded-full border-2 border-white border-t-transparent animate-spin" />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
