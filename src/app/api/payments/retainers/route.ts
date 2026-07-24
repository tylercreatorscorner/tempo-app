/**
 * GET /api/payments/retainers?brand=<slug|all>
 *
 * Returns the operational retainer tracker — every managed creator with a
 * retainer > 0, enriched with this period's post count + pace-based status.
 *
 * Brand list is sourced from `brands_v2` (filtered to active + non-umbrella)
 * to avoid drift from a hardcoded constant.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { createAdminClient } from '@/lib/supabase/server';
import { fetchAllRows } from '@/lib/data/fetch-all-rows';

export const runtime = 'nodejs';

/** The managed_creators columns this route reads (select('*') returns more —
 *  the enriched response passes the full row through untouched). */
interface ManagedCreatorRow {
  id?: string;
  brand: string;
  retainer: number | null;
  real_name: string | null;
  monthly_post_requirement: number | null;
  retainer_start_date: string | null;
  account_1: string | null;
  account_2: string | null;
  account_3: string | null;
  account_4: string | null;
  account_5: string | null;
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
    let activeBrandSlugs = (brandRows ?? []).map((b: { slug: string }) => b.slug);
    // Managers: restrict the "all" set to their brands.
    if (scopedSlugs) activeBrandSlugs = activeBrandSlugs.filter((s) => scopedSlugs.includes(s));

    // Paged past the 1000-row cap — managed_creators is ~1.3k rows total, so
    // an un-paged read can silently drop retainer creators as the roster grows.
    // The secondary `.order('id')` disambiguates duplicate real_names so
    // successive range windows line up.
    const creators = await fetchAllRows<ManagedCreatorRow>(() => {
      let query = supabase
        .from('managed_creators')
        .select('*')
        .gt('retainer', 0);
      if (brand !== 'all') {
        query = query.eq('brand', brand);
      } else {
        query = query.in('brand', activeBrandSlugs);
      }
      return query.order('real_name').order('id', { ascending: true });
    }, 'payments-retainers');

    // Period boundaries for post verification
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const periodStart = `${year}-${month}-01`;
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const periodEnd = yesterday.toISOString().split('T')[0];

    interface PaymentRow {
      id?: string;
      creator_name: string;
      brand: string;
      posts_found: number | null;
      posting_verified: boolean | null;
      status: string;
    }
    // Payment records for this period (post verification). Paged + throwing:
    // the old unchecked read silently defaulted posts_found to 0 on failure,
    // flagging every creator "At Risk" off a fabricated zero.
    const payments = await fetchAllRows<PaymentRow>(() =>
      supabase
        .from('creator_payments')
        .select('id, creator_name, brand, posts_found, posting_verified, status')
        .eq('payment_type', 'retainer')
        .eq('period_month', `${year}-${month}`)
        .order('id', { ascending: true }), 'payments-retainers');

    const paymentMap: Record<string, PaymentRow> = {};
    for (const p of payments) {
      paymentMap[`${p.creator_name}|${p.brand}`] = p;
    }

    const totalRetainerSpend = creators.reduce((sum, c) => sum + (c.retainer ?? 0), 0);

    const enriched = creators.map((c) => {
      const key = `${c.account_1}|${c.brand}`;
      const payment = paymentMap[key];
      const postsFound = payment?.posts_found ?? 0;
      const postsRequired = c.monthly_post_requirement ?? 0;

      let status: 'On Track' | 'Behind' | 'At Risk' = 'On Track';
      if (postsRequired > 0) {
        const dayOfMonth = now.getDate();
        const daysInMonth = new Date(year, now.getMonth() + 1, 0).getDate();
        const expectedPace = (postsRequired / daysInMonth) * dayOfMonth;
        if (postsFound < expectedPace * 0.5) {
          status = 'At Risk';
        } else if (postsFound < expectedPace * 0.8) {
          status = 'Behind';
        }
      }

      return {
        ...c,
        creator_name: c.real_name || c.account_1 || 'Unknown',
        posts_found: postsFound,
        posts_required: postsRequired,
        status,
        payment_status: payment?.status || 'pending',
      };
    });

    return NextResponse.json({
      creators: enriched,
      totalRetainerSpend,
      periodStart,
      periodEnd,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
