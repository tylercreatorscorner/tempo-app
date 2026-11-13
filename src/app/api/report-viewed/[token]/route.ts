/**
 * POST /api/report-viewed/[token] — first-open beacon for shared client
 * reports. Public (the viewer has no account); fired by the share page's
 * client-side ViewBeacon so link-unfurl bots (which don't run JS) never
 * stamp viewed_at. Always 204 — the response must not confirm whether a
 * token exists.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { loadCanonicalForReport } from '@/lib/data/client-report-canonical';

export const runtime = 'nodejs';

export async function POST(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (token && token.length >= 8 && token.length <= 64) {
    try {
      const supabase = await createAdminClient();
      const { data: source, error } = await supabase.from('client_reports')
        .select('id,tenant_id,brand_slug,report_type,period_start,period_end,revoked_at')
        .eq('token', token).maybeSingle();
      if (!error && source && !source.revoked_at) {
        const canonical = await loadCanonicalForReport(source, supabase);
        await supabase.from('client_reports')
          .update({ viewed_at: new Date().toISOString() })
          .eq('token', canonical?.token ?? token)
          .is('viewed_at', null)
          .is('revoked_at', null);
      }
    } catch { /* A beacon must not disclose token existence or read failures. */ }
  }
  return new NextResponse(null, { status: 204 });
}
