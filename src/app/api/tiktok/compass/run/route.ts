/**
 * POST /api/tiktok/compass/run — run ONE brand-day of the Compass offline
 * export on demand.
 *
 * This exists so the first live test is one button rather than a cron firing at
 * 3am against ~14 brands with an unverified file format. There is deliberately
 * NO schedule wired anywhere: see the spike checklist at the bottom of
 * src/lib/tiktok/compass.ts. Add a cron only after a real shop has authorized
 * and the artifact format has been confirmed.
 *
 * RECOMMENDED FIRST CALL: { "brandSlug": "...", "dryRun": true }. That drives
 * create → poll → download → format detection → header sniff → parse →
 * validate, and writes no fact rows. Its response carries the two things a
 * spike actually needs: the file's magic bytes, and the matched/missing column
 * lists.
 *
 * Auth is the repo's normal admin idiom (requireAdmin + assertNotImpersonating).
 * Notably NOT a service-role bearer token: the deleted /api/tiktok/sync accepted
 * the service-role key in an Authorization header, which turned the app's most
 * privileged credential into an API password. It is not coming back.
 */
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import { assertNotImpersonating } from '@/lib/auth/platform-admin';
import { getBrandRegistry } from '@/lib/data/brand-registry';
import { resolveExplicitBrandSlug } from '@/lib/tiktok/brand-resolution';
import { ingestCompassBrandDay } from '@/lib/tiktok/compass-ingest';
import {
  isCompassModuleType,
  isValidApiVersion,
  marketToday,
  marketYesterday,
  type CompassModuleType,
  type CompassWindowType,
} from '@/lib/tiktok/compass';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** The poll loop's default 40s budget plus create/download/parse/write, inside
 *  Vercel's ceiling. If real tasks need longer, the lifecycle must split across
 *  invocations — which is why the task id is persisted before polling. */
export const maxDuration = 60;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const WINDOW_TYPES: CompassWindowType[] = ['PAST_24H', 'PAST_7_DAYS', 'PAST_30_DAYS'];

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden — admin access required' }, { status: 403 });

  try {
    await assertNotImpersonating();
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Read-only' }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    brandSlug?: unknown;
    reportDate?: unknown;
    moduleType?: unknown;
    windowType?: unknown;
    dryRun?: unknown;
    overwrite?: unknown;
    // Spike knobs — both are documented guesses in compass.ts, exposed here so
    // the first live probe can walk candidates without a redeploy.
    apiVersion?: unknown;
    paramsIn?: unknown;
    docType?: unknown;
  };

  // ── brand: resolved, never guessed. A shop written under an umbrella slug
  // produces fact rows no read path will ever select (see brand-resolution).
  const registry = await getBrandRegistry();
  const resolved = resolveExplicitBrandSlug(registry, typeof body.brandSlug === 'string' ? body.brandSlug.trim() : '');
  if (!resolved.ok) {
    return NextResponse.json(
      { error: resolved.message, reason: resolved.reason, candidates: resolved.candidates ?? [] },
      { status: 400 },
    );
  }

  // ── date: MARKET-local, not UTC. A naive UTC "yesterday" asks for the wrong
  // day for up to 8 hours every night (US markets are UTC-8/-7).
  const reportDate = typeof body.reportDate === 'string' && body.reportDate.trim() !== ''
    ? body.reportDate.trim()
    : marketYesterday();
  if (!ISO_DATE.test(reportDate)) {
    return NextResponse.json({ error: `reportDate must be YYYY-MM-DD, got "${reportDate}"` }, { status: 400 });
  }
  const marketNow = marketToday();
  if (reportDate > marketNow) {
    return NextResponse.json(
      { error: `BLOCKED: ${reportDate} is in the future in the shop's market (today is ${marketNow} there).` },
      { status: 400 },
    );
  }

  const moduleType: CompassModuleType = isCompassModuleType(body.moduleType) ? body.moduleType : 'CREATOR';
  if (body.moduleType !== undefined && !isCompassModuleType(body.moduleType)) {
    return NextResponse.json(
      { error: `moduleType must be one of CREATOR, VIDEO, PRODUCT — got ${JSON.stringify(body.moduleType)}` },
      { status: 400 },
    );
  }

  let windowType: CompassWindowType = 'PAST_24H';
  if (body.windowType !== undefined) {
    if (!WINDOW_TYPES.includes(body.windowType as CompassWindowType)) {
      return NextResponse.json(
        {
          error:
            `windowType must be one of ${WINDOW_TYPES.join(', ')} — Compass has no arbitrary date range. ` +
            `A backfill is one task per day.`,
        },
        { status: 400 },
      );
    }
    windowType = body.windowType as CompassWindowType;
  }

  if (body.apiVersion !== undefined && (typeof body.apiVersion !== 'string' || !isValidApiVersion(body.apiVersion))) {
    return NextResponse.json({ error: 'apiVersion must be a six-digit TikTok API version, e.g. "202405"' }, { status: 400 });
  }
  if (body.paramsIn !== undefined && body.paramsIn !== 'body' && body.paramsIn !== 'query') {
    return NextResponse.json({ error: 'paramsIn must be "body" or "query"' }, { status: 400 });
  }

  try {
    const result = await ingestCompassBrandDay({
      brandSlug: resolved.brandSlug,
      reportDate,
      moduleType,
      windowType,
      dryRun: body.dryRun === true,
      overwrite: body.overwrite !== false,
      request: {
        apiVersion: typeof body.apiVersion === 'string' ? body.apiVersion : undefined,
        paramsIn: body.paramsIn === 'query' ? 'query' : undefined,
      },
      poll: { docType: typeof body.docType === 'string' ? body.docType : undefined },
    });

    // Always 200 for a run that completed its lifecycle, 422 for one that
    // refused to write. Either way the FULL report is the body — a failed run
    // whose diagnosis is only in the server log is how the last outage stayed
    // invisible for ten days.
    return NextResponse.json(result, { status: result.ok ? 200 : 422 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[tiktok/compass] run failed for ${resolved.brandSlug} ${reportDate}: ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
