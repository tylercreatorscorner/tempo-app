import { z } from 'zod';

const monthPattern = /^(20\d{2}|2100)-(0[1-9]|1[0-2])$/;
const validDate = (value: string) => {
  if (!/^(19|20|21)\d{2}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
const date = z.string().refine(validDate, 'Enter a valid calendar date');
const money = z.number().finite().min(0).max(100000000).refine(value => Math.round(value * 100) / 100 === value, 'Use two decimal places');
export const DEFAULT_CREATOR_RATE = { monthlyFee: 500, maxCreators: 50, monthlyBudgetCap: 100000 } as const;
export const creatorRateSchema = z.object({ monthlyFee: money, maxCreators: z.number().int().min(1).max(10000), monthlyBudgetCap: money }).strict();
export type CreatorRate = z.infer<typeof creatorRateSchema>;
export const creatorBillingCreatorSchema = z.object({
  id: z.uuid().transform(value => value.toLowerCase()),
  handle: z.string().transform(value => value.trim().replace(/^@+/, '').toLowerCase()).pipe(z.string().regex(/^[a-z0-9_.]{1,100}$/, 'Enter a TikTok handle')),
  activeFrom: date, activeThrough: date.nullable(),
  approved: z.boolean(), onboarded: z.boolean(), tapAuthorized: z.boolean(), tier: z.enum(['L2', 'L3', 'L4']),
}).strict().superRefine((row, context) => {
  if (row.activeThrough !== null && row.activeThrough < row.activeFrom) context.addIssue({ code: 'custom', message: 'Active through cannot precede active from' });
});
export type CreatorBillingCreator = z.infer<typeof creatorBillingCreatorSchema>;
export const creatorBillingPeriodSchema = z.object({
  month: z.string().regex(monthPattern), rosterConfirmed: z.boolean(),
  headcountApproval: z.string().trim().max(4000).default(''), budgetApproval: z.string().trim().max(4000).default(''),
  creators: z.array(creatorBillingCreatorSchema).max(10000),
}).strict().superRefine((period, context) => {
  if (new Set(period.creators.map(row => row.id)).size !== period.creators.length) context.addIssue({ code: 'custom', message: 'Each creator row ID must be unique within the month' });
  if (new Set(period.creators.map(row => row.handle)).size !== period.creators.length) context.addIssue({ code: 'custom', message: 'Each creator handle must be unique within the month' });
});
export type CreatorBillingPeriod = z.infer<typeof creatorBillingPeriodSchema>;
export const creatorBillingPeriodsSchema = z.array(creatorBillingPeriodSchema).max(240).superRefine((periods, context) => {
  if (new Set(periods.map(period => period.month)).size !== periods.length) context.addIssue({ code: 'custom', message: 'Each creator billing month must be unique' });
  if (periods.reduce((count, period) => count + period.creators.length, 0) > 12000) context.addIssue({ code: 'custom', message: 'Use at most 12000 creator rows across all billing periods' });
});
export interface CreatorBillingResult {
  month: string; throughDate: string; daysInMonth: number; rosterConfirmed: boolean;
  eligibleCount: number | null; feeCents: number | null; stipendCents: number | null;
  combinedCents: number | null; fullMonthCombinedCents: number | null;
  creators: Array<{ id: string; handle: string; tier: CreatorBillingCreator['tier']; eligible: boolean; activeDays: number;
    sourceFeeCents: number; stipendCents: number; missingRequirements: string[] }>;
  blocked: boolean; reasons: string[];
}
export interface CreatorBillingSnapshot { settingsRevision: number; period: CreatorBillingPeriod; result: CreatorBillingResult }
export interface CreatorBillingInput {
  client: { serviceStart: string | null; serviceEnd: string | null };
  month: string; throughDate: string; rate: CreatorRate; period: CreatorBillingPeriod | null;
}
const STIPEND_CENTS = { L2: 50000, L3: 150000, L4: 350000 } as const;
function safeNumber(value: bigint) { const number = Number(value); if (!Number.isSafeInteger(number)) throw new Error('Creator billing exceeds supported limits'); return number; }
function prorated(cents: number, activeDays: number, calendarDays: number) {
  return safeNumber((BigInt(cents) * BigInt(activeDays) * BigInt(2) + BigInt(calendarDays)) / (BigInt(calendarDays) * BigInt(2)));
}
function days(start: string, end: string) { return end < start ? 0 : Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000) + 1; }

/** Contract sourcing income and creator stipends are calculated independently.
 * TAP authorization is an eligibility gate; the separate 22% TAP is never a fee.
 */
export function calculateCreatorBilling(input: CreatorBillingInput): CreatorBillingResult {
  if (!monthPattern.test(input.month)) throw new Error('Invalid creator billing month');
  const [year, month] = input.month.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const monthStart = `${input.month}-01`, monthEnd = `${input.month}-${daysInMonth}`;
  const priorDay = new Date(`${monthStart}T00:00:00Z`); priorDay.setUTCDate(priorDay.getUTCDate() - 1);
  if (!validDate(input.throughDate) || input.throughDate < priorDay.toISOString().slice(0, 10) || input.throughDate > monthEnd) throw new Error('Invalid creator billing through date');
  const rate = creatorRateSchema.parse(input.rate);
  const period = input.period === null ? null : creatorBillingPeriodSchema.parse(input.period);
  if (period && period.month !== input.month) throw new Error('Creator ledger belongs to another month');
  const result: CreatorBillingResult = { month: input.month, throughDate: input.throughDate, daysInMonth,
    rosterConfirmed: period?.rosterConfirmed ?? false, eligibleCount: null, feeCents: null, stipendCents: null, combinedCents: null,
    fullMonthCombinedCents: null, creators: [], blocked: true, reasons: [] };
  if (!period?.rosterConfirmed) result.reasons.push('Confirm the actual creator roster for this service month.');
  const start = input.client.serviceStart, end = input.client.serviceEnd;
  if (!start || !validDate(start)) result.reasons.push('Add the confirmed service start date.');
  else if (end !== null && (!validDate(end) || end < start)) result.reasons.push('Review the recorded service dates.');
  const lifecycleKnown = Boolean(start && validDate(start) && (end === null || (validDate(end) && end >= start)));
  let eligibleCount = 0, feeTotal = BigInt(0), stipendTotal = BigInt(0), fullCombined = BigInt(0);
  for (const creator of period?.creators ?? []) {
    const missingRequirements = (['approved', 'onboarded', 'tapAuthorized'] as const).filter(key => !creator[key]);
    const activeStart = [monthStart, creator.activeFrom, ...(lifecycleKnown ? [start!] : [])].sort().at(-1)!;
    const activeEnd = [monthEnd, ...(creator.activeThrough ? [creator.activeThrough] : []), ...(end && lifecycleKnown ? [end] : [])].sort()[0];
    const fullDays = lifecycleKnown ? days(activeStart, activeEnd) : 0;
    const eligible = missingRequirements.length === 0 && fullDays > 0;
    if (eligible) eligibleCount++;
    const activeDays = eligible && period?.rosterConfirmed ? days(activeStart, activeEnd < input.throughDate ? activeEnd : input.throughDate) : 0;
    const sourceFeeCents = prorated(Math.round(rate.monthlyFee * 100), activeDays, daysInMonth);
    const stipendCents = prorated(STIPEND_CENTS[creator.tier], activeDays, daysInMonth);
    feeTotal += BigInt(sourceFeeCents); stipendTotal += BigInt(stipendCents);
    if (eligible && period?.rosterConfirmed) fullCombined += BigInt(prorated(Math.round(rate.monthlyFee * 100), fullDays, daysInMonth)) + BigInt(prorated(STIPEND_CENTS[creator.tier], fullDays, daysInMonth));
    result.creators.push({ id: creator.id, handle: creator.handle, tier: creator.tier, eligible, activeDays, sourceFeeCents, stipendCents, missingRequirements });
  }
  if (period?.rosterConfirmed && lifecycleKnown) {
    result.eligibleCount = eligibleCount; result.fullMonthCombinedCents = safeNumber(fullCombined);
    if (eligibleCount > rate.maxCreators && !period.headcountApproval) result.reasons.push('Monthly eligible creator count exceeds the approved maximum. Add written headcount approval.');
    if (fullCombined > BigInt(Math.round(rate.monthlyBudgetCap * 100)) && !period.budgetApproval) result.reasons.push('Monthly source fees plus creator stipends exceed the approved budget cap. Add written budget approval.');
    if (result.reasons.length === 0) {
      result.feeCents = safeNumber(feeTotal); result.stipendCents = safeNumber(stipendTotal);
      result.combinedCents = safeNumber(feeTotal + stipendTotal); result.blocked = false;
    }
  }
  return result;
}
