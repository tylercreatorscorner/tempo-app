import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') ?? 'pending';
  const brandSlug = searchParams.get('brand');
  const matchType = searchParams.get('match_type');
  const source = searchParams.get('source');

  const supabase = getSupabase();

  // Resolve brand slug → UUID if filter provided
  let brandId: string | null = null;
  if (brandSlug) {
    const { data: brandRow } = await supabase
      .from('brands_v2')
      .select('id')
      .eq('slug', brandSlug)
      .maybeSingle();
    brandId = brandRow?.id ?? null;
  }

  let query = supabase
    .from('pending_creator_links')
    .select(
      `
      id, brand_id, guild_id, discord_user_id, discord_username, discord_display_name,
      discord_avatar_url, requested_handle, matched_creator_id, match_type, match_confidence,
      match_reason, source, status, notes, reviewed_by, reviewed_at, created_at,
      brand:brands_v2!inner ( slug, display_name, name, color ),
      creator:creators_v2 ( id, real_name, discord_username )
    `,
    )
    .order('match_type', { ascending: true })
    .order('match_confidence', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (status !== 'all') query = query.eq('status', status);
  if (brandId) query = query.eq('brand_id', brandId);
  if (matchType) query = query.eq('match_type', matchType);
  if (source) query = query.eq('source', source);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Counts (always brand-scoped if brand specified)
  const baseCountQuery = () => {
    let q = supabase
      .from('pending_creator_links')
      .select('*', { count: 'exact', head: true });
    if (brandId) q = q.eq('brand_id', brandId);
    return q;
  };

  const [pending, approved, rejected, exact, fuzzy, unmatched] = await Promise.all([
    baseCountQuery().eq('status', 'pending'),
    baseCountQuery().eq('status', 'approved'),
    baseCountQuery().eq('status', 'rejected'),
    baseCountQuery().eq('status', 'pending').eq('match_type', 'exact'),
    baseCountQuery().eq('status', 'pending').eq('match_type', 'fuzzy'),
    baseCountQuery().eq('status', 'pending').eq('match_type', 'none'),
  ]);

  return NextResponse.json({
    entries: data ?? [],
    counts: {
      pending: pending.count ?? 0,
      approved: approved.count ?? 0,
      rejected: rejected.count ?? 0,
      exact: exact.count ?? 0,
      fuzzy: fuzzy.count ?? 0,
      unmatched: unmatched.count ?? 0,
    },
  });
}
