/**
 * Broadcast send primitive — delivers ONE broadcast_recipients row.
 *
 * Phase A implements discord_dm only (the exact REST pattern lifted from the
 * working /api/messages/[creatorId]/send route: open DM channel → post
 * message → map Discord error 50007 to 'blocked'). email/sms return an
 * explicit failure — never a silent success — until their phases land.
 *
 * CONSENT LIVES HERE: consent is re-checked against creator_contacts at send
 * time, not just at enqueue (discord = not_applicable → allowed unless an
 * explicit opt-out row appeared since enqueue).
 *
 * On delivery, a creator_messages row is inserted so the inbox thread shows
 * broadcast messages. NOTE: creator_messages.creator_id is the LEGACY integer
 * managed_creators id — the v2 identity goes in creator_uuid (writing a uuid
 * into creator_id fails the insert; several old callsites still do and lose
 * their log rows silently).
 */
import { createAdminClient } from '@/lib/supabase/server';

export interface SendableRecipient {
  id: string;
  broadcast_id: string;
  creator_id: string | null;     // creators_v2 uuid
  handle: string | null;
  display_name: string | null;
  channel: string;               // 'discord_dm' | 'email' | 'sms'
  contact_value: string | null;  // discord snowflake / email / E.164
  resolved_body: string | null;  // personalized body frozen at enqueue
}

export interface SendContext {
  tenantId: string | null;
  /** Who initiated the broadcast (broadcasts.created_by) — logged as sent_by. */
  sentBy: string | null;
}

export interface SendOutcome {
  status: 'sent' | 'delivered' | 'failed' | 'blocked';
  error?: string;
}

const DISCORD_API = 'https://discord.com/api/v10';
/** Discord error code: "Cannot send messages to this user" (DMs disabled). */
const DISCORD_CANNOT_DM = 50007;

/** Deliver one recipient. Never throws — every failure mode maps to an outcome. */
export async function sendToRecipient(
  recipient: SendableRecipient,
  ctx: SendContext,
): Promise<SendOutcome> {
  switch (recipient.channel) {
    case 'discord_dm':
      return sendDiscordDm(recipient, ctx);
    case 'email':
    case 'sms':
    default:
      // Explicit failure, never a silent success — a queued email/sms row must
      // surface as failed until those channels ship.
      return { status: 'failed', error: 'channel not enabled' };
  }
}

async function sendDiscordDm(
  recipient: SendableRecipient,
  ctx: SendContext,
): Promise<SendOutcome> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) return { status: 'failed', error: 'DISCORD_BOT_TOKEN not configured' };
  if (!recipient.contact_value) return { status: 'failed', error: 'no contact value' };
  const content = (recipient.resolved_body ?? '').trim();
  if (!content) return { status: 'failed', error: 'empty message body' };

  const supabase = await createAdminClient();

  // Send-time consent re-check. Discord consent is not_applicable by default
  // (inbound-initiated relationship) → allowed; only an explicit opt-out that
  // landed after enqueue blocks the send.
  if (recipient.creator_id) {
    const { data: optedOut } = await supabase
      .from('creator_contacts')
      .select('id')
      .eq('creator_id', recipient.creator_id)
      .eq('channel', 'discord')
      .eq('consent_status', 'opted_out')
      .limit(1);
    if (optedOut && optedOut.length > 0) {
      return { status: 'blocked', error: 'Creator opted out of Discord messages' };
    }
  }

  try {
    // Step 1: open (or fetch) the DM channel with the user.
    const dmChannelRes = await fetch(`${DISCORD_API}/users/@me/channels`, {
      method: 'POST',
      headers: {
        Authorization: `Bot ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ recipient_id: recipient.contact_value }),
    });
    if (!dmChannelRes.ok) return await discordFailure(dmChannelRes, 'open DM channel');
    const dmChannel = (await dmChannelRes.json()) as { id: string };

    // Step 2: post the message into that DM channel.
    const msgRes = await fetch(`${DISCORD_API}/channels/${dmChannel.id}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bot ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content }),
    });
    if (!msgRes.ok) return await discordFailure(msgRes, 'send message');
  } catch (err) {
    return { status: 'failed', error: err instanceof Error ? err.message : String(err) };
  }

  // Delivered → log into creator_messages so the inbox thread shows the
  // broadcast. Logging failure must never fail a DM that already landed.
  try {
    const { error } = await supabase.from('creator_messages').insert({
      tenant_id: ctx.tenantId,
      creator_uuid: recipient.creator_id,   // v2 identity (creator_id is the legacy int)
      discord_user_id: recipient.contact_value,
      direction: 'outbound',
      channel: 'dm',
      content,
      status: 'delivered',
      sent_by: ctx.sentBy ?? 'broadcast',
      metadata: { broadcast_id: recipient.broadcast_id },
    });
    if (error) console.error('[comms/send] creator_messages log failed:', error.message);
  } catch (err) {
    console.error('[comms/send] creator_messages log failed:', err);
  }

  return { status: 'delivered' };
}

/** Map a non-ok Discord response to an outcome (50007 → blocked). */
async function discordFailure(res: Response, step: string): Promise<SendOutcome> {
  let code: number | undefined;
  let message: string | undefined;
  try {
    const body = (await res.json()) as { code?: number; message?: string };
    code = body.code;
    message = body.message;
  } catch {
    // Non-JSON error body — fall through with the HTTP status only.
  }
  if (code === DISCORD_CANNOT_DM) {
    return { status: 'blocked', error: 'User has DMs disabled' };
  }
  return {
    status: 'failed',
    error: `Discord ${step} failed (${res.status}${code ? `, code ${code}` : ''}${message ? `: ${message}` : ''})`,
  };
}
