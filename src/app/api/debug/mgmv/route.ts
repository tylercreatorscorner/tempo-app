// TEMPORARY debug endpoint — instruments computeManagedGmv's fetches to find why
// all-brands earnings under-counts. Secret-gated; DELETE after diagnosis.
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { computeManagedGmv } from '@/lib/data/managed-gmv';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get('k') !== 'tmp-dbg-7f3a91') {
    return NextResponse.json({ error: 'nope' }, { status: 403 });
  }
  const supabase = await createAdminClient();

  // 1) managed_creators (paged)
  const managedRows: Array<{ brand: string | null; creator_id: string | null }> = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('managed_creators')
      .select('brand, creator_id')
      .is('archived_at', null)
      .order('id', { ascending: true })
      .range(from, from + 999);
    if (error) return NextResponse.json({ step: 'managed_creators', error: error.message });
    if (!data || data.length === 0) break;
    managedRows.push(...(data as Array<{ brand: string | null; creator_id: string | null }>));
    if (data.length < 1000) break;
  }
  const creatorIds = Array.from(new Set(managedRows.map((m) => m.creator_id).filter((v): v is string => !!v)));

  // 2) tiktok_accounts (chunked + paged) — exactly like the fixed code
  const handlesByCreatorId = new Map<string, string[]>();
  let taTotal = 0;
  let taError: string | null = null;
  const CHUNK = 200;
  for (let i = 0; i < creatorIds.length && !taError; i += CHUNK) {
    const batch = creatorIds.slice(i, i + CHUNK);
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase
        .from('tiktok_accounts')
        .select('creator_id, tiktok_username')
        .in('creator_id', batch)
        .order('id', { ascending: true })
        .range(from, from + 999);
      if (error) { taError = error.message; break; }
      if (!data || data.length === 0) break;
      taTotal += data.length;
      for (const r of data as Array<{ creator_id: string; tiktok_username: string | null }>) {
        const h = (r.tiktok_username || '').replace(/^@/, '').trim().toLowerCase();
        if (!h) continue;
        const list = handlesByCreatorId.get(r.creator_id) ?? [];
        list.push(h);
        handlesByCreatorId.set(r.creator_id, list);
      }
      if (data.length < 1000) break;
    }
  }

  const charlstynCid = creatorIds.find((c) => c.endsWith('073568df')) ?? null;

  // 3) what computeManagedGmv actually returns for all-brands
  const mg = await computeManagedGmv('2026-06-01', '2026-06-30', null);
  const lemme = mg.byStoreCreator.get('lemme');

  return NextResponse.json({
    managedRows: managedRows.length,
    creatorIds: creatorIds.length,
    ta_rows_fetched: taTotal,
    ta_error: taError,
    handlesByCreatorId_size: handlesByCreatorId.size,
    charlstyn_cid: charlstynCid,
    charlstyn_handles: charlstynCid ? handlesByCreatorId.get(charlstynCid) ?? null : null,
    mg_lemme_total: mg.byStore.get('lemme') ?? 0,
    mg_lemme_creator_count: lemme?.size ?? 0,
    mg_lemme_has_shoppingwithcharlstyn: lemme?.has('shoppingwithcharlstyn') ?? false,
    mg_lemme_has_peshoedite8: lemme?.has('peshoedite8') ?? false,
  });
}
