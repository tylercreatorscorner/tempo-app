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
    <div className="flex flex-wrap gap-1 bg-white p-1 rounded-full border border-gray-200 shadow-sm">
      {DATE_PRESETS.map((p) => (
        <button
          key={p.value}
          onClick={() => select(p.value)}
          className={cn(
            'px-3.5 py-1.5 text-sm rounded-full transition-all duration-300 font-medium',
            current === p.value
              ? 'bg-gradient-to-r from-[#FF4D8D] to-[#7C5CFC] text-white shadow-md'
              : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
          )}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
