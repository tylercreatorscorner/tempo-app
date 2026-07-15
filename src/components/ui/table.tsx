import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Data-table primitives matching the Pulse `.tablecard` / `table.data` spec:
 * uppercase muted headers on a subtle fill, right-aligned numeric cells
 * (first column left), row-hover, hairline dividers. Numeric columns get
 * tabular-nums for free.
 */
export function TableCard({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('overflow-hidden rounded-xl border border-border bg-card shadow-[var(--pulse-elev-2)]', className)}
      {...props}
    />
  );
}

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return <table className={cn('w-full border-collapse', className)} {...props} />;
}

export function THead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={className} {...props} />;
}

export function TBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={className} {...props} />;
}

export function TR({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn('transition-colors', className)} {...props} />;
}

export function TH({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        'border-b border-border bg-secondary px-4 py-3 text-[10.5px] font-bold uppercase tracking-[0.07em] text-muted-foreground text-right first:text-left',
        className,
      )}
      {...props}
    />
  );
}

export function TD({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={cn(
        'border-b border-border px-4 py-3 text-[13.5px] text-muted-foreground text-right first:text-left tabular-nums',
        className,
      )}
      {...props}
    />
  );
}

/** Rounded-square gradient/brand avatar for a table row's identity cell. */
export interface DataAvatarProps extends React.HTMLAttributes<HTMLSpanElement> {
  color?: string;
}
export function DataAvatar({ color, className, children, style, ...props }: DataAvatarProps) {
  return (
    <span
      className={cn(
        'grid h-8 w-8 shrink-0 place-items-center rounded-[9px] text-xs font-bold text-white',
        !color && 'bg-pulse-grad',
        className,
      )}
      style={{ ...(color ? { backgroundColor: color } : {}), ...style }}
      {...props}
    >
      {children}
    </span>
  );
}
