'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  FileBarChart, Clipboard, Check, Loader2, ChefHat, Flame, TrendingUp,
  BarChart3, Calendar, Clock, Send, Users, Video, Hash, Trash2, Pencil,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ACTIVE_BRANDS, BRAND_DISPLAY_NAMES } from '@/lib/utils/constants';
import { useTenant } from '@/hooks/use-tenant';
import { FREQUENCIES } from '@/lib/data/schedule-frequency';

const TABS = [
  { id: 'reports',    label: 'Reports',         icon: FileBarChart },
  { id: 'generators', label: 'Post Generators', icon: Hash },
  { id: 'schedules',  label: 'Schedules',       icon: Clock },
] as const;

type TabId = typeof TABS[number]['id'];

/**
 * Hook: returns the brand options the current user is allowed to see.
 * Built from ACTIVE_BRANDS, filtered by allowed_brands (RBAC), with an "All Brands" entry
 * prepended unless the user is restricted to a single brand.
 */
function useBrandOptions() {
  const { allowedBrands } = useTenant();
  return useMemo(() => {
    const visibleSlugs = allowedBrands && allowedBrands.length > 0
      ? ACTIVE_BRANDS.filter((b) => allowedBrands.includes(b))
      : [...ACTIVE_BRANDS];
    const opts = visibleSlugs.map((slug) => ({
      value: slug,
      label: BRAND_DISPLAY_NAMES[slug] ?? slug,
    }));
    if (visibleSlugs.length === 1) return opts; // Restricted to one brand → no "All"
    return [{ value: 'all', label: 'All Brands' }, ...opts];
  }, [allowedBrands]);
}

// ── Main Page ───────────────────────────────────────────────────────
export default function ReportingPage() {
  const [activeTab, setActiveTab] = useState<TabId>('reports');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold text-[#1A1B3A]">Reporting</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          Generate reports, create Discord & Slack posts, and schedule automated updates.
        </p>
      </div>

      {/* Tab Bar — pill style matching My Creators / Analytics */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors',
              activeTab === id
                ? 'bg-white text-[#1A1B3A] shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'reports'    && <ReportsTab />}
      {activeTab === 'generators' && <PostGeneratorsTab />}
      {activeTab === 'schedules'  && <SchedulesTab />}
    </div>
  );
}

// ── Reports Tab ─────────────────────────────────────────────────────
function ReportsTab() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
      <ReportCard
        title="Performance Summary"
        description="Weekly or monthly overview of GMV, top creators, top videos, and trends across brands."
        icon={BarChart3}
        iconBg="bg-blue-50"
        iconColor="text-blue-600"
        type="performance-summary"
        showPeriod
        features={['Total GMV & trend', 'Top 10 creators', 'Top 10 videos', 'Week-over-week change']}
      />
      <ReportCard
        title="Creator Activity"
        description="Creator status breakdown: who's crushing it, who's on track, and who needs a nudge."
        icon={Users}
        iconBg="bg-purple-50"
        iconColor="text-purple-600"
        type="creator-activity"
        showPeriod
        features={['Status grouping', 'Posting frequency', 'Days since last video', 'GMV per creator']}
      />
      <ReportCard
        title="Brand Report"
        description="Client-facing summary designed to share with brand contacts. Clean, professional format."
        icon={Send}
        iconBg="bg-green-50"
        iconColor="text-green-600"
        type="brand-report"
        showPeriod
        features={['Brand GMV summary', 'Top creators & videos', 'Week-over-week trends', 'Shareable format']}
      />
    </div>
  );
}

// ── Post Generators Tab ─────────────────────────────────────────────
function PostGeneratorsTab() {
  return (
    <div className="space-y-6">
      {/* Format info */}
      <div className="flex items-center gap-2 text-xs text-gray-400">
        <span className="px-2 py-0.5 rounded bg-[#36393f] text-[#dcddde]">Discord</span>
        <span className="px-2 py-0.5 rounded bg-white border text-gray-600">Slack</span>
        <span>Toggle format on each card</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PostCard title="Daily Drop" icon={TrendingUp} type="daily-drop" showPeriod={false}
          description="Yesterday's numbers at a glance. Quick daily update for your Discord." />
        <PostCard title="What's Cooking?" icon={Flame} type="whats-cooking"
          description="Top performing videos of the period. Hot content that's driving sales." />
        <PostCard title="Who's Cooking?" icon={ChefHat} type="whos-cooking"
          description="Top creators leaderboard. Celebrate your top performers." />
        <PostCard title="Weekly Rankings" icon={BarChart3} type="weekly-rankings" showPeriod={false}
          description="Full weekly creator and video rankings with tiers." />
        <PostCard title="Video Breakdown" icon={Video} type="video-breakdown" showPeriod={false}
          description="Detailed stats on top 10 videos: views, likes, shares, GMV, and product." />
      </div>
    </div>
  );
}

// ── Schedules Tab ───────────────────────────────────────────────────

interface ScheduleRow {
  id: string;
  report_type: string;
  source: string;
  brand: string;
  period: string;
  cron_label: string;
  destination_kind: string;
  webhook_url: string;
  channel_label: string | null;
  active: boolean;
  last_run_at: string | null;
  last_run_status: string | null;
  last_run_error: string | null;
  next_run_at: string | null;
  created_at: string;
}

const REPORT_TYPE_LABELS: Record<string, string> = {
  // discord-posts source
  'daily-drop':       'Daily Drop',
  'whats-cooking':    "What's Cooking?",
  'whos-cooking':     "Who's Cooking?",
  'weekly-rankings':  'Weekly Rankings',
  // reporting source
  'performance-summary': 'Performance Summary',
  'creator-activity':    'Creator Activity',
  'brand-report':        'Brand Report',
};

function relativeTimeAgo(iso: string | null): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return 'Soon';
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}

function relativeTimeUntil(iso: string | null): string {
  if (!iso) return '—';
  const ms = new Date(iso).getTime() - Date.now();
  if (ms < 0) return 'Pending';
  const min = Math.floor(ms / 60000);
  if (min < 60) return `in ${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `in ${hr}h`;
  const d = Math.floor(hr / 24);
  return `in ${d}d`;
}

function SchedulesTab() {
  const [schedules, setSchedules] = useState<ScheduleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<ScheduleRow | null>(null);

  const fetchSchedules = useCallback(async () => {
    try {
      const res = await fetch('/api/schedules');
      const data = await res.json();
      setSchedules(data.schedules ?? []);
    } catch {
      setSchedules([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSchedules(); }, [fetchSchedules]);

  const toggleActive = async (s: ScheduleRow) => {
    await fetch(`/api/schedules/${s.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !s.active }),
    });
    fetchSchedules();
  };

  const deleteSchedule = async (s: ScheduleRow) => {
    if (!confirm(`Delete the ${REPORT_TYPE_LABELS[s.report_type] ?? s.report_type} schedule?`)) return;
    await fetch(`/api/schedules/${s.id}`, { method: 'DELETE' });
    fetchSchedules();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-400">Automated report delivery to Discord and Slack channels.</p>
        <button
          onClick={() => { setEditing(null); setShowModal(true); }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#E91E8C] text-white text-sm font-semibold hover:bg-[#d1177d] transition-colors"
        >
          <Calendar className="h-4 w-4" />
          New Schedule
        </button>
      </div>

      {loading ? (
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-12 text-center">
          <Loader2 className="h-5 w-5 mx-auto animate-spin text-gray-300" />
        </div>
      ) : schedules.length === 0 ? (
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-16 text-center">
          <Clock className="h-8 w-8 mx-auto text-gray-200 mb-3" />
          <p className="text-sm font-medium text-gray-500">No schedules yet</p>
          <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">
            Set up an automated schedule to deliver any report or post on a recurring basis to a Discord or Slack channel.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50/60 border-b border-gray-100">
              <tr>
                {['Report', 'Brand', 'Frequency', 'Destination', 'Last Sent', 'Next Run', 'Status', ''].map(h => (
                  <th key={h} className="text-left py-3 px-4 font-semibold text-gray-500 text-xs uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {schedules.map(s => (
                <tr key={s.id} className="hover:bg-gray-50/60 transition-colors">
                  <td className="py-3 px-4 font-medium text-[#1A1B3A]">{REPORT_TYPE_LABELS[s.report_type] ?? s.report_type}</td>
                  <td className="py-3 px-4 text-gray-500">{s.brand === 'all' ? 'All Brands' : (BRAND_DISPLAY_NAMES[s.brand] ?? s.brand)}</td>
                  <td className="py-3 px-4 text-gray-500 text-xs">{s.cron_label}</td>
                  <td className="py-3 px-4">
                    <span className={cn(
                      'inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full font-medium',
                      s.destination_kind === 'discord' ? 'bg-[#5865F2]/10 text-[#5865F2]' : 'bg-green-50 text-green-700'
                    )}>
                      {s.destination_kind === 'discord' ? '💬' : '📨'} {s.channel_label || s.destination_kind}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-xs">
                    <div className="text-gray-500">{relativeTimeAgo(s.last_run_at)}</div>
                    {s.last_run_status === 'failed' && (
                      <div className="text-[10px] text-red-500" title={s.last_run_error ?? ''}>last run failed</div>
                    )}
                  </td>
                  <td className="py-3 px-4 text-xs text-gray-500">{s.active ? relativeTimeUntil(s.next_run_at) : 'Paused'}</td>
                  <td className="py-3 px-4">
                    <button
                      onClick={() => toggleActive(s)}
                      className={cn(
                        'text-xs px-2 py-0.5 rounded-full font-semibold transition-colors',
                        s.active ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      )}
                    >
                      {s.active ? 'Active' : 'Paused'}
                    </button>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => { setEditing(s); setShowModal(true); }}
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                        title="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => deleteSchedule(s)}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <ScheduleModal
          editing={editing}
          onClose={() => { setShowModal(false); setEditing(null); }}
          onSaved={() => { setShowModal(false); setEditing(null); fetchSchedules(); }}
        />
      )}
    </div>
  );
}

// ── Schedule Modal — create or edit a schedule ──────────────────────
function ScheduleModal({
  editing, onClose, onSaved,
}: { editing: ScheduleRow | null; onClose: () => void; onSaved: () => void }) {
  const brandOptions = useBrandOptions();
  const [source, setSource] = useState<string>(editing?.source ?? 'discord-posts');
  const [reportType, setReportType] = useState<string>(editing?.report_type ?? 'daily-drop');
  const [brand, setBrand] = useState(editing?.brand ?? brandOptions[0]?.value ?? 'all');
  const [period, setPeriod] = useState(editing?.period ?? '7d');
  const [cronLabel, setCronLabel] = useState(editing?.cron_label ?? FREQUENCIES[0].label);
  const [webhookUrl, setWebhookUrl] = useState(editing?.webhook_url ?? '');
  const [channelLabel, setChannelLabel] = useState(editing?.channel_label ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reportOptions = source === 'discord-posts'
    ? [
        { value: 'daily-drop',      label: 'Daily Drop' },
        { value: 'whats-cooking',   label: "What's Cooking?" },
        { value: 'whos-cooking',    label: "Who's Cooking?" },
        { value: 'weekly-rankings', label: 'Weekly Rankings' },
      ]
    : [
        { value: 'performance-summary', label: 'Performance Summary' },
        { value: 'creator-activity',    label: 'Creator Activity' },
        { value: 'brand-report',        label: 'Brand Report' },
      ];

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const body = {
        source, report_type: reportType, brand, period,
        cron_label: cronLabel,
        webhook_url: webhookUrl,
        channel_label: channelLabel || null,
      };
      const res = editing
        ? await fetch(`/api/schedules/${editing.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
        : await fetch('/api/schedules', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Save failed');
      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" />
      <div
        className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-bold text-[#1A1B3A]">{editing ? 'Edit Schedule' : 'New Schedule'}</h3>

        <div className="space-y-3">
          {/* Source */}
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Type</label>
            <div className="flex gap-1 p-1 bg-gray-100 rounded-xl">
              {[
                { v: 'discord-posts', l: 'Quick Post' },
                { v: 'reporting',     l: 'Long Report' },
              ].map(o => (
                <button
                  key={o.v}
                  onClick={() => {
                    setSource(o.v);
                    setReportType(o.v === 'discord-posts' ? 'daily-drop' : 'performance-summary');
                  }}
                  className={cn(
                    'flex-1 text-sm font-semibold py-1.5 rounded-lg transition-colors',
                    source === o.v ? 'bg-white text-[#1A1B3A] shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  )}
                >
                  {o.l}
                </button>
              ))}
            </div>
          </div>

          {/* Report */}
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Report</label>
            <select
              value={reportType}
              onChange={e => setReportType(e.target.value)}
              className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E91E8C]/30 focus:border-[#E91E8C]"
            >
              {reportOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {/* Brand */}
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Brand</label>
            <select
              value={brand}
              onChange={e => setBrand(e.target.value)}
              className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E91E8C]/30 focus:border-[#E91E8C]"
            >
              {brandOptions.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
            </select>
          </div>

          {/* Period (only for periodic reports) */}
          {(source === 'reporting' || ['whats-cooking', 'whos-cooking'].includes(reportType)) && (
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Lookback Period</label>
              <div className="flex gap-1 p-1 bg-gray-100 rounded-xl">
                {[{ v: '7d', l: '7 Days' }, { v: '30d', l: '30 Days' }].map(p => (
                  <button
                    key={p.v}
                    onClick={() => setPeriod(p.v)}
                    className={cn(
                      'flex-1 text-sm font-semibold py-1.5 rounded-lg transition-colors',
                      period === p.v ? 'bg-white text-[#1A1B3A] shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    )}
                  >
                    {p.l}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Frequency */}
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Send</label>
            <select
              value={cronLabel}
              onChange={e => setCronLabel(e.target.value)}
              className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E91E8C]/30 focus:border-[#E91E8C]"
            >
              {FREQUENCIES.map(f => <option key={f.label} value={f.label}>{f.label}</option>)}
            </select>
          </div>

          {/* Webhook URL */}
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Webhook URL <span className="text-gray-400 font-normal normal-case ml-1">(Discord or Slack incoming webhook)</span>
            </label>
            <input
              type="url"
              value={webhookUrl}
              onChange={e => setWebhookUrl(e.target.value)}
              placeholder="https://discord.com/api/webhooks/…  or  https://hooks.slack.com/services/…"
              className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E91E8C]/30 focus:border-[#E91E8C] font-mono"
            />
          </div>

          {/* Channel label (display) */}
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Label <span className="text-gray-400 font-normal normal-case ml-1">(display only — e.g. #daily-updates)</span>
            </label>
            <input
              type="text"
              value={channelLabel}
              onChange={e => setChannelLabel(e.target.value)}
              placeholder="#channel-name"
              className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E91E8C]/30 focus:border-[#E91E8C]"
            />
          </div>
        </div>

        {error && (
          <div className="px-3 py-2 rounded-lg bg-red-50 text-red-600 text-xs">{error}</div>
        )}

        <div className="flex gap-3 pt-1">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !webhookUrl}
            className="flex-1 py-2.5 rounded-xl bg-[#E91E8C] hover:bg-[#d1177d] text-white text-sm font-semibold disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {editing ? 'Save Changes' : 'Create Schedule'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Report Card ─────────────────────────────────────────────────────
function ReportCard({
  title, description, icon: Icon, iconBg, iconColor, type, showPeriod, features,
}: {
  title: string; description: string; icon: typeof BarChart3;
  iconBg: string; iconColor: string; type: string;
  showPeriod?: boolean; features: string[];
}) {
  const brandOptions = useBrandOptions();
  const [brand, setBrand] = useState(brandOptions[0]?.value ?? 'all');
  const [period, setPeriod] = useState<'7d' | '30d'>('7d');
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/reporting?type=${type}&brand=${brand}&period=${period}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setText(data.text);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to generate report');
      setText(null);
    } finally {
      setLoading(false);
    }
  }, [type, brand, period]);

  const handleCopy = async () => {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-2xl bg-white border border-gray-100 shadow-sm flex flex-col">
      <div className="px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3 mb-2">
          <div className={`h-10 w-10 rounded-lg ${iconBg} flex items-center justify-center`}>
            <Icon className={`h-5 w-5 ${iconColor}`} />
          </div>
          <h3 className="font-bold text-[#1A1B3A]">{title}</h3>
        </div>
        <p className="text-sm text-gray-400">{description}</p>
      </div>

      <div className="px-5 py-4 space-y-3">
        <select
          value={brand}
          onChange={e => setBrand(e.target.value)}
          className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E91E8C]/30 focus:border-[#E91E8C]"
        >
          {brandOptions.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
        </select>

        {showPeriod && (
          <div className="flex gap-1 p-1 bg-gray-100 rounded-xl">
            {[{ v: '7d', l: 'Weekly' }, { v: '30d', l: 'Monthly' }].map(p => (
              <button
                key={p.v}
                onClick={() => setPeriod(p.v as '7d' | '30d')}
                className={cn(
                  'flex-1 text-sm font-semibold py-1.5 rounded-lg transition-colors',
                  period === p.v ? 'bg-white text-[#1A1B3A] shadow-sm' : 'text-gray-500 hover:text-gray-700'
                )}
              >
                {p.l}
              </button>
            ))}
          </div>
        )}

        {/* Features list */}
        <div className="space-y-1">
          {features.map(f => (
            <div key={f} className="flex items-center gap-2 text-xs text-gray-500">
              <div className="w-1 h-1 rounded-full bg-[#E91E8C]" />
              {f}
            </div>
          ))}
        </div>

        <button
          onClick={generate}
          disabled={loading}
          className="w-full py-2.5 rounded-xl bg-[#E91E8C] hover:bg-[#d1177d] text-white font-semibold text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading ? <><Loader2 className="h-4 w-4 animate-spin" />Generating…</> : 'Generate Report'}
        </button>
      </div>

      {error && (
        <div className="mx-5 mb-4 px-3 py-2 rounded-lg bg-red-50 text-red-600 text-xs">{error}</div>
      )}

      {text && (
        <div className="px-5 pb-5 space-y-3">
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-2 bg-gray-50/80 border-b border-gray-200 flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500">Preview</span>
              <button
                onClick={handleCopy}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-colors',
                  copied ? 'bg-green-500 text-white' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                )}
              >
                {copied ? <><Check className="h-3.5 w-3.5" />Copied</> : <><Clipboard className="h-3.5 w-3.5" />Copy</>}
              </button>
            </div>
            <div className="p-4 bg-white max-h-[400px] overflow-auto">
              <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">{text}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Post Generator Card ─────────────────────────────────────────────
function PostCard({
  title, icon: Icon, type, showPeriod = true, description,
}: {
  title: string; icon: typeof Flame; type: string; showPeriod?: boolean; description: string;
}) {
  const brandOptions = useBrandOptions();
  const [brand, setBrand] = useState(brandOptions[0]?.value ?? 'all');
  const [period, setPeriod] = useState<'7d' | '30d'>('7d');
  const [format, setFormat] = useState<'discord' | 'slack'>('discord');
  const [text, setText] = useState<string | null>(null);
  const [stats, setStats] = useState<{ totalGmv: number; videoCount: number; creatorCount: number } | null>(null);
  const [mentionMap, setMentionMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const endpoint = type === 'video-breakdown'
        ? `/api/discord-posts?type=whats-cooking&brand=${brand}&period=${period}&detail=true`
        : `/api/discord-posts?type=${type}&brand=${brand}&period=${period}`;
      const res = await fetch(endpoint);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      let output = data.text;

      // Convert to Slack format if needed
      if (format === 'slack') {
        output = toSlackFormat(output);
      }

      setText(output);
      setStats(data.stats);
      setMentionMap(data.mentionMap || {});
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to generate post');
    } finally {
      setLoading(false);
    }
  }, [type, brand, period, format]);

  const handleCopy = async () => {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-2xl bg-white border border-gray-100 shadow-sm flex flex-col">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3 mb-1">
          <div className="h-9 w-9 rounded-lg bg-pink-50 flex items-center justify-center">
            <Icon className="h-5 w-5 text-[#E91E8C]" />
          </div>
          <h2 className="text-lg font-bold text-[#1A1B3A]">{title}</h2>
        </div>
        <p className="text-xs text-gray-400">{description}</p>
      </div>

      {/* Controls */}
      <div className="px-5 py-4 space-y-3">
        <select
          value={brand}
          onChange={e => setBrand(e.target.value)}
          className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E91E8C]/30 focus:border-[#E91E8C]"
        >
          {brandOptions.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
        </select>

        {showPeriod && (
          <div className="flex gap-1 p-1 bg-gray-100 rounded-xl">
            {[{ v: '7d', l: '7 Day' }, { v: '30d', l: 'Monthly' }].map(p => (
              <button
                key={p.v}
                onClick={() => setPeriod(p.v as '7d' | '30d')}
                className={cn(
                  'flex-1 text-sm font-semibold py-1.5 rounded-lg transition-colors',
                  period === p.v ? 'bg-white text-[#1A1B3A] shadow-sm' : 'text-gray-500 hover:text-gray-700'
                )}
              >
                {p.l}
              </button>
            ))}
          </div>
        )}

        {/* Format Toggle */}
        <div className="flex gap-1 p-1 bg-gray-100 rounded-xl">
          <button
            onClick={() => setFormat('discord')}
            className={cn(
              'flex-1 text-sm font-semibold py-1.5 rounded-lg transition-colors flex items-center justify-center gap-1.5',
              format === 'discord' ? 'bg-[#5865F2] text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
            )}
          >
            💬 Discord
          </button>
          <button
            onClick={() => setFormat('slack')}
            className={cn(
              'flex-1 text-sm font-semibold py-1.5 rounded-lg transition-colors flex items-center justify-center gap-1.5',
              format === 'slack' ? 'bg-[#4A154B] text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
            )}
          >
            📨 Slack
          </button>
        </div>

        <button
          onClick={generate}
          disabled={loading}
          className="w-full py-2.5 rounded-xl bg-[#E91E8C] hover:bg-[#d1177d] text-white font-semibold text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading ? <><Loader2 className="h-4 w-4 animate-spin" />Generating…</> : 'Generate'}
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="px-5 pb-3 flex gap-4 text-xs text-gray-500">
          <span><strong className="text-gray-700">${stats.totalGmv.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong> GMV</span>
          <span><strong className="text-gray-700">{stats.videoCount}</strong> videos</span>
          <span><strong className="text-gray-700">{stats.creatorCount}</strong> creators</span>
        </div>
      )}

      {/* Preview */}
      {text && (
        <div className="mx-5 mb-4 rounded-xl overflow-hidden border border-gray-200 flex-1 flex flex-col">
          {format === 'discord' ? (
            <>
              <div className="px-4 py-2 bg-[#36393f] flex items-center justify-between">
                <span className="text-xs font-semibold text-[#dcddde]">Discord Preview</span>
                <CopyBtn copied={copied} onClick={handleCopy} variant="discord" />
              </div>
              <div className="bg-[#36393f] p-4 flex-1 overflow-auto max-h-[500px]">
                <div className="text-sm text-[#dcddde] whitespace-pre-wrap leading-[1.375rem]">
                  {renderDiscordMarkdown(text, mentionMap)}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="px-4 py-2 bg-white border-b border-gray-200 flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-500">Slack Preview</span>
                <CopyBtn copied={copied} onClick={handleCopy} variant="slack" />
              </div>
              <div className="bg-white p-4 flex-1 overflow-auto max-h-[500px] border-l-4 border-[#FF4D8D]">
                <div className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                  {text}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {error && (
        <div className="mx-5 mb-4 px-3 py-2 rounded-lg bg-red-50 text-red-600 text-xs">{error}</div>
      )}

      {text && (
        <div className="px-5 pb-5">
          <button
            onClick={handleCopy}
            className={cn(
              'w-full py-3 rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2',
              copied ? 'bg-green-500 text-white' : 'bg-[#1A1B3A] hover:bg-[#2a2b4a] text-white'
            )}
          >
            {copied ? <><Check className="h-4 w-4" />Copied</> : <><Clipboard className="h-4 w-4" />Copy to Clipboard</>}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Shared Components ───────────────────────────────────────────────
function CopyBtn({ copied, onClick, variant }: { copied: boolean; onClick: () => void; variant: 'discord' | 'slack' }) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
        copied
          ? 'bg-green-600 text-white'
          : variant === 'discord'
            ? 'bg-[#5865F2] hover:bg-[#4752c4] text-white'
            : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
      }`}>
      {copied ? <><Check className="h-3.5 w-3.5" />Copied!</> : <><Clipboard className="h-3.5 w-3.5" />Copy</>}
    </button>
  );
}

// ── Discord Markdown Renderer ───────────────────────────────────────
function renderDiscordMarkdown(text: string, mentionMap: Record<string, string> = {}) {
  return text.split('\n').map((line, i) => {
    if (line.startsWith('# ')) return <div key={i} className="text-xl font-bold text-white mt-1 mb-1">{parseInline(line.slice(2), mentionMap)}</div>;
    if (line.startsWith('> ')) return <div key={i} className="border-l-[3px] border-[#4f545c] pl-3 my-0.5 text-[#b9bbbe]">{parseInline(line.slice(2), mentionMap)}</div>;
    if (line === '') return <br key={i} />;
    return <div key={i}>{parseInline(line, mentionMap)}</div>;
  });
}

function parseInline(text: string, mentionMap: Record<string, string> = {}): React.ReactNode {
  const parts: (string | React.ReactElement)[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    const boldMatch = remaining.match(/^\*\*(.+?)\*\*/);
    if (boldMatch) { parts.push(<strong key={key++} className="font-bold text-white">{parseInline(boldMatch[1], mentionMap)}</strong>); remaining = remaining.slice(boldMatch[0].length); continue; }
    const italicMatch = remaining.match(/^\*(.+?)\*/);
    if (italicMatch) { parts.push(<em key={key++} className="italic text-[#b9bbbe]">{italicMatch[1]}</em>); remaining = remaining.slice(italicMatch[0].length); continue; }
    const linkMatch = remaining.match(/^\[(.+?)\]\((.+?)\)/);
    if (linkMatch) { parts.push(<a key={key++} href={linkMatch[2]} target="_blank" rel="noopener noreferrer" className="text-[#00AFF4] hover:underline">{linkMatch[1]}</a>); remaining = remaining.slice(linkMatch[0].length); continue; }
    const mentionMatch = remaining.match(/^<@(\d+)>/);
    if (mentionMatch) { parts.push(<span key={key++} className="bg-[#5865F2]/20 text-[#dee0fc] rounded px-1">@{mentionMap[mentionMatch[1]] || 'user'}</span>); remaining = remaining.slice(mentionMatch[0].length); continue; }
    const nextSpecial = remaining.slice(1).search(/[\*\[<]/);
    if (nextSpecial === -1) { parts.push(remaining); break; }
    parts.push(remaining.slice(0, nextSpecial + 1));
    remaining = remaining.slice(nextSpecial + 1);
  }
  return <>{parts}</>;
}

// ── Slack Format Converter ──────────────────────────────────────────
function toSlackFormat(discordText: string): string {
  return discordText
    .replace(/^# (.+)$/gm, '*$1*')           // # Header -> *bold*
    .replace(/^> (.+)$/gm, '> $1')            // Keep blockquotes
    .replace(/\*\*(.+?)\*\*/g, '*$1*')        // **bold** -> *bold*
    .replace(/<@(\d+)>/g, '@user')             // Mentions simplified
    .replace(/__(.+?)__/g, '_$1_');            // __underline__ -> _italic_
}
