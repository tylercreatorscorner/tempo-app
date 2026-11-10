import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { deliverCreatorMessage } from '@/lib/messages/delivery';
import { messageCreator, messageGuard, messageLegacyIds, messageReply } from '@/lib/messages/access';

export async function POST(request: NextRequest, { params }: { params: Promise<{ creatorId: string }> }) {
  try {
    const scope = await getWorkspaceScope();
    const denied = messageGuard(scope, true);
    if (denied || !scope) return denied!;
    if (request.headers.get('origin') !== request.nextUrl.origin) return messageReply({ error: 'Invalid request origin' }, 403);
    if (!request.headers.get('content-type')?.includes('application/json')) return messageReply({ error: 'Send JSON message content' }, 415);
    const raw = await request.text();
    if (raw.length > 12000) return messageReply({ error: 'Message is too large' }, 413);
    let body: unknown;
    try { body = JSON.parse(raw); } catch { return messageReply({ error: 'Invalid message content' }, 400); }
    const content = body && typeof body === 'object' && 'content' in body && typeof body.content === 'string' ? body.content.trim() : '';
    if (!content || content.length > 2000) return messageReply({ error: 'Enter a message between 1 and 2,000 characters' }, 400);
    const { creatorId } = await params;
    const db = await createAdminClient();
    const creator = await messageCreator(scope, db, creatorId);
    if (creator instanceof NextResponse) return creator;
    let legacyCreatorId: number | undefined;
    if (scope.brandScope.kind === 'scoped') {
      const ids = await messageLegacyIds(scope, db, creatorId);
      if (ids.length !== 1) return messageReply({ error: 'This conversation cannot be tied to one of your brand records. Ask an administrator to send it. No message was sent.' }, 403);
      legacyCreatorId = ids[0];
    }
    return await deliverCreatorMessage(scope, db, creator, content, legacyCreatorId);
  } catch {
    return messageReply({ error: 'Could not prepare this message. No message was sent.' }, 503);
  }
}
