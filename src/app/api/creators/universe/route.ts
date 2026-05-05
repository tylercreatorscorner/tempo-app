import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { ACTIVE_BRANDS, expandBrandToDataSlugs } from '@/lib/utils/constants';


export interface UniverseCreator {
  creator_name: string;
  brand: string;
  total_gmv: number;
  total_orders: number;
  total_videos: number;
  is_managed: boolean;
  managed_id?: string;
  managed_real_name?: string;
}

function normalizeHandle(h: string): string {
  return h.replace(/^@/, '').trim().toLowerCase();
}

async function getTenantId() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = await createAdminClient();
  const { data: profile } = await admin
    .from('user_profiles')
    .select('tenant_id')
    .eq('user_id', user.id)
    .maybeSingle();

  return profile?.tenant_id || null;
}

// GET /api/creators/universe?search=&page=1&limit=50&days=90
export async function GET(request: NextRequest) {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const search        = searchParams.get('search')?.toLowerCase() || '';
  const brandFilter   = searchParams.get('brand') || 'all';
  const managedFilter = searchParams.get('managed') || 'all'; // 'all' | 'managed' | 'unmanaged'
  const page          = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit         = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));
  const days          = Math.min(365, Math.max(7, parseInt(searchParams.get('days') || '90', 10)));

  // Sort
  const SORTABLE = ['gmv', 'orders', 'videos', 'creator_name'] as const;
  type SortCol = typeof SORTABLE[number];
  const sortParam = searchParams.get('sort') || 'gmv';
  const sort: SortCol = (SORTABLE as readonly string[]).includes(sortParam) ? sortParam as SortCol : 'gmv';
  const asc = searchParams.get('dir') === 'asc';

  // Compute date range anchored to Central Time yesterday → N days back
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
  const startDay  = new Date(now); startDay.setDate(startDay.getDate() - days);
  const fmt = (d: Date) => d.toISOString().split('T')[0];
  const start = fmt(startDay);
  const end   = fmt(yesterday);

  const supabase = await createAdminClient();

  // Determine which brands to query.
  // Roster uses umbrella slugs (e.g. 'leefar') but creator_performance is
  // keyed by store ('leefar_nutrition', 'leefar_supplements'). Expand the
  // umbrella when querying performance.
  const rosterBrands = (brandFilter !== 'all' && (ACTIVE_BRANDS as readonly string[]).includes(brandFilter))
    ? [brandFilter]
    : [...ACTIVE_BRANDS];
  const brandsToQuery = rosterBrands.flatMap(b => Array.from(expandBrandToDataSlugs(b)));

  // Fetch creator rankings for relevant brands in parallel
  const rankingResults = await Promise.all(
    brandsToQuery.map(brand =>
      supabase.rpc('get_creator_rankings', {
        p_brand: brand,
        p_start_date: start,
        p_end_date: end,
        p_limit: 500,
        p_managed_only: false,
        p_tenant_id: null,
      })
    )
  );

  // Fetch managed creators for this tenant (all brands).
  // Skip archived (soft-removed) creators so they don't show up as managed.
  const { data: managedData } = await supabase
    .from('managed_creators')
    .select('id, real_name, brand, account_1, account_2, account_3, account_4, account_5')
    .eq('tenant_id', tenantId)
    .is('archived_at', null);

  // Build lookup: "normalized_handle|||data_brand_slug" → managed creator info.
  // Umbrella roster brands ('leefar') get expanded so the lookup matches
  // creator_performance rows keyed by store.
  const managedLookup = new Map<string, { id: string; real_name: string | null }>();
  for (const mc of managedData || []) {
    if (!mc.brand) continue;
    const dataBrands = expandBrandToDataSlugs(mc.brand);
    for (const acct of [mc.account_1, mc.account_2, mc.account_3, mc.account_4, mc.account_5]) {
      if (!acct) continue;
      const handle = normalizeHandle(acct);
      for (const db of dataBrands) {
        managedLookup.set(`${handle}|||${db}`, { id: mc.id, real_name: mc.real_name });
      }
    }
  }

  // Combine all brand results into a flat array
  const all: UniverseCreator[] = [];
  brandsToQuery.forEach((brand, i) => {
    const { data, error } = rankingResults[i];
    if (error || !data) return;

    for (const row of data) {
      const name = String(row.creator_name || '');
      if (!name) continue;

      const key = `${normalizeHandle(name)}|||${brand}`;
      const managed = managedLookup.get(key);

      all.push({
        creator_name: name,
        brand,
        total_gmv:    Number(row.total_gmv)    || 0,
        total_orders: Number(row.total_orders) || 0,
        total_videos: Number(row.total_videos) || 0,
        is_managed:   !!managed,
        managed_id:   managed?.id,
        managed_real_name: managed?.real_name ?? undefined,
      });
    }
  });

  // Filter by search and managed status
  let filtered = search
    ? all.filter(c => c.creator_name.toLowerCase().includes(search))
    : all;

  if (managedFilter === 'managed')   filtered = filtered.filter(c => c.is_managed);
  if (managedFilter === 'unmanaged') filtered = filtered.filter(c => !c.is_managed);

  // Sort
  const dir = asc ? 1 : -1;
  filtered.sort((a, b) => {
    switch (sort) {
      case 'orders':       return dir * (a.total_orders - b.total_orders);
      case 'videos':       return dir * (a.total_videos - b.total_videos);
      case 'creator_name': return dir * a.creator_name.localeCompare(b.creator_name);
      case 'gmv':
      default:             return dir * (a.total_gmv - b.total_gmv);
    }
  });

  const total = filtered.length;
  const data  = filtered.slice((page - 1) * limit, page * limit);

  return NextResponse.json({ data, total, page, limit });
}
