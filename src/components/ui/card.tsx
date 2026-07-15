import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Pulse Card — the section container. 16px radius, hairline border, elev-2
 * shadow (per the Pulse design system). Unpadded by default so headers can sit
 * flush; compose with CardHeader / CardContent, or pass p-5 for a simple box.
 */
export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('rounded-xl border border-border bg-card shadow-[var(--pulse-elev-2)]', className)}
      {...props}
    />
  ),
);
Card.displayName = 'Card';

export const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center justify-between gap-3 px-5 py-4', className)} {...props} />
  ),
);
CardHeader.displayName = 'CardHeader';

export const CardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement> & { eyebrow?: boolean }
>(({ className, eyebrow, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      eyebrow
        // Small uppercase section label (the Pulse `.ct` header style).
        ? 'text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground'
        : 'text-base font-bold tracking-tight text-foreground',
      className,
    )}
    {...props}
  />
));
CardTitle.displayName = 'CardTitle';

export const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
  ),
);
CardDescription.displayName = 'CardDescription';

export const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('px-5 pb-5', className)} {...props} />
  ),
);
CardContent.displayName = 'CardContent';
