/**
 * sendCreatorMessage — the channel-agnostic outbound message abstraction.
 *
 * One entry point to message a creator on Discord, email, or SMS. It:
 *   1. resolves the creator's contact for the chosen medium (creator_contacts)
 *   2. enforces consent (SMS requires explicit opt-in; refuses otherwise)
 *   3. delegates to the right transport (Discord REST / Resend / Twilio)
 *   4. logs the result to creator_messages (channel-agnostic, tied to the
 *      creators_v2 uuid)
 *
 * The rebuilt Messages inbox + bulk send (Big PR) call this; it does NOT do
 * auth — callers authorize the actor before invoking.
 */
import { createAdminClient } from '@/lib/supabase/server';
import { getCreatorContacts, type ContactChannel } from '@/lib/data/creator-contacts';
import { sendDiscordDM, sendEmailMessage, sendSmsMessage } from './transports';

export type Medium = 'discord' | 'email' | 'sms';

export interface SendCreatorMessageInput {
  creatorId: string;                 // creators_v2 uuid
  medium: Medium | 'auto';
  body: string;
  subject?: string;                  // email only (defaults applied)
  sentBy?: string;                   // actor label for the log
  tenantId?: string | null;          // resolved from creator if omitted
}

export interface SendCreatorMessageResult {
  ok: boolean;
  medium?: Medium;
  status: 'sent' | 'delivered' | 'failed' | 'blocked' | 'skipped';
  providerId?: string;
  /** creator_messages.id of the logged row, when one was written. */
  messageId?: string;
  error?: string;
}

// 'auto' tries these in order, using the first available (and consent-cleared).
const AUTO_PRIORITY: Medium[] = ['discord', 'sms', 'email'];

const DEFAULT_EMAIL_SUBJECT = 'A message from your Tempo manager';

export async function sendCreatorMessage(
  input: SendCreatorMessageInput,
): Promise<SendCreatorMessageResult> {
  const { creatorId, body, subject, sentBy = 'admin' } = input;

  if (!body || !body.trim()) {
    return { ok: false, status: 'failed', error: 'Message body is required' };
  }

  const contacts = await getCreatorContacts(creatorId);
  const byChannel = (ch: ContactChannel) =>
    contacts.filter((c) => c.channel === ch).sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))[0];

  // Resolve which medium to actually use.
  const candidates: Medium[] =
    input.medium === 'auto' ? AUTO_PRIORITY : [input.medium];

  let chosen: { medium: Medium; value: string } | null = null;
  let lastSkipReason: string | null = null;

  for (const medium of candidates) {
    const contact = byChannel(medium === 'discord' ? 'discord' : medium === 'email' ? 'email' : 'sms');
    if (!contact) {
      lastSkipReason = `no_${medium}_contact`;
      continue;
    }
    // Consent gate — SMS requires explicit opt-in (TCPA). email/discord are
    // not_applicable (existing business relationship).
    if (medium === 'sms' && contact.consentStatus !== 'opted_in') {
      lastSkipReason = 'sms_not_opted_in';
      continue;
    }
    if (contact.consentStatus === 'opted_out') {
      lastSkipReason = `${medium}_opted_out`;
      continue;
    }
    chosen = { medium, value: contact.value };
    break;
  }

  if (!chosen) {
    return {
      ok: false,
      status: 'skipped',
      error: lastSkipReason ?? 'no_reachable_channel',
    };
  }

  // Resolve tenant for the log row if not supplied.
  const supabase = await createAdminClient();
  let tenantId = input.tenantId ?? null;
  if (tenantId === null) {
    const { data: cv } = await supabase
      .from('creators_v2')
      .select('tenant_id')
      .eq('id', creatorId)
      .maybeSingle();
    tenantId = (cv as { tenant_id: string | null } | null)?.tenant_id ?? null;
  }

  // Dispatch to the transport.
  let transport;
  if (chosen.medium === 'discord') {
    transport = await sendDiscordDM(chosen.value, body.trim());
  } else if (chosen.medium === 'email') {
    transport = await sendEmailMessage(chosen.value, subject?.trim() || DEFAULT_EMAIL_SUBJECT, body.trim());
  } else {
    transport = await sendSmsMessage(chosen.value, body.trim());
  }

  // Log the attempt (success OR failure) so the inbox shows a complete history.
  const { data: logged } = await supabase
    .from('creator_messages')
    .insert({
      creator_uuid: creatorId,
      tenant_id: tenantId,
      // Keep discord_user_id populated for the legacy discord bridge/readers.
      discord_user_id: chosen.medium === 'discord' ? chosen.value : null,
      direction: 'outbound',
      medium: chosen.medium,
      channel: chosen.medium === 'discord' ? 'dm' : chosen.medium,
      content: body.trim(),
      status: transport.status,
      provider_message_id: transport.providerId ?? null,
      sent_by: sentBy,
      metadata: chosen.medium === 'email' ? { subject: subject?.trim() || DEFAULT_EMAIL_SUBJECT } : {},
    })
    .select('id')
    .maybeSingle();

  return {
    ok: transport.ok,
    medium: chosen.medium,
    status: transport.status,
    providerId: transport.providerId,
    messageId: (logged as { id: string } | null)?.id,
    error: transport.error,
  };
}
