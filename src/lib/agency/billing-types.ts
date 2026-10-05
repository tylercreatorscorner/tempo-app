import type { BillingRecord } from './billing-model';
import type { ClientRecord, AgencyTerms } from './model';

export type BillingAction = 'review' | 'correct_review' | 'invoice' | 'void_invoice' | 'receipt' | 'reverse_receipt';
export type BillingEvidence = {
  client: ClientRecord; terms: AgencyTerms; periodStart: string; periodEnd: string;
  managedGmvCents: number | null; gmvComplete: boolean; recordedThrough: string | null;
  calculatedAt: string; calculationStatus?: string;
};
export type BillingEvent = { revision: number; action: BillingAction; actorId: string; at: string; reason: string | null; receiptId?: string; effectiveOn?: string };
/** Each persisted version is immutable; history includes old invoices and receipts before reversal. */
export type AgencyBillingRecord = {
  clientId: string; month: string; revision: number; record: BillingRecord;
  evidence: BillingEvidence; events: BillingEvent[]; updatedAt: string;
};
export type BillingResponse = { records: AgencyBillingRecord[]; history: AgencyBillingRecord[]; storageReady: boolean; canEdit: boolean };
type Base = { clientId: string; month: string; expectedRevision: number; requestId: string };
export type BillingMutation = Base & (
  | { action: 'review' | 'correct_review'; clientRevision: number; expectedCalculatedCents: number | null; manualReviewedCents?: number; adjustmentCents: number; adjustmentReason?: string; reason?: string }
  | { action: 'invoice'; reference: string; issuedOn: string; dueOn: string }
  | { action: 'void_invoice'; reason: string; effectiveOn: string }
  | { action: 'receipt'; reference: string; receivedOn: string; amountCents: number }
  | { action: 'reverse_receipt'; receiptId: string; reason: string; effectiveOn: string }
);
