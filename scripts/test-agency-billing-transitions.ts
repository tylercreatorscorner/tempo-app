import assert from 'node:assert/strict';
import { transitionBilling, validateBillingMutation } from '../src/lib/agency/billing-transitions';
import type { BillingEvidence, BillingMutation } from '../src/lib/agency/billing-types';
const id='00000000-0000-4000-8000-000000000001';
const base={clientId:id,month:'2025-01',expectedRevision:0,requestId:id};
const evidence:BillingEvidence={client:{id,revision:1,name:'Fixture',brandIds:[],serviceStart:'2025-01-01',serviceEnd:null,exitReason:null,terms:[],updatedAt:null},terms:{effectiveMonth:'2025-01',monthlyRetainer:100,revSharePercent:0,feeModel:'fixed'},periodStart:'2025-01-01',periodEnd:'2025-01-31',managedGmvCents:null,gmvComplete:false,recordedThrough:null,calculatedAt:'2025-02-02T12:00:00Z'};
const input:BillingMutation={...base,action:'review',clientRevision:1,expectedCalculatedCents:10000,adjustmentCents:0};
const at='2025-02-02T12:00:00Z';
assert.throws(()=>validateBillingMutation({...input,action:'toString'}),/Invalid/);
assert.throws(()=>validateBillingMutation({...input,tenantId:id}),/Unknown/);
assert.throws(()=>validateBillingMutation({...input,action:'correct_review'}),/reason/);
assert.throws(()=>transitionBilling(null,{...input,expectedCalculatedCents:500},id,at,{evidence,calculatedCents:10000}),/changed/);
const first=transitionBilling(null,input,id,at,{evidence,calculatedCents:10000});
assert.throws(()=>transitionBilling(first,input,id,at,{evidence,calculatedCents:10000}),/changed/);
const invoice=transitionBilling(first,{...base,expectedRevision:1,action:'invoice',reference:'INV-1',issuedOn:'2025-02-01',dueOn:'2025-02-10'},id,at);
assert.throws(()=>transitionBilling(first,{...base,expectedRevision:1,action:'invoice',reference:'INV-1',issuedOn:'2025-02-02',dueOn:'2025-02-10'},id,'2025-02-02T01:00:00Z'),/future/);
const receipt=transitionBilling(invoice,{...base,expectedRevision:2,action:'receipt',reference:'PAY-1',receivedOn:'2025-02-02',amountCents:10000},id,at);
assert.throws(()=>transitionBilling(receipt,{...base,expectedRevision:3,action:'void_invoice',reason:'Correction',effectiveOn:'2025-02-02'},id,at),/Reverse/);
const reversed=transitionBilling(receipt,{...base,expectedRevision:3,action:'reverse_receipt',receiptId:id,reason:'Bank reversal',effectiveOn:'2025-02-02'},id,at);
assert.equal(reversed.record.receipts.length,0);assert.equal(receipt.record.receipts.length,1);
const voided=transitionBilling(reversed,{...base,expectedRevision:4,action:'void_invoice',reason:'Wrong invoice',effectiveOn:'2025-02-02'},id,at);
const corrected=transitionBilling(voided,{...input,expectedRevision:5,action:'correct_review',adjustmentCents:-100,adjustmentReason:'Credit',reason:'Fee correction'},id,at,{evidence,calculatedCents:10000});
assert.equal(corrected.record.review.reviewedCents,9900);assert.equal(first.record.review.reviewedCents,10000);assert.equal(corrected.events.length,6);
console.log('PASS billing transitions: input boundary, stale source, Chicago dates, correction/reversal order, immutable prior state');

const manual = { ...input, expectedCalculatedCents: null, manualReviewedCents: 7500, reason: 'Agreed partial month fee' };
const partial = { ...evidence, calculationStatus: 'review_required', client: {...evidence.client, serviceStart: '2025-01-15'} };
const manualReview = transitionBilling(null, validateBillingMutation(manual), id, at, {evidence: partial, calculatedCents: null});
assert.equal(manualReview.record.review.calculatedCents, null);
assert.equal(manualReview.record.review.reviewedCents, 7500);
assert.throws(()=>transitionBilling(null, {...manual, reason: ''}, id, at, {evidence:partial,calculatedCents:null}), /explanation/);
assert.throws(()=>transitionBilling(null, manual,id,at,{evidence:{...partial,calculationStatus:'missing_gmv'},calculatedCents:null}), /manual fee/);
assert.throws(()=>validateBillingMutation({...manual,manualReviewedCents:-1}), /Invalid/);

// Recording order must not let effective dates release cash or invoices early.
// Initial invoices can still be genuinely backdated, including before review entry.
const laterAt = '2025-04-02T12:00:00Z';
const initial = transitionBilling(null, input, id, laterAt, {evidence,calculatedCents:10000});
const januaryInvoice = transitionBilling(initial, {...base,expectedRevision:1,action:'invoice',reference:'JAN-1',issuedOn:'2025-01-31',dueOn:'2025-02-15'},id,laterAt);
const februaryReceipt = transitionBilling(januaryInvoice,{...base,expectedRevision:2,action:'receipt',reference:'FEB-1',receivedOn:'2025-02-01',amountCents:10000},id,laterAt);
const marchReversal = transitionBilling(februaryReceipt,{...base,expectedRevision:3,action:'reverse_receipt',receiptId:id,reason:'Returned payment',effectiveOn:'2025-03-01'},id,laterAt);
assert.throws(()=>transitionBilling(marchReversal,{...base,expectedRevision:4,action:'void_invoice',reason:'Correct fee',effectiveOn:'2025-02-02'},id,laterAt),/receipt reversals/);
assert.throws(()=>transitionBilling(marchReversal,{...base,expectedRevision:4,action:'receipt',reference:'REPLACEMENT',receivedOn:'2025-02-15',amountCents:10000},id,laterAt),/latest receipt reversal/);
const sameDayReceipt = transitionBilling(marchReversal,{...base,expectedRevision:4,action:'receipt',reference:'REPLACEMENT',receivedOn:'2025-03-01',amountCents:10000},id,laterAt);
assert.equal(sameDayReceipt.record.receipts[0].receivedOn,'2025-03-01');
const marchVoid = transitionBilling(marchReversal,{...base,expectedRevision:4,action:'void_invoice',reason:'Correct fee',effectiveOn:'2025-03-01'},id,laterAt);
const correctedMarch = transitionBilling(marchVoid,{...input,expectedRevision:5,action:'correct_review',reason:'Correct fee'},id,laterAt,{evidence,calculatedCents:10000});
assert.throws(()=>transitionBilling(correctedMarch,{...base,expectedRevision:6,action:'invoice',reference:'NEW',issuedOn:'2025-02-28',dueOn:'2025-03-15'},id,laterAt),/prior invoice was voided/);
const replacementInvoice = transitionBilling(correctedMarch,{...base,expectedRevision:6,action:'invoice',reference:'NEW',issuedOn:'2025-03-01',dueOn:'2025-03-15'},id,laterAt);
assert.equal(replacementInvoice.record.invoice?.issuedOn,'2025-03-01');

// Separate receipt reversals may be entered out of date order. The latest
// effective reversal, not the last entered reversal, controls the boundary.
const secondId='00000000-0000-4000-8000-000000000002';
const partOne=transitionBilling(januaryInvoice,{...base,expectedRevision:2,action:'receipt',reference:'PART-1',receivedOn:'2025-02-01',amountCents:4000},id,laterAt);
const partTwo=transitionBilling(partOne,{...base,requestId:secondId,expectedRevision:3,action:'receipt',reference:'PART-2',receivedOn:'2025-02-02',amountCents:6000},id,laterAt);
const reverseOne=transitionBilling(partTwo,{...base,expectedRevision:4,action:'reverse_receipt',receiptId:id,reason:'Returned first payment',effectiveOn:'2025-03-10'},id,laterAt);
const reverseTwo=transitionBilling(reverseOne,{...base,expectedRevision:5,action:'reverse_receipt',receiptId:secondId,reason:'Returned second payment',effectiveOn:'2025-03-05'},id,laterAt);
assert.throws(()=>transitionBilling(reverseTwo,{...base,expectedRevision:6,action:'void_invoice',reason:'Correct fee',effectiveOn:'2025-03-07'},id,laterAt),/receipt reversals/);
assert.equal(transitionBilling(reverseTwo,{...base,expectedRevision:6,action:'void_invoice',reason:'Correct fee',effectiveOn:'2025-03-10'},id,laterAt).record.invoice,null);
console.log('PASS billing chronology: backdated initial invoice, receipt reversal boundaries, same-day corrections, replacement invoice and unordered independent reversals');
