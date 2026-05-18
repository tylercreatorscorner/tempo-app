/**
 * /api/invoices
 *
 * GET  — list invoices with optional filters (status, brand, month)
 * POST — generate an invoice from a brand's earnings for a given month
 */
import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { createAdminClient } from '@/lib/supabase/server';
import { getEarnings } from '@/lib/data/earnings';
import { DEFAULT_PAYMENT_INSTRUCTIONS } from '@/lib/invoices/defaults';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const scope = await getWorkspaceScope();
  if (!scope) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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

  // Compute earnings for THIS team member's compensation arrangements
  // (brand-scoped for managers so cross-brand earnings can't leak in).
  const earnings = await getEarnings(month, teamMemberIdFromBody, scopedSlugs);
  const teamMemberId = earnings.teamMember?.id ?? null;
  if (!teamMemberId) {
    return NextResponse.json({ error: 'No team member configured — add one in Settings → Team Members' }, { status: 400 });
  }

  const row = earnings.brands.find((b) => b.brand === brand);
  if (!row) {
    return NextResponse.json({ error: `Brand "${brand}" not found in earnings for ${month}` }, { status: 404 });
  }

  // Reject if an invoice already exists for this (brand, period, team_member).
  // The unique index allows different team members to invoice the same brand
  // for the same month — which is the whole point.
  const { data: existing } = await supabase
    .from('invoices')
    .select('id, invoice_number, status')
    .eq('brand', brand)
    .eq('period_month', month)
    .eq('team_member_id', teamMemberId)
    .maybeSingle();
  if (existing) {
    return NextResponse.json(
      { error: `Invoice already exists for ${brand} ${month} (${earnings.teamMember?.name}): ${existing.invoice_number}`, existing },
      { status: 409 },
    );
  }

  // Pull bill-to (brand-level: who at the brand pays) from brand_settings.
  const { data: settings } = await supabase
    .from('brand_settings')
    .select('bill_to_name, bill_to_email, bill_to_address')
    .eq('brand', brand)
    .maybeSingle();

  // Generate sequential invoice number for this month (TEMPO-YYYY-MM-{N}).
  const { count } = await supabase
    .from('invoices')
    .select('*', { count: 'exact', head: true })
    .eq('period_month', month);
  const seq = String((count ?? 0) + 1).padStart(3, '0');
  const invoiceNumber = `TEMPO-${month}-${seq}`;

  // Default due date: 30 days from now.
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 30);
  const dueDateIso = dueDate.toISOString().split('T')[0];

  const insertRow = {
    invoice_number: invoiceNumber,
    brand,
    period_month: month,
    team_member_id: teamMemberId,
    affiliate_gmv: row.affiliateGmv,
    marketing_gmv: row.marketingGmv,
    total_gmv: row.totalGmv,
    commission: row.commission,
    retainer: row.retainer,
    product_retainer: row.productRetainer,
    launch_fee: row.launchFee,
    total_amount: row.total,
    status: 'pending',
    due_date: dueDateIso,
    bill_to_name: settings?.bill_to_name ?? null,
    bill_to_email: settings?.bill_to_email ?? null,
    bill_to_address: settings?.bill_to_address ?? null,
    // Snapshot bill-FROM (the team member who's invoicing) at creation time
    // so future edits to their profile don't change historical invoices.
    bill_from_name: earnings.teamMember?.name ?? null,
    bill_from_email: earnings.teamMember?.email ?? null,
    bill_from_address: earnings.teamMember?.address ?? null,
    payment_instructions: earnings.teamMember?.paymentInstructions ?? DEFAULT_PAYMENT_INSTRUCTIONS,
    creator_breakdown: row.creators,
    created_by: scope.email ?? null,
  };

  const { data: created, error } = await supabase
    .from('invoices')
    .insert(insertRow)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ invoice: created }, { status: 201 });
}
