/**
 * /api/invoices/run — the monthly invoice run.
 *
 * GET  ?month=YYYY-MM&team_member_id=… → the PLAN: which brands are ready to
 *      invoice (earnings total > 0, no existing invoice for this month+payee),
 *      which already have an invoice (with its status), and which carry a zero
 *      balance. Drives the run modal band + checklist and the cockpit's
 *      "Run {month} invoices · N ready" button.
 *
 * POST { month, teamMemberId?, brands: [slug, …] } → generate draft invoices
 *      for the CHECKED brands, sequentially, through the same
 *      createInvoiceForBrand core the single-brand button uses. One
 *      getEarnings call feeds every brand — no per-brand recompute. Nothing
 *      is emailed; the run creates draft (status 'pending') invoices only.
 *
 * Finance-gated; brand-scoped managers may only run brands in their scope.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { createAdminClient } from '@/lib/supabase/server';
import { getEarnings } from '@/lib/data/earnings';
import { createInvoiceForBrand } from '@/lib/finance/create-invoice';
import type { CompensationModel } from '@/lib/finance/invoice-math';

export const runtime = 'nodejs';
export const maxDuration = 60;

export interface RunPlanReady {
  brand: string;
  brandLabel: string;
  model: CompensationModel;
  total: number;
}
export interface RunPlanInvoiced {
  brand: string;
  brandLabel: string;
  status: string;
  invoiceId: string;
  invoiceNumber: string;
}
export interface RunPlanZero {
  brand: string;
  brandLabel: string;
  total: number;
}

export async function GET(req: NextRequest) {
  const scope = await getWorkspaceScope();
  if (!scope) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!scope.canViewFinance) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const scopedSlugs = scope.brandScope.kind === 'scoped' ? scope.brandScope.brandSlugs : null;

  const month = req.nextUrl.searchParams.get('month');
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'month is required (YYYY-MM)' }, { status: 400 });
  }
  const teamMemberId = req.nextUrl.searchParams.get('team_member_id') ?? undefined;

  const earnings = await getEarnings(month, teamMemberId, scopedSlugs);
  const payeeId = earnings.teamMember?.id ?? null;
  if (!payeeId) {
    return NextResponse.json({ error: 'No team member configured — add one in Settings → Team Members' }, { status: 400 });
  }

  const brandSlugs = earnings.brands.map((b) => b.brand);
  const supabase = await createAdminClient();
  const { data: invoices, error } = brandSlugs.length
    ? await supabase
        .from('invoices')
        .select('id, brand, status, invoice_number')
        .eq('period_month', month)
        // NULL-payee legacy invoices block the run for that brand-month —
        // .eq skips NULLs, which listed already-invoiced brands as Ready
        // (double-invoice risk; review finding).
        .or(`team_member_id.eq.${payeeId},team_member_id.is.null`)
        .in('brand', brandSlugs)
    : { data: [], error: null };
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const invoiceByBrand = new Map<string, { id: string; status: string; invoice_number: string }>();
  for (const inv of (invoices as Array<{ id: string; brand: string; status: string; invoice_number: string }> | null) ?? []) {
    invoiceByBrand.set(inv.brand, inv);
  }

  const ready: RunPlanReady[] = [];
  const invoiced: RunPlanInvoiced[] = [];
  const zero: RunPlanZero[] = [];
  for (const row of earnings.brands) {
    const inv = invoiceByBrand.get(row.brand);
    if (inv) {
      invoiced.push({ brand: row.brand, brandLabel: row.brandLabel, status: inv.status, invoiceId: String(inv.id), invoiceNumber: inv.invoice_number });
    } else if (row.total > 0) {
      ready.push({ brand: row.brand, brandLabel: row.brandLabel, model: row.compensationModel, total: row.total });
    } else {
      zero.push({ brand: row.brand, brandLabel: row.brandLabel, total: row.total });
    }
  }
  ready.sort((a, b) => b.total - a.total);

  return NextResponse.json({
    month,
    teamMemberId: payeeId,
    teamMemberName: earnings.teamMember?.name ?? null,
    ready,
    invoiced,
    zero,
  });
}

interface RunPostBody {
  month?: string;
  teamMemberId?: string;
  /** The CHECKED brand slugs from the run modal. */
  brands?: string[];
}

export async function POST(req: NextRequest) {
  const scope = await getWorkspaceScope();
  if (!scope) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!scope.canViewFinance) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const scopedSlugs = scope.brandScope.kind === 'scoped' ? scope.brandScope.brandSlugs : null;

  let body: RunPostBody;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { month, teamMemberId } = body;
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'month is required (YYYY-MM)' }, { status: 400 });
  }
  if (!Array.isArray(body.brands) || body.brands.length === 0 || body.brands.some((b) => typeof b !== 'string' || !b)) {
    return NextResponse.json({ error: 'brands is required (non-empty array of brand slugs)' }, { status: 400 });
  }
  // De-dupe so one run can never double-generate a brand.
  const brands = Array.from(new Set(body.brands));

  // A manager may only run invoices for their own brands — every requested
  // brand must be in scope, or the whole run is rejected (no partial runs
  // across a permission boundary).
  if (scopedSlugs) {
    const outside = brands.filter((b) => !scopedSlugs.includes(b));
    if (outside.length > 0) {
      return NextResponse.json({ error: `Forbidden: brand not in your access (${outside.join(', ')})` }, { status: 403 });
    }
  }

  // ONE earnings computation for the whole run — every brand's invoice is cut
  // from the same month+payee result the plan showed.
  const earnings = await getEarnings(month, teamMemberId, scopedSlugs);
  if (!earnings.teamMember?.id) {
    return NextResponse.json({ error: 'No team member configured — add one in Settings → Team Members' }, { status: 400 });
  }

  const supabase = await createAdminClient();
  const results: Array<{
    brand: string;
    ok: boolean;
    invoiceId?: string;
    invoiceNumber?: string;
    error?: string;
    duplicate?: boolean;
  }> = [];

  // Sequential on purpose: the invoice-number allocator counts existing rows
  // per month, so parallel inserts would collide on every attempt.
  for (const brand of brands) {
    const res = await createInvoiceForBrand({
      brand,
      month,
      earnings,
      adminClient: supabase,
      createdBy: scope.email ?? null,
    });
    if (res.ok) {
      results.push({ brand, ok: true, invoiceId: res.invoiceId, invoiceNumber: res.invoiceNumber });
    } else {
      results.push({
        brand,
        ok: false,
        error: res.error,
        ...(res.duplicate ? { duplicate: true } : {}),
        ...(res.existing ? { invoiceId: res.existing.id, invoiceNumber: res.existing.invoice_number } : {}),
      });
    }
  }

  const created = results.filter((r) => r.ok).length;
  return NextResponse.json({ results, created, failed: results.length - created });
}
