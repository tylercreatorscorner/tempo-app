import type { RosterStudioData } from './studio-types';

export function rosterStudioDate(value: unknown): value is string {
  return typeof value === 'string' && /^20\d{2}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

export function parseRosterStudioQuery(params: URLSearchParams, today: string): { ids: number[]; asOf: string } | null {
  const input = params.get('ids')?.split(',') ?? [];
  const asOf = params.get('asOf') ?? today;
  if (!input.length || input.length > 100 || input.some(id => !/^[1-9]\d{0,9}$/.test(id)
    || Number(id) > 2_147_483_647) || !rosterStudioDate(asOf) || asOf > today) return null;
  return { ids: [...new Set(input.map(Number))], asOf };
}

function nonnegative(value: unknown, integer = false): number | null {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && (!integer || Number.isSafeInteger(number)) ? number : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

/** Whitelist terms without leaking the ledger snapshot or triggering renewals. */
export function rosterStudioAgreement(
  value: unknown,
  fallback: { retainer: unknown; monthly_post_requirement: unknown },
  asOf: string,
  canViewCreatorCost: boolean,
): RosterStudioData['agreement'] {
  const agreement = record(value);
  if (!agreement || !['active', 'ended', 'awaiting_renewal'].includes(String(agreement.status))) {
    const retainer = nonnegative(fallback.retainer);
    const requiredPosts = nonnegative(fallback.monthly_post_requirement, true);
    return {
      source: retainer === null && requiredPosts === null ? 'unavailable' : 'current',
      status: 'unverified', partnershipType: null, retainer: canViewCreatorCost ? retainer : null, requiredPosts,
      periodStart: null, periodEnd: null, comparable: false,
    };
  }
  const retainer = nonnegative(agreement.retainer);
  const requiredPosts = nonnegative(agreement.quota, true);
  const periodStart = rosterStudioDate(agreement.periodStart) ? agreement.periodStart : null;
  const periodEnd = rosterStudioDate(agreement.periodEnd) ? agreement.periodEnd : null;
  const monthStart = `${asOf.slice(0, 7)}-01`;
  const monthEnd = new Date(Date.UTC(Number(asOf.slice(0, 4)), Number(asOf.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const snapshot = record(agreement.snapshot);
  const segments = Array.isArray(snapshot?.segments) ? snapshot.segments : [];
  const segment = segments.length === 1 ? record(segments[0]) : null;
  const comparable = agreement.status === 'active' && periodStart === monthStart && periodEnd === monthEnd
    && segment?.from === monthStart && segment?.through === monthEnd;
  return {
    source: 'ledger', status: agreement.status as RosterStudioData['agreement']['status'], partnershipType: null,
    retainer: canViewCreatorCost ? retainer : null, requiredPosts, periodStart, periodEnd, comparable,
  };
}

export function rosterStudioEmpty(asOf: string): RosterStudioData {
  const month = asOf.slice(0, 7);
  return {
    asOf, month,
    agreement: { source: 'unavailable', status: 'unverified', partnershipType: null, retainer: null, requiredPosts: null, periodStart: null, periodEnd: null, comparable: false },
    delivery: { month, start: `${month}-01`, through: asOf, published: null, qualifying: null, pace: null, basis: 'recorded_publications', reason: 'unavailable' },
    owner: null, ownerStatus: 'unavailable',
  };
}
