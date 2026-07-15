import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Status pill. Semantic variants map to the Pulse pos/neg/warn token pairs so
 * the tint + text stay legible in both themes. Pass `dot` for a leading dot.
 */
export const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full font-bold leading-none whitespace-nowrap',
  {
    variants: {
      variant: {
        positive: 'bg-[var(--pulse-pos-bg)] text-[var(--pulse-pos)]',
        warning: 'bg-[var(--pulse-warn-bg)] text-[var(--pulse-warn)]',
        negative: 'bg-[var(--pulse-neg-bg)] text-[var(--pulse-neg)]',
        neutral: 'bg-secondary text-muted-foreground',
        accent: 'bg-primary/10 text-primary',
      },
      size: {
        sm: 'text-[10px] px-2 py-0.5',
        md: 'text-[11.5px] px-2.5 py-1',
      },
    },
    defaultVariants: { variant: 'neutral', size: 'md' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  dot?: boolean;
}

export function Badge({ className, variant, size, dot, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant, size }), className)} {...props}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

/** Gradient "New"-style tag — the signature accent sweep, tiny + uppercase. */
export function Tag({ className, children, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full bg-pulse-grad text-white text-[9.5px] font-extrabold uppercase tracking-[0.08em] px-2 py-0.5 leading-none',
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
