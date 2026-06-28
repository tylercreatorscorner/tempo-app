import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/require-admin'

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BRANDS = ['jiyu', 'catakor', 'physicians_choice']

export async function GET() {
  // System-wide pipeline ops — owner/admin only (consumed by the admin /system pages).
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  try {
    // All recent pipeline runs (last 60)
    const { data: runs } = await supabase
      .from('pipeline_runs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(60)

    // Latest successful run per brand (for brand cards)
    const latest: Record<string, any> = {}
    for (const brand of BRANDS) {
      const { data } = await supabase
        .from('pipeline_runs')
        .select('*')
        .eq('brand_slug', brand)
        .eq('status', 'success')
        .order('run_date', { ascending: false })
        .limit(1)
      latest[brand] = data?.[0] || null
    }

    // Brand sessions (cookie health)
    const { data: sessions } = await supabase
      .from('brand_sessions')
      .select('*')
      .order('brand_slug')

    // 7-day stats
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()
    const { data: weekRuns } = await supabase
      .from('pipeline_runs')
      .select('*')
      .gte('created_at', sevenDaysAgo)

    const successful = weekRuns?.filter(r => r.status === 'success') || []
    const stats = {
      totalRuns: weekRuns?.length || 0,
      successful: successful.length,
      failed: weekRuns?.filter(r => r.status === 'failed').length || 0,
      outages: weekRuns?.filter(r => r.status === 'data_outage').length || 0,
      avgDuration: successful.length > 0
        ? Math.round(successful.reduce((s, r) => s + (r.duration_seconds || 0), 0) / successful.length)
        : 0,
    }

    return NextResponse.json({ runs: runs || [], latest, sessions: sessions || [], stats })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
