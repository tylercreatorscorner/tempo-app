/**
 * /api/contests
 *
 * GET  — all contests for the tenant (newest first) with entrant_count.
 * POST — create a DRAFT contest (entrants resolve + freeze at launch).
 *
 * Owner/admin/manager only (coach 403 — prize dollars). Mutations while
 * impersonating are blocked by the middleware, like every /api/* route.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getBrandRegistry } from '@/lib/data/brand-registry';
import { fetchAllRows } from '@/lib/data/fetch-all-rows';
import {
  requireContestScope, validateContestInput, contestScopeViolation,
  toContestRow, chunkList, type DbContestRow,
} from '@/lib/contests/server';

export const runtime = 'nodejs';

export async function GET() {
  const auth = await requireContestScope();
  if (!auth.ok) return auth.response;
  const { scope } = auth;

  const admin = await createAdminClient();
  const { data, error } = await admin
    .from('contests')
    .select('*')
    .eq('tenant_id', scope.tenantId)
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let rows = (data as DbContestRow[] | null) ?? [];
  // Brand-scoped managers only see brand contests inside their access
  // (fail-closed — same visibility rule as targeting).
  if (scope.brandScope.kind === 'scoped') {
    rows = rows.filter((r) => contestScopeViolation(scope, r) === null);
  }

  // Entrant counts: ONE grouped read (paged select of contest_id, counted in
  // JS — PostgREST aggregates are disabled on this project), never per-contest
  // N+1. Draft contests have no rows and read as 0.
  const counts = new Map<string, number>();
  const ids = rows.map((r) => r.id);
  for (const batch of chunkList(ids, 500)) {
    const entrantRows = await fetchAllRows<{ contest_id: string }>(
      () =>
        admin
          .from('contest_entrants')
          .select('contest_id')
          .in('contest_id', batch)
          .order('id', { ascending: true }),
      'contests-entrant-count',
    );
    for (const e of entrantRows) counts.set(e.contest_id, (counts.get(e.contest_id) ?? 0) + 1);
  }

  return NextResponse.json({
    contests: rows.map((r) => toContestRow(r, counts.get(r.id) ?? 0)),
    readOnly: !!scope.impersonating,
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireContestScope();
  if (!auth.ok) return auth.response;
  const { scope } = auth;

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const parsed = validateContestInput(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const input = parsed.value;

  const violation = contestScopeViolation(scope, input);
  if (violation) return NextResponse.json({ error: violation }, { status: 403 });

  const admin = await createAdminClient();

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

  const { data, error } = await admin
    .from('contests')
    .insert({
      tenant_id: scope.tenantId,
      name: input.name,
      scope_kind: input.scope_kind,
      brand_slug: input.brand_slug,
      segment_id: input.segment_id,
      scoring: input.scoring,
      raffle_entry_rule: input.raffle_entry_rule,
      raffle_gmv_step: input.raffle_gmv_step,
      window_start: input.window_start,
      window_end: input.window_end,
      prizes: input.prizes,
      announce_discord: input.announce_discord,
      announce_wins: input.announce_wins,
      status: 'draft',
      created_by: scope.userId,
    })
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ contest: toContestRow(data as DbContestRow, 0) }, { status: 201 });
}
