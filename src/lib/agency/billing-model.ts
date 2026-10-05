import { isAgencyDate } from './model';

/** Internal USD billing model. Does not send invoices, collect money, or authorize access. */
export type ReviewedFee = Readonly<{
  calculatedCents: number;
  adjustmentCents: number;
  adjustmentReason: string | null;
  reviewedCents: number;
  clientRevision: number;
}>;
export type InvoiceRecord = Readonly<{
  reference: string;
  issuedOn: string;
  dueOn: string;
  amountCents: number;
  currency: 'USD';
}>;
export type ReceiptRecord = Readonly<{ id: string; reference: string; receivedOn: string; amountCents: number }>;
export type BillingRecord = Readonly<{
  review: ReviewedFee;
  invoice: InvoiceRecord | null;
  receipts: readonly ReceiptRecord[];
}>;
const cents = (value: number, signed = false) => {
  if (!Number.isSafeInteger(value) || (!signed && value < 0)) throw new Error('Use valid integer cents.');
  return value;
};
const reference = (value: string) => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 200) throw new Error('A reference is required (maximum 200 characters).');
  return value.trim();
};
export function reviewCalculatedFee(input: { calculatedCents: number | null; adjustmentCents?: number; adjustmentReason?: string; clientRevision: number }): BillingRecord {
  if (input.calculatedCents === null) throw new Error('Resolve calculation blockers before review.');
  if (!Number.isSafeInteger(input.clientRevision) || input.clientRevision < 1) throw new Error('A saved agreement revision is required.');
  const calculatedCents = cents(input.calculatedCents);
  const adjustmentCents = cents(input.adjustmentCents ?? 0, true);
  const adjustmentReason = input.adjustmentReason?.trim() || null;
  if (adjustmentCents !== 0 && !adjustmentReason) throw new Error('Explain the adjustment before review.');
  if (adjustmentReason && adjustmentReason.length > 2000) throw new Error('Adjustment reason is too long.');
  const reviewedCents = cents(calculatedCents + adjustmentCents);
  return { review: Object.freeze({ calculatedCents, adjustmentCents, adjustmentReason, reviewedCents, clientRevision: input.clientRevision }), invoice: null, receipts: [] };
}
export function recordInvoice(record: BillingRecord, input: { reference: string; issuedOn: string; dueOn: string }): BillingRecord {
  if (record.invoice) throw new Error('Invoice already recorded; use a correction workflow.');
  if (!isAgencyDate(input.issuedOn) || !isAgencyDate(input.dueOn) || input.dueOn < input.issuedOn) throw new Error('Use valid invoice and due dates.');
  return { ...record, invoice: Object.freeze({ reference: reference(input.reference), issuedOn: input.issuedOn, dueOn: input.dueOn, amountCents: record.review.reviewedCents, currency: 'USD' }) };
}
export function recordReceipt(record: BillingRecord, input: ReceiptRecord): BillingRecord {
  if (!record.invoice) throw new Error('Record the invoice before recording receipts.');
  const id = reference(input.id);
  const receipt = Object.freeze({ id, reference: reference(input.reference), receivedOn: input.receivedOn, amountCents: cents(input.amountCents) });
  if (!isAgencyDate(receipt.receivedOn) || receipt.receivedOn < record.invoice.issuedOn || receipt.amountCents === 0) throw new Error('Use a positive receipt and a date on or after the invoice.');
  const duplicate = record.receipts.find(value => value.id === id);
  if (duplicate) {
    if (duplicate.reference === receipt.reference && duplicate.receivedOn === receipt.receivedOn && duplicate.amountCents === receipt.amountCents) return record;
    throw new Error('Receipt ID already exists with different details.');
  }
  if (record.receipts.some(value => value.reference === receipt.reference)) throw new Error('Receipt reference already recorded.');
  const total = cents(record.receipts.reduce((sum, value) => sum + value.amountCents, 0) + receipt.amountCents);
  if (total > record.invoice.amountCents) throw new Error('Receipt exceeds the balance; review unapplied cash separately.');
  return { ...record, receipts: [...record.receipts, receipt] };
}
export function billingPosition(record: BillingRecord, asOf: string) {
  if (!isAgencyDate(asOf)) throw new Error('Use a valid reporting date.');
  const invoiced = record.invoice && record.invoice.issuedOn <= asOf ? record.invoice : null;
  const collectedCents = record.receipts.filter(receipt => receipt.receivedOn <= asOf).reduce((sum, receipt) => sum + receipt.amountCents, 0);
  const balanceCents = invoiced ? cents(invoiced.amountCents - collectedCents) : null;
  const status = !invoiced ? 'reviewed' : invoiced.amountCents === 0 ? 'no_payment_due' : balanceCents === 0 ? 'paid' : collectedCents > 0 ? 'partially_paid' : 'invoiced';
  return { status, reviewedCents: record.review.reviewedCents, invoicedCents: invoiced?.amountCents ?? null, collectedCents, balanceCents, overdue: Boolean(invoiced && balanceCents && invoiced.dueOn < asOf) };
}
