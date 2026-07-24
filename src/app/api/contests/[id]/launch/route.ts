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
    return NextResponse.json({ error: 'nobody would be in this contest' }, { status: 400 });
  }

  // Wipe-then-freeze keeps a retry after a partial failure clean (the contest
  // is still draft, so nothing has consumed these rows).
  const { error: wipeErr } = await admin.from('contest_entrants').delete().eq('contest_id', id);
  if (wipeErr) {
    return NextResponse.json({ error: `Entrant freeze failed: ${wipeErr.message}` }, { status: 500 });
  }

  const entrantRows = entrants.map((e) => ({
    contest_id: id,
    creator_id: e.creator_id,
    handles: e.handles,
    display_name: e.display_name,
  }));
  for (const batch of chunkList(entrantRows, 500)) {
    const { error: insErr } = await admin.from('contest_entrants').insert(batch);
    if (insErr) {
      // Contest stays draft — a retry re-wipes and re-freezes.
      return NextResponse.json({ error: `Entrant freeze failed: ${insErr.message}` }, { status: 500 });
    }
  }

  const { data: updated, error: updErr } = await admin
    .from('contests')
    .update({
      status: 'live',
      launched_at: new Date().toISOString(),
      criteria: criteria ?? null,
    })
    .eq('id', id)
    .eq('status', 'draft')
    .select('*')
    .single();
  if (updErr) {
    return NextResponse.json(
      { error: `Entrants frozen but the contest could not be marked live — retry launch: ${updErr.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    contest: toContestRow(updated as DbContestRow, entrants.length),
  });
}
