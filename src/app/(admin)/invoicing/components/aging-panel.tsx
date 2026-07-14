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
import { formatCurrency } from '@/lib/utils/format';
import type { Invoice } from './invoice-detail-sheet';

export type AgingBucket = 'all' | 'current' | '1-30' | '31-60' | '61-90' | '90+';

export function bucketFor(inv: Invoice, now = new Date()): Exclude<AgingBucket, 'all'> | null {
  // Only unpaid (pending/sent) invoices are aged. Paid + void are excluded.
  if (inv.status === 'paid' || inv.status === 'void') return null;
  if (!inv.due_date) return 'current';
  const due = new Date(inv.due_date);
  const daysOverdue = Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
  if (daysOverdue <= 0) return 'current';
  if (daysOverdue <= 30) return '1-30';
  if (daysOverdue <= 60) return '31-60';
  if (daysOverdue <= 90) return '61-90';
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

const BUCKETS: BucketDef[] = [
  { value: 'current', label: 'Current',  description: 'Not yet due', icon: Clock,           bg: 'bg-card border-border',         bgActive: 'bg-muted border-gray-400 ring-2 ring-border',           text: 'text-foreground',    iconBg: 'bg-muted' },
  { value: '1-30',    label: '1-30',     description: 'Days overdue', icon: Clock,          bg: 'bg-card border-amber-500/25',        bgActive: 'bg-amber-500/10 border-amber-400 ring-2 ring-amber-200',         text: 'text-amber-500',   iconBg: 'bg-amber-500/15' },
  { value: '31-60',   label: '31-60',    description: 'Days overdue', icon: AlertTriangle,  bg: 'bg-card border-orange-500/25',       bgActive: 'bg-orange-500/10 border-orange-400 ring-2 ring-orange-200',     text: 'text-orange-500',  iconBg: 'bg-orange-500/15' },
  { value: '61-90',   label: '61-90',    description: 'Days overdue', icon: AlertTriangle,  bg: 'bg-card border-red-500/25',          bgActive: 'bg-red-500/10 border-red-400 ring-2 ring-red-200',               text: 'text-red-500',     iconBg: 'bg-red-500/15' },
  { value: '90+',     label: '90+',      description: 'Days overdue', icon: Flame,          bg: 'bg-card border-red-300',          bgActive: 'bg-red-500/15 border-red-500 ring-2 ring-red-300',              text: 'text-red-500',     iconBg: 'bg-red-200' },
];

interface Props {
  invoices: Invoice[];
  /** Currently active bucket filter, or 'all' for no filter. */
  active: AgingBucket;
  onPick: (b: AgingBucket) => void;
}

export function AgingPanel({ invoices, active, onPick }: Props) {
  const buckets = useMemo(() => {
    const now = new Date();
    const totals: Record<Exclude<AgingBucket, 'all'>, { amount: number; count: number }> = {
      current: { amount: 0, count: 0 },
      '1-30':  { amount: 0, count: 0 },
      '31-60': { amount: 0, count: 0 },
      '61-90': { amount: 0, count: 0 },
      '90+':   { amount: 0, count: 0 },
    };
    for (const inv of invoices) {
      const b = bucketFor(inv, now);
      if (!b) continue;
      totals[b].amount += Number(inv.total_amount);
      totals[b].count += 1;
    }
    return totals;
  }, [invoices]);

  const totalUnpaid = (Object.values(buckets) as { amount: number }[]).reduce((s, b) => s + b.amount, 0);

  if (totalUnpaid === 0) return null; // Don't show empty aging panel

  return (
    <div className="rounded-2xl bg-card border border-border shadow-sm overflow-hidden">
      <div className="px-5 pt-4 pb-3 flex items-baseline justify-between">
        <div>
          <h3 className="text-sm font-bold text-[var(--foreground)]">Aging</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Unpaid invoices by overdue age · click a bucket to filter
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          <span className="font-bold text-[var(--foreground)]">{formatCurrency(totalUnpaid)}</span> unpaid
        </p>
      </div>
      <div className="px-5 pb-5">
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
                <p className={cn('text-base font-extrabold tabular-nums', isActive ? b.text : 'text-[var(--foreground)]')}>
                  {data.amount > 0 ? formatCurrency(data.amount) : '—'}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {data.count} {data.count === 1 ? 'invoice' : 'invoices'}{b.value !== 'current' && data.count > 0 ? ` · ${b.description.toLowerCase()}` : ''}
                </p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
