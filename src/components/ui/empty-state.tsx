import * as React from 'react';
import { cn } from '@/lib/utils';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

/** Centered empty / no-data state inside a card. */
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('rounded-xl border border-border bg-card shadow-[var(--pulse-elev-1)]', className)}>
      <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
        {icon && <div className="mb-3 text-muted-foreground">{icon}</div>}
        <h3 className="text-lg font-bold text-foreground">{title}</h3>
        {description && <p className="mt-2 max-w-sm text-sm text-muted-foreground">{description}</p>}
        {action && <div className="mt-5">{action}</div>}
      </div>
    </div>
  );
}
