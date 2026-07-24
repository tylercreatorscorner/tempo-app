/**
 * THE Overdue rule — one definition for every finance surface.
 *
 * An invoice is overdue when it is past its due date and neither paid nor
 * void. Drafts (status 'pending') COUNT: in this workspace invoices are
 * generated and then marked paid, often without ever being stamped 'sent',
 * so a sent-only rule would report $0 overdue while hundreds of thousands
 * sit past due (adversarial-review finding: the cockpit chips, the board
 * column, the Payments KPI, and the aging panel shipped with two different
 * rules and visibly disagreed on prod data).
 *
 * Pure + client-importable. Every surface — invoice-board, invoice-chip,
 * earnings-kpis, invoice-list's DueIndicator, aging-panel, and
 * /api/payments/overview — must call these, never re-derive the predicate.
 */

export interface OverdueCheckable {
  status: string;
  due_date?: string | null;
  dueDate?: string | null;
}

const CLOSED_STATUSES: ReadonlySet<string> = new Set(['paid', 'void']);

function dueDateOf(inv: OverdueCheckable): string | null {
  return inv.due_date ?? inv.dueDate ?? null;
}

/** Days past due (>= 1) or 0 when not overdue. `today` = yyyy-mm-dd (UTC). */
export function daysOverdue(inv: OverdueCheckable, todayIso: string): number {
  if (CLOSED_STATUSES.has(inv.status)) return 0;
  const due = dueDateOf(inv);
  if (!due || due >= todayIso) return 0;
  const diff = Date.parse(todayIso) - Date.parse(due);
  return Math.max(1, Math.floor(diff / 86_400_000));
}

export function isOverdue(inv: OverdueCheckable, todayIso: string): boolean {
  return daysOverdue(inv, todayIso) > 0;
}

/** Today's UTC date as yyyy-mm-dd — pass ONE value per render so a page's
 *  surfaces can't straddle midnight and disagree. */
export function todayIsoUtc(): string {
  return new Date().toISOString().slice(0, 10);
}
