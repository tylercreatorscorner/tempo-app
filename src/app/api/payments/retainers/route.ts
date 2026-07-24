/**
 * GET /api/payments/retainers?brand=<slug|all>
 *
 * The retainer book — every ACTIVE managed creator with a retainer > 0, from
 * managed_creators only. This is contract data (who we pay, how much, since
 * when), not performance data.
 *
 * The old version enriched each row with a posts-found count and an
 * On Track / Behind / At Risk pace status read from creator_payments — a table
 * with ONE row ever written, so posts_found was always a fabricated 0 and the
 * status column flagged everyone off fake data. Pace/health now lives with the
 * roster health model; this route no longer touches creator_payments.
 *
 * Brand list is sourced from brands_v2 (active + non-umbrella) to avoid drift
 * from a hardcoded constant. Rows are deduped by (creator_id, brand) taking
 * MAX retainer — same rule as the overview KPI, roster, and dashboard — so the
 * table's sum ties out to the "Retainer book /mo" card.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { createAdminClient } from '@/lib/supabase/server';
import { fetchAllRows } from '@/lib/data/fetch-all-rows';

export const runtime = 'nodejs';

interface ManagedCreatorRow {
  id: string;
  creator_id: string | null;
  brand: string;
  retainer: number | null;
  real_name: string | null;
  retainer_start_date: string | null;
  account_1: string | null;
  account_2: string | null;
  account_3: string | null;
  account_4: string | null;
  account_5: string | null;
}

export interface RetainerBookRow {
  creator_name: string;
  real_name: string | null;
  brand: string;
  retainer: number;
  retainer_start_date: string | null;
  accounts: string[];
}

export async function GET(request: NextRequest) {
  const scope = await getWorkspaceScope();
  if (!scope) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!scope.canViewFinance) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const scopedSlugs = scope.brandScope.kind === 'scoped' ? scope.brandScope.brandSlugs : null;

  try {
    const supabase = await createAdminClient();
    const brand = request.nextUrl.searchParams.get('brand') || 'all';

    // Scoped (manager) requesting a brand outside their access → nothing.
    if (scopedSlugs && brand !== 'all' && !scopedSlugs.includes(brand)) {
      return NextResponse.json({ error: 'Forbidden: brand not in your access' }, { status: 403 });
    }

    // Resolve active brand list from brands_v2 (source of truth).
    const { data: brandRows, error: brandsErr } = await supabase
      .from('brands_v2')
      .select('slug')
      .eq('is_archived', false)
      .eq('is_umbrella', false);
    if (brandsErr) throw brandsErr;
    let activeSlugs = (brandRows ?? []).map((b: { slug: string }) => b.slug);
    if (scopedSlugs) activeSlugs = activeSlugs.filter((s) => scopedSlugs.includes(s));

    // Paged past the 1000-row cap; throws on error (never a partial sum).
    const rows = await fetchAllRows<ManagedCreatorRow>(() => {
      let query = supabase
        .from('managed_creators')
        .select('id, creator_id, brand, retainer, real_name, retainer_start_date, account_1, account_2, account_3, account_4, account_5')
        .gt('retainer', 0)
        .is('archived_at', null);
      if (brand !== 'all') query = query.eq('brand', brand);
      else query = query.in('brand', activeSlugs);
      return query.order('real_name').order('id', { ascending: true });
    }, 'payments-retainers');

    // Dedup by (creator_id, brand) keeping the MAX-retainer row; rows without
    // a creator_id pass through as-is.
    const byCreatorBrand = new Map<string, ManagedCreatorRow>();
    const unlinked: ManagedCreatorRow[] = [];
    for (const r of rows) {
      if (!r.creator_id) { unlinked.push(r); continue; }
      const key = `${r.creator_id}|${r.brand}`;
      const prev = byCreatorBrand.get(key);
      if (!prev || (Number(r.retainer) || 0) > (Number(prev.retainer) || 0)) byCreatorBrand.set(key, r);
    }

    const toBookRow = (c: ManagedCreatorRow): RetainerBookRow => ({
      creator_name: c.real_name || c.account_1 || 'Unknown',
      real_name: c.real_name,
      brand: c.brand,
      retainer: Number(c.retainer) || 0,
      retainer_start_date: c.retainer_start_date,
      accounts: [c.account_1, c.account_2, c.account_3, c.account_4, c.account_5]
        .filter((a): a is string => Boolean(a)),
    });

    const creators = [...byCreatorBrand.values(), ...unlinked]
      .map(toBookRow)
      .sort((a, b) => b.retainer - a.retainer || a.creator_name.localeCompare(b.creator_name));

    const totalRetainerSpend = creators.reduce((sum, c) => sum + c.retainer, 0);

    return NextResponse.json({ creators, totalRetainerSpend });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
