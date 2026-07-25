/**
 * POST /connect/tiktok/[token]/redeem — spend a client connect link and hand
 * the client off to TikTok.
 *
 * PUBLIC, and reachable only because '/connect/tiktok/' is in PUBLIC_PATHS
 * (matched with startsWith, so this nested path is covered by the same entry as
 * the page).
 *
 * WHY A POST. The page at ../ is a GET that writes nothing but a capped open
 * stamp. Redemptions are a bounded budget, and email link scanners and chat
 * unfurlers GET every URL in a message before a human sees it — a GET that
 * redeemed would spend that budget in transit, on nobody. Bots do not submit
 * forms.
 *
 * There is no CSRF token and none is needed: no session rides this request, and
 * the invite token in the path IS the entire credential. An attacker who can
 * forge this POST already holds the link, and the worst they achieve is
 * spending it — which surfaces as an unexpected pending authorization that an
 * admin must look at and reject.
 *
 * ORDER OF OPERATIONS — spend the redemption BEFORE minting the state. The
 * reverse reads better (a failed mint would leave the budget untouched) but it
 * is wrong: it would let anyone holding a live token hammer this endpoint and
 * mint a state row per request, filling tiktok_oauth_states. Spending first
 * makes the flow bounded by construction — one invite can produce AT MOST FIVE
 * state rows, ever.
 *
 * AT MOST FIVE, not one. The earlier draft burned the link on the first click,
 * which is dead wrong for the exact scenario this feature exists for: the
 * client is signed in to Seller Center as a sub-account, presses Continue,
 * TikTok refuses them, they sign back in as the owner, re-open the emailed
 * link — and find it dead. The counter keeps the states-table bound while
 * leaving four retries for a human having a bad morning. `consumed_at` is
 * reserved for a genuinely COMPLETED authorization and is stamped by the
 * callback, not here.
 */
import { NextResponse } from 'next/server';
import { buildAuthorizeUrl, checkConnectPreflight } from '@/lib/tiktok/authorize';
import { looksLikeInviteToken, redeemConnectInvite } from '@/lib/tiktok/connect-invites';
import { createOauthState } from '@/lib/tiktok/oauth-state';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Context {
  params: Promise<{ token: string }>;
}

/** Back to the invite page, which owns all of the client-facing wording.
 *  `issue` describes OUR deployment, never the token — it says nothing about
 *  whether the link exists. */
function backToPage(request: Request, token: string, issue?: 'unavailable'): NextResponse {
  const target = new URL(`/connect/tiktok/${encodeURIComponent(token)}`, request.url);
  if (issue) target.searchParams.set('issue', issue);
  // 303: this is the answer to a POST, and the browser must follow it with a
  // GET rather than re-posting.
  return NextResponse.redirect(target, 303);
}

export async function POST(request: Request, { params }: Context) {
  const { token } = await params;

  if (!token || !looksLikeInviteToken(token)) return backToPage(request, token ?? '');

  // Preflight BEFORE consuming. A deployment missing its TikTok credentials
  // would otherwise burn the client's one-shot link on a round trip that could
  // never have finished, and the client would have to ask for another.
  const preflight = checkConnectPreflight();
  if (!preflight.ok) {
    console.error(`[tiktok/connect-invite] refusing redemption: ${preflight.message}`);
    return backToPage(request, token, 'unavailable');
  }

  let redeemed;
  try {
    redeemed = await redeemConnectInvite(token);
  } catch (err) {
    console.error(
      `[tiktok/connect-invite] redeem failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return backToPage(request, token, 'unavailable');
  }

  // Revoked, expired, exhausted, already authorized, or never issued — one
  // answer, on purpose. The page re-reads the token and renders its "link isn't
  // active" state.
  if (!redeemed) return backToPage(request, token);

  let state: string;
  try {
    // The invite travels onto the state row: it decides how long the OPERATOR
    // gets to bind a shop once the client's authorization lands. The admin
    // flow's 15 minutes would erase these tokens before anyone woke up.
    state = await createOauthState(redeemed.brandSlug, {
      id: redeemed.id,
      expiresAt: redeemed.expiresAt,
    });
  } catch (err) {
    // One retry is gone from the budget (see the header on why that ordering is
    // the right trade) but the link still works. Loud, because a client is
    // sitting in front of an error they cannot fix.
    console.error(
      `[tiktok/connect-invite] spent a redemption for "${redeemed.brandSlug}" but could not mint a ` +
        `state: ${err instanceof Error ? err.message : String(err)}`,
    );
    return backToPage(request, token, 'unavailable');
  }

  // From here the flow is the EXISTING one, unchanged: TikTok redirects to
  // /auth/tiktok/callback, which claims this state, exchanges the code and
  // parks an encrypted pending authorization. An authenticated admin still
  // chooses which shop binds to which brand. That separation is the security
  // control and nothing here weakens it.
  return NextResponse.redirect(buildAuthorizeUrl(preflight.serviceId, state), 303);
}

/** Someone landing here directly (a scanner following the form action, a
 *  refresh) gets the page, not a bare 405 — and nothing is spent. */
export async function GET(request: Request, { params }: Context) {
  const { token } = await params;
  return backToPage(request, token ?? '');
}
