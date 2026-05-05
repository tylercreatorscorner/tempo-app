/**
 * /api/brand-compensation
 *
 * GET    — list compensation arrangements (filtered by ?brand= and/or ?team_member_id=)
 * POST   — create / upsert an arrangement (brand × team_member_id)
 *
 * One row per (brand × team_member). Drives the rev-share / retainer / launch-fee
 * math on the earnings page and the invoice generator.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import { createAdminClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

interface PostBody {
  brand?: string;
  team_member_id?: string;
  retainer?: number | null;
  product_retainer_amount?: number | null;
  product_retainer_name?: string | null;
  launch_fee?: number | null;
  launch_fee_name?: string | null;
  launch_fee_ends?: string | null;
  commission_rate?: number | null;
  revenue_share_rate?: number | null;
  marketing_commission_rate?: number | null;
  compensation_model?: string | null;
}

export async function GET(req: NextRequest) {
  const profile = await requireAdmin();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const url = req.nextUrl;
  const brand = url.searchParams.get('brand');
  const teamMemberId = url.searchParams.get('team_member_id');

  const supabase = await createAdminClient();
  let query = supabase
    .from('brand_compensation')
    .select(`
      id, brand, team_member_id,
      retainer, product_retainer_amount, product_retainer_name,
      launch_fee, launch_fee_name, launch_fee_ends,
      commission_rate, revenue_share_rate, marketing_commission_rate,
      compensation_model,
      team_members(id, name, email, is_archived)
    `)
    .order('brand');
  if (brand) query = query.eq('brand', brand);
  if (teamMemberId) query = query.eq('team_member_id', teamMemberId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ arrangements: data ?? [] });
}

export async function POST(req: NextRequest) {
  const profile = await requireAdmin();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: PostBody;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { brand, team_member_id } = body;
  if (!brand) return NextResponse.json({ error: 'brand is required' }, { status: 400 });
  if (!team_member_id) return NextResponse.json({ error: 'team_member_id is required' }, { status: 400 });

  const supabase = await createAdminClient();
  // Upsert by (brand, team_member_id, tenant_id) — composite unique key.
  const { data, error } = await supabase
    .from('brand_compensation')
    .upsert({
      tenant_id: profile.tenant_id,
      brand,
      team_member_id,
      retainer: body.retainer ?? 0,
      product_retainer_amount: body.product_retainer_amount ?? 0,
      product_retainer_name: body.product_retainer_name ?? null,
      launch_fee: body.launch_fee ?? 0,
      launch_fee_name: body.launch_fee_name ?? null,
      launch_fee_ends: body.launch_fee_ends ?? null,
      commission_rate: body.commission_rate ?? 0,
      revenue_share_rate: body.revenue_share_rate ?? 0,
      marketing_commission_rate: body.marketing_commission_rate ?? 0.02,
      compensation_model: body.compensation_model ?? 'standard',
    }, { onConflict: 'brand,team_member_id,tenant_id' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ arrangement: data }, { status: 201 });
}
