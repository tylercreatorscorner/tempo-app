'use client';

import { useState } from 'react';
import { Check, ArrowRight } from 'lucide-react';
import { ScrollReveal } from './scroll-reveal';

const AGENCY_TIERS = [
  {
    name: 'Agency',
    price: 4999,
    desc: 'For agencies managing a few brands',
    perBrand: '~$1,667/brand',
    features: [
      'Up to 3 brands',
      'Everything in Brand plan',
      'Cross-brand analytics',
      'Up to 10 team seats',
      'Dedicated onboarding',
    ],
    cta: 'Get Started',
    href: '/onboarding?plan=agency',
    popular: false,
  },
  {
    name: 'Agency Pro',
    price: 9999,
    desc: 'For growing agencies',
    perBrand: '~$1,000/brand',
    features: [
      'Up to 10 brands',
      'Everything in Agency',
      'Unlimited team seats',
      'API access',
      'Priority support',
      'White-label options',
    ],
    cta: 'Get Started',
    href: '/onboarding?plan=agency_pro',
    popular: true,
  },
  {
    name: 'Enterprise',
    price: 0,
    desc: 'For large-scale operations',
    perBrand: 'Volume pricing',
    features: [
      '10+ brands',
      'Everything in Agency Pro',
      'Custom integrations',
      'SLA & dedicated support',
      'Volume discounts',
      'On-premise deployment',
    ],
    cta: 'Contact Sales',
    href: 'https://cal.com/tyler3p/tempo-demo',
    popular: false,
  },
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
          <h2 className="text-2xl md:text-5xl font-extrabold text-[#1A1B3A] tracking-tight">
            One price. Everything included.
          </h2>
          <p className="text-[#6B7280] mt-4 text-lg max-w-xl mx-auto">
            Most brands recoup the monthly fee in week one — usually by spotting a single underperforming creator they were paying retainer to.
          </p>
        </ScrollReveal>

        {/* Brand / Agency Toggle */}
        <ScrollReveal className="flex justify-center mb-12">
          <div className="inline-flex rounded-full bg-white border border-[#E5E7EB] p-1 shadow-sm">
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

        {/* ─── Brand View: Single Card ─── */}
        {view === 'brand' && (
          <ScrollReveal>
            <div className="max-w-2xl mx-auto">
              <div className="relative rounded-2xl p-[2px] bg-gradient-to-b from-[#FF4D8D] to-[#7C5CFC]">
                <div className="rounded-[14px] bg-white p-8 md:p-12">
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-10 px-4 py-1 rounded-full bg-gradient-to-r from-[#FF4D8D] to-[#7C5CFC] text-xs font-semibold text-white whitespace-nowrap">
                    For Brands
                  </div>

                  <h3 className="text-xl md:text-2xl font-bold text-[#1A1B3A] text-center mb-2 pt-4">
                    Tempo for Brands
                  </h3>
                  <p className="text-center text-sm text-[#6B7280] mb-8">
                    Everything to manage your creator program and grow GMV.
                  </p>

                  {/* Price */}
                  <div className="text-center mb-1">
                    <span className="text-4xl md:text-6xl font-extrabold bg-gradient-to-r from-[#FF4D8D] to-[#7C5CFC] bg-clip-text text-transparent">
                      $1,999
                    </span>
                    <span className="text-base text-[#9CA3AF] ml-2 font-medium">/ mo</span>
                  </div>
                  <p className="text-center text-xs text-[#9CA3AF] mb-8">
                    Billed monthly · Cancel anytime · No long-term contract
                  </p>

                  {/* Features grouped by category */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6 mb-8 max-w-xl mx-auto">
                    {[
                      {
                        label: 'Analytics',
                        items: ['Real-time GMV tracking', 'Product performance', 'Video analytics'],
                      },
                      {
                        label: 'Creator management',
                        items: ['Creator rankings & status', 'Bulk messaging & alerts', 'Retainer tracking'],
                      },
                      {
                        label: 'Communication',
                        items: ['Tempo Bot (Discord)', 'Daily performance briefs', 'Creator portal'],
                      },
                      {
                        label: 'Team & support',
                        items: ['Team collaboration', 'Role-based access', 'Priority support'],
                      },
                    ].map((group) => (
                      <div key={group.label}>
                        <p className="text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-widest mb-3">
                          {group.label}
                        </p>
                        <ul className="space-y-2">
                          {group.items.map((item) => (
                            <li key={item} className="flex items-center gap-2.5 text-sm text-[#4B5563]">
                              <Check className="w-3.5 h-3.5 text-[#FF4D8D] flex-shrink-0" strokeWidth={3} />
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>

                  {/* CTA */}
                  <div className="text-center">
                    <a
                      href="/onboarding"
                      className="inline-flex items-center justify-center gap-2 rounded-full px-8 py-3.5 w-full sm:w-auto text-sm font-semibold text-white bg-gradient-to-r from-[#FF4D8D] to-[#7C5CFC] hover:shadow-xl hover:shadow-[#FF4D8D]/30 hover:scale-105 transition-all duration-200"
                    >
                      Get Started <ArrowRight className="w-4 h-4" />
                    </a>
                  </div>

                  {/* Cross-link to agency view */}
                  <p className="text-center text-xs text-[#9CA3AF] mt-6">
                    Managing multiple brands?{' '}
                    <button
                      type="button"
                      onClick={() => setView('agency')}
                      className="font-semibold text-[#7C5CFC] hover:text-[#FF4D8D] transition-colors"
                    >
                      See agency pricing →
                    </button>
                  </p>
                </div>
              </div>
            </div>
          </ScrollReveal>
        )}

        {/* ─── Agency View: 3 Cards ─── */}
        {view === 'agency' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {AGENCY_TIERS.map((t, i) => (
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
                    <div className="mt-5 mb-1">
                      {t.price > 0 ? (
                        <>
                          <span className="text-4xl font-extrabold text-[#1A1B3A]">
                            ${formatPrice(t.price)}
                          </span>
                          <span className="text-[#6B7280] text-sm">/mo</span>
                        </>
                      ) : (
                        <span className="text-4xl font-extrabold text-[#1A1B3A]">Custom</span>
                      )}
                    </div>
                    {t.perBrand && (
                      <p className="text-xs text-[#9CA3AF] mb-6">{t.perBrand}</p>
                    )}
                    <ul className="space-y-3 flex-1">
                      {t.features.map((f) => (
                        <li key={f} className="flex items-center gap-2.5 text-sm text-[#4B5563]">
                          <Check className="w-4 h-4 text-[#FF4D8D] flex-shrink-0" />
                          {f}
                        </li>
                      ))}
                    </ul>
                    <a
                      href={t.href}
                      {...(t.href.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                      className={`mt-8 inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition-all duration-200 ${
                        t.popular
                          ? 'text-white bg-gradient-to-r from-[#FF4D8D] to-[#7C5CFC] hover:shadow-lg hover:shadow-[#FF4D8D]/25 hover:scale-105'
                          : 'text-[#1A1B3A] border border-[#E5E7EB] hover:border-[#FF4D8D]/40 hover:bg-[#FF4D8D]/5'
                      }`}
                    >
                      {t.cta} <ArrowRight className="w-4 h-4" />
                    </a>
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>
        )}

        {/* Bottom note */}
        <ScrollReveal className="text-center mt-10">
          <p className="text-sm text-[#9CA3AF]">
            Every plan includes daily backups, row-level data isolation, and a 99.9% uptime SLA.
          </p>
        </ScrollReveal>
      </div>
    </section>
  );
}
