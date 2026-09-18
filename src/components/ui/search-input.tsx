import { Search } from 'lucide-react';
import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/** Compact desktop search; retain a comfortable touch target on coarse pointers. */
export const SearchInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <div className={cn('relative w-full sm:w-56', className)}>
    <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
    <input ref={ref} type="search" {...props} className="h-8 w-full rounded-lg border border-border bg-card py-1 pl-8 pr-2.5 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 [@media(pointer:coarse)]:h-11" />
  </div>,
);
SearchInput.displayName = 'SearchInput';
