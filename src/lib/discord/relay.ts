/**
 * Tempo Bot — Message relay core
 *
 * Tracked DM sending, bulk DMs with rate limiting, and database logging.
 */

import type { Client, User } from 'discord.js';
import { getSupabase } from './supabase';

export interface MessageContext {
  tenantId?: string;
  creatorId?: number;
  sentBy: string;
  channel: 'dm' | 'channel' | 'bulk';
}

export interface DeliveryResult {
  success: boolean;
  status: 'sent' | 'delivered' | 'failed' | 'blocked';
  error?: string;
}

export interface BulkResult {
  total: number;
  sent: number;
  failed: number;
  blocked: number;
  errors: Array<{ userId: string; error: string }>;
}

export interface TrackedMessage {
  tenantId?: string;
  creatorId?: number;
  discordUserId: string;
  direction: 'outbound' | 'inbound';
  channel: 'dm' | 'channel' | 'bulk';
  content: string;
  status: 'sent' | 'delivered' | 'failed' | 'blocked';
  sentBy: string;
  metadata?: Record<string, unknown>;
}

/** Send a DM to a user with tracking */
export async function sendTrackedDM(
  client: Client,
  userId: string,
  content: string,
  context: MessageContext,
): Promise<DeliveryResult> {
  let status: DeliveryResult['status'] = 'failed';
  let error: string | undefined;

  try {
    const user = await client.users.fetch(userId);
    await user.send(content);
    status = 'sent';
  } catch (err: any) {
    if (err.code === 50007) {
      // Cannot send messages to this user (DMs blocked)
      status = 'blocked';
      error = 'User has DMs disabled';
    } else {
      status = 'failed';
      error = err.message ?? String(err);
    }
  }

  // Log to database
  await logMessage({
    tenantId: context.tenantId,
    creatorId: context.creatorId,
    discordUserId: userId,
    direction: 'outbound',
    channel: context.channel,
    content,
    status,
    sentBy: context.sentBy,
  });

  return { success: status === 'sent', status, error };
}

/** Send bulk DMs with rate limiting (~1 per second) */
export async function sendBulkDMs(
  client: Client,
  userIds: string[],
  content: string,
  context: MessageContext,
  rateLimitMs = 1000,
  onProgress?: (sent: number, total: number) => void,
): Promise<BulkResult> {
  const result: BulkResult = { total: userIds.length, sent: 0, failed: 0, blocked: 0, errors: [] };

  for (let i = 0; i < userIds.length; i++) {
    const userId = userIds[i];
    const delivery = await sendTrackedDM(client, userId, content, {
      ...context,
      channel: 'bulk',
    });

    if (delivery.success) {
      result.sent++;
    } else if (delivery.status === 'blocked') {
      result.blocked++;
      result.errors.push({ userId, error: delivery.error ?? 'blocked' });
    } else {
      result.failed++;
      result.errors.push({ userId, error: delivery.error ?? 'unknown' });
    }

    onProgress?.(i + 1, userIds.length);

    // Rate limit — wait between sends (skip after last)
    if (i < userIds.length - 1) {
      await new Promise((r) => setTimeout(r, rateLimitMs));
    }
  }

  return result;
}

/** Log a message to the creator_messages table */
export async function logMessage(message: TrackedMessage): Promise<void> {
  try {
    const supabase = getSupabase();
    await supabase.from('creator_messages').insert({
      tenant_id: message.tenantId ?? null,
      creator_id: message.creatorId ?? null,
      discord_user_id: message.discordUserId,
      direction: message.direction,
      channel: message.channel,
      content: message.content,
      status: message.status,
      sent_by: message.sentBy,
      metadata: message.metadata ?? {},
    });
  } catch (err) {
    console.error('[tempo-bot] Failed to log message:', err);
  }
}
