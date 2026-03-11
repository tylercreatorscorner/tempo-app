'use client'

import { useEffect, useState } from 'react'
import { Activity, AlertTriangle, CheckCircle, Clock, Database, RefreshCw, Shield, XCircle, BarChart3 } from 'lucide-react'
import Link from 'next/link'

interface BrandSession {
  id: string
  brand_slug: string
  status: string
  cookie_set_at: string | null
  cookie_expires_at: string | null
  last_health_check: string | null
  last_health_status: string | null
  last_successful_scrape: string | null
  consecutive_failures: number
}

interface PipelineRun {
  id: string
  brand_slug: string
  run_date: string
  status: string
  started_at: string
  completed_at: string | null
  duration_seconds: number | null
  creators_scraped: number
  products_scraped: number
  videos_scraped: number
  all_videos_exported: number
  error_message: string | null
  error_stage: string | null
}

interface SystemAlert {
  id: string
  alert_type: string
  severity: string
  brand_slug: string
  title: string
  message: string
  acknowledged: boolean
  created_at: string
}

interface Freshness {
  brand_slug: string
  session_status: string
  hours_since_last_scrape: number | null
  days_until_expiry: number | null
  freshness: string
  last_data_date: string | null
  last_creators: number | null
  last_videos: number | null
}

interface Stats {
  totalRuns: number
  successful: number
  failed: number
  avgDuration: number
}

function timeAgo(date: string | null) {
  if (!date) return 'Never'
  const diff = Date.now() - new Date(date).getTime()
  const hours = Math.floor(diff / 3600000)
  if (hours < 1) return `${Math.floor(diff / 60000)}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function daysLeft(date: string | null) {
  if (!date) return null
  const diff = (new Date(date).getTime() - Date.now()) / 86400000
  return Math.round(diff)
}

const statusColors: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  expiring: 'bg-amber-100 text-amber-700',
  expired: 'bg-red-100 text-red-700',
  error: 'bg-red-100 text-red-700',
  healthy: 'bg-emerald-100 text-emerald-700',
  degraded: 'bg-amber-100 text-amber-700',
  success: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-red-100 text-red-700',
  running: 'bg-blue-100 text-blue-700',
  partial: 'bg-amber-100 text-amber-700',
  fresh: 'text-emerald-600',
  recent: 'text-blue-600',
  stale: 'text-amber-600',
  critical: 'text-red-600',
  no_data: 'text-gray-400',
}

const severityColors: Record<string, string> = {
  info: 'border-l-blue-400 bg-blue-50',
  warning: 'border-l-amber-400 bg-amber-50',
  critical: 'border-l-red-400 bg-red-50',
}

export default function SystemHealthPage() {
  const [sessions, setSessions] = useState<BrandSession[]>([])
  const [runs, setRuns] = useState<PipelineRun[]>([])
  const [alerts, setAlerts] = useState<SystemAlert[]>([])
  const [freshness, setFreshness] = useState<Freshness[]>([])
  const [stats, setStats] = useState<Stats>({ totalRuns: 0, successful: 0, failed: 0, avgDuration: 0 })
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

  async function fetchData() {
    setLoading(true)
    try {
      const res = await fetch('/api/system/health')
      const data = await res.json()
      setSessions(data.sessions || [])
      setRuns(data.recentRuns || [])
      setAlerts(data.alerts || [])
      setFreshness(data.freshness || [])
      setStats(data.stats || { totalRuns: 0, successful: 0, failed: 0, avgDuration: 0 })
      setLastRefresh(new Date())
    } catch (e) {
      console.error('Failed to fetch health data:', e)
    }
    setLoading(false)
  }

  async function acknowledgeAlert(id: string) {
    await fetch('/api/system/health', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alertId: id })
    })
    setAlerts(prev => prev.filter(a => a.id !== id))
  }

  useEffect(() => { fetchData() }, [])

  // Auto-refresh every 60s
  useEffect(() => {
    const interval = setInterval(fetchData, 60000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Shield className="w-6 h-6 text-indigo-600" />
              System Health
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Pipeline monitoring, session health, and alerts
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/system/pipeline"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 border border-indigo-200 rounded-lg text-sm text-indigo-700 hover:bg-indigo-100 transition-colors"
            >
              <BarChart3 className="w-3.5 h-3.5" />
              Pipeline Monitor
            </Link>
            <span className="text-xs text-gray-400">
              Updated {lastRefresh.toLocaleTimeString()}
            </span>
            <button
              onClick={fetchData}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Alerts Banner */}
        {alerts.length > 0 && (
          <div className="space-y-2">
            {alerts.map(alert => (
              <div key={alert.id} className={`border-l-4 p-4 rounded-r-lg ${severityColors[alert.severity] || 'bg-gray-50'}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-gray-900">{alert.title}</p>
                    <p className="text-sm text-gray-600 mt-1">{alert.message}</p>
                    <p className="text-xs text-gray-400 mt-1">{new Date(alert.created_at).toLocaleString()}</p>
                  </div>
                  <button
                    onClick={() => acknowledgeAlert(alert.id)}
                    className="text-xs px-2 py-1 bg-white border rounded hover:bg-gray-50"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
              <Activity className="w-4 h-4" />
              Runs (7d)
            </div>
            <p className="text-2xl font-bold text-gray-900">{stats.totalRuns}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
              <CheckCircle className="w-4 h-4 text-emerald-500" />
              Success Rate
            </div>
            <p className="text-2xl font-bold text-gray-900">
              {stats.totalRuns > 0 ? Math.round((stats.successful / stats.totalRuns) * 100) : 0}%
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
              <XCircle className="w-4 h-4 text-red-500" />
              Failures (7d)
            </div>
            <p className="text-2xl font-bold text-gray-900">{stats.failed}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
              <Clock className="w-4 h-4" />
              Avg Duration
            </div>
            <p className="text-2xl font-bold text-gray-900">
              {stats.avgDuration > 0 ? `${Math.round(stats.avgDuration)}s` : '--'}
            </p>
          </div>
        </div>

        {/* Brand Session Cards */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Database className="w-5 h-5 text-indigo-600" />
            Brand Sessions
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {sessions.length === 0 && !loading && (
              <p className="text-gray-400 text-sm col-span-4">No brand sessions configured yet. Run the health check to populate.</p>
            )}
            {sessions.map(session => {
              const days = daysLeft(session.cookie_expires_at)
              const fresh = freshness.find(f => f.brand_slug === session.brand_slug)
              return (
                <div key={session.id} className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-gray-900 capitalize">{session.brand_slug.replace('_', ' ')}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[session.status] || 'bg-gray-100 text-gray-600'}`}>
                      {session.status}
                    </span>
                  </div>
                  
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Session Expiry</span>
                      <span className={`font-medium ${days !== null && days < 14 ? 'text-amber-600' : days !== null && days < 3 ? 'text-red-600' : 'text-gray-700'}`}>
                        {days !== null ? `${days}d left` : 'Unknown'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Last Scrape</span>
                      <span className="text-gray-700">{timeAgo(session.last_successful_scrape)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Health Check</span>
                      <span className="text-gray-700">{timeAgo(session.last_health_check)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Data Freshness</span>
                      <span className={`font-medium ${statusColors[fresh?.freshness || 'no_data'] || 'text-gray-400'}`}>
                        {fresh?.freshness || 'No data'}
                      </span>
                    </div>
                    {session.consecutive_failures > 0 && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Failures</span>
                        <span className="text-red-600 font-medium">{session.consecutive_failures} consecutive</span>
                      </div>
                    )}
                  </div>

                  {/* Expiry progress bar */}
                  {days !== null && (
                    <div className="mt-3">
                      <div className="w-full bg-gray-100 rounded-full h-1.5">
                        <div
                          className={`h-1.5 rounded-full transition-all ${
                            days > 30 ? 'bg-emerald-500' : days > 14 ? 'bg-blue-500' : days > 7 ? 'bg-amber-500' : 'bg-red-500'
                          }`}
                          style={{ width: `${Math.max(0, Math.min(100, (days / 120) * 100))}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Recent Pipeline Runs */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Activity className="w-5 h-5 text-indigo-600" />
            Recent Pipeline Runs
          </h2>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left py-2.5 px-4 font-medium text-gray-500">Brand</th>
                  <th className="text-left py-2.5 px-4 font-medium text-gray-500">Data Date</th>
                  <th className="text-left py-2.5 px-4 font-medium text-gray-500">Status</th>
                  <th className="text-right py-2.5 px-4 font-medium text-gray-500">Creators</th>
                  <th className="text-right py-2.5 px-4 font-medium text-gray-500">Videos</th>
                  <th className="text-right py-2.5 px-4 font-medium text-gray-500">Duration</th>
                  <th className="text-left py-2.5 px-4 font-medium text-gray-500">Time</th>
                  <th className="text-left py-2.5 px-4 font-medium text-gray-500">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {runs.length === 0 && (
                  <tr><td colSpan={8} className="text-center py-8 text-gray-400">No pipeline runs yet</td></tr>
                )}
                {runs.map(run => (
                  <tr key={run.id} className="hover:bg-gray-50 transition-colors">
                    <td className="py-2.5 px-4 font-medium text-gray-900 capitalize">{run.brand_slug}</td>
                    <td className="py-2.5 px-4 text-gray-600">{run.run_date}</td>
                    <td className="py-2.5 px-4">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[run.status] || 'bg-gray-100'}`}>
                        {run.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-right text-gray-700">{run.creators_scraped || '--'}</td>
                    <td className="py-2.5 px-4 text-right text-gray-700">{run.videos_scraped || '--'}</td>
                    <td className="py-2.5 px-4 text-right text-gray-600">
                      {run.duration_seconds ? `${run.duration_seconds}s` : '--'}
                    </td>
                    <td className="py-2.5 px-4 text-gray-500 text-xs">{timeAgo(run.started_at)}</td>
                    <td className="py-2.5 px-4 text-red-500 text-xs truncate max-w-[200px]">
                      {run.error_message || ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
