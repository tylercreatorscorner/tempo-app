/**
 * Client report share links — outbox list + creation.
 *
 * GET  → recent client_reports rows the caller's scope may see (the outbox feed)
 * POST → build a frozen snapshot for {brand, period}, insert a row, return
 *        the share URL. The snapshot is the whole point: numbers a client
 *        saw can never shift after sending.
 *
 * client_reports has RLS enabled with NO policies — service-role only — so
 * every read/write goes through createAdminClient behind the scope guard.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { getWorkspaceScope, isBrandInScope } from '@/lib/auth/workspace-scope';
import { buildClientReportSnapshot, parseReportPeriod } from '@/lib/data/client-reports';

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

function appBaseUrl(req: NextRequest): string {
  const env = process.env.NEXT_PUBLIC_APP_URL;
  if (env) return env.replace(/\/$/, '');
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

interface ReportRow {
  id: string;
  token: string;
  brand_slug: string;
  brand_name: string;
  period_label: string;
  created_by: string | null;
  created_at: string;
  viewed_at: string | null;
  revoked_at: string | null;
  refreshed_at: string | null;
}

export async function GET(req: NextRequest) {
  const scope = await getWorkspaceScope();
  if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from('client_reports')
    .select('id, token, brand_slug, brand_name, period_label, created_by, created_at, viewed_at, revoked_at, refreshed_at')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const base = appBaseUrl(req);
  const reports = ((data ?? []) as ReportRow[])
    .filter((r) =>
      r.brand_slug === 'all' ? scope.brandScope.kind === 'all' : isBrandInScope(scope, { slug: r.brand_slug }),
    )
    .map((r) => ({
      id: r.id,
      token: r.token,
      url: `${base}/r/${r.token}`,
      brandSlug: r.brand_slug,
      brandName: r.brand_name,
      periodLabel: r.period_label,
      createdAt: r.created_at,
      createdBy: r.created_by,
      viewedAt: r.viewed_at,
      revokedAt: r.revoked_at,
      // NULL until the snapshot is rebuilt in place; the outbox uses it to say
      // "numbers as of" rather than only "created".
      refreshedAt: r.refreshed_at ?? null,
    }));

  return NextResponse.json({ reports });
}

export async function POST(req: NextRequest) {
  const scope = await getWorkspaceScope();
  if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { brand?: string; period?: unknown; notes?: string };
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
  const notes = typeof body.notes === 'string' ? body.notes.slice(0, 2000).trim() : '';

  try {
    const build = await buildClientReportSnapshot(brand, period);

    // created_by is internal outbox attribution only — never shown to clients.
    const session = await createClient();
    const { data: userData } = await session.auth.getUser();
    const createdBy = userData?.user?.email ?? null;

    const supabase = await createAdminClient();
    const { data: row, error } = await supabase
      .from('client_reports')
      .insert({
        brand_slug: brand,
        brand_name: build.brandName,
        period_start: build.periodStart,
        period_end: build.periodEnd,
        period_label: build.periodLabel,
        snapshot: build.snapshot,
        notes: notes || null,
        created_by: createdBy,
      })
      .select('id, token')
      .single();
    if (error || !row) {
      return NextResponse.json({ error: error?.message ?? 'Insert failed' }, { status: 500 });
    }

    return NextResponse.json({
      id: row.id,
      token: row.token,
      url: `${appBaseUrl(req)}/r/${row.token}`,
      periodLabel: build.periodLabel,
    });
  } catch (err: unknown) {
    console.error('[client-reports] create failed:', err);
    const message = err instanceof Error ? err.message : 'Failed to create report';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
