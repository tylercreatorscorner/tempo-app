import type { Metadata } from 'next';
import { TempoLogo } from '@/components/ui/tempo-logo';
import { MobileNav } from '@/components/landing/mobile-nav';
import { ScrollReveal } from '@/components/landing/scroll-reveal';
import { LANDING_CONTENT } from '@/lib/landing-content';
import { CHANGELOG, type ChangelogTag } from '@/lib/changelog-entries';
import { NewsletterForm } from '@/components/landing/newsletter-form';
import { ArrowLeft } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Changelog',
  description: 'Every shipped change in Tempo, big or small.',
  alternates: { canonical: '/changelog' },
};

const C = LANDING_CONTENT;

const TAG_STYLES: Record<ChangelogTag, { label: string; color: string; bg: string }> = {
  feature: { label: 'New', color: '#FF4D8D', bg: 'rgba(255,77,141,0.10)' },
  improvement: { label: 'Improved', color: '#7C5CFC', bg: 'rgba(124,92,252,0.10)' },
  fix: { label: 'Fixed', color: '#6B7280', bg: 'rgba(107,114,128,0.10)' },
};

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

function formatDate(iso: string) {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export default function ChangelogPage() {
  return (
    <div className="min-h-screen bg-white scroll-smooth overflow-x-hidden">
      <Navbar />

      <main className="pt-32 pb-24">
        <section className="px-4 sm:px-6 mb-12 md:mb-16">
          <div className="max-w-3xl mx-auto">
            <ScrollReveal>
              <a
                href="/"
                className="inline-flex items-center gap-1.5 text-sm text-[#6B7280] hover:text-[#1A1B3A] transition-colors mb-6"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back to home
              </a>
              <p className="text-sm font-semibold text-[#FF4D8D] uppercase tracking-wider mb-3">Changelog</p>
              <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-[#1A1B3A] leading-[1.05] mb-4">
                What&apos;s new in Tempo
              </h1>
              <p className="text-lg text-[#6B7280] leading-relaxed">
                Every shipped change, big or small. Subscribe at the bottom of the page to get these in your inbox.
              </p>
            </ScrollReveal>
          </div>
        </section>

        <section className="px-4 sm:px-6">
          <div className="max-w-3xl mx-auto">
            <ol className="relative">
              {/* Timeline rail */}
              <div className="absolute left-2 top-2 bottom-2 w-px bg-gradient-to-b from-[#FF4D8D]/40 via-[#E5E7EB] to-transparent hidden md:block" />

              {CHANGELOG.map((entry, i) => (
                <li key={entry.version} className="relative pl-0 md:pl-10 pb-14 last:pb-0">
                  {/* Timeline dot */}
                  <div className="absolute left-[3px] top-2 w-2 h-2 rounded-full hidden md:block" style={{ background: 'linear-gradient(135deg, #FF4D8D, #7C5CFC)' }} />

                  <ScrollReveal delay={i * 60}>
                    <div className="rounded-2xl border border-[#E5E7EB] bg-white p-6 md:p-8 hover:border-[#FF4D8D]/20 hover:shadow-md transition-all duration-200">
                      <div className="flex items-center gap-3 mb-3">
                        <span className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-widest">
                          {formatDate(entry.date)}
                        </span>
                        <span className="text-xs font-mono text-[#6B7280] px-2 py-0.5 rounded bg-[#F3F4F6]">
                          {entry.version}
                        </span>
                      </div>
                      <h2 className="text-xl md:text-2xl font-extrabold text-[#1A1B3A] tracking-tight mb-2">
                        {entry.title}
                      </h2>
                      <p className="text-sm md:text-base text-[#6B7280] leading-relaxed mb-5">
                        {entry.summary}
                      </p>
                      <ul className="space-y-2.5">
                        {entry.highlights.map((h, j) => {
                          const style = TAG_STYLES[h.tag];
                          return (
                            <li key={j} className="flex items-start gap-3 text-sm text-[#1A1B3A] leading-relaxed">
                              <span
                                className="flex-shrink-0 mt-0.5 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider"
                                style={{ color: style.color, backgroundColor: style.bg }}
                              >
                                {style.label}
                              </span>
                              <span className="text-[#4B5563]">{h.text}</span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </ScrollReveal>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Subscribe CTA */}
        <section className="px-4 sm:px-6 mt-16 md:mt-24">
          <ScrollReveal>
            <div className="max-w-2xl mx-auto rounded-3xl bg-[#0D0E1F] p-10 md:p-14 relative overflow-hidden">
              <div
                className="absolute -top-20 -right-20 w-[400px] h-[400px] pointer-events-none"
                style={{ background: 'radial-gradient(circle, rgba(255,77,141,0.18) 0%, transparent 60%)' }}
              />
              <div
                className="absolute -bottom-20 -left-20 w-[300px] h-[300px] pointer-events-none"
                style={{ background: 'radial-gradient(circle, rgba(124,92,252,0.18) 0%, transparent 60%)' }}
              />
              <div className="relative">
                <p className="text-xs font-semibold text-[#FF4D8D] uppercase tracking-widest mb-3">
                  Get changelog updates
                </p>
                <h2 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight leading-tight mb-3">
                  Get every release in your inbox
                </h2>
                <p className="text-sm text-[#9CA3AF] leading-relaxed mb-6 max-w-md">
                  We ship weekly. Subscribe and you&apos;ll see what&apos;s new the same day it goes live — no spam, no marketing fluff.
                </p>
                <NewsletterForm />
              </div>
            </div>
          </ScrollReveal>
        </section>
      </main>
    </div>
  );
}
