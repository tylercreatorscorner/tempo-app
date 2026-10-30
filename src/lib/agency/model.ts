import type { CreatorRate } from './creator-billing';

export type ServicePeriod = { start: string; end: string };
/** Agency service terms only. Creator funding and individual payee earnings are separate. */
export type AgencyTerms = {
  effectiveMonth: string;
  monthlyRetainer: number;
  revSharePercent: number;
  feeModel: "fixed" | "share" | "additive" | "minimum" | "tiered" | "components" | "per_creator";
  creatorRate?: CreatorRate;
  /** Gross client fee = CC additive component plus this independently rounded component. */
  managerComponent?: { monthlyRetainer: number; revSharePercent: number; feeModel: "additive" | "minimum" };
  revShareTiers?: Array<{ upToGmv: number | null; percent: number }>;
  tierCalculation?: "unconfirmed" | "marginal" | "whole";
  gmvBasis?: "managed" | "agency_supported_affiliate";
  /** Explicitly approved amounts for this effective month only; never prorated at runtime. */
  servicePeriod?: ServicePeriod;
};
export type ClientRecord = {
  id: string;
  revision: number;
  name: string;
  /** Past agreements stay on file without implying unknown service dates. Missing means false. */
  historical?: boolean;
  brandIds: string[];
  serviceStart: string | null;
  serviceEnd: string | null;
  exitReason: string | null;
  terms: AgencyTerms[];
  updatedAt: string | null;
};
export type ClientSaveInput = Omit<ClientRecord, "id" | "revision" | "updatedAt"> & {
  id?: string;
  expectedRevision: number;
};
export class AgencyValidationError extends Error {
  constructor(message: string) { super(message); this.name = "AgencyValidationError"; }
}
// Client IDs are generated UUIDs; legacy brand IDs are canonical PostgreSQL UUIDs.
const brandUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail = (message: string): never => { throw new AgencyValidationError(message); };
function object(value: unknown, keys: string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`Invalid ${label}.`);
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some(key => !keys.includes(key))) fail(`Unknown ${label} field.`);
  return record;
}
export function isAgencyDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^(19|20|21)\d{2}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
function hasRecordedServicePeriod(client: ClientRecord): boolean {
  return isAgencyDate(client.serviceStart) && isAgencyDate(client.serviceEnd) && client.serviceStart <= client.serviceEnd;
}
export function agencyMonthBounds(month: string): { start: string; end: string } {
  if (!/^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/.test(month)) fail("Invalid effective month.");
  const [year, part] = month.split("-").map(Number);
  return { start: `${month}-01`, end: `${month}-${new Date(Date.UTC(year, part, 0)).getUTCDate()}` };
}
export function clientServicePeriod(client: Pick<ClientRecord, 'serviceStart' | 'serviceEnd'>, month: string): ServicePeriod | null {
  const bounds = agencyMonthBounds(month);
  if (!isAgencyDate(client.serviceStart) || (client.serviceEnd !== null && (!isAgencyDate(client.serviceEnd) || client.serviceEnd < client.serviceStart))) return null;
  const start = client.serviceStart > bounds.start ? client.serviceStart : bounds.start;
  const end = client.serviceEnd && client.serviceEnd < bounds.end ? client.serviceEnd : bounds.end;
  return start <= end ? { start, end } : null;
}
export function servicePeriodMatches(period: ServicePeriod | undefined, expected: ServicePeriod | null): boolean {
  return Boolean(period && expected && isAgencyDate(period.start) && isAgencyDate(period.end) && period.start === expected.start && period.end === expected.end);
}
function decimal(value: unknown, maximum: number, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > maximum ||
    Math.round(value * 100) / 100 !== value) fail(`Invalid ${label}; use at most two decimal places.`);
  return value as number;
}
export function validateClientSaveInput(input: unknown): ClientSaveInput {
  const row = object(input, ["id", "expectedRevision", "name", "historical", "brandIds", "serviceStart", "serviceEnd", "exitReason", "terms"], "client");
  if (row.id !== undefined && (typeof row.id !== "string" || !uuid.test(row.id))) fail("Invalid client ID.");
  if (!Number.isSafeInteger(row.expectedRevision) || (row.expectedRevision as number) < 0 || (row.expectedRevision as number) > 2147483646 ||
    (row.id === undefined && row.expectedRevision !== 0) || (row.id !== undefined && row.expectedRevision === 0)) fail("Invalid expected revision.");
  if (typeof row.name !== "string" || !row.name.trim() || row.name.trim().length > 200) fail("Client name must contain 1–200 characters.");
  if (row.historical !== undefined && typeof row.historical !== "boolean") fail("Invalid historical client flag.");
  if (!Array.isArray(row.brandIds) || row.brandIds.length > 100 || row.brandIds.some(id => typeof id !== "string" || !brandUuid.test(id))) fail("Invalid brand IDs.");
  const brandIds = (row.brandIds as string[]).map(id => id.toLowerCase());
  if (new Set(brandIds).size !== brandIds.length) fail("Brand IDs must be unique.");
  for (const key of ["serviceStart", "serviceEnd"] as const) if (row[key] !== null && !isAgencyDate(row[key])) fail(`Invalid ${key}.`);
  if (row.exitReason !== null && (typeof row.exitReason !== "string" || !row.exitReason.trim() || row.exitReason.trim().length > 1000)) fail("Invalid exit reason.");
  const start = row.serviceStart as string | null, end = row.serviceEnd as string | null;
  if (end && (!start || start > end || !row.exitReason)) fail("Service end requires a start on or before it and an exit reason.");
  if (!end && row.exitReason !== null) fail("An exit reason requires a service end.");
  if (!Array.isArray(row.terms) || row.terms.length > 240) fail("Invalid monthly terms.");
  const terms = (row.terms as unknown[]).map(value => {
    const term = object(value, ["effectiveMonth", "monthlyRetainer", "revSharePercent", "feeModel", "revShareTiers", "tierCalculation", "gmvBasis", "managerComponent", "servicePeriod", "creatorRate"], "terms");
    if (typeof term.effectiveMonth !== "string") fail("Invalid effective month.");
    agencyMonthBounds(term.effectiveMonth as string);
    if (!["fixed", "share", "additive", "minimum", "tiered", "components", "per_creator"].includes(term.feeModel as string)) fail("Invalid fee model.");
    const extra: Partial<AgencyTerms> = {};
    if (term.feeModel === 'per_creator') {
      const rate = object(term.creatorRate, ['monthlyFee', 'maxCreators', 'monthlyBudgetCap'], 'creator rate');
      if (!Number.isSafeInteger(rate.maxCreators) || (rate.maxCreators as number) < 1 || (rate.maxCreators as number) > 10000 || term.monthlyRetainer !== 0 || term.revSharePercent !== 0) fail('Per-creator billing requires a valid creator rate and zero flat/GMV fees.');
      extra.creatorRate = { monthlyFee: decimal(rate.monthlyFee, 100000000, 'monthly creator sourcing fee'), maxCreators: rate.maxCreators as number, monthlyBudgetCap: decimal(rate.monthlyBudgetCap, 100000000, 'monthly creator budget cap') };
    } else if ('creatorRate' in term) fail('Creator rates require the per-creator fee model.');
    if ('servicePeriod' in term) {
      const period = object(term.servicePeriod, ['start', 'end'], 'approved service period');
      const bounds = agencyMonthBounds(term.effectiveMonth as string);
      if (!isAgencyDate(period.start) || !isAgencyDate(period.end) || period.start < bounds.start || period.end > bounds.end || period.start > period.end ||
        !servicePeriodMatches({ start: period.start, end: period.end }, clientServicePeriod({ serviceStart: start, serviceEnd: end }, term.effectiveMonth as string))) fail('Approved service period must match the client service dates within its effective month.');
      extra.servicePeriod = { start: period.start as string, end: period.end as string };
    }
    if (term.feeModel === "components") {
      const component = object(term.managerComponent, ["monthlyRetainer", "revSharePercent", "feeModel"], "manager fee component");
      if (!["additive", "minimum"].includes(component.feeModel as string)) fail("Invalid manager component fee model.");
      extra.managerComponent = { monthlyRetainer: decimal(component.monthlyRetainer, 100000000, "manager component monthly retainer"),
        revSharePercent: decimal(component.revSharePercent, 100, "manager component revenue share percentage"), feeModel: component.feeModel as "additive" | "minimum" };
    } else if ("managerComponent" in term) fail("Manager fee components require the components fee model.");
    if (term.feeModel === "tiered") {
      if (term.revSharePercent !== 0) fail("Tiered terms require a zero flat revenue share percentage.");
      if (!["unconfirmed", "marginal", "whole"].includes(term.tierCalculation as string)) fail("Invalid tier calculation method.");
      if (!["managed", "agency_supported_affiliate"].includes(term.gmvBasis as string)) fail("Invalid tiered GMV basis.");
      if (!Array.isArray(term.revShareTiers) || term.revShareTiers.length < 1 || term.revShareTiers.length > 20) fail("Use 1–20 revenue share tiers.");
      let previousBound = 0;
      extra.revShareTiers = (term.revShareTiers as unknown[]).map((value, index, tiers) => {
        const tier = object(value, ["upToGmv", "percent"], "revenue share tier");
        const final = index === tiers.length - 1;
        const upper = tier.upToGmv === null ? null : decimal(tier.upToGmv, 100000000000, "tier GMV limit");
        if (final ? upper !== null : upper === null || upper <= previousBound) fail("Tier GMV limits must increase and the final tier must have no upper limit.");
        if (upper !== null) previousBound = upper;
        return { upToGmv: upper, percent: decimal(tier.percent, 100, "tier revenue share percentage") };
      });
      extra.tierCalculation = term.tierCalculation as AgencyTerms["tierCalculation"];
      extra.gmvBasis = term.gmvBasis as AgencyTerms["gmvBasis"];
    } else if (["revShareTiers", "tierCalculation", "gmvBasis"].some(key => key in term)) fail("Tier settings require the tiered fee model.");
    return { effectiveMonth: term.effectiveMonth as string,
      monthlyRetainer: decimal(term.monthlyRetainer, 100000000, "monthly retainer"),
      revSharePercent: decimal(term.revSharePercent, 100, "revenue share percentage"),
      feeModel: term.feeModel as AgencyTerms["feeModel"], ...extra };
  }).sort((a, b) => a.effectiveMonth.localeCompare(b.effectiveMonth));
  if (new Set(terms.map(term => term.effectiveMonth)).size !== terms.length) fail("Each effective month must be unique.");
  return { ...(row.id ? { id: (row.id as string).toLowerCase() } : {}), expectedRevision: row.expectedRevision as number,
    name: (row.name as string).trim(), ...(row.historical !== undefined ? { historical: row.historical as boolean } : {}), brandIds, serviceStart: start, serviceEnd: end,
    exitReason: typeof row.exitReason === "string" ? row.exitReason.trim() : null, terms };
}
export function selectMonthTerms(terms: AgencyTerms[], month: string): AgencyTerms | null {
  agencyMonthBounds(month);
  const selected = terms.filter(term => term.effectiveMonth <= month).sort((a, b) => b.effectiveMonth.localeCompare(a.effectiveMonth))[0] ?? null;
  return selected?.servicePeriod && selected.effectiveMonth !== month ? null : selected;
}
export type ServiceRevenueResult = {
  status: "calculated" | "needs_setup" | "needs_lifecycle" | "outside_service" | "review_required" | "missing_gmv";
  revenueCents: number | null;
  retainerCents: number | null;
  shareCents: number | null;
  terms: AgencyTerms | null;
};
/** Half-up rounding once per component keeps CC and manager amounts exact to cents. */
export function calculateFeeComponent(gmvCents: number, fixedMonthly: number, percent: number, mode: "additive" | "minimum" = "additive") {
  if (!Number.isSafeInteger(gmvCents) || gmvCents < 0) throw new Error("Invalid managed GMV.");
  const fixedCents = Math.round(fixedMonthly * 100);
  const shareCents = Number((BigInt(gmvCents) * BigInt(Math.round(percent * 100)) + BigInt(5000)) / BigInt(10000));
  const useFixed = mode === "additive" || fixedCents >= shareCents;
  const useShare = mode === "additive" || shareCents > fixedCents;
  const totalCents = (useFixed ? fixedCents : 0) + (useShare ? shareCents : 0);
  if (!Number.isSafeInteger(totalCents)) throw new Error("Fee amount exceeds supported limits.");
  return { totalCents, fixedCents: useFixed ? fixedCents : 0, shareCents: useShare ? shareCents : 0 };
}
export function calculateServiceRevenue(input: {
  client: ClientRecord; month: string; periodStart: string; periodEnd: string;
  gmvCents: number | null; gmvComplete: boolean;
  agencySupportedAffiliateGmvCents?: number | null; agencySupportedAffiliateGmvComplete?: boolean;
}): ServiceRevenueResult {
  const { client, month, periodStart, periodEnd } = input;
  let { gmvCents, gmvComplete } = input;
  const bounds = agencyMonthBounds(month), terms = selectMonthTerms(client.terms, month);
  const unavailable = (status: ServiceRevenueResult["status"]): ServiceRevenueResult => ({ status, revenueCents: null, retainerCents: null, shareCents: null, terms });
  if (client.historical && !hasRecordedServicePeriod(client)) return unavailable("outside_service");
  if (!client.serviceStart) return unavailable("needs_lifecycle");
  if (client.serviceStart > bounds.end || (client.serviceEnd && client.serviceEnd < bounds.start)) return unavailable("outside_service");
  if (!terms) return unavailable("needs_setup");
  // Actual creator-ledger input is required. Existing GMV-only callers must
  // never turn the sourcing fee or the separate TAP into a GMV percentage.
  if (terms.feeModel === 'per_creator') return unavailable('needs_setup');
  const calculationPeriod = terms.servicePeriod ?? bounds;
  if (!isAgencyDate(periodStart) || !isAgencyDate(periodEnd) || periodStart !== calculationPeriod.start || periodEnd !== calculationPeriod.end ||
    !servicePeriodMatches(calculationPeriod, clientServicePeriod(client, month))) return unavailable("review_required");
  const retainerCents = Math.round(terms.monthlyRetainer * 100);
  if (terms.feeModel === "fixed") return { status: "calculated", revenueCents: retainerCents, retainerCents, shareCents: null, terms };
  if (terms.feeModel === "tiered") {
    if (!terms.revShareTiers?.length || !["marginal", "whole"].includes(terms.tierCalculation ?? "")) return unavailable("review_required");
    if (terms.gmvBasis === "agency_supported_affiliate") {
      // Contract-defined affiliate GMV must be supplied explicitly after its coverage is verified.
      if (input.agencySupportedAffiliateGmvComplete !== true || input.agencySupportedAffiliateGmvCents == null) return unavailable("review_required");
      gmvCents = input.agencySupportedAffiliateGmvCents;
      gmvComplete = true;
    } else if (terms.gmvBasis !== "managed") return unavailable("review_required");
  }
  if (!gmvComplete || gmvCents === null) return unavailable("missing_gmv");
  if (!Number.isSafeInteger(gmvCents) || gmvCents < 0) return unavailable("review_required");
  if (terms.feeModel === "components") {
    if (!terms.managerComponent) return unavailable("review_required");
    try {
      const cc = calculateFeeComponent(gmvCents, terms.monthlyRetainer, terms.revSharePercent);
      const bm = calculateFeeComponent(gmvCents, terms.managerComponent.monthlyRetainer, terms.managerComponent.revSharePercent, terms.managerComponent.feeModel);
      const revenueCents = cc.totalCents + bm.totalCents;
      if (!Number.isSafeInteger(revenueCents)) return unavailable("review_required");
      return { status: "calculated", revenueCents, retainerCents: cc.fixedCents + bm.fixedCents, shareCents: cc.shareCents + bm.shareCents, terms };
    } catch { return unavailable("review_required"); }
  }
  // Integer basis points and half-up rounding avoid binary float multiplication of money.
  let numerator = BigInt(gmvCents) * BigInt(Math.round(terms.revSharePercent * 100));
  if (terms.feeModel === "tiered") {
    numerator = BigInt(0);
    let lower = BigInt(0);
    const amount = BigInt(gmvCents);
    for (const tier of terms.revShareTiers!) {
      const upper = tier.upToGmv === null ? amount : BigInt(Math.round(tier.upToGmv * 100));
      const rate = BigInt(Math.round(tier.percent * 100));
      if (terms.tierCalculation === "whole") {
        if (tier.upToGmv === null || amount <= upper) { numerator = amount * rate; break; }
      } else {
        const inBand = (amount < upper ? amount : upper) - lower;
        if (inBand > BigInt(0)) numerator += inBand * rate;
        if (amount <= upper) break;
      }
      lower = upper;
    }
  }
  const share = (numerator + BigInt(5000)) / BigInt(10000);
  const shareCents = Number(share);
  const revenueCents = terms.feeModel === "share" ? shareCents : terms.feeModel === "minimum" ? Math.max(retainerCents, shareCents) : retainerCents + shareCents;
  if (!Number.isSafeInteger(revenueCents)) return unavailable("review_required");
  return { status: "calculated", revenueCents, retainerCents, shareCents, terms };
}
export type RetentionCohort = { startMonth: string; tenureMonths: number; opening: number; retained: number; churned: number; retentionRate: number | null };
export type ClientRetention = { opening: number; retained: number; churned: number; exitedClients: number; newClients: number; missingLifecycle: number; retentionRate: number | null; churnRate: number | null; cohorts: RetentionCohort[] };
/** Opening excludes this month's starts. Recorded ends are exits during that month, including its last day. */
export function summarizeClientRetention(clients: ClientRecord[], month: string): ClientRetention {
  const { start, end } = agencyMonthBounds(month);
  const current = clients.filter(client => !client.historical || hasRecordedServicePeriod(client));
  const verified = current.filter(client => client.serviceStart && isAgencyDate(client.serviceStart) && (!client.serviceEnd || isAgencyDate(client.serviceEnd)));
  const opening = verified.filter(client => client.serviceStart! < start && (!client.serviceEnd || client.serviceEnd >= start));
  const retained = opening.filter(client => !client.serviceEnd || client.serviceEnd > end);
  const cohortMonths = [...new Set(opening.map(client => client.serviceStart!.slice(0, 7)))].sort();
  const cohorts = cohortMonths.map(startMonth => {
    const population = opening.filter(client => client.serviceStart!.startsWith(startMonth));
    const kept = population.filter(client => !client.serviceEnd || client.serviceEnd > end).length;
    const [y, m] = month.split("-").map(Number), [cy, cm] = startMonth.split("-").map(Number);
    return { startMonth, tenureMonths: (y - cy) * 12 + m - cm, opening: population.length, retained: kept, churned: population.length - kept, retentionRate: kept / population.length };
  });
  return { opening: opening.length, retained: retained.length, churned: opening.length - retained.length,
    exitedClients: verified.filter(client => client.serviceEnd && client.serviceEnd >= start && client.serviceEnd <= end).length,
    newClients: verified.filter(client => client.serviceStart! >= start && client.serviceStart! <= end).length,
    missingLifecycle: current.length - verified.length, retentionRate: opening.length ? retained.length / opening.length : null,
    churnRate: opening.length ? (opening.length - retained.length) / opening.length : null, cohorts };
}

export type ClientPeriodGmv = {
  currentGmvCents: number | null;
  priorGmvCents: number | null;
  currentComplete: boolean;
  priorComplete: boolean;
};
export type TenureGrowthCohort = {
  key: "1-3" | "4-6" | "7-12" | "13+";
  label: string;
  clientCount: number;
  comparableCount: number;
  nonComparableCount: number;
  missingDataCount: number;
  reviewCount: number;
  currentGmvCents: number | null;
  priorGmvCents: number | null;
  growthRate: number | null;
};
/** Calendar service months, comparing the SAME current client/brand population in both months.
 * Caller must aggregate both periods over identical brand IDs and report complete coverage.
 * New/partial service months never borrow pre-service sales as an agency baseline.
 */
export function summarizeTenureGrowth(
  clients: ClientRecord[], month: string, performance: Record<string, ClientPeriodGmv>,
): { missingLifecycle: number; cohorts: TenureGrowthCohort[] } {
  const { start, end } = agencyMonthBounds(month);
  const [year, part] = month.split("-").map(Number);
  const priorMonth = new Date(Date.UTC(year, part - 2, 1)).toISOString().slice(0, 7);
  const priorStart = `${priorMonth}-01`;
  const current = clients.filter(client => !client.historical || hasRecordedServicePeriod(client));
  const verified = current.filter(client => client.serviceStart && isAgencyDate(client.serviceStart) && (!client.serviceEnd || isAgencyDate(client.serviceEnd)));
  const active = verified.filter(client => client.serviceStart! <= end && (!client.serviceEnd || client.serviceEnd >= start));
  const cohorts = (["1-3", "4-6", "7-12", "13+"] as const).map(key => {
    const members = active.filter(client => {
      const [startYear, startMonth] = client.serviceStart!.split("-").map(Number);
      const tenure = (year - startYear) * 12 + part - startMonth + 1;
      return key === "1-3" ? tenure <= 3 : key === "4-6" ? tenure >= 4 && tenure <= 6 : key === "7-12" ? tenure >= 7 && tenure <= 12 : tenure >= 13;
    });
    const eligible = members.filter(client => client.serviceStart! <= priorStart && (!client.serviceEnd || client.serviceEnd >= end));
    let missingDataCount = 0, reviewCount = 0, comparableCount = 0;
    let currentSum = BigInt(0), priorSum = BigInt(0);
    for (const client of eligible) {
      const data = performance[client.id];
      if (!data || !data.currentComplete || !data.priorComplete || data.currentGmvCents === null || data.priorGmvCents === null) {
        missingDataCount++;
      } else if (!Number.isSafeInteger(data.currentGmvCents) || !Number.isSafeInteger(data.priorGmvCents) || data.currentGmvCents < 0 || data.priorGmvCents < 0) {
        reviewCount++;
      } else {
        comparableCount++;
        currentSum += BigInt(data.currentGmvCents);
        priorSum += BigInt(data.priorGmvCents);
      }
    }
    const safeTotals = currentSum <= BigInt(Number.MAX_SAFE_INTEGER) && priorSum <= BigInt(Number.MAX_SAFE_INTEGER);
    const complete = comparableCount > 0 && missingDataCount === 0 && reviewCount === 0 && safeTotals;
    const currentGmvCents = complete ? Number(currentSum) : null, priorGmvCents = complete ? Number(priorSum) : null;
    return { key, label: `${key === "1-3" ? "1–3" : key === "4-6" ? "4–6" : key === "7-12" ? "7–12" : "13+"} months`, clientCount: members.length,
      comparableCount, nonComparableCount: members.length - eligible.length, missingDataCount, reviewCount,
      currentGmvCents, priorGmvCents,
      growthRate: currentGmvCents !== null && priorGmvCents !== null && priorGmvCents > 0 ? (currentGmvCents - priorGmvCents) / priorGmvCents : null };
  });
  return { missingLifecycle: current.length - verified.length, cohorts };
}
