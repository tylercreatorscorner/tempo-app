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
  const { data, error } = await admin.from('client_reports')
    .select('token,period_label,period_start,period_end,created_at')
    .eq('tenant_id', anchor.tenant_id).eq('brand_slug', anchor.brand_slug)
    .eq('report_type', anchor.report_type).is('revoked_at', null)
    .order('period_end', { ascending: false }).order('period_start', { ascending: false })
    .order('created_at', { ascending: false }).order('id', { ascending: false })
    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  if (error) return NextResponse.json({ error: 'Report history is temporarily unavailable.' }, { status: 503, headers });
  const rows = data ?? [];
  return NextResponse.json({ reports: rows.slice(0, PAGE_SIZE), nextPage: rows.length > PAGE_SIZE ? page + 1 : null }, { headers });
}
