/**
 * /api/team-members
 *
 * GET    — list active team members for the current tenant
 * POST   — create a new team member (Vic, future hires, etc.)
 *
 * Team members are who issues invoices to brands. Each has their own bill-from
 * info (name, email, address) and payment instructions. Their compensation
 * arrangements per brand live in `brand_compensation`.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import { createAdminClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

interface PostBody {
  name?: string;
  email?: string | null;
  address?: string | null;
  payment_instructions?: string | null;
}

export async function GET(req: NextRequest) {
  const profile = await requireAdmin();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const url = req.nextUrl;
  const includeArchived = url.searchParams.get('include_archived') === 'true';

  const supabase = await createAdminClient();
  let query = supabase
    .from('team_members')
    .select('id, name, email, address, payment_instructions, is_archived, created_at')
    .order('created_at', { ascending: true });
  if (!includeArchived) query = query.eq('is_archived', false);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ teamMembers: data ?? [] });
}

export async function POST(req: NextRequest) {
  const profile = await requireAdmin();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: PostBody;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from('team_members')
    .insert({
      tenant_id: profile.tenant_id,
      name: body.name.trim(),
      email: body.email ?? null,
      address: body.address ?? null,
      payment_instructions: body.payment_instructions ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ teamMember: data }, { status: 201 });
}
