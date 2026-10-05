import assert from 'node:assert/strict';
import { recentAgencyMonths, summarizeAgencyTrend, summarizeBillingTimeline } from '../src/lib/agency/leadership-trends';
import type { ClientRecord } from '../src/lib/agency/model';
assert.deepEqual(recentAgencyMonths('2026-02', 3), ['2025-12', '2026-01', '2026-02']);
assert.throws(() => recentAgencyMonths('2026-13'));
assert.throws(() => recentAgencyMonths('2026-09', 100));
const client: ClientRecord = { id: 'a', revision: 1, name: 'A', brandIds: ['a'], serviceStart: '2026-01-01', serviceEnd: null, exitReason: null, updatedAt: null, terms: [{ effectiveMonth: '2026-01', monthlyRetainer: 0, revSharePercent: 0, feeModel: 'fixed' }] };
const source = { month: '2026-09', clients: [client], performance: [] };
assert.equal(summarizeAgencyTrend(source).calculatedCents, 0, 'Explicit zero fee is calculated without GMV');
assert.equal(summarizeAgencyTrend({ ...source, clients: [{ ...client, terms: [] }] }).calculatedCents, null, 'Unknown terms are not zero');
const mixed = summarizeAgencyTrend({ ...source, clients: [client, { ...client, id: 'b', serviceStart: null, terms: [] }] });
assert.equal(mixed.calculated, 1); assert.equal(mixed.eligible, 2); assert.equal(mixed.partial, true);
assert.equal(mixed.retention.missingLifecycle, 1); assert.equal(mixed.retention.retentionRate, 1);
const churn = summarizeAgencyTrend({ ...source, clients: [{ ...client, serviceEnd: '2026-09-15', exitReason: 'Ended' }] });
assert.equal(churn.retention.churnRate, 1); assert.equal(churn.retention.exitedClients, 1);
assert.equal(churn.calculatedCents, null, 'Partial service never assumes proration');
console.log('Agency leadership trends tests passed.');

import type { AgencyBillingRecord, BillingEvidence, BillingEvent } from '../src/lib/agency/billing-types';
import { reviewCalculatedFee, recordInvoice, recordReceipt } from '../src/lib/agency/billing-model';
const evidence: BillingEvidence = { client, terms: client.terms[0], periodStart: '2026-01-01', periodEnd: '2026-01-31', managedGmvCents: null, gmvComplete: false, recordedThrough: null, calculatedAt: '2026-02-01T00:00:00Z' };
const event = (revision: number, action: BillingEvent['action'], extra: Partial<BillingEvent> = {}): BillingEvent => ({ revision, action, actorId: 'test', at: '2026-02-01T00:00:00Z', reason: null, ...extra });
const record = reviewCalculatedFee({ calculatedCents: 10000, clientRevision: 1 });
const snapshots: AgencyBillingRecord[] = [{ clientId: 'a', month: '2026-01', revision: 1, record, evidence, events: [event(1, 'review')], updatedAt: '2026-02-01T00:00:00Z' }];
function next(value: AgencyBillingRecord['record'], action: BillingEvent['action'], extra: Partial<BillingEvent> = {}) {
  const last = snapshots.at(-1)!; const revision = last.revision + 1;
  snapshots.push({ ...last, revision, record: value, events: [...last.events, event(revision, action, extra)] });
}
next(recordInvoice(record, { reference: 'INV-1', issuedOn: '2026-02-01', dueOn: '2026-03-01' }), 'invoice');
next(recordReceipt(snapshots.at(-1)!.record, { id: 'r1', reference: 'BANK-1', receivedOn: '2026-03-10', amountCents: 10000 }), 'receipt');
next({ ...snapshots.at(-1)!.record, receipts: [] }, 'reverse_receipt', { receiptId: 'r1', effectiveOn: '2026-04-01', reason: 'Returned' });
next({ ...snapshots.at(-1)!.record, invoice: null }, 'void_invoice', { effectiveOn: '2026-04-02', reason: 'Wrong invoice' });
const timeline = summarizeBillingTimeline({ records: [snapshots.at(-1)!], history: snapshots, storageReady: true, canEdit: true }, ['2026-01', '2026-02', '2026-03', '2026-04']);
assert.equal(timeline.get('2026-01')!.reviewedCents, 10000);
assert.equal(timeline.get('2026-02')!.invoicedCents, 10000);
assert.equal(timeline.get('2026-03')!.receivedCents, 10000);
assert.equal(timeline.get('2026-04')!.receivedCents, -10000);
assert.equal(timeline.get('2026-04')!.invoicedCents, -10000);
assert.throws(() => summarizeBillingTimeline({ records: [], history: snapshots.slice(1), storageReady: true, canEdit: true }, ['2026-03']));
console.log('Agency billing timeline tests passed.');

assert.throws(() => summarizeBillingTimeline({ records: [snapshots.at(-1)!], history: [], storageReady: true, canEdit: true }, ['2026-03']));
