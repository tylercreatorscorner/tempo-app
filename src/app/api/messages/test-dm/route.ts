import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { isDiscordId, messageGuard, messageReply } from '@/lib/messages/access';
import { deliverCreatorMessage } from '@/lib/messages/delivery';

// Use the inbox's consent and delivery path, restricted to a verified creator
// in this administrator's tenant. Arbitrary Discord accounts are not targets.
export async function POST(request: NextRequest) {
  try {
    const scope = await getWorkspaceScope();
    const denied = messageGuard(scope, true);
    if (denied || !scope) return denied!;
    if (!['owner', 'admin'].includes(scope.role) || scope.brandScope.kind !== 'all') return messageReply({ error: 'Forbidden' }, 403);
    if (request.headers.get('origin') !== request.nextUrl.origin) return messageReply({ error: 'Invalid request origin' }, 403);
    if (!request.headers.get('content-type')?.includes('application/json')) return messageReply({ error: 'Send JSON message content' }, 415);
    const raw = await request.text();
    if (raw.length > 12000) return messageReply({ error: 'Message is too large' }, 413);
    let body: unknown;
    try { body = JSON.parse(raw); } catch { return messageReply({ error: 'Invalid message content' }, 400); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return messageReply({ error: 'Invalid message content' }, 400);
    const input = body as Record<string, unknown>;
    const discordId = typeof input.discordUserId === 'string' ? input.discordUserId.trim() : '';
    const content = typeof input.content === 'string' ? input.content.trim() : '';
    if (!isDiscordId(discordId) || !content || content.length > 2000) return messageReply({ error: 'A valid Discord account and message of 1–2,000 characters are required' }, 400);
    const db = await createAdminClient();
    const creator = await db.from('creators_v2').select('id,discord_id').eq('tenant_id', scope.tenantId).eq('discord_id', discordId).maybeSingle();
    if (creator.error) return messageReply({ error: 'Could not verify this creator. No message was sent.' }, 503);
    if (!creator.data) return messageReply({ error: 'This Discord account is not linked to a creator in your workspace. No message was sent.' }, 404);
    const delivered = await deliverCreatorMessage(scope, db, creator.data, content);
    const result = await delivered.json();
    return messageReply({ ...result, delivered: delivered.ok && result.message?.status === 'delivered' }, delivered.status);
  } catch {
    return messageReply({ error: 'Could not prepare this message. No message was sent.' }, 503);
  }
}
