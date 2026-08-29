/**
 * POST /api/client-reports/[id]/refresh — rebuild a report's numbers IN PLACE.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 *
 * Client reports are FROZEN snapshots on purpose: a link already sent must not
 * shift under the client while they are reading it. The consequence is that
 * pressing Generate again for the same brand and dates mints a NEW token and a
 * NEW URL — the link already shared keeps its original numbers forever.
 *
 * Generation was never broken. Verified in client_reports: lemme
 * 2026-08-01..22 exists twice, five minutes apart, with distinct tokens, and
 * the later one correctly picked up a roster edit made between the two runs
 * (retainer budget $53,650 -> $46,650). What looked like "it did not
 * regenerate" was the OLD link being reopened.
 *
 * So this route keeps the token and replaces the snapshot, which is the thing
 * you actually want when a report has already gone out and its numbers need
 * correcting. Generate still mints a new link; Refresh updates this one.
 *
 * ⚠️ Period is read from the STORED row, never from the request. Refresh must
 * mean "the same window, recomputed" — accepting a period here would let a
 * refresh silently change what the link reports, which is exactly the trust
 * property the frozen snapshot exists to protect.
 *
 * ⚠️ Notes are preserved. They are hand-written commentary about the period,
 * not derived data, and rebuilding must not discard them.
 *
 * viewed_at is deliberately NOT reset: whether the client opened the link is a
 * fact about the link, not about the numbers on it.
 */
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

  const { id } = await ctx.params;
  const supabase = await createAdminClient();

  const { data: row, error: fetchErr } = await supabase
    .from('client_reports')
    .select('id, token, brand_slug, period_start, period_end, revoked_at, report_type')
    .eq('id', id)
    .maybeSingle();
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (row.brand_slug === 'all' ? scope.brandScope.kind !== 'all' : !isBrandInScope(scope, { slug: row.brand_slug })) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  // A revoked link renders a revoked notice, so refreshing it would rebuild
  // numbers nobody can reach. Fail loudly rather than burn ~13s silently.
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
      undefined,
      (row.report_type as 'performance' | 'weekly' | 'monthly' | null) ?? 'performance',
    );

    const { error } = await supabase
      .from('client_reports')
      .update({
        snapshot: build.snapshot,
        // The label is derived from the window, so it is rebuilt too — a
        // data-anchored window can legitimately render a different label for
        // the same stored dates.
        period_label: build.periodLabel,
        brand_name: build.brandName,
        refreshed_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      ok: true,
      id: row.id,
      token: row.token,
      periodLabel: build.periodLabel,
      refreshedAt: new Date().toISOString(),
    });
  } catch (err: unknown) {
    console.error('[client-reports] refresh failed:', err);
    const message = err instanceof Error ? err.message : 'Failed to refresh the report';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
