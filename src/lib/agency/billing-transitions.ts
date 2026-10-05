import { AgencyValidationError, isAgencyDate } from './model';
import { recordInvoice, recordReceipt, reviewCalculatedFee } from './billing-model';
import type { AgencyBillingRecord, BillingEvidence, BillingMutation } from './billing-types';
const fail = (message: string): never => { throw new AgencyValidationError(message); };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function validateBillingMutation(value: unknown): BillingMutation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('Invalid billing request.');
  const r = value as Record<string, unknown>;
  const extras: Record<string,string[]> = { review: ['clientRevision','expectedCalculatedCents','manualReviewedCents','adjustmentCents','adjustmentReason','reason'], correct_review: ['clientRevision','expectedCalculatedCents','manualReviewedCents','adjustmentCents','adjustmentReason','reason'], invoice: ['reference','issuedOn','dueOn'], void_invoice: ['reason','effectiveOn'], receipt: ['reference','receivedOn','amountCents'], reverse_receipt: ['receiptId','reason','effectiveOn'] };
  if (typeof r.action !== 'string' || !Object.hasOwn(extras,r.action)) return fail('Invalid billing action.');
  if (Object.keys(r).some(k => !['action','clientId','month','expectedRevision','requestId',...extras[r.action as string]].includes(k))) return fail('Unknown billing field.');
  if (typeof r.clientId !== 'string' || !uuid.test(r.clientId) || typeof r.requestId !== 'string' || !uuid.test(r.requestId)) return fail('Invalid billing identifier.');
  if (typeof r.month !== 'string' || !/^(20\d{2}|2100)-(0[1-9]|1[0-2])$/.test(r.month)) return fail('Invalid service month.');
  if (!Number.isSafeInteger(r.expectedRevision) || Number(r.expectedRevision) < 0 || Number(r.expectedRevision) > 2147483646) return fail('Invalid revision.');
  for (const key of ['clientRevision','expectedCalculatedCents','manualReviewedCents','adjustmentCents','amountCents']) if (extras[r.action].includes(key) && !(key === 'expectedCalculatedCents' && r[key] === null) && !(key === 'manualReviewedCents' && r[key] === undefined) && (!Number.isSafeInteger(r[key]) || (key !== 'adjustmentCents' && Number(r[key]) < (['expectedCalculatedCents','manualReviewedCents'].includes(key) ? 0 : 1)))) return fail(`Invalid ${key}.`);
  for (const key of ['reference','receiptId','reason','adjustmentReason']) {
    const required = key === 'reference' || key === 'receiptId' || (key === 'reason' && r.action !== 'review');
    if (extras[r.action].includes(key) && (r[key] !== undefined || required) && (typeof r[key] !== 'string' || !String(r[key]).trim() || String(r[key]).length > (key.includes('eason') ? 2000 : 200))) return fail(`Invalid ${key}.`);
  }
  for (const key of ['issuedOn','dueOn','receivedOn','effectiveOn']) if (extras[r.action].includes(key) && !isAgencyDate(r[key])) return fail(`Invalid ${key}.`);
  return r as BillingMutation;
}
export function transitionBilling(previous: AgencyBillingRecord | null, input: BillingMutation, actorId: string, at: string, source?: { evidence: BillingEvidence; calculatedCents: number | null }): AgencyBillingRecord {
  if ((previous?.revision ?? 0) !== input.expectedRevision) return fail('Billing record changed. Reload before saving.');
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(at));
  if (input.action === 'review' || input.action === 'correct_review') {
    if ((input.action === 'review') !== !previous) return fail('Use a correction for an existing review.');
    if (previous?.record.invoice || previous?.record.receipts.length) return fail('Reverse receipts and void the invoice before correcting the review.');
    if (!source || source.evidence.client.revision !== input.clientRevision) return fail('Client agreement changed. Reload before review.');
    if (source.calculatedCents !== input.expectedCalculatedCents) return fail('Calculated amount changed. Reload before review.');
    try {
      if (input.manualReviewedCents !== undefined && (source.evidence.calculationStatus !== 'review_required' || source.calculatedCents !== null || !input.reason?.trim() || input.adjustmentCents !== 0)) return fail('A manual fee requires an unresolved partial-period calculation and explanation.');
      const record = input.manualReviewedCents !== undefined ? { review: { calculatedCents: null, adjustmentCents: 0, adjustmentReason: null, reviewedCents: input.manualReviewedCents, clientRevision: input.clientRevision }, invoice: null, receipts: [] } : reviewCalculatedFee({ calculatedCents: source.calculatedCents, clientRevision: input.clientRevision, adjustmentCents: input.adjustmentCents, adjustmentReason: input.adjustmentReason });
      return { clientId: input.clientId, month: input.month, revision: input.expectedRevision+1, record, evidence: source.evidence, updatedAt: at, events: [...(previous?.events ?? []), { revision: input.expectedRevision+1, action: input.action, actorId, at, reason: input.reason?.trim() || null }] };
    } catch (e) { return fail(e instanceof Error ? e.message : 'Invalid review.'); }
  }
  if (!previous) return fail('Review the service fee first.');
  let record = previous.record;
  try {
    if (input.action === 'invoice') {
      if (input.issuedOn > date) return fail('An issued invoice cannot have a future issue date.');
      record = recordInvoice(record,input);
    } else if (input.action === 'receipt') {
      if (input.receivedOn > date) return fail('A receipt cannot have a future date.');
      record = recordReceipt(record,{id:input.requestId,reference:input.reference,receivedOn:input.receivedOn,amountCents:input.amountCents});
    } else if (input.action === 'void_invoice') {
      if (!record.invoice || record.receipts.length) return fail('Reverse all receipts before voiding the invoice.');
      if (input.effectiveOn < record.invoice.issuedOn || input.effectiveOn > date) return fail('Use a reversal date between the invoice date and today.');
      record = { ...record, invoice: null };
    } else if (input.action === 'reverse_receipt') {
      const receipt = record.receipts.find(r => r.id === input.receiptId);
      if (!receipt) return fail('Receipt is missing or already reversed.');
      if (input.effectiveOn < receipt.receivedOn || input.effectiveOn > date) return fail('Use a reversal date between receipt date and today.');
      record = { ...record, receipts: record.receipts.filter(r => r.id !== input.receiptId) };
    }
  } catch (e) { return fail(e instanceof Error ? e.message : 'Invalid billing update.'); }
  return { ...previous, revision: previous.revision+1, record, updatedAt: at, events: [...previous.events, { revision: previous.revision+1, action:input.action, actorId, at, reason:'reason' in input ? input.reason?.trim() || null : null, ...('effectiveOn' in input ? {effectiveOn:input.effectiveOn} : {}), ...('receiptId' in input ? {receiptId:input.receiptId} : {}) }] };
}
