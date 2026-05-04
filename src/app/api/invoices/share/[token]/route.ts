/**
 * GET /api/invoices/share/[token]
 *
 * Public, no-auth read of an invoice via its share token. Returns the
 * invoice plus the resolved brand display name. Used by the public
 * /share/invoice/[token] page.
 *
 * Returns 404 if the token doesn't match any invoice. Voided invoices
 * are still readable so brands can see disposition.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!token || typeof token !== 'string' || token.length < 8) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
  }

  const supabase = await createAdminClient();

  const { data: invoice, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('public_token', token)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Resolve brand display name
  const { data: brandRow } = await supabase
    .from('brands_v2')
    .select('name')
    .eq('slug', invoice.brand)
    .maybeSingle();

  return NextResponse.json({
    invoice,
    brandName: brandRow?.name ?? invoice.brand,
  });
}
