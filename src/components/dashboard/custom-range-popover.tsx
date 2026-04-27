'use client';

import { useState, useEffect, useRef } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths, isSameDay, isAfter, isBefore, isSameMonth, parseISO, isValid } from 'date-fns';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  initialStart?: string | null;
  initialEnd?: string | null;
  onApply: (start: string, end: string) => void;
  onClose: () => void;
  /** Don't allow selecting dates after this (defaults to yesterday — data is always delayed). */
  maxDate?: Date;
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

/**
 * Compact two-month custom range picker. Click once to set the start, again to set the end.
 * Hover preview between clicks. Esc and outside-click both dismiss.
 */
export function CustomRangePopover({ initialStart, initialEnd, onApply, onClose, maxDate }: Props) {
  // Default to yesterday since data is always one day delayed
  const yesterday = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    d.setHours(0, 0, 0, 0);
    return d;
  })();
  const max = maxDate ?? yesterday;

  // Anchor the visible month: start of the month containing the existing start, else current month
  const seedDate = initialStart && isValid(parseISO(initialStart)) ? parseISO(initialStart) : new Date();
  const [anchor, setAnchor] = useState(() => startOfMonth(seedDate));

  // Selection state
  const [start, setStart] = useState<Date | null>(initialStart && isValid(parseISO(initialStart)) ? parseISO(initialStart) : null);
  const [end, setEnd]     = useState<Date | null>(initialEnd && isValid(parseISO(initialEnd)) ? parseISO(initialEnd) : null);
  const [hover, setHover] = useState<Date | null>(null);

  const ref = useRef<HTMLDivElement>(null);

  // Close on click-outside or Esc
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  function handleDayClick(day: Date) {
    if (isAfter(day, max)) return; // clamp to max date
    if (!start || (start && end)) {
      setStart(day);
      setEnd(null);
      setHover(null);
    } else {
      // Second click — set end (swap if user clicked an earlier day)
      if (isBefore(day, start)) {
        setEnd(start);
        setStart(day);
      } else {
        setEnd(day);
      }
    }
  }

  function inRange(day: Date): boolean {
    if (!start) return false;
    if (start && end) return !isBefore(day, start) && !isAfter(day, end);
    if (start && hover) {
      const lo = isBefore(hover, start) ? hover : start;
      const hi = isBefore(hover, start) ? start : hover;
      return !isBefore(day, lo) && !isAfter(day, hi);
    }
    return false;
  }

  const months = [anchor, addMonths(anchor, 1)];
  const canApply = start !== null && end !== null;

  const renderMonth = (month: Date) => {
    const monthStart = startOfMonth(month);
    const monthEnd   = endOfMonth(month);
    const days       = eachDayOfInterval({ start: monthStart, end: monthEnd });
    // Pad leading blanks to align with weekday columns
    const leadingBlanks = monthStart.getDay();
    const cells: Array<Date | null> = [...Array(leadingBlanks).fill(null), ...days];

    return (
      <div key={month.toISOString()} className="flex-1 min-w-[220px]">
        <div className="text-center text-xs font-bold text-[#1A1B3A] mb-2">
          {format(month, 'MMMM yyyy')}
        </div>
        <div className="grid grid-cols-7 gap-0.5 text-[10px] text-gray-400 font-medium mb-1">
          {WEEKDAYS.map((w) => (
            <div key={w} className="h-6 flex items-center justify-center">{w}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {cells.map((day, i) => {
            if (!day) return <div key={`b-${i}`} />;
            const disabled = isAfter(day, max);
            const isStart  = start && isSameDay(day, start);
            const isEnd    = end && isSameDay(day, end);
            const inSel    = inRange(day);
            const sameMo   = isSameMonth(day, month);
            return (
              <button
                key={day.toISOString()}
                disabled={disabled || !sameMo}
                onClick={() => handleDayClick(day)}
                onMouseEnter={() => setHover(day)}
                className={cn(
                  'h-7 w-full rounded-md text-xs font-medium transition-colors',
                  disabled && 'text-gray-300 cursor-not-allowed',
                  !disabled && !inSel && !isStart && !isEnd && 'text-gray-700 hover:bg-gray-100',
                  inSel && !isStart && !isEnd && 'bg-pink-50 text-[#E91E8C]',
                  (isStart || isEnd) && 'bg-[#E91E8C] text-white',
                )}
              >
                {day.getDate()}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full mt-2 z-50 w-[480px] max-w-[calc(100vw-32px)] bg-white rounded-2xl border border-gray-200 shadow-xl p-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => setAnchor(subMonths(anchor, 1))}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="text-xs text-gray-500">
          {start && !end && <>Pick an end date</>}
          {start && end && (
            <>
              <span className="font-semibold text-[#1A1B3A]">{format(start, 'MMM d, yyyy')}</span>
              <span className="mx-1.5 text-gray-300">→</span>
              <span className="font-semibold text-[#1A1B3A]">{format(end, 'MMM d, yyyy')}</span>
            </>
          )}
          {!start && <>Pick a start date</>}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setAnchor(addMonths(anchor, 1))}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Two-month grid */}
      <div className="flex gap-4">
        {months.map(renderMonth)}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
        <button
          onClick={() => { setStart(null); setEnd(null); setHover(null); }}
          className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
        >
          Clear
        </button>
        <button
          onClick={() => {
            if (canApply && start && end) {
              onApply(format(start, 'yyyy-MM-dd'), format(end, 'yyyy-MM-dd'));
            }
          }}
          disabled={!canApply}
          className="px-4 py-2 rounded-xl bg-[#E91E8C] text-white text-xs font-semibold hover:bg-[#d1177d] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Apply
        </button>
      </div>
    </div>
  );
}
