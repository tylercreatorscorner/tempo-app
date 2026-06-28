import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/require-admin'

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  // System-wide ops data (pipeline runs, alerts, sessions across all brands) —
  // owner/admin only. The status footer + /system pages are already admin-only;
  // this gates the API so non-admin workspace users can't pull it directly.
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  try {
    // Brand sessions
    const { data: sessions } = await supabase
      .from('brand_sessions')
      .select('*')
      .order('brand_slug')

    // Recent pipeline runs (last 50)
    const { data: recentRuns } = await supabase
      .from('pipeline_runs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)

    // Unacknowledged alerts
    const { data: alerts } = await supabase
      .from('system_alerts')
      .select('*')
      .eq('acknowledged', false)
      .order('created_at', { ascending: false })
      .limit(20)

    // Data freshness view
    const { data: freshness } = await supabase
      .from('data_freshness')
      .select('*')

    // Pipeline stats (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()
    const { data: weekRuns } = await supabase
      .from('pipeline_runs')
      .select('*')
      .gte('created_at', sevenDaysAgo)

    const stats = {
      totalRuns: weekRuns?.length || 0,
      successful: weekRuns?.filter(r => r.status === 'success').length || 0,
      failed: weekRuns?.filter(r => r.status === 'failed').length || 0,
      avgDuration: weekRuns?.filter(r => r.duration_seconds)
        .reduce((sum, r) => sum + r.duration_seconds, 0) / (weekRuns?.filter(r => r.duration_seconds).length || 1),
    }

    return NextResponse.json({
      sessions: sessions || [],
      recentRuns: recentRuns || [],
      alerts: alerts || [],
      freshness: freshness || [],
      stats
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Acknowledge an alert
export async function PATCH(request: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  try {
    const { alertId } = await request.json()
    
    const { error } = await supabase
      .from('system_alerts')
      .update({ 
        acknowledged: true, 
        acknowledged_at: new Date().toISOString(),
        acknowledged_by: 'admin'
      })
      .eq('id', alertId)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
