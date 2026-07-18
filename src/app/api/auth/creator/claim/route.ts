/**
 * POST /api/auth/creator/claim  { token }
 *
 * Consumes a claim-link token (single-use), sets the 30-day creator session, and
 * returns the redirect target. Split from the /creator-claim GET landing on
 * purpose: the GET only PEEKS (so a Discord link-unfurl / prefetch can't burn the
 * token); this explicit POST is what actually claims it.
 */
import { NextRequest, NextResponse } from 'next/server';
import { consumeClaimToken } from '@/lib/auth/creator-claim';
import { setCreatorSession } from '@/lib/auth/creator-auth';
import { createAdminClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const token = body?.token;
  if (!token || typeof token !== 'string') {
    return NextResponse.json({ error: 'missing_token' }, { status: 400 });
  }

  const result = await consumeClaimToken(token);
  if (!result) {
    // Already used, expired, or not a valid claim token.
    return NextResponse.json({ error: 'invalid_or_used' }, { status: 400 });
  }

  await setCreatorSession({ creatorId: result.creatorId as unknown as number, email: '' });

  // First-time creators (never prompted for contact info) go through onboarding
  // once; returning creators go straight to the dashboard.
  const supabase = await createAdminClient();
  const { data: cv } = await supabase
    .from('creators_v2')
    .select('contact_onboarding_at')
    .eq('id', result.creatorId)
    .maybeSingle();
  const redirect = (cv as { contact_onboarding_at: string | null } | null)?.contact_onboarding_at
    ? '/creator-dashboard'
    : '/creator-onboarding';

  return NextResponse.json({ ok: true, redirect });
}
