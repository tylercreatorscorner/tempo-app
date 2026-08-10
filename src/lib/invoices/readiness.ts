/**
 * Is this invoice fit to send?
 *
 * All 4 invoices ever sent went out with no recipient at all (measured
 * 2026-08-10) — addressed to nobody — and nothing in the product objected,
 * because the send button only ever refused a voided invoice.
 *
 * This is the ONE definition, shared by /send and /email so the two cannot
 * disagree about what "ready" means. Adding a third send path? Import this.
 *
 * Deliberately a BLOCK WITH AN OVERRIDE rather than a warning. A warning at
 * the moment of sending is a warning nobody reads; a block that names exactly
 * what is missing and can be waived on purpose is the version that changes
 * behaviour. The override is recorded by the caller, not swallowed here.
 *
 * Keep this list SHORT. Every entry is friction on a daily action, so a field
 * only earns a place here if the document genuinely cannot do its job without
 * it. Payment instructions were removed for exactly that reason — see below.
 */

export interface InvoiceReadinessInput {
  bill_to_name?: string | null;
  bill_to_email?: string | null;
  total_amount?: number | string | null;
}

export interface InvoiceReadiness {
  ready: boolean;
  /** Operator-facing sentences, already phrased for display. */
  missing: string[];
}

/**
 * Empty, or a placeholder standing in for empty.
 *
 * Filler is the same defect as absence from the client's side of the page —
 * a bill-to of "na" addresses the invoice to nobody just as surely as a null
 * does. Real example from prod: LeeFar's July invoice stored
 * payment_instructions of literally "na", and the PDF printed it under
 * "HOW TO PAY".
 */
const PLACEHOLDERS = new Set(['na', 'n/a', 'none', 'tbd', 'tba', '-', '--', '.', 'x', 'xx', '?']);
const blank = (v: string | null | undefined) =>
  !v || !v.trim() || PLACEHOLDERS.has(v.trim().toLowerCase());

export function checkInvoiceReadiness(inv: InvoiceReadinessInput): InvoiceReadiness {
  const missing: string[] = [];

  // A recipient means SOMETHING to address it to. Email alone is enough to
  // send; name alone is enough for a PDF handed over another way. Neither is
  // not enough.
  if (blank(inv.bill_to_name) && blank(inv.bill_to_email)) {
    missing.push('a recipient — set a bill-to name or email');
  }

  // Payment instructions are NOT required — owner's call, 2026-08-10.
  //
  // They were briefly, on the reasoning that a bill with no remittance detail
  // is a request for money with no way to pay it. Two things make that too
  // strict: several brands pay on standing arrangements that need no
  // instructions on the document, and the PDF now falls back to
  // "Reference {invoice number} with your payment. Contact {payee} for
  // remittance details." rather than printing an empty box. So a missing value
  // degrades to something sensible instead of to nothing.
  //
  // If it ever goes back in, make it a soft warning the operator sees, not a
  // block — blocking a send for a field the document handles gracefully is
  // friction with no payoff.

  // A zero invoice is almost always an unfinished one rather than a real $0
  // bill, and sending it looks like a mistake to the client either way.
  if (Number(inv.total_amount ?? 0) <= 0) {
    missing.push('an amount — the total is $0');
  }

  return { ready: missing.length === 0, missing };
}

/** The 422 body both send paths return, so the UI can render one dialog. */
export function readinessError(readiness: InvoiceReadiness) {
  return {
    error:
      `This invoice is missing ${readiness.missing.length === 1 ? 'something' : 'a few things'} a client needs: ` +
      readiness.missing.join('; ') +
      '. Fix it in the invoice, or send anyway if you know why.',
    missing: readiness.missing,
    code: 'invoice_not_ready' as const,
  };
}
