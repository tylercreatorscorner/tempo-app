import { z } from 'zod';
import { agencyMonthBounds, calculateServiceRevenue, isAgencyDate, type ClientRecord } from './model';

const date = z.string().refine(isAgencyDate, 'Enter a valid date');
const month = z.string().regex(/^(20\d{2}|2100)-(0[1-9]|1[0-2])$/);
const amount = z.number().finite().min(0).max(100000000).refine(n => Math.round(n * 100) / 100 === n, 'Use two decimal places');
const text = (max: number) => z.string().trim().max(max);
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
  managerTerms: z.array(z.object({ effectiveMonth: month, managerId: z.uuid(), fixedMonthly: amount,
    gmvPercent: amount.refine(n => n <= 100), payoutDays: z.literal(7),
  }).strict()).max(240).refine(rows => new Set(rows.map(r => r.effectiveMonth)).size === rows.length, 'Each manager effective month must be unique'),
  forecastGmv: z.array(z.object({ month, amount }).strict()).max(36)
    .refine(rows => new Set(rows.map(r => r.month)).size === rows.length, 'Each forecast month must be unique'),
}).strict();
export type FinanceSettings = z.infer<typeof financeSettingsSchema>;
export const emptyFinanceSettings = (): FinanceSettings => financeSettingsSchema.parse({ agencyName: '', agencyAddress: '', paymentInstructions: '', legalName: '', billingEmail: '', billingContact: '', billingAddress: '', taxId: '', purchaseOrder: '', currency: 'USD', invoiceDay: 1, netDays: 30, collectionDelayDays: 0, signedDate: null, campaignStart: null, renewalDate: null, noticeDays: null, autoRenew: 'unknown', notes: '', managerTerms: [], forecastGmv: [] });
export type FinanceRecord = { client_id: string; revision: number; settings: FinanceSettings };
export type InvoiceSnapshot = { clientName: string; billing: FinanceSettings; clientRevision: number; settingsRevision: number;
  agencyTerms: NonNullable<ReturnType<typeof calculateServiceRevenue>['terms']>; manager: FinanceSettings['managerTerms'][number];
  gmvCents: number; feeCents: number; managerCents: number; issuedDate: string; dueDate: string; expectedDate: string };
export type AgencyInvoice = { id: string; client_id: string; month: string; revision: number; status: 'draft' | 'issued' | 'paid' | 'void'; snapshot: InvoiceSnapshot; collected_on: string | null; manager_paid_on: string | null };
export function addDays(day: string, days: number) { const value = new Date(`${day}T00:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); }
export function shiftMonth(value: string, offset: number) { const [y, m] = value.split('-').map(Number); return new Date(Date.UTC(y, m - 1 + offset, 1)).toISOString().slice(0, 7); }
export function managerFor(settings: FinanceSettings, month: string) { return settings.managerTerms.filter(t => t.effectiveMonth <= month).sort((a, b) => b.effectiveMonth.localeCompare(a.effectiveMonth))[0] ?? null; }
export function readiness(settings: FinanceSettings) { return Boolean(settings.legalName && settings.billingEmail && settings.billingAddress); }
export function buildInvoice(client: ClientRecord, record: FinanceRecord, month: string, gmvCents: number, issuedDate: string): InvoiceSnapshot {
  if (record.settings.termsReviewRequired) throw new Error('Review the contract differences and confirm the billing agreement before preparing an invoice.');
  if (!readiness(record.settings)) throw new Error('Complete the legal name, billing email, and billing address first.');
  if (!record.settings.agencyName || !record.settings.agencyAddress || !record.settings.paymentInstructions) throw new Error('Add the issuing agency name, address, and payment instructions before invoicing.');
  const bounds = agencyMonthBounds(month);
  const fee = calculateServiceRevenue({ client, month, periodStart: bounds.start, periodEnd: bounds.end, gmvCents, gmvComplete: true });
  const manager = managerFor(record.settings, month);
  if (!manager) throw new Error('Add a manager pay arrangement for this service month.');
  if (fee.status !== 'calculated' || fee.revenueCents === null || !fee.terms) throw new Error('Review service dates and agency terms. Partial service months require manual review.');
  if (!Number.isSafeInteger(gmvCents) || gmvCents < 0) throw new Error('Complete managed GMV is required.');
  const managerCents = Math.round(manager.fixedMonthly * 100) + Number((BigInt(gmvCents) * BigInt(Math.round(manager.gmvPercent * 100)) + BigInt(5000)) / BigInt(10000));
  if (!Number.isSafeInteger(managerCents)) throw new Error('Manager amount exceeds supported limits.');
  const dueDate = addDays(issuedDate, record.settings.netDays);
  return { clientName: client.name, billing: record.settings, clientRevision: client.revision, settingsRevision: record.revision,
    agencyTerms: fee.terms, manager, gmvCents, feeCents: fee.revenueCents, managerCents, issuedDate, dueDate,
    expectedDate: addDays(dueDate, record.settings.collectionDelayDays) };
}
export type CashEvent = { clientId: string; clientName: string; month: string; source: 'Invoice' | 'Draft' | 'Estimate'; receiptDate: string | null; payoutDate: string | null; receiptCents: number; payoutCents: number; overdue: boolean };
export function forecast(clients: ClientRecord[], records: FinanceRecord[], invoices: AgencyInvoice[], today: string, delay = 0) {
  const events: CashEvent[] = [], missing: string[] = [];
  for (const invoice of invoices.filter(i => i.status !== 'void')) {
    const s = invoice.snapshot;
    const expected = addDays(s.expectedDate, delay);
    const receiptDate = invoice.status === 'paid' ? null : expected < today ? today : expected;
    const payoutDate = invoice.manager_paid_on ? null : invoice.collected_on ? addDays(invoice.collected_on, s.manager.payoutDays) : addDays(receiptDate!, s.manager.payoutDays);
    events.push({ clientId: invoice.client_id, clientName: s.clientName, month: invoice.month, source: invoice.status === 'draft' ? 'Draft' : 'Invoice', receiptDate, payoutDate,
      receiptCents: receiptDate ? s.feeCents : 0, payoutCents: payoutDate ? s.managerCents : 0, overdue: Boolean((receiptDate && expected < today) || (payoutDate && payoutDate < today)) });
  }
  for (const client of clients) {
    const record = records.find(r => r.client_id === client.id);
    // Include last month's unbilled service as well as months feeding the 13-week window.
    for (let offset = -1; offset <= 3; offset++) {
      const month = shiftMonth(today.slice(0, 7), offset), bounds = agencyMonthBounds(month);
      if (client.serviceStart && (client.serviceStart > bounds.end || (client.serviceEnd && client.serviceEnd < bounds.start))) continue;
      if (invoices.some(i => i.client_id === client.id && i.month === month && i.status !== 'void')) continue;
      const gmv = record?.settings.forecastGmv.find(f => f.month === month);
      if (record && !gmv) {
        const scheduledInvoice = `${shiftMonth(month, 1)}-${String(record.settings.invoiceDay).padStart(2, '0')}`;
        const expectedReceipt = addDays(scheduledInvoice, record.settings.netDays + record.settings.collectionDelayDays + delay);
        if (expectedReceipt > addDays(today, 90)) continue;
      }
      if (!record || !gmv) { missing.push(`${client.name} · ${month}: add a GMV estimate`); continue; }
      try {
        const s = buildInvoice(client, record, month, Math.round(gmv.amount * 100), `${shiftMonth(month, 1)}-${String(record.settings.invoiceDay).padStart(2, '0')}`);
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
