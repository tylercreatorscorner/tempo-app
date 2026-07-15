import * as React from 'react';
import { cn } from '@/lib/utils';

/** Eyebrow / section label. `gradient` paints it with the accent sweep. */
export function Eyebrow({
  className,
  gradient,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement> & { gradient?: boolean }) {
  return (
    <p
      className={cn(
        'text-[11px] font-bold uppercase tracking-[0.16em]',
        gradient ? 'text-pulse-grad' : 'text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}

export interface PageHeaderProps {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

/** Standard page header: gradient eyebrow, display title, optional subtitle,
 *  and right-aligned actions. */
export function PageHeader({ eyebrow, title, subtitle, actions, className }: PageHeaderProps) {
  return (
    // Stacks until lg — a wide actions cluster (e.g. a date-range pill bar)
    // must not compete with the title for width and clip it on mid widths.
    <div className={cn('flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between', className)}>
      <div className="min-w-0">
        {eyebrow && <Eyebrow gradient className="mb-1.5">{eyebrow}</Eyebrow>}
        <h1 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-[25px]">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-muted-foreground">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-col items-start gap-1 lg:items-end lg:shrink-0">{actions}</div>}
    </div>
  );
}
