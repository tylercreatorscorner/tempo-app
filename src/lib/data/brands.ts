import { createClient } from '@/lib/supabase/server';
import type { Brand } from '@/types';

/**
 * Get the current user's allowed brand slugs from their user_profile.
 * Returns null if the user has no restriction (= full access).
 */
export async function getAllowedBrandsForUser(): Promise<string[] | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('user_profiles')
    .select('allowed_brands')
    .eq('user_id', user.id)
    .maybeSingle();

  if (Array.isArray(data?.allowed_brands) && data.allowed_brands.length > 0) {
    return data.allowed_brands;
  }
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
