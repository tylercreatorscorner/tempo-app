import { createClient } from '@/lib/supabase/server';
import { brandSlugToUuid } from '@/lib/utils/constants';

/** Fetch managed creators for a tenant, optionally filtered by brand slug */
export async function getManagedCreators(
  tenantId: string,
  brand?: string
) {
  const supabase = await createClient();
  let query = supabase
    .from('creator_brands')
    .select('*, creator:creators_v2(*)');

  if (brand) {
    const brandUuid = brandSlugToUuid(brand);
    if (brandUuid) {
      query = query.eq('brand_id', brandUuid);
    }
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch creators: ${error.message}`);
  return data ?? [];
}
