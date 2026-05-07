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
  const status = searchParams.get('status') || 'pending';
  const guildId = searchParams.get('guild_id');
  const matchType = searchParams.get('match_type');

  const supabase = await createAdminClient();

  let query = supabase
    .from('discord_match_queue')
    .select('*, creator:creators_v2(id, real_name, discord_username)')
    .order('match_type', { ascending: true }) // exact first
    .order('match_confidence', { ascending: false });

  if (status && status !== 'all') {
    query = query.eq('status', status);
  }
  if (guildId) {
    query = query.eq('guild_id', guildId);
  }
  if (matchType) {
    query = query.eq('match_type', matchType);
  }

  // Single tally query (replaces 4× count round-trips).
  let statsQuery = supabase
    .from('discord_match_queue')
    .select('status, match_type');
  if (guildId) statsQuery = statsQuery.eq('guild_id', guildId);

  const [listResult, statsResult] = await Promise.all([query, statsQuery]);

  if (listResult.error) {
    return NextResponse.json({ error: listResult.error.message }, { status: 500 });
  }

  const stats = { total: 0, pending: 0, exact: 0, fuzzy: 0 };
  for (const row of (statsResult.data ?? []) as CountRow[]) {
    stats.total++;
    if (row.status === 'pending') stats.pending++;
    if (row.match_type === 'exact') stats.exact++;
    else if (row.match_type === 'fuzzy') stats.fuzzy++;
  }

  return NextResponse.json({
    entries: listResult.data,
    stats,
  });
}
