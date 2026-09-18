import { Search, X } from 'lucide-react';
import { forwardRef, useImperativeHandle, useRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type SearchInputProps = InputHTMLAttributes<HTMLInputElement> & { onClear?: () => void };
/** Compact desktop search with an explicit keyboard/touch-accessible clear action. */
export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  ({ className, onClear, ...props }, ref) => {
    const input = useRef<HTMLInputElement>(null);
    useImperativeHandle(ref, () => input.current!);
    const canClear = Boolean(onClear && String(props.value ?? '').length && !props.disabled && !props.readOnly);
    return <div className={cn('relative w-full sm:w-56', className)}>
      <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <input ref={input} type="search" {...props} className="h-8 w-full rounded-lg border border-border bg-card py-1 pl-8 pr-9 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 [&::-webkit-search-cancel-button]:appearance-none [@media(pointer:coarse)]:h-11" />
      {canClear && <button type="button" aria-label="Clear search" onClick={() => { onClear?.(); input.current?.focus(); }} className="absolute inset-y-0 right-0 flex w-8 items-center justify-center rounded-r-lg text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><X size={14} aria-hidden="true" /></button>}
    </div>;
  },
);
SearchInput.displayName = 'SearchInput';
