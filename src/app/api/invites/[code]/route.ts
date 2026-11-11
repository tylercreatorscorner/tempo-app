import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { inviteReply, isInviteCode, readPublicInvite } from '@/lib/auth/public-invite';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await params;
    if (!isInviteCode(code)) return inviteReply({ error: 'Invalid invite code' }, 404);
    const result = await readPublicInvite(await createAdminClient(), code);
    if ('error' in result) return inviteReply({ error: result.error }, result.status);
    return inviteReply({
      brand: result.brand.slug,
      brand_display_name: result.brand.display_name || result.brand.name,
    });
  } catch {
    return inviteReply({ error: 'Could not validate this invitation. Please retry.' }, 503);
  }
}
