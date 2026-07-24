/**
 * /api/invoices
 *
 * GET  — list invoices with optional filters (status, brand, month)
 * POST — generate an invoice from a brand's earnings for a given month
 */
import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { createAdminClient } from '@/lib/supabase/server';
import { createInvoiceForBrand } from '@/lib/finance/create-invoice';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const scope = await getWorkspaceScope();
  if (!scope) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!scope.canViewFinance) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const scopedSlugs = scope.brandScope.kind === 'scoped' ? scope.brandScope.brandSlugs : null;

  const supabase = await createAdminClient();
  const url = req.nextUrl;
  const status = url.searchParams.get('status');
  const brand = url.searchParams.get('brand');
  const month = url.searchParams.get('month');
  const teamMemberId = url.searchParams.get('team_member_id');

  // Scoped (manager) requesting a brand outside their access → nothing.
  if (scopedSlugs && brand && brand !== 'all' && !scopedSlugs.includes(brand)) {
    return NextResponse.json({ error: 'Forbidden: brand not in your access' }, { status: 403 });
  }

  let query = supabase.from('invoices').select('*').order('generated_at', { ascending: false });
  if (status && status !== 'all') query = query.eq('status', status);
  if (brand && brand !== 'all') query = query.eq('brand', brand);
  else if (scopedSlugs) query = query.in('brand', scopedSlugs.length ? scopedSlugs : ['__none__']);
  if (month && month !== 'all') query = query.eq('period_month', month);
  if (teamMemberId && teamMemberId !== 'all') query = query.eq('team_member_id', teamMemberId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ invoices: data ?? [] });
}

interface PostBody {
  brand?: string;
  month?: string; // YYYY-MM
  team_member_id?: string; // who's issuing the invoice; defaults to first team member
}

export async function POST(req: NextRequest) {
  const scope = await getWorkspaceScope();
  if (!scope) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!scope.canViewFinance) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const scopedSlugs = scope.brandScope.kind === 'scoped' ? scope.brandScope.brandSlugs : null;

  let body: PostBody;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { brand, month, team_member_id: teamMemberIdFromBody } = body;
  if (!brand) return NextResponse.json({ error: 'brand is required' }, { status: 400 });
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'month is required (YYYY-MM)' }, { status: 400 });
  }
  // A manager may only generate invoices for their own brands.
  if (scopedSlugs && !scopedSlugs.includes(brand)) {
    return NextResponse.json({ error: 'Forbidden: brand not in your access' }, { status: 403 });
  }

  const supabase = await createAdminClient();

  // The generation core (earnings lookup → duplicate check → line items →
  // number-retry insert → ledger freeze) lives in the shared module so the
  // monthly run executes the exact same path. Responses map 1:1 to what this
  // route returned before the extraction.
  const result = await createInvoiceForBrand({
    brand,
    month,
    teamMemberId: teamMemberIdFromBody,
    scopedSlugs,
    adminClient: supabase,
    createdBy: scope.email ?? null,
  });

  if (!result.ok) {
    if (result.duplicate && result.existing) {
      return NextResponse.json({ error: result.error, existing: result.existing }, { status: 409 });
    }
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(
    result.ledgerError ? { invoice: result.invoice, ledgerError: result.ledgerError } : { invoice: result.invoice },
    { status: 201 },
  );
}
