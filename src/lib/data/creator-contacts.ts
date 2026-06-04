/**
 * Creator contact + consent data layer.
 *
 * `creator_contacts` is the canonical per-channel contact store (one row per
 * creator + channel + value). It supersedes creators_v2.email/phone/discord_id
 * (kept as a legacy mirror). `creator_consent_events` is the append-only
 * TCPA audit log.
 *
 * Consent model:
 *   sms     → TCPA opt-IN. 'pending' until explicit express consent.
 *   email   → CAN-SPAM opt-OUT + business relationship → 'not_applicable'.
 *   discord → inbound-initiated → 'not_applicable'.
 */
import { createAdminClient } from '@/lib/supabase/server';

export type ContactChannel = 'email' | 'sms' | 'discord';
export type ConsentStatus = 'opted_in' | 'opted_out' | 'pending' | 'not_applicable';

/**
 * Version string for the SMS consent disclosure the creator agrees to.
 * Bump this whenever the disclosure copy changes so the audit log records
 * exactly which language each creator consented to.
 *
 * ⚠️  The disclosure copy in the onboarding UI is a PLACEHOLDER pending legal
 * review. Do not treat as final TCPA-compliant language until signed off.
 */
export const SMS_CONSENT_TEXT_VERSION = 'sms-consent-v1-draft';

export interface CreatorContact {
  id: string;
  creatorId: string;
  channel: ContactChannel;
  value: string;
  isPrimary: boolean;
  verifiedAt: string | null;
  consentStatus: ConsentStatus;
  consentAt: string | null;
}

interface ContactRow {
  id: string;
  creator_id: string;
  channel: ContactChannel;
  value: string;
  is_primary: boolean;
  verified_at: string | null;
  consent_status: ConsentStatus;
  consent_at: string | null;
}

/** All contact rows for a creator, primary first. */
export async function getCreatorContacts(creatorId: string): Promise<CreatorContact[]> {
  const supabase = await createAdminClient();
  const { data } = await supabase
    .from('creator_contacts')
    .select('id, creator_id, channel, value, is_primary, verified_at, consent_status, consent_at')
    .eq('creator_id', creatorId)
    .order('is_primary', { ascending: false })
    .order('created_at', { ascending: true });

  return ((data as ContactRow[] | null) ?? []).map((r) => ({
    id: r.id,
    creatorId: r.creator_id,
    channel: r.channel,
    value: r.value,
    isPrimary: r.is_primary,
    verifiedAt: r.verified_at,
    consentStatus: r.consent_status,
    consentAt: r.consent_at,
  }));
}

/** Best-effort E.164 normalization for US numbers. Returns null if implausible. */
export function normalizePhoneE164(raw: string): string | null {
  const digits = (raw || '').replace(/[^\d+]/g, '');
  if (!digits) return null;
  if (digits.startsWith('+')) {
    // Already country-coded — trust it if it has 8–15 digits.
    const d = digits.slice(1).replace(/\D/g, '');
    return d.length >= 8 && d.length <= 15 ? `+${d}` : null;
  }
  const d = digits.replace(/\D/g, '');
  if (d.length === 10) return `+1${d}`;        // US 10-digit
  if (d.length === 11 && d.startsWith('1')) return `+${d}`; // US with leading 1
  return null; // ambiguous — don't guess a country
}

export interface UpsertContactInput {
  creatorId: string;
  tenantId?: string | null;
  channel: ContactChannel;
  value: string;
  /** For SMS: did the creator give express opt-in consent this submission? */
  smsOptIn?: boolean;
  consentSource: string;            // e.g. 'creator_portal_onboarding'
  consentTextVersion?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Upsert a single contact channel for a creator, recording a consent event.
 * Marks this row primary and demotes any other primary on the same channel.
 */
export async function upsertCreatorContact(input: UpsertContactInput): Promise<void> {
  const supabase = await createAdminClient();
  const {
    creatorId, tenantId, channel, value,
    smsOptIn, consentSource, consentTextVersion, ip, userAgent,
  } = input;

  // Resolve consent status. SMS is opt-in (express consent required); email
  // and discord are not_applicable (existing business relationship).
  let consentStatus: ConsentStatus;
  if (channel === 'sms') consentStatus = smsOptIn ? 'opted_in' : 'pending';
  else consentStatus = 'not_applicable';

  const now = new Date().toISOString();

  // Demote any existing primary on this channel for this creator.
  await supabase
    .from('creator_contacts')
    .update({ is_primary: false, updated_at: now })
    .eq('creator_id', creatorId)
    .eq('channel', channel)
    .neq('value', value);

  // Upsert the row. On conflict (same creator+channel+value) update consent.
  const { data: upserted } = await supabase
    .from('creator_contacts')
    .upsert(
      {
        creator_id: creatorId,
        tenant_id: tenantId ?? null,
        channel,
        value,
        is_primary: true,
        consent_status: consentStatus,
        consent_at: consentStatus === 'opted_in' ? now : null,
        consent_source: consentSource,
        consent_text_version: consentTextVersion ?? null,
        consent_ip: ip ?? null,
        consent_user_agent: userAgent ?? null,
        updated_at: now,
      },
      { onConflict: 'creator_id,channel,value' },
    )
    .select('id')
    .maybeSingle();

  // Append a consent/audit event.
  await supabase.from('creator_consent_events').insert({
    creator_id: creatorId,
    contact_id: (upserted as { id: string } | null)?.id ?? null,
    channel,
    value,
    event: channel === 'sms' ? (smsOptIn ? 'opt_in' : 'update') : 'update',
    consent_text_version: consentTextVersion ?? null,
    source: consentSource,
    ip: ip ?? null,
    user_agent: userAgent ?? null,
  });
}

/** Mark the contact-onboarding step done (save OR skip) so we don't re-prompt. */
export async function markContactOnboardingDone(creatorId: string): Promise<void> {
  const supabase = await createAdminClient();
  await supabase
    .from('creators_v2')
    .update({ contact_onboarding_at: new Date().toISOString() })
    .eq('id', creatorId);
}

/** Has this creator been through (or skipped) contact onboarding? */
export async function hasSeenContactOnboarding(creatorId: string): Promise<boolean> {
  const supabase = await createAdminClient();
  const { data } = await supabase
    .from('creators_v2')
    .select('contact_onboarding_at')
    .eq('id', creatorId)
    .maybeSingle();
  return !!(data as { contact_onboarding_at: string | null } | null)?.contact_onboarding_at;
}
