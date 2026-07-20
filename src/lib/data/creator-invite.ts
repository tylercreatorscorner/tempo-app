import { createAdminClient } from '@/lib/supabase/server';
import { generateClaimToken } from '@/lib/auth/creator-auth';
import { sendDirectMessage, type DiscordMessagePayload } from '@/lib/discord/rest';

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

const TEMPO_INDIGO = 0x5b4bff; // matches the Pulse hero gradient start

/** A branded Discord embed + a "Open my portal" link button, personalized. */
function inviteMessage(url: string, name?: string): DiscordMessagePayload {
  const firstName = (name ?? '').trim().split(/\s+/)[0];
  const greeting = firstName ? `Hi ${firstName} 👋` : 'Hi 👋';
  return {
    embeds: [
      {
        color: TEMPO_INDIGO,
        title: '🎬 Your Tempo creator portal is ready',
        description:
          `${greeting}\n\nSee **every brand you're on** — your retainer, posts, and GMV — all in one place, ` +
          'plus how you rank across the network. Tap below to sign in.',
        footer: { text: "Your personal link — please don't share it." },
      },
    ],
    components: [
      {
        type: 1, // action row
        components: [
          { type: 2, style: 5, label: 'Open my portal  →', url }, // link button
        ],
      },
    ],
  };
}

function extractName(c: unknown): string | undefined {
  if (!c) return undefined;
  const obj = Array.isArray(c) ? c[0] : c;
  return (obj as { real_name?: string | null } | undefined)?.real_name || undefined;
}

// ---- One-off link minting (admin "Copy invite link") -----------------------

export interface InviteCandidate {
  id: string;
  name: string;
  handles: string[];
}

/**
 * Find creators by name or tiktok handle for the one-off invite flow.
 * Returns up to 8 candidates with their handles so an admin can disambiguate
 * duplicate identity rows (same person, different creators_v2 ids) by eye.
 */
export async function searchCreatorsForInvite(query: string): Promise<InviteCandidate[]> {
  const q = query.trim().replace(/^@/, '');
  if (q.length < 2) return [];
  const supabase = await createAdminClient();

  const [byName, byHandle] = await Promise.all([
    supabase.from('creators_v2').select('id, real_name').ilike('real_name', `%${q}%`).limit(8),
    supabase
      .from('tiktok_accounts')
      .select('creator_id, creators_v2!inner(real_name)')
      .ilike('tiktok_username', `%${q}%`)
      .limit(8),
  ]);

  const ids = new Map<string, string>(); // id -> name
  for (const r of byName.data ?? []) ids.set(String(r.id), (r.real_name as string) || '(no name)');
  for (const r of byHandle.data ?? []) {
    const name = (Array.isArray(r.creators_v2) ? r.creators_v2[0] : r.creators_v2) as
      | { real_name?: string | null }
      | undefined;
    ids.set(String(r.creator_id), name?.real_name || '(no name)');
  }
  const idList = Array.from(ids.keys()).slice(0, 8);
  if (idList.length === 0) return [];

  const { data: ta } = await supabase
    .from('tiktok_accounts')
    .select('creator_id, tiktok_username')
    .in('creator_id', idList);
  const handlesById = new Map<string, string[]>();
  for (const r of ta ?? []) {
    const arr = handlesById.get(String(r.creator_id)) ?? [];
    if (r.tiktok_username) arr.push(String(r.tiktok_username));
    handlesById.set(String(r.creator_id), arr);
  }

  return idList.map((id) => ({
    id,
    name: ids.get(id) ?? '(no name)',
    handles: handlesById.get(id) ?? [],
  }));
}

/** Base URL for claim links (also used by the batch sender). */
export function inviteBaseUrl(): string {
  return APP_BASE_URL;
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
    .select('jti, token, discord_id, creator:creators_v2(real_name)')
    .eq('created_by', 'bulk-invite') // never send test-invite rows in the blast
    .in('dm_status', ['pending', 'failed'])
    .is('consumed_at', null)
    .gt('expires_at', nowIso)
    .not('discord_id', 'is', null)
    .not('token', 'is', null)
    .limit(limit);
  const rows = ((data as { jti: string; token: string; discord_id: string; creator: unknown }[] | null) ?? []);

  const result: SendResult = { attempted: 0, sent: 0, blocked: 0, failed: 0, rateLimited: false, remaining: 0 };

  for (const row of rows) {
    if (opts.dryRun) { result.attempted++; continue; }
    const outcome = await sendDirectMessage(row.discord_id, inviteMessage(claimUrl(row.token), extractName(row.creator)));
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
  const outcome = await sendDirectMessage(did, inviteMessage(url, creatorName));
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
