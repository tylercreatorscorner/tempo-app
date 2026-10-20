'use client';

/**
 * Aging report — bucketed view of unpaid invoices by overdue age.
 *
 * Buckets:
 *   - Current: not yet due (due_date is in the future or no due_date)
 *   - 1-30 days overdue
 *   - 31-60 days overdue
 *   - 61-90 days overdue
 *   - 90+ days overdue
 *
 * Click a bucket to filter the table to invoices in that bucket. The active
 * bucket is highlighted.
 */

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { daysOverdue } from '@/lib/finance/overdue';
import { formatCurrency } from '@/lib/utils/format';
import type { Invoice } from './invoice-detail-sheet';

export type AgingBucket = 'all' | 'current' | '1-30' | '31-60' | '61-90' | '90+';

export function bucketFor(inv: Invoice, todayIso: string): Exclude<AgingBucket, 'all'> | null {
  // Only unpaid (pending/sent) invoices are aged. Paid + void are excluded.
  if (inv.status === 'paid' || inv.status === 'void') return null;
  // Bucket membership via THE shared overdue rule (lib/finance/overdue):
  // 0 days = not yet due (or no due_date) = current.
  const days = daysOverdue(inv, todayIso);
  if (days <= 0) return 'current';
  if (days <= 30) return '1-30';
  if (days <= 60) return '31-60';
  if (days <= 90) return '61-90';
  return '90+';
}

interface BucketDef {
  value: Exclude<AgingBucket, 'all'>;
  label: string;
  description: string;
  text: string;
}

// Escalating severity, low → high: neutral → amber → orange → red → deep rose.
// Tints use color-with-opacity so they read on the card surface in both themes.
const BUCKETS: BucketDef[] = [
  { value: 'current', label: 'Current', description: 'Not yet due', text: 'text-foreground' },
  { value: '1-30', label: '1-30 days', description: 'Days overdue', text: 'text-[var(--pulse-warn)]' },
  { value: '31-60', label: '31-60 days', description: 'Days overdue', text: 'text-[var(--pulse-warn)]' },
  { value: '61-90', label: '61-90 days', description: 'Days overdue', text: 'text-[var(--pulse-neg)]' },
  { value: '90+', label: '90+ days', description: 'Days overdue', text: 'text-[var(--pulse-neg)]' },
];

interface Props {
  invoices: Invoice[];
  /** yyyy-mm-dd (UTC) — computed once per page render so every surface agrees. */
  todayIso: string;
  /** Currently active bucket filter, or 'all' for no filter. */
  active: AgingBucket;
  onPick: (b: AgingBucket) => void;
}

export function AgingPanel({ invoices, todayIso, active, onPick }: Props) {
  const buckets = useMemo(() => {
    const totals: Record<Exclude<AgingBucket, 'all'>, { amount: number; count: number }> = {
      current: { amount: 0, count: 0 },
      '1-30':  { amount: 0, count: 0 },
      '31-60': { amount: 0, count: 0 },
      '61-90': { amount: 0, count: 0 },
      '90+':   { amount: 0, count: 0 },
    };
    for (const inv of invoices) {
      const b = bucketFor(inv, todayIso);
      if (!b) continue;
      totals[b].amount += Number(inv.total_amount);
      totals[b].count += 1;
    }
    return totals;
  }, [invoices, todayIso]);

  const totalUnpaid = (Object.values(buckets) as { amount: number }[]).reduce((s, b) => s + b.amount, 0);

  if (totalUnpaid === 0) return null; // Don't show empty aging panel

  return (
    <section aria-label="Filter invoices by overdue age" className="border-b border-border bg-muted/25 px-4 py-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><h3 className="font-medium">Unpaid by age · select to filter</h3><span className="tabular-nums">{formatCurrency(totalUnpaid)} unpaid</span></div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
          {BUCKETS.map((b) => {
            const data = buckets[b.value];
            const isActive = active === b.value;
            return (
              <button
                key={b.value}
                aria-pressed={isActive}
                aria-label={`${b.label}: ${data.count} invoices, ${formatCurrency(data.amount)}. ${b.description}.`}
                onClick={() => onPick(isActive ? 'all' : b.value)}
                className={cn(
                  'min-w-0 rounded-lg border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                  isActive ? 'border-primary/50 bg-primary/5' : 'border-border bg-card hover:border-primary/30',
                )}
              >
                <p className={cn('text-[11px] font-medium', b.text)}>{b.label}</p>
                <p className="mt-1 break-words text-sm font-semibold tabular-nums text-foreground">
                  {data.amount > 0 ? formatCurrency(data.amount) : '—'}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {data.count} {data.count === 1 ? 'invoice' : 'invoices'}{b.value !== 'current' && data.count > 0 ? ` · ${b.description.toLowerCase()}` : ''}
                </p>
              </button>
            );
          })}
        </div>
    </section>
  );
}
