/**
 * GET /api/cron/tiktok-probe?brand=jiyu&date=2026-07-24&what=orders,videos
 *
 * A read-only research tool for replicating the CSV exports via API.
 *
 * WHY IT IS UNDER /api/cron RATHER THAN BESIDE THE OTHER TIKTOK ROUTES: those
 * are session-gated, and middleware redirects a session-less /api/* call to
 * /login — so they can only be driven by a human with a browser. Replication
 * needs dozens of experiments (does orders/search reproduce the channel split?
 * does shop_videos carry every column video_performance wants?), and one
 * button-click per iteration is not a workable loop.
 *
 * ⚠️ IT CAN LOOK AT EVERYTHING AND CHANGE NOTHING. Every call is a GET or a
 * POST /search; results land in tiktok_api_captures, an inspection buffer;
 * no fact table is touched and nothing is written to TikTok. That restraint is
 * the entire reason it is safe to expose behind a bearer token.
 */
import { NextRequest, NextResponse } from 'next/server';
import { runProbe, runRawProbe, isProbeName, PROBES, type ProbeName } from '@/lib/tiktok/probe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  // FAIL CLOSED — an unset CRON_SECRET must mean "nobody", not "everybody".
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const brand = (url.searchParams.get('brand') ?? '').trim();
  const date = (url.searchParams.get('date') ?? '').trim();
  const whatParam = (url.searchParams.get('what') ?? 'orders').trim();

  if (!brand) return NextResponse.json({ error: 'Missing brand' }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });
  }

  // ── Raw mode: ?path=/affiliate_seller/202410/foo/search&method=POST&q=a:1,b:2
  //
  // So an endpoint research just turned up can be tested immediately. The path
  // is constrained inside runRawProbe (affiliate_seller//analytics prefixes,
  // GET or POST-to-/search only) — that check lives in the lib rather than
  // here so every caller inherits it.
  const rawPath = url.searchParams.get('path');
  if (rawPath) {
    const method = (url.searchParams.get('method') ?? 'GET').toUpperCase() === 'POST' ? 'POST' : 'GET';
    const parseKv = (s: string | null): Record<string, string> => {
      const out: Record<string, string> = {};
      for (const pair of (s ?? '').split(',')) {
        const i = pair.indexOf(':');
        if (i > 0) out[pair.slice(0, i).trim()] = pair.slice(i + 1).trim();
      }
      return out;
    };
    let body: unknown = {};
    const bodyParam = url.searchParams.get('body');
    if (bodyParam) {
      try { body = JSON.parse(bodyParam); }
      catch { return NextResponse.json({ error: 'body must be valid JSON' }, { status: 400 }); }
    }
    const runId = crypto.randomUUID();
    const result = await runRawProbe(brand, rawPath, {
      method, query: parseKv(url.searchParams.get('q')), body, runId,
    });
    return NextResponse.json({ runId, brand, raw: true, results: [result] });
  }

  const requested = whatParam.split(',').map((s) => s.trim()).filter(Boolean);
  const unknown = requested.filter((w) => !isProbeName(w));
  if (unknown.length > 0) {
    return NextResponse.json(
      { error: `unknown probe(s): ${unknown.join(', ')}`, available: Object.keys(PROBES) },
      { status: 400 },
    );
  }

  const runId = crypto.randomUUID();
  const results = [];
  // Sequential: each is a separate TikTok call and they rate-limit. A sweep
  // that trips the limiter returns nothing and looks like a clean result.
  for (const what of requested as ProbeName[]) {
    results.push(await runProbe(brand, what, date, runId));
  }

  return NextResponse.json({ runId, brand, date, results });
}
