/**
 * Broadcast queue drain — fired by Vercel cron every minute (see vercel.json).
 *
 * Each tick claims the OLDEST active broadcast and sends a batch of its
 * pending recipients sequentially at ~1.1s spacing (a few hundred DMs at
 * ~1/s outlives any single serverless request — that's why this is a queue).
 * The tick stops cleanly at ~45s; the next tick resumes where it left off.
 *
 * Idempotency: only 'pending' rows are ever claimed, and each claim is a
 * conditional UPDATE (status='pending' → 'sending') so a doubled tick can't
 * double-send. While a row is 'sending', sent_at holds the CLAIM time; a
 * crash mid-send leaves it stranded, and rows stranded >10 min are reset to
 * pending at the top of each tick. On completion sent_at becomes the actual
 * attempt-finish time.
 *
 * Auth: Vercel sends `Authorization: Bearer ${CRON_SECRET}` — same pattern as
 * run-schedules.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { sendToRecipient, type SendableRecipient } from '@/lib/comms/send';

export const runtime = 'nodejs';
export const maxDuration = 60;

const BATCH_SIZE = 40;            // recipients fetched per claim round
const SEND_SPACING_MS = 1100;     // ~1.1s between DMs (Discord-safe)
const TIME_BUDGET_MS = 45_000;    // stop claiming work after this; exit cleanly
const STALE_SENDING_MS = 10 * 60 * 1000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface ClaimedBroadcast {
  id: string;
  tenant_id: string | null;
  status: string;
  started_at: string | null;
  created_by: string | null;
}

export async function GET(request: NextRequest) {
  // Vercel Cron auth
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = await createAdminClient();
  const startedAt = Date.now();
  const summary = {
    processed: 0,
    delivered: 0,
    sent: 0,
    failed: 0,
    blocked: 0,
    resetStale: 0,
    finalized: [] as { id: string; status: string }[],
  };

  // 0. Reset recipients stranded in 'sending' (claimed >10 min ago and never
  // resolved — a crashed invocation). sent_at is the claim timestamp while
  // status='sending', so this is safe to run every tick.
  {
    const staleCutoff = new Date(Date.now() - STALE_SENDING_MS).toISOString();
    const { data: reset } = await admin
      .from('broadcast_recipients')
      .update({ status: 'pending', sent_at: null })
      .eq('status', 'sending')
      .lt('sent_at', staleCutoff)
      .select('id');
    summary.resetStale = reset?.length ?? 0;
  }

  while (Date.now() - startedAt < TIME_BUDGET_MS) {
    // 1. Oldest active broadcast (queued or mid-drain).
    const { data: bRows, error: bErr } = await admin
      .from('broadcasts')
      .select('id, tenant_id, status, started_at, created_by')
      .in('status', ['queued', 'sending'])
      .order('created_at', { ascending: true })
      .limit(1);
    if (bErr) return NextResponse.json({ error: bErr.message }, { status: 500 });
    const broadcast = (bRows as ClaimedBroadcast[] | null)?.[0];
    if (!broadcast) break; // queue empty

    // 2. Claim it: sending + started_at (kept on resumes — COALESCE semantics).
    const claim: { status: string; started_at?: string } = { status: 'sending' };
    if (!broadcast.started_at) claim.started_at = new Date().toISOString();
    await admin
      .from('broadcasts')
      .update(claim)
      .eq('id', broadcast.id)
      .in('status', ['queued', 'sending']); // no-op if canceled since the read

    // 3. A batch of its pending recipients, enqueue order.
    const { data: pendRows, error: pErr } = await admin
      .from('broadcast_recipients')
      .select('id, broadcast_id, creator_id, handle, display_name, channel, contact_value, resolved_body')
      .eq('broadcast_id', broadcast.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE);
    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
    const pending = (pendRows as SendableRecipient[] | null) ?? [];

    // 4. Nothing pending → finalize (unless rows are still in-flight from a
    // concurrent/crashed tick — those resolve or get stale-reset; wait).
    if (pending.length === 0) {
      const counts = await countStatuses(admin, broadcast.id);
      if (counts.sending > 0) break;
      const attempted = counts.sent + counts.delivered + counts.failed + counts.blocked;
      const succeeded = counts.sent + counts.delivered;
      // 'failed' only when every non-skipped recipient failed outright; an
      // all-skipped broadcast (nothing to attempt) is honestly 'done'.
      const finalStatus = attempted > 0 && succeeded === 0 ? 'failed' : 'done';
      await admin
        .from('broadcasts')
        .update({ status: finalStatus, finished_at: new Date().toISOString() })
        .eq('id', broadcast.id)
        .eq('status', 'sending');
      summary.finalized.push({ id: broadcast.id, status: finalStatus });
      continue; // move on to the next-oldest broadcast this same tick
    }

    // 5. Sequential drain with spacing.
    for (const recipient of pending) {
      if (Date.now() - startedAt >= TIME_BUDGET_MS) break;

      // Conditional claim — only a 'pending' row flips, so a doubled cron
      // tick can never dispatch the same recipient twice.
      const { data: claimed } = await admin
        .from('broadcast_recipients')
        .update({ status: 'sending', sent_at: new Date().toISOString() })
        .eq('id', recipient.id)
        .eq('status', 'pending')
        .select('id');
      if (!claimed || claimed.length === 0) continue; // raced away (or canceled)

      const outcome = await sendToRecipient(recipient, {
        tenantId: broadcast.tenant_id,
        sentBy: broadcast.created_by,
      });

      await admin
        .from('broadcast_recipients')
        .update({
          status: outcome.status,
          error: outcome.error ?? null,
          sent_at: new Date().toISOString(),
        })
        .eq('id', recipient.id);

      summary.processed += 1;
      summary[outcome.status] += 1;

      await sleep(SEND_SPACING_MS);
    }
  }

  return NextResponse.json({ elapsedMs: Date.now() - startedAt, ...summary });
}

/** Full status tally for one broadcast (paged past the 1000-row cap). */
async function countStatuses(
  admin: Awaited<ReturnType<typeof createAdminClient>>,
  broadcastId: string,
): Promise<Record<'pending' | 'sending' | 'sent' | 'delivered' | 'failed' | 'blocked' | 'skipped', number>> {
  const counts = { pending: 0, sending: 0, sent: 0, delivered: 0, failed: 0, blocked: 0, skipped: 0 };
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin
      .from('broadcast_recipients')
      .select('status')
      .eq('broadcast_id', broadcastId)
      .order('id', { ascending: true })
      .range(from, from + 999);
    if (error) {
      console.error('[cron/send-broadcasts] status count failed:', error.message);
      break;
    }
    if (!data || data.length === 0) break;
    for (const r of data as { status: string }[]) {
      if (r.status in counts) counts[r.status as keyof typeof counts] += 1;
    }
    if (data.length < 1000) break;
  }
  return counts;
}
