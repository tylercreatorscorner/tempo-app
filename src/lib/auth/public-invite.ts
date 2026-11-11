import { NextResponse } from 'next/server';
import type { createAdminClient } from '@/lib/supabase/server';

// Legacy links used short hex codes. New links use 128 random bits.
export const isInviteCode = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-zA-Z0-9_-]{8,128}$/.test(value);

export const inviteReply = (body: unknown, status = 200) => NextResponse.json(body, {
  status,
  headers: { 'Cache-Control': 'private, no-store' },
});

type Database = Awaited<ReturnType<typeof createAdminClient>>;

/** A public link only identifies its own active brand, never an arbitrary tenant. */
export async function readPublicInvite(db: Database, code: string) {
  const result = await db.from('invites')
    .select('id,tenant_id,brand,expires_at,max_uses,current_uses')
    .eq('code', code).eq('active', true).maybeSingle();
  if (result.error) return { error: 'Could not validate this invitation. Please retry.', status: 503 } as const;
  const invite = result.data;
  if (!invite || !invite.tenant_id || !invite.brand) return { error: 'Invalid invite code', status: 404 } as const;
  const expiry = Date.parse(invite.expires_at);
  if (!Number.isFinite(expiry) || expiry <= Date.now()) return { error: 'This invite has expired', status: 410 } as const;
  if (!Number.isInteger(invite.current_uses) || !Number.isInteger(invite.max_uses)
    || invite.current_uses < 0 || invite.max_uses < 1 || invite.current_uses >= invite.max_uses) {
    return { error: 'This invite has reached its limit', status: 410 } as const;
  }
  const brand = await db.from('brands_v2').select('id,slug,name,display_name')
    .eq('tenant_id', invite.tenant_id).eq('slug', invite.brand).eq('is_archived', false).maybeSingle();
  if (brand.error) return { error: 'Could not validate this invitation. Please retry.', status: 503 } as const;
  if (!brand.data) return { error: 'This invite is no longer available', status: 410 } as const;
  return { invite, brand: brand.data };
}
