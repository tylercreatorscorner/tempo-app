'use client';

import { useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { CreatorStats, CreatorDailyData, CreatorVideo } from '@/lib/data/creator';

function fmt(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

interface Props {
  stats: CreatorStats | null;
  dailyData: CreatorDailyData[];
  topVideos: CreatorVideo[];
}

const PERIODS = ['7', '30', '90', 'all'] as const;
const PERIOD_LABELS: Record<string, string> = { '7': '7 Days', '30': '30 Days', '90': '90 Days', all: 'All Time' };

export function StatsClient({ stats, dailyData, topVideos }: Props) {
  const [period, setPeriod] = useState('7');
  const [chartMetric, setChartMetric] = useState<'gmv' | 'orders'>('gmv');

  const s = stats;

  const chartData = dailyData.map((d) => ({
    date: new Date(d.report_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    gmv: d.gmv,
    orders: d.orders,
  }));

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="animate-fade-in">
        <h1 className="text-2xl sm:text-3xl font-bold text-[#1A1B3A]">📊 Your Performance</h1>
        <p className="text-gray-500 mt-1">Track your growth and see what&apos;s working</p>
      </div>

      {/* Period Selector */}
      <div className="flex gap-2 animate-fade-in">
        {PERIODS.map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${period === p ? 'bg-[#FF4D8D] text-white shadow-md' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}
          >
            {PERIOD_LABELS[p]}
          </button>
        ))}
      </div>

      {/* Hero Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 stagger-children">
        <HeroCard icon="💰" label="Total GMV" value={fmt(s?.totalGmv ?? 0)} color="text-[#34D399]" />
        <HeroCard icon="📦" label="Orders Driven" value={String(s?.totalOrders ?? 0)} />
        <HeroCard icon="✨" label="Commission Earned" value={fmt(s?.totalCommission ?? 0)} color="text-[#FF4D8D]" />
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 stagger-children">
        <SecondaryCard label="Videos Posted" value={String(s?.totalVideos ?? 0)} />
        <SecondaryCard label="Avg GMV/Video" value={fmt(s?.avgGmvPerVideo ?? 0)} />
        <SecondaryCard label="Conversion Rate" value={`${(s?.conversionRate ?? 0).toFixed(1)}%`} />
        <SecondaryCard label="Best Day" value={fmt(s?.bestDay?.gmv ?? 0)} meta={s?.bestDay?.date ? new Date(s.bestDay.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '-'} highlight />
      </div>

      {/* Performance Chart */}
      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm animate-fade-in">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-[#1A1B3A]">📈 Performance Trend</h3>
          <div className="flex gap-1">
            {(['gmv', 'orders'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setChartMetric(m)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${chartMetric === m ? 'bg-[#FF4D8D] text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
              >
                {m === 'gmv' ? 'GMV' : 'Orders'}
              </button>
            ))}
          </div>
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="colorMetric" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#FF4D8D" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#FF4D8D" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9CA3AF' }} />
              <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} tickFormatter={chartMetric === 'gmv' ? (v) => `$${v}` : undefined} />
              <Tooltip />
              <Area type="monotone" dataKey={chartMetric} stroke="#FF4D8D" fill="url(#colorMetric)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top Videos */}
      {topVideos.length > 0 && (
        <div className="animate-fade-in">
          <h3 className="font-semibold text-[#1A1B3A] mb-3">🎬 Your Top Videos</h3>
          <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 px-5 py-3 bg-gray-50 text-xs font-medium text-gray-500 uppercase tracking-wider">
              <span>Video</span>
              <span className="text-right">GMV</span>
              <span className="text-right">Orders</span>
              <span className="text-right">Days</span>
            </div>
            {topVideos.map((v, i) => (
              <div key={v.video_id} className={`grid grid-cols-[1fr_auto_auto_auto] gap-4 px-5 py-3 items-center text-sm ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} hover:bg-pink-50/30 transition-colors`}>
                <span className="font-medium text-[#1A1B3A] truncate">{v.video_title || v.video_id}</span>
                <span className="text-right font-semibold text-[#34D399]">{fmt(v.total_gmv)}</span>
                <span className="text-right text-gray-600">{v.total_orders}</span>
                <span className="text-right text-gray-400">{v.days_active}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function HeroCard({ icon, label, value, color }: { icon: string; label: string; value: string; color?: string }) {
  return (
    <div className="bg-white/80 backdrop-blur border border-gray-100 rounded-2xl p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300">
      <div className="text-2xl mb-2">{icon}</div>
      <p className={`text-2xl sm:text-3xl font-extrabold ${color ?? 'text-[#1A1B3A]'}`}>{value}</p>
      <p className="text-xs text-gray-400 mt-1">{label}</p>
    </div>
  );
}

function SecondaryCard({ label, value, meta, highlight }: { label: string; value: string; meta?: string; highlight?: boolean }) {
  return (
    <div className={`bg-white border border-gray-100 rounded-xl p-4 shadow-sm ${highlight ? 'ring-1 ring-[#FF4D8D]/20' : ''}`}>
      <p className="text-xl font-bold text-[#1A1B3A]">{value}</p>
      <p className="text-xs text-gray-400">{label}</p>
      {meta && <p className="text-xs text-[#FF4D8D] mt-0.5">{meta}</p>}
    </div>
  );
}
