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
import { Clock, AlertTriangle, Flame } from 'lucide-react';
import { cn } from '@/lib/utils';
import { daysOverdue } from '@/lib/finance/overdue';
import { formatCurrency } from '@/lib/utils/format';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
  icon: React.ComponentType<{ className?: string }>;
  /** Color tokens for the card */
  bg: string;
  bgActive: string;
  text: string;
  iconBg: string;
}

// Escalating severity, low → high: neutral → amber → orange → red → deep rose.
// Tints use color-with-opacity so they read on the card surface in both themes.
const BUCKETS: BucketDef[] = [
  { value: 'current', label: 'Current',  description: 'Not yet due', icon: Clock,           bg: 'bg-card border-border',              bgActive: 'bg-muted border-muted-foreground/40 ring-2 ring-muted-foreground/20',  text: 'text-foreground',                      iconBg: 'bg-muted' },
  { value: '1-30',    label: '1-30',     description: 'Days overdue', icon: Clock,          bg: 'bg-card border-amber-500/30',        bgActive: 'bg-amber-500/10 border-amber-500/60 ring-2 ring-amber-500/25',          text: 'text-amber-600 dark:text-amber-400',   iconBg: 'bg-amber-500/15' },
  { value: '31-60',   label: '31-60',    description: 'Days overdue', icon: AlertTriangle,  bg: 'bg-card border-orange-500/30',       bgActive: 'bg-orange-500/10 border-orange-500/60 ring-2 ring-orange-500/25',       text: 'text-orange-600 dark:text-orange-400', iconBg: 'bg-orange-500/15' },
  { value: '61-90',   label: '61-90',    description: 'Days overdue', icon: AlertTriangle,  bg: 'bg-card border-red-500/30',          bgActive: 'bg-red-500/10 border-red-500/60 ring-2 ring-red-500/25',                text: 'text-red-600 dark:text-red-400',       iconBg: 'bg-red-500/15' },
  { value: '90+',     label: '90+',      description: 'Days overdue', icon: Flame,          bg: 'bg-card border-rose-500/40',         bgActive: 'bg-rose-500/15 border-rose-600 ring-2 ring-rose-500/30',                text: 'text-rose-600 dark:text-rose-400',     iconBg: 'bg-rose-500/20' },
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
    <Card className="overflow-hidden">
      <CardHeader className="items-baseline">
        <div>
          <CardTitle className="text-sm">Aging</CardTitle>
          <CardDescription className="text-xs mt-0.5">
            Unpaid invoices by overdue age · click a bucket to filter
          </CardDescription>
        </div>
        <p className="text-xs text-muted-foreground">
          <span className="font-bold text-foreground">{formatCurrency(totalUnpaid)}</span> unpaid
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {BUCKETS.map((b) => {
            const data = buckets[b.value];
            const isActive = active === b.value;
            const Icon = b.icon;
            return (
              <button
                key={b.value}
                onClick={() => onPick(isActive ? 'all' : b.value)}
                className={cn(
                  'rounded-xl border p-3 text-left transition-all',
                  isActive ? b.bgActive : `${b.bg} hover:border-border`,
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className={cn('inline-flex items-center justify-center h-7 w-7 rounded-lg', b.iconBg)}>
                    <Icon className={cn('h-3.5 w-3.5', b.text)} />
                  </span>
                  <span className={cn('text-[10px] font-bold uppercase tracking-wider', b.text)}>
                    {b.label}
                  </span>
                </div>
                <p className={cn('text-base font-extrabold tabular-nums', isActive ? b.text : 'text-foreground')}>
                  {data.amount > 0 ? formatCurrency(data.amount) : '—'}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {data.count} {data.count === 1 ? 'invoice' : 'invoices'}{b.value !== 'current' && data.count > 0 ? ` · ${b.description.toLowerCase()}` : ''}
                </p>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
