/**
 * Low-level message transports. Each returns a uniform result so the
 * sendCreatorMessage orchestrator can treat them interchangeably.
 *
 * Email + SMS reuse the existing integration adapters (lib/integrations/actions)
 * built for the automation system — same Resend/Twilio env vars, no BYOK.
 * Discord DM is extracted here from the (admin) messages send route so both
 * the legacy route and the new abstraction share one implementation.
 */
import { sendEmail } from '@/lib/integrations/actions/resend';
import { sendSms } from '@/lib/integrations/actions/twilio';

export interface TransportResult {
  ok: boolean;
  /** Provider message id: Discord msg id / Resend id / Twilio SID. */
  providerId?: string;
  /** 'sent' for accepted-by-provider; 'blocked' when the user blocks us. */
  status: 'sent' | 'failed' | 'blocked';
  error?: string;
}

/**
 * Send a Discord DM via the REST API (no live bot process required — just the
 * bot token). Opens/loads the DM channel with the user, then posts the message.
 */
export async function sendDiscordDM(discordUserId: string, content: string): Promise<TransportResult> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) return { ok: false, status: 'failed', error: 'DISCORD_BOT_TOKEN not configured' };

  try {
    // 1. Open/get the DM channel with this user.
    const channelRes = await fetch('https://discord.com/api/v10/users/@me/channels', {
      method: 'POST',
      headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient_id: discordUserId }),
    });
    if (!channelRes.ok) {
      return { ok: false, status: 'failed', error: `Open DM channel failed (HTTP ${channelRes.status})` };
    }
    const channel = (await channelRes.json()) as { id: string };

    // 2. Post the message into that DM channel.
    const msgRes = await fetch(`https://discord.com/api/v10/channels/${channel.id}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    if (!msgRes.ok) {
      // 50007 = cannot send to this user (DMs disabled / blocked the bot).
      const body = (await msgRes.json().catch(() => ({}))) as { code?: number; message?: string };
      if (body.code === 50007) {
        return { ok: false, status: 'blocked', error: 'User has DMs disabled' };
      }
      return { ok: false, status: 'failed', error: body.message ?? `Send failed (HTTP ${msgRes.status})` };
    }
    const msg = (await msgRes.json()) as { id?: string };
    return { ok: true, status: 'sent', providerId: msg.id };
  } catch (err) {
    return { ok: false, status: 'failed', error: err instanceof Error ? err.message : 'Network error' };
  }
}

/** Email transport (Resend). subject defaults are caller's responsibility. */
export async function sendEmailMessage(to: string, subject: string, body: string): Promise<TransportResult> {
  const r = await sendEmail({ to, subject, body });
  if (!r.ok) return { ok: false, status: 'failed', error: r.error };
  return { ok: true, status: 'sent', providerId: r.id };
}

/** SMS transport (Twilio). `to` must be E.164. */
export async function sendSmsMessage(to: string, body: string): Promise<TransportResult> {
  const r = await sendSms({ to, body });
  if (!r.ok) return { ok: false, status: 'failed', error: r.error };
  return { ok: true, status: 'sent', providerId: r.sid };
}
