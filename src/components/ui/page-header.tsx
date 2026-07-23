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
        'text-[11px] font-bold uppercase tracking-[0.18em]',
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
  /** Stack until xl instead of lg — for pages whose actions cluster carries
   *  several controls (e.g. /posts: brand + scope + basis + range). At lg the
   *  cluster would crush the title column to one word per line. */
  wide?: boolean;
}

/** Standard page header: gradient eyebrow, display title, optional subtitle,
 *  and right-aligned actions. */
export function PageHeader({ eyebrow, title, subtitle, actions, className, wide }: PageHeaderProps) {
  return (
    // Stacks until lg (xl when `wide`) — a wide actions cluster (e.g. a
    // date-range pill bar) must not compete with the title for width and
    // clip it on mid widths.
    <div className={cn(
      'flex flex-col gap-3',
      wide ? 'xl:flex-row xl:items-end xl:justify-between' : 'lg:flex-row lg:items-end lg:justify-between',
      className,
    )}>
      <div className="min-w-0">
        {eyebrow && <Eyebrow gradient className="mb-1.5">{eyebrow}</Eyebrow>}
        <h1 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-[26px]">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-muted-foreground">{subtitle}</div>}
      </div>
      {actions && (
        <div className={cn(
          'flex flex-col items-start gap-1',
          wide ? 'xl:items-end xl:shrink-0' : 'lg:items-end lg:shrink-0',
        )}>
          {actions}
        </div>
      )}
    </div>
  );
}
