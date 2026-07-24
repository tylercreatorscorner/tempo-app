'use client';

/**
 * Invoicing lifecycle board — the default read of where every invoice stands.
 *
 * Four columns, per the finance-overhaul mockup (Surface 3):
 *   Draft   — status 'pending' and not past due (generated, not yet sent)
 *   Sent    — status 'sent' and not past due
 *   Overdue — any open invoice (pending OR sent) past its due_date, per THE
 *             shared rule in lib/finance/overdue — drafts count. Neg-tinted
 *             card with an "N days late" line.
 *   Paid    — paid within the selected month (defaults to the current month)
 *
 * Column headers carry count + $ sum. Cards open the same detail sheet the
 * List view uses. Void invoices intentionally do NOT appear here — the List
 * view carries them (the board is the 4 core lifecycle states only).
 *
 * Cards carry the full collections story (invoice revamp Phase A): sent +
 * "viewed 2h ago / not viewed yet" (from the bot-safe share-page beacon) and
 * the nudge log, with a one-click Nudge on overdue cards. Viewed renders only
 * once the invoice has been sent — before that the signal would be noise.
 */

import { useMemo, useState } from 'react';
import { Plus, Receipt } from 'lucide-react';
import { cn } from '@/lib/utils';
import { daysOverdue, isOverdue } from '@/lib/finance/overdue';
import { formatCurrency, formatDate, formatPeriod, currentMonth, buildMonthOptions } from '@/lib/utils/format';
import { useBrandMeta } from '@/hooks/use-brand-meta';
import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import type { Invoice } from './invoice-detail-sheet';
import { NudgeButton, NudgedSpan, ViewedSpan } from './invoice-telemetry';

interface Props {
  invoices: Invoice[];
  loading: boolean;
  /** yyyy-mm-dd (UTC) — computed once per page render so every surface agrees. */
  todayIso: string;
  onOpen: (inv: Invoice) => void;
  onCreate: () => void;
  /** Refetch after a nudge so the card meta reflects the new log. */
  onRefresh: () => void;
}

const METHOD_LABELS: Record<string, string> = {
  wire: 'wire', ach: 'ACH', check: 'check', zelle: 'Zelle', paypal: 'PayPal', stripe: 'Stripe', other: 'other',
};

const ts = (v: string | null | undefined): number => {
  if (!v) return 0;
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? 0 : t;
};

type ColumnKey = 'draft' | 'sent' | 'overdue' | 'paid';

interface Column {
  key: ColumnKey;
  title: string;
  rows: Invoice[];
  sum: number;
  /** Tone class for the count + sum figure in the header. */
  tone: string;
}

export function InvoiceBoard({ invoices, loading, todayIso, onOpen, onCreate, onRefresh }: Props) {
  const brandMeta = useBrandMeta();
  const [paidMonth, setPaidMonth] = useState(currentMonth());
  const monthOptions = useMemo(() => buildMonthOptions(13), []);

  const columns = useMemo<Column[]>(() => {
    const draft: Invoice[] = [];
    const sent: Invoice[] = [];
    const overdue: Invoice[] = [];
    const paid: Invoice[] = [];
    for (const inv of invoices) {
      if (inv.status === 'pending' || inv.status === 'sent') {
        // THE shared rule: pending or sent, past due — drafts count.
        if (isOverdue(inv, todayIso)) overdue.push(inv);
        else if (inv.status === 'pending') draft.push(inv);
        else sent.push(inv);
      } else if (inv.status === 'paid') {
        // paid_at is a timestamp; scope to the selected YYYY-MM.
        if ((inv.paid_at ?? '').slice(0, 7) === paidMonth) paid.push(inv);
      }
      // void: List view only.
    }
    draft.sort((a, b) => ts(b.generated_at) - ts(a.generated_at));
    sent.sort((a, b) => (ts(a.due_date) || Infinity) - (ts(b.due_date) || Infinity));
    overdue.sort((a, b) => daysOverdue(b, todayIso) - daysOverdue(a, todayIso));
    paid.sort((a, b) => ts(b.paid_at) - ts(a.paid_at));
    const sum = (rows: Invoice[]) => rows.reduce((s, i) => s + Number(i.total_amount), 0);
    return [
      { key: 'draft',   title: 'Draft',   rows: draft,   sum: sum(draft),   tone: 'text-muted-foreground' },
      { key: 'sent',    title: 'Sent',    rows: sent,    sum: sum(sent),    tone: 'text-muted-foreground' },
      { key: 'overdue', title: 'Overdue', rows: overdue, sum: sum(overdue), tone: 'text-[var(--pulse-neg)]' },
      { key: 'paid',    title: `Paid · ${formatPeriod(paidMonth, { short: true })}`, rows: paid, sum: sum(paid), tone: 'text-[var(--pulse-pos)]' },
    ];
  }, [invoices, paidMonth, todayIso]);

  if (loading && invoices.length === 0) {
    return (
      <Card className="p-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[320px] rounded-xl" />
          ))}
        </div>
      </Card>
    );
  }

  if (!loading && invoices.length === 0) {
    return (
      <EmptyState
        icon={<Receipt className="h-7 w-7" />}
        title="No invoices yet"
        description="Generate your first invoice: pick a brand and a month, and the line items come from your earnings."
        action={
          <Button variant="primary" onClick={onCreate}>
            <Plus className="h-4 w-4" />
            Create Invoice
          </Button>
        }
      />
    );
  }

  return (
    <Card className="p-3">
      <div className="flex flex-wrap items-center justify-between gap-3 px-1.5 pb-3 pt-1">
        <p className="text-xs text-muted-foreground">
          Draft, Sent and Overdue always show every open invoice · the Paid column is scoped to the selected month.
        </p>
        <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          Paid month
          <span className="w-40">
            <Select
              value={paidMonth}
              onChange={(e) => setPaidMonth(e.target.value)}
              className="py-1.5 pl-2.5 text-xs"
              aria-label="Month shown in the Paid column"
            >
              {monthOptions.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </Select>
          </span>
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {columns.map((col) => (
          <div key={col.key} className="flex min-h-[180px] flex-col rounded-xl border border-border bg-secondary/50 p-2.5">
            <div className="flex items-baseline justify-between gap-2 px-1.5 pb-2 pt-0.5">
              <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{col.title}</span>
              <span className={cn('text-[10px] font-bold uppercase tracking-wide tabular-nums', col.tone)}>
                {col.rows.length} · {formatCurrency(col.sum)}
              </span>
            </div>
            {col.rows.length === 0 ? (
              <p className="px-1.5 py-8 text-center text-xs text-muted-foreground/70">
                {col.key === 'paid' ? `Nothing paid in ${formatPeriod(paidMonth, { short: true })}` : 'No invoices'}
              </p>
            ) : (
              <div className="space-y-2">
                {col.rows.map((inv) => (
                  <BoardCard
                    key={inv.id}
                    invoice={inv}
                    hot={col.key === 'overdue'}
                    metaKind={col.key}
                    todayIso={todayIso}
                    brandLabel={brandMeta.label(inv.brand)}
                    brandColor={brandMeta.color(inv.brand)}
                    onOpen={onOpen}
                    onRefresh={onRefresh}
                  />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

/**
 * The card's telemetry line. Segments per column:
 *   draft   — created {date}
 *   sent    — sent {date} · viewed {rel} / not viewed yet · due {date}
 *   overdue — {n} days late · viewed … (once sent) · nudged {rel}
 *   paid    — paid {date} · {method}
 * Viewed renders only once sent_at exists — an unsent invoice's link may not
 * even be minted, so "not viewed yet" would be noise there.
 */
function MetaLine({ inv, kind, todayIso }: { inv: Invoice; kind: ColumnKey; todayIso: string }) {
  const dot = <span aria-hidden="true"> · </span>;
  switch (kind) {
    case 'draft':
      return <>created {formatDate(inv.generated_at)}</>;
    case 'sent':
      return (
        <>
          {inv.sent_at ? <>sent {formatDate(inv.sent_at)}</> : <>sent</>}
          {dot}
          <ViewedSpan invoice={inv} />
          {inv.due_date && <>{dot}due {formatDate(inv.due_date)}</>}
        </>
      );
    case 'overdue': {
      const n = daysOverdue(inv, todayIso);
      const nudged = <NudgedSpan invoice={inv} />;
      return (
        <>
          <span className="font-semibold text-[var(--pulse-neg)]">{n} day{n === 1 ? '' : 's'} late</span>
          {inv.sent_at && <>{dot}<ViewedSpan invoice={inv} /></>}
          {Number(inv.nudge_count ?? 0) > 0 ? <>{dot}{nudged}</> : inv.due_date ? <>{dot}due {formatDate(inv.due_date)}</> : null}
        </>
      );
    }
    case 'paid': {
      const method = inv.payment_method ? (METHOD_LABELS[inv.payment_method] ?? inv.payment_method) : null;
      return (
        <>
          {inv.paid_at ? <>paid {formatDate(inv.paid_at)}</> : <>paid</>}
          {method && <>{dot}{method}</>}
        </>
      );
    }
  }
}

function BoardCard({
  invoice, hot, metaKind, todayIso, brandLabel, brandColor, onOpen, onRefresh,
}: {
  invoice: Invoice;
  hot: boolean;
  metaKind: ColumnKey;
  todayIso: string;
  brandLabel: string;
  brandColor: string;
  onOpen: (inv: Invoice) => void;
  onRefresh: () => void;
}) {
  return (
    // div-with-button-semantics, not <button>: overdue cards nest the Nudge
    // button, and interactive elements can't nest inside a real <button>.
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(invoice)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(invoice);
        }
      }}
      className={cn(
        'w-full cursor-pointer rounded-lg border bg-card p-3 text-left shadow-[var(--pulse-elev-1)] transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
        hot ? 'hover:brightness-[1.03]' : 'border-border hover:border-primary/50',
      )}
      style={hot ? { borderColor: 'color-mix(in srgb, var(--pulse-neg) 45%, transparent)' } : undefined}
      aria-label={`Open invoice ${invoice.invoice_number} for ${brandLabel}`}
    >
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: brandColor }} aria-hidden="true" />
        <span className="truncate text-[13px] font-bold text-foreground">{brandLabel}</span>
      </span>
      <span className="mt-0.5 block truncate font-mono text-[10.5px] text-muted-foreground">{invoice.invoice_number}</span>
      <span className="mt-1.5 block text-[15px] font-extrabold tabular-nums text-foreground">
        {formatCurrency(Number(invoice.total_amount))}
      </span>
      <span className="mt-0.5 block text-[11px] leading-normal text-muted-foreground">
        <MetaLine inv={invoice} kind={metaKind} todayIso={todayIso} />
      </span>
      {metaKind === 'overdue' && (
        <span className="mt-1.5 block">
          <NudgeButton invoice={invoice} onDone={onRefresh} />
        </span>
      )}
    </div>
  );
}
