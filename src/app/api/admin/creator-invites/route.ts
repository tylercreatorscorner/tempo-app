/**
 * Admin-only control surface for the creator-portal invite distribution.
 *
 * GET               -> current status counts.
 * POST {action}:
 *   enqueue         -> mint a claim token per eligible creator.
 *   send {limit,dryRun} -> DM a batch of pending invites (dryRun = count only).
 *   test {discordId, creatorId} -> DM ONE real invite (test on yourself first).
 *   mint_link {query | creatorId} -> one-off: search creators by name/handle,
 *     or mint a single-use 60-day claim link for one creator (no DM — the admin
 *     copies the link and sends it however they like). Built because most
 *     creators have no email on file, so the email login can't reach them.
 *
 * Owner/admin, all-roster scope and roster read/write capability are required.
 * Impersonation is read-only and cannot use this credential-distribution surface.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { assertCreatorInviteScope, CreatorInviteError } from '@/lib/auth/creator-invite-access';
import {
  getInviteStatus,
  enqueueInvites,
  sendClaimBatch,
  sendTestInvite,
  searchCreatorsForInvite,
  inviteBaseUrl,
} from '@/lib/data/creator-invite';
import { mintClaimLink } from '@/lib/auth/creator-claim';

export const runtime = 'nodejs';
export const maxDuration = 60;

function reply(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
}

function failed(error: unknown) {
  return error instanceof CreatorInviteError
    ? reply({ error: error.message }, error.status)
    : reply({ error: 'Could not complete this invite action. Refresh status before retrying.' }, 503);
}

export async function GET() {
  try {
    const scope = await getWorkspaceScope();
    assertCreatorInviteScope(scope);
    return reply(await getInviteStatus(scope));
  } catch (error) { return failed(error); }
}

export async function POST(request: NextRequest) {
  try {
    const scope = await getWorkspaceScope();
    assertCreatorInviteScope(scope);
    if (request.headers.get('origin') !== request.nextUrl.origin) return reply({ error: 'Invalid request origin' }, 403);
    if (!request.headers.get('content-type')?.includes('application/json')) return reply({ error: 'Send JSON invite details' }, 415);
    const raw = await request.text();
    if (raw.length > 10000) return reply({ error: 'Invite request is too large' }, 413);
    let input: unknown;
    try { input = JSON.parse(raw); } catch { return reply({ error: 'Invalid invite details' }, 400); }
    if (!input || typeof input !== 'object' || Array.isArray(input)) return reply({ error: 'Invalid invite details' }, 400);
    const body = input as Record<string, unknown>;
    if ((body.creatorId !== undefined && (typeof body.creatorId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.creatorId)))
      || (body.query !== undefined && (typeof body.query !== 'string' || body.query.length > 100))
      || (body.discordId !== undefined && (typeof body.discordId !== 'string' || !/^\d{17,20}$/.test(body.discordId.trim())))
      || (body.limit !== undefined && (!Number.isInteger(body.limit) || Number(body.limit) < 1 || Number(body.limit) > 100))
      || (body.dryRun !== undefined && typeof body.dryRun !== 'boolean')) return reply({ error: 'Invalid invite details' }, 400);
    if (body.action === 'mint_link') {
      if (body.creatorId) {
        const minted = await mintClaimLink(scope, String(body.creatorId), inviteBaseUrl(), 'admin-one-off');
        return reply({ minted: { url: minted.url, creatorId: minted.creatorId } });
      }
      if (body.query) {
        const candidates = await searchCreatorsForInvite(scope, String(body.query));
        return reply({ candidates });
      }
      return reply({ error: 'query or creatorId required' }, 400);
    }
    if (body.action === 'enqueue') {
      const r = await enqueueInvites(scope);
      return reply({ ...r, status: await getInviteStatus(scope) });
    }
    if (body.action === 'send') {
      const r = await sendClaimBatch(scope, { limit: Number(body.limit) || 40, dryRun: body.dryRun !== false });
      return reply({ ...r, status: await getInviteStatus(scope) });
    }
    if (body.action === 'test') {
      if (!body.discordId) {
        return reply({ error: 'Your Discord user id is required' }, 400);
      }
      const r = await sendTestInvite(scope, String(body.discordId), body.creatorId ? String(body.creatorId) : undefined);
      return reply(r);
    }
    return reply({ error: 'unknown_action' }, 400);
  } catch (e) {
    return failed(e);
  }
}
