/**
 * Server-side auth helpers for admin-only surfaces.
 *
 * Used by:
 *   - /upload page (server component) — to gate the page
 *   - /api/upload/* routes — to gate the data-mutation surface
 *   - any future admin-only page or route
 *
 * The role model:
 *   - owner   -> Tyler / tenant owner. Full access.
 *   - admin   -> internal team / VAs. Full admin access.
 *   - creator -> creators (use creator portal, not admin)
 *   - brand   -> brand client (use brand portal, not admin)
 *   - customer -> default fallback if no profile row exists
 *
 * Anyone who isn't owner OR admin should not see admin-only tools — even if
 * the page somehow renders, every server action and API route is independently
 * gated by these helpers, so the worst case is a "you don't have access" page
 * with no privileged data exposed.
 */
import { createAdminClient, createClient } from '@/lib/supabase/server';

const ADMIN_ROLES = ['owner', 'admin'] as const;
type AdminRole = (typeof ADMIN_ROLES)[number];

export interface AdminProfile {
  user_id: string;
  email: string;
  name: string | null;
  role: AdminRole;
  tenant_id: string | null;
}

/**
 * Returns the current user's profile if they're owner/admin, or null if they
 * aren't logged in or don't have an admin role.
 *
 * Use this in:
 *   - server components (await it, redirect on null)
 *   - API routes (return 401/403 on null)
 */
export async function requireAdmin(): Promise<AdminProfile | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = await createAdminClient();
  const { data: profile } = await admin
    .from('user_profiles')
    .select('user_id, email, name, role, tenant_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!profile) return null;
  if (!ADMIN_ROLES.includes(profile.role as AdminRole)) return null;

  return {
    user_id: profile.user_id,
    email: profile.email ?? user.email ?? '',
    name: profile.name,
    role: profile.role as AdminRole,
    tenant_id: profile.tenant_id,
  };
}
