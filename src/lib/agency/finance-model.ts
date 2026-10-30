import { z } from 'zod';
import { agencyMonthBounds, calculateFeeComponent, calculateServiceRevenue, clientServicePeriod, isAgencyDate, selectMonthTerms, servicePeriodMatches, type ClientRecord } from './model';
import { calculateCreatorBilling, creatorBillingPeriodSchema, creatorBillingPeriodsSchema, type CreatorBillingSnapshot } from './creator-billing';

const date = z.string().refine(isAgencyDate, 'Enter a valid date');
const month = z.string().regex(/^(20\d{2}|2100)-(0[1-9]|1[0-2])$/);
const amount = z.number().finite().min(0).max(100000000).refine(n => Math.round(n * 100) / 100 === n, 'Use two decimal places');
const text = (max: number) => z.string().trim().max(max);
const compensationModel = z.enum(['additive', 'minimum']).default('additive');
const servicePeriodSchema = z.object({ start: date, end: date }).strict();
const managerAllocationSchema = z.object({ managerId: z.uuid(), fixedMonthly: amount, gmvPercent: amount.refine(n => n <= 100), compensationModel }).strict();
const managerTermsSchema = z.object({ effectiveMonth: month, managerId: z.uuid(), fixedMonthly: amount,
  gmvPercent: amount.refine(n => n <= 100), payoutDays: z.literal(7), compensationModel,
  allocations: z.array(managerAllocationSchema).min(1).max(20).optional(),
  servicePeriod: servicePeriodSchema.optional(),
}).strict().superRefine((term, context) => {
  if (term.servicePeriod) {
    const bounds = agencyMonthBounds(term.effectiveMonth);
    if (term.servicePeriod.start < bounds.start || term.servicePeriod.end > bounds.end || term.servicePeriod.start > term.servicePeriod.end) context.addIssue({ code: 'custom', message: 'Approved service period must be within its effective month' });
  }
  if (!term.allocations?.length) return;
  if (new Set(term.allocations.map(row => row.managerId.toLowerCase())).size !== term.allocations.length) context.addIssue({ code: 'custom', message: 'Each pay recipient must be unique' });
  if (term.managerId.toLowerCase() !== term.allocations[0].managerId.toLowerCase()) context.addIssue({ code: 'custom', message: 'The lead manager must match the first allocation' });
  if (Math.round(term.fixedMonthly * 100) !== term.allocations.reduce((sum, row) => sum + Math.round(row.fixedMonthly * 100), 0) ||
    Math.round(term.gmvPercent * 100) !== term.allocations.reduce((sum, row) => sum + Math.round(row.gmvPercent * 100), 0) || term.compensationModel !== 'additive') context.addIssue({ code: 'custom', message: 'Arrangement totals must match its allocations; each allocation sets its own calculation' });
});
export type ManagerAllocation = z.input<typeof managerAllocationSchema>;
export type ManagerTerms = z.input<typeof managerTermsSchema>;
export const financeSettingsSchema = z.object({
  agencyName: text(200), agencyAddress: text(2000), paymentInstructions: text(2000),
  legalName: text(200), billingEmail: z.union([z.literal(''), z.email()]), billingContact: text(200),
  billingCc: z.union([z.literal(''), z.email()]).default(''),
  billingAddress: text(2000), taxId: text(100), purchaseOrder: text(100), currency: z.literal('USD'),
  invoiceDay: z.number().int().min(1).max(28), netDays: z.number().int().min(0).max(365),
  collectionDelayDays: z.number().int().min(0).max(365),
  signedDate: date.nullable(), campaignStart: date.nullable(), renewalDate: date.nullable(),
  contractEffectiveDate: date.nullable().default(null), clientSignedDate: date.nullable().default(null), agencySignedDate: date.nullable().default(null),
  estimatedCampaignStart: date.nullable().default(null), terminationNoticeDays: z.number().int().min(0).max(365).nullable().default(null),
  termsReviewRequired: z.boolean().default(false), termsReviewNotes: text(4000).default(''),
  noticeDays: z.number().int().min(0).max(365).nullable(), autoRenew: z.enum(['unknown', 'yes', 'no']),
  notes: text(4000),
  managerTerms: z.array(managerTermsSchema).max(240).refine(rows => new Set(rows.map(r => r.effectiveMonth)).size === rows.length, 'Each manager effective month must be unique'),
  creatorBillingPeriods: creatorBillingPeriodsSchema.default([]),
  forecastGmv: z.array(z.object({ month, amount }).strict()).max(36)
    .refine(rows => new Set(rows.map(r => r.month)).size === rows.length, 'Each forecast month must be unique'),
}).strict();
export type FinanceSettings = Omit<z.infer<typeof financeSettingsSchema>, 'managerTerms'> & { managerTerms: ManagerTerms[] };
export const emptyFinanceSettings = (): FinanceSettings => financeSettingsSchema.parse({ agencyName: '', agencyAddress: '', paymentInstructions: '', legalName: '', billingEmail: '', billingContact: '', billingAddress: '', taxId: '', purchaseOrder: '', currency: 'USD', invoiceDay: 1, netDays: 30, collectionDelayDays: 0, signedDate: null, campaignStart: null, renewalDate: null, noticeDays: null, autoRenew: 'unknown', notes: '', managerTerms: [], forecastGmv: [] });
export type FinanceRecord = { client_id: string; revision: number; settings: FinanceSettings };
export type InvoiceSnapshot = { clientName: string; billing: FinanceSettings; clientRevision: number; settingsRevision: number;
  agencyTerms: NonNullable<ReturnType<typeof calculateServiceRevenue>['terms']>; manager: FinanceSettings['managerTerms'][number];
  gmvCents: number | null; feeCents: number; managerCents: number; issuedDate: string; dueDate: string; expectedDate: string;
  creatorBilling?: CreatorBillingSnapshot };
export type AgencyInvoice = { id: string; client_id: string; month: string; revision: number; status: 'draft' | 'issued' | 'paid' | 'void'; snapshot: InvoiceSnapshot; collected_on: string | null; manager_paid_on: string | null };
export function addDays(day: string, days: number) { const value = new Date(`${day}T00:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); }
export function shiftMonth(value: string, offset: number) { const [y, m] = value.split('-').map(Number); return new Date(Date.UTC(y, m - 1 + offset, 1)).toISOString().slice(0, 7); }
export function managerFor(settings: Pick<FinanceSettings, 'managerTerms'>, month: string) {
  const selected = settings.managerTerms.filter(t => t.effectiveMonth <= month).sort((a, b) => b.effectiveMonth.localeCompare(a.effectiveMonth))[0] ?? null;
  return selected?.servicePeriod && selected.effectiveMonth !== month ? null : selected;
}
export function managerAllocations(term: ManagerTerms): ManagerAllocation[] { return term.allocations ?? [{ managerId: term.managerId, fixedMonthly: term.fixedMonthly, gmvPercent: term.gmvPercent, compensationModel: term.compensationModel ?? 'additive' }]; }
export function calculateManagerCompensation(term: ManagerTerms, gmvCents: number | null) {
  const recipients = managerAllocations(term);
  if (gmvCents === null && recipients.some(row => row.gmvPercent !== 0)) throw new Error('Complete managed GMV is required for the manager pay arrangement.');
  const allocations = recipients.map(row => ({ ...row, compensationModel: row.compensationModel ?? 'additive', amountCents: calculateFeeComponent(gmvCents ?? 0, row.fixedMonthly, row.gmvPercent, row.compensationModel ?? 'additive').totalCents }));
  const totalCents = allocations.reduce((sum, row) => sum + row.amountCents, 0);
  if (!Number.isSafeInteger(totalCents)) throw new Error('Manager amount exceeds supported limits.');
  return { totalCents, allocations };
}
export function readiness(settings: FinanceSettings) { return Boolean(settings.legalName && settings.billingEmail && settings.billingAddress); }
export function buildInvoice(client: ClientRecord, record: FinanceRecord, month: string, gmvCents: number | null, issuedDate: string): InvoiceSnapshot {
  if (client.historical) throw new Error('Past agreements are kept for history. Reactivate this client before preparing a new invoice.');
  if (record.settings.termsReviewRequired) throw new Error('Review the contract differences and confirm the billing agreement before preparing an invoice.');
  if (!readiness(record.settings)) throw new Error('Complete the legal name, billing email, and billing address first.');
  if (!record.settings.agencyName || !record.settings.agencyAddress || !record.settings.paymentInstructions) throw new Error('Add the issuing agency name, address, and payment instructions before invoicing.');
  const bounds = agencyMonthBounds(month);
  const terms = selectMonthTerms(client.terms, month);
  const manager = managerFor(record.settings, month);
  if (!manager) throw new Error('Add a manager pay arrangement for this service month.');
  let feeCents: number;
  let creatorBilling: CreatorBillingSnapshot | undefined;
  if (terms?.feeModel === 'per_creator') {
    const servicePeriod = clientServicePeriod(client, month);
    const partialService = servicePeriod && (servicePeriod.start !== bounds.start || servicePeriod.end !== bounds.end);
    if (!servicePeriod || (partialService && !servicePeriodMatches(manager.servicePeriod, servicePeriod))
      || (manager.servicePeriod && !servicePeriodMatches(manager.servicePeriod, servicePeriod))) throw new Error('Review the approved manager pay period for this service month.');
    if (!terms.creatorRate) throw new Error('Add the per-creator sourcing rate.');
    const rawPeriod = (record.settings.creatorBillingPeriods ?? []).find(value => value.month === month) ?? null;
    const period = rawPeriod ? creatorBillingPeriodSchema.parse(rawPeriod) : null;
    const result = calculateCreatorBilling({ client, month, throughDate: bounds.end, rate: terms.creatorRate, period });
    if (result.blocked || result.feeCents === null || !period) throw new Error(result.reasons.join(' ') || 'Confirm the creator billing ledger before invoicing.');
    feeCents = result.feeCents; creatorBilling = { settingsRevision: record.revision, period, result };
    if (managerAllocations(manager).every(row => row.gmvPercent === 0)) gmvCents = null;
  } else {
    const fee = calculateServiceRevenue({ client, month, periodStart: bounds.start, periodEnd: bounds.end, gmvCents, gmvComplete: true });
    if (fee.status !== 'calculated' || fee.revenueCents === null || !fee.terms) throw new Error('Review service dates and agency terms. Partial service months require manual review.');
    if (gmvCents === null || !Number.isSafeInteger(gmvCents) || gmvCents < 0) throw new Error('Complete managed GMV is required.');
    feeCents = fee.revenueCents;
  }
  if (!terms) throw new Error('Add agency terms for this service month.');
  const managerCents = calculateManagerCompensation(manager, gmvCents).totalCents;
  if (!Number.isSafeInteger(managerCents)) throw new Error('Manager amount exceeds supported limits.');
  const dueDate = addDays(issuedDate, record.settings.netDays);
  return { clientName: client.name, billing: record.settings, clientRevision: client.revision, settingsRevision: record.revision,
    agencyTerms: terms, manager, gmvCents, feeCents, managerCents, ...(creatorBilling ? { creatorBilling } : {}), issuedDate, dueDate,
    expectedDate: addDays(dueDate, record.settings.collectionDelayDays) };
}
export type CashEvent = { clientId: string; clientName: string; month: string; source: 'Invoice' | 'Draft' | 'Estimate'; receiptDate: string | null; payoutDate: string | null; receiptCents: number; payoutCents: number; overdue: boolean };
export function forecast(clients: ClientRecord[], records: FinanceRecord[], invoices: AgencyInvoice[], today: string, delay = 0) {
  const events: CashEvent[] = [], missing: string[] = [];
  const historicalIds = new Set(clients.filter(client => client.historical).map(client => client.id));
  // Issued/collected obligations survive archiving. Unissued drafts remain historical records.
  for (const invoice of invoices.filter(i => i.status !== 'void' && !(i.status === 'draft' && historicalIds.has(i.client_id)))) {
    const s = invoice.snapshot;
    const expected = addDays(s.expectedDate, delay);
    const receiptDate = invoice.status === 'paid' ? null : expected < today ? today : expected;
    const payoutDate = invoice.manager_paid_on ? null : invoice.collected_on ? addDays(invoice.collected_on, s.manager.payoutDays) : addDays(receiptDate!, s.manager.payoutDays);
    events.push({ clientId: invoice.client_id, clientName: s.clientName, month: invoice.month, source: invoice.status === 'draft' ? 'Draft' : 'Invoice', receiptDate, payoutDate,
      receiptCents: receiptDate ? s.feeCents : 0, payoutCents: payoutDate ? s.managerCents : 0, overdue: Boolean((receiptDate && expected < today) || (payoutDate && payoutDate < today)) });
  }
  for (const client of clients) {
    if (client.historical) continue;
    const record = records.find(r => r.client_id === client.id);
    // Include last month's unbilled service as well as months feeding the 13-week window.
    for (let offset = -1; offset <= 3; offset++) {
      const month = shiftMonth(today.slice(0, 7), offset), bounds = agencyMonthBounds(month);
      if (client.serviceStart && (client.serviceStart > bounds.end || (client.serviceEnd && client.serviceEnd < bounds.start))) continue;
      if (invoices.some(i => i.client_id === client.id && i.month === month && i.status !== 'void')) continue;
      const creatorFee = selectMonthTerms(client.terms, month)?.feeModel === 'per_creator';
      const manager = record ? managerFor(record.settings, month) : null;
      const needsGmv = !creatorFee || Boolean(manager && managerAllocations(manager).some(recipient => recipient.gmvPercent !== 0));
      const ledger = record?.settings.creatorBillingPeriods?.find(period => period.month === month);
      const gmv = record?.settings.forecastGmv.find(f => f.month === month);
      if (record && ((needsGmv && !gmv) || (creatorFee && !ledger?.rosterConfirmed))) {
        const scheduledInvoice = `${shiftMonth(month, 1)}-${String(record.settings.invoiceDay).padStart(2, '0')}`;
        const expectedReceipt = addDays(scheduledInvoice, record.settings.netDays + record.settings.collectionDelayDays + delay);
        if (expectedReceipt > addDays(today, 90)) continue;
      }
      if (!record) { missing.push(`${client.name} · ${month}: ${creatorFee ? 'add finance settings and confirm the actual creator roster' : 'add a GMV estimate'}`); continue; }
      if (creatorFee && !ledger?.rosterConfirmed) { missing.push(`${client.name} · ${month}: confirm the actual creator roster for this service month`); continue; }
      if (needsGmv && !gmv) { missing.push(`${client.name} · ${month}: add a GMV estimate${creatorFee ? ' for manager pay' : ''}`); continue; }
      try {
        const s = buildInvoice(client, record, month, needsGmv && gmv ? Math.round(gmv.amount * 100) : null, `${shiftMonth(month, 1)}-${String(record.settings.invoiceDay).padStart(2, '0')}`);
        const expected = addDays(s.expectedDate, delay), receiptDate = expected < today ? today : expected;
        events.push({ clientId: client.id, clientName: client.name, month, source: 'Estimate', receiptDate, payoutDate: addDays(receiptDate, 7), receiptCents: s.feeCents, payoutCents: s.managerCents, overdue: expected < today });
      } catch (error) { missing.push(`${client.name} · ${month}: ${(error as Error).message}`); }
    }
  }
  const weeks = Array.from({ length: 13 }, (_, i) => {
    const start = addDays(today, i * 7), end = addDays(start, 6);
    const receiptCents = events.reduce((sum, e) => sum + (e.receiptDate && e.receiptDate >= start && e.receiptDate <= end ? e.receiptCents : 0), 0);
    const payoutCents = events.reduce((sum, e) => sum + (e.payoutDate && (e.payoutDate < today ? today : e.payoutDate) >= start && (e.payoutDate < today ? today : e.payoutDate) <= end ? e.payoutCents : 0), 0);
    return { start, end, receiptCents, payoutCents, retainedCents: receiptCents - payoutCents };
  });
  return { weeks, events, missing };
}
