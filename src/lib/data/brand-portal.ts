import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { ACTIVE_BRAND_COOKIE } from '@/app/actions/brand-switch';

export interface BrandPortalBrand {
  id: string;
  name: string;
  slug: string;
  display_name: string | null;
  color: string | null;
  logo_url: string | null;
}

export interface BrandPortalUser {
  id: string;
  email: string;
  name: string | null;
}

export interface BrandPortalContext {
  user: BrandPortalUser;
  brands: BrandPortalBrand[];
  /** The currently active brand. Always present when brands.length > 0. */
  activeBrand: BrandPortalBrand;
}

/**
 * Loads the brand portal context for the current user.
 *
 * Hard-redirects if the user is unauthenticated or doesn't have role='brand'.
 * Returns `{ user, brands: [] }` when the user is a brand user with no
 * assigned brands (the layout renders an inline "no access" state in that case).
 *
 * Brand-role users hit RLS that filters by user_brand_access, so we use the
 * admin client to load brand metadata without depending on policy ordering.
 */
export async function loadBrandPortalContext(): Promise<
  | { user: BrandPortalUser; brands: BrandPortalBrand[]; activeBrand: BrandPortalBrand }
  | { user: BrandPortalUser; brands: []; activeBrand: null }
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, name, email')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!profile || profile.role !== 'brand') {
    // Wrong role — middleware should already have redirected, but double-check here.
    redirect('/dashboard');
  }

  const portalUser: BrandPortalUser = {
    id: user.id,
    email: profile.email ?? user.email ?? '',
    name: profile.name ?? null,
  };

  const admin = await createAdminClient();
  const { data: accessRows } = await admin
    .from('user_brand_access')
    .select('brand_id')
    .eq('user_id', user.id);

  const brandIds = (accessRows ?? []).map((r) => r.brand_id);
  if (brandIds.length === 0) {
    return { user: portalUser, brands: [], activeBrand: null };
  }

  const { data: brands } = await admin
    .from('brands_v2')
    .select('id, name, slug, display_name, color, logo_url')
    .in('id', brandIds);

  if (!brands || brands.length === 0) {
    return { user: portalUser, brands: [], activeBrand: null };
  }

  // Sort brands by name for stable ordering (also gives a sensible default
  // when no cookie is set).
  const sorted = [...brands].sort((a, b) =>
    (a.display_name ?? a.name).localeCompare(b.display_name ?? b.name),
  );

  // Honor the active-brand cookie if it points to a brand the user actually
  // has access to. Otherwise default to the first sorted brand.
  const cookieStore = await cookies();
  const cookieSlug = cookieStore.get(ACTIVE_BRAND_COOKIE)?.value;
  const activeBrand =
    (cookieSlug && sorted.find((b) => b.slug === cookieSlug)) || sorted[0];

  return { user: portalUser, brands: sorted, activeBrand };
}

/**
 * For pages rendered inside the brand portal shell — the layout already
 * filtered out the no-access case, so `activeBrand` is guaranteed.
 */
export async function requireBrandPortalContext(): Promise<BrandPortalContext> {
  const ctx = await loadBrandPortalContext();
  if (ctx.activeBrand === null) {
    // The layout would have rendered NoBrandAccess instead of children, so
    // this path is unreachable in practice. Throwing keeps TS narrow.
    throw new Error('Brand portal page rendered without an active brand');
  }
  return ctx;
}
