import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { inviteReply, isInviteCode } from '@/lib/auth/public-invite';

export async function POST(request: NextRequest) {
  try {
    if (request.headers.get('origin') !== request.nextUrl.origin) return inviteReply({ error: 'Invalid request origin' }, 403);
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
      return inviteReply({ error: 'Send JSON onboarding details' }, 415);
    }
    const raw = await request.text();
    if (raw.length > 10000) return inviteReply({ error: 'Onboarding details are too large' }, 413);
    let body: unknown;
    try { body = JSON.parse(raw); } catch { return inviteReply({ error: 'Invalid onboarding details' }, 400); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return inviteReply({ error: 'Invalid onboarding details' }, 400);
    const input = body as Record<string, unknown>;
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
    const handles = Array.isArray(input.tiktok_usernames)
      ? input.tiktok_usernames.map(value => typeof value === 'string' ? value.trim().replace(/^@/, '').toLowerCase() : '') : [];
    if (!isInviteCode(input.code) || !name || name.length > 100 || /[\u0000-\u001f\u007f]/.test(name)
      || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || /[\u0000-\u001f\u007f]/.test(email)
      || handles.length < 1 || handles.length > 10 || new Set(handles).size !== handles.length
      || handles.some(handle => !/^[a-z0-9_.]{1,24}$/.test(handle) || handle.endsWith('.'))) {
      return inviteReply({ error: 'Enter your name, a valid email, and 1–10 different TikTok usernames.' }, 400);
    }
    // The transaction resolves brand and tenant exclusively from the locked
    // invite. It never updates an existing identity or verifies a claimed handle.
    const db = await createAdminClient();
    const result = await db.rpc('register_creator_invite', {
      p_code: input.code, p_name: name, p_email: email, p_tiktok_usernames: handles,
    });
    if (result.error) {
      if (result.error.code === '22023') return inviteReply({ error: 'Invalid onboarding details' }, 400);
      if (result.error.code === 'P0001' && result.error.message === 'Invite unavailable') {
        return inviteReply({ error: 'This invitation is no longer available. Ask your brand manager for a new link.' }, 410);
      }
      if ((result.error.code === 'P0001' && result.error.message === 'Creator identity requires review') || result.error.code === '23505') {
        return inviteReply({ error: 'This information needs to be verified by your brand manager. No existing creator account was changed.' }, 409);
      }
      return inviteReply({ error: 'Could not save your details. Please retry or contact your brand manager.' }, 503);
    }
    if (typeof result.data !== 'string') return inviteReply({ error: 'Could not confirm your registration. Contact your brand manager before retrying.' }, 503);
    return inviteReply({ success: true, creator_id: result.data, verified: false, verified_usernames: [] });
  } catch {
    return inviteReply({ error: 'Could not save your details. Please retry or contact your brand manager.' }, 503);
  }
}
