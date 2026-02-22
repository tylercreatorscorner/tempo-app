import { TempoLogo } from '@/components/ui/tempo-logo';
import { MobileNav } from '@/components/landing/mobile-nav';
import { ScrollReveal } from '@/components/landing/scroll-reveal';
import { CountUp } from '@/components/landing/count-up';
import {
  HeroDashboardMockup,
  AnalyticsMockup,
  LeaderboardMockup,
  BrandSwitcherMockup,
  DailyBriefMockup,
  CreatorPortalMockup,
} from '@/components/landing/animated-mockups';
import {
  FileSpreadsheet,
  EyeOff,
  Flame,
  Check,
  ArrowRight,
  Twitter,
  Github,
  Linkedin,
} from 'lucide-react';

const navLinks = [
  { label: 'Features', href: '#features' },
  { label: 'Pricing', href: '#pricing' },
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
            href="#book-demo"
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
    <section className="min-h-screen pt-32 pb-20 md:pt-40 md:pb-32 px-6 overflow-hidden flex items-center">
      <div className="max-w-7xl mx-auto w-full">
        <div className="text-center mb-12 md:mb-16">
          <ScrollReveal>
            <div className="inline-flex items-center gap-2 rounded-full bg-[#FF4D8D]/10 px-4 py-1.5 text-sm font-medium text-[#FF4D8D] mb-6">
              <span className="w-2 h-2 rounded-full bg-[#FF4D8D] animate-pulse" />
              Now Accepting New Clients
            </div>
          </ScrollReveal>
          <ScrollReveal delay={100}>
            <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-[#1A1B3A] leading-[1.05] mb-6">
              Creator Management,{' '}
              <span className="bg-gradient-to-r from-[#FF4D8D] to-[#7C5CFC] bg-clip-text text-transparent">Simplified</span>
            </h1>
          </ScrollReveal>
          <ScrollReveal delay={200}>
            <p className="text-lg md:text-xl text-[#6B7280] max-w-xl mx-auto leading-relaxed">
              Track performance. Manage creators. Grow GMV. All in one place.
            </p>
          </ScrollReveal>
          <ScrollReveal delay={300}>
            <div className="flex flex-wrap justify-center gap-4 pt-6">
              <a
                href="#book-demo"
                className="inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-sm font-semibold text-white bg-gradient-to-r from-[#FF4D8D] to-[#7C5CFC] hover:shadow-xl hover:shadow-[#FF4D8D]/30 hover:scale-105 transition-all duration-200"
              >
                Book a Demo <ArrowRight className="w-4 h-4" />
              </a>
              <a
                href="#features"
                className="inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-sm font-semibold text-[#1A1B3A] border border-[#E5E7EB] hover:border-[#FF4D8D]/40 hover:bg-[#FF4D8D]/5 transition-all duration-200"
              >
                See Features
              </a>
            </div>
          </ScrollReveal>
        </div>

        {/* Massive dashboard mockup */}
        <ScrollReveal delay={400}>
          <div className="max-w-5xl mx-auto">
            <HeroDashboardMockup />
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}

/* ─── Stats Bar ─── */
function StatsBar() {
  const stats = [
    { value: 10000, suffix: '+', label: 'Creators Managed' },
    { value: 100, prefix: '$', suffix: 'M+', label: 'GMV Tracked' },
    { value: 1, suffix: 'M+', label: 'Videos Analyzed' },
    { value: 50, suffix: '+', label: 'Brands Onboarded' },
  ];
  return (
    <section className="border-y border-[#E5E7EB] bg-[#F8F9FC]/50">
      <div className="max-w-7xl mx-auto px-6 py-16 grid grid-cols-2 md:grid-cols-4 gap-8">
        {stats.map((s) => (
          <div key={s.label} className="text-center">
            <p className="text-3xl md:text-4xl font-extrabold bg-gradient-to-r from-[#FF4D8D] to-[#7C5CFC] bg-clip-text text-transparent">
              <CountUp end={s.value} prefix={s.prefix || ''} suffix={s.suffix || ''} duration={2500} />
            </p>
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
    { icon: FileSpreadsheet, title: 'Death by Spreadsheet', desc: "You're exporting CSVs every morning. There's a better way." },
    { icon: EyeOff, title: 'Flying Blind', desc: "A creator's video went viral and you found out last." },
    { icon: Flame, title: 'Scaling = More Chaos', desc: 'Every new brand means another spreadsheet to manage.' },
  ];
  return (
    <section className="py-32 md:py-40 px-6">
      <div className="max-w-5xl mx-auto">
        <ScrollReveal className="text-center mb-20">
          <h2 className="text-3xl md:text-5xl font-extrabold text-[#1A1B3A] tracking-tight">Sound familiar?</h2>
        </ScrollReveal>
        <div className="grid md:grid-cols-3 gap-6">
          {problems.map((p, i) => (
            <ScrollReveal key={p.title} delay={i * 100}>
              <div className="group relative rounded-2xl border border-[#E5E7EB]/80 bg-white/60 backdrop-blur-xl p-8 hover:border-[#FF4D8D]/30 hover:shadow-xl hover:shadow-[#FF4D8D]/10 hover:-translate-y-2 transition-all duration-300">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#FF4D8D]/10 to-[#7C5CFC]/10 flex items-center justify-center mb-5 group-hover:from-[#FF4D8D]/20 group-hover:to-[#7C5CFC]/20 transition-colors">
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

/* ─── Feature Section (alternating layout) ─── */
function FeatureSection({
  headline,
  description,
  mockup,
  reversed = false,
  id,
}: {
  headline: string;
  description: string;
  mockup: React.ReactNode;
  reversed?: boolean;
  id?: string;
}) {
  return (
    <section id={id} className={id ? 'scroll-mt-20' : ''}>
      <div className="max-w-7xl mx-auto px-6 py-32 md:py-40">
        <div className={`grid md:grid-cols-2 gap-16 md:gap-20 items-center ${reversed ? 'md:[direction:rtl]' : ''}`}>
          <ScrollReveal className={reversed ? 'md:[direction:ltr]' : ''}>
            <div className="space-y-6">
              <h2 className="text-3xl md:text-5xl font-extrabold text-[#1A1B3A] tracking-tight leading-tight">
                {headline}
              </h2>
              <p className="text-lg text-[#6B7280] leading-relaxed max-w-md">
                {description}
              </p>
            </div>
          </ScrollReveal>
          <ScrollReveal delay={200} className={reversed ? 'md:[direction:ltr]' : ''}>
            <div className="relative">
              {mockup}
            </div>
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}

/* ─── Features ─── */
function Features() {
  return (
    <div>
      <FeatureSection
        id="features"
        headline="Track every dollar in real time"
        description="GMV, orders, commissions, creator performance. Updated daily, visualized instantly."
        mockup={<AnalyticsMockup />}
      />
      <FeatureSection
        headline="Know your creators"
        description="See who's crushing it and who needs attention. Rankings update automatically."
        mockup={<LeaderboardMockup />}
        reversed
      />
      <FeatureSection
        headline="Every brand, one dashboard"
        description="Switch between brands in one click. Same workflow whether you manage 2 or 20."
        mockup={<BrandSwitcherMockup />}
      />
      <FeatureSection
        headline="Reports that write themselves"
        description="Wake up to a daily brief. Know exactly where you stand before your first coffee."
        mockup={<DailyBriefMockup />}
        reversed
      />
      <FeatureSection
        headline="A portal your creators will actually use"
        description="Give creators their own dashboard to track performance, discover winning content, and stay motivated."
        mockup={<CreatorPortalMockup />}
      />
    </div>
  );
}

/* ─── Pricing ─── */
function Pricing() {
  const tiers = [
    {
      name: 'Brand', price: '$999', period: '/mo',
      desc: 'For brands managing their own creators',
      features: ['1 brand', 'Full analytics suite', 'Creator portal', 'Daily briefs & alerts', 'Up to 3 team seats', 'Priority support'],
      cta: 'Book a Demo', popular: false,
    },
    {
      name: 'Agency', price: '$1,999', period: '/mo',
      desc: 'For agencies managing multiple brands',
      features: ['Up to 5 brands', 'Everything in Brand', 'Multi-brand dashboard', 'Up to 10 team seats', 'Dedicated onboarding'],
      cta: 'Book a Demo', popular: false,
    },
    {
      name: 'Scale', price: '$3,499', period: '/mo',
      desc: 'For growing operations',
      features: ['Up to 15 brands', 'Everything in Agency', 'Unlimited team seats', 'API access', 'Custom reporting'],
      cta: 'Book a Demo', popular: true,
    },
    {
      name: 'Enterprise', price: 'Custom', period: '',
      desc: 'For large-scale operations',
      features: ['Unlimited brands', 'Everything in Scale', 'White-label options', 'Dedicated support & SLA', 'Custom integrations'],
      cta: 'Contact Sales', popular: false,
    },
  ];
  return (
    <section id="pricing" className="py-32 md:py-40 px-6 bg-[#F8F9FC] scroll-mt-20">
      <div className="max-w-6xl mx-auto">
        <ScrollReveal className="text-center mb-20">
          <p className="text-sm font-semibold text-[#FF4D8D] uppercase tracking-wider mb-3">Pricing</p>
          <h2 className="text-3xl md:text-5xl font-extrabold text-[#1A1B3A] tracking-tight">Simple, transparent pricing</h2>
          <p className="text-[#6B7280] mt-4 text-lg">No free tier. No fluff. Just the tools you need to win.</p>
        </ScrollReveal>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
          {tiers.map((t, i) => (
            <ScrollReveal key={t.name} delay={i * 100}>
              <div
                className={`relative rounded-2xl p-[1px] h-full ${
                  t.popular ? 'bg-gradient-to-b from-[#FF4D8D] to-[#7C5CFC]' : 'bg-[#E5E7EB]'
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
                    href="#book-demo"
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
    <section className="py-32 md:py-40 px-6">
      <div className="max-w-3xl mx-auto">
        <ScrollReveal className="text-center mb-20">
          <p className="text-sm font-semibold text-[#FF4D8D] uppercase tracking-wider mb-3">FAQ</p>
          <h2 className="text-3xl md:text-5xl font-extrabold text-[#1A1B3A] tracking-tight">Questions? We&apos;ve got answers.</h2>
        </ScrollReveal>
        <div className="space-y-8">
          {faqs.map((faq, i) => (
            <ScrollReveal key={i} delay={i * 80}>
              <div className="rounded-2xl border border-[#E5E7EB]/80 bg-white/60 backdrop-blur-xl p-8">
                <h3 className="text-base font-bold text-[#1A1B3A] mb-3">{faq.q}</h3>
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
    <section id="book-demo" className="py-32 md:py-40 px-6 scroll-mt-20">
      <div className="max-w-4xl mx-auto">
        <ScrollReveal>
          <div className="text-center mb-10">
            <h2 className="text-3xl md:text-5xl font-extrabold text-[#1A1B3A] tracking-tight">
              Ready to see Tempo in action?
            </h2>
            <p className="text-[#6B7280] mt-4 text-lg">Pick a time below and we&apos;ll show you exactly how Tempo fits your operation.</p>
          </div>
          <div className="relative rounded-2xl border border-[#E5E7EB]/80 bg-white/60 backdrop-blur-xl overflow-hidden shadow-xl shadow-[#7C5CFC]/10">
            <iframe
              src="https://cal.com/tyler3p/tempo-demo?embed=true&theme=light&hideEventTypeDetails=false&layout=month_view&branding=false"
              frameBorder={0}
              style={{ width: '100%', height: '600px', border: 'none' }}
              title="Book a Demo"
            />
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
    <div className="min-h-screen bg-[#F8F9FC] scroll-smooth">
      <Navbar />
      <main>
        <Hero />
        <StatsBar />
        <TheProblem />
        <Features />
        <Pricing />
        <Faq />
        <CtaSection />
      </main>
      <Footer />
    </div>
  );
}
