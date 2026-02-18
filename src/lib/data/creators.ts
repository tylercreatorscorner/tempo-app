import { createClient } from '@/lib/supabase/server';
import type { ManagedCreator } from '@/types';

/** Fetch managed creators for a tenant, optionally filtered by brand */
export async function getManagedCreators(
  tenantId: string,
  brand?: string
): Promise<ManagedCreator[]> {
  const supabase = await createClient();
  let query = supabase
    .from('managed_creators')
    .select('*')
    .eq('tenant_id', tenantId);

  if (brand) {
    query = query.eq('brand', brand);
  }

  const { data, error } = await query.order('brand');
  if (error) throw new Error(`Failed to fetch creators: ${error.message}`);
  return (data ?? []) as ManagedCreator[];
}
