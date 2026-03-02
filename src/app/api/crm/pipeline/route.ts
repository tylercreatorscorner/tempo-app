import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { brandUuidToSlug } from '@/lib/utils/constants';

export async function GET() {
  try {
    const supabase = await createAdminClient();

    // Get all creators
    const { data: creators, error } = await supabase
      .from('creators_v2')
      .select('id, real_name')
      .order('real_name');
    if (error) throw error;

    // Get brand associations with status
    const { data: brandRows } = await supabase
      .from('creator_brands')
      .select('creator_id, brand_id, status');

    // Build creator cards
    const brandMap = new Map<string, { brands: string[]; status: string }>();
    for (const row of brandRows || []) {
      const existing = brandMap.get(row.creator_id);
      const slug = brandUuidToSlug(row.brand_id) ?? row.brand_id;
      if (existing) {
        existing.brands.push(slug);
        // Use first non-null status
        if (!existing.status && row.status) existing.status = row.status;
      } else {
        brandMap.set(row.creator_id, { brands: [slug], status: row.status || 'prospect' });
      }
    }

    const result = (creators || []).map(c => ({
      id: c.id,
      real_name: c.real_name,
      status: brandMap.get(c.id)?.status || 'prospect',
      brands: brandMap.get(c.id)?.brands || [],
    }));

    return NextResponse.json({ creators: result });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
