import { createAdminClient } from '@/lib/supabase/server';
import { generateClaimToken } from '@/lib/auth/creator-auth';
import { sendDirectMessage } from '@/lib/discord/rest';

/**
 * Creator-portal invite distribution — the "reach every creator" job. Runs
 * Vercel-side via Discord REST (see rest.ts), NOT the always-on bot's unsafe
 * slash-command loop: it's admin-triggered, rate-aware, resumable (idempotent via
 * dm_status), and defaults to dry-run at the endpoint.
 *
 * enqueue → mint a single-use claim token per eligible creator (managed + has a
 * discord_id + no active token). send → DM the link, record delivery on the row.
 */

const APP_BASE_URL = (process.env.CREATOR_PORTAL_BASE_URL || 'https://app.tempoapp.ai').replace(/\/+$/, '');
const SEND_DELAY_MS = 350; // gentle pace between DMs (well under Discord limits)

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function claimUrl(token: string): string {
  return `${APP_BASE_URL}/creator-claim?token=${encodeURIComponent(token)}`;
}

function inviteMessage(url: string): string {
  return [
    '👋 Your Tempo creator portal is ready!',
    '',
    "See every brand you're on — your retainer, posts, and GMV — in one place, plus how you rank across the network.",
    '',
    "Sign in with your personal link (please don't share it):",
    `<${url}>`,
  ].join('\n');
}

export interface InviteStatus {
  toEnqueue: number; // eligible creators without an active token yet
  pending: number;
  sent: number;
  blocked: number;
  failed: number;
  claimed: number; // consumed = logged in
}

export async function getInviteStatus(): Promise<InviteStatus> {
  const supabase = await createAdminClient();
  const head = (build: (q: ReturnType<typeof supabase.from>) => unknown) =>
    build(supabase.from('creator_claim_tokens')) as unknown as Promise<{ count: number | null }>;

  const [pending, sent, blocked, failed, claimed, toEnqueue] = await Promise.all([
    head((q) => q.select('jti', { count: 'exact', head: true }).eq('dm_status', 'pending').is('consumed_at', null)),
    head((q) => q.select('jti', { count: 'exact', head: true }).eq('dm_status', 'sent').is('consumed_at', null)),
    head((q) => q.select('jti', { count: 'exact', head: true }).eq('dm_status', 'blocked')),
    head((q) => q.select('jti', { count: 'exact', head: true }).eq('dm_status', 'failed').is('consumed_at', null)),
    head((q) => q.select('jti', { count: 'exact', head: true }).not('consumed_at', 'is', null)),
    supabase.rpc('get_creators_to_invite', { p_limit: 100000 }),
  ]);

  return {
    pending: pending.count ?? 0,
    sent: sent.count ?? 0,
    blocked: blocked.count ?? 0,
    failed: failed.count ?? 0,
    claimed: claimed.count ?? 0,
    toEnqueue: ((toEnqueue.data as unknown[] | null) ?? []).length,
  };
}

/** Mint a pending claim-token row for each eligible creator not yet queued. */
export async function enqueueInvites(limit = 1000): Promise<{ enqueued: number }> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase.rpc('get_creators_to_invite', { p_limit: limit });
  if (error) throw new Error(error.message);
  const rows = ((data as { creator_id: string; discord_id: string }[] | null) ?? []);

  let enqueued = 0;
  for (const r of rows) {
    const { token, jti, expiresAt } = await generateClaimToken({
      creatorId: r.creator_id as unknown as number,
      email: '',
    });
    const { error: insErr } = await supabase.from('creator_claim_tokens').insert({
      jti,
      token,
      creator_id: r.creator_id,
      expires_at: expiresAt.toISOString(),
      created_by: 'bulk-invite',
      discord_id: r.discord_id,
      dm_status: 'pending',
    });
    if (!insErr) enqueued++;
  }
  return { enqueued };
}

export interface SendResult {
  attempted: number;
  sent: number;
  blocked: number;
  failed: number;
  rateLimited: boolean;
  remaining: number;
}

/** DM a batch of pending/failed invites. Resumable: re-run drains the rest. */
export async function sendClaimBatch(opts: { limit?: number; dryRun?: boolean } = {}): Promise<SendResult> {
  const limit = Math.min(Math.max(opts.limit ?? 40, 1), 100);
  const supabase = await createAdminClient();
  const nowIso = new Date().toISOString();

  const { data } = await supabase
    .from('creator_claim_tokens')
    .select('jti, token, discord_id')
    .in('dm_status', ['pending', 'failed'])
    .is('consumed_at', null)
    .gt('expires_at', nowIso)
    .not('discord_id', 'is', null)
    .not('token', 'is', null)
    .limit(limit);
  const rows = ((data as { jti: string; token: string; discord_id: string }[] | null) ?? []);

  const result: SendResult = { attempted: 0, sent: 0, blocked: 0, failed: 0, rateLimited: false, remaining: 0 };

  for (const row of rows) {
    if (opts.dryRun) { result.attempted++; continue; }
    const outcome = await sendDirectMessage(row.discord_id, inviteMessage(claimUrl(row.token)));
    if (outcome.status === 'rate_limited') {
      result.rateLimited = true;
      await sleep(outcome.retryAfterMs);
      break; // leave this row pending; the next run resumes
    }
    result.attempted++;
    const update: Record<string, unknown> = { dm_at: new Date().toISOString() };
    if (outcome.status === 'sent') { update.dm_status = 'sent'; result.sent++; }
    else if (outcome.status === 'blocked') { update.dm_status = 'blocked'; update.dm_error = 'dms_closed'; result.blocked++; }
    else { update.dm_status = 'failed'; update.dm_error = outcome.error; result.failed++; }
    await supabase.from('creator_claim_tokens').update(update).eq('jti', row.jti);
    await sleep(SEND_DELAY_MS);
  }

  const { count } = await supabase
    .from('creator_claim_tokens')
    .select('jti', { count: 'exact', head: true })
    .in('dm_status', ['pending', 'failed'])
    .is('consumed_at', null)
    .gt('expires_at', nowIso);
  result.remaining = count ?? 0;
  return result;
}

/** Send ONE real invite to a specific Discord id (test on yourself before a blast). */
export async function sendTestInvite(
  discordId: string,
  creatorId: string,
): Promise<{ outcome: string; url: string }> {
  const supabase = await createAdminClient();
  const { token, jti, expiresAt } = await generateClaimToken({
    creatorId: creatorId as unknown as number,
    email: '',
  });
  await supabase.from('creator_claim_tokens').insert({
    jti,
    token,
    creator_id: creatorId,
    expires_at: expiresAt.toISOString(),
    created_by: 'test-invite',
    discord_id: discordId,
    dm_status: 'pending',
  });
  const url = claimUrl(token);
  const outcome = await sendDirectMessage(discordId, inviteMessage(url));
  await supabase
    .from('creator_claim_tokens')
    .update({
      dm_status: outcome.status === 'sent' ? 'sent' : outcome.status === 'blocked' ? 'blocked' : 'failed',
      dm_at: new Date().toISOString(),
      dm_error: outcome.status === 'failed' ? outcome.error : outcome.status === 'blocked' ? 'dms_closed' : null,
    })
    .eq('jti', jti);
  return { outcome: outcome.status, url };
}
