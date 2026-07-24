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
 * crash mid-send leaves it stranded, and rows stranded >10 min are marked
 * FAILED (outcome unknown) — never re-queued, because the DM may have been
 * delivered and a real person must not be double-messaged. On completion
 * sent_at becomes the actual attempt-finish time.
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
  // Vercel Cron auth — FAIL CLOSED. The middleware exempts /api/cron/* from
  // the session guard, so this check is the only gate; an unset CRON_SECRET
  // must mean "nobody can call this", never "everybody can".
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
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

  // 0. Recipients stranded in 'sending' (claimed >10 min ago, never resolved
  // — a crashed invocation or a lost outcome write). The DM may or may not
  // have been delivered, so a blind reset-to-pending would risk DOUBLE-DMing
  // a real person. Prefer no-duplicate over at-least-once: mark them failed
  // with an honest error; the operator sees them in the log and can decide.
  {
    const staleCutoff = new Date(Date.now() - STALE_SENDING_MS).toISOString();
    const { data: reset } = await admin
      .from('broadcast_recipients')
      .update({ status: 'failed', error: 'stranded: outcome unknown (delivery not confirmed, not retried)' })
      .eq('status', 'sending')
      .lt('sent_at', staleCutoff)
      .select('id');
    summary.resetStale = reset?.length ?? 0;
  }

  // 0b. Sweep abandoned 'enqueuing' shells (create crashed mid-chunk >10 min
  // ago) to failed — they must never become claimable.
  {
    const staleCutoff = new Date(Date.now() - STALE_SENDING_MS).toISOString();
    await admin
      .from('broadcasts')
      .update({ status: 'failed', finished_at: new Date().toISOString() })
      .eq('status', 'enqueuing')
      .lt('created_at', staleCutoff);
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

    // 5. Sequential drain with spacing. Claims stop 15s before the budget so
    // an in-flight send + outcome write can never straddle the 60s function
    // kill (the Discord fetches themselves time out at 10s).
    for (const recipient of pending) {
      if (Date.now() - startedAt >= TIME_BUDGET_MS - 15_000) break;

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

      // The outcome write MUST land: if it silently failed, the row would
      // stay 'sending' and be swept to failed-unknown even though we know
      // the real result. Retry with backoff; scream if it still fails.
      let outcomeWritten = false;
      for (let attempt = 0; attempt < 3 && !outcomeWritten; attempt++) {
        if (attempt > 0) await sleep(500 * attempt);
        const { error: writeErr } = await admin
          .from('broadcast_recipients')
          .update({
            status: outcome.status,
            error: outcome.error ?? null,
            sent_at: new Date().toISOString(),
          })
          .eq('id', recipient.id);
        if (!writeErr) { outcomeWritten = true; break; }
        console.error(
          `[cron/send-broadcasts] outcome write failed (attempt ${attempt + 1}) broadcast=${recipient.broadcast_id} recipient=${recipient.id}:`,
          writeErr.message,
        );
      }

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
