/**
 * GET /api/auth/creator/verify?token=<jwt>
 *
 * Consumes a magic-link token: verifies signature/expiry, marks the JTI
 * as consumed in `creator_magic_link_tokens`, sets the 30-day session
 * cookie, and redirects to the creator dashboard.
 *
 * Replay protection: a token's JTI can only be inserted into the consumed
 * table once. A second visit with the same URL hits the PK uniqueness
 * constraint and is rejected.
 */
import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, setCreatorSession } from '@/lib/auth/creator-auth';
import { createAdminClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

function failureRedirect(req: NextRequest, code: string): NextResponse {
  return NextResponse.redirect(new URL(`/creator-login?error=${code}`, req.url));
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  if (!token) return failureRedirect(request, 'missing_token');

  const payload = await verifyToken(token);
  if (!payload) return failureRedirect(request, 'invalid_token');

  // Magic-link tokens always carry a jti. Refuse to log in if it's missing —
  // that means the caller is trying to use a non-magic-link token (e.g. a
  // session cookie pasted into the URL) which could otherwise let an attacker
  // who briefly observed a session token bypass the single-use check.
  const jti = payload.jti;
  if (!jti || typeof jti !== 'string') return failureRedirect(request, 'invalid_token');

  // Consume the JTI. PK violation = replay = reject.
  const supabase = await createAdminClient();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const { error: insertErr } = await supabase
    .from('creator_magic_link_tokens')
    .insert({
      jti,
      creator_id: String(payload.creatorId),
      expires_at: expiresAt,
    });

  if (insertErr) {
    // Postgres unique-violation = 23505 → token already consumed.
    const code = (insertErr as { code?: string }).code;
    if (code === '23505') return failureRedirect(request, 'token_already_used');
    console.error('[Creator Verify] Failed to record token consume:', insertErr);
    return failureRedirect(request, 'verify_failed');
  }

  await setCreatorSession({
    creatorId: payload.creatorId,
    email: payload.email,
  });

  return NextResponse.redirect(new URL('/creator-dashboard', request.url));
}
