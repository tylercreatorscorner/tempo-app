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
 * Writes (transactional in spirit — the settled CAS CLAIMS first, then
 * winners, then prizes; a partial failure reverts the claim and reports
 * exactly what happened): contest_winners, creator_prizes (status 'owed',
 * the payouts-ledger seed), with settled_through = the DATA date actually
 * scored through (the honest cutoff — never the window end if uploads lag).
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

      const standingByCreatorId = new Map(
        standings.filter((s) => s.creator_id).map((s) => [s.creator_id as string, s] as const),
      );
      const used = new Set<string>();
      for (const creatorId of overrides.values()) used.add(creatorId);

      // Fill first, tie-check AFTER: an override consuming a place shifts the
      // EFFECTIVE cutline, so testing the raw standings[n-1]/[n] boundary can
      // miss a tie that the shifted cutline lands on (which would then be
      // "resolved" by the display-name sort — presentation, not merit).
      let cursor = 0;
      let lastNatural: StandingRow | null = null;
      const naturalFills: Array<{ place: number; score: number }> = [];
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
        lastNatural = s;
        naturalFills.push({ place: p, score: s.score });
        assigned.push({
          place: p,
          creator_id: s.creator_id,
          handle: s.handles[0] ?? null,
          display_name: s.display_name,
          score: s.score,
        });
      }

      // Tie straddling the EFFECTIVE prize boundary: the last naturally
      // filled entrant shares a score with the first entrant left outside —
      // never silently pick. 409 with the tied group (minus entrants the
      // operator already placed via overrides); resolvable by overriding the
      // affected places. Payload shape { error, places, tied } is load-
      // bearing for the UI's TiePicker.
      if (lastNatural) {
        let probe = cursor;
        while (probe < standings.length && used.has(standingKey(standings[probe]))) probe++;
        const firstLeftOut = probe < standings.length ? standings[probe] : null;
        if (firstLeftOut && firstLeftOut.score === lastNatural.score) {
          const tiedScore = lastNatural.score;
          const overridden = new Set(overrides.values());
          const places = naturalFills.filter((f) => f.score === tiedScore).map((f) => f.place);
          return NextResponse.json(
            {
              error:
                `Tie at the prize boundary — resolve place${places.length > 1 ? 's' : ''} ` +
                `${places.join(', ')} by passing { winners: [{ place, creator_id }] }`,
              places,
              tied: standings
                .filter((s) => s.score === tiedScore && !(s.creator_id && overridden.has(s.creator_id)))
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
    }
  } catch (e) {
    console.error('[/api/contests/[id]/settle] scoring failed:', e);
    const message = e instanceof Error ? e.message : 'Failed to score the contest';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  if (assigned.length === 0) {
    return NextResponse.json({ error: 'No winners could be determined' }, { status: 400 });
  }

  // ── CLAIM FIRST (settle race): flip the status via compare-and-set BEFORE
  // any winner/prize write. The status CHECK constraint has no 'settling'
  // state and PostgREST statements can't share a transaction, so the flip
  // itself is the lock: two concurrent settles both pass the read-time status
  // check, but only one CAS returns a row — the loser 409s having written
  // NOTHING (previously both proceeded and interleaved into TWO full sets of
  // owed prize rows). Mig 111's unique index is the loud backstop.
  const nowIso = new Date().toISOString();
  const { data: claimedRows, error: claimErr } = await admin
    .from('contests')
    .update({
      status: 'settled',
      settled_at: nowIso,
      settled_through: scoredThrough,
      closed_at: contest.closed_at ?? nowIso,
    })
    .eq('id', id)
    .eq('status', contest.status)
    .select('*');
  if (claimErr) {
    return NextResponse.json({ error: `Settle claim failed: ${claimErr.message}` }, { status: 500 });
  }
  const claimed = ((claimedRows as DbContestRow[] | null) ?? [])[0];
  if (!claimed) {
    return NextResponse.json(
      { error: 'Contest was just settled by another request' },
      { status: 409 },
    );
  }

  // Any write failure below: best-effort revert of the claim so the contest
  // is re-settleable, then 500 telling the operator to retry.
  const failWrites = async (what: string): Promise<NextResponse> => {
    const { error: revertErr } = await admin
      .from('contests')
      .update({
        status: contest.status,
        settled_at: null,
        settled_through: null,
        closed_at: contest.closed_at,
      })
      .eq('id', id)
      .eq('status', 'settled');
    if (revertErr) {
      console.error('[/api/contests/[id]/settle] claim revert failed:', revertErr.message);
    }
    return NextResponse.json(
      {
        error: `${what} — ${revertErr
          ? 'AND the revert failed: the contest reads settled with incomplete winner/prize rows; repair the status, then retry settle'
          : `the contest was reverted to ${contest.status}; retry settle`}`,
      },
      { status: 500 },
    );
  };

  // Wipe-then-write keeps a retry after a partial failure clean (nothing can
  // have been announced or paid between a failed attempt and the retry).
  const { error: wipePrizeErr } = await admin.from('creator_prizes').delete().eq('contest_id', id);
  if (wipePrizeErr) return failWrites(`Prize wipe failed: ${wipePrizeErr.message}`);
  const { error: wipeWinErr } = await admin.from('contest_winners').delete().eq('contest_id', id);
  if (wipeWinErr) return failWrites(`Winner wipe failed: ${wipeWinErr.message}`);

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
  if (winErr) return failWrites(`Winner write failed: ${winErr.message}`);

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
  if (prizeErr) return failWrites(`Winners written but prize write failed: ${prizeErr.message}`);

  return NextResponse.json({
    ok: true,
    contest: toContestRow(claimed, entrants.length),
    winners: assigned,
    settled_through: scoredThrough,
  });
}
