import * as React from 'react';
import { cn } from '@/lib/utils';

const base =
  'w-full rounded-[var(--workspace-control-radius,8px)] border border-input bg-card text-foreground text-[13px] ' +
  'placeholder:text-muted-foreground/70 transition-[border-color,box-shadow] duration-150 ' +
  'focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25 ' +
  'disabled:opacity-50 disabled:cursor-not-allowed';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(base, 'min-h-[var(--workspace-control-height,38px)] px-3 py-2 [@media(pointer:coarse)]:min-h-11', className)} {...props} />
  ),
);
Input.displayName = 'Input';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea ref={ref} className={cn(base, 'px-3 py-2.5 min-h-[80px] resize-y', className)} {...props} />
  ),
);
Textarea.displayName = 'Textarea';
