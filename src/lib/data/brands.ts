import { createClient } from '@/lib/supabase/server';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import type { Brand } from '@/types';

/**
 * Get the current user's allowed brand slugs.
 *
 * Canonical source is the Workspace scope (role + user_brand_access), NOT the
 * legacy `user_profiles.allowed_brands` column — that column was vestigial
 * (1/216 rows, and that row already agreed with user_brand_access).
 * Unifying here keeps every caller (analytics, dashboard, products, brands
 * pages) consistent with the brand portal and the API layer.
 *
 *   owner / admin / viewer  → null  (no restriction = all brands)
 *   manager                 → their user_brand_access brand slugs
 *   no Workspace scope      → null  (unchanged; these pages aren't reached
 *                                    by brand/creator roles anyway)
 */
export async function getAllowedBrandsForUser(): Promise<string[] | null> {
  const scope = await getWorkspaceScope();
  if (!scope) return null;
  if (scope.brandScope.kind === 'scoped') return scope.brandScope.brandSlugs;
  return null;
}

/** Fetch all non-archived brands for the current tenant, respecting user's allowed_brands */
export async function getBrands(tenantId: string): Promise<Brand[]> {
  const supabase = await createClient();
  const allowed = await getAllowedBrandsForUser();

  let query = supabase
    .from('brands_v2')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('is_archived', false);
  if (allowed) query = query.in('slug', allowed);

  const { data, error } = await query.order('display_name');
  if (error) throw new Error(`Failed to fetch brands: ${error.message}`);
  return (data ?? []) as Brand[];
}

/** Fetch a single brand by ID */
export async function getBrand(brandId: string): Promise<Brand | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('brands_v2')
    .select('*')
    .eq('id', brandId)
    .single();

  if (error) return null;
  return data as Brand;
}
