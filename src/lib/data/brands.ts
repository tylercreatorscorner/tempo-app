import { createClient } from '@/lib/supabase/server';
import type { Brand } from '@/types';

/** Fetch all brands for the current tenant */
export async function getBrands(tenantId: string): Promise<Brand[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('brands')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('display_name');

  if (error) throw new Error(`Failed to fetch brands: ${error.message}`);
  return (data ?? []) as Brand[];
}

/** Fetch a single brand by ID */
export async function getBrand(brandId: string): Promise<Brand | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('brands')
    .select('*')
    .eq('id', brandId)
    .single();

  if (error) return null;
  return data as Brand;
}
