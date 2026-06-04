/**
 * POST /api/auth/creator/contacts
 *
 * Creator self-service: save (or skip) contact info during the portal
 * onboarding step. Authenticated by the creator_session JWT — a creator can
 * only write their OWN creators_v2 row + contacts.
 *
 * Body:
 *   { skip: true }                              → just mark onboarding done
 *   { email?, phone?, smsOptIn?: boolean }      → save contacts + mark done
 *
 * Writes to creator_contacts (canonical) + records consent events, and mirrors
 * email/phone onto creators_v2 for back-compat with legacy readers.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getCreatorSession } from '@/lib/auth/creator-auth';
import { createAdminClient } from '@/lib/supabase/server';
import {
  upsertCreatorContact,
  markContactOnboardingDone,
  normalizePhoneE164,
  SMS_CONSENT_TEXT_VERSION,
} from '@/lib/data/creator-contacts';

export const runtime = 'nodejs';

function clientIp(req: NextRequest): string | null {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('x-real-ip');
}

export async function POST(request: NextRequest) {
  const session = await getCreatorSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const creatorId = String(session.creatorId);
  const body = await request.json().catch(() => ({}));

  // Skip path — record that we prompted them, write nothing else.
  if (body?.skip === true) {
    await markContactOnboardingDone(creatorId);
    return NextResponse.json({ ok: true, skipped: true });
  }

  const ip = clientIp(request);
  const userAgent = request.headers.get('user-agent');

  const rawEmail = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const rawPhone = typeof body.phone === 'string' ? body.phone.trim() : '';
  const smsOptIn = body.smsOptIn === true;

  // Resolve tenant for the new contact rows (best-effort; column is nullable).
  const supabase = await createAdminClient();
  const { data: cv } = await supabase
    .from('creators_v2')
    .select('tenant_id')
    .eq('id', creatorId)
    .maybeSingle();
  const tenantId = (cv as { tenant_id: string | null } | null)?.tenant_id ?? null;

  const saved: string[] = [];
  const warnings: string[] = [];

  if (rawEmail) {
    // Light validation — a real address has an @ and a dot after it.
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(rawEmail)) {
      await upsertCreatorContact({
        creatorId, tenantId, channel: 'email', value: rawEmail,
        consentSource: 'creator_portal_onboarding', ip, userAgent,
      });
      saved.push('email');
    } else {
      warnings.push('email_invalid');
    }
  }

  let phoneE164: string | null = null;
  if (rawPhone) {
    phoneE164 = normalizePhoneE164(rawPhone);
    if (phoneE164) {
      await upsertCreatorContact({
        creatorId, tenantId, channel: 'sms', value: phoneE164,
        smsOptIn,
        consentSource: 'creator_portal_onboarding',
        consentTextVersion: SMS_CONSENT_TEXT_VERSION,
        ip, userAgent,
      });
      saved.push('sms');
    } else {
      warnings.push('phone_invalid');
    }
  }

  // Mirror onto creators_v2 for back-compat (legacy readers still use these).
  const mirror: Record<string, string> = {};
  if (saved.includes('email')) mirror.email = rawEmail;
  if (phoneE164) mirror.phone = phoneE164;
  if (Object.keys(mirror).length > 0) {
    await supabase.from('creators_v2').update(mirror).eq('id', creatorId);
  }

  await markContactOnboardingDone(creatorId);

  return NextResponse.json({ ok: true, saved, warnings });
}
