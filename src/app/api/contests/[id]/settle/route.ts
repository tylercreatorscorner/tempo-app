/**
 * POST /api/contests/[id]/settle — live/closed → settled.
 *
 * gmv/posts: winners = the top standing per prize place. A tie straddling the
 * FINAL prize boundary is never silently resolved — 409 with the tied
 * entrants; the operator resolves via { winners: [{ place, creator_id }] }
 * overrides (which may also override any other place).
 * manual: the overrides body IS the result — one entrant per prize place.
 * raffle: the draw ships in the next phase — 400.
 *
 * Writes (transactional in spirit — winners, then prizes, then the contest
 * flip; a partial failure reports exactly what landed): contest_winners,
 * creator_prizes (status 'owed', the payouts-ledger seed), contest →
 * status 'settled' with settled_through = the DATA date actually scored
 * through (the honest cutoff — never the window end if uploads lag).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { fetchAllRows } from '@/lib/data/fetch-all-rows';
import {
  requireContestScope, loadContestForScope, toContestRow, parsePrizes,
  type DbContestRow, type DbEntrantRow,
} from '@/lib/contests/server';
import { computeContestStandings } from '@/lib/contests/scoring';
import type { StandingRow } from '@/lib/contests/types';

export const runtime = 'nodejs';

interface AssignedWinner {
  place: number;
  creator_id: string | null;
  handle: string | null;
  display_name: string | null;
  score: number | null;
}

/** Identity key for "this standing is already a winner" bookkeeping —
 *  creator_id when present, else the handle key (the entrant idiom). */
function standingKey(s: StandingRow): string {
  return s.creator_id ?? `h:${s.handles[0] ?? s.display_name}`;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireContestScope();
  if (!auth.ok) return auth.response;
  const { scope } = auth;

  const { id } = await ctx.params;

  // Body is optional for gmv/posts (overrides only), required for manual.
  let body: Record<string, unknown> = {};
  try {
    const raw = await req.json();
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) body = raw as Record<string, unknown>;
  } catch {
    // no body — fine for gmv/posts
  }

  const admin = await createAdminClient();
  const loaded = await loadContestForScope(admin, scope, id);
  if (!loaded.ok) return loaded.response;
  const contest = loaded.contest;

  if (contest.status !== 'live' && contest.status !== 'closed') {
    return NextResponse.json(
      { error: `Only live or closed contests can be settled (this one is ${contest.status})` },
      { status: 400 },
    );
  }
  if (contest.scoring === 'raffle') {
    return NextResponse.json({ error: 'Raffle draw ships in the next phase' }, { status: 400 });
  }

  const prizes = parsePrizes(contest.prizes);
  const n = prizes.length;
  if (n === 0) {
    return NextResponse.json({ error: 'Contest has no prizes to settle' }, { status: 400 });
  }

  const entrants = await fetchAllRows<DbEntrantRow>(
    () =>
      admin
        .from('contest_entrants')
        .select('id, creator_id, handles, display_name')
        .eq('contest_id', id)
        .order('id', { ascending: true }),
    'contest-settle-entrants',
  );
  const entrantByCreatorId = new Map(
    entrants.filter((e) => e.creator_id).map((e) => [e.creator_id as string, e] as const),
  );

  // ── Overrides: { winners: [{ place, creator_id }] } — validated as entrants.
  const overrides = new Map<number, string>();
  if (body.winners !== undefined) {
    if (!Array.isArray(body.winners)) {
      return NextResponse.json(
        { error: 'winners must be an array of { place, creator_id }' },
        { status: 400 },
      );
    }
    const seenCreators = new Set<string>();
    for (const raw of body.winners) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return NextResponse.json(
          { error: 'winners must be an array of { place, creator_id }' },
          { status: 400 },
        );
      }
      const w = raw as Record<string, unknown>;
      const place = typeof w.place === 'number' ? w.place : Number(w.place);
      if (!Number.isInteger(place) || place < 1 || place > n) {
        return NextResponse.json(
          { error: `winner place must be an integer between 1 and ${n}` },
          { status: 400 },
        );
      }
      const creatorId = typeof w.creator_id === 'string' ? w.creator_id : '';
      if (!creatorId || !entrantByCreatorId.has(creatorId)) {
        return NextResponse.json(
          { error: `winner for place ${place} is not an entrant of this contest` },
          { status: 400 },
        );
      }
      if (overrides.has(place)) {
        return NextResponse.json({ error: `duplicate winner for place ${place}` }, { status: 400 });
      }
      if (seenCreators.has(creatorId)) {
        return NextResponse.json(
          { error: 'the same creator cannot win more than one place' },
          { status: 400 },
        );
      }
      overrides.set(place, creatorId);
      seenCreators.add(creatorId);
    }
  }

  let scoredThrough: string | null;
  const assigned: AssignedWinner[] = [];

  try {
    if (contest.scoring === 'manual') {
      // The overrides ARE the result — exactly one entrant per prize place.
      for (let p = 1; p <= n; p++) {
        if (!overrides.has(p)) {
          return NextResponse.json(
            { error: `Manual contests need { winners } with one creator per prize place (missing place ${p})` },
            { status: 400 },
          );
        }
      }
      // Through computeContestStandings (manual → null standings, cutoff only)
      // so settled_through carries the BRAND-scoped cutoff for brand contests,
      // same as the gmv/posts path.
      scoredThrough = (await computeContestStandings(toContestRow(contest, entrants.length), entrants))
        .scoredThrough;
      for (let p = 1; p <= n; p++) {
        const e = entrantByCreatorId.get(overrides.get(p) as string) as DbEntrantRow;
        assigned.push({
          place: p,
          creator_id: e.creator_id,
          handle: e.handles[0] ?? null,
          display_name: e.display_name,
          score: null,
        });
      }
    } else {
      // gmv / posts
      const result = await computeContestStandings(toContestRow(contest, entrants.length), entrants);
      scoredThrough = result.scoredThrough;
      const standings = result.standings ?? [];

      // Tie at the FINAL prize boundary: the entrants inside and just outside
      // the last paid place share a score — never silently pick. 409 with the
      // tied group unless the operator overrode every affected place.
      if (standings.length > n && standings[n - 1].score === standings[n].score) {
        const boundaryScore = standings[n].score;
        const ambiguousPlaces: number[] = [];
        for (let p = 1; p <= n; p++) {
          if (!overrides.has(p) && standings[p - 1].score === boundaryScore) ambiguousPlaces.push(p);
        }
        if (ambiguousPlaces.length > 0) {
          return NextResponse.json(
            {
              error:
                `Tie at the prize boundary — resolve place${ambiguousPlaces.length > 1 ? 's' : ''} ` +
                `${ambiguousPlaces.join(', ')} by passing { winners: [{ place, creator_id }] }`,
              places: ambiguousPlaces,
              tied: standings
                .filter((s) => s.score === boundaryScore)
                .map((s) => ({
                  creator_id: s.creator_id,
                  display_name: s.display_name,
                  handles: s.handles,
                  score: s.score,
                })),
            },
            { status: 409 },
          );
        }
      }

      const standingByCreatorId = new Map(
        standings.filter((s) => s.creator_id).map((s) => [s.creator_id as string, s] as const),
      );
      const used = new Set<string>();
      for (const creatorId of overrides.values()) used.add(creatorId);

      let cursor = 0;
      for (let p = 1; p <= n; p++) {
        const overrideId = overrides.get(p);
        if (overrideId) {
          const e = entrantByCreatorId.get(overrideId) as DbEntrantRow;
          assigned.push({
            place: p,
            creator_id: e.creator_id,
            handle: e.handles[0] ?? null,
            display_name: e.display_name,
            score: standingByCreatorId.get(overrideId)?.score ?? null,
          });
          continue;
        }
        while (cursor < standings.length && used.has(standingKey(standings[cursor]))) cursor++;
        if (cursor >= standings.length) break; // fewer entrants than prizes — leave the place unawarded
        const s = standings[cursor];
        used.add(standingKey(s));
        assigned.push({
          place: p,
          creator_id: s.creator_id,
          handle: s.handles[0] ?? null,
          display_name: s.display_name,
          score: s.score,
        });
      }
    }
  } catch (e) {
    console.error('[/api/contests/[id]/settle] scoring failed:', e);
    const message = e instanceof Error ? e.message : 'Failed to score the contest';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  if (assigned.length === 0) {
    return NextResponse.json({ error: 'No winners could be determined' }, { status: 400 });
  }

  // ── Writes: winners → prizes → contest flip. Wipe first so a retry after a
  // partial failure is clean (the contest is not yet settled, so no prize row
  // here can have been announced or paid).
  const { error: wipePrizeErr } = await admin.from('creator_prizes').delete().eq('contest_id', id);
  if (wipePrizeErr) {
    return NextResponse.json(
      { error: `Settle aborted before any writes: ${wipePrizeErr.message}` },
      { status: 500 },
    );
  }
  const { error: wipeWinErr } = await admin.from('contest_winners').delete().eq('contest_id', id);
  if (wipeWinErr) {
    return NextResponse.json(
      { error: `Settle aborted before any writes: ${wipeWinErr.message}` },
      { status: 500 },
    );
  }

  const { error: winErr } = await admin.from('contest_winners').insert(
    assigned.map((w) => ({
      contest_id: id,
      place: w.place,
      creator_id: w.creator_id,
      handle: w.handle,
      display_name: w.display_name,
      score: w.score,
    })),
  );
  if (winErr) {
    return NextResponse.json(
      { error: `Winner write failed — contest NOT settled: ${winErr.message}` },
      { status: 500 },
    );
  }

  const prizeByPlace = new Map(prizes.map((p) => [p.place, p] as const));
  const { error: prizeErr } = await admin.from('creator_prizes').insert(
    assigned.map((w) => {
      const prize = prizeByPlace.get(w.place);
      return {
        contest_id: id,
        creator_id: w.creator_id,
        handle: w.handle,
        display_name: w.display_name,
        brand_slug: contest.scope_kind === 'brand' ? contest.brand_slug : null,
        place: w.place,
        amount: prize?.amount ?? null,
        label: prize?.label ?? '',
        status: 'owed',
      };
    }),
  );
  if (prizeErr) {
    return NextResponse.json(
      { error: `Winners written but prize write failed — contest NOT settled: ${prizeErr.message}` },
      { status: 500 },
    );
  }

  const nowIso = new Date().toISOString();
  const { data: updated, error: updErr } = await admin
    .from('contests')
    .update({
      status: 'settled',
      settled_at: nowIso,
      settled_through: scoredThrough,
      closed_at: contest.closed_at ?? nowIso,
    })
    .eq('id', id)
    .select('*')
    .single();
  if (updErr) {
    return NextResponse.json(
      { error: `Winners and prizes written but the contest could not be marked settled — retry: ${updErr.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    contest: toContestRow(updated as DbContestRow, entrants.length),
    winners: assigned,
    settled_through: scoredThrough,
  });
}
