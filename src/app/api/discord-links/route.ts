import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import { createAdminClient } from '@/lib/supabase/server';

interface CountRow {
  status: string;
  match_type: string | null;
}

export async function GET(request: Request) {
  const profile = await requireAdmin();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') ?? 'pending';
  const brandSlug = searchParams.get('brand');
  const matchType = searchParams.get('match_type');
  const source = searchParams.get('source');

  const supabase = await createAdminClient();

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

  // Single query for all counts — pull (status, match_type) for the brand
  // scope and tally in JS. Faster than 6 round-trips and small enough that
  // we don't need to paginate (queue is at most a few thousand rows).
  let countQuery = supabase
    .from('pending_creator_links')
    .select('status, match_type');
  if (brandId) countQuery = countQuery.eq('brand_id', brandId);

  const [listResult, countResult] = await Promise.all([query, countQuery]);

  if (listResult.error) {
    return NextResponse.json({ error: listResult.error.message }, { status: 500 });
  }
  if (countResult.error) {
    return NextResponse.json({ error: countResult.error.message }, { status: 500 });
  }

  const counts = { pending: 0, approved: 0, rejected: 0, exact: 0, fuzzy: 0, unmatched: 0 };
  for (const row of (countResult.data ?? []) as CountRow[]) {
    if (row.status === 'pending') {
      counts.pending++;
      if (row.match_type === 'exact') counts.exact++;
      else if (row.match_type === 'fuzzy') counts.fuzzy++;
      else if (row.match_type === 'none' || row.match_type === null) counts.unmatched++;
    } else if (row.status === 'approved') counts.approved++;
    else if (row.status === 'rejected') counts.rejected++;
  }

  return NextResponse.json({
    entries: listResult.data ?? [],
    counts,
  });
}
