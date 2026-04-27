'use client';

import { useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Calendar } from 'lucide-react';
import { DATE_PRESETS, type DatePreset } from '@/lib/data/date-utils';
import { CustomRangePopover } from './custom-range-popover';
import { cn } from '@/lib/utils';

export function DateRangePicker() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [pickerOpen, setPickerOpen] = useState(false);

  const current      = (searchParams.get('range') as DatePreset) || 'last7';
  const customStart  = searchParams.get('start');
  const customEnd    = searchParams.get('end');
  const isCustom     = current === 'custom' && !!customStart && !!customEnd;

  function selectPreset(preset: DatePreset) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('range', preset);
    params.delete('start');
    params.delete('end');
    startTransition(() => router.push(`?${params.toString()}`));
  }

  function applyCustom(start: string, end: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('range', 'custom');
    params.set('start', start);
    params.set('end', end);
    setPickerOpen(false);
    startTransition(() => router.push(`?${params.toString()}`));
  }

  // Short label for the custom button when a custom range is active
  const customLabel = (() => {
    if (!isCustom || !customStart || !customEnd) return 'Custom';
    const fmt = (s: string) => {
      const [y, m, d] = s.split('-');
      return `${parseInt(m)}/${parseInt(d)}/${y.slice(2)}`;
    };
    return `${fmt(customStart)} – ${fmt(customEnd)}`;
  })();

  return (
    <div className="relative">
      <div
        className={cn(
          'flex flex-wrap gap-1 bg-white p-1 rounded-full border border-gray-200 shadow-sm transition-opacity',
          isPending && 'opacity-70 pointer-events-none'
        )}
      >
        {DATE_PRESETS.map((p) => {
          const isActive = !isCustom && current === p.value;
          return (
            <button
              key={p.value}
              onClick={() => selectPreset(p.value)}
              disabled={isPending}
              className={cn(
                'relative px-3.5 py-1.5 text-sm rounded-full transition-all duration-200 font-medium',
                isActive
                  ? 'bg-gradient-to-r from-[#FF4D8D] to-[#7C5CFC] text-white shadow-md'
                  : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
              )}
            >
              {p.label}
              {isActive && isPending && (
                <span className="absolute inset-0 flex items-center justify-center rounded-full bg-white/20">
                  <span className="h-3 w-3 rounded-full border-2 border-white border-t-transparent animate-spin" />
                </span>
              )}
            </button>
          );
        })}

        {/* Custom range trigger */}
        <button
          onClick={() => setPickerOpen((o) => !o)}
          disabled={isPending}
          className={cn(
            'flex items-center gap-1.5 px-3.5 py-1.5 text-sm rounded-full transition-all duration-200 font-medium',
            isCustom
              ? 'bg-gradient-to-r from-[#FF4D8D] to-[#7C5CFC] text-white shadow-md'
              : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
          )}
        >
          <Calendar className="h-3.5 w-3.5" />
          {customLabel}
        </button>
      </div>

      {pickerOpen && (
        <CustomRangePopover
          initialStart={customStart}
          initialEnd={customEnd}
          onApply={applyCustom}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}
