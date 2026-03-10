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
            href="/onboarding"
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
            <p className="text-lg md:text-xl text-[#6B7280] max-w-2xl mx-auto leading-relaxed">
              Your creators posted 47 videos yesterday. Do you know which ones drove sales?
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
    { value: 980, suffix: '+', label: 'Creators Managed' },
    { value: 12, prefix: '$', suffix: 'M+', label: 'GMV Tracked' },
    { value: 400, suffix: 'K+', label: 'Videos Analyzed' },
  ];
  return (
    <section className="border-y border-[#E5E7EB] bg-[#F8F9FC]/50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-14 md:py-16">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 md:gap-8 mb-6">
          {stats.map((s) => (
            <div key={s.label} className="text-center">
              <p className="text-2xl md:text-4xl font-extrabold bg-gradient-to-r from-[#FF4D8D] to-[#7C5CFC] bg-clip-text text-transparent">
                <CountUp end={s.value} prefix={s.prefix || ''} suffix={s.suffix || ''} duration={2500} />
              </p>
              <p className="text-sm text-[#6B7280] mt-1 font-medium">{s.label}</p>
            </div>
          ))}
        </div>
        <div className="text-center">
          <p className="text-sm text-[#9CA3AF] border-t border-[#E5E7EB] pt-4">Trusted by 4 TikTok Shop brands</p>
        </div>
      </div>
    </section>
  );
}

/* ─── The Problem ─── */
function TheProblem() {
  const problems = [
    { icon: FileSpreadsheet, title: 'Death by Spreadsheet', desc: "You're exporting CSVs every morning. There's a better way." },
    { icon: EyeOff, title: 'Flying Blind', desc: "A creator's video went viral and you found out last." },
    { icon: Flame, title: 'Scaling = More Chaos', desc: 'More creators means more spreadsheets, more exports, more chaos.' },
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

/* ─── Tempo Bot Feature Section ─── */
function TempoBotSection() {
  const features = [
    { title: 'DM Relay', desc: 'Message creators directly from Tempo. No switching apps.' },
    { title: 'Bulk Messaging', desc: 'Send updates to multiple creators at once' },
    { title: 'Creator Status Alerts', desc: 'Get notified when creators go offline or underperform' },
    { title: 'Retainer Tracking', desc: 'Automated nudges for payment schedules and contract renewals' },
  ];
  return (
    <section className="py-20 sm:py-24 md:py-40 px-4 sm:px-6">
      <div className="max-w-7xl mx-auto">
        <div className="grid md:grid-cols-2 gap-10 md:gap-20 items-center">
          <ScrollReveal>
            <div className="space-y-4 md:space-y-6">
              <div className="inline-flex items-center gap-2 rounded-full bg-[#5865F2]/10 px-4 py-1.5 text-sm font-medium text-[#5865F2] mb-4">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z"/>
                </svg>
                Tempo Bot
              </div>
              <h2 className="text-2xl md:text-5xl font-extrabold text-[#1A1B3A] tracking-tight leading-tight break-words">
                Your creators are on Discord. <span className="bg-gradient-to-r from-[#5865F2] to-[#7C5CFC] bg-clip-text text-transparent">So should you.</span>
              </h2>
              <p className="text-base sm:text-lg text-[#6B7280] leading-relaxed max-w-md break-words">
                Tempo Bot brings creator management directly to Discord. Manage everything from where your creators already are.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-8">
                {features.map((feature) => (
                  <div key={feature.title} className="space-y-1">
                    <h4 className="text-sm font-semibold text-[#1A1B3A]">{feature.title}</h4>
                    <p className="text-xs text-[#6B7280] leading-relaxed">{feature.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </ScrollReveal>
          <ScrollReveal delay={200}>
            <div className="relative max-w-full overflow-hidden">
              <div className="relative rounded-2xl bg-gradient-to-br from-[#5865F2]/10 via-[#FF4D8D]/10 to-[#7C5CFC]/10 p-8 border border-[#5865F2]/20 backdrop-blur-xl">
                <div className="text-center space-y-4">
                  <div className="w-16 h-16 mx-auto rounded-2xl bg-[#5865F2] flex items-center justify-center mb-4">
                    <svg className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z"/>
                    </svg>
                  </div>
                  <h3 className="text-xl font-bold text-[#1A1B3A]">Discord Bot Preview</h3>
                  <p className="text-sm text-[#6B7280]">Real creator management, right in your Discord server</p>
                  <div className="bg-[#2F3136] rounded-lg p-4 text-left text-xs text-[#DCDDDE] font-mono">
                    <div className="mb-2">
                      <span className="text-[#5865F2]">TempoBot</span> <span className="text-[#72767D]">Today at 9:15 AM</span>
                    </div>
                    <div className="space-y-1">
                      <div>📈 <span className="text-[#00D166]">@sarah_beauty</span> just hit 50K views!</div>
                      <div>💰 Daily GMV: <span className="text-[#FEE75C]">$12,450</span> (+23%)</div>
                      <div>🔔 3 creators need check-ins</div>
                    </div>
                  </div>
                </div>
              </div>
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
      <TempoBotSection />
      <FeatureSection
        headline="Your whole operation, one dashboard"
        description="Creators, videos, GMV, commissions. Everything in one place instead of scattered across tabs and spreadsheets."
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
    { q: 'How is Tempo different from Seller Center or Kalodata?', a: "Seller Center and Kalodata give you data. Tempo gives you tools to actually manage creator relationships. Discord bot for DMs, bulk messaging, status alerts, retainer tracking. It's creator relationship management, not just analytics." },
    { q: 'Can multiple people use Tempo for the same brand?', a: 'Yes. Invite your team with role-based access. Everyone sees the data they need without stepping on each other.' },
    { q: 'Is my data secure?', a: 'Your data is isolated at the database level using row-level security. Other tenants can never see your data, period. We use Supabase (built on Postgres) with enterprise-grade encryption.' },
    { q: 'Do I need to be technical to use Tempo?', a: "Not at all. If you can use a spreadsheet, you can use Tempo. We handle the data pipeline. You just log in and see your numbers." },
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
              <p className="text-[#6B7280] mb-6">Want a walkthrough? We&apos;ll show you exactly how Tempo fits your brand.</p>
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
