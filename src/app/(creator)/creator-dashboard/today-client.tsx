'use client';

import { DollarSign, Package, Video, Flame, Search, BarChart3, Trophy, BookOpen } from 'lucide-react';
import Link from 'next/link';
import type { CreatorStats, CreatorVideo } from '@/lib/data/creator';

function formatMoney(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

interface Props {
  creatorName: string;
  stats: CreatorStats | null;
  streak: number;
  recentVideos: CreatorVideo[];
  winningVideos: (CreatorVideo & { creator_name: string })[];
}

export function TodayClient({ creatorName, stats, streak, recentVideos, winningVideos }: Props) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="animate-fade-in">
        <h1 className="text-2xl sm:text-3xl font-bold text-[#1A1B3A]">
          {greeting}, <span className="text-[#FF4D8D]">{creatorName}</span> 👋
        </h1>
        <p className="text-gray-500 mt-1">Let&apos;s make today count</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 stagger-children">
        <StatCard icon={<DollarSign className="h-4 w-4" />} label="Total GMV" value={formatMoney(stats?.totalGmv ?? 0)} color="mint" />
        <StatCard icon={<Package className="h-4 w-4" />} label="Orders" value={String(stats?.totalOrders ?? 0)} />
        <StatCard icon={<Video className="h-4 w-4" />} label="Videos" value={String(stats?.totalVideos ?? 0)} />
        <StatCard icon={<Flame className="h-4 w-4" />} label="Day Streak" value={String(streak)} subtitle={streak > 0 ? 'Keep it up! 🔥' : 'Post daily!'} />
      </div>

      {/* Retainer Pace Ring */}
      <div className="bg-white/80 backdrop-blur border border-gray-100 rounded-2xl p-5 shadow-sm animate-fade-in">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-[#1A1B3A] flex items-center gap-2">🎯 Retainer Pace</h3>
          <span className="text-xs text-gray-400">This Month</span>
        </div>
        <div className="flex items-center gap-6">
          <PaceRing current={stats?.totalVideos ?? 0} target={20} />
          <div className="flex-1 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">Videos Posted</span><span className="font-medium">{stats?.totalVideos ?? 0}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Days Left</span><span className="font-medium">{daysLeftInMonth()}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Needed Pace</span><span className="font-medium">{Math.max(0, Math.ceil((20 - (stats?.totalVideos ?? 0)) / Math.max(1, daysLeftInMonth())))}/day</span></div>
          </div>
        </div>
      </div>

      {/* What's Winning */}
      {winningVideos.length > 0 && (
        <div className="animate-fade-in">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-[#1A1B3A]">🔥 What&apos;s Winning</h3>
            <Link href="/creator-dashboard/discover" className="text-sm text-[#FF4D8D] hover:underline">See all →</Link>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2 snap-x">
            {winningVideos.slice(0, 6).map((v) => (
              <div key={v.video_id} className="min-w-[200px] snap-start bg-white border border-gray-100 rounded-xl p-4 shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5">
                <p className="text-sm font-medium text-[#1A1B3A] truncate">{v.video_title || v.video_id}</p>
                <p className="text-xs text-gray-400 mt-1">by {v.creator_name}</p>
                <p className="text-sm font-bold text-[#34D399] mt-2">{formatMoney(v.total_gmv)}</p>
                <p className="text-xs text-gray-400">{v.total_orders} orders</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="animate-fade-in">
        <h3 className="font-semibold text-[#1A1B3A] mb-3">⚡ Quick Actions</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { href: '/creator-dashboard/discover', icon: <Search className="h-5 w-5" />, label: 'Find inspiration' },
            { href: '/creator-dashboard/stats', icon: <BarChart3 className="h-5 w-5" />, label: 'View my stats' },
            { href: '/creator-dashboard/rankings', icon: <Trophy className="h-5 w-5" />, label: 'Check rankings' },
            { href: '/creator-dashboard/learn', icon: <BookOpen className="h-5 w-5" />, label: 'Learn & grow' },
          ].map((a) => (
            <Link key={a.href} href={a.href} className="flex flex-col items-center gap-2 p-4 bg-white border border-gray-100 rounded-xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all text-center">
              <div className="text-[#FF4D8D]">{a.icon}</div>
              <span className="text-sm font-medium text-gray-700">{a.label}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Recent Videos */}
      {recentVideos.length > 0 && (
        <div className="animate-fade-in">
          <h3 className="font-semibold text-[#1A1B3A] mb-3">📹 Your Recent Videos</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {recentVideos.map((v) => (
              <div key={v.video_id} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm hover:shadow-md transition-all">
                <p className="text-sm font-medium text-[#1A1B3A] truncate">{v.video_title || v.video_id}</p>
                <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                  <span className="font-semibold text-[#34D399]">{formatMoney(v.total_gmv)}</span>
                  <span>{v.total_orders} orders</span>
                  <span>{v.days_active}d active</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, color, subtitle }: { icon: React.ReactNode; label: string; value: string; color?: string; subtitle?: string }) {
  return (
    <div className="bg-white/80 backdrop-blur border border-gray-100 rounded-2xl p-4 sm:p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 group">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium uppercase tracking-wider text-gray-400">{label}</span>
        <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-pink-50 to-pink-100/50 flex items-center justify-center text-[#FF4D8D]">
          {icon}
        </div>
      </div>
      <p className={`text-2xl sm:text-3xl font-extrabold ${color === 'mint' ? 'text-[#34D399]' : 'text-[#1A1B3A]'}`}>{value}</p>
      {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
    </div>
  );
}

function PaceRing({ current, target }: { current: number; target: number }) {
  const pct = Math.min(1, current / target);
  const circumference = 2 * Math.PI * 52;
  const offset = circumference * (1 - pct);

  return (
    <div className="relative w-28 h-28 flex-shrink-0">
      <svg viewBox="0 0 120 120" className="w-full h-full">
        <circle cx="60" cy="60" r="52" fill="none" stroke="#E5E7EB" strokeWidth="8" />
        <circle
          cx="60" cy="60" r="52" fill="none"
          stroke="url(#paceGrad)" strokeWidth="8" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          transform="rotate(-90 60 60)"
          className="transition-all duration-1000"
        />
        <defs>
          <linearGradient id="paceGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#FF4D8D" />
            <stop offset="100%" stopColor="#7C5CFC" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-bold text-[#1A1B3A]">{current}</span>
        <span className="text-xs text-gray-400">of {target}</span>
      </div>
    </div>
  );
}

function daysLeftInMonth(): number {
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return lastDay - now.getDate();
}
