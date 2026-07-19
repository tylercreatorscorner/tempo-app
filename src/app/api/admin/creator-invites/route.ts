/**
 * Admin-only control surface for the creator-portal invite distribution.
 *
 * GET               -> current status counts.
 * POST {action}:
 *   enqueue         -> mint a claim token per eligible creator.
 *   send {limit,dryRun} -> DM a batch of pending invites (dryRun = count only).
 *   test {discordId, creatorId} -> DM ONE real invite (test on yourself first).
 *
 * requireAdmin (owner/admin) + assertNotImpersonating — a super-admin viewing as a
 * manager must not be able to fire a real mass-DM.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import { assertNotImpersonating } from '@/lib/auth/platform-admin';
import {
  getInviteStatus,
  enqueueInvites,
  sendClaimBatch,
  sendTestInvite,
} from '@/lib/data/creator-invite';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  return NextResponse.json(await getInviteStatus());
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  await assertNotImpersonating();

  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    limit?: number;
    dryRun?: boolean;
    discordId?: string;
    creatorId?: string;
  };

  try {
    if (body.action === 'enqueue') {
      const r = await enqueueInvites();
      return NextResponse.json({ ...r, status: await getInviteStatus() });
    }
    if (body.action === 'send') {
      const r = await sendClaimBatch({ limit: Number(body.limit) || 40, dryRun: !!body.dryRun });
      return NextResponse.json({ ...r, status: await getInviteStatus() });
    }
    if (body.action === 'test') {
      if (!body.discordId) {
        return NextResponse.json({ error: 'Your Discord user id is required' }, { status: 400 });
      }
      const r = await sendTestInvite(String(body.discordId), body.creatorId ? String(body.creatorId) : undefined);
      return NextResponse.json(r);
    }
    return NextResponse.json({ error: 'unknown_action' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 });
  }
}
