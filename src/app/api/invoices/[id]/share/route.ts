/**
 * POST /api/invoices/[id]/share
 *   - Lazily generates a public_token if one doesn't exist
 *   - Returns the token + the public share URL
 *
 * DELETE /api/invoices/[id]/share
 *   - Revokes the token (sets it to NULL); existing share URL stops working
 */
import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { requireAdmin } from '@/lib/auth/require-admin';
import { createAdminClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

function appBaseUrl(req: NextRequest): string {
  // Prefer explicit env var, fall back to request origin (works in dev + prod)
  const env = process.env.NEXT_PUBLIC_APP_URL;
  if (env) return env.replace(/\/$/, '');
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

function newToken(): string {
  // 24 random bytes → ~32 char URL-safe base64. Effectively unguessable.
  return randomBytes(24).toString('base64url');
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const profile = await requireAdmin();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await ctx.params;
  const supabase = await createAdminClient();

  const { data: invoice, error: fetchErr } = await supabase
    .from('invoices')
    .select('id, public_token')
    .eq('id', id)
    .maybeSingle();
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let token = invoice.public_token as string | null;
  if (!token) {
    token = newToken();
    const { error: updateErr } = await supabase
      .from('invoices')
      .update({ public_token: token, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  const url = `${appBaseUrl(req)}/share/invoice/${token}`;
  return NextResponse.json({ token, url });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const profile = await requireAdmin();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await ctx.params;
  const supabase = await createAdminClient();

  const { error } = await supabase
    .from('invoices')
    .update({ public_token: null, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
