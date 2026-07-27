/**
 * GET /api/tiktok/connections — everything the Settings panel renders.
 *
 * Four lists in one round trip because they are read together and are
 * meaningless apart: the connections, the authorizations waiting on a human,
 * the outstanding client links, and the store brands that can legally own a
 * shop.
 *
 * No merchant token material is ever in this response. It DOES carry invite
 * URLs — the operator has to be able to re-copy a link they sent yesterday —
 * which is admin-gated the same way the rest of this payload is.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import { getBrandRegistry } from '@/lib/data/brand-registry';
import { isStoreBrand } from '@/lib/tiktok/brand-resolution';
import { checkConnectPreflight } from '@/lib/tiktok/authorize';
import { listConnectionStatus } from '@/lib/tiktok/connections';
import { listPendingAuthorizations, sweepOauthStates } from '@/lib/tiktok/oauth-state';
import { buildInviteUrl, describeInviteState, listConnectInvites } from '@/lib/tiktok/connect-invites';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Same convention as the invoice and client-report share links. */
function appBaseUrl(req: NextRequest): string {
  const env = process.env.NEXT_PUBLIC_APP_URL;
  if (env) return env.replace(/\/$/, '');
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    // Erase lapsed pending credentials BEFORE reading, so the panel can never
    // list an authorization whose tokens should already be gone. pg_cron is the
    // real schedule (migration 117); this just makes the Settings page a second
    // trigger. Non-throwing by design — a failed sweep must not blank the panel.
    await sweepOauthStates();

    const registry = await getBrandRegistry();
    const [connections, pending] = await Promise.all([
      listConnectionStatus(),
      listPendingAuthorizations(),
    ]);

    // Settled SEPARATELY, and deliberately not inside the Promise.all above.
    // listConnectInvites throws by design, and this branch can be deployed
    // before migration 118 is applied — which would make every read of this
    // endpoint a 500, the panel take its cold-failure branch, and the operator
    // lose live connections, disconnect, and the ability to CONFIRM a pending
    // authorization. "Deployed ahead of its migration" is a supported state,
    // not an incident: the invite section degrades to a scoped banner and
    // everything else keeps working.
    let invites: Awaited<ReturnType<typeof listConnectInvites>> = [];
    let invitesError: string | null = null;
    try {
      invites = await listConnectInvites();
    } catch (err) {
      invitesError =
        err instanceof Error ? err.message : 'Could not read the client connect links.';
      console.error(`[tiktok/connect] invite list failed: ${invitesError}`);
    }

    // Umbrellas are excluded because a shop cannot map to one; archived brands
    // are excluded because connecting a retired brand is never the intent.
    const brands = registry.rows
      .filter((b) => isStoreBrand(b) && !b.is_archived)
      .map((b) => ({ slug: b.slug, label: b.display_name || b.name }))
      .sort((a, b) => a.label.localeCompare(b.label));

    const preflight = checkConnectPreflight();

    // State is derived HERE, not in the panel: the classification order
    // (revoked > authorized > expired > exhausted > redeemed > opened) is the
    // same one the SQL uses, and one copy of it is the only way those two stay
    // in agreement. One `now` for the whole list so two rows a millisecond
    // apart cannot land on different sides of an expiry.
    const now = new Date();
    const base = appBaseUrl(request);
    const pendingBrands = new Set(pending.map((p) => p.brandSlug));

    return NextResponse.json({
      configured: preflight.ok,
      configurationError: preflight.ok ? null : preflight.message,
      connections,
      // shop_cipher is stripped before this leaves the server. It is the
      // per-shop credential required on EVERY subsequent Shop API call, and
      // nothing in the UI reads it — the operator picks a shop by id, and the
      // confirm route resolves the cipher server-side from the pending row. So
      // shipping it to the browser bought nothing and put a credential into
      // devtools, any exported HAR, and every extension with page access.
      // The sibling test route already refuses to echo one ("Keys only — never
      // values"); this makes the two agree.
      pending: pending.map((p) => ({
        ...p,
        shops: p.shops.map(({ cipher: _cipher, ...shop }) => shop),
      })),
      brands,
      invitesError,
      invites: invites.map((invite) => ({
        id: invite.id,
        brandSlug: invite.brandSlug,
        url: buildInviteUrl(base, invite.token),
        createdAt: invite.createdAt,
        createdBy: invite.createdBy,
        expiresAt: invite.expiresAt,
        lastOpenedAt: invite.lastOpenedAt,
        openCount: invite.openCount,
        redeemCount: invite.redeemCount,
        lastRedeemedAt: invite.lastRedeemedAt,
        state: describeInviteState(invite, now),
        // Is an authorization from this link SITTING THERE right now? Matched
        // on brand rather than on the invite id, because listPendingAuthorizations
        // deliberately does not select the invite_id column — that select would
        // fail on a deployment running ahead of migration 118, and the pending
        // list is the one thing that must never stop rendering. Over-attributing
        // an admin-initiated authorization to a link for the SAME brand is
        // harmless: "waiting on you" is true either way, and the evidence-backed
        // claim ('authorized') comes from consumed_at alone.
        awaitingConfirm: pendingBrands.has(invite.brandSlug),
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[tiktok/connect] status read failed: ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
