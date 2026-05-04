/**
 * /api/creator-rates
 *
 * Per-creator commission rate overrides — these win over the brand's default
 * commission rate for a specific creator on a specific brand.
 *
 * GET    ?brand=<slug>       — list overrides for that brand (or all if omitted)
 * POST   { brand, creator_name, rate }   — upsert (rate is percent, e.g. 6 for 6%)
 * DELETE { brand, creator_name }         — remove
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import { createAdminClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

function normalizeHandle(h: string): string {
  return h.replace(/^@/, '').trim().toLowerCase();
}

export async function GET(req: NextRequest) {
  const profile = await requireAdmin();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const supabase = await createAdminClient();
  const brand = req.nextUrl.searchParams.get('brand');

  let query = supabase
    .from('creator_commission_rates')
    .select('id, creator_name, brand, rate, created_at, updated_at')
    .order('created_at', { ascending: false });
  if (brand) query = query.eq('brand', brand);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // When a brand is specified, also return its managed creators so the UI
  // picker can show available creators without a second round-trip.
  let managed: Array<{ handle: string; real_name: string | null }> = [];
  if (brand) {
    const { data: rosterRows } = await supabase
      .from('managed_creators')
      .select('real_name, account_1, account_2, account_3, account_4, account_5')
      .eq('brand', brand);
    const seen = new Set<string>();
    for (const r of (rosterRows as Array<Record<string, string | null>> | null ?? [])) {
      for (const k of ['account_1', 'account_2', 'account_3', 'account_4', 'account_5'] as const) {
        const raw = r[k];
        if (!raw) continue;
        const handle = normalizeHandle(raw);
        if (!handle || seen.has(handle)) continue;
        seen.add(handle);
        managed.push({ handle, real_name: r.real_name ?? null });
      }
    }
    managed = managed.sort((a, b) => a.handle.localeCompare(b.handle));
  }

  return NextResponse.json({ overrides: data ?? [], managed });
}

export async function POST(req: NextRequest) {
  const profile = await requireAdmin();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: { brand?: unknown; creator_name?: unknown; rate?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { brand, creator_name, rate } = body;
  if (typeof brand !== 'string' || !brand.trim()) {
    return NextResponse.json({ error: 'brand required' }, { status: 400 });
  }
  if (typeof creator_name !== 'string' || !creator_name.trim()) {
    return NextResponse.json({ error: 'creator_name required' }, { status: 400 });
  }
  const rateNum = typeof rate === 'number' ? rate : parseFloat(String(rate));
  if (!Number.isFinite(rateNum) || rateNum < 0 || rateNum > 100) {
    return NextResponse.json({ error: 'rate must be a number between 0 and 100 (percent)' }, { status: 400 });
  }

  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from('creator_commission_rates')
    .upsert(
      { creator_name: normalizeHandle(creator_name), brand, rate: rateNum, updated_at: new Date().toISOString() },
      { onConflict: 'creator_name,brand' },
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ override: data }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const profile = await requireAdmin();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: { brand?: unknown; creator_name?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { brand, creator_name } = body;
  if (typeof brand !== 'string' || typeof creator_name !== 'string') {
    return NextResponse.json({ error: 'brand and creator_name required' }, { status: 400 });
  }

  const supabase = await createAdminClient();
  const { error } = await supabase
    .from('creator_commission_rates')
    .delete()
    .eq('brand', brand)
    .eq('creator_name', normalizeHandle(creator_name));

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
