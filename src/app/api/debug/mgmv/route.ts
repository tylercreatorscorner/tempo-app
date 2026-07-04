// TEMPORARY debug endpoint — round 2: instrument perfData + managedLookup.
// Secret-gated; DELETE after diagnosis.
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { computeManagedGmv } from '@/lib/data/managed-gmv';

export const runtime = 'nodejs';
export const maxDuration = 60;

const norm = (h: string | null | undefined) => (h || '').replace(/^@/, '').trim().toLowerCase();

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get('k') !== 'tmp-dbg-7f3a91') {
    return NextResponse.json({ error: 'nope' }, { status: 403 });
  }
  const supabase = await createAdminClient();

  // active data stores (same as computeManagedGmv)
  const { data: brandsRaw } = await supabase
    .from('brands_v2').select('slug').eq('is_archived', false).eq('is_umbrella', false);
  const storeSlugs = ((brandsRaw as Array<{ slug: string }> | null) ?? []).map((b) => b.slug);

  // perfData exactly as computeManagedGmv fetches it (all stores)
  const { data: perf, error: perfErr } = await supabase.rpc('get_creator_brand_gmv', {
    p_start_date: '2026-06-01', p_end_date: '2026-06-30', p_brands: storeSlugs,
  });
  const perfRows = (perf as Array<{ brand: string; creator_name: string; gmv: number | string }> | null) ?? [];
  const lemmePerf = perfRows.filter((r) => r.brand === 'lemme');

  // per-brand call for comparison (this is what the working Creators page does)
  const { data: perfLemme } = await supabase.rpc('get_creator_brand_gmv', {
    p_start_date: '2026-06-01', p_end_date: '2026-06-30', p_brands: ['lemme'],
  });
  const perfLemmeRows = (perfLemme as Array<{ brand: string; creator_name: string }> | null) ?? [];

  const mg = await computeManagedGmv('2026-06-01', '2026-06-30', null);

  return NextResponse.json({
    storeSlugs_count: storeSlugs.length,
    storeSlugs_has_lemme: storeSlugs.includes('lemme'),
    perf_total_rows: perfRows.length,
    perf_lemme_rows: lemmePerf.length,
    perf_allbrands_has_shopping_lemme: lemmePerf.some((r) => norm(r.creator_name) === 'shoppingwithcharlstyn'),
    perf_allbrands_has_charley_lemme: lemmePerf.some((r) => norm(r.creator_name) === 'charleytiktokfinds'),
    perfErr: perfErr?.message ?? null,
    perf_lemmeonly_rows: perfLemmeRows.length,
    perf_lemmeonly_has_shopping: perfLemmeRows.some((r) => norm(r.creator_name) === 'shoppingwithcharlstyn'),
    lookup_size: mg.managedLookup.size,
    lookup_has_shopping_lemme: mg.managedLookup.has('shoppingwithcharlstyn|||lemme'),
    lookup_has_charley_lemme: mg.managedLookup.has('charleytiktokfinds|||lemme'),
    mg_lemme_total: mg.byStore.get('lemme') ?? 0,
  });
}
