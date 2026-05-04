import type { Metadata } from 'next';
import { TempoLogo } from '@/components/ui/tempo-logo';
import { MobileNav } from '@/components/landing/mobile-nav';
import { ScrollReveal } from '@/components/landing/scroll-reveal';
import {
  AnalyticsMockup,
  LeaderboardMockup,
  BrandSwitcherMockup,
  DailyBriefMockup,
  CreatorPortalMockup,
} from '@/components/landing/animated-mockups';
import { LANDING_CONTENT } from '@/lib/landing-content';
import { ProductMockup } from '@/components/landing/product-mockup';
import {
  ArrowRight,
  ArrowLeft,
  BarChart2,
  Trophy,
  LayoutGrid,
  Sunrise,
  UserCircle,
  type LucideIcon,
} from 'lucide-react';

const FEATURE_ICONS: Record<string, LucideIcon> = {
  BarChart2,
  Trophy,
  LayoutGrid,
  Sunrise,
  UserCircle,
};

export const metadata: Metadata = {
  title: 'Features',
  description:
    'Every Tempo feature: real-time analytics, creator rankings, Discord bot, multi-brand dashboard, daily briefs, and creator portal.',
  alternates: { canonical: '/features' },
};

const C = LANDING_CONTENT;

const SLUG_TO_MOCKUP = {
  analytics: <AnalyticsMockup />,
  'creator-rankings': <LeaderboardMockup />,
  'multi-brand': <BrandSwitcherMockup />,
  'daily-briefs': <DailyBriefMockup />,
  'creator-portal': <CreatorPortalMockup />,
} as const;

function Navbar() {
  return (
    <header className="fixed top-0 left-0 right-0 z-40 bg-white/75 backdrop-blur-xl border-b border-[#E5E7EB]/50">
      <div className="max-w-7xl mx-auto px-5 h-16 flex items-center justify-between">
        <a href="/" aria-label="Tempo home">
          <TempoLogo size="md" animated={false} />
        </a>
        <nav className="hidden md:flex items-center gap-8">
          {C.nav.map((l) => {
            const href = l.href.startsWith('#') ? `/${l.href}` : l.href;
            return (
              <a
                key={l.href}
                href={href}
                className="text-sm font-medium text-[#6B7280] hover:text-[#1A1B3A] transition-colors duration-150"
              >
                {l.label}
              </a>
            );
          })}
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

function FeatureRow({
  tag,
  headline,
  description,
  mockup,
  reversed,
}: {
  tag: string;
  headline: string;
  description: string;
  mockup: React.ReactNode;
  reversed?: boolean;
}) {
  return (
    <section className="py-16 md:py-24 px-4 sm:px-6">
      <div className="max-w-7xl mx-auto">
        <div className={`grid md:grid-cols-2 gap-10 md:gap-24 items-center ${reversed ? 'md:[direction:rtl]' : ''}`}>
          <ScrollReveal className={reversed ? 'md:[direction:ltr]' : ''}>
            <div className="space-y-4 md:space-y-5">
              <p className="text-xs font-semibold text-[#FF4D8D] uppercase tracking-widest">{tag}</p>
              <h2 className="text-2xl md:text-[36px] md:leading-[1.15] font-extrabold text-[#1A1B3A] tracking-tight">
                {headline}
              </h2>
              <p className="text-base sm:text-lg text-[#6B7280] leading-relaxed max-w-md">
                {description}
              </p>
            </div>
          </ScrollReveal>
          <ScrollReveal delay={150} className={reversed ? 'md:[direction:ltr]' : ''}>
            <div className="relative max-w-full overflow-hidden">{mockup}</div>
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}

export default function FeaturesPage() {
  return (
    <div className="min-h-screen bg-white scroll-smooth overflow-x-hidden">
      <Navbar />

      <main className="pt-32 pb-20">
        {/* Hero */}
        <section className="px-4 sm:px-6 mb-12 md:mb-20">
          <div className="max-w-4xl mx-auto text-center">
            <ScrollReveal>
              <a
                href="/"
                className="inline-flex items-center gap-1.5 text-sm text-[#6B7280] hover:text-[#1A1B3A] transition-colors mb-6"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back to home
              </a>
              <p className="text-sm font-semibold text-[#FF4D8D] uppercase tracking-wider mb-3">Features</p>
              <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-[#1A1B3A] leading-[1.05] mb-5">
                Everything Tempo does,{' '}
                <span className="bg-gradient-to-r from-[#FF4D8D] to-[#7C5CFC] bg-clip-text text-transparent">
                  in one place
                </span>
              </h1>
              <p className="text-lg text-[#6B7280] max-w-2xl mx-auto leading-relaxed">
                A complete tour of the platform. No marketing fluff — just what each feature actually does.
              </p>
            </ScrollReveal>
          </div>
        </section>

        {/* Quick-scan grid */}
        <section className="px-4 sm:px-6 mb-16 md:mb-24">
          <div className="max-w-6xl mx-auto">
            <ScrollReveal className="text-center mb-10">
              <p className="text-sm font-semibold text-[#FF4D8D] uppercase tracking-wider mb-2">At a glance</p>
              <h2 className="text-2xl md:text-3xl font-extrabold text-[#1A1B3A] tracking-tight">
                Five surfaces, one platform
              </h2>
            </ScrollReveal>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
              {C.features.map((f, i) => {
                const Icon = FEATURE_ICONS[f.icon];
                return (
                  <ScrollReveal key={f.slug} delay={i * 80}>
                    <a
                      href={`#${f.slug}`}
                      className="group block h-full rounded-2xl border border-[#E5E7EB] bg-white p-6 hover:border-[#FF4D8D]/25 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
                    >
                      <div className="flex items-center justify-between mb-4">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#FF4D8D]/10 to-[#7C5CFC]/10 flex items-center justify-center group-hover:from-[#FF4D8D]/18 group-hover:to-[#7C5CFC]/18 transition-colors">
                          {Icon && <Icon className="w-5 h-5 text-[#FF4D8D]" />}
                        </div>
                        <ArrowRight className="w-4 h-4 text-[#9CA3AF] group-hover:text-[#FF4D8D] group-hover:translate-x-0.5 transition-all" />
                      </div>
                      <p className="text-[10px] font-semibold text-[#FF4D8D] uppercase tracking-widest mb-1.5">
                        {f.tag}
                      </p>
                      <p className="text-base font-bold text-[#1A1B3A] leading-tight mb-2">
                        {f.headline}
                      </p>
                      <p className="text-xs text-[#6B7280] leading-relaxed line-clamp-3">
                        {f.description}
                      </p>
                    </a>
                  </ScrollReveal>
                );
              })}
            </div>
          </div>
        </section>

        {/* Feature deep-dives */}
        <div className="divide-y divide-[#F3F4F6]">
          {C.features.map((f, i) => {
            const fallback = SLUG_TO_MOCKUP[f.slug as keyof typeof SLUG_TO_MOCKUP];
            return (
              <div key={f.slug} id={f.slug} className="scroll-mt-24">
                <FeatureRow
                  tag={f.tag}
                  headline={f.headline}
                  description={f.description}
                  mockup={
                    <ProductMockup
                      screenshot={f.screenshot}
                      alt={`Tempo ${f.tag.toLowerCase()}`}
                      fallback={fallback}
                    />
                  }
                  reversed={i % 2 === 1}
                />
              </div>
            );
          })}
        </div>

        {/* CTA */}
        <section className="px-4 sm:px-6 mt-12 md:mt-20">
          <ScrollReveal>
            <div className="max-w-3xl mx-auto text-center rounded-3xl border border-[#E5E7EB] bg-gradient-to-br from-[#FF4D8D]/5 via-white to-[#7C5CFC]/5 p-10 md:p-14">
              <h2 className="text-2xl md:text-4xl font-extrabold text-[#1A1B3A] tracking-tight mb-3">
                Ready to see it live?
              </h2>
              <p className="text-[#6B7280] text-lg mb-8">
                Book a 30-minute demo and we&apos;ll walk you through your exact use case.
              </p>
              <div className="flex flex-col sm:flex-row justify-center gap-3">
                <a
                  href={C.bookDemoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-full px-7 py-3.5 text-sm font-semibold text-white bg-gradient-to-r from-[#FF4D8D] to-[#7C5CFC] hover:shadow-xl hover:shadow-[#FF4D8D]/30 hover:scale-[1.03] transition-all duration-200"
                >
                  Book a Demo <ArrowRight className="w-4 h-4" />
                </a>
                <a
                  href="/onboarding"
                  className="inline-flex items-center justify-center gap-2 rounded-full px-7 py-3.5 text-sm font-semibold text-[#1A1B3A] bg-white border border-[#E5E7EB] hover:border-[#FF4D8D]/30 hover:shadow-md transition-all duration-200"
                >
                  Get Started
                </a>
              </div>
            </div>
          </ScrollReveal>
        </section>
      </main>
    </div>
  );
}
