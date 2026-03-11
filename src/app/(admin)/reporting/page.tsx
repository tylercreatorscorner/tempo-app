'use client';

import { useState, useCallback } from 'react';
import {
  FileBarChart, Clipboard, Check, Loader2, ChefHat, Flame, TrendingUp,
  BarChart3, Calendar, Clock, Send, Users, Video, ArrowUpRight, ArrowDownRight,
  Download, MessageSquare, Hash,
} from 'lucide-react';

// ── Constants ───────────────────────────────────────────────────────
const BRANDS = [
  { value: 'all', label: 'All Brands' },
  { value: 'jiyu', label: 'JiYu' },
  { value: 'catakor', label: 'Cata-Kor' },
  { value: 'physicians_choice', label: "Physician's Choice" },
];

const TABS = [
  { id: 'reports', label: 'Reports', icon: FileBarChart },
  { id: 'generators', label: 'Post Generators', icon: Hash },
  { id: 'schedules', label: 'Schedules', icon: Clock },
] as const;

type TabId = typeof TABS[number]['id'];

// ── Main Page ───────────────────────────────────────────────────────
export default function ReportingPage() {
  const [activeTab, setActiveTab] = useState<TabId>('reports');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[#1A1B3A]">Reporting</h1>
        <p className="text-sm text-gray-500 mt-1">
          Generate reports, create Discord & Slack posts, and schedule automated updates.
        </p>
      </div>

      {/* Tab Bar */}
      <div className="flex bg-gray-100 rounded-xl p-1 w-fit">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-white text-[#FF4D8D] shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'reports' && <ReportsTab />}
      {activeTab === 'generators' && <PostGeneratorsTab />}
      {activeTab === 'schedules' && <SchedulesTab />}
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
function SchedulesTab() {
  const [showModal, setShowModal] = useState(false);

  // Demo schedules
  const schedules = [
    { id: '1', type: 'Daily Drop', brand: 'All Brands', frequency: 'Daily @ 9 AM', destination: 'Discord #daily-updates', lastSent: '2 hours ago', active: true },
    { id: '2', type: "Who's Cooking?", brand: 'JiYu', frequency: 'Weekly (Mon)', destination: 'Discord #creator-highlights', lastSent: '3 days ago', active: true },
    { id: '3', type: 'Brand Report', brand: "Physician's Choice", frequency: 'Weekly (Fri)', destination: 'Slack #pc-updates', lastSent: '5 days ago', active: false },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">Automated report delivery to Discord and Slack channels.</p>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-[#FF4D8D] to-[#7C5CFC] text-white text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <Calendar className="h-4 w-4" />
          New Schedule
        </button>
      </div>

      <div className="rounded-2xl bg-white border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Report Type', 'Brand', 'Frequency', 'Destination', 'Last Sent', 'Status', ''].map(h => (
                <th key={h} className="text-left py-3 px-4 font-medium text-gray-500 text-xs uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {schedules.map(s => (
              <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                <td className="py-3 px-4 font-medium text-gray-900">{s.type}</td>
                <td className="py-3 px-4 text-gray-600">{s.brand}</td>
                <td className="py-3 px-4 text-gray-600">{s.frequency}</td>
                <td className="py-3 px-4">
                  <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full font-medium ${
                    s.destination.startsWith('Discord') ? 'bg-[#5865F2]/10 text-[#5865F2]' : 'bg-green-50 text-green-700'
                  }`}>
                    {s.destination.startsWith('Discord') ? '💬' : '📨'} {s.destination}
                  </span>
                </td>
                <td className="py-3 px-4 text-gray-400 text-xs">{s.lastSent}</td>
                <td className="py-3 px-4">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    s.active ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {s.active ? 'Active' : 'Paused'}
                  </span>
                </td>
                <td className="py-3 px-4">
                  <button className="text-xs text-gray-400 hover:text-gray-700 transition-colors">Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400 text-center pt-2">
        Scheduling is coming soon. This preview shows how automated reports will work.
      </p>

      {showModal && <NewScheduleModal onClose={() => setShowModal(false)} />}
    </div>
  );
}

// ── New Schedule Modal ──────────────────────────────────────────────
function NewScheduleModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4">
        <h3 className="text-lg font-bold text-gray-900">New Schedule</h3>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Report Type</label>
            <select className="w-full mt-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#FF4D8D]/50">
              <option>Daily Drop</option>
              <option>What&apos;s Cooking?</option>
              <option>Who&apos;s Cooking?</option>
              <option>Weekly Rankings</option>
              <option>Video Breakdown</option>
              <option>Performance Summary</option>
              <option>Creator Activity</option>
              <option>Brand Report</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Brand</label>
            <select className="w-full mt-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#FF4D8D]/50">
              {BRANDS.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Frequency</label>
            <select className="w-full mt-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#FF4D8D]/50">
              <option>Daily @ 9:00 AM CT</option>
              <option>Weekly (Monday)</option>
              <option>Weekly (Friday)</option>
              <option>Monthly (1st)</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Destination</label>
            <div className="flex gap-2 mt-1">
              <select className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#FF4D8D]/50">
                <option>Discord</option>
                <option>Slack</option>
              </select>
              <input
                type="text"
                placeholder="#channel-name"
                className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#FF4D8D]/50"
              />
            </div>
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-[#FF4D8D] to-[#7C5CFC] text-white text-sm font-medium hover:opacity-90 transition-opacity">
            Create Schedule
          </button>
        </div>

        <p className="text-xs text-gray-400 text-center">Scheduling will be fully functional in the next update.</p>
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
  const [brand, setBrand] = useState('all');
  const [period, setPeriod] = useState<'7d' | '30d'>('7d');
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const generate = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/reporting?type=${type}&brand=${brand}&period=${period}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setText(data.text);
    } catch (err: any) {
      setText(`Error: ${err.message}. Report API route coming soon.`);
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
    <div className="rounded-2xl bg-white border border-gray-200 shadow-sm flex flex-col">
      <div className="px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3 mb-2">
          <div className={`h-10 w-10 rounded-lg ${iconBg} flex items-center justify-center`}>
            <Icon className={`h-5 w-5 ${iconColor}`} />
          </div>
          <h3 className="font-bold text-gray-900">{title}</h3>
        </div>
        <p className="text-sm text-gray-500">{description}</p>
      </div>

      <div className="px-5 py-4 space-y-3">
        <select value={brand} onChange={e => setBrand(e.target.value)}
          className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#FF4D8D]/50">
          {BRANDS.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
        </select>

        {showPeriod && (
          <div className="flex bg-gray-100 rounded-lg p-1">
            {[{ v: '7d', l: 'Weekly' }, { v: '30d', l: 'Monthly' }].map(p => (
              <button key={p.v} onClick={() => setPeriod(p.v as '7d' | '30d')}
                className={`flex-1 text-sm font-medium py-1.5 rounded-md transition-all ${
                  period === p.v ? 'bg-white text-[#FF4D8D] shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}>{p.l}</button>
            ))}
          </div>
        )}

        {/* Features list */}
        <div className="space-y-1">
          {features.map(f => (
            <div key={f} className="flex items-center gap-2 text-xs text-gray-500">
              <div className="w-1 h-1 rounded-full bg-[#FF4D8D]" />
              {f}
            </div>
          ))}
        </div>

        <button onClick={generate} disabled={loading}
          className="w-full py-2.5 rounded-lg bg-[#FF4D8D] hover:bg-[#e8437e] text-white font-medium text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
          {loading ? <><Loader2 className="h-4 w-4 animate-spin" />Generating...</> : 'Generate Report'}
        </button>
      </div>

      {text && (
        <div className="px-5 pb-5 space-y-3">
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500">Preview</span>
              <div className="flex gap-2">
                <button onClick={handleCopy}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                    copied ? 'bg-green-500 text-white' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                  }`}>
                  {copied ? <><Check className="h-3.5 w-3.5" />Copied!</> : <><Clipboard className="h-3.5 w-3.5" />Copy</>}
                </button>
              </div>
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
  const [brand, setBrand] = useState('all');
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
    } catch (err: any) {
      setError(err.message);
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
    <div className="rounded-2xl bg-white border border-gray-200 shadow-sm flex flex-col">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3 mb-1">
          <div className="h-9 w-9 rounded-lg bg-pink-50 flex items-center justify-center">
            <Icon className="h-5 w-5 text-[#FF4D8D]" />
          </div>
          <h2 className="text-lg font-bold text-[#1A1B3A]">{title}</h2>
        </div>
        <p className="text-xs text-gray-500">{description}</p>
      </div>

      {/* Controls */}
      <div className="px-5 py-4 space-y-3">
        <select value={brand} onChange={e => setBrand(e.target.value)}
          className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#FF4D8D]/50">
          {BRANDS.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
        </select>

        {showPeriod && (
          <div className="flex bg-gray-100 rounded-lg p-1">
            {[{ v: '7d', l: '7 Day' }, { v: '30d', l: 'Monthly' }].map(p => (
              <button key={p.v} onClick={() => setPeriod(p.v as '7d' | '30d')}
                className={`flex-1 text-sm font-medium py-1.5 rounded-md transition-all ${
                  period === p.v ? 'bg-white text-[#FF4D8D] shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}>{p.l}</button>
            ))}
          </div>
        )}

        {/* Format Toggle */}
        <div className="flex bg-gray-100 rounded-lg p-1">
          <button onClick={() => setFormat('discord')}
            className={`flex-1 text-sm font-medium py-1.5 rounded-md transition-all flex items-center justify-center gap-1.5 ${
              format === 'discord' ? 'bg-[#36393f] text-[#dcddde] shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            💬 Discord
          </button>
          <button onClick={() => setFormat('slack')}
            className={`flex-1 text-sm font-medium py-1.5 rounded-md transition-all flex items-center justify-center gap-1.5 ${
              format === 'slack' ? 'bg-white text-[#4A154B] shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            📨 Slack
          </button>
        </div>

        <button onClick={generate} disabled={loading}
          className="w-full py-2.5 rounded-lg bg-[#FF4D8D] hover:bg-[#e8437e] text-white font-medium text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
          {loading ? <><Loader2 className="h-4 w-4 animate-spin" />Generating...</> : 'Generate'}
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
          <button onClick={handleCopy}
            className={`w-full py-3 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 ${
              copied ? 'bg-green-500 text-white' : 'bg-[#1A1B3A] hover:bg-[#2a2b4a] text-white'
            }`}>
            {copied ? <><Check className="h-4 w-4" />Copied!</> : <><Clipboard className="h-4 w-4" />Copy to Clipboard</>}
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
