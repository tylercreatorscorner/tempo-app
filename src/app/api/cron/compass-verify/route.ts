/**
 * GET /api/cron/compass-verify — check what was uploaded against what TikTok says.
 *
 * Compass cannot REPLACE the manual upload: its only working module is CREATOR
 * and that report carries 11 of the 23 columns the Affiliate Center download
 * has (measured 2026-07-31; VIDEO and PRODUCT are refused at task creation).
 * But those 11 include GMV, orders, items sold and refunds per creator per day,
 * fetched with nobody touching a file — which is an INDEPENDENT second opinion
 * on what the upload claims.
 *
 * That is the thing that was missing during the July incident and the 5,000-row
 * truncations: a short export and a quiet day looked identical, and nobody
 * found out until invoicing. A 45% disagreement between these two sources is
 * not ambiguous.
 *
 * ⚠️ READ-ONLY against every fact table. It writes compass_verifications and
 * nothing else. If that ever changes, the guarantee this endpoint exists to
 * provide is gone.
 *
 * WHICH DAY: default is 3 days back in the shop's market timezone. The manual
 * export lags ~2 days (measured: 2-4), so checking yesterday would flag every
 * brand every night for a file nobody was late with. Three days is late enough
 * that an absence is real.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyBrandDay, saveVerification } from '@/lib/tiktok/compass-verify';
import { marketToday, COMPASS_MARKET_TIME_ZONE } from '@/lib/tiktok/compass';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** One Compass task per brand, each with its own poll budget. Sized for the
 *  handful of brands connected today; if this grows past what fits, the sweep
 *  must fan out across invocations rather than raising the ceiling forever. */
export const maxDuration = 300;

/** How far back to check. See the header — the export lags ~2 days. */
const LAG_DAYS = 3;

export async function GET(request: NextRequest) {
  // FAIL CLOSED. An unset CRON_SECRET must mean "nobody", not "everybody" —
  // the middleware exempts /api/cron/*, so this is the only gate.
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const dateParam = url.searchParams.get('date');
  const brandParam = url.searchParams.get('brand');

  // Market-local, not UTC: a naive UTC "3 days ago" names the wrong day for
  // eight hours every night, and this check is entirely about which day it is.
  const today = marketToday(new Date(), COMPASS_MARKET_TIME_ZONE);
  const anchor = new Date(`${today}T00:00:00Z`);
  anchor.setUTCDate(anchor.getUTCDate() - LAG_DAYS);
  const reportDate = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
    ? dateParam
    : anchor.toISOString().slice(0, 10);

  const supabase = await createAdminClient();
  const { data: conns, error } = await supabase
    .from('tiktok_shop_connections')
    .select('brand_slug')
    .eq('is_active', true);

  if (error) {
    // A failed read is not "no brands are connected" — that would report a
    // clean sweep having checked nothing.
    return NextResponse.json(
      { error: `could not list connections: ${error.message}` },
      { status: 500 },
    );
  }

  const brands = (conns ?? [])
    .map((c) => (c as { brand_slug: string }).brand_slug)
    .filter((b) => !brandParam || b === brandParam);

  const results: { brand: string; verdict: string; detail: string }[] = [];

  // Sequential, not parallel: each brand is a separate Compass task and TikTok
  // rate-limits. A sweep that trips the limiter checks nothing and looks fine.
  for (const brand of brands) {
    try {
      const verification = await verifyBrandDay(brand, reportDate);
      await saveVerification(verification);
      results.push({ brand, verdict: verification.verdict, detail: verification.detail });
    } catch (err) {
      // One brand's failure must not abandon the rest — and it is recorded as
      // an error rather than skipped, so a silent gap cannot pass for a pass.
      const message = err instanceof Error ? err.message : String(err);
      results.push({ brand, verdict: 'error', detail: message });
      console.error(`[cron/compass-verify] ${brand} ${reportDate}: ${message}`);
    }
  }

  const problems = results.filter(
    (r) => r.verdict !== 'match' && r.verdict !== 'api_unavailable',
  );

  return NextResponse.json({
    reportDate,
    checked: results.length,
    // api_unavailable is NOT a problem with the data — it says nothing about
    // the upload, and lumping it in would cry wolf every time TikTok is slow.
    problems: problems.length,
    results,
  });
}
