import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
const PAGE_SIZE = 30;
const headers = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' };

/** A valid report token authorizes only its own tenant, exact brand and cadence.
 * Read metadata only: the selected /r/ link still renders its frozen snapshot.
 * Never group umbrella/store slugs or all-brand reports into a client history.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const rawPage = req.nextUrl.searchParams.get('page') ?? '0';
  const page = Number(rawPage);
  if (!/^[a-f0-9]{24}$/.test(token) || !/^\d+$/.test(rawPage) || !Number.isSafeInteger(page) || page > 10000) {
    return NextResponse.json({ error: 'Invalid report history request.' }, { status: 400, headers });
  }
  const admin = await createAdminClient();
  const { data: anchor, error: anchorError } = await admin.from('client_reports')
    .select('tenant_id,brand_slug,report_type,revoked_at').eq('token', token).maybeSingle();
  if (anchorError) return NextResponse.json({ error: 'Report history is temporarily unavailable.' }, { status: 503, headers });
  if (!anchor || anchor.revoked_at || !anchor.tenant_id || !anchor.brand_slug || anchor.brand_slug === 'all' || !['weekly','monthly'].includes(anchor.report_type)) {
    return NextResponse.json({ error: 'Report history is unavailable for this link.' }, { status: 404, headers });
  }
  // Group before paginating: multiple snapshots of August must not become
  // multiple client-facing August choices, including across database batches.
  const reports: { token: string; period_label: string; period_start: string; period_end: string; created_at: string }[] = [];
  const seen = new Set<string>();
  const batchSize = 200;
  const needed = (page + 1) * PAGE_SIZE + 1;
  for (let offset = 0; offset < 10000; offset += batchSize) {
    const { data, error } = await admin.from('client_reports')
      .select('token,period_label,period_start,period_end,created_at')
      .eq('tenant_id', anchor.tenant_id).eq('brand_slug', anchor.brand_slug)
      .eq('report_type', anchor.report_type).is('revoked_at', null)
      .order('period_end', { ascending: false }).order('period_start', { ascending: false })
      .order('created_at', { ascending: false }).order('id', { ascending: false })
      .range(offset, offset + batchSize - 1);
    if (error) return NextResponse.json({ error: 'Report history is temporarily unavailable.' }, { status: 503, headers });
    for (const report of data ?? []) {
      const period = `${report.period_start}:${report.period_end}`;
      if (!seen.has(period)) {
        seen.add(period);
        reports.push(report);
      }
    }
    if (reports.length >= needed || (data ?? []).length < batchSize) {
      return NextResponse.json({
        reports: reports.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
        nextPage: reports.length > (page + 1) * PAGE_SIZE ? page + 1 : null,
      }, { headers });
    }
  }
  // Never silently return an incomplete history if an unusually large archive
  // exceeds the bounded scan. Saved report links remain independently usable.
  return NextResponse.json({ error: 'Report history is temporarily unavailable.' }, { status: 503, headers });
}
