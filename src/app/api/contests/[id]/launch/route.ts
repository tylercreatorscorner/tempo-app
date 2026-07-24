/**
 * POST /api/contests/[id]/launch — draft → live.
 *
 * Resolves the entrant cohort (segment criteria replayed through the roster
 * core; brand/all from managed_creators, umbrella-expanded) and FREEZES it
 * into contest_entrants — the cohort locks when the gun goes off. Segment
 * contests also snapshot the criteria jsonb onto the contest row for
 * provenance.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import {
  requireContestScope, loadContestForScope, toContestRow, chunkList, type DbContestRow,
} from '@/lib/contests/server';
import { resolveContestEntrants, EntrantResolveError } from '@/lib/contests/entrants';

export const runtime = 'nodejs';
// Segment resolution replays the full roster export — multiple seconds warm,
// worse cold (the broadcasts-create precedent).
export const maxDuration = 60;

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireContestScope();
  if (!auth.ok) return auth.response;
  const { scope } = auth;

  const { id } = await ctx.params;
  const admin = await createAdminClient();
  const loaded = await loadContestForScope(admin, scope, id);
  if (!loaded.ok) return loaded.response;
  const contest = loaded.contest;

  if (contest.status !== 'draft') {
    return NextResponse.json(
      { error: `Only draft contests can be launched (this one is ${contest.status})` },
      { status: 400 },
    );
  }

  let entrants;
  let criteria;
  try {
    ({ entrants, criteria } = await resolveContestEntrants(scope, contest));
  } catch (e) {
    if (e instanceof EntrantResolveError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error('[/api/contests/[id]/launch] entrant resolve failed:', e);
    const message = e instanceof Error ? e.message : 'Failed to resolve entrants';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  if (entrants.length === 0) {
    // Resolution is READ-ONLY and ran before any write — nothing to revert.
    return NextResponse.json({ error: 'nobody would be in this contest' }, { status: 400 });
  }

  // ── CLAIM FIRST (double-launch race): CAS draft→live BEFORE any entrant
  // write. Two overlapping launches would otherwise interleave their wipes
  // and inserts — and NULL-creator_id entrant rows bypass UNIQUE(contest_id,
  // creator_id) (SQL NULLs are distinct), so a live contest ends up with
  // duplicated handle-only entrants. The status CHECK has no 'launching'
  // state and PostgREST statements can't share a transaction, so the flip
  // itself is the lock: only the CAS winner writes; the loser 409s having
  // written nothing. Entrant write failures revert to draft below.
  const { data: claimedRows, error: claimErr } = await admin
    .from('contests')
    .update({
      status: 'live',
      launched_at: new Date().toISOString(),
      criteria: criteria ?? null,
    })
    .eq('id', id)
    .eq('status', 'draft')
    .select('*');
  if (claimErr) {
    return NextResponse.json({ error: `Launch claim failed: ${claimErr.message}` }, { status: 500 });
  }
  const live = ((claimedRows as DbContestRow[] | null) ?? [])[0];
  if (!live) {
    return NextResponse.json(
      { error: 'Contest was just launched by another request' },
      { status: 409 },
    );
  }

  // Any entrant write failure: best-effort revert to draft (clear the launch
  // stamps) so the operator can simply retry launch.
  const failLaunch = async (what: string): Promise<NextResponse> => {
    const { error: revertErr } = await admin
      .from('contests')
      .update({ status: 'draft', launched_at: null, criteria: null })
      .eq('id', id)
      .eq('status', 'live');
    if (revertErr) {
      console.error('[/api/contests/[id]/launch] revert to draft failed:', revertErr.message);
    }
    return NextResponse.json(
      {
        error: `${what} — ${revertErr
          ? 'AND the revert failed: the contest reads live with a partial cohort; repair the status, then retry launch'
          : 'the contest was reverted to draft; retry launch'}`,
      },
      { status: 500 },
    );
  };

  // Wipe-then-freeze keeps a retry after a partial failure clean; we hold the
  // claim, so this section is single-writer.
  const { error: wipeErr } = await admin.from('contest_entrants').delete().eq('contest_id', id);
  if (wipeErr) return failLaunch(`Entrant freeze failed: ${wipeErr.message}`);

  const entrantRows = entrants.map((e) => ({
    contest_id: id,
    creator_id: e.creator_id,
    handles: e.handles,
    display_name: e.display_name,
  }));
  for (const batch of chunkList(entrantRows, 500)) {
    const { error: insErr } = await admin.from('contest_entrants').insert(batch);
    if (insErr) return failLaunch(`Entrant freeze failed: ${insErr.message}`);
  }

  return NextResponse.json({
    ok: true,
    contest: toContestRow(live, entrants.length),
  });
}
