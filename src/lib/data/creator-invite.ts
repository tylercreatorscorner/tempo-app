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
    .eq('created_by', 'bulk-invite') // never send test-invite rows in the blast
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

export interface TestInviteResult {
  outcome: string; // sent | blocked | failed | rate_limited | error
  url?: string;
  creatorName?: string;
  error?: string;
}

/**
 * Send ONE real invite to a Discord id (test on yourself before a blast).
 * creatorId is optional — blank auto-picks an eligible creator, so you only need
 * your own Discord user id. The test token is created_by='test-invite', so it
 * never blocks that creator's real invite (see the eligibility RPC) and is never
 * sent in the blast.
 */
export async function sendTestInvite(discordId: string, creatorId?: string): Promise<TestInviteResult> {
  const did = (discordId ?? '').trim();
  // A Discord user id is a numeric snowflake, not a username.
  if (!/^\d{17,20}$/.test(did)) {
    return {
      outcome: 'error',
      error:
        'That is not a Discord user id. In Discord: Settings → Advanced → Developer Mode on, then right-click your name → "Copy User ID" (a ~19-digit number).',
    };
  }

  const supabase = await createAdminClient();

  // Resolve the creator: the given uuid, else auto-pick an eligible one.
  let cid = (creatorId ?? '').trim();
  let creatorName = '';
  if (cid) {
    const { data: cv } = await supabase.from('creators_v2').select('id, real_name').eq('id', cid).maybeSingle();
    if (!cv) return { outcome: 'error', error: 'No creator with that id. Leave it blank to auto-pick one.' };
    creatorName = (cv.real_name as string | null) ?? '';
  } else {
    // Any managed creator works for a test claim link — the DM goes to YOUR
    // discord id, not theirs. (Don't use the eligibility RPC here: after you
    // Enqueue, it's empty because everyone already has a token.)
    const { data } = await supabase
      .from('managed_creators')
      .select('creator_id, real_name')
      .not('creator_id', 'is', null)
      .limit(1);
    const first = ((data as { creator_id: string; real_name: string }[] | null) ?? [])[0];
    if (!first?.creator_id) return { outcome: 'error', error: 'No creator found to test with.' };
    cid = first.creator_id;
    creatorName = (first.real_name ?? '').trim();
  }

  const { token, jti, expiresAt } = await generateClaimToken({ creatorId: cid as unknown as number, email: '' });
  const { error: insErr } = await supabase.from('creator_claim_tokens').insert({
    jti,
    token,
    creator_id: cid,
    expires_at: expiresAt.toISOString(),
    created_by: 'test-invite',
    discord_id: did,
    dm_status: 'pending',
  });
  if (insErr) return { outcome: 'error', error: `Could not record the test token: ${insErr.message}` };

  const url = claimUrl(token);
  const outcome = await sendDirectMessage(did, inviteMessage(url));
  await supabase
    .from('creator_claim_tokens')
    .update({
      dm_status: outcome.status === 'sent' ? 'sent' : outcome.status === 'blocked' ? 'blocked' : 'failed',
      dm_at: new Date().toISOString(),
      dm_error: outcome.status === 'failed' ? outcome.error : outcome.status === 'blocked' ? 'dms_closed' : null,
    })
    .eq('jti', jti);

  return { outcome: outcome.status, url, creatorName };
}
