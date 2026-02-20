import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function GET() {
  const checks: Record<string, unknown> = {};

  // Check env vars
  checks.hasUrl = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
  checks.hasAnonKey = !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  checks.hasServiceKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  checks.url = process.env.NEXT_PUBLIC_SUPABASE_URL?.slice(0, 30) + '...';

  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        cookies: {
          getAll() { return []; },
          setAll() {},
        },
      }
    );

    const { data, error } = await supabase.rpc('get_brand_summary', {
      p_brand: 'jiyu',
      p_start_date: '2026-02-10',
      p_end_date: '2026-02-16',
    });

    checks.rpcError = error?.message ?? null;
    checks.rpcData = data;

    // Check creator rankings shape
    const { data: cData, error: cErr } = await supabase.rpc('get_creator_rankings', {
      p_brand: 'jiyu',
      p_start_date: '2026-02-10',
      p_end_date: '2026-02-16',
      p_limit: 2,
      p_managed_only: false,
    });
    checks.creatorError = cErr?.message ?? null;
    checks.creatorSample = cData?.[0] ?? null;
  } catch (err: unknown) {
    checks.exception = err instanceof Error ? err.message : String(err);
  }

  return NextResponse.json(checks);
}
