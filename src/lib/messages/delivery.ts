import type { WorkspaceScope } from '@/lib/auth/workspace-scope';
import type { createAdminClient } from '@/lib/supabase/server';
import { isDiscordId, messageReply } from '@/lib/messages/access';

/** Caller authorizes the creator and supplies an owned legacy row when scoped. */
export async function deliverCreatorMessage(
  scope: WorkspaceScope,
  db: Awaited<ReturnType<typeof createAdminClient>>,
  creator: { id: string; discord_id: string | null },
  content: string,
  legacyCreatorId?: number,
) {
  if (!creator.discord_id || !isDiscordId(creator.discord_id)) return messageReply({ error: 'This creator has no valid Discord account. No message was sent.' }, 409);
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) return messageReply({ error: 'Discord messaging is unavailable. No message was sent.' }, 503);
  const consent = await db.from('creator_contacts').select('id').eq('tenant_id', scope.tenantId)
    .eq('creator_id', creator.id).eq('channel', 'discord').eq('consent_status', 'opted_out').limit(1);
  if (consent.error) return messageReply({ error: 'Could not verify messaging consent. No message was sent.' }, 503);
  if (consent.data?.length) return messageReply({ error: 'This creator opted out of Discord messages. No message was sent.' }, 403);
  const headers = { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' };
  let discordMessage: { id: string; timestamp?: string };
  let attemptingMessage = false;
  try {
    const channelResponse = await fetch('https://discord.com/api/v10/users/@me/channels', {
      method: 'POST', headers, body: JSON.stringify({ recipient_id: creator.discord_id }), signal: AbortSignal.timeout(10000),
    });
    if (!channelResponse.ok) return messageReply({ error: 'Discord could not open this conversation. No message was sent.' }, 502);
    const channel = await channelResponse.json();
    if (typeof channel.id !== 'string' || !isDiscordId(channel.id)) return messageReply({ error: 'Discord returned an invalid conversation. No message was sent.' }, 502);
    attemptingMessage = true;
    const response = await fetch(`https://discord.com/api/v10/channels/${channel.id}/messages`, {
      method: 'POST', headers, body: JSON.stringify({ content }), signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return messageReply({ error: 'Discord did not accept the message. Check the creator’s DM settings before retrying.' }, 502);
    discordMessage = await response.json();
    if (!discordMessage.id || !isDiscordId(discordMessage.id)) throw new Error('Unconfirmed delivery');
  } catch {
    return messageReply({ error: attemptingMessage ? 'Delivery could not be confirmed. Check Discord before retrying to avoid sending twice.' : 'Discord is unavailable. No message was sent.' }, 503);
  }
  const sentAt = new Date().toISOString();
  const record = {
    tenant_id: scope.tenantId, creator_uuid: creator.id, discord_user_id: creator.discord_id,
    ...(legacyCreatorId === undefined ? {} : { creator_id: legacyCreatorId }),
    direction: 'outbound', channel: 'dm', content, status: 'delivered', sent_by: scope.userId,
    sent_at: sentAt, metadata: { discord_message_id: discordMessage.id },
  };
  // Discord acknowledged delivery. A history-write failure must not invite a
  // duplicate send or claim that the delivered message failed.
  try {
    const saved = await db.from('creator_messages').insert(record).select().single();
    if (!saved.error && saved.data) return messageReply({ message: saved.data });
  } catch { /* Return the acknowledged delivery with an explicit history warning. */ }
  return messageReply({ message: { ...record, id: `discord:${discordMessage.id}` }, warning: 'Delivered to Discord, but conversation history could not be saved. Do not resend.' });
}
