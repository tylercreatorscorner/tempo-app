/**
 * /api/invoices
 *
 * GET  — list invoices with optional filters (status, brand, month)
 * POST — generate an invoice from a brand's earnings for a given month
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import { createAdminClient } from '@/lib/supabase/server';
import { getEarnings } from '@/lib/data/earnings';
import { DEFAULT_PAYMENT_INSTRUCTIONS } from '@/lib/invoices/defaults';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const profile = await requireAdmin();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const supabase = await createAdminClient();
  const url = req.nextUrl;
  const status = url.searchParams.get('status');
  const brand = url.searchParams.get('brand');
  const month = url.searchParams.get('month');

  let query = supabase.from('invoices').select('*').order('generated_at', { ascending: false });
  if (status && status !== 'all') query = query.eq('status', status);
  if (brand && brand !== 'all') query = query.eq('brand', brand);
  if (month && month !== 'all') query = query.eq('period_month', month);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ invoices: data ?? [] });
}

interface PostBody {
  brand?: string;
  month?: string; // YYYY-MM
}

export async function POST(req: NextRequest) {
  const profile = await requireAdmin();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: PostBody;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { brand, month } = body;
  if (!brand) return NextResponse.json({ error: 'brand is required' }, { status: 400 });
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'month is required (YYYY-MM)' }, { status: 400 });
  }

  const supabase = await createAdminClient();

  // Reject if an invoice already exists for this (brand, period). Unique
  // constraint also enforces this at the DB level.
  const { data: existing } = await supabase
    .from('invoices')
    .select('id, invoice_number, status')
    .eq('brand', brand)
    .eq('period_month', month)
    .maybeSingle();
  if (existing) {
    return NextResponse.json(
      { error: `Invoice already exists for ${brand} ${month}: ${existing.invoice_number}`, existing },
      { status: 409 },
    );
  }

  // Pull earnings for the month — we need the line item amounts for this brand.
  const earnings = await getEarnings(month);
  const row = earnings.brands.find((b) => b.brand === brand);
  if (!row) {
    return NextResponse.json({ error: `Brand "${brand}" not found in earnings for ${month}` }, { status: 404 });
  }

  // Pull bill-to + payment instruction defaults from brand_settings.
  const { data: settings } = await supabase
    .from('brand_settings')
    .select('bill_to_name, bill_to_email, bill_to_address, payment_instructions')
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
    payment_instructions: settings?.payment_instructions ?? DEFAULT_PAYMENT_INSTRUCTIONS,
    creator_breakdown: row.creators,
    created_by: profile.email ?? null,
  };

  const { data: created, error } = await supabase
    .from('invoices')
    .insert(insertRow)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ invoice: created }, { status: 201 });
}
