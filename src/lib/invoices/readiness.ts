/**
 * Is this invoice fit to send?
 *
 * All 4 invoices ever sent went out with NO recipient and NO payment
 * instructions (measured 2026-08-10). They asked clients for money with
 * nowhere to send it, and nothing in the product objected — the send button
 * only ever refused a voided invoice.
 *
 * This is the ONE definition, shared by /send and /email so the two cannot
 * disagree about what "ready" means. Adding a third send path? Import this.
 *
 * Deliberately a BLOCK WITH AN OVERRIDE rather than a warning. A warning at
 * the moment of sending is a warning nobody reads; a block that names exactly
 * what is missing and can be waived on purpose is the version that changes
 * behaviour. The override is recorded by the caller, not swallowed here.
 */

export interface InvoiceReadinessInput {
  bill_to_name?: string | null;
  bill_to_email?: string | null;
  payment_instructions?: string | null;
  total_amount?: number | string | null;
}

export interface InvoiceReadiness {
  ready: boolean;
  /** Operator-facing sentences, already phrased for display. */
  missing: string[];
}

const blank = (v: string | null | undefined) => !v || !v.trim();

export function checkInvoiceReadiness(inv: InvoiceReadinessInput): InvoiceReadiness {
  const missing: string[] = [];

  // A recipient means SOMETHING to address it to. Email alone is enough to
  // send; name alone is enough for a PDF handed over another way. Neither is
  // not enough.
  if (blank(inv.bill_to_name) && blank(inv.bill_to_email)) {
    missing.push('a recipient — set a bill-to name or email');
  }

  // An invoice with no remittance detail is a request for money with no way to
  // pay it. This is the one that actually cost collections time.
  if (blank(inv.payment_instructions)) {
    missing.push('payment instructions — the client has no way to pay');
  }

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
