import * as React from 'react';
import { cn } from '@/lib/utils';

/** Uppercase micro-label for form fields (matches the Pulse `.field label`). */
export const Label = React.forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => (
    <label
      ref={ref}
      className={cn('block text-[11.5px] font-semibold tracking-[0.02em] uppercase text-muted-foreground mb-1.5', className)}
      {...props}
    />
  ),
);
Label.displayName = 'Label';
