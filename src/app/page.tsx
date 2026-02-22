import { TempoLogo } from '@/components/ui/tempo-logo';
import { MobileNav } from '@/components/landing/mobile-nav';
import { ScrollReveal } from '@/components/landing/scroll-reveal';
import {
  BarChart3,
  Brain,
  Building2,
  FileText,
  FileSpreadsheet,
  EyeOff,
  Flame,
  Target,
  Database,
  Rocket,
  Link,
  TrendingUp,
  Sprout,
  Check,
  ArrowRight,
  Twitter,
  Github,
  Linkedin,
  ChevronDown,
} from 'lucide-react';

const navLinks = [
  { label: 'Features', href: '#features' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'About', href: '#how-it-works' },
];

/* ─── Navbar ─── */
function Navbar() {
  return (
    <header className="fixed top-0 left-0 right-0 z-40 bg-white/70 backdrop-blur-xl border-b border-[#E5E7EB]/60">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <TempoLogo size="md" animated={false} />
        <nav className="hidden md:flex items-center gap-8">
          {navLinks.map((l) => (
            <a key={l.href} href={l.href} className="text-sm font-medium text-[#6B7280] hover:text-[#1A1B3A] transition-colors">
              {l.label}
            </a>
          ))}
        </nav>
        <div className="hidden md:block">
          <a
            href="#cta"
            className="inline-flex items-center rounded-full px-5 py-2 text-sm font-semibold text-white bg-gradient-to-r from-[#FF4D8D] to-[#7C5CFC] hover:shadow-lg hover:shadow-[#FF4D8D]/25 hover:scale-105 transition-all duration-200"
          >
            Book a Demo
          </a>
        </div>
        <MobileNav />
      </div>
    </header>
  );
}

/* ─── Hero ─── */
function Hero() {
  return (
    <section className="pt-32 pb-20 md:pt-40 md:pb-28 px-6 overflow-hidden">
      <div className="max-w-7xl mx-auto grid md:grid-cols-2 gap-12 items-center">
        <div className="space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full bg-[#FF4D8D]/10 px-4 py-1.5 text-sm font-medium text-[#FF4D8D]">
            <span className="w-2 h-2 rounded-full bg-[#FF4D8D] animate-pulse" />
            Now Accepting New Clients
          </div>
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-[#1A1B3A] leading-[1.1]">
            Creator Management,{' '}
            <span className="bg-gradient-to-r from-[#FF4D8D] to-[#7C5CFC] bg-clip-text text-transparent">Simplified</span>
          </h1>
          <p className="text-lg md:text-xl text-[#6B7280] max-w-lg leading-relaxed">
            Whether you&apos;re a brand managing your own creator program or an agency scaling across dozens of brands, your data shouldn&apos;t live in spreadsheets. Tempo puts it all in one place.
          </p>
          <div className="flex flex-wrap gap-4 pt-2">
            <a
              href="#cta"
              className="inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-sm font-semibold text-white bg-gradient-to-r from-[#FF4D8D] to-[#7C5CFC] hover:shadow-xl hover:shadow-[#FF4D8D]/30 hover:scale-105 transition-all duration-200"
            >
              Book a Demo <ArrowRight className="w-4 h-4" />
            </a>
            <a
              href="#how-it-works"
              className="inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-sm font-semibold text-[#1A1B3A] border border-[#E5E7EB] hover:border-[#FF4D8D]/40 hover:bg-[#FF4D8D]/5 transition-all duration-200"
            >
              See How It Works
            </a>
          </div>
        </div>

        {/* Dashboard mockup */}
        <div className="relative">
          <div className="absolute -inset-4 bg-gradient-to-r from-[#FF4D8D]/20 to-[#7C5CFC]/20 rounded-3xl blur-3xl" />
          <div className="relative rounded-2xl bg-white border border-[#E5E7EB] shadow-2xl shadow-[#7C5CFC]/10 overflow-hidden">
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
                <span>JiYu</span>
                <ChevronDown className="w-3 h-3 opacity-60" />
              </div>
            </div>

            <div className="p-5 space-y-4">
              {/* Stat cards */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl bg-[#F8F9FC] border border-[#E5E7EB]/60 p-3.5">
                  <p className="text-[10px] text-[#9CA3AF] font-medium uppercase tracking-wide">Total GMV</p>
                  <p className="text-xl font-bold text-[#1A1B3A] mt-1">$218,580</p>
                  <p className="text-xs font-semibold text-[#34D399] mt-0.5">+24% vs last month</p>
                </div>
                <div className="rounded-xl bg-[#F8F9FC] border border-[#E5E7EB]/60 p-3.5">
                  <p className="text-[10px] text-[#9CA3AF] font-medium uppercase tracking-wide">Active Creators</p>
                  <p className="text-xl font-bold text-[#1A1B3A] mt-1">142</p>
                  <p className="text-xs font-semibold text-[#FF4D8D] mt-0.5">+12 this week</p>
                </div>
                <div className="rounded-xl bg-[#F8F9FC] border border-[#E5E7EB]/60 p-3.5">
                  <p className="text-[10px] text-[#9CA3AF] font-medium uppercase tracking-wide">Top Video GMV</p>
                  <p className="text-xl font-bold text-[#1A1B3A] mt-1">$8,470</p>
                  <p className="text-xs font-semibold text-[#7C5CFC] mt-0.5">@shopbyjake</p>
                </div>
              </div>

              {/* Realistic area chart */}
              <div className="rounded-xl bg-[#F8F9FC] border border-[#E5E7EB]/60 p-4 relative overflow-hidden">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-[#1A1B3A]">GMV Trend — Last 30 Days</p>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-[#FF4D8D]" /><span className="text-[10px] text-[#9CA3AF]">GMV</span></div>
                    <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-[#7C5CFC]" /><span className="text-[10px] text-[#9CA3AF]">Orders</span></div>
                  </div>
                </div>
                <svg className="w-full h-36" viewBox="0 0 500 120" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="heroChartGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#FF4D8D" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="#FF4D8D" stopOpacity="0.02" />
                    </linearGradient>
                  </defs>
                  {/* Grid lines */}
                  <line x1="0" y1="30" x2="500" y2="30" stroke="#E5E7EB" strokeWidth="0.5" />
                  <line x1="0" y1="60" x2="500" y2="60" stroke="#E5E7EB" strokeWidth="0.5" />
                  <line x1="0" y1="90" x2="500" y2="90" stroke="#E5E7EB" strokeWidth="0.5" />
                  {/* Area fill */}
                  <path d="M0,85 L17,80 L34,72 L51,78 L68,65 L85,70 L102,58 L119,62 L136,50 L153,55 L170,48 L187,52 L204,40 L221,45 L238,38 L255,42 L272,35 L289,30 L306,38 L323,28 L340,32 L357,25 L374,22 L391,28 L408,18 L425,22 L442,15 L459,20 L476,12 L500,8 L500,120 L0,120Z" fill="url(#heroChartGrad)" />
                  {/* Line */}
                  <path d="M0,85 L17,80 L34,72 L51,78 L68,65 L85,70 L102,58 L119,62 L136,50 L153,55 L170,48 L187,52 L204,40 L221,45 L238,38 L255,42 L272,35 L289,30 L306,38 L323,28 L340,32 L357,25 L374,22 L391,28 L408,18 L425,22 L442,15 L459,20 L476,12 L500,8" fill="none" stroke="#FF4D8D" strokeWidth="2" />
                  {/* Data dots */}
                  <circle cx="136" cy="50" r="2.5" fill="#FF4D8D" />
                  <circle cx="272" cy="35" r="2.5" fill="#FF4D8D" />
                  <circle cx="408" cy="18" r="2.5" fill="#FF4D8D" />
                  <circle cx="500" cy="8" r="2.5" fill="#FF4D8D" />
                </svg>
              </div>

              {/* Creator leaderboard */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-[#1A1B3A]">Top Creators</p>
                  <p className="text-[10px] text-[#9CA3AF] font-medium">This Month</p>
                </div>
                <div className="space-y-1.5">
                  {[
                    { rank: 1, name: '@shopbyjake', gmv: '$218,580', videos: 34 },
                    { rank: 2, name: '@evewellness1', gmv: '$220,407', videos: 28 },
                    { rank: 3, name: '@_naturalhealing', gmv: '$128,402', videos: 41 },
                  ].map((c) => (
                    <div key={c.name} className="flex items-center justify-between rounded-lg bg-[#F8F9FC] border border-[#E5E7EB]/60 px-3.5 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <span className="text-[10px] font-bold text-[#9CA3AF] w-4 text-center">#{c.rank}</span>
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#FF4D8D] to-[#7C5CFC] flex items-center justify-center">
                          <span className="text-[9px] font-bold text-white">{c.name.charAt(1).toUpperCase()}</span>
                        </div>
                        <span className="text-sm font-medium text-[#1A1B3A]">{c.name}</span>
                      </div>
                      <div className="flex items-center gap-4 text-xs">
                        <span className="font-semibold text-[#1A1B3A]">{c.gmv} <span className="text-[#9CA3AF] font-normal">GMV</span></span>
                        <span className="text-[#6B7280]">{c.videos} videos</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Stats Bar ─── */
function StatsBar() {
  const stats = [
    { value: '10,000+', label: 'Creators Managed' },
    { value: '$100M+', label: 'GMV Tracked' },
    { value: '1M+', label: 'Videos Analyzed' },
    { value: '50+', label: 'Brands Onboarded' },
  ];
  return (
    <section className="border-y border-[#E5E7EB] bg-[#F8F9FC]/50">
      <div className="max-w-7xl mx-auto px-6 py-12 grid grid-cols-2 md:grid-cols-4 gap-8">
        {stats.map((s) => (
          <div key={s.label} className="text-center">
            <p className="text-3xl md:text-4xl font-extrabold bg-gradient-to-r from-[#FF4D8D] to-[#7C5CFC] bg-clip-text text-transparent">{s.value}</p>
            <p className="text-sm text-[#6B7280] mt-1 font-medium">{s.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ─── The Problem ─── */
function TheProblem() {
  const problems = [
    { icon: FileSpreadsheet, title: 'Death by Spreadsheet', desc: "Whether you're a brand team or an agency, you're exporting CSVs every morning, copy-pasting into Google Sheets, and praying the formulas don't break. There's gotta be a better way." },
    { icon: EyeOff, title: 'Flying Blind', desc: "A creator's video went viral yesterday and nobody on your team knew until someone else brought it up. Brand managers and agency operators alike deserve real-time visibility." },
    { icon: Flame, title: 'Scaling = More Chaos', desc: "Every new brand or creator roster means another dashboard, another data source, another tab to keep track of. Growth shouldn't feel like drowning." },
  ];
  return (
    <section className="py-24 px-6">
      <div className="max-w-5xl mx-auto">
        <ScrollReveal className="text-center mb-16">
          <h2 className="text-3xl md:text-5xl font-extrabold text-[#1A1B3A] tracking-tight">Sound familiar?</h2>
        </ScrollReveal>
        <div className="grid md:grid-cols-3 gap-6">
          {problems.map((p, i) => (
            <ScrollReveal key={p.title} delay={i * 100}>
              <div className="group relative rounded-2xl border border-[#E5E7EB]/80 bg-white/60 backdrop-blur-xl p-6 hover:border-[#FF4D8D]/30 hover:shadow-xl hover:shadow-[#FF4D8D]/10 hover:-translate-y-1 transition-all duration-300">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#FF4D8D]/10 to-[#7C5CFC]/10 flex items-center justify-center mb-4 group-hover:from-[#FF4D8D]/20 group-hover:to-[#7C5CFC]/20 transition-colors">
                  <p.icon className="w-6 h-6 text-[#FF4D8D]" />
                </div>
                <h3 className="text-lg font-bold text-[#1A1B3A] mb-2">{p.title}</h3>
                <p className="text-sm text-[#6B7280] leading-relaxed">{p.desc}</p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Features ─── */
function Features() {
  const features = [
    { icon: BarChart3, title: 'Real-Time Analytics', desc: 'GMV, orders, commission, creator performance. Updated daily, not whenever someone remembers to export the CSV.' },
    { icon: Brain, title: 'Creator Intelligence', desc: "Know who's crushing it and who needs a nudge. Spot your next star creator before anyone else does." },
    { icon: Building2, title: 'Multi-Brand Management', desc: 'Switch between brands in one click. Same dashboard, same workflow, whether you manage 2 brands or 20.' },
    { icon: FileText, title: 'Automated Reporting', desc: "Wake up to a daily brief in your inbox. No more Monday morning scrambles to pull last week's numbers." },
  ];
  return (
    <section id="features" className="py-24 px-6 scroll-mt-20">
      <div className="max-w-7xl mx-auto">
        <ScrollReveal className="text-center mb-16">
          <p className="text-sm font-semibold text-[#FF4D8D] uppercase tracking-wider mb-3">Features</p>
          <h2 className="text-3xl md:text-5xl font-extrabold text-[#1A1B3A] tracking-tight">Everything you need to win on TikTok Shop</h2>
          <p className="text-[#6B7280] mt-4 max-w-2xl mx-auto text-lg">Whether you run a brand in-house or manage creators for dozens of clients, Tempo gives you the tools to stay ahead.</p>
        </ScrollReveal>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((f, i) => (
            <ScrollReveal key={f.title} delay={i * 100}>
              <div className="group relative rounded-2xl border border-[#E5E7EB]/80 bg-white/60 backdrop-blur-xl p-6 hover:border-[#FF4D8D]/30 hover:shadow-xl hover:shadow-[#FF4D8D]/10 hover:-translate-y-1 transition-all duration-300">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#FF4D8D]/10 to-[#7C5CFC]/10 flex items-center justify-center mb-4 group-hover:from-[#FF4D8D]/20 group-hover:to-[#7C5CFC]/20 transition-colors">
                  <f.icon className="w-6 h-6 text-[#FF4D8D]" />
                </div>
                <h3 className="text-lg font-bold text-[#1A1B3A] mb-2">{f.title}</h3>
                <p className="text-sm text-[#6B7280] leading-relaxed">{f.desc}</p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── How It Works ─── */
function HowItWorks() {
  const steps = [
    { icon: Link, title: 'Connect', desc: 'Link your TikTok Shop accounts in minutes. We handle the API complexity.' },
    { icon: TrendingUp, title: 'Track', desc: 'Watch real-time data flow in. Creator performance, GMV, and video analytics — all in one place.' },
    { icon: Sprout, title: 'Grow', desc: 'Make data-driven decisions. Double down on what works and cut what doesn\'t.' },
  ];
  return (
    <section id="how-it-works" className="py-24 px-6 bg-[#F8F9FC] scroll-mt-20">
      <div className="max-w-5xl mx-auto">
        <ScrollReveal className="text-center mb-16">
          <p className="text-sm font-semibold text-[#7C5CFC] uppercase tracking-wider mb-3">How It Works</p>
          <h2 className="text-3xl md:text-5xl font-extrabold text-[#1A1B3A] tracking-tight">Three steps to clarity</h2>
        </ScrollReveal>
        <div className="grid md:grid-cols-3 gap-8">
          {steps.map((s, i) => (
            <ScrollReveal key={s.title} delay={i * 150}>
              <div className="text-center">
                <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-[#FF4D8D] to-[#7C5CFC] flex items-center justify-center mb-5 shadow-lg shadow-[#FF4D8D]/20">
                  <s.icon className="w-7 h-7 text-white" />
                </div>
                <div className="text-xs font-bold text-[#9CA3AF] uppercase tracking-widest mb-2">Step {i + 1}</div>
                <h3 className="text-xl font-bold text-[#1A1B3A] mb-2">{s.title}</h3>
                <p className="text-sm text-[#6B7280] leading-relaxed">{s.desc}</p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Dashboard Preview ─── */
function DashboardPreview() {
  return (
    <section className="py-24 px-6 overflow-hidden">
      <div className="max-w-6xl mx-auto">
        <ScrollReveal className="text-center mb-12">
          <p className="text-sm font-semibold text-[#FF4D8D] uppercase tracking-wider mb-3">Dashboard Preview</p>
          <h2 className="text-3xl md:text-5xl font-extrabold text-[#1A1B3A] tracking-tight">Your command center</h2>
          <p className="text-[#6B7280] mt-4 max-w-xl mx-auto text-lg">Everything you need, nothing you don&apos;t.</p>
        </ScrollReveal>
        <ScrollReveal>
          <div className="relative">
            <div className="absolute -inset-6 bg-gradient-to-r from-[#FF4D8D]/10 via-[#7C5CFC]/10 to-[#FF4D8D]/10 rounded-[2rem] blur-3xl" />
            <div className="relative rounded-2xl p-[2px] bg-gradient-to-r from-[#FF4D8D] to-[#7C5CFC]">
              <div className="rounded-[14px] bg-white p-6 md:p-8 space-y-6">
                {/* Top row stat cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: 'Total GMV', value: '$847,293' },
                    { label: 'Orders', value: '12,847' },
                    { label: 'Avg Commission', value: '13.8%' },
                    { label: 'Active Creators', value: '487' },
                  ].map((c) => (
                    <div key={c.label} className="rounded-xl bg-[#F8F9FC] border border-[#E5E7EB]/60 p-4">
                      <p className="text-[11px] text-[#9CA3AF] font-medium uppercase tracking-wide">{c.label}</p>
                      <p className="text-2xl font-bold text-[#1A1B3A] mt-1">{c.value}</p>
                    </div>
                  ))}
                </div>
                {/* Chart area */}
                <div className="grid md:grid-cols-3 gap-4">
                  {/* Bar chart with brand labels */}
                  <div className="md:col-span-2 rounded-xl bg-[#F8F9FC] border border-[#E5E7EB]/60 p-5 relative overflow-hidden">
                    <p className="text-sm font-semibold text-[#1A1B3A] mb-4">Revenue by Brand</p>
                    <div className="flex items-end gap-6 h-32 px-4">
                      {[
                        { name: 'JiYu', height: 90, color: '#FF4D8D' },
                        { name: 'Cata-Kor', height: 68, color: '#7C5CFC' },
                        { name: 'Physicians Choice', height: 58, color: '#FFB84D' },
                        { name: 'TopLux', height: 35, color: '#34D399' },
                      ].map((b) => (
                        <div key={b.name} className="flex-1 flex flex-col items-center gap-1">
                          <div className="w-full rounded-t-md" style={{ height: `${b.height}%`, backgroundColor: b.color, opacity: 0.85 }} />
                          <span className="text-[9px] font-medium text-[#6B7280] text-center leading-tight mt-1">{b.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* Brand Split */}
                  <div className="rounded-xl bg-[#F8F9FC] border border-[#E5E7EB]/60 p-5">
                    <p className="text-sm font-semibold text-[#1A1B3A] mb-3">Brand Split</p>
                    <div className="space-y-3">
                      {[
                        { name: 'JiYu', pct: 35, color: '#FF4D8D' },
                        { name: 'Cata-Kor', pct: 28, color: '#7C5CFC' },
                        { name: 'Physicians Choice', pct: 24, color: '#FFB84D' },
                        { name: 'TopLux', pct: 13, color: '#34D399' },
                      ].map((b) => (
                        <div key={b.name}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="font-medium text-[#1A1B3A]">{b.name}</span>
                            <span className="text-[#6B7280]">{b.pct}%</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-[#E5E7EB]">
                            <div className="h-full rounded-full" style={{ width: `${b.pct}%`, backgroundColor: b.color }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                {/* Top Performing Videos */}
                <div className="rounded-xl bg-[#F8F9FC] border border-[#E5E7EB]/60 p-5">
                  <p className="text-sm font-semibold text-[#1A1B3A] mb-3">Top Performing Videos</p>
                  <div className="space-y-2">
                    {[
                      { title: 'Morning routine with JiYu glow serum...', creator: '@shopbyjake', views: '2.4M', gmv: '$12,480' },
                      { title: 'Unboxing the new Cata-Kor starter kit...', creator: '@evewellness1', views: '1.8M', gmv: '$9,230' },
                      { title: 'Why I switched to Physicians Choice...', creator: '@_naturalhealing', views: '1.2M', gmv: '$7,105' },
                    ].map((v) => (
                      <div key={v.title} className="flex items-center justify-between rounded-lg bg-white border border-[#E5E7EB]/60 px-4 py-2.5">
                        <div className="flex-1 min-w-0 mr-4">
                          <p className="text-sm font-medium text-[#1A1B3A] truncate">{v.title}</p>
                          <p className="text-[11px] text-[#9CA3AF]">{v.creator}</p>
                        </div>
                        <div className="flex items-center gap-4 text-xs shrink-0">
                          <span className="text-[#6B7280]">{v.views} views</span>
                          <span className="font-semibold text-[#1A1B3A]">{v.gmv}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}

/* ─── Built Different ─── */
function BuiltDifferent() {
  const items = [
    { icon: Target, title: 'Built for Operators', desc: "We don't build features for demo day. We build what actually saves brand teams and agency operators time at 9 AM on Monday." },
    { icon: Database, title: 'Your Data, Your Way', desc: 'Brands see their full picture. Agencies see their managed creators. Everyone gets exactly what they need.' },
    { icon: Rocket, title: 'Scales With You', desc: 'One brand or twenty. Solo brand manager or full agency team. Same simple product, built to grow with your operation.' },
  ];
  return (
    <section className="py-24 px-6 bg-[#F8F9FC]">
      <div className="max-w-5xl mx-auto">
        <ScrollReveal className="text-center mb-16">
          <p className="text-sm font-semibold text-[#7C5CFC] uppercase tracking-wider mb-3">Why Tempo</p>
          <h2 className="text-3xl md:text-5xl font-extrabold text-[#1A1B3A] tracking-tight">Built by operators, not just engineers</h2>
          <p className="text-[#6B7280] mt-4 max-w-2xl mx-auto text-lg">Tempo was built inside a real TikTok Shop operation managing 500+ creators across multiple brands. Whether you&apos;re a brand team or an agency, every feature exists because operators like you needed it.</p>
        </ScrollReveal>
        <div className="grid md:grid-cols-3 gap-6">
          {items.map((item, i) => (
            <ScrollReveal key={item.title} delay={i * 100}>
              <div className="group relative rounded-2xl border border-[#E5E7EB]/80 bg-white/60 backdrop-blur-xl p-6 hover:border-[#FF4D8D]/30 hover:shadow-xl hover:shadow-[#FF4D8D]/10 hover:-translate-y-1 transition-all duration-300">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#FF4D8D]/10 to-[#7C5CFC]/10 flex items-center justify-center mb-4 group-hover:from-[#FF4D8D]/20 group-hover:to-[#7C5CFC]/20 transition-colors">
                  <item.icon className="w-6 h-6 text-[#7C5CFC]" />
                </div>
                <h3 className="text-lg font-bold text-[#1A1B3A] mb-2">{item.title}</h3>
                <p className="text-sm text-[#6B7280] leading-relaxed">{item.desc}</p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Pricing ─── */
function Pricing() {
  const tiers = [
    {
      name: 'Brand',
      price: '$999',
      period: '/mo',
      desc: 'For brands managing their own creators',
      features: ['1 brand', 'Full analytics suite', 'Creator portal', 'Daily briefs & alerts', 'Up to 3 team seats', 'Priority support'],
      cta: 'Book a Demo',
      popular: false,
    },
    {
      name: 'Agency',
      price: '$1,999',
      period: '/mo',
      desc: 'For agencies managing multiple brands',
      features: ['Up to 5 brands', 'Everything in Brand', 'Multi-brand dashboard', 'Up to 10 team seats', 'Dedicated onboarding'],
      cta: 'Book a Demo',
      popular: false,
    },
    {
      name: 'Scale',
      price: '$3,499',
      period: '/mo',
      desc: 'For growing operations',
      features: ['Up to 15 brands', 'Everything in Agency', 'Unlimited team seats', 'API access', 'Custom reporting'],
      cta: 'Book a Demo',
      popular: true,
    },
    {
      name: 'Enterprise',
      price: 'Custom',
      period: '',
      desc: 'For large-scale operations',
      features: ['Unlimited brands', 'Everything in Scale', 'White-label options', 'Dedicated support & SLA', 'Custom integrations'],
      cta: 'Contact Sales',
      popular: false,
    },
  ];
  return (
    <section id="pricing" className="py-24 px-6 bg-[#F8F9FC] scroll-mt-20">
      <div className="max-w-6xl mx-auto">
        <ScrollReveal className="text-center mb-16">
          <p className="text-sm font-semibold text-[#FF4D8D] uppercase tracking-wider mb-3">Pricing</p>
          <h2 className="text-3xl md:text-5xl font-extrabold text-[#1A1B3A] tracking-tight">Simple, transparent pricing</h2>
          <p className="text-[#6B7280] mt-4 text-lg">No free tier. No fluff. Just the tools you need to win.</p>
        </ScrollReveal>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
          {tiers.map((t, i) => (
            <ScrollReveal key={t.name} delay={i * 100}>
              <div
                className={`relative rounded-2xl p-[1px] h-full ${
                  t.popular ? 'bg-gradient-to-b from-[#FF4D8D] to-[#7C5CFC] mt-0 md:mt-0' : 'bg-[#E5E7EB]'
                }`}
              >
                {t.popular && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-10 px-4 py-1 rounded-full bg-gradient-to-r from-[#FF4D8D] to-[#7C5CFC] text-xs font-semibold text-white whitespace-nowrap">
                    Most Popular
                  </div>
                )}
                <div className={`rounded-[15px] bg-white p-6 md:p-8 h-full flex flex-col ${t.popular ? 'pt-8 md:pt-10' : ''}`}>
                  <h3 className="text-lg font-bold text-[#1A1B3A]">{t.name}</h3>
                  <p className="text-sm text-[#6B7280] mt-1">{t.desc}</p>
                  <div className="mt-5 mb-6">
                    <span className="text-4xl font-extrabold text-[#1A1B3A]">{t.price}</span>
                    <span className="text-[#6B7280] text-sm">{t.period}</span>
                  </div>
                  <ul className="space-y-3 flex-1">
                    {t.features.map((f) => (
                      <li key={f} className="flex items-center gap-2.5 text-sm text-[#4B5563]">
                        <Check className="w-4 h-4 text-[#FF4D8D] flex-shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <a
                    href="#cta"
                    className={`mt-8 inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-semibold transition-all duration-200 ${
                      t.popular
                        ? 'text-white bg-gradient-to-r from-[#FF4D8D] to-[#7C5CFC] hover:shadow-lg hover:shadow-[#FF4D8D]/25 hover:scale-105'
                        : 'text-[#1A1B3A] border border-[#E5E7EB] hover:border-[#FF4D8D]/40 hover:bg-[#FF4D8D]/5'
                    }`}
                  >
                    {t.cta}
                  </a>
                </div>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── FAQ ─── */
function Faq() {
  const faqs = [
    { q: 'What platforms does Tempo support?', a: "We're laser-focused on TikTok Shop right now. That's where the biggest opportunity is, and we'd rather be the best TikTok Shop tool than a mediocre everything tool." },
    { q: 'How does data get into Tempo?', a: "Right now, through a simple daily upload. We're building direct TikTok API integration that will make it fully automatic." },
    { q: 'Can multiple agencies use Tempo for the same brand?', a: 'Yes. Each agency sees the full brand data (winning videos, trending products) but earnings and creator management are scoped to their roster. No conflicts.' },
    { q: 'Is my data secure?', a: 'Your data is isolated at the database level using row-level security. Other tenants can never see your data, period. We use Supabase (built on Postgres) with enterprise-grade encryption.' },
    { q: 'What if I manage creators AND am a brand?', a: 'Tempo handles both. Brand owners see everything. Agency managers see their slice. Same product, different views based on your role.' },
  ];
  return (
    <section className="py-24 px-6">
      <div className="max-w-3xl mx-auto">
        <ScrollReveal className="text-center mb-16">
          <p className="text-sm font-semibold text-[#FF4D8D] uppercase tracking-wider mb-3">FAQ</p>
          <h2 className="text-3xl md:text-5xl font-extrabold text-[#1A1B3A] tracking-tight">Questions? We&apos;ve got answers.</h2>
        </ScrollReveal>
        <div className="space-y-6">
          {faqs.map((faq, i) => (
            <ScrollReveal key={i} delay={i * 80}>
              <div className="rounded-2xl border border-[#E5E7EB]/80 bg-white/60 backdrop-blur-xl p-6">
                <h3 className="text-base font-bold text-[#1A1B3A] mb-2">{faq.q}</h3>
                <p className="text-sm text-[#6B7280] leading-relaxed">{faq.a}</p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── CTA ─── */
function CtaSection() {
  return (
    <section id="cta" className="py-24 px-6 scroll-mt-20">
      <div className="max-w-3xl mx-auto text-center">
        <ScrollReveal>
          <h2 className="text-3xl md:text-5xl font-extrabold text-[#1A1B3A] tracking-tight">
            Ready to see Tempo in action?
          </h2>
          <p className="text-[#6B7280] mt-4 text-lg">Book a demo and we&apos;ll show you exactly how Tempo fits your operation.</p>
          <div className="mt-8">
            <a
              href="#pricing"
              className="inline-flex items-center gap-2 rounded-full px-8 py-4 text-sm font-semibold text-white bg-gradient-to-r from-[#FF4D8D] to-[#7C5CFC] hover:shadow-xl hover:shadow-[#FF4D8D]/30 hover:scale-105 transition-all duration-200"
            >
              Book a Demo <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}

/* ─── Footer ─── */
function Footer() {
  return (
    <footer className="border-t border-[#E5E7EB] bg-white">
      <div className="max-w-7xl mx-auto px-6 py-12 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-6">
          <TempoLogo size="sm" animated={false} />
          <span className="text-sm text-[#9CA3AF]">© 2026 Tempo. All rights reserved.</span>
        </div>
        <div className="flex items-center gap-6">
          {['Privacy', 'Terms', 'Contact'].map((l) => (
            <a key={l} href="#" className="text-sm text-[#6B7280] hover:text-[#1A1B3A] transition-colors">{l}</a>
          ))}
          <div className="flex items-center gap-3 ml-2">
            <a href="#" className="text-[#9CA3AF] hover:text-[#1A1B3A] transition-colors"><Twitter className="w-4 h-4" /></a>
            <a href="#" className="text-[#9CA3AF] hover:text-[#1A1B3A] transition-colors"><Linkedin className="w-4 h-4" /></a>
            <a href="#" className="text-[#9CA3AF] hover:text-[#1A1B3A] transition-colors"><Github className="w-4 h-4" /></a>
          </div>
        </div>
      </div>
    </footer>
  );
}

/* ─── Page ─── */
export default function Home() {
  return (
    <div className="min-h-screen bg-[#F8F9FC]">
      <Navbar />
      <main>
        <Hero />
        <StatsBar />
        <TheProblem />
        <Features />
        <HowItWorks />
        <DashboardPreview />
        <BuiltDifferent />
        <Pricing />
        <Faq />
        <CtaSection />
      </main>
      <Footer />
    </div>
  );
}
