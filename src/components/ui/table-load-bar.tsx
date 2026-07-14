'use client';

interface TableLoadBarProps {
  /** Whether the bar is shown. Gate with useDelayedFlag(loading) to avoid flashing on fast loads. */
  active: boolean;
}

/**
 * Thin indeterminate progress bar for the top edge of a table/list card.
 *
 * Usage:
 *   const showBar = useDelayedFlag(loading);
 *   <div className="relative ...card...">
 *     <TableLoadBar active={showBar} />
 *     <div className={showBar && rows.length > 0 ? 'opacity-60 transition-opacity duration-200' : ''}>
 *       ...table...
 *     </div>
 *   </div>
 *
 * The parent must be `position: relative` (the bar pins to its top edge). Pair
 * with a 60% dim of the existing rows for clear refetch feedback.
 */
export function TableLoadBar({ active }: TableLoadBarProps) {
  if (!active) return null;
  return (
    <div className="absolute inset-x-0 top-0 z-10 h-[3px] overflow-hidden bg-primary/10/50">
      <div className="tlb-seg absolute inset-y-0 w-1/3 rounded-full bg-[#E91E8C]" />
      <style jsx global>{`
        @keyframes tlbSlide { 0% { left: -35%; } 100% { left: 100%; } }
        .tlb-seg { animation: tlbSlide 1.05s ease-in-out infinite; }
      `}</style>
    </div>
  );
}
