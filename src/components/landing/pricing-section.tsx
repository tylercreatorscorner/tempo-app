'use client';

import { useState } from 'react';
import { Check, ArrowRight } from 'lucide-react';
import { ScrollReveal } from './scroll-reveal';

const GMV_TIERS = [
  { label: 'Up to $250K', range: 'Up to $250K/mo', price: 499 },
  { label: '$250K–$750K', range: '$250K – $750K/mo', price: 999 },
  { label: '$750K–$1.5M', range: '$750K – $1.5M/mo', price: 1499 },
  { label: '$1.5M–$3M', range: '$1.5M – $3M/mo', price: 1999 },
  { label: '$3M+', range: '$3M+/mo', price: 2999 },
];

const AGENCY_TIERS = [
  {
    name: 'Agency',
    price: 1999,
    desc: 'For agencies getting started',
    features: [
      'Up to 3 brands included',
      '$499/mo per additional brand',
      'Multi-brand dashboard',
      'Up to 10 team seats',
      'Dedicated onboarding',
    ],
    cta: 'Get Started',
    href: '/onboarding',
    popular: false,
  },
  {
    name: 'Agency Pro',
    price: 4999,
    desc: 'For growing agencies',
    features: [
      'Up to 15 brands included (flat rate)',
      'Everything in Agency',
      'Unlimited team seats',
      'API access',
      'Priority support',
    ],
    cta: 'Get Started',
    href: '/onboarding',
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

function annualMonthly(price: number) {
  return Math.round(price * 0.8);
}

function annualTotal(price: number) {
  return annualMonthly(price) * 12;
}

export function PricingSection() {
  const [view, setView] = useState<'brand' | 'agency'>('brand');
  const [billing, setBilling] = useState<'monthly' | 'annual'>('monthly');
  const [sliderValue, setSliderValue] = useState(0);

  const isAnnual = billing === 'annual';
  const currentTier = GMV_TIERS[sliderValue];
  const brandPrice = isAnnual ? annualMonthly(currentTier.price) : currentTier.price;

  return (
    <section id="pricing" className="py-32 md:py-40 px-6 bg-[#F8F9FC] scroll-mt-20">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <ScrollReveal className="text-center mb-6">
          <p className="text-sm font-semibold text-[#FF4D8D] uppercase tracking-wider mb-3">Pricing</p>
          <h2 className="text-3xl md:text-5xl font-extrabold text-[#1A1B3A] tracking-tight">Simple, transparent pricing</h2>
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

        {/* Monthly / Annual Toggle */}
        <ScrollReveal className="flex justify-center items-center gap-3 mb-12">
          <div className="inline-flex rounded-full bg-[#F8F9FC] border border-[#E5E7EB] p-1">
            {(['monthly', 'annual'] as const).map((b) => (
              <button
                key={b}
                onClick={() => setBilling(b)}
                className={`px-5 py-1.5 rounded-full text-sm font-medium transition-all duration-200 ${
                  billing === b
                    ? 'bg-white text-[#1A1B3A] shadow-sm'
                    : 'text-[#6B7280] hover:text-[#1A1B3A]'
                }`}
              >
                {b === 'monthly' ? 'Monthly' : 'Annual'}
              </button>
            ))}
          </div>
          {billing === 'annual' && (
            <span className="inline-flex items-center rounded-full bg-[#FF4D8D]/10 px-3 py-1 text-xs font-semibold text-[#FF4D8D]">
              Save 20%
            </span>
          )}
        </ScrollReveal>

        {/* ─── Brand View: GMV Calculator ─── */}
        {view === 'brand' && (
          <ScrollReveal>
            <div className="max-w-2xl mx-auto">
              <div className="rounded-2xl border border-[#E5E7EB]/80 bg-white/60 backdrop-blur-xl p-8 md:p-12">
                <h3 className="text-xl md:text-2xl font-bold text-[#1A1B3A] text-center mb-8">
                  What&apos;s your monthly TikTok Shop GMV?
                </h3>

                {/* Slider */}
                <div className="mb-8">
                  <input
                    type="range"
                    min={0}
                    max={4}
                    step={1}
                    value={sliderValue}
                    onChange={(e) => setSliderValue(Number(e.target.value))}
                    className="gmv-slider w-full"
                  />
                  <div className="flex justify-between mt-2">
                    {GMV_TIERS.map((t, i) => (
                      <span
                        key={i}
                        className={`text-xs cursor-pointer transition-colors ${
                          i === sliderValue ? 'text-[#FF4D8D] font-semibold' : 'text-[#9CA3AF]'
                        }`}
                        onClick={() => setSliderValue(i)}
                      >
                        {t.label}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Selected Range */}
                <p className="text-center text-sm text-[#6B7280] mb-2">{currentTier.range} GMV</p>

                {/* Price */}
                <div className="text-center mb-2">
                  <span className="text-5xl md:text-6xl font-extrabold bg-gradient-to-r from-[#FF4D8D] to-[#7C5CFC] bg-clip-text text-transparent">
                    ${formatPrice(brandPrice)}
                  </span>
                </div>
                <p className="text-center text-sm text-[#6B7280] mb-4">
                  per month, billed {isAnnual ? 'annually' : 'monthly'}
                </p>

                {/* Annual info */}
                {isAnnual ? (
                  <p className="text-center text-sm text-[#9CA3AF] mb-8">
                    <span className="line-through">${formatPrice(currentTier.price)}/mo</span>
                    {' → '}
                    <span className="text-[#FF4D8D] font-semibold">${formatPrice(brandPrice)}/mo</span>
                    {' '}
                    <span className="text-[#6B7280]">(billed as ${formatPrice(annualTotal(currentTier.price))}/year)</span>
                  </p>
                ) : (
                  <p className="text-center text-sm text-[#9CA3AF] mb-8">
                    Pay annually, save 20% →{' '}
                    <button onClick={() => setBilling('annual')} className="text-[#FF4D8D] font-semibold hover:underline">
                      ${formatPrice(annualMonthly(currentTier.price))}/mo
                    </button>
                  </p>
                )}

                {/* CTA */}
                <div className="text-center">
                  <a
                    href="/onboarding"
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
              const displayPrice = t.price > 0 ? (isAnnual ? annualMonthly(t.price) : t.price) : 0;
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
                            {isAnnual && (
                              <div className="text-xs text-[#9CA3AF] mt-1">
                                <span className="line-through">${formatPrice(t.price)}/mo</span>
                                {' · '}billed as ${formatPrice(annualTotal(t.price))}/yr
                              </div>
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
                        href={t.href}
                        {...(t.href.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
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

        {/* ─── Every Plan Includes ─── */}
        <ScrollReveal className="mt-20">
          <div className="max-w-4xl mx-auto">
            <h3 className="text-2xl md:text-3xl font-extrabold text-[#1A1B3A] text-center mb-10">
              Every plan includes
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {INCLUDED_FEATURES.map((f) => (
                <div key={f} className="flex items-center gap-3 rounded-xl bg-white/60 backdrop-blur-xl border border-[#E5E7EB]/60 px-5 py-3.5">
                  <Check className="w-5 h-5 text-[#FF4D8D] flex-shrink-0" />
                  <span className="text-sm font-medium text-[#4B5563]">{f}</span>
                </div>
              ))}
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
