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
import { formatCurrency } from '@/lib/utils/format';
import { Badge } from '@/components/ui/badge';
import { RUN_MINIMUM_USD, type BrandRow, type RowInvoice } from './types';

const CHIP_CLASS = 'uppercase tracking-[0.06em]';

function shortDate(value: string): string {
  const d = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** Days past due for a not-paid, not-void invoice; 0 when current. */
function daysOverdue(inv: RowInvoice): number {
  if (!inv.dueDate || inv.status === 'paid' || inv.status === 'void') return 0;
  const today = new Date().toISOString().slice(0, 10);
  if (inv.dueDate >= today) return 0;
  return Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${inv.dueDate}T00:00:00Z`)) / 86_400_000);
}

function invoiceChipProps(inv: RowInvoice): { variant: 'positive' | 'warning' | 'negative' | 'neutral' | 'accent'; label: string } {
  if (inv.status === 'void') return { variant: 'neutral', label: 'Void' };
  if (inv.status === 'paid') {
    return { variant: 'positive', label: inv.paidAt ? `Paid ${shortDate(inv.paidAt)}` : 'Paid' };
  }
  const late = daysOverdue(inv);
  if (late > 0) return { variant: 'negative', label: `Overdue ${late}d` };
  if (inv.status === 'sent') {
    return { variant: 'accent', label: inv.dueDate ? `Sent · due ${shortDate(inv.dueDate)}` : 'Sent' };
  }
  return { variant: 'warning', label: 'Draft' };
}

export function InvoiceChip({
  row,
  generating,
  onGenerate,
}: {
  row: BrandRow;
  /** True while this row's single-brand generation request is in flight. */
  generating: boolean;
  onGenerate: (brand: string) => void;
}) {
  const inv = row.invoice;
  const driftDot = row.frozen?.drifted ? (
    <span
      className="h-2 w-2 shrink-0 rounded-full bg-[var(--pulse-warn)]"
      title={`Invoiced at ${formatCurrency(row.frozen.totalAmount)} - data has drifted since`}
    />
  ) : null;

  if (inv) {
    const chip = invoiceChipProps(inv);
    return (
      <span className="inline-flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
        <Link href={`/invoicing?id=${inv.id}`} title={inv.invoiceNumber} className="shrink-0">
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
      <span className="inline-flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={() => onGenerate(row.brand)}
          disabled={generating}
          title="Generate a draft invoice for this brand and month"
          className={cn(
            'inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-bold leading-none text-primary',
            CHIP_CLASS,
            'transition-colors hover:bg-[var(--primary)] hover:text-white disabled:opacity-50',
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
