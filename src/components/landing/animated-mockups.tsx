'use client';

import { useEffect, useRef } from 'react';
import { CountUp } from './count-up';

function useInView(threshold = 0.2) {
  const ref = useRef<HTMLDivElement>(null);
  const visible = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && !visible.current) {
          visible.current = true;
          el.classList.add('in-view');
          obs.unobserve(el);
        }
      },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);

  return ref;
}

/* ─── Hero Dashboard Mockup ─── */
export function HeroDashboardMockup() {
  const ref = useInView(0.15);

  return (
    <div ref={ref} className="group/mock relative [&.in-view_.draw-line]:animate-draw [&.in-view_.slide-row]:animate-slideUp [&.in-view_.fade-stat]:animate-fadeIn">
      {/* Floating glow */}
      <div className="absolute -inset-8 bg-gradient-to-r from-[#FF4D8D]/15 to-[#7C5CFC]/15 rounded-3xl blur-3xl animate-pulse-slow" />

      <div className="relative rounded-2xl bg-white border border-[#E5E7EB] shadow-2xl shadow-[#7C5CFC]/10 overflow-hidden"
        style={{ transform: 'perspective(1200px) rotateY(-5deg)' }}>
        {/* Top bar */}
        <div className="flex items-center justify-between px-5 py-3 bg-[#1A1B3A] text-white">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-[#FF4D8D] to-[#7C5CFC] flex items-center justify-center">
              <span className="text-[9px] font-bold">T</span>
            </div>
            <span className="text-sm font-semibold">Tempo Dashboard</span>
          </div>
          <div className="flex items-center gap-2 bg-white/10 rounded-md px-3 py-1.5 text-xs font-medium">
            <div className="w-4 h-4 rounded-sm bg-[#FF4D8D]/80" />
            <span>Glow Skin Co</span>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Stat cards */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Total GMV', value: 218580, prefix: '$', trend: '+24%', trendColor: 'text-[#34D399]' },
              { label: 'Active Creators', value: 142, prefix: '', trend: '+12 this week', trendColor: 'text-[#FF4D8D]' },
              { label: 'Top Video GMV', value: 8470, prefix: '$', trend: '@skincare.sarah', trendColor: 'text-[#7C5CFC]' },
            ].map((s, i) => (
              <div key={s.label} className={`fade-stat rounded-xl bg-[#F8F9FC] border border-[#E5E7EB]/60 p-3.5 opacity-0`}
                style={{ animationDelay: `${i * 200}ms` }}>
                <p className="text-[10px] text-[#9CA3AF] font-medium uppercase tracking-wide">{s.label}</p>
                <p className="text-xl font-bold text-[#1A1B3A] mt-1">
                  <CountUp end={s.value} prefix={s.prefix} duration={2200} />
                </p>
                <p className={`text-xs font-semibold ${s.trendColor} mt-0.5`}>{s.trend}</p>
              </div>
            ))}
          </div>

          {/* Chart */}
          <div className="rounded-xl bg-[#F8F9FC] border border-[#E5E7EB]/60 p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-[#1A1B3A]">GMV Trend — Last 30 Days</p>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-[#FF4D8D]" /><span className="text-[10px] text-[#9CA3AF]">GMV</span></div>
              </div>
            </div>
            <svg className="w-full h-32" viewBox="0 0 500 120" preserveAspectRatio="none">
              <defs>
                <linearGradient id="heroGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#FF4D8D" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#FF4D8D" stopOpacity="0.02" />
                </linearGradient>
              </defs>
              <line x1="0" y1="30" x2="500" y2="30" stroke="#E5E7EB" strokeWidth="0.5" />
              <line x1="0" y1="60" x2="500" y2="60" stroke="#E5E7EB" strokeWidth="0.5" />
              <line x1="0" y1="90" x2="500" y2="90" stroke="#E5E7EB" strokeWidth="0.5" />
              <path d="M0,85 L17,80 L34,72 L51,78 L68,65 L85,70 L102,58 L119,62 L136,50 L153,55 L170,48 L187,52 L204,40 L221,45 L238,38 L255,42 L272,35 L289,30 L306,38 L323,28 L340,32 L357,25 L374,22 L391,28 L408,18 L425,22 L442,15 L459,20 L476,12 L500,8 L500,120 L0,120Z" fill="url(#heroGrad)" />
              <path className="draw-line" d="M0,85 L17,80 L34,72 L51,78 L68,65 L85,70 L102,58 L119,62 L136,50 L153,55 L170,48 L187,52 L204,40 L221,45 L238,38 L255,42 L272,35 L289,30 L306,38 L323,28 L340,32 L357,25 L374,22 L391,28 L408,18 L425,22 L442,15 L459,20 L476,12 L500,8"
                fill="none" stroke="#FF4D8D" strokeWidth="2"
                strokeDasharray="800" strokeDashoffset="800"
                style={{ animationDelay: '400ms' }} />
              <circle cx="500" cy="8" r="3" fill="#FF4D8D" className="fade-stat opacity-0" style={{ animationDelay: '1800ms' }} />
            </svg>
          </div>

          {/* Creator rows */}
          <div>
            <p className="text-xs font-semibold text-[#1A1B3A] mb-2">Top Creators</p>
            <div className="space-y-1.5">
              {[
                { rank: 1, name: '@skincare.sarah', gmv: '$24,580', videos: 34 },
                { rank: 2, name: '@wellness.mike', gmv: '$18,320', videos: 28 },
                { rank: 3, name: '@fitness.luna', gmv: '$12,470', videos: 41 },
              ].map((c, i) => (
                <div key={c.name}
                  className="slide-row flex items-center justify-between rounded-lg bg-[#F8F9FC] border border-[#E5E7EB]/60 px-3.5 py-2.5 opacity-0 translate-y-4"
                  style={{ animationDelay: `${800 + i * 150}ms` }}>
                  <div className="flex items-center gap-2.5">
                    <span className="text-[10px] font-bold text-[#9CA3AF] w-4 text-center">#{c.rank}</span>
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#FF4D8D] to-[#7C5CFC] flex items-center justify-center">
                      <span className="text-[9px] font-bold text-white">{c.name.charAt(1).toUpperCase()}</span>
                    </div>
                    <span className="text-sm font-medium text-[#1A1B3A]">{c.name}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="font-semibold text-[#1A1B3A]">{c.gmv}</span>
                    <span className="text-[#6B7280]">{c.videos} videos</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Analytics Mockup (Feature A) ─── */
export function AnalyticsMockup() {
  const ref = useInView();
  return (
    <div ref={ref} className="[&.in-view_.draw-line]:animate-draw [&.in-view_.fade-stat]:animate-fadeIn">
      <div className="absolute -inset-6 bg-gradient-to-br from-[#FF4D8D]/10 to-[#7C5CFC]/10 rounded-3xl blur-3xl" />
      <div className="relative rounded-2xl bg-white border border-[#E5E7EB] shadow-xl p-6 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Total GMV', val: 847293, prefix: '$' },
            { label: 'Orders', val: 12847, prefix: '' },
            { label: 'Avg Commission', val: 13, prefix: '', suffix: '.8%' },
            { label: 'Active Creators', val: 487, prefix: '' },
          ].map((s, i) => (
            <div key={s.label} className="fade-stat rounded-xl bg-[#F8F9FC] border border-[#E5E7EB]/60 p-3 opacity-0" style={{ animationDelay: `${i * 150}ms` }}>
              <p className="text-[10px] text-[#9CA3AF] font-medium uppercase tracking-wide">{s.label}</p>
              <p className="text-lg font-bold text-[#1A1B3A] mt-1">
                <CountUp end={s.val} prefix={s.prefix} duration={2000} />{s.suffix || ''}
              </p>
            </div>
          ))}
        </div>
        <div className="rounded-xl bg-[#F8F9FC] border border-[#E5E7EB]/60 p-4">
          <p className="text-xs font-semibold text-[#1A1B3A] mb-3">Revenue Trend</p>
          <svg className="w-full h-36" viewBox="0 0 500 120" preserveAspectRatio="none">
            <defs>
              <linearGradient id="featAGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#7C5CFC" stopOpacity="0.2" />
                <stop offset="100%" stopColor="#7C5CFC" stopOpacity="0.01" />
              </linearGradient>
            </defs>
            <path d="M0,95 L50,85 L100,70 L150,75 L200,55 L250,60 L300,40 L350,35 L400,25 L450,18 L500,10 L500,120 L0,120Z" fill="url(#featAGrad)" />
            <path className="draw-line" d="M0,95 L50,85 L100,70 L150,75 L200,55 L250,60 L300,40 L350,35 L400,25 L450,18 L500,10"
              fill="none" stroke="#7C5CFC" strokeWidth="2.5"
              strokeDasharray="700" strokeDashoffset="700" />
            <path className="draw-line" d="M0,100 L50,92 L100,88 L150,80 L200,72 L250,68 L300,58 L350,52 L400,45 L450,38 L500,30"
              fill="none" stroke="#FF4D8D" strokeWidth="1.5" strokeDasharray="700" strokeDashoffset="700" style={{ animationDelay: '300ms' }} />
          </svg>
        </div>
      </div>
    </div>
  );
}

/* ─── Creator Leaderboard Mockup (Feature B) ─── */
export function LeaderboardMockup() {
  const ref = useInView();
  return (
    <div ref={ref} className="[&.in-view_.slide-row]:animate-slideUp [&.in-view_.fade-stat]:animate-fadeIn">
      <div className="absolute -inset-6 bg-gradient-to-bl from-[#7C5CFC]/10 to-[#FF4D8D]/10 rounded-3xl blur-3xl" />
      <div className="relative rounded-2xl bg-white border border-[#E5E7EB] shadow-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold text-[#1A1B3A]">Creator Rankings</p>
          <span className="text-[10px] text-[#9CA3AF] font-medium px-2 py-1 bg-[#F8F9FC] rounded-md">This Month</span>
        </div>
        <div className="space-y-2">
          {[
            { rank: 1, name: '@skincare.sarah', gmv: 24580, videos: 34, color: 'from-[#FF4D8D] to-[#FF6B9D]' },
            { rank: 2, name: '@wellness.mike', gmv: 18320, videos: 28, color: 'from-[#7C5CFC] to-[#9B7EFD]' },
            { rank: 3, name: '@fitness.luna', gmv: 12470, videos: 41, color: 'from-[#34D399] to-[#6EE7B7]' },
            { rank: 4, name: '@beauty.jade', gmv: 9840, videos: 22, color: 'from-[#FFB84D] to-[#FFC870]' },
            { rank: 5, name: '@health.alex', gmv: 7290, videos: 19, color: 'from-[#FF4D8D] to-[#7C5CFC]' },
          ].map((c, i) => (
            <div key={c.name}
              className="slide-row flex items-center justify-between rounded-xl bg-[#F8F9FC] border border-[#E5E7EB]/60 px-4 py-3 opacity-0 translate-y-4"
              style={{ animationDelay: `${i * 120}ms` }}>
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-[#9CA3AF] w-5 text-center">#{c.rank}</span>
                <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${c.color} flex items-center justify-center`}>
                  <span className="text-[10px] font-bold text-white">{c.name.charAt(1).toUpperCase()}</span>
                </div>
                <span className="text-sm font-medium text-[#1A1B3A]">{c.name}</span>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <span className="font-semibold text-[#1A1B3A]">
                  <CountUp end={c.gmv} prefix="$" duration={1800} />
                </span>
                <span className="text-[#6B7280]">{c.videos} videos</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Brand Switcher Mockup (Feature C) ─── */
export function BrandSwitcherMockup() {
  const ref = useInView();
  return (
    <div ref={ref} className="[&.in-view_.fade-stat]:animate-fadeIn [&.in-view_.slide-row]:animate-slideUp">
      <div className="absolute -inset-6 bg-gradient-to-br from-[#FF4D8D]/10 to-[#7C5CFC]/10 rounded-3xl blur-3xl" />
      <div className="relative rounded-2xl bg-white border border-[#E5E7EB] shadow-xl p-6 space-y-4">
        {/* Dropdown */}
        <div className="fade-stat opacity-0 rounded-xl border border-[#7C5CFC]/30 bg-[#F8F9FC] p-3" style={{ animationDelay: '0ms' }}>
          <p className="text-[10px] text-[#9CA3AF] font-medium uppercase tracking-wide mb-2">Switch Brand</p>
          <div className="space-y-1.5">
            {[
              { name: 'Glow Skin Co', color: '#FF4D8D', active: true },
              { name: 'FitNation', color: '#7C5CFC', active: false },
              { name: 'Pure Wellness', color: '#34D399', active: false },
              { name: 'NutriCore', color: '#FFB84D', active: false },
            ].map((b, i) => (
              <div key={b.name}
                className={`slide-row flex items-center gap-3 rounded-lg px-3 py-2 opacity-0 translate-y-2 ${b.active ? 'bg-white border border-[#E5E7EB] shadow-sm' : 'hover:bg-white/50'}`}
                style={{ animationDelay: `${200 + i * 100}ms` }}>
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: b.color }} />
                <span className="text-sm font-medium text-[#1A1B3A]">{b.name}</span>
                {b.active && <span className="ml-auto text-[10px] text-[#7C5CFC] font-semibold">Active</span>}
              </div>
            ))}
          </div>
        </div>
        {/* Mini comparison */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { brand: 'Glow Skin Co', gmv: 218580, color: '#FF4D8D' },
            { brand: 'FitNation', gmv: 164230, color: '#7C5CFC' },
          ].map((b, i) => (
            <div key={b.brand} className="fade-stat rounded-xl border border-[#E5E7EB]/60 bg-[#F8F9FC] p-3 opacity-0" style={{ animationDelay: `${600 + i * 150}ms` }}>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: b.color }} />
                <span className="text-[10px] text-[#9CA3AF] font-medium">{b.brand}</span>
              </div>
              <p className="text-lg font-bold text-[#1A1B3A]"><CountUp end={b.gmv} prefix="$" duration={2000} /></p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Daily Brief Mockup (Feature D) ─── */
export function DailyBriefMockup() {
  const ref = useInView();
  return (
    <div ref={ref} className="[&.in-view_.slide-row]:animate-slideRight [&.in-view_.fade-stat]:animate-fadeIn">
      <div className="absolute -inset-6 bg-gradient-to-bl from-[#7C5CFC]/10 to-[#FF4D8D]/10 rounded-3xl blur-3xl" />
      <div className="relative rounded-2xl bg-white border border-[#E5E7EB] shadow-xl p-6">
        <div className="slide-row opacity-0 -translate-x-4" style={{ animationDelay: '200ms' }}>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#FF4D8D] to-[#7C5CFC] flex items-center justify-center">
              <span className="text-xs font-bold text-white">T</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-[#1A1B3A]">Daily Brief — Feb 21</p>
              <p className="text-[10px] text-[#9CA3AF]">Glow Skin Co • 8:00 AM</p>
            </div>
          </div>

          <div className="space-y-3 ml-11">
            {[
              { icon: '📈', text: 'GMV up 18% vs last week', color: 'text-[#34D399]' },
              { icon: '⭐', text: '3 creators hit new highs', color: 'text-[#7C5CFC]' },
              { icon: '🔥', text: 'Top video: 2.1M views', color: 'text-[#FF4D8D]' },
              { icon: '📦', text: '847 orders yesterday', color: 'text-[#1A1B3A]' },
            ].map((item, i) => (
              <div key={i} className="fade-stat flex items-center gap-2 opacity-0" style={{ animationDelay: `${500 + i * 150}ms` }}>
                <span className="text-sm">{item.icon}</span>
                <span className={`text-sm font-medium ${item.color}`}>{item.text}</span>
              </div>
            ))}
          </div>

          <div className="mt-5 ml-11 fade-stat opacity-0" style={{ animationDelay: '1100ms' }}>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#FF4D8D]/10 to-[#7C5CFC]/10 px-3 py-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-[#34D399] animate-pulse" />
              <span className="text-[11px] font-medium text-[#1A1B3A]">All systems nominal</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
