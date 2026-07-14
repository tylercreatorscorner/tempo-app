'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, RefreshCw } from 'lucide-react'

// ── Types ───────────────────────────────────────────────────────────
interface PipelineRun {
  id: string
  brand_slug: string
  run_date: string
  status: string
  started_at: string | null
  completed_at: string | null
  duration_seconds: number | null
  creators_scraped: number | null
  products_scraped: number | null
  videos_scraped: number | null
  all_videos_exported: number | null
  creator_gmv: number | null
  product_gmv: number | null
  video_gmv: number | null
  validation_status: string | null
  error_message: string | null
  created_at: string
}

interface BrandSession {
  id: string
  brand_slug: string
  status: string
  cookie_set_at: string | null
  cookie_expires_at: string | null
  last_health_check: string | null
  last_successful_scrape: string | null
}

interface Stats {
  totalRuns: number
  successful: number
  failed: number
  outages: number
  avgDuration: number
}

// ── Constants ───────────────────────────────────────────────────────
const BRAND_LABELS: Record<string, string> = {
  jiyu: 'JiYu',
  catakor: 'Cata-Kor',
  physicians_choice: 'Physicians Choice',
}
const BRAND_COLORS: Record<string, string> = {
  jiyu: 'var(--primary)',
  catakor: '#7B2FBE',
  physicians_choice: '#3B82F6',
}
const BRANDS = ['jiyu', 'catakor', 'physicians_choice']

// ── Helpers ─────────────────────────────────────────────────────────
function fmt$(n: number | null) {
  if (n == null) return '—'
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtNum(n: number | null) {
  if (n == null) return '—'
  return Number(n).toLocaleString()
}
function fmtDuration(s: number | null) {
  if (!s) return '—'
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`
}
function fmtTime(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    timeZone: 'America/Chicago',
  })
}
function daysAgo(iso: string | null) {
  if (!iso) return null
  return Math.round((Date.now() - new Date(iso).getTime()) / 86400000 * 10) / 10
}

// ── Component ───────────────────────────────────────────────────────
export default function PipelineMonitorPage() {
  const [runs, setRuns] = useState<PipelineRun[]>([])
  const [latest, setLatest] = useState<Record<string, PipelineRun | null>>({})
  const [sessions, setSessions] = useState<BrandSession[]>([])
  const [stats, setStats] = useState<Stats>({ totalRuns: 0, successful: 0, failed: 0, outages: 0, avgDuration: 0 })
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date())

  async function fetchData() {
    setLoading(true)
    try {
      const res = await fetch('/api/system/pipeline')
      const data = await res.json()
      setRuns(data.runs || [])
      setLatest(data.latest || {})
      setSessions(data.sessions || [])
      setStats(data.stats || { totalRuns: 0, successful: 0, failed: 0, outages: 0, avgDuration: 0 })
      setLastUpdated(new Date())
    } catch (e) {
      console.error('Failed to fetch pipeline data:', e)
    }
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])
  useEffect(() => {
    const interval = setInterval(fetchData, 60000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="min-h-screen" style={{ background: '#0f0f14', color: '#e2e2e8' }}>
      {/* Header */}
      <header className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid #262636' }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, var(--primary), #7B2FBE)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          </div>
          <h1 className="text-xl font-bold"
            style={{ background: 'linear-gradient(135deg, var(--primary), #7B2FBE)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Pipeline Monitor
          </h1>
        </div>
        <div className="flex items-center gap-4 text-sm" style={{ color: '#71717a' }}>
          <Link href="/system" className="flex items-center gap-1.5 hover:text-white transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" />
            System Health
          </Link>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" style={{ animation: 'pulse 2s ease-in-out infinite' }} />
            Auto-refresh
          </span>
          <span>{lastUpdated.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}</span>
          <button onClick={fetchData} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors hover:text-white"
            style={{ border: '1px solid #262636', background: '#16161e' }}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Runs (7d)" value={stats.totalRuns.toString()} />
          <StatCard label="Success Rate"
            value={stats.totalRuns > 0 ? `${Math.round((stats.successful / stats.totalRuns) * 100)}%` : '—'} />
          <StatCard label="Failures" value={stats.failed.toString()} warn={stats.failed > 0} />
          <StatCard label="Avg Duration" value={stats.avgDuration > 0 ? fmtDuration(stats.avgDuration) : '—'} />
        </div>

        {/* Session Health */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: '#71717a' }}>
            Session Health
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {BRANDS.map(brand => {
              const session = sessions.find(s => s.brand_slug === brand)
              const age = session?.cookie_set_at ? daysAgo(session.cookie_set_at) : null
              const status = !session ? 'missing' : session.status === 'active' ? 'healthy'
                : session.status === 'expiring' ? 'aging' : 'expired'
              return (
                <div key={brand} className="rounded-xl p-4 flex items-center justify-between"
                  style={{ background: '#16161e', border: '1px solid #262636' }}>
                  <div>
                    <div className="font-semibold text-sm">{BRAND_LABELS[brand]}</div>
                    <div className="text-xs mt-1" style={{ color: '#71717a' }}>
                      {session ? `Updated ${age}d ago` : 'No session data'}
                    </div>
                  </div>
                  <StatusBadge status={status} />
                </div>
              )
            })}
          </div>
        </section>

        {/* Brand Cards */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: '#71717a' }}>
            Latest Runs
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {BRANDS.map(brand => {
              const run = latest[brand]
              if (!run) return (
                <div key={brand} className="rounded-xl p-5" style={{ background: '#16161e', border: '1px solid #262636' }}>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-3 h-3 rounded-full" style={{ background: BRAND_COLORS[brand] }} />
                    <span className="font-semibold">{BRAND_LABELS[brand]}</span>
                  </div>
                  <p className="text-sm" style={{ color: '#71717a' }}>No data available</p>
                </div>
              )

              const maxGmv = Math.max(run.creator_gmv || 0, run.product_gmv || 0, run.video_gmv || 0, 1)

              return (
                <div key={brand} className="rounded-xl p-5" style={{ background: '#16161e', border: '1px solid #262636' }}>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ background: BRAND_COLORS[brand] }} />
                      <span className="font-semibold">{BRAND_LABELS[brand]}</span>
                    </div>
                    <span className="text-xs" style={{ color: '#71717a' }}>{run.run_date}</span>
                  </div>

                  {/* Counts Grid */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <CountStat label="Creators" value={fmtNum(run.creators_scraped)} />
                    <CountStat label="Products" value={fmtNum(run.products_scraped)} />
                    <CountStat label="TA Videos" value={fmtNum(run.videos_scraped)} />
                    <CountStat label="Duration" value={fmtDuration(run.duration_seconds)} />
                  </div>

                  {/* GMV Bars */}
                  <div>
                    <div className="text-xs uppercase tracking-wider mb-2" style={{ color: '#71717a' }}>
                      GMV Comparison
                    </div>
                    <GmvBar label="Creator" value={run.creator_gmv || 0} max={maxGmv} color="#6ee7b7" />
                    <GmvBar label="Product" value={run.product_gmv || 0} max={maxGmv} color="var(--primary)" />
                    <GmvBar label="Video" value={run.video_gmv || 0} max={maxGmv} color="#818cf8" />
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* Pipeline Runs Table */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: '#71717a' }}>
            Pipeline Runs
          </h2>
          <div className="rounded-xl overflow-x-auto" style={{ background: '#16161e', border: '1px solid #262636' }}>
            <table className="w-full" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Brand', 'Date', 'Status', 'Duration', 'Creators', 'Creator GMV', 'Product GMV', 'Video GMV', 'Validation', 'Scraped At'].map(h => (
                    <th key={h} className="text-left text-xs uppercase tracking-wider font-medium px-3 py-2.5"
                      style={{ color: '#71717a', borderBottom: '1px solid #262636' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {runs.length === 0 && (
                  <tr>
                    <td colSpan={10} className="text-center py-8" style={{ color: '#71717a' }}>
                      {loading ? 'Loading...' : 'No pipeline runs found'}
                    </td>
                  </tr>
                )}
                {runs.map(run => {
                  const cGmv = run.creator_gmv || 0
                  const pGmv = run.product_gmv || 0
                  const gmvWarn = pGmv > 0 && cGmv / pGmv > 1.15

                  return (
                    <tr key={run.id} className="transition-colors" style={{ borderBottom: '1px solid #1e1e2a' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#1a1a24')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <td className="px-3 py-2.5 text-sm">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ background: BRAND_COLORS[run.brand_slug] || '#666' }} />
                          {BRAND_LABELS[run.brand_slug] || run.brand_slug}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-xs font-mono">{run.run_date}</td>
                      <td className="px-3 py-2.5"><RunStatusBadge status={run.status} /></td>
                      <td className="px-3 py-2.5 text-sm">{fmtDuration(run.duration_seconds)}</td>
                      <td className="px-3 py-2.5 text-sm">{fmtNum(run.creators_scraped)}</td>
                      <td className="px-3 py-2.5 text-sm" style={gmvWarn ? { color: '#fcd34d' } : undefined}>
                        {fmt$(run.creator_gmv)}
                      </td>
                      <td className="px-3 py-2.5 text-sm">{fmt$(run.product_gmv)}</td>
                      <td className="px-3 py-2.5 text-sm">{fmt$(run.video_gmv)}</td>
                      <td className="px-3 py-2.5"><ValidationBadge status={run.validation_status} /></td>
                      <td className="px-3 py-2.5 text-xs" style={{ color: '#71717a' }}>{fmtTime(run.created_at)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      <style jsx global>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────────
function StatCard({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-xl p-4" style={{ background: '#16161e', border: '1px solid #262636' }}>
      <div className="text-xs mb-1" style={{ color: '#71717a' }}>{label}</div>
      <div className={`text-2xl font-bold ${warn ? 'text-red-400' : ''}`}>{value}</div>
    </div>
  )
}

function CountStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs" style={{ color: '#71717a' }}>{label}</div>
      <div className="text-lg font-bold">{value}</div>
    </div>
  )
}

function GmvBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = Math.round((value / max) * 100)
  return (
    <div className="flex items-center justify-between text-xs mb-1.5">
      <span className="w-16" style={{ color: '#a1a1aa' }}>{label}</span>
      <div className="flex-1 mx-2 h-1.5 rounded-full overflow-hidden" style={{ background: '#262636' }}>
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="font-mono w-24 text-right">{fmt$(value)}</span>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    healthy: 'bg-emerald-900/60 text-emerald-300',
    aging: 'bg-amber-900/60 text-amber-300',
    expired: 'bg-red-900/60 text-red-300',
    missing: 'bg-zinc-800 text-zinc-400',
  }
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider ${styles[status] || styles.missing}`}>
      {status}
    </span>
  )
}

function RunStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    success: 'bg-emerald-900/60 text-emerald-300',
    failed: 'bg-red-900/60 text-red-300',
    data_outage: 'bg-amber-900/60 text-amber-300',
    running: 'bg-blue-900/60 text-blue-300',
  }
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider ${styles[status] || 'bg-zinc-800 text-zinc-400'}`}>
      {status === 'data_outage' ? 'outage' : status}
    </span>
  )
}

function ValidationBadge({ status }: { status: string | null }) {
  if (!status) return <span style={{ color: '#3f3f46' }}>—</span>
  const styles: Record<string, string> = {
    PASSED: 'bg-emerald-900/60 text-emerald-300',
    FAILED: 'bg-red-900/60 text-red-300',
    WARN: 'bg-amber-900/60 text-amber-300',
    ERROR: 'bg-red-900/60 text-red-300',
  }
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider ${styles[status] || 'bg-zinc-800 text-zinc-400'}`}>
      {status}
    </span>
  )
}
