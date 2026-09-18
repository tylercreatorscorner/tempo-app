import { reportGuard, clientReportContext, ClientReportAccessError } from '@/lib/auth/client-report-access';
/** Rebuild as a NEW report revision. Existing report links retain their snapshots. */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getWorkspaceScope, isBrandInScope } from '@/lib/auth/workspace-scope';
import { buildClientReportSnapshot } from '@/lib/data/client-reports';

export const runtime = 'nodejs';
// The rebuild runs the same chain as a fresh Prepare, which measured ~13s on
// kitsch. Same ceiling as the create/preview routes.
export const maxDuration = 180;

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const scope = await getWorkspaceScope();
  if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const denied = reportGuard(scope, 'write');
  if (denied) return denied;

  const { id } = await ctx.params;
  const supabase = await createAdminClient();

  const { data: row, error: fetchErr } = await supabase
    .from('client_reports')
    .select('id, token, brand_slug, period_start, period_end, revoked_at, report_type, snapshot, notes, plan')
    .eq('id', id).eq('tenant_id', scope.tenantId)
    .maybeSingle();
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (row.brand_slug === 'all' ? scope.brandScope.kind !== 'all' : !isBrandInScope(scope, { slug: row.brand_slug })) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  // A revoked link renders a revoked notice, so refreshing it would rebuild
  // numbers nobody can reach. Fail loudly rather than burn ~13s silently.
  if (row.snapshot?.reconciliation) return NextResponse.json({error:'This reconciled revision cannot be refreshed. Create a new revision to change approved figures.'},{status:409});
  if (row.revoked_at) {
    return NextResponse.json(
      { error: 'This link is revoked. Generate a new report instead.' },
      { status: 409 },
    );
  }

  try {
    // ⚠️ The TYPE comes from the stored row too, for the same reason the period
    // does: refresh means "this link, recomputed". Rebuilding a weekly report
    // as a performance one would silently drop its movers block.
    const build = await buildClientReportSnapshot(
      row.brand_slug,
      { start: row.period_start as string, end: row.period_end as string },
      await clientReportContext(scope, row.brand_slug),
      undefined,
      (row.report_type as 'performance' | 'weekly' | 'monthly' | null) ?? 'performance',
    );

    const { data: revision, error } = await supabase
      .from('client_reports')
      .insert({
        tenant_id: scope.tenantId,
        brand_slug: row.brand_slug,
        brand_name: build.brandName,
        period_start: row.period_start,
        period_end: row.period_end,
        period_label: build.periodLabel,
        report_type: row.report_type ?? 'performance',
        snapshot: {...build.snapshot, revision: {previousReportId: row.id, createdAt: new Date().toISOString()}},
        notes: row.notes,
        plan: row.plan,
        created_by: scope.email,
      })
      .select('id,token').single();
    if (error || !revision) return NextResponse.json({error:'The report revision could not be created.'},{status:500});
    return NextResponse.json({ok:true,id:revision.id,token:revision.token,previousReportId:row.id,periodLabel:build.periodLabel});
  } catch (err: unknown) {
    console.error('[client-reports] refresh failed:', err);
    const message = err instanceof Error ? err.message : 'Failed to refresh the report';
    return NextResponse.json({ error: message }, { status: err instanceof ClientReportAccessError ? 403 : 500 });
  }
}
