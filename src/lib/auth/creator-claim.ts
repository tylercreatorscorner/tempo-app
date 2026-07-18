import { createAdminClient } from '@/lib/supabase/server';
import { generateClaimToken, verifyToken } from './creator-auth';

/**
 * Claim-link helpers for Discord-first creator onboarding.
 *
 * Flow: the distribution job mints a single-use link per creator (mintClaimLink)
 * and the bot DMs it. The /creator-claim landing PEEKS the token for display
 * (peekClaimToken — no consume, so Discord's link-unfurl can't burn it), and only
 * the explicit "Continue" POST consumes it (consumeClaimToken) and sets a session.
 *
 * creators_v2.id is a uuid string; CreatorTokenPayload types creatorId as number
 * for legacy reasons and every consumer coerces with String(), so we cast at the
 * boundary — the JWT carries the uuid verbatim.
 */

export interface MintedClaimLink {
  creatorId: string;
  url: string;
  jti: string;
}

/**
 * Mint a single-use claim link: sign a 60-day claim token, record its JTI in
 * creator_claim_tokens (unconsumed), and return the URL to DM. `baseUrl` e.g.
 * https://app.tempoapp.ai.
 */
export async function mintClaimLink(
  creatorId: string,
  baseUrl: string,
  createdBy = 'bulk-invite',
): Promise<MintedClaimLink> {
  const { token, jti, expiresAt } = await generateClaimToken({
    creatorId: creatorId as unknown as number,
    email: '',
  });
  const supabase = await createAdminClient();
  const { error } = await supabase.from('creator_claim_tokens').insert({
    jti,
    creator_id: creatorId,
    expires_at: expiresAt.toISOString(),
    created_by: createdBy,
  });
  if (error) throw new Error(`Failed to record claim token: ${error.message}`);
  const base = baseUrl.replace(/\/+$/, '');
  return { creatorId, url: `${base}/creator-claim?token=${encodeURIComponent(token)}`, jti };
}

/**
 * Validate a claim token for DISPLAY only — does NOT consume it. Returns the
 * creator's display name when the token is a valid, unconsumed, unexpired claim
 * token, else null. Safe to call on a GET (link prefetch / unfurl won't burn it).
 */
export async function peekClaimToken(
  token: string,
): Promise<{ creatorId: string; realName: string } | null> {
  const payload = await verifyToken(token);
  if (!payload || payload.purpose !== 'claim' || !payload.jti) return null;

  const supabase = await createAdminClient();
  const { data: row } = await supabase
    .from('creator_claim_tokens')
    .select('creator_id, consumed_at, expires_at')
    .eq('jti', payload.jti)
    .maybeSingle();
  if (!row || row.consumed_at || new Date(row.expires_at as string) < new Date()) return null;

  const creatorId = row.creator_id as string;
  const { data: cv } = await supabase
    .from('creators_v2')
    .select('real_name')
    .eq('id', creatorId)
    .maybeSingle();
  return { creatorId, realName: ((cv?.real_name as string | null) || '').trim() || 'there' };
}

/**
 * Consume a claim token (single-use, atomic). Returns { creatorId } if this call
 * newly consumed it, else null (already used / expired / invalid). The conditional
 * UPDATE (consumed_at IS NULL AND not expired) is race-safe: a second concurrent
 * POST matches zero rows.
 */
export async function consumeClaimToken(token: string): Promise<{ creatorId: string } | null> {
  const payload = await verifyToken(token);
  if (!payload || payload.purpose !== 'claim' || !payload.jti) return null;

  const supabase = await createAdminClient();
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('creator_claim_tokens')
    .update({ consumed_at: nowIso })
    .eq('jti', payload.jti)
    .is('consumed_at', null)
    .gt('expires_at', nowIso)
    .select('creator_id')
    .maybeSingle();
  if (error || !data) return null;
  return { creatorId: data.creator_id as string };
}
