/**
 * report_log — creator-post entries in the outbox feed.
 *
 * GET  → recent entries (Daily Drops, Who's Cooking posts, …) for the feed
 * POST → log one generated/copied post ({reportType, format, brand,
 *        periodLabel, destination}); the Create panel fires this when the
 *        operator copies a post, so the feed shows what actually went out.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { getWorkspaceScope, isBrandInScope } from '@/lib/auth/workspace-scope';

export const runtime = 'nodejs';

const DESTINATIONS = new Set(['manual', 'discord', 'slack']);

interface LogRow {
  id: string;
  report_type: string;
  format: string | null;
  brand_slug: string;
  period_label: string | null;
  destination: string;
  created_by: string | null;
  created_at: string;
}

export async function GET() {
  const scope = await getWorkspaceScope();
  if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from('report_log')
    .select('id, report_type, format, brand_slug, period_label, destination, created_by, created_at')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const entries = ((data ?? []) as LogRow[])
    .filter((r) =>
      r.brand_slug === 'all' ? scope.brandScope.kind === 'all' : isBrandInScope(scope, { slug: r.brand_slug }),
    )
    .map((r) => ({
      id: r.id,
      reportType: r.report_type,
      format: r.format,
      brandSlug: r.brand_slug,
      periodLabel: r.period_label,
      destination: r.destination,
      createdAt: r.created_at,
      createdBy: r.created_by,
    }));

  return NextResponse.json({ entries });
}

export async function POST(req: NextRequest) {
  const scope = await getWorkspaceScope();
  if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: {
    reportType?: string;
    format?: string | null;
    brand?: string;
    periodLabel?: string | null;
    destination?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const reportType = typeof body.reportType === 'string' ? body.reportType.slice(0, 60).trim() : '';
  if (!reportType) return NextResponse.json({ error: 'reportType required' }, { status: 400 });
  const destination = typeof body.destination === 'string' ? body.destination : 'manual';
  if (!DESTINATIONS.has(destination)) {
    return NextResponse.json({ error: 'Invalid destination' }, { status: 400 });
  }
  const brand = typeof body.brand === 'string' && body.brand ? body.brand : 'all';
  if (brand === 'all' ? scope.brandScope.kind !== 'all' : !isBrandInScope(scope, { slug: brand })) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const session = await createClient();
  const { data: userData } = await session.auth.getUser();

  const supabase = await createAdminClient();
  const { data: row, error } = await supabase
    .from('report_log')
    .insert({
      report_type: reportType,
      format: typeof body.format === 'string' && body.format ? body.format.slice(0, 40) : null,
      brand_slug: brand,
      period_label:
        typeof body.periodLabel === 'string' && body.periodLabel ? body.periodLabel.slice(0, 120) : null,
      destination,
      created_by: userData?.user?.email ?? null,
    })
    .select('id')
    .single();
  if (error || !row) return NextResponse.json({ error: error?.message ?? 'Insert failed' }, { status: 500 });

  return NextResponse.json({ id: row.id });
}
