import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') || 'pending';
  const guildId = searchParams.get('guild_id');
  const matchType = searchParams.get('match_type');

  const supabase = getSupabase();

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

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Also get summary stats
  const { data: allData } = await supabase
    .from('discord_match_queue')
    .select('status, match_type')
    .eq(guildId ? 'guild_id' : 'id', guildId || '');

  // Get stats with a separate simpler query
  const { count: totalCount } = await supabase
    .from('discord_match_queue')
    .select('*', { count: 'exact', head: true });

  const { count: pendingCount } = await supabase
    .from('discord_match_queue')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending');

  const { count: exactCount } = await supabase
    .from('discord_match_queue')
    .select('*', { count: 'exact', head: true })
    .eq('match_type', 'exact');

  const { count: fuzzyCount } = await supabase
    .from('discord_match_queue')
    .select('*', { count: 'exact', head: true })
    .eq('match_type', 'fuzzy');

  return NextResponse.json({
    entries: data,
    stats: {
      total: totalCount ?? 0,
      pending: pendingCount ?? 0,
      exact: exactCount ?? 0,
      fuzzy: fuzzyCount ?? 0,
    },
  });
}
