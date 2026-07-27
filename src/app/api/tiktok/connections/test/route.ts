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
 * READ-ONLY. GETs only. It never writes to the shop.
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

  // 2. COMPASS — at the only version that has ever existed.
  //
  // We previously swept 202309/202312/202401/202405/202409/202501 and every one
  // answered 40006 "no schema found". That was not a permissions wall and not a
  // wrong-family guess: the path SHAPE was already correct, and the family
  // shipped exactly once, as 202603 (~2026-04-10, about three months ago). Every
  // version we tried predates the API's existence. compass.ts still carries the
  // old guess and its own comment admitting 202405 was "the least-arbitrary
  // starting guess" — that constant is what actually has to change.
  //
  // doc_type is REQUIRED on the list call (CREATOR | BASE); omitting it would
  // produce a parameter error we could mistake for the version being wrong.
  await run('compass tasks @202603', '/affiliate_seller/202603/compass/offline_tasks', {
    doc_type: 'CREATOR',
  });

  // 3. VIDEO + LIVE PERFORMANCE — the route that may make Compass unnecessary.
  //
  // creator_performance is fed by its own xlsx export today, so it looked like an
  // irreducible primitive. It is not: video_performance carries creator_name, so
  // creator-daily can be ROLLED UP from video-daily. Measured over 2026-07-18..24
  // that rollup already recovers 74%-99% of creator-table GMV per brand
  // (bondie 99.4%, jiyu 92.0%, lemme 74.0%).
  //
  // The shortfall has two causes, and BOTH are now addressable:
  //   · truncation — the creator-days with no matching video row have a median
  //     GMV of $20-$40 and are overwhelmingly under $50, the long tail a
  //     GMV-sorted export drops. A paginated API pull does not lose them.
  //   · non-video sales — LIVE and product-card GMV are simply not video rows.
  //     shop_lives/performance is the missing half, keyed on the HOST's username,
  //     which is the same join key.
  //
  // Both live under data.shop_analytics.public.read, a scope this app ALREADY
  // holds — so unlike Compass there is no entitlement question at all.
  const vEnd = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);
  const vStart = new Date(Date.now() - 5 * 86_400_000).toISOString().slice(0, 10);
  const window = { start_date_ge: vStart, end_date_lt: vEnd, page_size: '1' };

  for (const v of ['202509', '202409', '202605']) {
    await run(`shop videos @${v}`, `/analytics/${v}/shop_videos/performance`, window);
  }
  for (const v of ['202509', '202508']) {
    await run(`shop lives @${v}`, `/analytics/${v}/shop_lives/performance`, window);
  }

  // 4. SHOP TOTAL — the reconciliation check, and the cheapest possible proof
  //    that the analytics scope itself works.
  //
  // granularity=1D returns per-day shop totals in ONE call. That is the
  // denominator every rollup above has to be judged against: if video+live
  // reconstructs 97% of the shop's own daily total, the remaining 3% is a known
  // quantity rather than an unknown one. Note the path is SINGULAR `shop` with
  // no {shop_id} segment — the /analytics/{v}/shops/{id}/performance I probed
  // first does not exist at any version, which is the whole cause of that 40006.
  for (const v of ['202509', '202405']) {
    await run(`shop total @${v}`, `/analytics/${v}/shop/performance`, {
      start_date_ge: vStart,
      end_date_lt: vEnd,
      granularity: '1D',
    });
  }

  // The version sweep is EXPECTED to mostly fail — that is how it identifies the
  // right one. So health is judged on the foundation probe alone, and the sweep
  // is reported separately rather than dragging the whole result red.
  const foundation = probes[0];
  const answered = (prefix: string) =>
    probes.filter((p) => p.name.startsWith(prefix) && p.ok).map((p) => p.name);
  const liveVersions = answered('compass');
  // Video, live and shop-total are one verdict: they share a scope, so they
  // stand or fall together and an operator should read them as one answer.
  const liveVideoVersions = [
    ...answered('shop videos'),
    ...answered('shop lives'),
    ...answered('shop total'),
  ];
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
    videoVersionsThatAnswered: liveVideoVersions,
    probes,
  });
}
