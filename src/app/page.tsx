import Script from 'next/script';
import { TempoLogo } from '@/components/ui/tempo-logo';
import { MobileNav } from '@/components/landing/mobile-nav';
import { ScrollReveal } from '@/components/landing/scroll-reveal';
import { CountUp } from '@/components/landing/count-up';
import { ScrollFix } from '@/components/landing/scroll-fix';
import { FaqAccordion } from '@/components/landing/faq-accordion';
import { BrandMarquee } from '@/components/landing/brand-marquee';
import { ComparisonTable } from '@/components/landing/comparison-table';
import { NewsletterForm } from '@/components/landing/newsletter-form';
import { ProductMockup } from '@/components/landing/product-mockup';
import {
  HeroDashboardMockup,
  AnalyticsMockup,
  CreatorPortalMockup,
} from '@/components/landing/animated-mockups';
import { PricingSection } from '@/components/landing/pricing-section';
import { AnimatedGridPattern } from '@/components/ui/animated-grid-pattern';
import { BorderBeam } from '@/components/ui/border-beam';
import { cn } from '@/lib/utils';
import { LANDING_CONTENT } from '@/lib/landing-content';
import {
  Check,
  ArrowRight,
  Twitter,
  Linkedin,
} from 'lucide-react';

const C = LANDING_CONTENT;

/* ─── Navbar ─── */
function Navbar() {
  return (
    <header className="fixed top-0 left-0 right-0 z-40 bg-white/75 backdrop-blur-xl border-b border-[#E5E7EB]/50">
      <div className="max-w-7xl mx-auto px-5 h-16 flex items-center justify-between">
        <TempoLogo size="md" animated={false} />
        <nav className="hidden md:flex items-center gap-8">
          {C.nav.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-sm font-medium text-[#6B7280] hover:text-[#1A1B3A] transition-colors duration-150"
            >
              {l.label}
            </a>
          ))}
        </nav>
        <div className="hidden md:flex items-center gap-3">
          <a
            href="/login"
            className="text-sm font-medium text-[#6B7280] hover:text-[#1A1B3A] transition-colors duration-150"
          >
            Log in
          </a>
          <a
            href={C.bookDemoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center rounded-full px-5 py-2 text-sm font-semibold text-white bg-gradient-to-r from-[#FF4D8D] to-[#7C5CFC] hover:shadow-lg hover:shadow-[#FF4D8D]/25 hover:scale-[1.03] transition-all duration-200"
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
    <section className="relative min-h-screen pt-28 pb-20 sm:pt-36 md:pt-44 md:pb-32 px-4 sm:px-6 overflow-hidden flex items-center bg-white">
      {/* Animated grid pattern background */}
      <AnimatedGridPattern
        numSquares={28}
        maxOpacity={0.08}
        duration={4}
        repeatDelay={1}
        width={64}
        height={64}
        className={cn(
          '[mask-image:radial-gradient(700px_circle_at_center,white,transparent)]',
          'inset-x-0 inset-y-[-10%] h-[120%] skew-y-[-2deg]',
          'fill-[#7C5CFC]/30 stroke-[#7C5CFC]/30'
        )}
      />

      {/* Soft gradient orbs */}
      <div
        className="absolute -top-32 right-[-10%] w-[700px] h-[700px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(255,77,141,0.10) 0%, transparent 70%)' }}
      />
      <div
        className="absolute top-1/3 -left-32 w-[500px] h-[500px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(124,92,252,0.08) 0%, transparent 70%)' }}
      />

      <div className="relative max-w-7xl mx-auto w-full">
        <div className="text-center mb-14 md:mb-20">
          {/* Badge */}
          <ScrollReveal>
            <div className="inline-flex items-center gap-2 rounded-full bg-white border border-[#FF4D8D]/20 shadow-sm px-4 py-1.5 text-sm font-medium text-[#FF4D8D] mb-8">
              <span className="w-1.5 h-1.5 rounded-full bg-[#FF4D8D] animate-pulse" />
              {C.hero.badge}
            </div>
          </ScrollReveal>

          {/* Headline */}
          <ScrollReveal delay={100}>
            <h1 className="text-4xl sm:text-5xl md:text-[68px] font-extrabold tracking-tight text-[#1A1B3A] leading-[1.05] mb-6">
              {C.hero.headline.lead}{' '}
              <span className="bg-gradient-to-r from-[#FF4D8D] to-[#7C5CFC] bg-clip-text text-transparent">
                {C.hero.headline.gradient}
              </span>
            </h1>
          </ScrollReveal>

          {/* Subhead */}
          <ScrollReveal delay={200}>
            <p className="text-lg md:text-xl text-[#6B7280] max-w-2xl mx-auto leading-relaxed">
              {C.hero.subhead}
            </p>
          </ScrollReveal>

          {/* CTAs */}
          <ScrollReveal delay={300}>
            <div className="flex flex-col sm:flex-row justify-center gap-3 mt-8">
              <a
                href={C.hero.primaryCta.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-full px-7 py-3.5 min-h-[44px] text-sm font-semibold text-white bg-gradient-to-r from-[#FF4D8D] to-[#7C5CFC] hover:shadow-xl hover:shadow-[#FF4D8D]/30 hover:scale-[1.03] transition-all duration-200"
              >
                {C.hero.primaryCta.label} <ArrowRight className="w-4 h-4" />
              </a>
              <a
                href={C.hero.secondaryCta.href}
                className="inline-flex items-center justify-center gap-2 rounded-full px-7 py-3.5 min-h-[44px] text-sm font-semibold text-[#1A1B3A] bg-white border border-[#E5E7EB] hover:border-[#FF4D8D]/30 hover:shadow-md transition-all duration-200"
              >
                {C.hero.secondaryCta.label}
              </a>
            </div>
          </ScrollReveal>

          {/* Social proof */}
          <ScrollReveal delay={400}>
            <p className="text-sm text-[#9CA3AF] mt-5">{C.hero.socialProof}</p>
          </ScrollReveal>
        </div>

        {/* Dashboard mockup */}
        <ScrollReveal delay={500}>
          <div className="max-w-5xl mx-auto w-full overflow-hidden">
            <ProductMockup
              screenshot={C.heroScreenshot}
              alt="Tempo dashboard"
              priority
              fallback={<HeroDashboardMockup />}
            />
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}

/* ─── Stats Bar ─── */
function StatsBar() {
  return (
    <section className="border-y border-[#E5E7EB]/80 bg-[#F8F9FC]">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-14">
        <p className="text-center text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-[0.18em] mb-8">
          {C.statsLabel}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
          {C.stats.map((s) => (
            <div key={s.label} className="text-center">
              <p className="text-3xl md:text-4xl font-extrabold bg-gradient-to-r from-[#FF4D8D] to-[#7C5CFC] bg-clip-text text-transparent">
                <CountUp end={s.value} prefix={s.prefix || ''} suffix={s.suffix || ''} duration={2500} />
              </p>
              <p className="text-sm text-[#6B7280] mt-1.5 font-medium">{s.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── The Problem ─── */
function TheProblem() {
  return (
    <section className="py-20 sm:py-24 md:py-40 px-4 sm:px-6 bg-white">
      <div className="max-w-5xl mx-auto">
        <ScrollReveal className="text-center mb-14 md:mb-20">
          <h2 className="text-2xl md:text-5xl font-extrabold text-[#1A1B3A] tracking-tight">
            {C.problem.title}
          </h2>
          <p className="text-[#6B7280] mt-4 text-lg">{C.problem.subtitle}</p>
        </ScrollReveal>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {C.problem.items.map((p, i) => (
            <ScrollReveal key={p.title} delay={i * 100}>
              <div className="group relative rounded-2xl border border-[#E5E7EB]/80 bg-white p-8 hover:border-[#FF4D8D]/25 hover:shadow-xl hover:shadow-[#FF4D8D]/8 hover:-translate-y-1.5 transition-all duration-300">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#FF4D8D]/10 to-[#7C5CFC]/10 flex items-center justify-center mb-5 group-hover:from-[#FF4D8D]/18 group-hover:to-[#7C5CFC]/18 transition-colors">
                  <p.icon className="w-5 h-5 text-[#FF4D8D]" />
                </div>
                <h3 className="text-base font-bold text-[#1A1B3A] mb-2">{p.title}</h3>
                <p className="text-sm text-[#6B7280] leading-relaxed">{p.desc}</p>
              </div>
            </ScrollReveal>
          ))}
        </div>

        {/* Bridge to solution */}
        <ScrollReveal delay={350} className="text-center mt-12 md:mt-14">
          <a
            href="#features"
            className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-[#1A1B3A] bg-gradient-to-r from-[#FF4D8D]/8 to-[#7C5CFC]/8 border border-[#FF4D8D]/15 hover:border-[#FF4D8D]/30 hover:shadow-md transition-all duration-200"
          >
            Tempo fixes all three.{' '}
            <span className="bg-gradient-to-r from-[#FF4D8D] to-[#7C5CFC] bg-clip-text text-transparent font-bold">
              Here&apos;s how →
            </span>
          </a>
        </ScrollReveal>
      </div>
    </section>
  );
}

/* ─── How It Works ─── */
function HowItWorks() {
  return (
    <section id="how-it-works" className="py-20 sm:py-24 md:py-40 px-4 sm:px-6 bg-[#F8F9FC] scroll-mt-16">
      <div className="max-w-5xl mx-auto">
        <ScrollReveal className="text-center mb-14 md:mb-20">
          <p className="text-sm font-semibold text-[#FF4D8D] uppercase tracking-wider mb-3">
            {C.howItWorks.label}
          </p>
          <h2 className="text-2xl md:text-5xl font-extrabold text-[#1A1B3A] tracking-tight">
            {C.howItWorks.title}
          </h2>
          <p className="text-[#6B7280] mt-4 text-lg max-w-xl mx-auto">{C.howItWorks.subtitle}</p>
        </ScrollReveal>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-6">
          {C.howItWorks.steps.map((step, i) => (
            <ScrollReveal key={step.num} delay={i * 120}>
              <div className="relative bg-white rounded-2xl p-8 border border-[#E5E7EB]/80 hover:border-[#FF4D8D]/25 hover:shadow-xl hover:shadow-[#FF4D8D]/8 hover:-translate-y-1.5 transition-all duration-300 h-full">
                <div
                  className="text-[52px] font-extrabold leading-none mb-5 select-none"
                  style={{
                    background:
                      'linear-gradient(135deg, rgba(255,77,141,0.18) 0%, rgba(124,92,252,0.18) 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }}
                >
                  {step.num}
                </div>
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#FF4D8D]/10 to-[#7C5CFC]/10 flex items-center justify-center mb-4">
                  <step.Icon className="w-5 h-5 text-[#FF4D8D]" />
                </div>
                <h3 className="text-base font-bold text-[#1A1B3A] mb-2">{step.title}</h3>
                <p className="text-sm text-[#6B7280] leading-relaxed">{step.desc}</p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Feature Section (alternating) ─── */
function FeatureSection({
  tag,
  headline,
  description,
  mockup,
  reversed = false,
  id,
}: {
  tag?: string;
  headline: string;
  description: string;
  mockup: React.ReactNode;
  reversed?: boolean;
  id?: string;
}) {
  return (
    <section id={id} className={id ? 'scroll-mt-20' : ''}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-20 sm:py-24 md:py-40">
        <div className={`grid md:grid-cols-2 gap-10 md:gap-24 items-center ${reversed ? 'md:[direction:rtl]' : ''}`}>
          <ScrollReveal className={reversed ? 'md:[direction:ltr]' : ''}>
            <div className="space-y-4 md:space-y-5">
              {tag && (
                <p className="text-xs font-semibold text-[#FF4D8D] uppercase tracking-widest">{tag}</p>
              )}
              <h2 className="text-2xl md:text-[42px] md:leading-[1.1] font-extrabold text-[#1A1B3A] tracking-tight">
                {headline}
              </h2>
              <p className="text-base sm:text-lg text-[#6B7280] leading-relaxed max-w-md">
                {description}
              </p>
            </div>
          </ScrollReveal>
          <ScrollReveal delay={200} className={reversed ? 'md:[direction:ltr]' : ''}>
            <div className="relative max-w-full overflow-hidden">{mockup}</div>
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}

/* ─── Tempo Bot Feature Section ─── */
function TempoBotSection() {
  const TB = C.tempoBot;
  return (
    <section className="py-20 sm:py-24 md:py-40 px-4 sm:px-6 bg-white">
      <div className="max-w-7xl mx-auto">
        <div className="grid md:grid-cols-2 gap-10 md:gap-24 items-center">
          <ScrollReveal>
            <div className="space-y-5">
              <div className="inline-flex items-center gap-2 rounded-full bg-[#5865F2]/10 px-4 py-1.5 text-sm font-medium text-[#5865F2]">
                <DiscordGlyph className="w-4 h-4" />
                {TB.badge}
              </div>
              <p className="text-xs font-semibold text-[#FF4D8D] uppercase tracking-widest">{TB.tag}</p>
              <h2 className="text-2xl md:text-[42px] md:leading-[1.1] font-extrabold text-[#1A1B3A] tracking-tight">
                {TB.headline.lead}{' '}
                <span className="bg-gradient-to-r from-[#5865F2] to-[#7C5CFC] bg-clip-text text-transparent">
                  {TB.headline.gradient}
                </span>
              </h2>
              <p className="text-base sm:text-lg text-[#6B7280] leading-relaxed max-w-md">
                {TB.subhead}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mt-2">
                {TB.features.map((f) => (
                  <div key={f.title} className="space-y-1">
                    <h4 className="text-sm font-semibold text-[#1A1B3A]">{f.title}</h4>
                    <p className="text-xs text-[#6B7280] leading-relaxed">{f.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </ScrollReveal>

          <ScrollReveal delay={200}>
            <div className="relative rounded-2xl bg-gradient-to-br from-[#5865F2]/8 via-transparent to-[#7C5CFC]/8 p-8 border border-[#5865F2]/15 overflow-hidden">
              <BorderBeam
                size={150}
                duration={8}
                colorFrom="#5865F2"
                colorTo="#7C5CFC"
                borderWidth={1.5}
              />
              <div className="text-center space-y-5">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-[#5865F2] flex items-center justify-center">
                  <DiscordGlyph className="w-7 h-7 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-[#1A1B3A]">Tempo Bot</h3>
                  <p className="text-sm text-[#6B7280] mt-1">
                    Creator management, right in your Discord
                  </p>
                </div>
                <div className="bg-[#2F3136] rounded-xl p-4 text-left text-xs text-[#DCDDDE] font-mono">
                  <div className="mb-2.5">
                    <span className="text-[#5865F2] font-semibold">TempoBot</span>
                    <span className="text-[#72767D] ml-2">Today at 9:15 AM</span>
                  </div>
                  <div className="space-y-1.5">
                    <div>
                      📈 <span className="text-[#00D166]">@sarah_beauty</span> just hit 50K views!
                    </div>
                    <div>
                      💰 Daily GMV: <span className="text-[#FEE75C]">$12,450</span>{' '}
                      <span className="text-[#00D166]">(+23%)</span>
                    </div>
                    <div>🔔 3 creators need check-ins today</div>
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

function DiscordGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}

/* ─── Landing Features (3 hero features only) ─── */
function Features() {
  const analytics = C.features.find((f) => f.slug === 'analytics')!;
  const creatorPortal = C.features.find((f) => f.slug === 'creator-portal')!;

  return (
    <div id="features" className="scroll-mt-16">
      <FeatureSection
        tag={analytics.tag}
        headline={analytics.headline}
        description={analytics.description}
        mockup={
          <ProductMockup
            screenshot={analytics.screenshot}
            alt={`Tempo ${analytics.tag.toLowerCase()}`}
            fallback={<AnalyticsMockup />}
          />
        }
      />
      <TempoBotSection />
      <div className="bg-[#F8F9FC]">
        <FeatureSection
          tag={creatorPortal.tag}
          headline={creatorPortal.headline}
          description={creatorPortal.description}
          mockup={
            <ProductMockup
              screenshot={creatorPortal.screenshot}
              alt={`Tempo ${creatorPortal.tag.toLowerCase()}`}
              fallback={<CreatorPortalMockup />}
            />
          }
          reversed
        />
      </div>

      {/* Link to full features page */}
      <div className="bg-[#F8F9FC] pb-20 md:pb-32 px-4 sm:px-6 -mt-4">
        <div className="max-w-7xl mx-auto text-center">
          <ScrollReveal>
            <a
              href="/features"
              className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-[#1A1B3A] bg-white border border-[#E5E7EB] hover:border-[#FF4D8D]/30 hover:shadow-md transition-all duration-200"
            >
              See all features <ArrowRight className="w-4 h-4" />
            </a>
          </ScrollReveal>
        </div>
      </div>
    </div>
  );
}

/* ─── FAQ Section ─── */
function FaqSection() {
  return (
    <section className="py-20 sm:py-24 md:py-40 px-4 sm:px-6 bg-white">
      <div className="max-w-3xl mx-auto">
        <ScrollReveal className="text-center mb-12 md:mb-16">
          <p className="text-sm font-semibold text-[#FF4D8D] uppercase tracking-wider mb-3">FAQ</p>
          <h2 className="text-2xl md:text-5xl font-extrabold text-[#1A1B3A] tracking-tight">
            Questions? We&apos;ve got answers.
          </h2>
        </ScrollReveal>
        <FaqAccordion />
      </div>
    </section>
  );
}

/* ─── CTA Section (dark) ─── */
function CtaSection() {
  const cta = C.finalCta;
  return (
    <section id="book-demo" className="relative py-24 sm:py-32 px-4 sm:px-6 overflow-hidden scroll-mt-16">
      <div className="absolute inset-0 bg-[#0D0E1F]" />
      <div
        className="absolute top-0 right-0 w-[600px] h-[600px] pointer-events-none"
        style={{ background: 'radial-gradient(circle at 70% 30%, rgba(255,77,141,0.12) 0%, transparent 60%)' }}
      />
      <div
        className="absolute bottom-0 left-0 w-[400px] h-[400px] pointer-events-none"
        style={{ background: 'radial-gradient(circle at 30% 70%, rgba(124,92,252,0.12) 0%, transparent 60%)' }}
      />

      <div className="relative max-w-4xl mx-auto">
        <ScrollReveal>
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-5xl font-extrabold text-white tracking-tight leading-tight">
              {cta.title}
            </h2>
            <p className="text-[#6B7280] mt-4 text-lg max-w-lg mx-auto">{cta.subtitle}</p>
          </div>
        </ScrollReveal>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-3xl mx-auto">
          <ScrollReveal delay={100}>
            <div
              className="relative rounded-2xl p-[1.5px] h-full"
              style={{ background: 'linear-gradient(135deg, #FF4D8D, #7C5CFC)' }}
            >
              <div className="rounded-[14px] bg-[#13142A] p-8 h-full flex flex-col">
                <h3 className="text-xl font-extrabold text-white mb-1.5">{cta.cards.start.title}</h3>
                <p
                  className="text-sm font-semibold mb-6"
                  style={{
                    background: 'linear-gradient(135deg, #FF4D8D, #7C5CFC)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }}
                >
                  {cta.cards.start.bestFor}
                </p>
                <ul className="space-y-3 flex-1 mb-8">
                  {cta.cards.start.bullets.map((item) => (
                    <li key={item} className="flex items-center gap-3 text-sm text-[#D1D5DB]">
                      <div
                        className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ background: 'linear-gradient(135deg, #FF4D8D, #7C5CFC)' }}
                      >
                        <Check className="w-2.5 h-2.5 text-white" />
                      </div>
                      {item}
                    </li>
                  ))}
                </ul>
                <a
                  href={cta.cards.start.cta.href}
                  className="inline-flex items-center justify-center gap-2 rounded-full px-7 py-3.5 text-sm font-semibold text-white transition-all duration-200 hover:scale-[1.03] hover:shadow-xl hover:shadow-[#FF4D8D]/25"
                  style={{ background: 'linear-gradient(135deg, #FF4D8D, #7C5CFC)' }}
                >
                  {cta.cards.start.cta.label} <ArrowRight className="w-4 h-4" />
                </a>
              </div>
            </div>
          </ScrollReveal>

          <ScrollReveal delay={200}>
            <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-8 h-full flex flex-col">
              <h3 className="text-xl font-extrabold text-white mb-1.5">{cta.cards.demo.title}</h3>
              <p className="text-sm font-semibold text-[#A78BFA] mb-6">{cta.cards.demo.bestFor}</p>
              <ul className="space-y-3 flex-1 mb-8">
                {cta.cards.demo.bullets.map((item) => (
                  <li key={item} className="flex items-center gap-3 text-sm text-[#D1D5DB]">
                    <div className="w-4 h-4 rounded-full border border-[#7C5CFC]/50 flex items-center justify-center flex-shrink-0">
                      <Check className="w-2.5 h-2.5 text-[#A78BFA]" />
                    </div>
                    {item}
                  </li>
                ))}
              </ul>
              <a
                href={cta.cards.demo.cta.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-full px-7 py-3.5 text-sm font-semibold text-white border border-white/15 hover:bg-white/8 hover:border-white/25 transition-all duration-200"
              >
                {cta.cards.demo.cta.label} <ArrowRight className="w-4 h-4" />
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
    <footer className="bg-[#0D0E1F] border-t border-white/8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-14">
        <div className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr_1fr_1.5fr] gap-10 md:gap-12">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-1 mb-3">
              <span
                style={{
                  fontSize: 22,
                  fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
                  fontWeight: 800,
                  letterSpacing: '-0.04em',
                  lineHeight: 1,
                  color: '#FFFFFF',
                }}
              >
                Temp
              </span>
              <svg viewBox="0 0 40 40" fill="none" width="18" height="18">
                <circle cx="20" cy="20" r="20" fill="url(#footerGrad)" />
                <polygon points="16,12 16,28 28,20" fill="white" fillOpacity="0.95" />
                <defs>
                  <linearGradient id="footerGrad" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#FF4D8D" />
                    <stop offset="1" stopColor="#7C5CFC" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <p className="text-sm text-[#4B5563] leading-relaxed max-w-xs">{C.footer.tagline}</p>
          </div>

          {/* Link columns */}
          {C.footer.columns.map((col) => (
            <div key={col.label}>
              <p className="text-[11px] font-semibold text-white/30 uppercase tracking-widest mb-4">
                {col.label}
              </p>
              <div className="space-y-3">
                {col.links.map((l) => (
                  <a
                    key={l.label}
                    href={l.href}
                    {...(l.href.startsWith('http')
                      ? { target: '_blank', rel: 'noopener noreferrer' }
                      : {})}
                    className="block text-sm text-[#6B7280] hover:text-white transition-colors"
                  >
                    {l.label}
                  </a>
                ))}
              </div>
            </div>
          ))}

          {/* Newsletter */}
          <div>
            <NewsletterForm />
          </div>
        </div>

        <div className="mt-12 pt-6 border-t border-white/8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-[#374151]">{C.footer.copyright}</p>
          <div className="flex items-center gap-4">
            <a href="#" className="text-[#374151] hover:text-white transition-colors" aria-label="Twitter">
              <Twitter className="w-4 h-4" />
            </a>
            <a href="#" className="text-[#374151] hover:text-white transition-colors" aria-label="LinkedIn">
              <Linkedin className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

/* ─── JSON-LD structured data ─── */
function StructuredData() {
  const data = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${C.siteUrl}#org`,
        name: 'Tempo',
        url: C.siteUrl,
        sameAs: [],
      },
      {
        '@type': 'SoftwareApplication',
        name: 'Tempo',
        url: C.siteUrl,
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        description: C.hero.subhead,
        offers: {
          '@type': 'Offer',
          price: '1999',
          priceCurrency: 'USD',
          priceSpecification: {
            '@type': 'UnitPriceSpecification',
            price: '1999',
            priceCurrency: 'USD',
            unitText: 'MONTH',
          },
        },
      },
      {
        '@type': 'FAQPage',
        mainEntity: C.faqs.map((f) => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
      },
    ],
  };
  return (
    <Script
      id="ld-json"
      type="application/ld+json"
      strategy="afterInteractive"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

/* ─── Page ─── */
export default function Home() {
  return (
    <div className="min-h-screen bg-white scroll-smooth overflow-x-hidden">
      <ScrollFix />
      <StructuredData />
      <Navbar />
      <main>
        <Hero />
        <StatsBar />
        <BrandMarquee />
        <TheProblem />
        <Features />
        <ComparisonTable />
        <PricingSection />
        <FaqSection />
        <CtaSection />
      </main>
      <Footer />
    </div>
  );
}
