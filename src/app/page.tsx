import { TempoLogo } from '@/components/ui/tempo-logo';
import { MobileNav } from '@/components/landing/mobile-nav';
import { ScrollReveal } from '@/components/landing/scroll-reveal';
import {
  BarChart3,
  Brain,
  Building2,
  FileText,
  Link,
  TrendingUp,
  Sprout,
  Check,
  ArrowRight,
  Twitter,
  Github,
  Linkedin,
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
            Get Started
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
            Now in Early Access
          </div>
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-[#1A1B3A] leading-[1.1]">
            Creator Management,{' '}
            <span className="bg-gradient-to-r from-[#FF4D8D] to-[#7C5CFC] bg-clip-text text-transparent">Simplified</span>
          </h1>
          <p className="text-lg md:text-xl text-[#6B7280] max-w-lg leading-relaxed">
            Stop drowning in spreadsheets. Track your TikTok Shop creators, monitor GMV in real time, and scale what&apos;s working — all from one dashboard.
          </p>
          <div className="flex flex-wrap gap-4 pt-2">
            <a
              href="#cta"
              className="inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-sm font-semibold text-white bg-gradient-to-r from-[#FF4D8D] to-[#7C5CFC] hover:shadow-xl hover:shadow-[#FF4D8D]/30 hover:scale-105 transition-all duration-200"
            >
              Request Early Access <ArrowRight className="w-4 h-4" />
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
          <div className="relative rounded-2xl bg-white border border-[#E5E7EB] shadow-2xl shadow-[#7C5CFC]/10 p-6 space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b border-[#E5E7EB]">
              <div className="w-3 h-3 rounded-full bg-[#FF4D8D]" />
              <div className="w-3 h-3 rounded-full bg-[#FFB84D]" />
              <div className="w-3 h-3 rounded-full bg-[#34D399]" />
              <span className="ml-auto text-xs text-[#9CA3AF] font-medium">Tempo Dashboard</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'GMV Today', value: '$12,847', change: '+23%', color: '#34D399' },
                { label: 'Active Creators', value: '142', change: '+8', color: '#FF4D8D' },
                { label: 'Videos Live', value: '1,203', change: '+47', color: '#7C5CFC' },
              ].map((s) => (
                <div key={s.label} className="rounded-xl bg-[#F8F9FC] p-3">
                  <p className="text-[10px] text-[#9CA3AF] font-medium uppercase tracking-wide">{s.label}</p>
                  <p className="text-lg font-bold text-[#1A1B3A] mt-1">{s.value}</p>
                  <p className="text-xs font-semibold mt-0.5" style={{ color: s.color }}>{s.change}</p>
                </div>
              ))}
            </div>
            {/* Fake chart */}
            <div className="h-32 rounded-xl bg-[#F8F9FC] p-4 relative overflow-hidden">
              <svg className="w-full h-full" viewBox="0 0 400 100" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#FF4D8D" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#FF4D8D" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d="M0,80 Q50,60 100,50 T200,30 T300,45 T400,15 L400,100 L0,100Z" fill="url(#chartGrad)" />
                <path d="M0,80 Q50,60 100,50 T200,30 T300,45 T400,15" fill="none" stroke="#FF4D8D" strokeWidth="2.5" />
              </svg>
              <p className="absolute top-4 left-4 text-xs font-semibold text-[#1A1B3A]">GMV Trend — Last 7 Days</p>
            </div>
            {/* Creator rows */}
            <div className="space-y-2">
              {[
                { name: '@sarah_reviews', gmv: '$3,241', videos: 18 },
                { name: '@fitlife.mike', gmv: '$2,890', videos: 12 },
                { name: '@beauty.luna', gmv: '$1,756', videos: 24 },
              ].map((c) => (
                <div key={c.name} className="flex items-center justify-between rounded-lg bg-[#F8F9FC] px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#FF4D8D] to-[#7C5CFC]" />
                    <span className="text-sm font-medium text-[#1A1B3A]">{c.name}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-[#6B7280]">
                    <span className="font-semibold text-[#1A1B3A]">{c.gmv}</span>
                    <span>{c.videos} vids</span>
                  </div>
                </div>
              ))}
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
    { value: '500+', label: 'Creators Managed' },
    { value: '$2M+', label: 'GMV Tracked' },
    { value: '4', label: 'Brands Live' },
    { value: '10K+', label: 'Videos Analyzed' },
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

/* ─── Features ─── */
function Features() {
  const features = [
    { icon: BarChart3, title: 'Real-Time Analytics', desc: 'Track GMV, orders, and creator performance as it happens. No more waiting for yesterday\'s numbers.' },
    { icon: Brain, title: 'Creator Intelligence', desc: 'Know which creators are winning and why. Surface top performers and spot trends before your competitors.' },
    { icon: Building2, title: 'Multi-Brand Management', desc: 'Manage multiple brands from one dashboard. Switch context in seconds, not hours.' },
    { icon: FileText, title: 'Automated Reporting', desc: 'Daily briefs and insights delivered to you. Wake up knowing exactly where you stand.' },
  ];
  return (
    <section id="features" className="py-24 px-6 scroll-mt-20">
      <div className="max-w-7xl mx-auto">
        <ScrollReveal className="text-center mb-16">
          <p className="text-sm font-semibold text-[#FF4D8D] uppercase tracking-wider mb-3">Features</p>
          <h2 className="text-3xl md:text-5xl font-extrabold text-[#1A1B3A] tracking-tight">Everything you need to win on TikTok Shop</h2>
          <p className="text-[#6B7280] mt-4 max-w-2xl mx-auto text-lg">Built by agency operators who were tired of duct-taping spreadsheets together.</p>
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
                {/* Top row */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: 'Total GMV', value: '$127,493', sub: '↑ 18% vs last week' },
                    { label: 'Orders', value: '3,847', sub: '↑ 12% vs last week' },
                    { label: 'Avg. Commission', value: '14.2%', sub: 'Across all creators' },
                    { label: 'Top Creator', value: '@sarah_reviews', sub: '$12,490 GMV' },
                  ].map((c) => (
                    <div key={c.label} className="rounded-xl bg-[#F8F9FC] p-4">
                      <p className="text-[11px] text-[#9CA3AF] font-medium uppercase tracking-wide">{c.label}</p>
                      <p className="text-xl font-bold text-[#1A1B3A] mt-1">{c.value}</p>
                      <p className="text-xs text-[#34D399] font-medium mt-0.5">{c.sub}</p>
                    </div>
                  ))}
                </div>
                {/* Chart area */}
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="md:col-span-2 rounded-xl bg-[#F8F9FC] p-5 h-48 relative overflow-hidden">
                    <p className="text-sm font-semibold text-[#1A1B3A] mb-2">Revenue by Brand</p>
                    <div className="flex items-end gap-3 h-28 px-2">
                      {[65, 45, 80, 55, 90, 70, 85].map((h, i) => (
                        <div key={i} className="flex-1 rounded-t-md bg-gradient-to-t from-[#FF4D8D] to-[#7C5CFC]" style={{ height: `${h}%`, opacity: 0.6 + i * 0.05 }} />
                      ))}
                    </div>
                  </div>
                  <div className="rounded-xl bg-[#F8F9FC] p-5">
                    <p className="text-sm font-semibold text-[#1A1B3A] mb-3">Brand Split</p>
                    <div className="space-y-3">
                      {[
                        { name: 'JiYu', pct: 42, color: '#FF4D8D' },
                        { name: 'Catakor', pct: 28, color: '#7C5CFC' },
                        { name: 'TopLux', pct: 18, color: '#FFB84D' },
                        { name: 'Other', pct: 12, color: '#34D399' },
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
              </div>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}

/* ─── Pricing ─── */
function Pricing() {
  const tiers = [
    {
      name: 'Starter',
      price: 'Free',
      period: '',
      desc: 'Perfect for getting started',
      features: ['1 brand', 'Basic analytics', '7-day data history', 'Email support'],
      cta: 'Get Started Free',
      popular: false,
    },
    {
      name: 'Pro',
      price: '$99',
      period: '/mo',
      desc: 'For growing agencies',
      features: ['5 brands', 'Full analytics suite', 'Creator portal', 'Discord & Slack alerts', '90-day data history', 'Priority support'],
      cta: 'Start Pro Trial',
      popular: true,
    },
    {
      name: 'Enterprise',
      price: 'Custom',
      period: '',
      desc: 'For large operations',
      features: ['Unlimited brands', 'API access', 'White-label options', 'Dedicated support', 'Full data history', 'Custom integrations'],
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
          <p className="text-[#6B7280] mt-4 text-lg">No surprises. Cancel anytime.</p>
        </ScrollReveal>
        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {tiers.map((t, i) => (
            <ScrollReveal key={t.name} delay={i * 100}>
              <div
                className={`relative rounded-2xl p-[1px] h-full ${
                  t.popular ? 'bg-gradient-to-b from-[#FF4D8D] to-[#7C5CFC]' : 'bg-[#E5E7EB]'
                }`}
              >
                {t.popular && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-gradient-to-r from-[#FF4D8D] to-[#7C5CFC] text-xs font-semibold text-white">
                    Most Popular
                  </div>
                )}
                <div className="rounded-[15px] bg-white p-6 md:p-8 h-full flex flex-col">
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

/* ─── CTA ─── */
function CtaSection() {
  return (
    <section id="cta" className="py-24 px-6 scroll-mt-20">
      <div className="max-w-3xl mx-auto text-center">
        <ScrollReveal>
          <h2 className="text-3xl md:text-5xl font-extrabold text-[#1A1B3A] tracking-tight">
            Ready to simplify your creator management?
          </h2>
          <p className="text-[#6B7280] mt-4 text-lg">Join the early access list and be the first to know when we launch.</p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
            <input
              type="email"
              placeholder="you@agency.com"
              className="flex-1 rounded-full px-5 py-3.5 text-sm border border-[#E5E7EB] bg-white focus:outline-none focus:ring-2 focus:ring-[#FF4D8D]/40 focus:border-[#FF4D8D] transition-all"
            />
            <button className="rounded-full px-7 py-3.5 text-sm font-semibold text-white bg-gradient-to-r from-[#FF4D8D] to-[#7C5CFC] hover:shadow-xl hover:shadow-[#FF4D8D]/30 hover:scale-105 transition-all duration-200 whitespace-nowrap">
              Request Early Access
            </button>
          </div>
          <p className="text-xs text-[#9CA3AF] mt-3">No spam, ever. We&apos;ll only email you when it matters.</p>
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
        <Features />
        <HowItWorks />
        <DashboardPreview />
        <Pricing />
        <CtaSection />
      </main>
      <Footer />
    </div>
  );
}
