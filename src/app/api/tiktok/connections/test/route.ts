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

  // 2. Scoped. Proves shop_cipher injection works — the piece the condemned
  //    module got wrong for months by sending an always-undefined shop_id.
  const end = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);
  const start = new Date(Date.now() - 9 * 86_400_000).toISOString().slice(0, 10);
  await run(
    'shop performance',
    `/analytics/202405/shops/${conn.shopId}/performance`,
    { start_date_ge: start, end_date_lt: end, granularity: 'ALL' },
  );

  const allOk = probes.every((p) => p.ok);
  if (allOk) {
    await touchApiCall(conn.connectionId);
  } else {
    const first = probes.find((p) => !p.ok);
    if (first) await recordConnectionError(conn.connectionId, `${first.name}: ${first.detail}`);
  }

  return NextResponse.json({
    brand: conn.brandSlug,
    shopName: conn.shopName,
    shopId: conn.shopId,
    ok: allOk,
    probes,
  });
}
