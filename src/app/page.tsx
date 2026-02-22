import { TempoLogo } from '@/components/ui/tempo-logo';
import { MobileNav } from '@/components/landing/mobile-nav';
import { ScrollReveal } from '@/components/landing/scroll-reveal';
import { CountUp } from '@/components/landing/count-up';
import { ScrollFix } from '@/components/landing/scroll-fix';
import {
  HeroDashboardMockup,
  AnalyticsMockup,
  LeaderboardMockup,
  BrandSwitcherMockup,
  DailyBriefMockup,
  CreatorPortalMockup,
} from '@/components/landing/animated-mockups';
import { PricingSection } from '@/components/landing/pricing-section';
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
    <section className="min-h-screen pt-28 pb-20 sm:pt-32 md:pt-40 md:pb-32 px-4 sm:px-6 overflow-hidden flex items-center">
      <div className="max-w-7xl mx-auto w-full">
        <div className="text-center mb-12 md:mb-16">
          <ScrollReveal>
            <div className="inline-flex items-center gap-2 rounded-full bg-[#FF4D8D]/10 px-4 py-1.5 text-sm font-medium text-[#FF4D8D] mb-6">
              <span className="w-2 h-2 rounded-full bg-[#FF4D8D] animate-pulse" />
              Now Accepting New Clients
            </div>
          </ScrollReveal>
          <ScrollReveal delay={100}>
            <h1 className="text-3xl sm:text-5xl md:text-7xl font-extrabold tracking-tight text-[#1A1B3A] leading-[1.05] mb-6 break-words">
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
            <div className="flex flex-col sm:flex-row flex-wrap justify-center gap-4 pt-6">
              <a
                href="#book-demo"
                className="inline-flex items-center gap-2 rounded-full px-7 py-3.5 min-h-[44px] text-sm font-semibold text-white bg-gradient-to-r from-[#FF4D8D] to-[#7C5CFC] hover:shadow-xl hover:shadow-[#FF4D8D]/30 hover:scale-105 transition-all duration-200"
              >
                Book a Demo <ArrowRight className="w-4 h-4" />
              </a>
              <a
                href="#features"
                className="inline-flex items-center gap-2 rounded-full px-7 py-3.5 min-h-[44px] text-sm font-semibold text-[#1A1B3A] border border-[#E5E7EB] hover:border-[#FF4D8D]/40 hover:bg-[#FF4D8D]/5 transition-all duration-200"
              >
                See Features
              </a>
            </div>
          </ScrollReveal>
        </div>

        {/* Massive dashboard mockup */}
        <ScrollReveal delay={400}>
          <div className="max-w-5xl mx-auto w-full overflow-hidden">
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
    { value: 1000000, suffix: '+', label: 'Videos Analyzed' },
  ];
  return (
    <section className="border-y border-[#E5E7EB] bg-[#F8F9FC]/50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-14 md:py-16 grid grid-cols-1 sm:grid-cols-3 gap-6 md:gap-8">
        {stats.map((s) => (
          <div key={s.label} className="text-center">
            <p className="text-2xl md:text-4xl font-extrabold bg-gradient-to-r from-[#FF4D8D] to-[#7C5CFC] bg-clip-text text-transparent">
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
    <section className="py-20 sm:py-24 md:py-40 px-4 sm:px-6">
      <div className="max-w-5xl mx-auto">
        <ScrollReveal className="text-center mb-12 md:mb-20">
          <h2 className="text-2xl md:text-5xl font-extrabold text-[#1A1B3A] tracking-tight break-words">Sound familiar?</h2>
        </ScrollReveal>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-20 sm:py-24 md:py-40">
        <div className={`grid md:grid-cols-2 gap-10 md:gap-20 items-center ${reversed ? 'md:[direction:rtl]' : ''}`}>
          <ScrollReveal className={reversed ? 'md:[direction:ltr]' : ''}>
            <div className="space-y-4 md:space-y-6">
              <h2 className="text-2xl md:text-5xl font-extrabold text-[#1A1B3A] tracking-tight leading-tight break-words">
                {headline}
              </h2>
              <p className="text-base sm:text-lg text-[#6B7280] leading-relaxed max-w-md break-words">
                {description}
              </p>
            </div>
          </ScrollReveal>
          <ScrollReveal delay={200} className={reversed ? 'md:[direction:ltr]' : ''}>
            <div className="relative max-w-full overflow-hidden">
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
    <section className="py-20 sm:py-24 md:py-40 px-4 sm:px-6">
      <div className="max-w-3xl mx-auto">
        <ScrollReveal className="text-center mb-12 md:mb-20">
          <p className="text-sm font-semibold text-[#FF4D8D] uppercase tracking-wider mb-3">FAQ</p>
          <h2 className="text-2xl md:text-5xl font-extrabold text-[#1A1B3A] tracking-tight break-words">Questions? We&apos;ve got answers.</h2>
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
    <section id="book-demo" className="py-20 sm:py-24 md:py-40 px-4 sm:px-6 scroll-mt-20">
      <div className="max-w-5xl mx-auto">
        <ScrollReveal>
          <div className="text-center mb-10 md:mb-16">
            <h2 className="text-2xl md:text-5xl font-extrabold text-[#1A1B3A] tracking-tight">
              Ready to get started?
            </h2>
            <p className="text-[#6B7280] mt-4 text-lg">Two options. Pick your path.</p>
          </div>
        </ScrollReveal>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-stretch">
          {/* Start Now - Primary */}
          <ScrollReveal delay={100}>
            <div className="relative rounded-2xl p-[2px] bg-gradient-to-b from-[#FF4D8D] to-[#7C5CFC] h-full">
              <div className="rounded-[14px] bg-white/80 backdrop-blur-xl p-8 md:p-10 h-full flex flex-col">
                <h3 className="text-2xl font-extrabold text-[#1A1B3A] mb-2">Start Now</h3>
                <p className="text-[#6B7280] mb-6">No demo needed. Set up your account in 5 minutes.</p>
                <ul className="space-y-3 flex-1 mb-8">
                  {['Self-service onboarding', 'Connect your TikTok Shop', 'See your data instantly'].map((item) => (
                    <li key={item} className="flex items-center gap-2.5 text-sm text-[#4B5563]">
                      <Check className="w-4 h-4 text-[#FF4D8D] flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
                <a
                  href="/onboarding"
                  className="inline-flex items-center justify-center gap-2 rounded-full px-7 py-3.5 min-h-[44px] text-sm font-semibold text-white bg-gradient-to-r from-[#FF4D8D] to-[#7C5CFC] hover:shadow-xl hover:shadow-[#FF4D8D]/30 hover:scale-105 transition-all duration-200"
                >
                  Create Your Account <ArrowRight className="w-4 h-4" />
                </a>
              </div>
            </div>
          </ScrollReveal>
          {/* Talk to Us - Secondary */}
          <ScrollReveal delay={200}>
            <div className="rounded-2xl border border-[#E5E7EB]/80 bg-white/60 backdrop-blur-xl p-8 md:p-10 h-full flex flex-col">
              <h3 className="text-2xl font-extrabold text-[#1A1B3A] mb-2">Talk to Us</h3>
              <p className="text-[#6B7280] mb-6">Want a walkthrough? We&apos;ll show you exactly how Tempo fits your operation.</p>
              <ul className="space-y-3 flex-1 mb-8">
                {['30-minute video call', 'Live product demo', 'Q&A with our team'].map((item) => (
                  <li key={item} className="flex items-center gap-2.5 text-sm text-[#4B5563]">
                    <Check className="w-4 h-4 text-[#7C5CFC] flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              <a
                href="https://cal.com/tyler3p/tempo-demo"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-full px-7 py-3.5 min-h-[44px] text-sm font-semibold text-[#1A1B3A] border border-[#E5E7EB] hover:border-[#FF4D8D]/40 hover:bg-[#FF4D8D]/5 transition-all duration-200"
              >
                Book a Demo <ArrowRight className="w-4 h-4" />
              </a>
            </div>
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}

/* ─── Footer ─── */
function Footer() {
  return (
    <footer className="border-t border-[#E5E7EB] bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 flex flex-col md:flex-row items-center justify-between gap-6 text-center md:text-left">
        <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-6">
          <TempoLogo size="sm" animated={false} />
          <span className="text-sm text-[#9CA3AF]">© 2026 Tempo. All rights reserved.</span>
        </div>
        <div className="flex flex-wrap justify-center items-center gap-6">
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
    <div className="min-h-screen bg-[#F8F9FC] scroll-smooth overflow-x-hidden">
      <ScrollFix />
      <Navbar />
      <main>
        <Hero />
        <StatsBar />
        <TheProblem />
        <Features />
        <PricingSection />
        <Faq />
        <CtaSection />
      </main>
      <Footer />
    </div>
  );
}
