/**
 * POST /api/tiktok/connections/invite — mint a shareable connect link for ONE
 * brand, for the operator to send to the client.
 *
 * The client is the one who has to authorize: TikTok refuses a sub-account
 * ("Sub-accounts are unable to authorize"), so for most brands the agency admin
 * physically cannot complete the connect flow themselves. This route produces
 * the artifact that survives an email; /api/tiktok/connections/start remains the
 * right path when the admin IS the main account holder.
 *
 * Auth is the repo's normal admin idiom (requireAdmin + assertNotImpersonating),
 * mirroring start/confirm/cancel/disconnect. Notably NOT a bearer token: the
 * deleted /api/tiktok/sync accepted the service-role key in an Authorization
 * header, which turned the app's most privileged credential into an API
 * password. It is not coming back.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import { assertNotImpersonating } from '@/lib/auth/platform-admin';
import { getBrandRegistry } from '@/lib/data/brand-registry';
import { resolveExplicitBrandSlug } from '@/lib/tiktok/brand-resolution';
import { checkConnectPreflight } from '@/lib/tiktok/authorize';
import { hasActiveConnection } from '@/lib/tiktok/connections';
import { buildInviteUrl, createConnectInvite } from '@/lib/tiktok/connect-invites';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Same convention as the invoice and client-report share links. The env var
 *  wins so a link created from a preview deployment still points at the host
 *  the client can actually reach tomorrow. */
function appBaseUrl(req: NextRequest): string {
  const env = process.env.NEXT_PUBLIC_APP_URL;
  if (env) return env.replace(/\/$/, '');
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    await assertNotImpersonating();
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Read-only' }, { status: 403 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      brandSlug?: unknown;
      reconnect?: unknown;
    };
    const brandSlug = typeof body.brandSlug === 'string' ? body.brandSlug.trim() : '';
    const reconnect = body.reconnect === true;

    // Refuse to hand out a link that cannot work. Without this the client does
    // the hard part — finding the main seller account, signing out of a
    // sub-account — and hits our misconfiguration at the far end.
    const preflight = checkConnectPreflight();
    if (!preflight.ok) {
      return NextResponse.json({ error: preflight.message }, { status: 503 });
    }

    // Same gate as start/: an umbrella or unknown slug must never reach a
    // merchant consent screen, because a connection written under an umbrella
    // produces fact-table rows no read path will ever select.
    const registry = await getBrandRegistry();
    const resolved = resolveExplicitBrandSlug(registry, brandSlug);
    if (!resolved.ok) {
      return NextResponse.json(
        { error: resolved.message, reason: resolved.reason, candidates: resolved.candidates ?? [] },
        { status: 400 },
      );
    }

    const existing = await hasActiveConnection(resolved.brandSlug);
    if (existing && !reconnect) {
      return NextResponse.json(
        {
          error:
            `"${resolved.brandSlug}" is already connected to ${existing.shopName ?? `shop ${existing.shopId}`}. ` +
            `Sending a new link asks the client to authorize again, and confirming it replaces that link.`,
          reason: 'already_connected',
          requiresReconnect: true,
        },
        { status: 409 },
      );
    }

    const invite = await createConnectInvite({
      brandSlug: resolved.brandSlug,
      // Email, matching client_reports.created_by. Operator attribution only —
      // the client never sees it.
      createdBy: admin.email || null,
    });

    return NextResponse.json({
      id: invite.id,
      brandSlug: invite.brandSlug,
      url: buildInviteUrl(appBaseUrl(request), invite.token),
      expiresAt: invite.expiresAt,
      createdAt: invite.createdAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[tiktok/connect] invite create failed: ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
