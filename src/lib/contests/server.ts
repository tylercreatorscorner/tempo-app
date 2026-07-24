/**
 * Shared server plumbing for the /api/contests routes: the role gate, DB row
 * shapes, ContestRow mapping, and create/edit validation.
 *
 * contests / contest_entrants / contest_winners / creator_prizes are
 * RLS-no-policy (service-role only, mig 108) — every read/write goes through
 * createAdminClient, so tenant + brand scoping MUST be enforced here in code
 * (the broadcasts model).
 */
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getWorkspaceScope, type WorkspaceScope } from '@/lib/auth/workspace-scope';
import type {
  ContestPrize,
  ContestRow,
  ContestScoring,
  ContestStatus,
  RaffleEntryRule,
} from './types';

/** Contests are agency ops with prize DOLLARS: owner/admin/manager only.
 *  Coach is hard-excluded (finance-adjacent surface); viewer too. */
const CONTEST_ROLES = new Set(['owner', 'admin', 'manager']);

export async function requireContestScope(): Promise<
  { ok: true; scope: WorkspaceScope } | { ok: false; response: NextResponse }
> {
  const scope = await getWorkspaceScope();
  if (!scope) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  if (!CONTEST_ROLES.has(scope.role)) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { ok: true, scope };
}

/** Raw contests row (service-role read). */
export interface DbContestRow {
  id: string;
  tenant_id: string | null;
  name: string;
  scope_kind: 'brand' | 'segment' | 'all';
  brand_slug: string | null;
  segment_id: string | null;
  criteria: unknown;
  scoring: ContestScoring;
  raffle_entry_rule: RaffleEntryRule | null;
  raffle_gmv_step: number | string | null;
  window_start: string;
  window_end: string;
  prizes: unknown;
  announce_discord: boolean;
  announce_wins: boolean;
  status: ContestStatus;
  settled_through: string | null;
  created_by: string | null;
  created_at: string;
  launched_at: string | null;
  closed_at: string | null;
  settled_at: string | null;
}

export interface DbEntrantRow {
  id: string;
  creator_id: string | null;
  handles: string[];
  display_name: string | null;
}

/** Parse a stored prizes jsonb (already validated at write time). */
export function parsePrizes(raw: unknown): ContestPrize[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
    .map((p) => ({
      place: Number(p.place) || 0,
      label: typeof p.label === 'string' ? p.label : '',
      amount: p.amount === null || p.amount === undefined ? null : Number(p.amount),
    }))
    .sort((a, b) => a.place - b.place);
}

export function toContestRow(db: DbContestRow, entrantCount: number): ContestRow {
  return {
    id: db.id,
    name: db.name,
    scope_kind: db.scope_kind,
    brand_slug: db.brand_slug,
    segment_id: db.segment_id,
    scoring: db.scoring,
    raffle_entry_rule: db.raffle_entry_rule,
    raffle_gmv_step: db.raffle_gmv_step === null ? null : Number(db.raffle_gmv_step),
    window_start: db.window_start,
    window_end: db.window_end,
    prizes: parsePrizes(db.prizes),
    announce_discord: db.announce_discord,
    announce_wins: db.announce_wins,
    status: db.status,
    settled_through: db.settled_through,
    created_at: db.created_at,
    launched_at: db.launched_at,
    settled_at: db.settled_at,
    entrant_count: entrantCount,
  };
}

/** Validated create/edit payload (the insertable column subset). */
export interface ContestInput {
  name: string;
  scope_kind: 'brand' | 'segment' | 'all';
  brand_slug: string | null;
  segment_id: string | null;
  scoring: ContestScoring;
  raffle_entry_rule: RaffleEntryRule | null;
  raffle_gmv_step: number | null;
  window_start: string;
  window_end: string;
  prizes: ContestPrize[];
  announce_discord: boolean;
  announce_wins: boolean;
}

const SCOPE_KINDS = new Set(['brand', 'segment', 'all']);
const SCORINGS = new Set<string>(['gmv', 'posts', 'manual', 'raffle']);
const RAFFLE_RULES = new Set<string>(['per_posting_day', 'per_post', 'per_gmv_step', 'one_per_creator']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isIsoDate(v: unknown): v is string {
  return typeof v === 'string' && DATE_RE.test(v) && !Number.isNaN(Date.parse(v));
}

export type ContestValidation =
  | { ok: true; value: ContestInput }
  | { ok: false; error: string };

/**
 * Full-payload validation, shared by POST (create) and PATCH on a draft.
 * Normalizes: non-matching scope fields and non-raffle raffle fields are
 * nulled, prizes are sorted by place.
 */
export function validateContestInput(body: Record<string, unknown>): ContestValidation {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return { ok: false, error: 'name is required' };

  const scopeKind = typeof body.scope_kind === 'string' ? body.scope_kind : '';
  if (!SCOPE_KINDS.has(scopeKind)) {
    return { ok: false, error: "scope_kind must be one of 'brand', 'segment', 'all'" };
  }
  const kind = scopeKind as ContestInput['scope_kind'];

  const brandSlug =
    typeof body.brand_slug === 'string' && body.brand_slug.trim() ? body.brand_slug.trim() : null;
  const segmentId =
    typeof body.segment_id === 'string' && body.segment_id.trim() ? body.segment_id.trim() : null;
  if (kind === 'brand' && !brandSlug) {
    return { ok: false, error: 'brand_slug is required for a brand-scoped contest' };
  }
  if (kind === 'segment' && !segmentId) {
    return { ok: false, error: 'segment_id is required for a segment-scoped contest' };
  }

  const scoring = typeof body.scoring === 'string' ? body.scoring : '';
  if (!SCORINGS.has(scoring)) {
    return { ok: false, error: "scoring must be one of 'gmv', 'posts', 'manual', 'raffle'" };
  }

  let raffleRule: RaffleEntryRule | null = null;
  let raffleStep: number | null = null;
  if (scoring === 'raffle') {
    const rule = typeof body.raffle_entry_rule === 'string' ? body.raffle_entry_rule : '';
    if (!RAFFLE_RULES.has(rule)) {
      return {
        ok: false,
        error:
          "raffle_entry_rule is required for a raffle: 'per_posting_day', 'per_post', 'per_gmv_step', or 'one_per_creator'",
      };
    }
    raffleRule = rule as RaffleEntryRule;
    if (raffleRule === 'per_gmv_step') {
      const step =
        typeof body.raffle_gmv_step === 'number' ? body.raffle_gmv_step : Number(body.raffle_gmv_step);
      if (!Number.isFinite(step) || step <= 0) {
        return { ok: false, error: 'raffle_gmv_step must be a positive number of dollars per entry' };
      }
      raffleStep = step;
    }
  }

  const windowStart = body.window_start;
  const windowEnd = body.window_end;
  if (!isIsoDate(windowStart) || !isIsoDate(windowEnd)) {
    return { ok: false, error: 'window_start and window_end must be yyyy-MM-dd dates' };
  }
  if (windowStart > windowEnd) {
    return { ok: false, error: 'window_start must be on or before window_end' };
  }

  if (!Array.isArray(body.prizes) || body.prizes.length === 0) {
    return { ok: false, error: 'prizes must be a non-empty array' };
  }
  const prizes: ContestPrize[] = [];
  for (const raw of body.prizes) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { ok: false, error: 'each prize must be an object { place, label, amount }' };
    }
    const p = raw as Record<string, unknown>;
    const place = typeof p.place === 'number' ? p.place : Number(p.place);
    if (!Number.isInteger(place) || place < 1) {
      return { ok: false, error: 'each prize place must be a positive integer' };
    }
    const label = typeof p.label === 'string' ? p.label.trim() : '';
    if (!label) return { ok: false, error: `prize for place ${place} needs a non-empty label` };
    let amount: number | null = null;
    if (p.amount !== null && p.amount !== undefined) {
      amount = typeof p.amount === 'number' ? p.amount : Number(p.amount);
      if (!Number.isFinite(amount) || amount < 0) {
        return { ok: false, error: `prize amount for place ${place} must be null or >= 0` };
      }
    }
    prizes.push({ place, label, amount });
  }
  prizes.sort((a, b) => a.place - b.place);
  for (let i = 0; i < prizes.length; i++) {
    if (prizes[i].place !== i + 1) {
      return { ok: false, error: 'prize places must be contiguous starting at 1 (1st, 2nd, 3rd, ...)' };
    }
  }

  return {
    ok: true,
    value: {
      name,
      scope_kind: kind,
      brand_slug: kind === 'brand' ? brandSlug : null,
      segment_id: kind === 'segment' ? segmentId : null,
      scoring: scoring as ContestScoring,
      raffle_entry_rule: raffleRule,
      raffle_gmv_step: raffleStep,
      window_start: windowStart,
      window_end: windowEnd,
      prizes,
      announce_discord: body.announce_discord === true,
      announce_wins: body.announce_wins === true,
    },
  };
}

/**
 * Brand-scope targeting guard (the comms brandScopeViolation rule): a
 * brand-scoped manager may only run brand contests inside their access —
 * 'all' and segment-wide contests are full-tenant-only. Returns the 403
 * message, or null when allowed.
 */
export function contestScopeViolation(
  scope: WorkspaceScope,
  contest: { scope_kind: 'brand' | 'segment' | 'all'; brand_slug: string | null },
): string | null {
  if (scope.brandScope.kind === 'all') return null;
  if (contest.scope_kind !== 'brand' || !contest.brand_slug) {
    return 'Forbidden: brand-scoped users must scope a contest to one of their brands';
  }
  if (!scope.brandScope.brandSlugs.includes(contest.brand_slug)) {
    return 'Forbidden: brand not in your access';
  }
  return null;
}

/** House rule: `.in()` lists chunked ≤500 (URL overflow → silent partial). */
export function chunkList<T>(arr: T[], size = 500): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Load a contest (tenant-checked) and enforce the caller's brand scope.
 * Returns the row, or the NextResponse to send (404/403/500).
 */
export async function loadContestForScope(
  admin: Awaited<ReturnType<typeof createAdminClient>>,
  scope: WorkspaceScope,
  id: string,
): Promise<{ ok: true; contest: DbContestRow } | { ok: false; response: NextResponse }> {
  const { data, error } = await admin
    .from('contests')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', scope.tenantId)
    .maybeSingle();
  if (error) {
    return { ok: false, response: NextResponse.json({ error: error.message }, { status: 500 }) };
  }
  if (!data) {
    return { ok: false, response: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  }
  const contest = data as DbContestRow;
  const violation = contestScopeViolation(scope, contest);
  if (violation) {
    return { ok: false, response: NextResponse.json({ error: violation }, { status: 403 }) };
  }
  return { ok: true, contest };
}
