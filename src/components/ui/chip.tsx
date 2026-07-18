import * as React from 'react';
import { cn } from '@/lib/utils';

/** Filter / brand chip. `dotColor` renders a small square brand swatch. */
export interface ChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  dotColor?: string;
}

export function Chip({ className, dotColor, children, ...props }: ChipProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md text-xs font-semibold text-foreground bg-secondary border border-border px-3 py-1',
        className,
      )}
      {...props}
    >
      {dotColor && <span className="h-2 w-2 rounded-[3px] shrink-0" style={{ backgroundColor: dotColor }} />}
      {children}
    </span>
  );
}
