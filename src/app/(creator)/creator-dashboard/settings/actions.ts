'use server';

import { revalidatePath } from 'next/cache';
import { getCreatorSession } from '@/lib/auth/creator-auth';
import { createAdminClient } from '@/lib/supabase/server';

const HANDLE_RE = /^[a-z0-9._]{2,24}$/;

export interface HandleActionResult {
  ok: boolean;
  error?: string;
}

/**
 * Link a TikTok handle to the signed-in creator. Guarded: a handle already owned
 * by ANOTHER creator can't be claimed (that would leak their stats). New handles
 * are stored unverified (verified=false) — self-claimed, not confirmed.
 */
export async function addCreatorHandle(rawUsername: string): Promise<HandleActionResult> {
  const session = await getCreatorSession();
  if (!session) return { ok: false, error: 'You are not signed in.' };
  const creatorId = String(session.creatorId);

  const username = rawUsername.replace(/^@+/, '').trim().toLowerCase();
  if (!HANDLE_RE.test(username)) {
    return { ok: false, error: 'Enter a valid TikTok handle (2–24 chars: letters, numbers, . or _).' };
  }

  const supabase = await createAdminClient();

  // Who, if anyone, already owns this handle?
  const { data: existing } = await supabase
    .from('tiktok_accounts')
    .select('id, creator_id')
    .ilike('tiktok_username', username);
  const rows = existing ?? [];
  if (rows.some((r) => r.creator_id === creatorId)) {
    return { ok: true }; // already linked to you
  }
  if (rows.some((r) => r.creator_id && r.creator_id !== creatorId)) {
    return {
      ok: false,
      error: 'That handle is already linked to another account. Ask your manager if this looks wrong.',
    };
  }

  // tiktok_accounts.tenant_id is NOT NULL — copy it from one of the creator's rows.
  const { data: mine } = await supabase
    .from('tiktok_accounts')
    .select('tenant_id')
    .eq('creator_id', creatorId)
    .not('tenant_id', 'is', null)
    .limit(1)
    .maybeSingle();
  const tenantId = mine?.tenant_id;
  if (!tenantId) {
    return { ok: false, error: 'Could not add a handle right now. Please contact your manager.' };
  }

  const { error } = await supabase.from('tiktok_accounts').insert({
    creator_id: creatorId,
    tenant_id: tenantId,
    tiktok_username: username,
    brand_id: null,
    is_primary: false,
    verified: false,
  });
  if (error) return { ok: false, error: 'Could not add that handle. Please try again.' };

  revalidatePath('/creator-dashboard/settings');
  revalidatePath('/creator-dashboard');
  return { ok: true };
}

/** Unlink one of the creator's OWN handles. Won't remove their last handle
 *  (that would cut off all their data). */
export async function removeCreatorHandle(accountId: string): Promise<HandleActionResult> {
  const session = await getCreatorSession();
  if (!session) return { ok: false, error: 'You are not signed in.' };
  const creatorId = String(session.creatorId);

  const supabase = await createAdminClient();

  const { data: all } = await supabase
    .from('tiktok_accounts')
    .select('id')
    .eq('creator_id', creatorId);
  if ((all ?? []).length <= 1) {
    return { ok: false, error: 'You need at least one handle linked. Add another before removing this one.' };
  }

  const { error } = await supabase
    .from('tiktok_accounts')
    .delete()
    .eq('id', accountId)
    .eq('creator_id', creatorId); // scope to the creator's own rows only
  if (error) return { ok: false, error: 'Could not remove that handle.' };

  revalidatePath('/creator-dashboard/settings');
  revalidatePath('/creator-dashboard');
  return { ok: true };
}
