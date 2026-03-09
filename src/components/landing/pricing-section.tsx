'use client';

import { useState } from 'react';
import { Check, ArrowRight } from 'lucide-react';
import { ScrollReveal } from './scroll-reveal';
import { AGENCY_TO_PLAN } from '@/lib/stripe-prices';

const BRAND_PRICE = 1499;

const AGENCY_TIERS = [
  {
    name: 'Agency',
    price: 3499,
    desc: 'For agencies getting started',
    features: [
      'Up to 3 brands included',
      '$999/mo per additional brand',
      'Multi-brand dashboard',
      'Up to 10 team seats',
      'Dedicated onboarding',
    ],
    cta: 'Get Started',
    href: '/onboarding?plan=agency_base&billing=monthly',
    popular: false,
  },
  {
    name: 'Agency Pro',
    price: 7499,
    desc: 'For growing agencies',
    features: [
      'Up to 15 brands included (flat rate)',
      'Everything in Agency',
      'Unlimited team seats',
      'API access',
      'Priority support',
    ],
    cta: 'Get Started',
    href: '/onboarding?plan=agency_pro&billing=monthly',
    popular: true,
  },
  {
    name: 'Enterprise',
    price: 0,
    desc: 'For large-scale operations',
    features: [
      '15+ brands',
      'Everything in Agency Pro',
      'White-label options',
      'Dedicated support & SLA',
      'Custom integrations',
      'Volume discounts',
    ],
    cta: 'Contact Sales',
    href: 'https://cal.com/tyler3p/tempo-demo',
    popular: false,
  },
];

const INCLUDED_FEATURES = [
  'Full analytics suite',
  'Creator portal',
  'Daily performance briefs',
  'Real-time GMV tracking',
  'Creator rankings & insights',
  'Multi-brand support (agencies)',
  'Team collaboration',
  'Priority support',
  'Secure data isolation',
];

function formatPrice(price: number) {
  return price.toLocaleString('en-US');
}



export function PricingSection() {
  const [view, setView] = useState<'brand' | 'agency'>('brand');

  return (
    <section id="pricing" className="py-16 md:py-40 px-4 sm:px-6 bg-[#F8F9FC] scroll-mt-20">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <ScrollReveal className="text-center mb-6">
          <p className="text-sm font-semibold text-[#FF4D8D] uppercase tracking-wider mb-3">Pricing</p>
          <h2 className="text-2xl md:text-5xl font-extrabold text-[#1A1B3A] tracking-tight">Simple, transparent pricing</h2>
          <p className="text-[#6B7280] mt-4 text-lg">No free tier. No fluff. Just the tools you need to win.</p>
        </ScrollReveal>

        {/* Value Anchor */}
        <ScrollReveal className="text-center mb-10">
          <p className="text-sm text-[#9CA3AF] italic">
            Replace 6 spreadsheets, 3 dashboards, and 2 hours of morning data pulls.
          </p>
        </ScrollReveal>

        {/* Brand / Agency Toggle */}
        <ScrollReveal className="flex justify-center mb-6">
          <div className="inline-flex rounded-full bg-[#F8F9FC] border border-[#E5E7EB] p-1">
            {(['brand', 'agency'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-6 py-2 rounded-full text-sm font-semibold transition-all duration-200 ${
                  view === v
                    ? 'bg-gradient-to-r from-[#FF4D8D] to-[#7C5CFC] text-white shadow-md'
                    : 'text-[#6B7280] hover:text-[#1A1B3A]'
                }`}
              >
                {v === 'brand' ? "I'm a Brand" : "I'm an Agency"}
              </button>
            ))}
          </div>
        </ScrollReveal>

        {/* Spacer after toggle */}
        <div className="mb-12" />

        {/* ─── Brand View: Single Card ─── */}
        {view === 'brand' && (
          <ScrollReveal>
            <div className="max-w-2xl mx-auto">
              <div className="rounded-2xl border border-[#E5E7EB]/80 bg-white/60 backdrop-blur-xl p-8 md:p-12">
                <h3 className="text-xl md:text-2xl font-bold text-[#1A1B3A] text-center mb-2">
                  Brand
                </h3>
                <p className="text-center text-sm text-[#6B7280] mb-8">
                  Everything you need to manage creators and grow GMV.
                </p>

                {/* Price */}
                <div className="text-center mb-2">
                  <span className="text-4xl md:text-6xl font-extrabold bg-gradient-to-r from-[#FF4D8D] to-[#7C5CFC] bg-clip-text text-transparent">
                    ${formatPrice(BRAND_PRICE)}
                  </span>
                </div>
                <p className="text-center text-sm text-[#6B7280] mb-8">
                  per month
                </p>

                {/* Features */}
                <ul className="space-y-3 mb-8 max-w-sm mx-auto">
                  {[
                    'Full analytics suite',
                    'Creator portal & rankings',
                    'Tempo Bot (Discord integration)',
                    'Daily performance briefs',
                    'Bulk messaging & creator alerts',
                    'Real-time GMV tracking',
                    'Team collaboration',
                    'Priority support',
                  ].map((f) => (
                    <li key={f} className="flex items-center gap-2.5 text-sm text-[#4B5563]">
                      <Check className="w-4 h-4 text-[#FF4D8D] flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <div className="text-center">
                  <a
                    href="/onboarding?plan=brand&billing=monthly"
                    className="inline-flex items-center gap-2 rounded-full px-8 py-3.5 text-sm font-semibold text-white bg-gradient-to-r from-[#FF4D8D] to-[#7C5CFC] hover:shadow-xl hover:shadow-[#FF4D8D]/30 hover:scale-105 transition-all duration-200"
                  >
                    Get Started <ArrowRight className="w-4 h-4" />
                  </a>
                </div>
              </div>
            </div>
          </ScrollReveal>
        )}

        {/* ─── Agency View: 3 Cards ─── */}
        {view === 'agency' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {AGENCY_TIERS.map((t, i) => {
              const displayPrice = t.price;
              const agencyPlanKey = AGENCY_TO_PLAN[t.name];
              const dynamicHref = agencyPlanKey
                ? `/onboarding?plan=${agencyPlanKey}&billing=monthly`
                : t.href;
              return (
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
                        {t.price > 0 ? (
                          <>
                            <span className="text-4xl font-extrabold text-[#1A1B3A]">
                              ${formatPrice(displayPrice)}
                            </span>
                            <span className="text-[#6B7280] text-sm">/mo</span>
                          </>
                        ) : (
                          <span className="text-4xl font-extrabold text-[#1A1B3A]">Custom</span>
                        )}
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
                        href={dynamicHref}
                        {...(dynamicHref.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
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
              );
            })}
          </div>
        )}


      </div>
    </section>
  );
}
