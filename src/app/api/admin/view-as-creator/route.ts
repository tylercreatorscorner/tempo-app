/**
 * GET /api/admin/view-as-creator?creatorId=<uuid>
 *
 * Admin-only: drops the signed-in admin into a specific creator's portal by
 * setting a creator session for them, then redirecting to /creator-dashboard.
 * The admin's own (Supabase) session is a separate cookie and is untouched, so
 * they can return to the admin app anytime; "stop viewing" = log out of the
 * portal. Doubles as the way to eyeball any creator's portal.
 *
 * Gated by requireAdmin() (owner/admin only). Sets a session but performs no
 * creator-side write — the portal is a viewing surface.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import { setCreatorSession } from '@/lib/auth/creator-auth';
import { createAdminClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const creatorId = request.nextUrl.searchParams.get('creatorId');
  if (!creatorId) {
    return NextResponse.json({ error: 'missing_creatorId' }, { status: 400 });
  }

  // Confirm the creator exists before minting a session for them.
  const supabase = await createAdminClient();
  const { data: cv } = await supabase
    .from('creators_v2')
    .select('id')
    .eq('id', creatorId)
    .maybeSingle();
  if (!cv) {
    return NextResponse.json({ error: 'creator_not_found' }, { status: 404 });
  }

  await setCreatorSession({ creatorId: creatorId as unknown as number, email: '' });
  // Straight to the dashboard — skip the contact-onboarding step (this is a view,
  // not the creator claiming their account).
  return NextResponse.redirect(new URL('/creator-dashboard', request.url));
}
