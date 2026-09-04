/**
 * POST /api/agency-reports — freeze a portfolio report and mint its link.
 *
 * ⚠️ OWNER AND ADMIN ONLY, unlike the client report routes which a brand-scoped
 * manager may use for their own brands. This report is the whole portfolio: a
 * manager scoped to two clients must not be able to mint a page showing every
 * client's GMV and retainer commitment.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { buildAgencySnapshot } from '@/lib/data/agency-report';

export const runtime = 'nodejs';
// The portfolio pass is a single scan across every client for two periods.
// Measured on Aug vs Jul: a few seconds. The headroom is for a wider window.
export const maxDuration = 120;

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(req: NextRequest) {
  const scope = await getWorkspaceScope();
  if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (scope.role !== 'owner' && scope.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: { start?: unknown; end?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const start = typeof body.start === 'string' && ISO.test(body.start) ? body.start : null;
  const end = typeof body.end === 'string' && ISO.test(body.end) ? body.end : null;
  if (!start || !end || start > end) {
    return NextResponse.json({ error: 'Send `start` and `end` as YYYY-MM-DD, start first.' }, { status: 400 });
  }

  try {
    const snapshot = await buildAgencySnapshot(start, end);

    const session = await createClient();
    const { data: userData } = await session.auth.getUser();

    const supabase = await createAdminClient();
    const { data: row, error } = await supabase
      .from('agency_reports')
      .insert({
        period_start: start,
        period_end: end,
        period_label: snapshot.periodLabel,
        snapshot,
        created_by: userData?.user?.email ?? null,
      })
      .select('id, token')
      .single();
    if (error || !row) {
      return NextResponse.json({ error: error?.message ?? 'Insert failed' }, { status: 500 });
    }

    const base = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/+$/, '');
    return NextResponse.json({
      ok: true,
      id: row.id,
      token: row.token,
      url: `${base}/a/${row.token}`,
      periodLabel: snapshot.periodLabel,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
