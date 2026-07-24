/**
 * /api/contests/[id]
 *
 * GET    — ContestDetail: live/closed compute standings from the rollup RPC;
 *          settled read contest_winners; draft has no standings.
 * PATCH  — drafts fully editable (POST validation); live/closed only name +
 *          announce toggles; settled nothing.
 * DELETE — drafts only (the invoices DELETE rule).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getBrandRegistry } from '@/lib/data/brand-registry';
import { fetchAllRows } from '@/lib/data/fetch-all-rows';
import {
  requireContestScope, validateContestInput, contestScopeViolation,
  loadContestForScope, toContestRow, type DbContestRow, type DbEntrantRow,
} from '@/lib/contests/server';
import { computeContestStandings } from '@/lib/contests/scoring';
import type { ContestDetail } from '@/lib/contests/types';

export const runtime = 'nodejs';

interface WinnerLite {
  place: number;
  creator_id: string | null;
  handle: string | null;
  display_name: string | null;
  score: number | string | null;
}

async function fetchEntrants(
  admin: Awaited<ReturnType<typeof createAdminClient>>,
  contestId: string,
): Promise<DbEntrantRow[]> {
  return fetchAllRows<DbEntrantRow>(
    () =>
      admin
        .from('contest_entrants')
        .select('id, creator_id, handles, display_name')
        .eq('contest_id', contestId)
        .order('id', { ascending: true }),
    'contest-detail-entrants',
  );
}

/** The frozen cohort as the detail contract exposes it (manual winner picker). */
function toDetailEntrants(rows: DbEntrantRow[]): NonNullable<ContestDetail['entrants']> {
  return rows.map((e) => ({
    creator_id: e.creator_id,
    display_name: e.display_name || e.handles[0] || 'Unknown creator',
    handles: e.handles,
  }));
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireContestScope();
  if (!auth.ok) return auth.response;
  const { scope } = auth;

  const { id } = await ctx.params;
  const admin = await createAdminClient();
  const loaded = await loadContestForScope(admin, scope, id);
  if (!loaded.ok) return loaded.response;
  const contest = loaded.contest;

  const entrants = await fetchEntrants(admin, id);
  const base = toContestRow(contest, entrants.length);

  if (contest.status === 'draft') {
    // Nothing is frozen until launch — entrants: null, not [].
    const detail: ContestDetail = {
      contest: base, standings: null, scoredThrough: null, winners: [], entrants: null,
    };
    return NextResponse.json(detail);
  }

  if (contest.status === 'settled') {
    const { data: winRows, error: winErr } = await admin
      .from('contest_winners')
      .select('place, creator_id, handle, display_name, score')
      .eq('contest_id', id)
      .order('place', { ascending: true });
    if (winErr) return NextResponse.json({ error: winErr.message }, { status: 500 });
    const detail: ContestDetail = {
      contest: base,
      standings: null,
      // The frozen result was scored through settled_through — the honest
      // cutoff stamped at settle time.
      scoredThrough: contest.settled_through,
      winners: ((winRows as WinnerLite[] | null) ?? []).map((w) => ({
        place: w.place,
        creator_id: w.creator_id,
        display_name: w.display_name || w.handle || 'Unknown creator',
        score: w.score === null ? null : Number(w.score),
      })),
      entrants: toDetailEntrants(entrants),
    };
    return NextResponse.json(detail);
  }

  // live / closed — compute standings from the rollup RPC. A failed score
  // read THROWS → 500; never a plausible-looking empty leaderboard.
  try {
    const { standings, scoredThrough } = await computeContestStandings(base, entrants);
    const detail: ContestDetail = {
      contest: base, standings, scoredThrough, winners: [], entrants: toDetailEntrants(entrants),
    };
    return NextResponse.json(detail);
  } catch (e) {
    console.error('[/api/contests/[id]] standings compute failed:', e);
    const message = e instanceof Error ? e.message : 'Failed to compute standings';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Live/closed contests: the cohort and the rules are locked — only the name
// and the announce toggles may change.
const LIVE_EDITABLE = new Set(['name', 'announce_discord', 'announce_wins']);

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireContestScope();
  if (!auth.ok) return auth.response;
  const { scope } = auth;

  const { id } = await ctx.params;

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const admin = await createAdminClient();
  const loaded = await loadContestForScope(admin, scope, id);
  if (!loaded.ok) return loaded.response;
  const contest = loaded.contest;

  if (contest.status === 'settled') {
    return NextResponse.json({ error: 'Settled contests cannot be edited' }, { status: 400 });
  }

  let update: Record<string, unknown>;

  if (contest.status === 'draft') {
    // Fully editable: merge the current row with the patch, then run the SAME
    // validation as create so a draft can never be edited into an unlaunchable
    // state.
    const merged: Record<string, unknown> = {
      name: contest.name,
      scope_kind: contest.scope_kind,
      brand_slug: contest.brand_slug,
      segment_id: contest.segment_id,
      scoring: contest.scoring,
      raffle_entry_rule: contest.raffle_entry_rule,
      raffle_gmv_step: contest.raffle_gmv_step === null ? null : Number(contest.raffle_gmv_step),
      window_start: contest.window_start,
      window_end: contest.window_end,
      prizes: contest.prizes,
      announce_discord: contest.announce_discord,
      announce_wins: contest.announce_wins,
    };
    for (const [field, raw] of Object.entries(body)) {
      if (!(field in merged)) {
        return NextResponse.json({ error: `Field "${field}" is not editable` }, { status: 400 });
      }
      merged[field] = raw;
    }
    const parsed = validateContestInput(merged);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const input = parsed.value;

    const violation = contestScopeViolation(scope, input);
    if (violation) return NextResponse.json({ error: violation }, { status: 403 });

    if (input.scope_kind === 'brand') {
      const reg = await getBrandRegistry();
      if (!reg.bySlug.has(input.brand_slug!)) {
        return NextResponse.json({ error: `Unknown brand "${input.brand_slug}"` }, { status: 400 });
      }
    }
    if (input.scope_kind === 'segment') {
      const { data: seg, error: segErr } = await admin
        .from('segments')
        .select('id')
        .eq('id', input.segment_id!)
        .eq('tenant_id', scope.tenantId)
        .maybeSingle();
      if (segErr) return NextResponse.json({ error: segErr.message }, { status: 500 });
      if (!seg) return NextResponse.json({ error: 'Segment not found' }, { status: 404 });
    }

    update = { ...input };
  } else {
    // live / closed
    update = {};
    for (const [field, raw] of Object.entries(body)) {
      if (!LIVE_EDITABLE.has(field)) {
        return NextResponse.json(
          { error: `Field "${field}" is not editable on a ${contest.status} contest` },
          { status: 400 },
        );
      }
      if (field === 'name') {
        const name = typeof raw === 'string' ? raw.trim() : '';
        if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });
        update.name = name;
      } else {
        update[field] = raw === true;
      }
    }
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }
  }

  const { data, error } = await admin
    .from('contests')
    .update(update)
    .eq('id', id)
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const entrants = await fetchEntrants(admin, id);
  return NextResponse.json({ contest: toContestRow(data as DbContestRow, entrants.length) });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireContestScope();
  if (!auth.ok) return auth.response;
  const { scope } = auth;

  const { id } = await ctx.params;
  const admin = await createAdminClient();
  const loaded = await loadContestForScope(admin, scope, id);
  if (!loaded.ok) return loaded.response;

  if (loaded.contest.status !== 'draft') {
    return NextResponse.json(
      { error: `Can only delete draft contests (this one is ${loaded.contest.status})` },
      { status: 400 },
    );
  }

  const { error } = await admin.from('contests').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
