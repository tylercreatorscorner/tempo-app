'use client';

import { useState } from 'react';
import { Check, ArrowRight, Sparkles } from 'lucide-react';
import { ScrollReveal } from './scroll-reveal';

const BRAND_TIERS = [
  {
    name: 'Starter',
    price: 499,
    annualPrice: 399,
    desc: 'For brands getting started with creator management',
    features: [
      'Full analytics dashboard',
      'Up to 50 creators',
      'Daily performance updates',
      'Creator rankings & status',
      'Email support',
    ],
    cta: 'Get Started',
    href: '/onboarding?plan=brand_starter',
    popular: false,
  },
  {
    name: 'Growth',
    price: 999,
    annualPrice: 799,
    desc: 'For brands scaling their creator program',
    features: [
      'Everything in Starter',
      'Up to 200 creators',
      'Tempo Bot (Discord integration)',
      'Bulk messaging & alerts',
      'Creator portal',
      'Priority support',
    ],
    cta: 'Get Started',
    href: '/onboarding?plan=brand_growth',
    popular: true,
  },
  {
    name: 'Scale',
    price: 1999,
    annualPrice: 1599,
    desc: 'For brands with large creator networks',
    features: [
      'Everything in Growth',
      'Unlimited creators',
      'Advanced analytics & exports',
      'Team collaboration (5 seats)',
      'API access',
      'Dedicated onboarding',
    ],
    cta: 'Get Started',
    href: '/onboarding?plan=brand_scale',
    popular: false,
  },
];

const AGENCY_TIERS = [
  {
    name: 'Agency',
    price: 2999,
    annualPrice: 2399,
    desc: 'For agencies managing multiple brands',
    features: [
      'Up to 5 brands',
      'Everything in Scale',
      'Cross-brand analytics',
      'Unlimited team seats',
      'White-label options',
      'Dedicated account manager',
    ],
    cta: 'Get Started',
    href: '/onboarding?plan=agency_pro',
    popular: true,
  },
  {
    name: 'Enterprise',
    price: 0,
    annualPrice: 0,
    desc: 'For large-scale operations',
    features: [
      'Unlimited brands',
      'Everything in Agency',
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
  const [annual, setAnnual] = useState(false);
  const tiers = view === 'brand' ? BRAND_TIERS : AGENCY_TIERS;

  return (
    <section id="pricing" className="py-16 md:py-40 px-4 sm:px-6 bg-[#F8F9FC] scroll-mt-20">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <ScrollReveal className="text-center mb-6">
          <p className="text-sm font-semibold text-[#FF4D8D] uppercase tracking-wider mb-3">Pricing</p>
          <h2 className="text-2xl md:text-5xl font-extrabold text-[#1A1B3A] tracking-tight">Simple, transparent pricing</h2>
          <p className="text-[#6B7280] mt-4 text-lg">Pick a plan that fits your brand. Upgrade anytime.</p>
        </ScrollReveal>

        {/* Brand / Agency Toggle */}
        <ScrollReveal className="flex justify-center mb-6">
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

        {/* Monthly / Annual Toggle */}
        <ScrollReveal className="flex justify-center items-center gap-3 mb-12">
          <span className={`text-sm font-medium ${!annual ? 'text-[#1A1B3A]' : 'text-[#9CA3AF]'}`}>Monthly</span>
          <button
            onClick={() => setAnnual(!annual)}
            className={`relative w-12 h-6 rounded-full transition-colors ${annual ? 'bg-gradient-to-r from-[#FF4D8D] to-[#7C5CFC]' : 'bg-[#E5E7EB]'}`}
          >
            <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${annual ? 'translate-x-6' : 'translate-x-0.5'}`} />
          </button>
          <span className={`text-sm font-medium ${annual ? 'text-[#1A1B3A]' : 'text-[#9CA3AF]'}`}>
            Annual
          </span>
          {annual && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-semibold">
              <Sparkles className="w-3 h-3" /> Save 20%
            </span>
          )}
        </ScrollReveal>

        {/* Pricing Cards */}
        <div className={`grid grid-cols-1 gap-6 max-w-5xl mx-auto ${tiers.length === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2 max-w-3xl'}`}>
          {tiers.map((t, i) => {
            const displayPrice = annual ? t.annualPrice : t.price;
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
                      {displayPrice > 0 ? (
                        <>
                          <span className="text-4xl font-extrabold text-[#1A1B3A]">
                            ${formatPrice(displayPrice)}
                          </span>
                          <span className="text-[#6B7280] text-sm">/mo</span>
                          {annual && (
                            <div className="text-xs text-[#9CA3AF] line-through mt-1">${formatPrice(t.price)}/mo</div>
                          )}
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
                      href={`${t.href}${annual && displayPrice > 0 ? '&billing=annual' : ''}`}
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
            );
          })}
        </div>

        {/* Bottom note */}
        <ScrollReveal className="text-center mt-10">
          <p className="text-sm text-[#9CA3AF]">
            All plans include SSL encryption, daily backups, and 99.9% uptime SLA.
          </p>
        </ScrollReveal>
      </div>
    </section>
  );
}
