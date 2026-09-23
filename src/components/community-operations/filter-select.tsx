'use client';

import { Children, isValidElement, type ReactNode } from 'react';
import { Select } from 'radix-ui';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Compact, keyboard-accessible filters with the same menu treatment as the workspace. */
export function FilterSelect({ value, onValueChange, children, className, id, 'aria-label': label }: {
  value: string;
  onValueChange: (value: string) => void;
  children: ReactNode;
  className?: string;
  id?: string;
  'aria-label'?: string;
}) {
  const options = Children.toArray(children).filter(isValidElement<{ value: string; children: ReactNode }>);
  return <Select.Root value={value || '__empty'} onValueChange={next => onValueChange(next === '__empty' ? '' : next)}>
    <Select.Trigger id={id} aria-label={label} className={cn('inline-flex h-8 items-center justify-between gap-3 rounded-md border border-border bg-card px-3 text-xs font-medium text-foreground shadow-sm hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 data-[state=open]:border-primary/50', className)}>
      <Select.Value />
      <Select.Icon><ChevronDown size={13} className="shrink-0 text-muted-foreground" /></Select.Icon>
    </Select.Trigger>
    <Select.Portal><Select.Content position="popper" sideOffset={5} collisionPadding={8} className="z-50 min-w-[var(--radix-select-trigger-width)] max-h-[var(--radix-select-content-available-height)] overflow-hidden rounded-lg border border-border bg-card text-foreground shadow-lg">
      <Select.Viewport className="p-1">
        {options.map(option => <Select.Item key={option.props.value} value={option.props.value || '__empty'} className="relative flex cursor-default select-none items-center rounded px-3 py-2 pr-9 text-xs outline-none data-[highlighted]:bg-secondary data-[state=checked]:font-medium">
          <Select.ItemText>{option.props.children}</Select.ItemText>
          <Select.ItemIndicator className="absolute right-3"><Check size={13} /></Select.ItemIndicator>
        </Select.Item>)}
      </Select.Viewport>
    </Select.Content></Select.Portal>
  </Select.Root>;
}
