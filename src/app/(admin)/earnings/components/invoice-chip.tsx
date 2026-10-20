'use client';

/**
 * Invoice lifecycle chip for a brand-month earnings row.
 *
 *   no invoice, total >= $100  → "Ready to invoice" (click generates a draft)
 *   no invoice, 0 < total < 100 → "Below minimum"
 *   no invoice, total <= 0      → em-dash placeholder
 *   status pending              → "Draft"
 *   status sent (not past due)  → "Sent · due {date}"
 *   pending/sent past due       → "Overdue {n}d"
 *   status paid                 → "Paid {date}"
 *   status void                 → "Void"
 *
 * Chips with an invoice link to /invoicing?id=… A small warn dot flags rows
 * whose live total has drifted from the frozen invoiced total.
 */
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { daysOverdue } from '@/lib/finance/overdue';
import { formatCurrency } from '@/lib/utils/format';
import { Badge } from '@/components/ui/badge';
import { RUN_MINIMUM_USD, type BrandRow, type RowInvoice } from './types';

const CHIP_CLASS = 'uppercase tracking-[0.06em]';

function shortDate(value: string): string {
  const d = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function invoiceChipProps(inv: RowInvoice, todayIso: string): { variant: 'positive' | 'warning' | 'negative' | 'neutral' | 'accent'; label: string } {
  if (inv.status === 'void') return { variant: 'neutral', label: 'Void' };
  if (inv.status === 'paid') {
    return { variant: 'positive', label: inv.paidAt ? `Paid ${shortDate(inv.paidAt)}` : 'Paid' };
  }
  // THE shared overdue rule (lib/finance/overdue) — drafts count.
  const late = daysOverdue(inv, todayIso);
  if (late > 0) return { variant: 'negative', label: `Overdue ${late}d` };
  if (inv.status === 'sent') {
    return { variant: 'accent', label: inv.dueDate ? `Sent · due ${shortDate(inv.dueDate)}` : 'Sent' };
  }
  return { variant: 'warning', label: 'Draft' };
}

export function InvoiceChip({
  row,
  todayIso,
  generating,
  onGenerate,
}: {
  row: BrandRow;
  /** yyyy-mm-dd (UTC) — computed once per page render so every surface agrees. */
  todayIso: string;
  /** True while this row's single-brand generation request is in flight. */
  generating: boolean;
  onGenerate: (brand: string) => void;
}) {
  const inv = row.invoice;
  const driftDot = row.frozen?.drifted ? (<>
    <span
      className="h-2 w-2 shrink-0 rounded-full bg-[var(--pulse-warn)]"
      title={`Invoiced at ${formatCurrency(row.frozen.totalAmount)} - data has drifted since`}
    />
    <span className="text-xs text-[var(--pulse-warn)] sm:hidden">Figures changed since invoice</span>
  </>) : null;

  if (inv) {
    const chip = invoiceChipProps(inv, todayIso);
    return (
      <span className="inline-flex max-w-full flex-wrap items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
        <Link href={`/invoicing?id=${inv.id}`} title={inv.invoiceNumber} className="inline-flex min-h-11 items-center sm:min-h-6">
          <Badge size="sm" variant={chip.variant} className={cn(CHIP_CLASS, 'transition-[filter] hover:brightness-110')}>
            {chip.label}
          </Badge>
        </Link>
        {driftDot}
      </span>
    );
  }

  if (row.total >= RUN_MINIMUM_USD) {
    return (
      <span className="inline-flex max-w-full flex-wrap items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={() => onGenerate(row.brand)}
          disabled={generating}
          title="Generate a draft invoice for this brand and month"
          aria-label={`Prepare draft invoice for ${row.brandLabel}`}
          className={cn(
            'inline-flex min-h-11 items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs font-bold leading-tight text-primary sm:min-h-6 sm:py-0.5 sm:text-[10px]',
            CHIP_CLASS,
            'transition-colors hover:bg-[var(--primary)] hover:text-primary-foreground disabled:opacity-50',
          )}
        >
          {generating && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
          Ready to invoice
        </button>
        {driftDot}
      </span>
    );
  }

  if (row.total > 0) {
    return (
      <Badge size="sm" variant="neutral" className={CHIP_CLASS} title={`${formatCurrency(row.total)} is below the ${formatCurrency(RUN_MINIMUM_USD)} minimum`}>
        Below minimum
      </Badge>
    );
  }

  return <span className="text-muted-foreground">—</span>;
}
