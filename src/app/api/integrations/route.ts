/**
 * /api/integrations
 *
 * GET   — unified list of every connected system, blending the new
 *         `integrations` table with legacy connections (Discord guilds,
 *         TikTok scrape sessions). Read-only.
 * POST  — create a new integration row (managed). Used when a user
 *         explicitly connects a Slack workspace, Resend account, etc.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import { createAdminClient } from '@/lib/supabase/server';
import { listIntegrations } from '@/lib/data/integrations';

export const runtime = 'nodejs';

export async function GET() {
  const profile = await requireAdmin();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const integrations = await listIntegrations();
    return NextResponse.json({ integrations });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load integrations' },
      { status: 500 },
    );
  }
}

interface PostBody {
  type?: string;
  brand_id?: string | null;
  display_name?: string | null;
  config?: Record<string, unknown>;
  credentials?: Record<string, unknown>;
}

export async function POST(req: NextRequest) {
  const profile = await requireAdmin();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: PostBody;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  if (!body.type) return NextResponse.json({ error: 'type is required' }, { status: 400 });

  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from('integrations')
    .insert({
      tenant_id: profile.tenant_id,
      brand_id: body.brand_id ?? null,
      type: body.type,
      display_name: body.display_name ?? null,
      config: body.config ?? {},
      credentials: body.credentials ?? null,
      status: 'pending', // until first successful use, the integration isn't proven
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ integration: data }, { status: 201 });
}
