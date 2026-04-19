'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import type { ApexOptions } from 'apexcharts';
import type { CreatorStats, CreatorDailyData, CreatorVideo } from '@/lib/data/creator';

const ApexChart = dynamic(() => import('react-apexcharts'), { ssr: false });

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

  const categories = dailyData.map(d =>
    new Date(d.report_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  );
  const values = dailyData.map(d => parseFloat((chartMetric === 'gmv' ? d.gmv : d.orders).toFixed(2)));

  const chartOptions: ApexOptions = {
    chart: {
      type: 'area',
      toolbar: { show: false },
      zoom: { enabled: false },
      animations: { enabled: true, speed: 800, dynamicAnimation: { enabled: true, speed: 350 } },
      fontFamily: 'inherit',
      background: 'transparent',
    },
    stroke: { curve: 'smooth', width: 2.5, colors: ['#FF4D8D'] },
    fill: {
      type: 'gradient',
      gradient: {
        shadeIntensity: 1,
        type: 'vertical',
        colorStops: [
          { offset: 0, color: '#FF4D8D', opacity: 0.25 },
          { offset: 90, color: '#FF4D8D', opacity: 0.02 },
        ],
      },
    },
    dataLabels: { enabled: false },
    markers: { size: 0, hover: { size: 5 } },
    xaxis: {
      type: 'category',
      categories,
      labels: {
        style: { colors: '#9CA3AF', fontSize: '11px', fontFamily: 'inherit' },
        hideOverlappingLabels: true,
      },
      axisBorder: { show: false },
      axisTicks: { show: false },
      tooltip: { enabled: false },
    },
    yaxis: {
      labels: {
        style: { colors: '#9CA3AF', fontSize: '11px', fontFamily: 'inherit' },
        formatter: val => chartMetric === 'gmv' ? fmt(val) : String(Math.round(val)),
      },
      forceNiceScale: true,
    },
    grid: {
      borderColor: '#F3F4F6',
      strokeDashArray: 4,
      xaxis: { lines: { show: false } },
      yaxis: { lines: { show: true } },
    },
    tooltip: {
      theme: 'light',
      style: { fontSize: '12px', fontFamily: 'inherit' },
      y: {
        formatter: val => chartMetric === 'gmv'
          ? `$${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          : String(Math.round(val)),
        title: { formatter: () => chartMetric === 'gmv' ? 'GMV' : 'Orders' },
      },
    },
  };

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
      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm animate-fade-in overflow-hidden">
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
        {dailyData.length > 1 ? (
          <ApexChart
            type="area"
            series={[{ name: chartMetric === 'gmv' ? 'GMV' : 'Orders', data: values }]}
            options={chartOptions}
            height={240}
            width="100%"
          />
        ) : (
          <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
            Not enough data for this period
          </div>
        )}
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
