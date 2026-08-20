/**
 * POST /api/client-reports/preview — the Create panel's "Prepare" step.
 *
 * Builds the same snapshot the create call would freeze (so the headline the
 * operator approves IS the headline the client gets) and returns the drafted
 * notes for editing. Nothing is persisted; Create rebuilds fresh.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceScope, isBrandInScope } from '@/lib/auth/workspace-scope';
import {
  buildClientReportSnapshot,
  draftClientReportNotes,
  parseReportPeriod,
} from '@/lib/data/client-reports';

export const runtime = 'nodejs';
// Snapshot build, measured on kitsch (the heaviest brand) 2026-08-20:
//     get_brand_client_report_agg      6.1s
//     get_brand_report_extras         18.6s   <- dominates, and predates this
//     counts + granular (concurrent)   4.8s
// ~30s warm, and slower cold. The old comment here budgeted 60s against
// "extras ~2-4s", which stopped being true long before the granular pass;
// preview 504'd at exactly 60s. 180s is headroom over the measured worst
// case, not a target — if a build ever approaches it, fix the query.
export const maxDuration = 180;

export async function POST(req: NextRequest) {
  const scope = await getWorkspaceScope();
  if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { brand?: string; period?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const brand = typeof body.brand === 'string' && body.brand ? body.brand : 'all';
  if (brand === 'all' ? scope.brandScope.kind !== 'all' : !isBrandInScope(scope, { slug: brand })) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const period = parseReportPeriod(body.period);
  if (!period) return NextResponse.json({ error: 'Invalid period' }, { status: 400 });

  try {
    const build = await buildClientReportSnapshot(brand, period);
    const r = build.snapshot.report;
    return NextResponse.json({
      periodLabel: build.periodLabel,
      headline: {
        gmv: r.totalGmv,
        activeCreators: r.activeCreators,
        managedPct: r.managedPct,
      },
      draftNotes: draftClientReportNotes(build.snapshot),
    });
  } catch (err: unknown) {
    console.error('[client-reports] preview failed:', err);
    const message = err instanceof Error ? err.message : 'Failed to prepare report';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
