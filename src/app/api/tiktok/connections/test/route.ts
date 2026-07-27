/**
 * POST /api/tiktok/connections/test   { brand: "jiyu" }
 *
 * The first thing in Tempo that actually calls TikTok.
 *
 * Everything in src/lib/tiktok has been written, reviewed and unit-tested
 * against fixtures, and NONE of it has ever been validated by TikTok's servers:
 * the HMAC signature, the auth/API host split, shop_cipher scoping, the response
 * envelope, the error taxonomy. A connection row exists and `last_api_call` says
 * Never. This proves the path end to end, on demand, from the environment where
 * the credentials actually live.
 *
 * It is deliberately a PRODUCT SURFACE and not a script:
 *   · the credentials are in Vercel, not on anyone's laptop
 *   · it exercises the same getActiveConnection -> TikTokClient path the ingest
 *     will use, so a green result means the real code works, not that a
 *     hand-rolled copy of it works
 *   · an operator looking at a connection should be able to ask "is this still
 *     alive" and get an answer, forever — not just today
 *
 * READ-ONLY. Two GETs. It never writes to the shop.
 *
 * ⚠️ It deliberately does NOT call the token refresh. TikTok may rotate and
 * invalidate the old refresh token when a new pair is issued, so a "test" that
 * refreshes without persisting could destroy a live connection and force the
 * client to authorize again. Refresh is a separate, deliberate, persisting
 * operation (refreshConnectionTokens in connections.ts) and getActiveConnection
 * already performs it when the access token is near expiry — which this route
 * will trigger naturally, and safely, when the time comes.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import {
  getActiveConnection,
  touchApiCall,
  recordConnectionError,
} from '@/lib/tiktok/connections';
import { TikTokError } from '@/lib/tiktok/client';

export const runtime = 'nodejs';

interface Probe {
  name: string;
  path: string;
  ok: boolean;
  detail: string;
  /** A small, non-secret shape summary — enough to see the envelope is right. */
  sample?: unknown;
}

export async function POST(request: NextRequest) {
  const profile = await requireAdmin();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let brand = '';
  try {
    const body = (await request.json()) as { brand?: string };
    brand = (body.brand ?? '').trim();
  } catch {
    return NextResponse.json({ error: 'Body must be JSON: { brand }' }, { status: 400 });
  }
  if (!brand) return NextResponse.json({ error: 'Missing brand' }, { status: 400 });

  const conn = await getActiveConnection(brand);
  if (!conn.ok) {
    return NextResponse.json(
      { error: conn.message, reason: conn.reason, needsReauthorization: conn.needsReauthorization },
      { status: 409 },
    );
  }

  const probes: Probe[] = [];
  // No `scoped` flag: TikTokClient decides for itself, injecting shop_cipher
  // and stripping it for the /authorization/{v}/ and /seller/{v}/ paths that
  // cannot carry one. Passing our own would just be a second opinion able to
  // disagree with the client the ingest will actually use.
  const run = async (name: string, path: string, query: Record<string, string>) => {
    try {
      const res = await conn.client.get<Record<string, unknown>>(path, query);
      probes.push({
        name,
        path,
        ok: true,
        detail: res.requestId ? `OK · request ${res.requestId}` : 'OK',
        // Keys only — never values. A shop cipher or seller identifier has no
        // business in an API response an operator might paste somewhere.
        sample:
          res.data && typeof res.data === 'object'
            ? Object.keys(res.data as object).slice(0, 12)
            : typeof res.data,
      });
    } catch (e) {
      const te = e instanceof TikTokError ? e : null;
      probes.push({
        name,
        path,
        ok: false,
        detail: te
          ? `${te.constructor.name}: ${te.message}`
          : e instanceof Error ? e.message : String(e),
      });
    }
  };

  // 1. Unscoped. If the signature or the token is wrong, this is where it shows,
  //    with no shop_cipher in play to confuse the diagnosis.
  await run('authorized shops', '/authorization/202309/shops', {});

  // 2. Scoped, AND aimed at the family we actually need.
  //
  // The first version of this probe called
  // /analytics/{v}/shops/{id}/performance — a path I guessed at, which is not in
  // the confirmed-live set. TikTok answered 40006 "no schema found", i.e. it does
  // not recognise that path/version pair at all. That taught us nothing about the
  // client, because probe 1 had already proven the client.
  //
  // What is actually worth testing is Compass, because the whole question of
  // whether the API can replace the spreadsheet runs through it — and its API
  // VERSION is an open guess. compass.ts says so in as many words: 202405 is
  // "the least-arbitrary starting guess", picked because a sibling family uses
  // it. Listing tasks is a read-only GET, so probing several versions is free
  // and answers item 1 of the spike checklist.
  //
  // 40006 "no schema found" means the version is wrong. ANY other outcome —
  // success, an empty list, a permission error — means the version is real.
  const versions = ['202309', '202312', '202401', '202405', '202409', '202501'];
  for (const v of versions) {
    await run(`compass tasks @${v}`, `/affiliate_seller/${v}/compass/offline_tasks`, {
      page_size: '1',
    });
  }

  // The version sweep is EXPECTED to mostly fail — that is how it identifies the
  // right one. So health is judged on the foundation probe alone, and the sweep
  // is reported separately rather than dragging the whole result red.
  const foundation = probes[0];
  const sweep = probes.slice(1);
  const liveVersions = sweep.filter((p) => p.ok).map((p) => p.name);
  const ok = Boolean(foundation?.ok);

  if (ok) {
    await touchApiCall(conn.connectionId);
  } else if (foundation) {
    await recordConnectionError(conn.connectionId, `${foundation.name}: ${foundation.detail}`);
  }

  return NextResponse.json({
    brand: conn.brandSlug,
    shopName: conn.shopName,
    shopId: conn.shopId,
    ok,
    foundation,
    compassVersionsThatAnswered: liveVersions,
    probes,
  });
}
